'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirebaseAuth } from '@/hooks/useFirebase';
import { useAuth } from '@/contexts/AuthContext';

interface AlertMessage {
  type: 'error' | 'warning' | 'info';
  message: string;
}

export default function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: userLoading } = useAuth();
  const { signIn, loading: authLoading } = useFirebaseAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);
  
  // Read redirect URL once at mount and store in state
  const [redirectUrl] = useState(() => {
    if (typeof window === 'undefined') return null;
    
    const redirectParam = new URLSearchParams(window.location.search).get('redirect');
    if (redirectParam) return redirectParam;
    
    const storedRedirect = sessionStorage.getItem('redirectAfterLogin');
    if (storedRedirect) {
      sessionStorage.removeItem('redirectAfterLogin'); // Clear it immediately
      return storedRedirect;
    }
    
    return null;
  });
  
  // Get role-based default dashboard
  const getRoleBasedDashboard = (userRole?: string) => {
    switch (userRole) {
      case 'super_admin':
        return '/dashboard/superadmin';
      case 'committee_admin':
        return '/dashboard/committee';
      case 'team':
        return '/dashboard/team';
      default:
        return '/dashboard';
    }
  };

  // Redirect if user is already logged in
  useEffect(() => {
    if (!userLoading && user) {
      const targetUrl = redirectUrl || getRoleBasedDashboard(user.role);
      console.log('[Login] User already logged in, redirecting to:', targetUrl);
      router.replace(targetUrl);
    }
  }, [user, userLoading, router, redirectUrl]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAlerts([]);

    try {
      console.log('[Login] Starting login process');
      
      // Trim inputs to avoid whitespace issues
      const trimmedUsername = username.trim();
      const trimmedPassword = password.trim();

      if (!trimmedUsername || !trimmedPassword) {
        console.log('[Login] Validation failed: missing credentials');
        setAlerts([{ 
          type: 'error', 
          message: 'Username and password are required.' 
        }]);
        return;
      }

      console.log('[Login] Looking up email for username:', trimmedUsername);
      
      // Username-only login - look up email from username using API
      const lookupResponse = await fetch('/api/auth/username-to-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername }),
      });
      
      console.log('[Login] Username lookup response status:', lookupResponse.status);

      const lookupData = await lookupResponse.json();
      console.log('[Login] Username lookup result:', { success: lookupData.success, hasEmail: !!lookupData.email });

      if (!lookupData.success || !lookupData.email) {
        console.log('[Login] Username lookup failed');
        setAlerts([{ 
          type: 'error', 
          message: 'Username not found. Please check your username.' 
        }]);
        return;
      }

      console.log('[Login] Attempting Firebase sign-in with remember me:', remember);
      
      // Sign in with email and remember me option
      const { user } = await signIn(lookupData.email, trimmedPassword, remember);
      
      console.log('[Login] Sign-in successful, user role:', user?.role);
      
      // Redirect to intended page or role-specific dashboard
      const targetUrl = redirectUrl || getRoleBasedDashboard(user?.role);
      console.log('[Login] Sign-in successful, redirecting to:', targetUrl);
      router.replace(targetUrl);
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Provide user-friendly error messages
      let errorMessage = 'Login failed. Please try again.';
      
      const errorMsg = error.message?.toLowerCase() || '';
      
      if (errorMsg.includes('invalid-credential') || errorMsg.includes('invalid credential')) {
        errorMessage = '❌ Invalid username or password. Please check your credentials.';
      } else if (errorMsg.includes('user-not-found') || errorMsg.includes('user not found')) {
        errorMessage = '❌ User not found. Please check your username.';
      } else if (errorMsg.includes('wrong-password') || errorMsg.includes('wrong password')) {
        errorMessage = '❌ Incorrect password. Please try again.';
      } else if (errorMsg.includes('too-many-requests') || errorMsg.includes('too many requests')) {
        errorMessage = '⏳ Too many failed attempts. Please wait a few minutes and try again.';
      } else if (errorMsg.includes('network')) {
        errorMessage = '🌐 Network error. Please check your internet connection.';
      } else if (errorMsg.includes('pending approval')) {
        errorMessage = '⏳ Your account is pending approval. Please wait for admin approval.';
      } else if (errorMsg.includes('deactivated')) {
        errorMessage = '🚫 Account is deactivated. Please contact support.';
      } else if (error.message) {
        // Show the actual error message if it's user-friendly
        errorMessage = error.message;
      }
      
      setAlerts([{ type: 'error', message: errorMessage }]);
    }
  };

  const togglePasswordVisibility = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setShowPassword(!showPassword);
  };

  const getAlertIcon = (type: string) => {
    if (type === 'error' || type === 'warning') {
      return (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      );
    }
    return (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    );
  };

  const getAlertClasses = (type: string) => {
    switch (type) {
      case 'error':
        return 'bg-rose-50 border-rose-250 text-rose-800';
      case 'warning':
        return 'bg-amber-55 border-amber-250 text-amber-800';
      default:
        return 'bg-slate-50 border-slate-205 text-slate-700';
    }
  };

  const getAlertIconColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-rose-500';
      case 'warning':
        return 'text-amber-600';
      default:
        return 'text-slate-400';
    }
  };

  // Show loading while checking authentication
  if (userLoading) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Authenticating session...</p>
        </div>
      </div>
    );
  }

  // Don't render if user is logged in (will redirect)
  if (user) {
    return null;
  }

  return (
    <div className="console-bg min-h-screen flex items-center justify-center px-4 pt-5 lg:pt-24 pb-12 sm:px-6 lg:px-8 relative">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>
      
      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="console-card bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm transition-all duration-300 animate-fade-in">
          <div className="text-center mb-8">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SECURE GATEWAY</span>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">Welcome Back</h1>
            <p className="text-xs text-slate-500 font-mono mt-1 uppercase">Sign in to your Football Auction account</p>
          </div>
          
          {/* Flash Messages Display */}
          {alerts.length > 0 && (
            <div className="space-y-4 mb-6">
              {alerts.map((alert, index) => (
                <div
                  key={index}
                  className={`px-4 py-3 rounded-xl border border-l-4 font-mono font-bold text-xs uppercase tracking-wide flex items-start ${getAlertClasses(alert.type)}`}
                  role="alert"
                  aria-live="polite"
                >
                  <svg
                    className={`w-5 h-5 mr-3 flex-shrink-0 ${getAlertIconColor(alert.type)}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {getAlertIcon(alert.type)}
                  </svg>
                  <div className="flex-1 leading-normal">
                    {alert.message}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            {/* Anti cache token */}
            <input type="hidden" name="timestamp" value={Date.now()} />
            
            <div className="space-y-4">
              {/* Username Field */}
              <div>
                <label htmlFor="username" className="block text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                  Username
                </label>
                <div className="relative group">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400 group-focus-within:text-amber-600 transition-colors">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    required
                    autoComplete="off"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 w-full py-3 border border-slate-200 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50 focus:bg-white transition-all duration-200 shadow-sm text-sm font-mono text-slate-700 placeholder:text-slate-450"
                    placeholder="Enter your username"
                  />
                </div>
              </div>
              
              {/* Password Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider">
                    Password
                  </label>
                  <Link href="/reset-password-request" className="text-[10px] font-mono font-bold text-amber-600 hover:text-amber-700 uppercase tracking-wide transition-colors">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative group">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400 group-focus-within:text-amber-600 transition-colors">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 w-full py-3 border border-slate-200 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50 focus:bg-white transition-all duration-200 shadow-sm text-sm font-mono text-slate-700 placeholder:text-slate-450"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 transition-all duration-150 cursor-pointer"
                  >
                    {showPassword ? (
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Remember me checkbox */}
              <div className="flex items-center">
                <input
                  id="remember"
                  name="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4.5 w-4.5 text-amber-600 focus:ring-amber-500 border-slate-300 rounded transition-all cursor-pointer accent-amber-600"
                />
                <label htmlFor="remember" className="ml-2 block text-xs font-mono font-bold text-slate-500 uppercase cursor-pointer">
                  Remember me for 30 days
                </label>
              </div>
            </div>
            
            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={authLoading}
                className="group relative w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs uppercase transition-all duration-300 hover:shadow-md hover:shadow-amber-600/10 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span>{authLoading ? 'Signing In...' : 'Sign In'}</span>
                <span className="absolute right-4 opacity-0 group-hover:opacity-100 group-hover:right-3 transition-all duration-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            </div>
            
          </form>
        </div>
        
        {/* Support Link */}
        <div className="text-center mt-6">
          <p className="text-xs font-mono font-bold text-slate-555 uppercase">
            Having trouble logging in?{' '}
            <Link href="/support" className="text-amber-600 hover:text-amber-700 transition-colors">
              Contact Support
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
