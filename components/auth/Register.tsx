'use client';

import { Suspense, useState, FormEvent, ChangeEvent, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirebaseAuth } from '@/hooks/useFirebase';
import { uploadTeamLogo } from '@/lib/firebase/auth';
import { validateAdminInvite, markInviteAsUsed } from '@/lib/firebase/invites';
import { AdminInvite } from '@/types/invite';

// Helper to extract season suffix (e.g. s18) from invite data
const getSeasonSuffix = (invite: AdminInvite | null): string => {
  if (!invite) return 's18';
  
  // 1. Try to extract digits from seasonId (e.g., "SSPSLS18" -> "s18", "SSPSLFLS16" -> "s16")
  const idMatch = invite.seasonId.match(/\d+$/);
  if (idMatch) {
    return `s${idMatch[0]}`;
  }

  // 2. Try to find "Season X" or "S X" in seasonName (e.g. "Season 18" or "S18" or "Season-18")
  const nameMatch = invite.seasonName.match(/season\s*(\d+)/i) || invite.seasonName.match(/s\s*(\d+)/i);
  if (nameMatch) {
    return `s${nameMatch[1]}`;
  }

  // 3. Fallback to any digits in seasonName
  const digitMatch = invite.seasonName.match(/\d+/);
  if (digitMatch) {
    return `s${digitMatch[0]}`;
  }

  return 's18'; // Absolute fallback
};

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signUp, loading: authLoading } = useFirebaseAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamLogo, setTeamLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ strength: 0, color: 'red' });
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  
  // Invite handling
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [invite, setInvite] = useState<AdminInvite | null>(null);
  const [validatingInvite, setValidatingInvite] = useState(false);
  const [isAdminInvite, setIsAdminInvite] = useState(false);

  // Validate invite code on component mount
  useEffect(() => {
    const code = searchParams.get('invite');
    if (code) {
      setInviteCode(code);
      setIsAdminInvite(true); // Set immediately for faster UI update
      validateInviteCode(code);
    }
  }, [searchParams]);
  
  const validateInviteCode = async (code: string) => {
    try {
      setValidatingInvite(true);
      setError('');
      
      const validation = await validateAdminInvite(code);
      
      if (!validation.valid) {
        setError(validation.error || 'Invalid invite code');
        setInviteCode(null);
        setIsAdminInvite(false);
        return;
      }
      
      if (validation.invite) {
        setInvite(validation.invite);
      }
    } catch (err: any) {
      console.error('Error validating invite:', err);
      setError('Failed to validate invite code');
      setInviteCode(null);
      setIsAdminInvite(false);
    } finally {
      setValidatingInvite(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Wait for validation to complete if still in progress
    if (validatingInvite) {
      setError('Please wait while we validate your invite code');
      return;
    }
    
    // Double-check invite is valid for admin registrations
    if (isAdminInvite && !invite) {
      setError('Invalid or expired invite code. Please request a new invitation.');
      return;
    }

    // Determine final username: append season suffix for admin registrations
    let finalUsername = username.trim();
    if (isAdminInvite && invite) {
      const suffix = getSeasonSuffix(invite);
      if (!finalUsername.toLowerCase().endsWith(suffix.toLowerCase())) {
        finalUsername = `${finalUsername}${suffix}`;
      }
    }

    // Create email from username
    const email = finalUsername.includes('@') ? finalUsername : `${finalUsername}@ssleague.com`;

    try {
      // Determine role and additional data based on invite
      const role = isAdminInvite ? 'committee_admin' : 'team';
      const additionalData = isAdminInvite && invite
        ? {
            seasonId: invite.seasonId,
            seasonName: invite.seasonName,
            seasonYear: invite.seasonYear,
            permissions: ['manage_teams', 'manage_auctions', 'manage_players'],
            canManageTeams: true,
            canManageAuctions: true,
          }
        : {
            teamName,
            players: [],
          };
      
      // Sign up the user
      const { user, firebaseUser } = await signUp(
        email,
        password,
        finalUsername,
        role,
        additionalData
      );
      
      // For teams, create team document BEFORE signing out
      if (role === 'team' && firebaseUser) {
        // Create team document
        await fetch('/api/teams/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: firebaseUser.uid,
            email,
            username: finalUsername,
            teamName: teamName || finalUsername,
          }),
        }).catch((teamError) => {
          console.error('Failed to create team document:', teamError);
        });
        
        // Upload team logo if provided
        if (teamLogo) {
          await uploadTeamLogo(firebaseUser.uid, teamLogo).catch((logoError) => {
            console.error('Logo upload failed:', logoError);
          });
        }
        
        // Now log out and redirect to pending approval page
        const { signOut } = await import('@/lib/firebase/auth');
        await signOut();
        
        router.push('/register/pending-approval');
        return;
      } else if (role === 'committee_admin' && firebaseUser) {
        // Set custom claims for committee admin
        try {
          const claimsRes = await fetch('/api/auth/register-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: firebaseUser.uid,
              inviteCode: inviteCode,
            }),
          });
          
          if (!claimsRes.ok) {
            const errorText = await claimsRes.text();
            throw new Error(`Failed to set admin custom claims: ${errorText}`);
          }
          
          // Force-refresh token to fetch the new custom claims
          const idToken = await firebaseUser.getIdToken(true);
          
          // Update the token cookie with the new claim-bearing token
          await fetch('/api/auth/set-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: idToken }),
          });
          
          console.log('✅ Admin claims and token cookie updated successfully');
        } catch (claimsError) {
          console.error('Failed to configure admin claims/token:', claimsError);
        }
      }
      
      // Inform the admin of successful registration and the final username
      setSuccess(`Registration successful! Your admin username is "${finalUsername}". Redirecting to dashboard...`);
      
      // Do background tasks asynchronously (don't block redirect)
      if (firebaseUser) {
        // Create team document for team registrations (non-blocking) - fallback safety
        if (role === 'team') {
          fetch('/api/teams/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: firebaseUser.uid,
              email,
              username: finalUsername,
              teamName: teamName || finalUsername,
            }),
          }).catch((teamError) => {
            console.error('Failed to create team document:', teamError);
          });
        }
        
        // Mark invite as used (non-blocking)
        if (isAdminInvite && inviteCode) {
          markInviteAsUsed(inviteCode, firebaseUser.uid, finalUsername, email).catch((inviteError) => {
            console.error('Failed to mark invite as used:', inviteError);
          });
        }
        
        // Upload team logo (non-blocking)
        if (!isAdminInvite && teamLogo) {
          uploadTeamLogo(firebaseUser.uid, teamLogo).catch((logoError) => {
            console.error('Logo upload failed:', logoError);
          });
        }
      }

      // Delay redirect by 2.5s to let the user see their registered username
      setTimeout(() => {
        switch (role as string) {
          case 'super_admin':
            router.push('/dashboard/superadmin');
            break;
          case 'committee_admin':
            router.push('/dashboard/committee');
            break;
          default:
            router.push('/dashboard');
        }
      }, 2500);

    } catch (error: any) {
      console.error('Registration failed:', error);
      setError(error.message || 'Registration failed. Please try again.');
    }
  };

  const togglePasswordVisibility = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setShowPassword(!showPassword);
  };

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTeamLogo(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const calculatePasswordStrength = (pass: string) => {
    let strength = 0;
    
    if (pass.length >= 8) strength += 25;
    if (/[A-Z]/.test(pass)) strength += 25;
    if (/[0-9]/.test(pass)) strength += 25;
    if (/[^A-Za-z0-9]/.test(pass)) strength += 25;

    let color = 'red';
    if (strength >= 75) color = 'green';
    else if (strength >= 50) color = 'yellow';

    return { strength, color };
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    const pass = e.target.value;
    setPassword(pass);
    if (pass.length > 0) {
      setPasswordStrength(calculatePasswordStrength(pass));
    }
  };

  return (
    <div className="console-bg min-h-screen flex items-center justify-center px-4 pt-5 lg:pt-24 pb-12 sm:px-6 lg:px-8 relative">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>
      
      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="console-card bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm transition-all duration-300 animate-fade-in">
          <div className="text-center mb-8">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">
              {isAdminInvite ? 'ADMIN REGISTRATION' : 'MEMBER PORTAL'}
            </span>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              {isAdminInvite ? 'Join as Committee' : 'Create Account'}
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1 uppercase">
              {isAdminInvite && invite 
                ? `You're invited to manage ${invite.seasonName} (${invite.seasonYear})`
                : isAdminInvite && validatingInvite
                ? 'Validating your admin invitation...'
                : 'Join Football Auction and start building your dream team'
              }
            </p>
          </div>
          
          {/* Invite Info Banner */}
          {isAdminInvite && !error && (
            <div className="mb-6 px-4 py-3 rounded-xl border border-l-4 font-mono font-bold text-xs uppercase tracking-wide bg-amber-50 border-amber-250 text-amber-800 animate-fade-in" role="alert">
              <div className="flex items-start">
                {validatingInvite ? (
                  <svg className="animate-spin w-5 h-5 mr-3 flex-shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 mr-3 flex-shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <div className="flex-1 leading-normal">
                  <p>
                    {validatingInvite ? 'Validating Invite...' : 'Admin Invite Detected'}
                  </p>
                  {invite && (
                    <p className="text-[10px] text-amber-700 font-medium mt-1">
                      You'll be registered as a Committee Admin for <strong>{invite.seasonName} ({invite.seasonYear})</strong>.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Success Alert */}
          {success && (
            <div className="mb-6 px-4 py-3 rounded-xl border border-l-4 font-mono font-bold text-xs uppercase tracking-wide bg-emerald-50 border-emerald-250 text-emerald-800 animate-fade-in" role="alert">
              <div className="flex items-start">
                <svg className="w-5 h-5 mr-3 flex-shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1 leading-normal">{success}</div>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl border border-l-4 font-mono font-bold text-xs uppercase tracking-wide bg-rose-50 border-rose-250 text-rose-800" role="alert">
              <div className="flex items-start">
                <svg className="w-5 h-5 mr-3 flex-shrink-0 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div className="flex-1 leading-normal">{error}</div>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-4">
              {/* Username Field */}
              <div>
                <label htmlFor="username" className="block text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                  Username
                </label>
                <div style={{ position: "relative" }} className="relative group">
                  <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, height: "100%", display: "flex", alignItems: "center", paddingLeft: "0.875rem", pointerEvents: "none" }} className="text-gray-400 group-focus-within:text-amber-600 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={`${isAdminInvite ? 'pr-16' : ''} pl-10 w-full py-3 border border-slate-200 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50 focus:bg-white transition-all duration-200 shadow-sm text-sm font-mono text-slate-700 placeholder:text-slate-450`}
                    placeholder="Choose a unique username"
                  />
                  {isAdminInvite && invite && (
                    <span style={{ position: "absolute", top: 0, bottom: 0, right: 0, height: "100%", display: "flex", alignItems: "center", paddingRight: "1rem", pointerEvents: "none" }} className="text-amber-600 font-mono text-sm font-bold select-none">
                      {getSeasonSuffix(invite)}
                    </span>
                  )}
                </div>
                {isAdminInvite && invite && username.trim() && (
                  <p className="mt-1.5 text-[10px] font-mono text-amber-600 font-bold uppercase tracking-wider">
                    Your username will be saved as:{' '}
                    <span className="text-slate-900 underline font-extrabold bg-amber-50 px-1.5 py-0.5 rounded">
                      {username.trim().toLowerCase()}{getSeasonSuffix(invite)}
                    </span>
                  </p>
                )}
              </div>
              
              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div style={{ position: "relative" }} className="relative group">
                  <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, height: "100%", display: "flex", alignItems: "center", paddingLeft: "0.875rem", pointerEvents: "none" }} className="text-gray-400 group-focus-within:text-amber-600 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <input style={{ paddingRight: '2.5rem' }}
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={handlePasswordChange}
                    className={`pl-10 pr-10 w-full py-3 border rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50 focus:bg-white transition-all duration-200 shadow-sm text-sm font-mono text-slate-700 placeholder:text-slate-450 ${
                      password.length > 0 
                        ? passwordStrength.color === 'green' 
                          ? 'border-green-300' 
                          : passwordStrength.color === 'yellow' 
                          ? 'border-yellow-300' 
                          : 'border-red-300'
                        : 'border-slate-200'
                    }`}
                    placeholder="Create a secure password"
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    style={{ position: "absolute", top: 0, bottom: 0, right: 0, height: "100%", display: "flex", alignItems: "center", paddingRight: "0.875rem", cursor: "pointer" }} className="text-slate-400 hover:text-slate-600 transition-all duration-150"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {/* Strength Visualizer */}
                {password.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 font-mono text-[10px]">
                    <span className="text-slate-400 font-bold">STRENGTH:</span>
                    <div className="h-1.5 flex-1 bg-slate-100 border border-slate-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          passwordStrength.color === 'green' ? 'bg-emerald-500' :
                          passwordStrength.color === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${passwordStrength.strength || 25}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Team Name Field */}
              {!isAdminInvite && (
                <>
                  <div>
                    <label htmlFor="team_name" className="block text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                      Team Name
                    </label>
                    <div style={{ position: "relative" }} className="relative group">
                      <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, height: "100%", display: "flex", alignItems: "center", paddingLeft: "0.875rem", pointerEvents: "none" }} className="text-gray-400 group-focus-within:text-amber-600 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        id="team_name"
                        name="team_name"
                        required
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        className="pl-10 w-full py-3 border border-slate-200 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50 focus:bg-white transition-all duration-200 shadow-sm text-sm font-mono text-slate-700 placeholder:text-slate-450"
                        placeholder="Enter your team name"
                      />
                    </div>
                  </div>
                  
                  {/* Team Logo Upload */}
                  <div>
                    <label htmlFor="team_logo" className="block text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                      Team Logo
                    </label>
                    <div className="flex items-center space-x-4">
                      <div className="relative flex-shrink-0">
                        <div className={`w-16 h-16 rounded-xl bg-slate-50 border ${
                          logoPreview ? 'border-solid border-amber-500' : 'border-dashed border-slate-300'
                        } flex items-center justify-center overflow-hidden transition-all duration-300`}>
                          {logoPreview ? (
                            <div className="relative w-full h-full">
                              <Image 
                                src={logoPreview} 
                                alt="Logo preview" 
                                fill
                                className="object-contain p-1.5"
                              />
                            </div>
                          ) : (
                            <svg className="w-6 h-6 text-slate-350" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <div className="flex-grow">
                        <label htmlFor="team_logo" className="w-full flex flex-col items-center px-4 py-2 bg-slate-50 text-amber-600 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer transition-colors duration-300 relative">
                          <span className="text-xs font-mono font-bold uppercase">Choose Logo File</span>
                          <span className="text-[9px] text-slate-400 font-mono uppercase mt-0.5">PNG, JPG (MAX 2MB)</span>
                          <input 
                            type="file" 
                            id="team_logo" 
                            name="team_logo" 
                            accept="image/*" 
                            className="hidden"
                            onChange={handleLogoChange}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={authLoading || validatingInvite || !!success}
                className="group relative w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs uppercase transition-all duration-300 hover:shadow-md hover:shadow-amber-600/10 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                <span>
                  {authLoading 
                    ? 'Creating Account...' 
                    : isAdminInvite 
                    ? 'Join as Admin' 
                    : 'Create Account'
                  }
                </span>
                <span className="absolute right-4 opacity-0 group-hover:opacity-100 group-hover:right-3 transition-all duration-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            </div>
            
            {/* Terms and Privacy */}
            <div className="pt-2 text-center">
              <p className="text-[10px] font-mono text-slate-400 uppercase leading-relaxed">
                By creating an account, you agree to our{' '}
                <Link href="/terms" className="text-amber-600 hover:text-amber-700 transition-colors">
                  Terms
                </Link>
                {' '}and{' '}
                <Link href="/privacy" className="text-amber-600 hover:text-amber-700 transition-colors">
                  Privacy
                </Link>
              </p>
            </div>
          </form>
        </div>
        
        {/* Login Link */}
        <div className="text-center mt-6">
          <p className="text-xs font-mono font-bold text-slate-555 uppercase">
            Already have an account?{' '}
            <Link href="/login" className="text-amber-600 hover:text-amber-700 transition-colors inline-flex items-center">
              Sign in →
            </Link>
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

export default function Register() {
  return (
    <Suspense fallback={
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading registration...</p>
        </div>
      </div>
    }>
      <RegisterContent />
    </Suspense>
  );
}
