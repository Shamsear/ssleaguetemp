'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

// Types for the season data
interface Season {
  id: string;
  name: string;
  short_name: string;
  status: string;
  is_historical: boolean;
  created_at: any;
  updated_at: any;
  import_metadata?: {
    source_file: string;
    file_size: number;
    file_type: string;
    import_date: any;
  };
}

interface Team {
  id: string;
  season_id: string;
  team_name: string;
  team_code: string;
  owner_name?: string;
  owner_email?: string;
  initial_balance?: number;
  current_balance?: number;
  is_historical: boolean;
}

interface Player {
  id: string;
  player_id?: string;
  name: string;
  category?: string;
  team?: string;
  team_id?: string; // Add team_id for accurate filtering
  season_id?: string;
  display_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  psn_id?: string;
  xbox_id?: string;
  steam_id?: string;
  is_registered?: boolean;
  is_active?: boolean;
  is_available?: boolean;
  notes?: string;
  
  // Statistics stored in nested stats object
  stats?: {
    matches_played: number;
    matches_won: number;
    matches_lost: number;
    matches_drawn: number;
    goals_scored: number;
    goals_per_game: number;
    goals_conceded: number;
    conceded_per_game: number;
    net_goals: number;
    assists: number;
    clean_sheets: number;
    points: number;
    total_points: number;
    win_rate: number;
    average_rating: number;
    current_season_matches: number;
    current_season_wins: number;
  };
}

interface Award {
  id: string;
  season_id: string;
  award_name: string;
  award_category: string;
  winner_team?: string;
  winner_player?: string;
  description?: string;
  is_historical: boolean;
}

interface Match {
  id: string;
  season_id: string;
  match_date: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  match_type?: string;
  is_historical: boolean;
}

// Preview data interfaces
interface PreviewTeamData {
  team_name: string;
  owner_name: string;
  linked_team_id?: string; // Link to existing database team
  // Team standings data
  rank?: number;
  p?: number;
  mp?: number;
  w?: number;
  d?: number;
  l?: number;
  f?: number;
  a?: number;
  gd?: number;
  percentage?: number;
  cup?: string;
}

interface PreviewPlayerData {
  name: string;
  team: string;
  category: string;
  goals_scored: number | null;
  goals_per_game: number | null;
  goals_conceded: number | null;
  conceded_per_game: number | null;
  net_goals: number | null;
  cleansheets: number | null;
  points: number | null;
  win: number;
  draw: number;
  loss: number;
  total_matches: number;
  total_points: number | null;
  // Optional fields
  assists?: number;
  average_rating?: number;
  // Trophy arrays (unlimited trophies)
  category_trophies?: string[];
  individual_trophies?: string[];
}

interface PreviewData {
  teams: PreviewTeamData[];
  players: PreviewPlayerData[];
  errors: string[];
  warnings: string[];
  summary: {
    teamsCount: number;
    playersCount: number;
    errorsCount: number;
    warningsCount: number;
  };
}

export default function HistoricalSeasonDetailPage() {
  const { user, firebaseUser, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const seasonId = params?.id as string;

  const [season, setSeason] = useState<Season | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [trophies, setTrophies] = useState<any[]>([]);
  const [playerAwards, setPlayerAwards] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'players' | 'stats' | 'standings' | 'import'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<any>(null);
  const [dragOver, setDragOver] = useState(false);
  
  // Preview states
  const [previewMode, setPreviewMode] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewTeams, setPreviewTeams] = useState<PreviewTeamData[]>([]);
  const [previewPlayers, setPreviewPlayers] = useState<PreviewPlayerData[]>([]);
  const [previewAwards, setPreviewAwards] = useState<Award[]>([]);
  const [previewMatches, setPreviewMatches] = useState<Match[]>([]);
  const [previewTab, setPreviewTab] = useState<'teams' | 'players' | 'awards' | 'matches'>('teams');
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showBulkReplace, setShowBulkReplace] = useState(false);
  const [bulkFindText, setBulkFindText] = useState('');
  const [bulkReplaceText, setBulkReplaceText] = useState('');
  const [existingEntities, setExistingEntities] = useState<{teams: {teamId: string; name: string; owner_name: string}[]} | null>(null);
  
  // Category filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Manual Trophies & Awards Form states
  const [showTrophyForm, setShowTrophyForm] = useState(false);
  const [trophyTeamName, setTrophyTeamName] = useState('');
  const [trophyType, setTrophyType] = useState<'league' | 'runner_up' | 'cup'>('cup');
  const [trophyName, setTrophyName] = useState('');
  const [trophyPosition, setTrophyPosition] = useState('');
  const [trophyNotes, setTrophyNotes] = useState('');
  const [isSubmittingTrophy, setIsSubmittingTrophy] = useState(false);

  const [showPlayerAwardForm, setShowPlayerAwardForm] = useState(false);
  const [awardPlayerId, setAwardPlayerId] = useState('');
  const [awardPlayerName, setAwardPlayerName] = useState('');
  const [awardCategory, setAwardCategory] = useState<'individual' | 'category'>('individual');
  const [awardType, setAwardType] = useState('');
  const [awardPosition, setAwardPosition] = useState('Winner');
  const [awardPlayerCategory, setAwardPlayerCategory] = useState('');
  const [awardNotes, setAwardNotes] = useState('');
  const [isSubmittingAward, setIsSubmittingAward] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    console.log('🔄 UPDATED VERSION: HistoricalSeasonDetailPage useEffect called', { seasonId, loading, user: user ? `${user.role} (${user.uid})` : 'null' });
    
    // Don't fetch data until user is loaded and authenticated
    if (!seasonId || loading || !user) return;
    
    // Only allow super admins
    if (user.role !== 'super_admin') {
      console.warn('Access denied: Super admin role required');
      router.push('/dashboard');
      return;
    }

    const fetchSeasonData = async (retryCount = 0) => {
      const maxRetries = 3;
      
      try {
        setIsLoading(true);
        console.log(`\n🔍 Using API route to fetch season data for ID: ${seasonId} (attempt ${retryCount + 1})`);
        console.log(`👤 Current user: ${user?.role} (${user?.uid})`);

        // Use server-side API route to bypass client-side permission issues
        console.log('📞 Making API call to /api/seasons/historical/${seasonId}...');
        const url = `/api/seasons/historical/${seasonId}?loadAll=true`;
        const response = await fetchWithTokenRefresh(url);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const { success, data, pagination, error } = await response.json();
        
        if (!success) {
          throw new Error(error || 'Failed to fetch season data');
        }
        
        // Set all data from the API response
        setSeason(data.season as Season);
        
        // Deduplicate teams by ID (in case API returns duplicates)
        const uniqueTeamsMap = new Map();
        (data.teams as Team[]).forEach(team => {
          if (!uniqueTeamsMap.has(team.id)) {
            uniqueTeamsMap.set(team.id, team);
          }
        });
        const uniqueTeams = Array.from(uniqueTeamsMap.values());
        console.log(`  - Teams: ${data.teams.length} raw, ${uniqueTeams.length} after dedup`);
        setTeams(uniqueTeams);
        
        setPlayers(data.players as Player[]);
        setAwards(data.awards as Award[]);
        setMatches(data.matches as Match[]);
        
        // Fetch trophies from team_trophies table
        try {
          const trophiesResponse = await fetchWithTokenRefresh(`/api/trophies?season_id=${seasonId}`);
          if (trophiesResponse.ok) {
            const trophiesData = await trophiesResponse.json();
            if (trophiesData.success) {
              setTrophies(trophiesData.trophies || []);
              console.log(`  - Trophies: ${trophiesData.trophies.length}`);
            }
          }
        } catch (trophyError) {
          console.error('Error fetching trophies:', trophyError);
        }
        
        // Fetch player awards from player_awards table
        try {
          const awardsResponse = await fetchWithTokenRefresh(`/api/player-awards?season_id=${seasonId}`);
          if (awardsResponse.ok) {
            const awardsData = await awardsResponse.json();
            if (awardsData.success) {
              setPlayerAwards(awardsData.awards || []);
              console.log(`  - Player Awards: ${awardsData.awards.length}`);
            }
          }
        } catch (awardError) {
          console.error('Error fetching player awards:', awardError);
        }
        
        console.log('✅ All data loaded successfully via API!');
        console.log(`  - Season: ${data.season.name}`);
        console.log(`  - Teams: ${data.teams.length}`);
        console.log(`  - Players: ${data.players.length} (ALL LOADED)`);
        console.log(`  - Awards: ${data.awards.length}`);
        console.log(`  - Matches: ${data.matches.length}`);
        setIsLoading(false);

      } catch (error: any) {
        console.error(`❌ Error fetching season data (attempt ${retryCount + 1}):`, error);
        
        // Handle permission errors with retry logic
        if (error.code === 'permission-denied' && retryCount < maxRetries) {
          console.warn(`🔁 Permission denied, retrying in ${Math.pow(2, retryCount) * 1000}ms...`);
          
          // Wait before retrying with exponential backoff
          setTimeout(() => {
            fetchSeasonData(retryCount + 1);
          }, Math.pow(2, retryCount) * 1000);
          return; // Don't set loading to false - we're retrying
        }
        
        // If not a permission error or retries exhausted, show error and redirect
        console.error('❌ All retries exhausted or non-permission error:', error.message);
        alert(`Failed to load season data: ${error.message}. Redirecting back to historical seasons.`);
        router.push('/dashboard/superadmin/historical-seasons');
        setIsLoading(false);
      }
    };

    // Add a small delay to ensure Firebase Auth state has propagated to Firestore
    console.log('✅ User authenticated as super admin, waiting 200ms for auth propagation...');
    setTimeout(() => {
      fetchSeasonData();
    }, 200);
  }, [seasonId, loading, router, user]); // Removed pagination dependencies

  // Calculate statistics (no financial data for historical seasons)
  // Category/Position distribution
  const categoryDistribution = players.reduce((acc, player) => {
    const category = player.category || 'Unknown';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Get unique categories for filter
  const uniqueCategories = Object.keys(categoryDistribution).sort();
  
  // Filter players by selected category
  const filteredPlayers = selectedCategory === 'all' 
    ? players 
    : players.filter(p => (p.category || 'Unknown') === selectedCategory);

  // Active players (those with teams)
  const activePlayers = players.filter(p => p.team && p.is_active !== false);
  
  // Calculate total goals across all players for this season
  const totalGoalsScored = players.reduce((total, player) => {
    return total + (player.stats?.goals_scored || 0);
  }, 0);

  // Team statistics - use season_stats from teamstats collection
  const teamStats = teams.map(team => {
    // Filter players by team_id instead of team name for accuracy
    const teamPlayers = players.filter(p => p.team_id === team.id);
    
    // Use season_stats from the new teamstats collection structure
    const seasonStats = (team as any).season_stats;
    
    if (seasonStats) {
      // Use actual team standings data from Excel import
      return {
        ...team,
        id: team.id,
        team_name: seasonStats.team_name || team.team_name,
        team_code: team.team_code,
        owner_name: seasonStats.owner_name || team.owner_name,
        playerCount: seasonStats.players_count || teamPlayers.length,
        rank: seasonStats.rank || 0,
        wins: seasonStats.wins || 0,
        losses: seasonStats.losses || 0,
        draws: seasonStats.draws || 0,
        matchesPlayed: seasonStats.matches_played || 0,
        points: seasonStats.points || 0,
        totalGoals: seasonStats.goals_for || 0,
        goalsAgainst: seasonStats.goals_against || 0,
        goalDifference: seasonStats.goal_difference || 0,
        winPercentage: seasonStats.win_percentage || 0,
        cupAchievement: seasonStats.cup_achievement || ''
      };
    } else {
      // Fallback: Calculate from matches if season_stats not available (old data)
      const teamWins = matches.filter(m => 
        (m.home_team === team.team_name && m.home_score > m.away_score) ||
        (m.away_team === team.team_name && m.away_score > m.home_score)
      ).length;
      const teamLosses = matches.filter(m => 
        (m.home_team === team.team_name && m.home_score < m.away_score) ||
        (m.away_team === team.team_name && m.away_score < m.home_score)
      ).length;
      const teamDraws = matches.filter(m => 
        (m.home_team === team.team_name || m.away_team === team.team_name) && m.home_score === m.away_score
      ).length;
      
      const teamGoals = teamPlayers.reduce((total, player) => {
        return total + (player.stats?.goals_scored || 0);
      }, 0);
      
      return {
        ...team,
        playerCount: teamPlayers.length,
        wins: teamWins,
        losses: teamLosses,
        draws: teamDraws,
        matchesPlayed: teamWins + teamLosses + teamDraws,
        points: (teamWins * 3) + teamDraws,
        totalGoals: teamGoals,
        goalsAgainst: 0,
        goalDifference: 0,
        winPercentage: 0,
        cupAchievement: ''
      };
    }
  });

  // Manual Trophy Submission
  const handleAddTrophy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trophyTeamName || !trophyName) {
      setActionError('Team name and trophy name are required');
      return;
    }

    try {
      setIsSubmittingTrophy(true);
      setActionError(null);

      const res = await fetchWithTokenRefresh('/api/trophies/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season_id: seasonId,
          team_name: trophyTeamName,
          trophy_type: trophyType,
          trophy_name: trophyName,
          trophy_position: trophyPosition || null,
          notes: trophyNotes || null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to add trophy');
      }

      // Re-fetch trophies
      const trophiesResponse = await fetchWithTokenRefresh(`/api/trophies?season_id=${seasonId}`);
      if (trophiesResponse.ok) {
        const trophiesData = await trophiesResponse.json();
        if (trophiesData.success) {
          setTrophies(trophiesData.trophies || []);
        }
      }

      // Reset form
      setTrophyTeamName('');
      setTrophyName('');
      setTrophyPosition('');
      setTrophyNotes('');
      setShowTrophyForm(false);
    } catch (err: any) {
      console.error('Error adding trophy:', err);
      setActionError(err.message || 'Failed to add trophy');
    } finally {
      setIsSubmittingTrophy(false);
    }
  };

  // Manual Trophy Deletion
  const handleDeleteTrophy = async (trophyId: number) => {
    if (!window.confirm('Are you sure you want to delete this trophy?')) {
      return;
    }

    try {
      setActionError(null);
      const res = await fetchWithTokenRefresh(`/api/trophies/${trophyId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete trophy');
      }

      // Remove from local state
      setTrophies(prev => prev.filter(t => t.id !== trophyId));
    } catch (err: any) {
      console.error('Error deleting trophy:', err);
      setActionError(err.message || 'Failed to delete trophy');
    }
  };

  // Manual Player Award Submission
  const handleAddPlayerAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!awardPlayerId || !awardPlayerName || !awardType) {
      setActionError('Player and award type are required');
      return;
    }
    if (awardCategory === 'category' && !awardPlayerCategory) {
      setActionError('Player category (e.g. Attacker, Defender) is required for category awards');
      return;
    }

    try {
      setIsSubmittingAward(true);
      setActionError(null);

      const res = await fetchWithTokenRefresh('/api/player-awards/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: awardPlayerId,
          player_name: awardPlayerName,
          season_id: seasonId,
          award_category: awardCategory,
          award_type: awardType,
          award_position: awardPosition || null,
          player_category: awardPlayerCategory || null,
          notes: awardNotes || null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to add player award');
      }

      // Re-fetch player awards
      const awardsResponse = await fetchWithTokenRefresh(`/api/player-awards?season_id=${seasonId}`);
      if (awardsResponse.ok) {
        const awardsData = await awardsResponse.json();
        if (awardsData.success) {
          setPlayerAwards(awardsData.awards || []);
        }
      }

      // Reset form
      setAwardPlayerId('');
      setAwardPlayerName('');
      setAwardType('');
      setAwardPlayerCategory('');
      setAwardNotes('');
      setShowPlayerAwardForm(false);
    } catch (err: any) {
      console.error('Error adding player award:', err);
      setActionError(err.message || 'Failed to add player award');
    } finally {
      setIsSubmittingAward(false);
    }
  };

  // Manual Player Award Deletion
  const handleDeletePlayerAward = async (awardId: string) => {
    if (!window.confirm('Are you sure you want to delete this player award?')) {
      return;
    }

    try {
      setActionError(null);
      const res = await fetchWithTokenRefresh(`/api/player-awards/${awardId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete player award');
      }

      // Remove from local state
      setPlayerAwards(prev => prev.filter(a => a.id !== awardId));
    } catch (err: any) {
      console.error('Error deleting player award:', err);
      setActionError(err.message || 'Failed to delete player award');
    }
  };

  // Excel export function
  const handleExportToExcel = async () => {
    if (!firebaseUser) {
      console.error('❌ No firebase user found');
      return;
    }
    
    try {
      setIsExporting(true);
      console.log('🔄 Starting Excel export for season:', seasonId);
      console.log('👤 Firebase user UID:', firebaseUser.uid);
      
      const token = await getIdToken(firebaseUser);
      console.log('✅ Got auth token');
      
      const exportUrl = `/api/seasons/historical/${seasonId}/export`;
      console.log('📡 Fetching export from:', exportUrl);
      
      const response = await fetchWithTokenRefresh(exportUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('📥 Response status:', response.status, response.statusText);
      console.log('📥 Response content-type:', response.headers.get('content-type'));
      
      if (!response.ok) {
        let errorMessage = 'Export failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If response is not JSON, use status text
          errorMessage = `${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }
      
      // Create download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from response headers or create default
      const disposition = response.headers.get('content-disposition');
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `historical_season_${seasonId}_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log('✅ Excel export completed successfully');
    } catch (error: any) {
      console.error('❌ Error exporting Excel:', error);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Error details:', {
        message: error.message,
        name: error.name,
        cause: error.cause
      });
      alert(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Excel import function - now parses and shows preview first
  const handleImportFromExcel = async (file: File) => {
    if (!firebaseUser) return;
    
    try {
      setIsImporting(true);
      setImportResults(null);
      console.log('🔄 Starting Excel parse for preview...');
      
      const formData = new FormData();
      formData.append('file', file);
      
      const token = await getIdToken(firebaseUser);
      // Use a parse-only endpoint to get preview data
      const response = await fetchWithTokenRefresh(`/api/seasons/historical/${seasonId}/parse`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'File parsing failed');
      }
      
      // Set preview data
      setPreviewData(result.data);
      
      // Set initial preview tab based on available data
      if (result.data.teams.length > 0) setPreviewTab('teams');
      else if (result.data.players.length > 0) setPreviewTab('players');
      
      // Enter preview mode
      setPreviewMode(true);
      
      // Save preview data to Firestore (persists player linkings)
      try {
        await updateDoc(doc(db, 'seasons', seasonId), {
          preview_data: result.data,
          preview_saved_at: serverTimestamp()
        });
        console.log('✅ Preview data saved to Firestore');
      } catch (saveError) {
        console.warn('⚠️ Could not save preview data:', saveError);
      }
      
      // Load existing teams for linking and auto-link
      await loadExistingTeams(result.data.teams || [], result.data.players || []);
      
      // Auto-run validation
      setTimeout(() => {
        const hasNoErrors = validatePreviewData();
        if (!hasNoErrors) {
          setShowValidationDetails(true);
        }
      }, 100);
      
      console.log('✅ Excel parsed successfully for preview');
      
    } catch (error: any) {
      console.error('❌ Error parsing Excel:', error);
      alert(`Parse failed: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // File drop handlers
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        handleImportFromExcel(file);
      } else {
        alert('Please select an Excel file (.xlsx or .xls)');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };
  
  // Load existing teams from database for linking
  const loadExistingTeams = async (teamsData: PreviewTeamData[], playersData: PreviewPlayerData[]) => {
    try {
      // Use the existing teams state (already loaded from database)
      const existingTeamsData = teams.map(team => ({
        teamId: team.id,
        name: team.team_name,
        owner_name: team.owner_name || ''
      }));
      
      setExistingEntities({ teams: existingTeamsData });
      
      // Auto-link teams based on name matching
      const autoLinkedTeams = teamsData.map(previewTeam => {
        // Find exact name match
        const exactMatch = existingTeamsData.find(
          et => et.name.trim().toLowerCase() === previewTeam.team_name.trim().toLowerCase()
        );
        
        if (exactMatch) {
          console.log(`🔗 Auto-linked "${previewTeam.team_name}" to existing team "${exactMatch.name}"`);
          return { ...previewTeam, linked_team_id: exactMatch.teamId };
        }
        
        // Find owner match
        const ownerMatch = existingTeamsData.find(
          et => et.owner_name && previewTeam.owner_name && 
               et.owner_name.trim().toLowerCase() === previewTeam.owner_name.trim().toLowerCase()
        );
        
        if (ownerMatch) {
          console.log(`🔗 Auto-linked "${previewTeam.team_name}" to "${ownerMatch.name}" (same owner)`);
          return { ...previewTeam, linked_team_id: ownerMatch.teamId };
        }
        
        return previewTeam;
      });
      
      // Set both teams and players after auto-linking
      setPreviewTeams(autoLinkedTeams);
      setPreviewPlayers(playersData);
    } catch (error) {
      console.error('Error loading existing teams:', error);
    }
  };

  // Preview validation function
  const validatePreviewData = () => {
    const errors = new Set<string>();
    
    // Get team names for cross-referential validation
    // Use linked team names (if teams are linked) or existing database team names
    const validTeamNames = new Set<string>();
    const cleanTeamName = (name: string): string => {
      return name.replace(/\s+/g, ' ').trim().toLowerCase();
    };
    
    // Add linked team names
    previewTeams.forEach(previewTeam => {
      if (previewTeam.linked_team_id && existingEntities?.teams) {
        const linkedTeam = existingEntities.teams.find(t => t.teamId === previewTeam.linked_team_id);
        if (linkedTeam?.name) {
          validTeamNames.add(cleanTeamName(linkedTeam.name));
        }
      }
    });
    
    // Add all existing database team names AND their previous names
    teams.forEach(team => {
      // Add current name
      validTeamNames.add(cleanTeamName(team.team_name));
      
      // Add previous names from name_history or previous_names array
      const previousNames = (team as any).previous_names || (team as any).name_history || [];
      previousNames.forEach((oldName: string) => {
        if (oldName && oldName.trim()) {
          validTeamNames.add(cleanTeamName(oldName));
        }
      });
    });
    
    console.log('✅ Valid team names for validation:', Array.from(validTeamNames));
    
    // Validate teams
    previewTeams.forEach((team, index) => {
      if (!team.team_name.trim()) errors.add(`team-${index}-team_name`);
      if (!team.owner_name.trim()) errors.add(`team-${index}-owner_name`);
      
      // Check for duplicate team names
      const duplicateTeamIndex = previewTeams.findIndex((t, i) => 
        i !== index && t.team_name.trim().toLowerCase() === team.team_name.trim().toLowerCase()
      );
      if (duplicateTeamIndex !== -1) {
        errors.add(`team-${index}-team_name`);
      }
    });
    
    // Validate players
    previewPlayers.forEach((player, index) => {
      if (!player.name.trim()) errors.add(`player-${index}-name`);
      if (!player.team.trim()) errors.add(`player-${index}-team`);
      if (!player.category.trim()) errors.add(`player-${index}-category`);
      
      // Validate numeric fields (null is allowed for nullable fields, but not undefined or NaN)
      // Nullable fields: goals_scored, goals_per_game, goals_conceded, conceded_per_game, net_goals, cleansheets, points, total_points
      if (player.goals_scored !== null && (player.goals_scored === undefined || isNaN(player.goals_scored))) errors.add(`player-${index}-goals_scored`);
      if (player.goals_per_game !== null && (player.goals_per_game === undefined || isNaN(player.goals_per_game))) errors.add(`player-${index}-goals_per_game`);
      if (player.goals_conceded !== null && (player.goals_conceded === undefined || isNaN(player.goals_conceded))) errors.add(`player-${index}-goals_conceded`);
      if (player.conceded_per_game !== null && (player.conceded_per_game === undefined || isNaN(player.conceded_per_game))) errors.add(`player-${index}-conceded_per_game`);
      if (player.net_goals !== null && (player.net_goals === undefined || isNaN(player.net_goals))) errors.add(`player-${index}-net_goals`);
      if (player.cleansheets !== null && (player.cleansheets === undefined || isNaN(player.cleansheets))) errors.add(`player-${index}-cleansheets`);
      if (player.points !== null && (player.points === undefined || isNaN(player.points))) errors.add(`player-${index}-points`);
      if (player.total_points !== null && (player.total_points === undefined || isNaN(player.total_points))) errors.add(`player-${index}-total_points`);
      // Required numeric fields: win, draw, loss, total_matches
      if (player.win === undefined || player.win === null || isNaN(player.win)) errors.add(`player-${index}-win`);
      if (player.draw === undefined || player.draw === null || isNaN(player.draw)) errors.add(`player-${index}-draw`);
      if (player.loss === undefined || player.loss === null || isNaN(player.loss)) errors.add(`player-${index}-loss`);
      if (player.total_matches === undefined || player.total_matches === null || isNaN(player.total_matches)) errors.add(`player-${index}-total_matches`);
      
      // Validate non-negative values
      if (typeof player.total_matches === 'number' && !isNaN(player.total_matches) && player.total_matches < 0) {
        errors.add(`player-${index}-total_matches`);
      }
      if (typeof player.win === 'number' && !isNaN(player.win) && player.win < 0) {
        errors.add(`player-${index}-win`);
      }
      if (typeof player.draw === 'number' && !isNaN(player.draw) && player.draw < 0) {
        errors.add(`player-${index}-draw`);
      }
      if (typeof player.loss === 'number' && !isNaN(player.loss) && player.loss < 0) {
        errors.add(`player-${index}-loss`);
      }
      
      // Validate match calculations
      if (player.win + player.draw + player.loss !== player.total_matches) {
        errors.add(`player-${index}-total_matches`);
      }
      
      // Check for duplicate player names
      const duplicatePlayerIndex = previewPlayers.findIndex((p, i) => 
        i !== index && p.name.trim().toLowerCase() === player.name.trim().toLowerCase()
      );
      if (duplicatePlayerIndex !== -1) {
        errors.add(`player-${index}-name`);
      }
      
      // Cross-referential validation: player team must exist in valid teams (linked or database)
      if (player.team && player.team.trim()) {
        if (!validTeamNames.has(cleanTeamName(player.team))) {
          errors.add(`player-${index}-team`);
        }
      }
    });
    
    setValidationErrors(errors);
    return errors.size === 0;
  };

  // Handle removing items from preview
  const handleRemovePreviewTeam = (index: number) => {
    if (confirm('Remove this team from the import?')) {
      setPreviewTeams(previewTeams.filter((_, i) => i !== index));
    }
  };

  const handleRemovePreviewPlayer = (index: number) => {
    if (confirm('Remove this player from the import?')) {
      setPreviewPlayers(previewPlayers.filter((_, i) => i !== index));
    }
  };

  // Handle editing preview data
  const handlePreviewTeamChange = (index: number, field: keyof PreviewTeamData, value: string) => {
    const newTeams = [...previewTeams];
    newTeams[index][field] = value;
    setPreviewTeams(newTeams);
  };

  const handlePreviewPlayerChange = (index: number, field: keyof PreviewPlayerData, value: any) => {
    const newPlayers = [...previewPlayers];
    if (field === 'goals_scored' || field === 'goals_per_game' || field === 'goals_conceded' || 
        field === 'conceded_per_game' || field === 'net_goals' || field === 'cleansheets' || 
        field === 'points' || field === 'win' || field === 'draw' || field === 'loss' || 
        field === 'total_matches' || field === 'total_points') {
      newPlayers[index][field] = typeof value === 'string' ? (parseFloat(value) || 0) : value;
    } else {
      newPlayers[index][field] = value;
    }
    setPreviewPlayers(newPlayers);
  };

  const handlePreviewAwardChange = (index: number, field: keyof Award, value: any) => {
    const newAwards = [...previewAwards];
    (newAwards[index] as any)[field] = value;
    setPreviewAwards(newAwards);
  };

  const handlePreviewMatchChange = (index: number, field: keyof Match, value: any) => {
    const newMatches = [...previewMatches];
    if (field === 'home_score' || field === 'away_score') {
      (newMatches[index] as any)[field] = typeof value === 'string' ? (parseInt(value) || 0) : value;
    } else {
      (newMatches[index] as any)[field] = value;
    }
    setPreviewMatches(newMatches);
  };

  const handleRemovePreviewAward = (index: number) => {
    if (confirm('Remove this award from the import?')) {
      setPreviewAwards(previewAwards.filter((_, i) => i !== index));
    }
  };

  const handleRemovePreviewMatch = (index: number) => {
    if (confirm('Remove this match from the import?')) {
      setPreviewMatches(previewMatches.filter((_, i) => i !== index));
    }
  };
  
  // Bulk team name replacement
  const handleBulkReplaceTeamNames = () => {
    if (!bulkFindText.trim() || !bulkReplaceText.trim()) {
      alert('Please enter both find and replace text');
      return;
    }
    
    const findLower = bulkFindText.trim().toLowerCase();
    const replaceText = bulkReplaceText.trim();
    let replacedCount = 0;
    
    // Replace in preview players
    const updatedPlayers = previewPlayers.map(player => {
      if (player.team && player.team.toLowerCase() === findLower) {
        replacedCount++;
        return { ...player, team: replaceText };
      }
      return player;
    });
    
    setPreviewPlayers(updatedPlayers);
    
    // Re-validate after bulk change
    setTimeout(() => validatePreviewData(), 100);
    
    alert(`✅ Replaced ${replacedCount} occurrences of "${bulkFindText}" with "${replaceText}"`);
    setBulkFindText('');
    setBulkReplaceText('');
    setShowBulkReplace(false);
  };

  // Final import after preview approval
  const handleFinalImport = async () => {
    if (!validatePreviewData()) {
      alert('Please fix all validation errors before importing.');
      return;
    }
    
    if (previewTeams.length === 0 && previewPlayers.length === 0) {
      alert('No data to import.');
      return;
    }
    
    if (!firebaseUser) return;
    
    try {
      setImporting(true);
      setImportResults(null);
      console.log('🔄 Starting final import after preview...');
      
      // Prepare the data for import
      const importData = {
        teams: previewTeams,
        players: previewPlayers
      };
      
      const token = await getIdToken(firebaseUser);
      const response = await fetchWithTokenRefresh(`/api/seasons/historical/${seasonId}/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(importData)
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }
      
      setImportResults(result);
      setPreviewMode(false); // Exit preview mode
      
      console.log('✅ Final import completed successfully');
      
      // Refresh the page data after import
      setTimeout(() => {
        window.location.reload();
      }, 3000);
      
    } catch (error: any) {
      console.error('❌ Error during final import:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Cancel preview and return to upload
  const handleCancelPreview = () => {
    setPreviewMode(false);
    setPreviewData(null);
    setPreviewTeams([]);
    setPreviewPlayers([]);
    setPreviewAwards([]);
    setPreviewMatches([]);
    setValidationErrors(new Set());
    setShowValidationDetails(false);
  };

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-500 font-mono text-xs tracking-widest uppercase animate-pulse">Loading season telemetry...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  if (!season) {
    return (
      <div className="flex items-center justify-center pt-32 p-4">
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 max-w-md w-full text-center space-y-6 shadow-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
            <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">Season Context Missing</h2>
            <p className="text-xs text-slate-505 font-mono">The requested historical season could not be loaded.</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/superadmin/historical-seasons')}
            className="w-full py-2.5 bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm inline-flex items-center justify-center gap-1.5"
          >
            Back to Seasons
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      <div className="space-y-6">
        {/* Enhanced Page Header */}
        <header className="mb-8">
          <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/dashboard/superadmin/historical-seasons')}
                  className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-650 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
                >
                  <svg className="w-5 h-5 text-slate-500 group-hover:text-amber-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        ID: {seasonId}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 border border-slate-200 text-slate-600">
                        📚 Historical Season
                      </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                      {season.name || seasonId}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                      {season.short_name && (
                        <span className="text-slate-500 text-sm font-medium">
                          {season.short_name}
                        </span>
                      )}
                      {season.short_name && <span className="text-gray-400">•</span>}
                      <span className="text-slate-400 text-sm">
                        Status: <span className="font-medium text-gray-700">{season.status}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push(`/dashboard/superadmin/historical-seasons/${seasonId}/edit`)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
                >
                  <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="hidden sm:inline">Edit Season</span>
                  <span className="sm:hidden">Edit</span>
                </button>
                
                <button
                  onClick={() => router.push(`/dashboard/superadmin/historical-seasons/${seasonId}/edit-data`)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
                >
                  <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                  <span className="hidden sm:inline">📊 Excel Editor</span>
                  <span className="sm:hidden">Excel</span>
                </button>
                
                <button
                  onClick={handleExportToExcel}
                  disabled={isExporting}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 font-mono text-xs font-bold rounded-xl transition-all shadow-sm ${
                    isExporting 
                      ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {isExporting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span className="hidden sm:inline">Exporting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="hidden sm:inline">Export to Excel</span>
                      <span className="sm:hidden">Export</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          
          {/* Data Architecture Information Banner */}
          <div className="console-card bg-white border border-slate-200/60 p-5 mb-6 shadow-sm rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 p-1 rounded bg-amber-500/10 text-amber-600">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-800">📦 Data Architecture</h3>
            </div>
            <div className="text-sm text-gray-700 space-y-2">
              <p className="font-medium">
                This historical season uses our <span className="font-bold text-slate-700">two-collection architecture</span>:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  <span className="font-semibold text-amber-600">realplayers</span> collection stores <span className="font-medium">permanent player information</span> (name, contact, gaming IDs)
                </li>
                <li>
                  <span className="font-semibold text-purple-600">realplayerstats</span> collection stores <span className="font-medium">season-specific stats</span> (category, team, statistics)
                </li>
              </ul>
              <p className="mt-2 text-xs text-slate-500 italic">
                ✅ This separation preserves permanent player data while allowing multiple seasons without overwriting
              </p>
            </div>
          </div>

          {season.import_metadata && (
            <div className="console-card bg-white border border-slate-200/60 p-5 mb-6 shadow-sm rounded-2xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 p-1 rounded bg-amber-500/10 text-amber-600">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-850">📂 Import Information</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-250/60">
                  <div className="text-xs font-medium text-slate-500 mb-1">Source File</div>
                  <div className="text-sm font-semibold text-slate-800 truncate" title="{season.import_metadata.source_file}">
                    {season.import_metadata.source_file}
                  </div>
                </div>
                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-250/60">
                  <div className="text-xs font-medium text-slate-500 mb-1">File Size</div>
                  <div className="text-sm font-semibold text-slate-800">
                    {(season.import_metadata.file_size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-250/60">
                  <div className="text-xs font-medium text-slate-500 mb-1">File Type</div>
                  <div className="text-sm font-semibold text-slate-800">
                    {season.import_metadata.file_type.toUpperCase()}
                  </div>
                </div>
                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-250/60">
                  <div className="text-xs font-medium text-slate-500 mb-1">Import Date</div>
                  <div className="text-sm font-semibold text-slate-800">
                    {season.import_metadata.import_date?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Enhanced Tab Navigation */}
        <div className="console-card bg-white border border-slate-200/60 rounded-t-2xl p-3 shadow-sm border-b-0 mb-0">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {[
              { id: 'overview', name: 'Overview', icon: '📊', color: 'from-purple-500 to-purple-600' },
              { id: 'teams', name: `Teams (${teams.length})`, icon: '🏆', color: 'from-orange-500 to-orange-600' },
              { id: 'players', name: `Players (${players.length})`, icon: '👤', color: 'from-blue-500 to-blue-600' },
              { id: 'stats', name: 'Player Stats', icon: '📈', color: 'from-green-500 to-green-600' },
              { id: 'standings', name: 'Standings & Awards', icon: '🏅', color: 'from-yellow-500 to-yellow-600' },
              { id: 'import', name: 'Import/Export', icon: '📥', color: 'from-indigo-500 to-indigo-600' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`group flex-shrink-0 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-300 transform hover:scale-105 ${
                  activeTab === tab.id
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={`mr-2 transition-transform duration-300 ${
                  activeTab === tab.id ? 'scale-110' : 'group-hover:scale-110'
                }`}>{tab.icon}</span>
                <span className="whitespace-nowrap">{tab.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Enhanced Tab Content */}
        <div className="console-card bg-white border border-slate-200/60 rounded-b-2xl shadow-sm border-t-0 overflow-hidden">
          {/* Enhanced Overview Tab */}
          {activeTab === 'overview' && (
            <div className="p-6 lg:p-8">
              {/* Enhanced Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-3 bg-slate-50 border border-slate-250 text-slate-700 rounded-xl group-hover:rotate-12 transition-transform duration-300">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium opacity-80">🏆</span>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-800">{teams.length}</div>
                  <div className="text-xs text-slate-400 font-bold uppercase mt-1">Teams</div>
                </div>
                <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-3 bg-slate-50 border border-slate-250 text-slate-700 rounded-xl group-hover:rotate-12 transition-transform duration-300">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium opacity-80">👥</span>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-800">{players.length}</div>
                  <div className="text-xs text-slate-400 font-bold uppercase mt-1">Total Players</div>
                </div>
                <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-3 bg-slate-50 border border-slate-250 text-slate-700 rounded-xl group-hover:rotate-12 transition-transform duration-300">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium opacity-80">✅</span>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-800">{activePlayers.length}</div>
                  <div className="text-xs text-slate-400 font-bold uppercase mt-1">Active Players</div>
                </div>
                <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-3 bg-slate-50 border border-slate-250 text-slate-700 rounded-xl group-hover:rotate-12 transition-transform duration-300">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium opacity-80">⚽</span>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-800">{totalGoalsScored.toLocaleString()}</div>
                  <div className="text-xs text-slate-400 font-bold uppercase mt-1">Total Goals</div>
                </div>
              </div>

              {/* Enhanced Category Distribution */}
              <div className="console-card bg-slate-50/50 border border-slate-200/60 p-6 shadow-sm rounded-2xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-800">📊 Category Distribution</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {Object.entries(categoryDistribution).map(([category, count]) => {
                    const percentage = players.length > 0 ? ((count / players.length) * 100).toFixed(1) : '0';
                    return (
                      <div key={category} className="group bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
                        <div className="text-center">
                          <div className="text-2xl font-extrabold text-amber-600 mb-1">{count}</div>
                          <div className="text-xs font-semibold text-slate-800 mb-2 truncate" title={category}>
                            {category || 'Uncategorized'}
                          </div>
                          <div className="text-xs text-slate-400 font-medium">
                            {percentage}%
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Enhanced Teams Tab */}
          {activeTab === 'teams' && (
            <div className="p-6 lg:p-8">
              {/* Teams Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                    <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800">🏆 Teams Overview</h3>
                    <p className="text-xs text-slate-500 font-mono">Team performance and player statistics</p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg">
                  <span className="text-sm font-medium text-orange-800">Teams: {teamStats.length}</span>
                </div>
              </div>

              {teamStats.length === 0 ? (
                <div className="text-center py-16">
                  <div className="p-6 bg-gray-100 rounded-full w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">No Teams Found</h3>
                  <p className="text-slate-500">This season doesn't have any teams yet.</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden lg:block overflow-x-auto rounded-2xl border border-slate-200/60 rounded-2xl overflow-hidden">
                    <table className="min-w-full bg-white text-slate-700">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              Team
                            </div>
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              Owner
                            </div>
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              Players
                            </div>
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              Goals
                            </div>
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                              Record
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {teamStats.map((team, index) => (
                          <tr 
                            key={team.id} 
                            onClick={() => router.push(`/dashboard/teams/${team.id}`)}
                            className={`cursor-pointer hover:bg-orange-50/50 transition-all duration-200 ${
                            index % 2 === 0 ? 'bg-white/30' : 'bg-white/50'
                          }`}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                  {team.team_code || team.team_name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-900 text-base">{team.team_name}</div>
                                  <div className="text-xs text-slate-400">{team.team_code}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  {team.owner_name || 'N/A'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-slate-100 border border-slate-200 text-slate-600 border border-purple-200">
                                {team.playerCount} players
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                <span className="text-lg font-bold text-green-600">
                                  {team.totalGoals || 0}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800">
                                  {team.season_stats?.wins || team.season_stats?.w || 0}W
                                </span>
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                                  {team.season_stats?.draws || team.season_stats?.d || 0}D
                                </span>
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                                  {team.season_stats?.losses || team.season_stats?.l || 0}L
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile/Tablet Cards */}
                  <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {teamStats.map((team, index) => (
                      <div 
                        key={team.id} 
                        onClick={() => router.push(`/dashboard/teams/${team.id}`)}
                        className="cursor-pointer bg-white/70 rounded-xl p-5 border border-white/50 shadow-sm hover:shadow-md transition-all duration-300">
                        <div className="flex items-start gap-4 mb-4">
                          <div className="w-14 h-14 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                            {team.team_code || team.team_name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-gray-900 text-base truncate">
                              {team.team_name}
                            </h4>
                            <p className="text-xs text-slate-500 font-mono mt-1">
                              Owner: {team.owner_name || 'N/A'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center bg-purple-50 rounded-lg p-3">
                            <div className="text-lg font-bold text-purple-600">{team.playerCount}</div>
                            <div className="text-xs text-purple-700 font-medium">Players</div>
                          </div>
                          <div className="text-center bg-green-50 rounded-lg p-3">
                            <div className="text-lg font-bold text-green-600">{team.totalGoals || 0}</div>
                            <div className="text-xs text-green-700 font-medium">Goals</div>
                          </div>
                          <div className="text-center bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg p-3">
                            <div className="text-sm font-bold text-amber-600">{team.season_stats?.wins || team.season_stats?.w || 0}-{team.season_stats?.draws || team.season_stats?.d || 0}-{team.season_stats?.losses || team.season_stats?.l || 0}</div>
                            <div className="text-xs text-slate-500 font-medium">W-D-L</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Enhanced Players Tab */}
          {activeTab === 'players' && (
            <div className="p-6 lg:p-8">
              {/* Players Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800">👤 Players Overview</h3>
                    <p className="text-xs text-slate-500 font-mono">Simple view of all players with essential information</p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg">
                  <span className="text-sm font-medium text-slate-850">Total: {players.length}</span>
                </div>
              </div>

              {players.length === 0 ? (
                <div className="text-center py-16">
                  <div className="p-6 bg-gray-100 rounded-full w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">No Players Found</h3>
                  <p className="text-slate-500">This season doesn't have any players yet.</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200/60 rounded-2xl overflow-hidden">
                    <table className="min-w-full bg-white text-slate-700">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              Player Name
                            </div>
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                              </svg>
                              Category
                            </div>
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              Team Name
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {players.map((player, index) => {
                          return (
                            <tr 
                              key={player.id} 
                              onClick={() => router.push(`/dashboard/players/${player.player_id || player.id}`)}
                              className={`cursor-pointer hover:bg-blue-50/50 transition-all duration-200 ${
                              index % 2 === 0 ? 'bg-white/30' : 'bg-white/50'
                            }`}>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                    {(player.name || 'U')[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-gray-900">
                                      {player.name || 'Unknown Player'}
                                    </div>
                                    <div className="text-xs text-slate-400">Player #{index + 1}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                  player.category 
                                    ? 'bg-green-100 text-green-800 border border-green-200' 
                                    : 'bg-gray-100 text-slate-500 border border-slate-200'
                                }`}>
                                  {player.category || 'N/A'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${
                                    player.team ? 'bg-purple-500' : 'bg-gray-400'
                                  }`}></div>
                                  <span className={`font-medium ${
                                    player.team ? 'text-gray-900' : 'text-slate-400'
                                  }`}>
                                    {player.team || 'No Team'}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-4">
                    {players.map((player, index) => (
                      <div 
                        key={player.id} 
                        onClick={() => router.push(`/dashboard/players/${player.player_id || player.id}`)}
                        className="cursor-pointer bg-white/70 rounded-xl p-4 border border-white/50 shadow-sm hover:shadow-md transition-all duration-300">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                            {(player.name || 'U')[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-semibold text-gray-900 truncate">
                                {player.name || 'Unknown Player'}
                              </h4>
                              <span className="text-xs text-slate-400 flex-shrink-0">#{index + 1}</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-500">Category:</span>
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  player.category 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-gray-100 text-slate-500'
                                }`}>
                                  {player.category || 'N/A'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-500">Team:</span>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${
                                    player.team ? 'bg-purple-500' : 'bg-gray-400'
                                  }`}></div>
                                  <span className={`text-xs font-medium ${
                                    player.team ? 'text-gray-900' : 'text-slate-400'
                                  }`}>
                                    {player.team || 'No Team'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Enhanced Player Stats Tab */}
          {activeTab === 'stats' && (
            <div className="p-6 lg:p-8">
              {/* Stats Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">📈 Player Statistics</h3>
                  <p className="text-xs text-slate-500 font-mono">Detailed performance metrics and rankings</p>
                </div>
              </div>
              
              {/* Category Filter Tabs */}
              <div className="mb-6">
                <div className="bg-white rounded-xl p-2 shadow-sm border border-slate-200">
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                    {/* All Categories Tab */}
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                        selectedCategory === 'all'
                          ? 'bg-green-500 text-white shadow-md'
                          : 'text-slate-500 hover:bg-gray-100'
                      }`}
                    >
                      All ({players.length})
                    </button>
                    
                    {/* Individual Category Tabs */}
                    {uniqueCategories.map(category => {
                      const count = categoryDistribution[category];
                      const isSelected = selectedCategory === category;
                      const lowerCategory = category.toLowerCase();
                      
                      // Get color based on category
                      const getColor = () => {
                        if (lowerCategory.includes('forward') || lowerCategory.includes('striker')) {
                          return isSelected ? 'bg-red-500 text-white shadow-md' : 'text-slate-500 hover:bg-red-50';
                        } else if (lowerCategory.includes('midfielder') || lowerCategory.includes('mid')) {
                          return isSelected ? 'bg-blue-500 text-white shadow-md' : 'text-slate-500 hover:bg-blue-50';
                        } else if (lowerCategory.includes('defender') || lowerCategory.includes('defence')) {
                          return isSelected ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500 hover:bg-indigo-50';
                        } else if (lowerCategory.includes('goalkeeper') || lowerCategory.includes('gk')) {
                          return isSelected ? 'bg-yellow-500 text-white shadow-md' : 'text-slate-500 hover:bg-yellow-50';
                        } else {
                          return isSelected ? 'bg-purple-500 text-white shadow-md' : 'text-slate-500 hover:bg-purple-50';
                        }
                      };
                      
                      return (
                        <button
                          key={category}
                          onClick={() => setSelectedCategory(category)}
                          className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                            getColor()
                          }`}
                        >
                          {category} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {/* Active Filter Info */}
                {selectedCategory !== 'all' && (
                  <div className="mt-3 flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-sm text-gray-700">
                      Showing <span className="font-semibold text-green-600">{filteredPlayers.length}</span> {filteredPlayers.length === 1 ? 'player' : 'players'} in <span className="font-semibold">{selectedCategory}</span>
                    </span>
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {filteredPlayers.length === 0 ? (
                <div className="text-center py-16">
                  <div className="p-6 bg-gray-100 rounded-full w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">
                    {selectedCategory === 'all' ? 'No Statistics Available' : `No Players in ${selectedCategory}`}
                  </h3>
                  <p className="text-slate-500">
                    {selectedCategory === 'all' 
                      ? 'Player statistics will appear here once available.' 
                      : 'Try selecting a different category or clear the filter.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden lg:block overflow-x-auto rounded-2xl border border-slate-200/60 rounded-2xl overflow-hidden">
                    <table className="min-w-full bg-white text-slate-700">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-4 text-left text-xs font-semibold text-slate-800 uppercase tracking-wider">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              Player
                            </div>
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-semibold text-slate-800 uppercase tracking-wider">Team</th>
                          <th className="px-3 py-4 text-left text-xs font-semibold text-slate-800 uppercase tracking-wider">Cat.</th>
                          <th className="px-3 py-4 text-center text-xs font-semibold text-slate-800 uppercase tracking-wider" title="Total Matches">Matches</th>
                          <th className="px-3 py-4 text-center text-xs font-semibold text-slate-800 uppercase tracking-wider" title="Wins-Draws-Losses">W-D-L</th>
                          <th className="px-3 py-4 text-center text-xs font-semibold text-slate-800 uppercase tracking-wider" title="Win Rate">Win %</th>
                          <th className="px-3 py-4 text-center text-xs font-semibold text-slate-800 uppercase tracking-wider" title="Goals Scored">Goals</th>
                          <th className="px-3 py-4 text-center text-xs font-semibold text-slate-800 uppercase tracking-wider" title="Goals Per Game">G/Game</th>
                          <th className="px-3 py-4 text-center text-xs font-semibold text-slate-800 uppercase tracking-wider" title="Goals Conceded">Conceded</th>
                          <th className="px-3 py-4 text-center text-xs font-semibold text-slate-800 uppercase tracking-wider" title="Conceded Per Game">C/Game</th>
                          <th className="px-3 py-4 text-center text-xs font-semibold text-slate-800 uppercase tracking-wider" title="Net Goals">Net</th>
                          <th className="px-3 py-4 text-center text-xs font-semibold text-slate-800 uppercase tracking-wider" title="Clean Sheets">Clean</th>
                          <th className="px-3 py-4 text-center text-xs font-semibold text-slate-800 uppercase tracking-wider" title="Player of the Match">POTM</th>
                          <th className="px-3 py-4 text-center text-xs font-semibold text-slate-800 uppercase tracking-wider" title="Points">Points</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPlayers
                          .sort((a, b) => {
                            const pointsA = a.stats?.points || a.stats?.total_points || 0;
                            const pointsB = b.stats?.points || b.stats?.total_points || 0;
                            return pointsB - pointsA;
                          })
                          .map((player, index) => {
                            const stats = (player.stats || {}) as any;
                            const matchesPlayed = stats.matches_played || 0;
                            const winRate = matchesPlayed > 0 
                              ? ((stats.matches_won || 0) / matchesPlayed * 100).toFixed(1) 
                              : '0.0';
                            const isTopPlayer = index < 3; // Top 3 by points
                            const goalsPerGame = stats.goals_per_game || (matchesPlayed > 0 ? (stats.goals_scored || 0) / matchesPlayed : 0);
                            const concededPerGame = stats.conceded_per_game || (matchesPlayed > 0 ? (stats.goals_conceded || 0) / matchesPlayed : 0);
                            const netGoals = stats.net_goals || ((stats.goals_scored || 0) - (stats.goals_conceded || 0));
                            
                            return (
                              <tr 
                                key={player.id} 
                                onClick={() => router.push(`/dashboard/players/${player.player_id || player.id}`)}
                                className={`cursor-pointer hover:bg-green-50/50 transition-all duration-200 ${
                                index % 2 === 0 ? 'bg-white/30' : 'bg-white/50'
                              }`}
                              >
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    {isTopPlayer && (
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                                        index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : 'bg-orange-400'
                                      }`}>
                                        {index + 1}
                                      </div>
                                    )}
                                    <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                      {(player.name || 'U')[0].toUpperCase()}
                                    </div>
                                    <div>
                                      <div className="font-semibold text-gray-900 text-sm">
                                        {player.name || 'Unknown Player'}
                                      </div>
                                      <div className="text-xs text-slate-400">Rank #{index + 1}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-4">
                                  <span className="text-xs font-medium text-gray-700">
                                    {player.team || 'No Team'}
                                  </span>
                                </td>
                                <td className="px-3 py-4">
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                    player.category 
                                      ? 'bg-indigo-100 text-slate-800' 
                                      : 'bg-gray-100 text-slate-500'
                                  }`}>
                                    {player.category || 'N/A'}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-sm font-medium text-gray-900">{matchesPlayed}</span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <div className="text-xs space-x-1">
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-semibold">
                                      {stats.matches_won || 0}W
                                    </span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 font-semibold">
                                      {stats.matches_drawn || 0}D
                                    </span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                                      {stats.matches_lost || 0}L
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className={`text-sm font-bold ${
                                    parseFloat(winRate) >= 70 ? 'text-green-600' : 
                                    parseFloat(winRate) >= 50 ? 'text-yellow-600' : 'text-red-600'
                                  }`}>
                                    {winRate}%
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-lg font-bold text-green-600">{stats.goals_scored || 0}</span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-sm font-medium text-amber-600">{typeof goalsPerGame === 'number' ? goalsPerGame.toFixed(2) : '0.00'}</span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-sm font-medium text-red-600">{stats.goals_conceded || 0}</span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-sm font-medium text-amber-500">{typeof concededPerGame === 'number' ? concededPerGame.toFixed(2) : '0.00'}</span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className={`text-sm font-bold ${
                                    netGoals > 0 ? 'text-green-600' : netGoals < 0 ? 'text-red-600' : 'text-slate-500'
                                  }`}>
                                    {netGoals > 0 ? '+' : ''}{netGoals}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-sm font-medium text-purple-600">{stats.clean_sheets || 0}</span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  {stats.potm ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                                      <span className="text-sm">🌟</span>
                                      {stats.potm}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <span className="text-sm font-bold text-amber-600">{stats.points || stats.total_points || 0}</span>
                                    {isTopPlayer && (
                                      <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                      </svg>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile/Tablet Cards */}
                  <div className="lg:hidden space-y-4">
                    {filteredPlayers
                      .sort((a, b) => {
                        const pointsA = a.stats?.points || a.stats?.total_points || 0;
                        const pointsB = b.stats?.points || b.stats?.total_points || 0;
                        return pointsB - pointsA;
                      })
                      .map((player, index) => {
                        const stats = (player.stats || {}) as any;
                        const matchesPlayed = stats.matches_played || 0;
                        const winRate = matchesPlayed > 0 
                          ? ((stats.matches_won || 0) / matchesPlayed * 100).toFixed(1) 
                          : '0.0';
                        const isTopPlayer = index < 3; // Top 3 by points
                        const goalsPerGame = stats.goals_per_game || (matchesPlayed > 0 ? (stats.goals_scored || 0) / matchesPlayed : 0);
                        const concededPerGame = stats.conceded_per_game || (matchesPlayed > 0 ? (stats.goals_conceded || 0) / matchesPlayed : 0);
                        const netGoals = stats.net_goals || ((stats.goals_scored || 0) - (stats.goals_conceded || 0));

                        return (
                          <div 
                            key={player.id} 
                            onClick={() => router.push(`/dashboard/players/${player.player_id || player.id}`)}
                            className={`cursor-pointer bg-white/70 rounded-xl p-5 border border-white/50 shadow-sm hover:shadow-md transition-all duration-300 ${
                            isTopPlayer ? 'ring-2 ring-yellow-200' : ''
                          }`}
                          >
                            <div className="flex items-start gap-4 mb-4">
                              <div className="flex items-center gap-2">
                                {isTopPlayer && (
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                                    index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : 'bg-orange-400'
                                  }`}>
                                    {index + 1}
                                  </div>
                                )}
                                <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                                  {(player.name || 'U')[0].toUpperCase()}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <h4 className="font-bold text-gray-900 text-base truncate">
                                    {player.name || 'Unknown Player'}
                                  </h4>
                                  {isTopPlayer && (
                                    <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                                  <span>{player.team || 'No Team'}</span>
                                  <span>•</span>
                                  <span>{player.category || 'N/A'}</span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                              {/* Points - First and Highlighted */}
                              <div className={`text-center rounded-lg p-2.5 ${
                                isTopPlayer ? 'bg-gradient-to-br from-yellow-100 to-yellow-200 ring-2 ring-yellow-400' : 'bg-slate-50'
                              }`}>
                                <div className="flex items-center justify-center gap-1">
                                  <div className="text-xl font-bold text-amber-600">{stats.points || stats.total_points || 0}</div>
                                  {isTopPlayer && (
                                    <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  )}
                                </div>
                                <div className={`text-xs font-medium ${
                                  isTopPlayer ? 'text-yellow-800' : 'text-slate-700'
                                }`}>Points</div>
                              </div>
                              
                              <div className="text-center bg-yellow-50 rounded-lg p-2.5">
                                <div className="text-lg font-bold text-yellow-600">{matchesPlayed}</div>
                                <div className="text-xs text-yellow-700 font-medium">Matches</div>
                              </div>
                              <div className="text-center bg-gray-50 rounded-lg p-2.5">
                                <div className="text-sm font-bold text-slate-500">{stats.matches_won || 0}-{stats.matches_drawn || 0}-{stats.matches_lost || 0}</div>
                                <div className="text-xs text-gray-700 font-medium">W-D-L</div>
                              </div>
                              <div className="text-center bg-green-50 rounded-lg p-2.5">
                                <div className="text-xl font-bold text-green-600">{stats.goals_scored || 0}</div>
                                <div className="text-xs text-green-700 font-medium">Goals Scored</div>
                              </div>
                              <div className="text-center bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg p-2.5">
                                <div className="text-lg font-bold text-amber-600">{typeof goalsPerGame === 'number' ? goalsPerGame.toFixed(2) : '0.00'}</div>
                                <div className="text-xs text-slate-500 font-medium">Goals/Game</div>
                              </div>
                              <div className="text-center bg-red-50 rounded-lg p-2.5">
                                <div className="text-lg font-bold text-red-600">{stats.goals_conceded || 0}</div>
                                <div className="text-xs text-red-700 font-medium">Conceded</div>
                              </div>
                              <div className="text-center bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg p-2.5">
                                <div className="text-lg font-bold text-amber-500">{typeof concededPerGame === 'number' ? concededPerGame.toFixed(2) : '0.00'}</div>
                                <div className="text-xs text-orange-700 font-medium">Conceded/Game</div>
                              </div>
                              <div className="text-center bg-teal-50 rounded-lg p-2.5">
                                <div className={`text-lg font-bold ${
                                  netGoals > 0 ? 'text-green-600' : netGoals < 0 ? 'text-red-600' : 'text-slate-500'
                                }`}>
                                  {netGoals > 0 ? '+' : ''}{netGoals}
                                </div>
                                <div className="text-xs text-teal-700 font-medium">Net Goals</div>
                              </div>
                              <div className="text-center bg-purple-50 rounded-lg p-2.5">
                                <div className="text-lg font-bold text-purple-600">{stats.clean_sheets || 0}</div>
                                <div className="text-xs text-purple-700 font-medium">Clean Sheets</div>
                              </div>
                              {stats.potm && (
                                <div className="text-center bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg p-2.5 col-span-2 sm:col-span-1">
                                  <div className="flex items-center justify-center gap-1">
                                    <span className="text-lg">🌟</span>
                                    <div className="text-lg font-bold text-amber-500">{stats.potm}</div>
                                  </div>
                                  <div className="text-xs text-orange-700 font-medium">POTM</div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Standings & Awards Tab */}
          {activeTab === 'standings' && (
            <div className="p-6 lg:p-8">
              {/* Standings Header */}
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">🏅 Team Standings & Awards</h3>
                  <p className="text-xs text-slate-500 font-mono">Final standings, league winners, and cup champions</p>
                </div>
              </div>

              {/* Awards/Winners Section */}
              {awards.length > 0 && (
                <div className="mb-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {awards.filter(a => a.award_category?.toLowerCase().includes('league') || a.award_category?.toLowerCase().includes('champion')).map((award, index) => (
                      <div key={award.id} className="console-card bg-amber-50/20 border border-amber-200/50 p-6 rounded-2xl hover:shadow-md transition-all duration-300">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                            <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          </div>
                          <div>
                            <h4 className="font-bold text-yellow-800">{award.award_name}</h4>
                            <p className="text-xs text-yellow-600">{award.award_category}</p>
                          </div>
                        </div>
                        <div className="bg-white/60 rounded-xl p-4 border border-white/50">
                          <p className="text-sm font-medium text-slate-500 mb-1">Winner</p>
                          <p className="text-lg font-bold text-gray-900">{award.winner_team || award.winner_player || 'N/A'}</p>
                          {award.description && (
                            <p className="text-xs text-slate-400 mt-2">{award.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Team Standings Table */}
              <div className="console-card bg-white border border-slate-200/60 p-6 lg:p-8 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800">📋 Final Team Standings</h4>
                </div>

                {teamStats.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-500">No team standings available</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200/60 rounded-2xl overflow-hidden">
                      <table className="min-w-full bg-white text-slate-700">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Pos</th>
                            <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Team</th>
                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-800 uppercase tracking-wider">MP</th>
                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-800 uppercase tracking-wider">W</th>
                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-800 uppercase tracking-wider">D</th>
                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-800 uppercase tracking-wider">L</th>
                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-800 uppercase tracking-wider">Goals</th>
                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-800 uppercase tracking-wider">Pts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {teamStats
                            .sort((a, b) => {
                              // Use rank from teamstats if available, otherwise sort by points, GD, GF
                              if (a.rank && b.rank) return a.rank - b.rank;
                              
                              // Fallback: Sort by points, then by goal difference, then by goals scored
                              const pointsA = a.points || 0;
                              const pointsB = b.points || 0;
                              if (pointsB !== pointsA) return pointsB - pointsA;
                              
                              // Goal difference
                              const gdA = a.goalDifference || 0;
                              const gdB = b.goalDifference || 0;
                              if (gdB !== gdA) return gdB - gdA;
                              
                              // Goals scored
                              return (b.totalGoals || 0) - (a.totalGoals || 0);
                            })
                            .map((team, index) => {
                              const points = team.points || 0;
                              const isChampion = index === 0;
                              const isTopThree = index < 3;
                              
                              return (
                                <tr key={team.id} className={`hover:bg-blue-50/50 transition-all duration-200 ${
                                  index % 2 === 0 ? 'bg-white/30' : 'bg-white/50'
                                } ${isChampion ? 'ring-2 ring-yellow-400 ring-inset' : ''}`}>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                                        isChampion ? 'bg-yellow-500' : isTopThree ? 'bg-blue-500' : 'bg-gray-400'
                                      }`}>
                                        {index + 1}
                                      </div>
                                      {isChampion && (
                                        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-white font-bold text-xs">
                                        {team.team_code || team.team_name.substring(0, 2).toUpperCase()}
                                      </div>
                                      <div>
                                        <div className={`font-semibold ${isChampion ? 'text-yellow-700' : 'text-gray-900'}`}>
                                          {team.team_name}
                                          {isChampion && <span className="ml-2 text-yellow-600">👑</span>}
                                        </div>
                                        <div className="text-xs text-slate-400">{team.owner_name || 'N/A'}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <span className="text-sm font-medium text-gray-900">{team.matchesPlayed}</span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800">
                                      {team.wins}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                                      {team.draws}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                                      {team.losses}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <span className="text-lg font-bold text-amber-600">{team.totalGoals}</span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <span className={`text-xl font-bold ${
                                      isChampion ? 'text-yellow-600' : 'text-amber-600'
                                    }`}>
                                      {points}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-4">
                      {teamStats
                        .sort((a, b) => {
                          // Use rank from teamstats if available
                          if (a.rank && b.rank) return a.rank - b.rank;
                          
                          // Fallback: Sort by points, then goals
                          const pointsA = a.points || 0;
                          const pointsB = b.points || 0;
                          if (pointsB !== pointsA) return pointsB - pointsA;
                          return (b.totalGoals || 0) - (a.totalGoals || 0);
                        })
                        .map((team, index) => {
                          const points = team.points || 0;
                          const isChampion = index === 0;
                          
                          return (
                            <div key={team.id} className={`bg-white/70 rounded-xl p-5 border shadow-sm hover:shadow-md transition-all duration-300 ${
                              isChampion ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-white/50'
                            }`}>
                              <div className="flex items-center gap-3 mb-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold ${
                                  isChampion ? 'bg-yellow-500' : 'bg-blue-500'
                                }`}>
                                  {index + 1}
                                </div>
                                <div className="flex-1">
                                  <div className={`font-bold ${isChampion ? 'text-yellow-700' : 'text-gray-900'}`}>
                                    {team.team_name}
                                    {isChampion && <span className="ml-1">👑</span>}
                                  </div>
                                  <div className="text-xs text-slate-400">{team.owner_name || 'N/A'}</div>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-gray-50 rounded-lg p-2">
                                  <div className="text-lg font-bold text-gray-900">{team.matchesPlayed}</div>
                                  <div className="text-xs text-slate-500">MP</div>
                                </div>
                                <div className="bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg p-2">
                                  <div className="text-lg font-bold text-amber-600">{team.totalGoals}</div>
                                  <div className="text-xs text-slate-500">Goals</div>
                                </div>
                                <div className={`rounded-lg p-2 ${
                                  isChampion ? 'bg-yellow-50' : 'bg-slate-50'
                                }`}>
                                  <div className={`text-lg font-bold ${
                                    isChampion ? 'text-yellow-600' : 'text-amber-600'
                                  }`}>
                                    {points}
                                  </div>
                                  <div className={`text-xs ${
                                    isChampion ? 'text-yellow-700' : 'text-slate-700'
                                  }`}>
                                    Points
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center justify-center gap-2 mt-3">
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800">
                                  {team.wins}W
                                </span>
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                                  {team.draws}D
                                </span>
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                                  {team.losses}L
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>

              {/* Team Trophies Section - Display trophies separately */}
              <div className="mt-8 console-card bg-amber-50/20 border border-amber-200/50 p-6 lg:p-8 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                      <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-800">🏆 Team Trophies</h4>
                      <p className="text-xs text-slate-500 font-mono">Championship trophies and special achievements</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setActionError(null);
                      setShowTrophyForm(!showTrophyForm);
                    }}
                    className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    {showTrophyForm ? '✕ Close Form' : '＋ Add Trophy'}
                  </button>
                </div>

                {/* Add Trophy Form */}
                {showTrophyForm && (
                  <form onSubmit={handleAddTrophy} className="mb-6 p-4 bg-white/80 border border-yellow-200 rounded-xl space-y-4">
                    <h5 className="text-xs font-bold text-yellow-800 uppercase tracking-wider">Add Team Trophy</h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Team Name</label>
                        <select
                          value={trophyTeamName}
                          onChange={(e) => setTrophyTeamName(e.target.value)}
                          className="w-full text-xs border border-slate-350 rounded-lg p-2 bg-white focus:outline-none focus:border-amber-400"
                          required
                        >
                          <option value="">Select Team...</option>
                          {teamStats.map(t => (
                            <option key={t.id} value={t.team_name}>{t.team_name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Trophy Type</label>
                        <select
                          value={trophyType}
                          onChange={(e) => setTrophyType(e.target.value as any)}
                          className="w-full text-xs border border-slate-350 rounded-lg p-2 bg-white focus:outline-none focus:border-amber-400"
                          required
                        >
                          <option value="cup">Cup</option>
                          <option value="league">League Winner</option>
                          <option value="runner_up">Runner Up</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Trophy Name</label>
                        <input
                          type="text"
                          value={trophyName}
                          onChange={(e) => setTrophyName(e.target.value)}
                          placeholder="e.g. League, Cup, Super Cup"
                          className="w-full text-xs border border-slate-350 rounded-lg p-2 focus:outline-none focus:border-amber-400"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Trophy Position (Optional)</label>
                        <input
                          type="text"
                          value={trophyPosition}
                          onChange={(e) => setTrophyPosition(e.target.value)}
                          placeholder="e.g. Winner, Runner Up, Third Place"
                          className="w-full text-xs border border-slate-350 rounded-lg p-2 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Notes (Optional)</label>
                        <input
                          type="text"
                          value={trophyNotes}
                          onChange={(e) => setTrophyNotes(e.target.value)}
                          placeholder="Special notes or achievements"
                          className="w-full text-xs border border-slate-350 rounded-lg p-2 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTrophyForm(false)}
                        className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingTrophy}
                        className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-xs font-bold transition-all"
                      >
                        {isSubmittingTrophy ? 'Adding...' : 'Add Trophy'}
                      </button>
                    </div>
                  </form>
                )}

                {actionError && (
                  <div className="mb-4 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    {actionError}
                  </div>
                )}

                {trophies.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No trophies awarded yet for this season.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {trophies.map((trophy, index) => {
                      const team = teamStats.find(t => t.id === trophy.team_id);
                      return (
                        <div key={index} className="bg-white/70 rounded-xl p-5 border border-yellow-300 hover:shadow-lg transition-all duration-300 relative group">
                          <button
                            onClick={() => handleDeleteTrophy(trophy.id)}
                            className="absolute top-2 right-2 text-red-600 hover:text-red-800 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-red-50 rounded"
                            title="Delete Trophy"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          <div className="flex items-start gap-3 mb-3">
                            <div className="p-2 bg-yellow-100 rounded-lg flex-shrink-0">
                              <span className="text-2xl">🏆</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="font-bold text-yellow-800 text-base truncate" title={trophy.trophy_name}>
                                {trophy.trophy_name}
                              </h5>
                              {trophy.trophy_category && (
                                <p className="text-xs text-yellow-600 mt-1">{trophy.trophy_category}</p>
                              )}
                            </div>
                          </div>
                          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg p-3 border border-yellow-200">
                            {trophy.trophy_position && (
                              <p className="text-xs font-medium text-yellow-700 mb-1">{trophy.trophy_position}</p>
                            )}
                            <p className="text-sm font-bold text-gray-900 truncate" title={team?.team_name}>
                              {team?.team_name || 'Unknown Team'}
                            </p>
                            {team?.owner_name && (
                              <p className="text-xs text-slate-500 mt-1 truncate" title={team.owner_name}>
                                {team.owner_name}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cup Winners Section - from team standings cup achievement data */}
              {teamStats.filter(t => t.cupAchievement && t.cupAchievement.trim() !== '').length > 0 && (
                <div className="mt-8 console-card bg-orange-50/20 border border-orange-200/50 p-6 lg:p-8 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                      <svg className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                      </svg>
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-800">🏆 Cup Competition Results</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {teamStats
                      .filter(t => t.cupAchievement && t.cupAchievement.trim() !== '')
                      .map((team) => {
                        const achievement = team.cupAchievement || '';
                        const isWinner = achievement.toLowerCase().includes('winner') || achievement.toLowerCase().includes('champion');
                        const isRunnerUp = achievement.toLowerCase().includes('runner') || achievement.toLowerCase().includes('finalist');
                        
                        return (
                          <div key={team.id} className={`bg-white/70 rounded-xl p-5 border hover:shadow-md transition-all duration-300 ${
                            isWinner ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-white/50'
                          }`}>
                            <div className="flex items-center gap-2 mb-3">
                              {isWinner && (
                                <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              )}
                              {isRunnerUp && (
                                <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              )}
                              <h5 className={`font-bold ${
                                isWinner ? 'text-yellow-700' : isRunnerUp ? 'text-slate-500' : 'text-orange-700'
                              }`}>
                                {achievement}
                              </h5>
                            </div>
                            <div className={`rounded-lg p-3 border ${
                              isWinner ? 'bg-yellow-50 border-yellow-200' : 'bg-orange-50 border-orange-200'
                            }`}>
                              <p className={`text-xs font-medium mb-1 ${
                                isWinner ? 'text-yellow-600' : 'text-amber-500'
                              }`}>
                                {isWinner ? '🏆 Winner' : isRunnerUp ? '🥈 Runner-up' : 'Achievement'}
                              </p>
                              <p className="text-base font-bold text-gray-900">{team.team_name}</p>
                              {team.owner_name && (
                                <p className="text-xs text-slate-400 mt-1">{team.owner_name}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              
              {/* Cup Awards Section - from awards collection (if available) */}
              {awards.filter(a => a.award_category?.toLowerCase().includes('cup')).length > 0 && (
                <div className="mt-8 console-card bg-orange-50/20 border border-orange-200/50 p-6 lg:p-8 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                      <svg className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                      </svg>
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-800">🏆 Additional Cup Awards</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {awards.filter(a => a.award_category?.toLowerCase().includes('cup')).map((award) => (
                      <div key={award.id} className="bg-white/70 rounded-xl p-5 border border-white/50 hover:shadow-md transition-all duration-300">
                        <h5 className="font-bold text-orange-700 mb-2">{award.award_name}</h5>
                        <div className="bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg p-3 border border-orange-200">
                          <p className="text-xs font-medium text-amber-500 mb-1">
                            {award.award_name.toLowerCase().includes('runner') ? 'Runner-up' : 'Winner'}
                          </p>
                          <p className="text-base font-bold text-gray-900">{award.winner_team || award.winner_player || 'N/A'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Player Awards Section - from player_awards table */}
              <div className="mt-8 console-card bg-purple-50/20 border border-purple-200/50 p-6 lg:p-8 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                      <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-800">🎯 Player Awards</h4>
                      <p className="text-xs text-slate-500 font-mono">Individual and category awards</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setActionError(null);
                      setShowPlayerAwardForm(!showPlayerAwardForm);
                    }}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    {showPlayerAwardForm ? '✕ Close Form' : '＋ Add Player Award'}
                  </button>
                </div>

                {/* Add Player Award Form */}
                {showPlayerAwardForm && (
                  <form onSubmit={handleAddPlayerAward} className="mb-6 p-4 bg-white/80 border border-purple-200 rounded-xl space-y-4">
                    <h5 className="text-xs font-bold text-purple-800 uppercase tracking-wider">Add Player Award</h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Select Player</label>
                        <select
                          value={awardPlayerId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAwardPlayerId(val);
                            const pObj = players.find(p => (p.player_id || p.id) === val);
                            setAwardPlayerName(pObj ? (pObj.player_name || pObj.name || '') : '');
                          }}
                          className="w-full text-xs border border-slate-350 rounded-lg p-2 bg-white focus:outline-none focus:border-amber-400"
                          required
                        >
                          <option value="">Select Player...</option>
                          {players.map(p => (
                            <option key={p.player_id || p.id} value={p.player_id || p.id}>
                              {p.player_name || p.name} ({p.team})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Award Category</label>
                        <select
                          value={awardCategory}
                          onChange={(e) => setAwardCategory(e.target.value as any)}
                          className="w-full text-xs border border-slate-350 rounded-lg p-2 bg-white focus:outline-none focus:border-amber-400"
                          required
                        >
                          <option value="individual">Individual Award</option>
                          <option value="category">Category Award</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Award Type / Name</label>
                        <input
                          type="text"
                          value={awardType}
                          onChange={(e) => setAwardType(e.target.value)}
                          placeholder="e.g. MVP, Golden Boot, Best Midfielder"
                          className="w-full text-xs border border-slate-350 rounded-lg p-2 focus:outline-none focus:border-amber-400"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Award Position (Optional)</label>
                        <select
                          value={awardPosition}
                          onChange={(e) => setAwardPosition(e.target.value)}
                          className="w-full text-xs border border-slate-350 rounded-lg p-2 bg-white focus:outline-none focus:border-amber-400"
                        >
                          <option value="Winner">Winner</option>
                          <option value="Runner Up">Runner Up</option>
                          <option value="Third Place">Third Place</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Player Category {awardCategory === 'category' ? <span className="text-red-500">*</span> : '(Optional)'}
                        </label>
                        <select
                          value={awardPlayerCategory}
                          onChange={(e) => setAwardPlayerCategory(e.target.value)}
                          className="w-full text-xs border border-slate-350 rounded-lg p-2 bg-white focus:outline-none focus:border-amber-400"
                          required={awardCategory === 'category'}
                        >
                          <option value="">Select Category...</option>
                          <option value="Goalkeeper">Goalkeeper</option>
                          <option value="Defender">Defender</option>
                          <option value="Midfielder">Midfielder</option>
                          <option value="Attacker">Attacker</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Notes (Optional)</label>
                        <input
                          type="text"
                          value={awardNotes}
                          onChange={(e) => setAwardNotes(e.target.value)}
                          placeholder="e.g. 15 goals in 10 matches"
                          className="w-full text-xs border border-slate-350 rounded-lg p-2 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPlayerAwardForm(false)}
                        className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingAward}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all"
                      >
                        {isSubmittingAward ? 'Adding...' : 'Add Award'}
                      </button>
                    </div>
                  </form>
                )}

                {actionError && (
                  <div className="mb-4 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    {actionError}
                  </div>
                )}

                {playerAwards.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No player awards registered for this season.</p>
                ) : (
                  <div className="space-y-6">
                    {/* Individual Awards */}
                    {playerAwards.filter(a => a.award_category === 'individual').length > 0 && (
                      <div>
                        <h5 className="text-lg font-semibold text-purple-800 mb-4 flex items-center gap-2">
                          <span>🌟</span> Individual Awards
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {playerAwards
                            .filter(a => a.award_category === 'individual')
                            .map((award) => (
                              <div key={award.id} className="bg-white/70 rounded-xl p-4 border border-purple-200 hover:shadow-md transition-all duration-300 relative group">
                                <button
                                  onClick={() => handleDeletePlayerAward(award.id)}
                                  className="absolute top-2 right-2 text-red-600 hover:text-red-800 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-red-50 rounded"
                                  title="Delete Award"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                                <div className="flex items-center gap-2 mb-2">
                                  {award.award_position === 1 && (
                                    <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  )}
                                  <h6 className="text-sm font-bold text-purple-700">{award.award_type}</h6>
                                </div>
                                <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                                  <p className="text-xs font-medium text-purple-600 mb-1">
                                    {award.award_position === 'Winner' || award.award_position === '1' || award.award_position === 1 ? 'Winner' : award.award_position === 'Runner Up' || award.award_position === '2' || award.award_position === 2 ? 'Runner-up' : award.award_position || 'Winner'}
                                  </p>
                                  <p className="text-base font-bold text-gray-900">{award.player_name}</p>
                                  {award.player_category && (
                                    <p className="text-xs text-slate-400 mt-1">{award.player_category}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Category Awards */}
                    {playerAwards.filter(a => a.award_category === 'category').length > 0 && (
                      <div>
                        <h5 className="text-lg font-semibold text-purple-800 mb-4 flex items-center gap-2">
                          <span>🏅</span> Category Awards
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {playerAwards
                            .filter(a => a.award_category === 'category')
                            .map((award) => (
                              <div key={award.id} className="bg-white/70 rounded-xl p-4 border border-purple-200 hover:shadow-md transition-all duration-300 relative group">
                                <button
                                  onClick={() => handleDeletePlayerAward(award.id)}
                                  className="absolute top-2 right-2 text-red-600 hover:text-red-800 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-red-50 rounded"
                                  title="Delete Award"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                                <div className="flex items-center gap-2 mb-2">
                                  {award.award_position === 1 && (
                                    <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  )}
                                  <h6 className="text-sm font-bold text-purple-700">{award.award_type} - {award.player_category}</h6>
                                </div>
                                <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                                  <p className="text-xs font-medium text-purple-600 mb-1">
                                    {award.award_position === 'Winner' || award.award_position === '1' || award.award_position === 1 ? 'Winner' : award.award_position === 'Runner Up' || award.award_position === '2' || award.award_position === 2 ? 'Runner-up' : award.award_position || 'Winner'}
                                  </p>
                                  <p className="text-base font-bold text-gray-900">{award.player_name}</p>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Enhanced Import/Export Tab */}
          {activeTab === 'import' && (
            <div className="p-6 lg:p-8">
              {/* Import/Export Header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-100 rounded-xl">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800">📥 Import & Export</h3>
                    <p className="text-xs text-slate-500 font-mono">Update historical season data with Excel files</p>
                  </div>
                </div>
              </div>

              <div className="max-w-6xl mx-auto">
                {!previewMode ? (
                  // Enhanced Upload Mode
                  <>
                    {/* Enhanced Instructions */}
                    <div className="console-card bg-white border border-slate-200/60 p-6 lg:p-8 mb-8 rounded-2xl shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="p-3 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl flex-shrink-0">
                          <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-850 mb-4">📋 How to Update Historical Season Data</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-slate-500">
                            <div className="bg-white/60 rounded-lg p-4 border border-blue-200/50">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                                <strong className="text-slate-850">Export Data</strong>
                              </div>
                              <p>Click "Export Excel" above to download the current season data as an Excel file.</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-4 border border-blue-200/50">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                                <strong className="text-slate-850">Make Changes</strong>
                              </div>
                              <p>Open the Excel file and update any data on the Teams, Players, Awards, or Matches sheets.</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-4 border border-blue-200/50">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                                <strong className="text-slate-850">Upload & Preview</strong>
                              </div>
                              <p>Save the Excel file and upload it below to preview and apply your changes.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Enhanced File Upload Area */}
                    <div className="console-card bg-white border border-slate-200/60 p-8 rounded-2xl overflow-hidden shadow-sm">
                      <div
                        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
                          dragOver 
                            ? 'border-amber-400 bg-amber-50/20 scale-102' 
                            : 'border-slate-200 hover:border-amber-400 hover:bg-amber-50/10'
                        }`}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                      >
                        {isImporting ? (
                          <div className="py-8">
                            <div className="w-16 h-16 mx-auto mb-6 relative">
                              <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-200 border-t-indigo-600"></div>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                            </div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-2">Processing Excel File</h3>
                            <p className="text-slate-500">Analyzing your data for preview...</p>
                            <p className="text-sm text-slate-400 mt-2">This may take a few moments</p>
                          </div>
                        ) : (
                          <div className="py-8">
                            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
                              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800 mb-3">Upload Your Excel File</h3>
                            <p className="text-slate-500 mb-6 max-w-md mx-auto">Drag and drop your updated Excel file here, or click the button below to browse your files</p>
                            <input
                              type="file"
                              accept=".xlsx,.xls"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleImportFromExcel(file);
                              }}
                              className="hidden"
                              id="excel-upload"
                            />
                            <label
                              htmlFor="excel-upload"
                              className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-medium"
                            >
                              <svg className="w-5 h-5 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              Select Excel File
                            </label>
                            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-400">
                              <div className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Supports .xlsx and .xls files
                              </div>
                              <div className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                Secure upload process
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Import Results */}
                    {importResults && (
                      <div className="mt-8 bg-green-50/50 rounded-xl p-6 border border-green-100">
                        <h3 className="text-lg font-bold text-green-800 mb-4">✅ Import Results</h3>
                        <p className="text-green-700 mb-4">{importResults.message}</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {/* Teams Results */}
                          <div className="bg-white rounded-lg p-4">
                            <h4 className="font-semibold text-purple-600 mb-2">Teams</h4>
                            <div className="text-sm space-y-1">
                              <p>Updated: <span className="font-medium">{importResults.stats.teams.updated}</span></p>
                              <p>Unchanged: <span className="font-medium">{importResults.stats.teams.unchanged}</span></p>
                              <p>Total: <span className="font-medium">{importResults.stats.teams.total}</span></p>
                            </div>
                            {importResults.stats.teams.errors.length > 0 && (
                              <div className="mt-2 text-xs text-red-600">
                                <p>Errors: {importResults.stats.teams.errors.length}</p>
                              </div>
                            )}
                          </div>

                          {/* Players Results */}
                          <div className="bg-white rounded-lg p-4">
                            <h4 className="font-semibold text-amber-600 mb-2">Players</h4>
                            <div className="text-sm space-y-1">
                              <p>Updated: <span className="font-medium">{importResults.stats.players.updated}</span></p>
                              <p>Unchanged: <span className="font-medium">{importResults.stats.players.unchanged}</span></p>
                              <p>Total: <span className="font-medium">{importResults.stats.players.total}</span></p>
                            </div>
                            {importResults.stats.players.errors.length > 0 && (
                              <div className="mt-2 text-xs text-red-600">
                                <p>Errors: {importResults.stats.players.errors.length}</p>
                              </div>
                            )}
                          </div>

                          {/* Awards Results */}
                          <div className="bg-white rounded-lg p-4">
                            <h4 className="font-semibold text-yellow-600 mb-2">Awards</h4>
                            <div className="text-sm space-y-1">
                              <p>Updated: <span className="font-medium">{importResults.stats.awards.updated}</span></p>
                              <p>Unchanged: <span className="font-medium">{importResults.stats.awards.unchanged}</span></p>
                              <p>Total: <span className="font-medium">{importResults.stats.awards.total}</span></p>
                            </div>
                            {importResults.stats.awards.errors.length > 0 && (
                              <div className="mt-2 text-xs text-red-600">
                                <p>Errors: {importResults.stats.awards.errors.length}</p>
                              </div>
                            )}
                          </div>

                          {/* Matches Results */}
                          <div className="bg-white rounded-lg p-4">
                            <h4 className="font-semibold text-amber-500 mb-2">Matches</h4>
                            <div className="text-sm space-y-1">
                              <p>Updated: <span className="font-medium">{importResults.stats.matches.updated}</span></p>
                              <p>Unchanged: <span className="font-medium">{importResults.stats.matches.unchanged}</span></p>
                              <p>Total: <span className="font-medium">{importResults.stats.matches.total}</span></p>
                            </div>
                            {importResults.stats.matches.errors.length > 0 && (
                              <div className="mt-2 text-xs text-red-600">
                                <p>Errors: {importResults.stats.matches.errors.length}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Error Details */}
                        {(importResults.stats.teams.errors.length > 0 || 
                          importResults.stats.players.errors.length > 0 || 
                          importResults.stats.awards.errors.length > 0 || 
                          importResults.stats.matches.errors.length > 0) && (
                          <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
                            <h4 className="font-semibold text-red-800 mb-2">Import Errors:</h4>
                            <div className="text-sm text-red-700 space-y-1">
                              {[...importResults.stats.teams.errors, 
                                ...importResults.stats.players.errors,
                                ...importResults.stats.awards.errors, 
                                ...importResults.stats.matches.errors].map((error, index) => (
                                <p key={index}>• {error}</p>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <p className="text-sm text-green-600 mt-4 font-medium">
                          ℹ️ The page will refresh in 3 seconds to show updated data.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  // Preview Mode
                  <>
                    {/* Preview Header */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-800">📋 Import Preview</h3>
                          <p className="text-xs text-slate-500 font-mono">Review and edit data before importing</p>
                        </div>
                        <button
                          onClick={handleCancelPreview}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
                        >
                          ← Back to Upload
                        </button>
                      </div>
                      
                      {/* Preview Summary */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="text-center bg-purple-50 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-purple-600">{previewTeams.length}</div>
                          <div className="text-xs text-purple-700">Teams</div>
                        </div>
                        <div className="text-center bg-blue-50 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-amber-600">{previewPlayers.length}</div>
                          <div className="text-xs text-slate-500">Players</div>
                        </div>
                        <div className="text-center bg-yellow-50 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-600">{previewAwards.length}</div>
                          <div className="text-xs text-yellow-700">Awards</div>
                        </div>
                        <div className="text-center bg-orange-50 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-amber-500">{previewMatches.length}</div>
                          <div className="text-xs text-orange-700">Matches</div>
                        </div>
                      </div>
                    </div>

                    {/* Errors and Warnings */}
                    {previewData && (previewData.errors.length > 0 || previewData.warnings.length > 0) && (
                      <div className="space-y-4 mb-6">
                        {/* Errors */}
                        {previewData.errors.length > 0 && (
                          <div className="bg-red-50/50 rounded-xl p-4 border border-red-100">
                            <div className="flex items-center mb-2">
                              <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-sm font-semibold text-red-800">{previewData.errors.length} Error(s) Found</span>
                            </div>
                            <div className="space-y-1 text-xs text-red-700 max-h-32 overflow-y-auto">
                              {previewData.errors.map((error, index) => (
                                <div key={index} className="flex items-start">
                                  <span className="text-red-500 mr-2">•</span>
                                  <span>{error}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Warnings */}
                        {previewData.warnings.length > 0 && (
                          <div className="bg-yellow-50/50 rounded-xl p-4 border border-yellow-100">
                            <div className="flex items-center mb-2">
                              <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
                              </svg>
                              <span className="text-sm font-semibold text-yellow-800">{previewData.warnings.length} Warning(s)</span>
                            </div>
                            <div className="space-y-1 text-xs text-yellow-700 max-h-32 overflow-y-auto">
                              {previewData.warnings.map((warning, index) => (
                                <div key={index} className="flex items-start">
                                  <span className="text-yellow-500 mr-2">•</span>
                                  <span>{warning}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Bulk Replace Tool */}
                    <div className="rounded-xl p-4 mb-6 bg-white/20 border border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-800">🔧 Bulk Fix Team Names</h3>
                        <button
                          onClick={() => setShowBulkReplace(!showBulkReplace)}
                          className="text-xs text-amber-600 hover:text-slate-850 underline"
                        >
                          {showBulkReplace ? 'Hide' : 'Show'} Tool
                        </button>
                      </div>
                      {showBulkReplace && (
                        <div className="space-y-3">
                          <p className="text-xs text-slate-500">Find and replace team names in all player records at once:</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Find team name:</label>
                              <input
                                type="text"
                                value={bulkFindText}
                                onChange={(e) => setBulkFindText(e.target.value)}
                                placeholder="e.g., Old Team Name"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Replace with:</label>
                              <input
                                type="text"
                                value={bulkReplaceText}
                                onChange={(e) => setBulkReplaceText(e.target.value)}
                                placeholder="e.g., New Team Name"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                          </div>
                          <button
                            onClick={handleBulkReplaceTeamNames}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            Replace All
                          </button>
                          <p className="text-xs text-slate-400 mt-2">
                            💡 This will update the team name for all players with matching team name (case-insensitive)
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* Validation Status */}
                    <div className={`rounded-xl p-4 mb-6 border ${
                      validationErrors.size > 0 
                        ? 'bg-red-50/50 border-red-100' 
                        : 'bg-blue-50/50 border-blue-100'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center">
                          <svg className={`w-5 h-5 mr-2 ${
                            validationErrors.size > 0 ? 'text-red-600' : 'text-amber-600'
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className={`text-sm ${
                            validationErrors.size > 0 ? 'text-red-800' : 'text-slate-850'
                          }`}>
                            {validationErrors.size > 0 
                              ? `${validationErrors.size} validation error(s) found. Please fix them before importing.`
                              : 'Click on any cell to edit data. Changes are automatically validated.'}
                          </span>
                        </div>
                        {validationErrors.size > 0 && (
                          <button
                            onClick={() => setShowValidationDetails(!showValidationDetails)}
                            className="text-xs text-red-600 hover:text-red-800 underline"
                          >
                            {showValidationDetails ? 'Hide' : 'Show'} Details
                          </button>
                        )}
                      </div>
                      {validationErrors.size > 0 && showValidationDetails && (
                        <div className="mt-4 pt-4 border-t border-red-200">
                          <h4 className="text-sm font-semibold text-red-800 mb-3">Validation Error Details:</h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {Array.from(validationErrors).map((errorKey, index) => {
                              const [type, indexStr, field] = errorKey.split('-');
                              const rowNum = parseInt(indexStr) + 1;
                              let errorMessage = '';
                              
                              if (type === 'team') {
                                errorMessage = `Team Row ${rowNum}: ${field.replace('_', ' ')} is required`;
                              } else if (type === 'player') {
                                if (field === 'total_matches') {
                                  const player = previewPlayers[parseInt(indexStr)];
                                  errorMessage = `Player Row ${rowNum} (${player?.name || 'Unknown'}): Win (${player?.win || 0}) + Draw (${player?.draw || 0}) + Loss (${player?.loss || 0}) = ${(player?.win || 0) + (player?.draw || 0) + (player?.loss || 0)} must equal Total Matches (${player?.total_matches || 0})`;
                                } else if (field === 'team') {
                                  errorMessage = `Player Row ${rowNum}: Team name "${previewPlayers[parseInt(indexStr)]?.team || ''}" must match an existing team`;
                                } else if (field === 'name') {
                                  errorMessage = `Player Row ${rowNum}: Player name is required`;
                                } else if (field === 'category') {
                                  errorMessage = `Player Row ${rowNum}: Category is required`;
                                } else if (['win', 'draw', 'loss'].includes(field)) {
                                  errorMessage = `Player Row ${rowNum}: ${field.charAt(0).toUpperCase() + field.slice(1)} cannot be negative`;
                                } else {
                                  errorMessage = `Player Row ${rowNum}: ${field.replace('_', ' ')} must be a valid number`;
                                }
                              } else if (type === 'award') {
                                errorMessage = `Award Row ${rowNum}: ${field.replace('_', ' ')} is required`;
                              } else if (type === 'match') {
                                errorMessage = `Match Row ${rowNum}: ${field.replace('_', ' ')} is required`;
                              } else {
                                errorMessage = errorKey;
                              }
                              
                              return (
                                <div key={index} className="flex items-start">
                                  <span className="text-red-500 mr-2 mt-0.5">•</span>
                                  <span className="text-xs text-red-700">{errorMessage}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Preview Tab Navigation */}
                    <div className="flex gap-2 border-b border-slate-200/60 pb-3 mb-6 overflow-x-auto">
                      {[
                        { id: 'teams', name: `Teams (${previewTeams.length})`, icon: '🏆' },
                        { id: 'players', name: `Players (${previewPlayers.length})`, icon: '👤' },
                        { id: 'awards', name: `Awards (${previewAwards.length})`, icon: '🏅' },
                        { id: 'matches', name: `Matches (${previewMatches.length})`, icon: '⚽' },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setPreviewTab(tab.id as any)}
                          className={`flex-shrink-0 px-4 py-2 text-xs font-mono font-bold rounded-xl transition-all ${
                            previewTab === tab.id
                              ? 'bg-slate-800 text-white shadow-sm border border-slate-800'
                              : 'bg-white text-slate-650 hover:text-slate-900 border border-slate-200/60 hover:bg-slate-50'
                          }`}
                        >
                          <span className="mr-2">{tab.icon}</span>
                          {tab.name}
                        </button>
                      ))}
                    </div>

                    {/* Preview Tables */}
                    <div className="console-card bg-white border border-slate-200/60 p-6 rounded-2xl shadow-sm mb-8 overflow-hidden">
                      {/* Teams Preview Table */}
                      {previewTab === 'teams' && previewTeams.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full">
                            <thead className="bg-white/10">
                              <tr>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Team Name</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Owner</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Link to Team</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Rank</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Points</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">MP</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">W</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">D</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">L</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">GF</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">GA</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">GD</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">%</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cup</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {previewTeams.map((team, index) => (
                                <tr key={index} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-2 py-3">
                                    <input
                                      type="text"
                                      value={team.team_name}
                                      onChange={(e) => handlePreviewTeamChange(index, 'team_name', e.target.value)}
                                      className={`w-24 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`team-${index}-team_name`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                      placeholder="Team name"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="text"
                                      value={team.owner_name || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'owner_name', e.target.value)}
                                      className={`w-24 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`team-${index}-owner_name`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                      placeholder="Owner name"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <select
                                      value={team.linked_team_id || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'linked_team_id', e.target.value)}
                                      className={`w-48 border outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 text-xs ${
                                        team.linked_team_id ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-300'
                                      }`}
                                    >
                                      <option value="">❌ Not Linked</option>
                                      {existingEntities?.teams && existingEntities.teams.length > 0 && (
                                        <>
                                          {existingEntities.teams
                                            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                            .map(existingTeam => (
                                              <option key={existingTeam.teamId} value={existingTeam.teamId}>
                                                {existingTeam.name} {existingTeam.owner_name ? `(${existingTeam.owner_name})` : ''}
                                              </option>
                                            ))}
                                        </>
                                      )}
                                    </select>
                                    {team.linked_team_id && (
                                      <div className="text-xs text-green-600 mt-1 font-medium">
                                        ✅ Linked
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={team.rank || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'rank', parseInt(e.target.value) || 0)}
                                      className={`w-12 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs`}
                                      placeholder="Rank"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={team.p || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'p', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-14 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs`}
                                      placeholder="Points"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={team.mp || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'mp', parseInt(e.target.value) || 0)}
                                      className={`w-12 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs`}
                                      placeholder="MP"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={team.w || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'w', parseInt(e.target.value) || 0)}
                                      className={`w-12 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs`}
                                      placeholder="W"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={team.d || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'd', parseInt(e.target.value) || 0)}
                                      className={`w-12 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs`}
                                      placeholder="D"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={team.l || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'l', parseInt(e.target.value) || 0)}
                                      className={`w-12 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs`}
                                      placeholder="L"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={team.f || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'f', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-14 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs`}
                                      placeholder="GF"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={team.a || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'a', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-14 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs`}
                                      placeholder="GA"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={team.gd || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'gd', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-14 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs`}
                                      placeholder="GD"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={team.percentage || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'percentage', parseFloat(e.target.value) || 0)}
                                      step="0.01"
                                      className={`w-14 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs`}
                                      placeholder="%"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="text"
                                      value={team.cup || ''}
                                      onChange={(e) => handlePreviewTeamChange(index, 'cup', e.target.value)}
                                      className={`w-16 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs`}
                                      placeholder="Cup"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePreviewTeam(index)}
                                      className="text-red-600 hover:text-red-800 p-1"
                                      title="Remove from import"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Players Preview Table */}
                      {previewTab === 'players' && previewPlayers.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full">
                            <thead className="bg-slate-50 border-b border-slate-100">
                              <tr>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Team</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Goals</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">G/Game</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Conceded</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">C/Game</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Net Goals</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Clean</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Points</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">W</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">D</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">L</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Total M</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Total P</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category Trophies</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Individual Trophies</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {previewPlayers.map((player, index) => (
                                <tr key={index} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-2 py-3">
                                    <input
                                      type="text"
                                      value={player.name}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'name', e.target.value)}
                                      className={`w-20 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-name`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                      placeholder="Name"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="text"
                                      value={player.team}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'team', e.target.value)}
                                      className={`w-20 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-team`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                      placeholder="Team"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="text"
                                      value={player.category}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'category', e.target.value)}
                                      className={`w-20 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-category`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                      placeholder="Category"
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.goals_scored}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'goals_scored', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-16 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-goals_scored`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.goals_per_game}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'goals_per_game', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-16 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-goals_per_game`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.goals_conceded}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'goals_conceded', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-16 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-goals_conceded`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.conceded_per_game}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'conceded_per_game', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-16 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-conceded_per_game`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.net_goals}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'net_goals', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-16 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-net_goals`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.cleansheets}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'cleansheets', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-16 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-cleansheets`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.points}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'points', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-16 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-points`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.win}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'win', parseInt(e.target.value) || 0)}
                                      className={`w-14 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-win`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.draw}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'draw', parseInt(e.target.value) || 0)}
                                      className={`w-14 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-draw`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.loss}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'loss', parseInt(e.target.value) || 0)}
                                      className={`w-14 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-loss`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.total_matches}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'total_matches', parseInt(e.target.value) || 0)}
                                      className={`w-16 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-total_matches`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <input
                                      type="number"
                                      value={player.total_points}
                                      onChange={(e) => handlePreviewPlayerChange(index, 'total_points', parseFloat(e.target.value) || 0)}
                                      step="0.1"
                                      className={`w-16 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-1 py-1 text-xs ${
                                        validationErrors.has(`player-${index}-total_points`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-2 py-3">
                                    <div className="min-w-[200px] max-w-[400px] text-xs">
                                      {player.category_trophies && player.category_trophies.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                          {player.category_trophies.map((trophy, idx) => (
                                            <span key={idx} className="inline-block bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs whitespace-nowrap">
                                              {trophy}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400">None</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-3">
                                    <div className="min-w-[200px] max-w-[400px] text-xs">
                                      {player.individual_trophies && player.individual_trophies.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                          {player.individual_trophies.map((trophy, idx) => (
                                            <span key={idx} className="inline-block bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs whitespace-nowrap">
                                              {trophy}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400">None</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-3">
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePreviewPlayer(index)}
                                      className="text-red-600 hover:text-red-800 p-1"
                                      title="Remove from import"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Awards Preview Table */}
                      {previewTab === 'awards' && previewAwards.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full">
                            <thead className="bg-slate-50 border-b border-slate-100">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Award Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Winner Team</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Winner Player</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {previewAwards.map((award, index) => (
                                <tr key={index} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3">
                                    <input
                                      type="text"
                                      value={award.award_name}
                                      onChange={(e) => handlePreviewAwardChange(index, 'award_name', e.target.value)}
                                      className={`w-full bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-2 py-1 ${
                                        validationErrors.has(`award-${index}-award_name`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                      placeholder="Award name"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <input
                                      type="text"
                                      value={award.award_category}
                                      onChange={(e) => handlePreviewAwardChange(index, 'award_category', e.target.value)}
                                      className={`w-full bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-2 py-1 ${
                                        validationErrors.has(`award-${index}-award_category`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                      placeholder="Category"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <input
                                      type="text"
                                      value={award.winner_team || ''}
                                      onChange={(e) => handlePreviewAwardChange(index, 'winner_team', e.target.value)}
                                      className={`w-full bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-2 py-1 ${
                                        validationErrors.has(`award-${index}-winner_team`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                      placeholder="Winner team"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <input
                                      type="text"
                                      value={award.winner_player || ''}
                                      onChange={(e) => handlePreviewAwardChange(index, 'winner_player', e.target.value)}
                                      className="w-full bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-2 py-1"
                                      placeholder="Winner player"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <input
                                      type="text"
                                      value={award.description || ''}
                                      onChange={(e) => handlePreviewAwardChange(index, 'description', e.target.value)}
                                      className="w-full bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-2 py-1"
                                      placeholder="Description"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePreviewAward(index)}
                                      className="text-red-600 hover:text-red-800 p-1"
                                      title="Remove from import"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Matches Preview Table */}
                      {previewTab === 'matches' && previewMatches.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full">
                            <thead className="bg-slate-50 border-b border-slate-100">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Match Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Home Team</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Away Team</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Home Score</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Away Score</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Match Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {previewMatches.map((match, index) => (
                                <tr key={index} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3">
                                    <input
                                      type="text"
                                      value={match.match_date}
                                      onChange={(e) => handlePreviewMatchChange(index, 'match_date', e.target.value)}
                                      className={`w-full bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-2 py-1 ${
                                        validationErrors.has(`match-${index}-match_date`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                      placeholder="Match date"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <input
                                      type="text"
                                      value={match.home_team}
                                      onChange={(e) => handlePreviewMatchChange(index, 'home_team', e.target.value)}
                                      className={`w-full bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-2 py-1 ${
                                        validationErrors.has(`match-${index}-home_team`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                      placeholder="Home team"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <input
                                      type="text"
                                      value={match.away_team}
                                      onChange={(e) => handlePreviewMatchChange(index, 'away_team', e.target.value)}
                                      className={`w-full bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-2 py-1 ${
                                        validationErrors.has(`match-${index}-away_team`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                      placeholder="Away team"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <input
                                      type="number"
                                      value={match.home_score}
                                      onChange={(e) => handlePreviewMatchChange(index, 'home_score', parseInt(e.target.value) || 0)}
                                      className={`w-20 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-2 py-1 ${
                                        validationErrors.has(`match-${index}-home_score`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <input
                                      type="number"
                                      value={match.away_score}
                                      onChange={(e) => handlePreviewMatchChange(index, 'away_score', parseInt(e.target.value) || 0)}
                                      className={`w-20 bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-2 py-1 ${
                                        validationErrors.has(`match-${index}-away_score`) ? 'border-red-500 bg-red-50' : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <input
                                      type="text"
                                      value={match.match_type || ''}
                                      onChange={(e) => handlePreviewMatchChange(index, 'match_type', e.target.value)}
                                      className="w-full bg-transparent border-none outline-none focus:bg-white/50 focus:border focus:border-amber-200 rounded px-2 py-1"
                                      placeholder="Match type"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePreviewMatch(index)}
                                      className="text-red-600 hover:text-red-800 p-1"
                                      title="Remove from import"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Empty State */}
                      {((previewTab === 'teams' && previewTeams.length === 0) ||
                        (previewTab === 'players' && previewPlayers.length === 0) ||
                        (previewTab === 'awards' && previewAwards.length === 0) ||
                        (previewTab === 'matches' && previewMatches.length === 0)) && (
                        <div className="px-8 py-16 text-center">
                          <p className="text-slate-400">No {previewTab} data found in the uploaded file.</p>
                        </div>
                      )}
                    </div>

                    {/* Import Actions */}
                    <div className="mt-6 bg-white/10 rounded-xl p-6 border border-slate-200">
                      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-800 mb-1">Ready to Import</h3>
                          <p className="text-xs text-slate-500 font-mono">Review your changes and start the import process</p>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={validatePreviewData}
                            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Validate All
                          </button>
                          <button
                            onClick={handleFinalImport}
                            disabled={importing || validationErrors.size > 0}
                            className="inline-flex items-center px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-mono font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {importing ? (
                              <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Importing...
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                                Start Import
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
