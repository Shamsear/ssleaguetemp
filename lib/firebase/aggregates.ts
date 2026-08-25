import { adminDb } from './admin';
import { TeamData } from '@/types/team';
import { FootballPlayerData } from '@/types/footballPlayer';

/**
 * Aggregated data structures for efficient caching
 */

export interface TeamSummary {
  id: string;
  team_id: string;
  team_name: string;
  team_code: string;
  owner_name: string;
  balance: number;
  players_count: number;
  stats: {
    matches_played: number;
    matches_won: number;
    matches_drawn: number;
    matches_lost: number;
    points: number;
    goal_difference: number;
  };
  logo: string | null;
  logo_url: string | null;
  season_id: string;
  logo_position_x_circle?: number;
  logo_position_y_circle?: number;
  logo_scale_circle?: number;
  logo_position_x_square?: number;
  logo_position_y_square?: number;
  logo_scale_square?: number;
}

export interface PlayerSummary {
  id: string;
  name: string;
  primary_position: string;
  team_id: string | null;
  team_name: string | null;
  team_code: string | null;
  base_price: number;
  sold_price: number | null;
  is_sold: boolean;
  season_id: string;
  stats: {
    matches_played: number;
    goals: number;
    assists: number;
    yellow_cards: number;
    red_cards: number;
  };
  player_image: string | null;
  card_type: string;
}

export interface LeagueStatsSummary {
  totalTeams: number;
  totalPlayers: number;
  soldPlayers: number;
  totalSpent: number;
  averagePlayerPrice: number;
  topScorers: Array<{ id: string; name: string; goals: number; team_name: string | null }>;
  standings: TeamSummary[];
  lastUpdated: string;
}

/**
 * Build aggregated teams summary
 * This reduces 20+ individual team reads to 1 aggregated document
 */
export async function buildTeamsSummary(seasonId?: string): Promise<TeamSummary[]> {
  try {
    const teamsMap = new Map<string, TeamSummary>();
    
    // Query team_seasons collection (for current/active seasons)
    let teamSeasonsQuery = adminDb.collection('team_seasons');
    if (seasonId) {
      teamSeasonsQuery = teamSeasonsQuery.where('season_id', '==', seasonId) as any;
    }
    const teamSeasonsSnapshot = await teamSeasonsQuery.get();
    
    teamSeasonsSnapshot.forEach((doc) => {
      const data = doc.data();
      const baseId = doc.id.split('_')[0];
      const logoUrl = data.logo_url || data.team_logo || data.logo || null;
      
      teamsMap.set(baseId, {
        id: baseId,
        team_id: baseId,
        team_name: data.team_name || 'Unknown Team',
        team_code: data.team_code || data.team_name?.substring(0, 3).toUpperCase() || 'UNK',
        owner_name: data.username || data.owner_name || '',
        balance: data.budget || 0,
        players_count: data.players_count || 0,
        stats: {
          matches_played: data.stats?.matches_played || 0,
          matches_won: data.stats?.matches_won || 0,
          matches_drawn: data.stats?.matches_drawn || 0,
          matches_lost: data.stats?.matches_lost || 0,
          points: data.stats?.points || 0,
          goal_difference: data.stats?.goal_difference || 0,
        },
        logo: logoUrl,
        logo_url: logoUrl,
        season_id: data.season_id || seasonId || '',
        logo_position_x_circle: data.logo_position_x_circle,
        logo_position_y_circle: data.logo_position_y_circle,
        logo_scale_circle: data.logo_scale_circle,
        logo_position_x_square: data.logo_position_x_square,
        logo_position_y_square: data.logo_position_y_square,
        logo_scale_square: data.logo_scale_square,
      });
    });
    
    // Also query teams collection (for historical seasons and general team data)
    let teamsQuery = adminDb.collection('teams');
    const teamsSnapshot = await teamsQuery.get();
    
    teamsSnapshot.forEach((doc) => {
      const data = doc.data();
      const baseId = doc.id;
      
      // If filtering by season, check if team has data for this season
      if (seasonId) {
        const seasonStats = data.performance_history?.[seasonId];
        if (!seasonStats) return; // Skip teams without data for this season
        
        if (!teamsMap.has(baseId)) {
          const logoUrl = data.logo_url || data.team_logo || data.logo || null;
          teamsMap.set(baseId, {
            id: baseId,
            team_id: baseId,
            team_name: data.team_name || 'Unknown Team',
            team_code: data.team_code || data.team_name?.substring(0, 3).toUpperCase() || 'UNK',
            owner_name: data.owner_name || '',
            balance: 0, // Historical teams don't have balance
            players_count: seasonStats.players_count || 0,
            stats: {
              matches_played: seasonStats.season_stats?.matches_played || 0,
              matches_won: seasonStats.season_stats?.matches_won || 0,
              matches_drawn: seasonStats.season_stats?.matches_drawn || 0,
              matches_lost: seasonStats.season_stats?.matches_lost || 0,
              points: seasonStats.season_stats?.total_points || 0,
              goal_difference: seasonStats.season_stats?.goal_difference || (seasonStats.season_stats?.total_goals || 0) - (seasonStats.season_stats?.total_conceded || 0),
            },
            logo: logoUrl,
            logo_url: logoUrl,
            season_id: seasonId,
            logo_position_x_circle: data.logo_position_x_circle,
            logo_position_y_circle: data.logo_position_y_circle,
            logo_scale_circle: data.logo_scale_circle,
            logo_position_x_square: data.logo_position_x_square,
            logo_position_y_square: data.logo_position_y_square,
            logo_scale_square: data.logo_scale_square,
          });
        } else {
          // If the team season was already populated from teamSeasonsSnapshot,
          // merge the logo positioning adjustments from the base team document.
          const existing = teamsMap.get(baseId);
          if (existing) {
            existing.logo_position_x_circle = data.logo_position_x_circle;
            existing.logo_position_y_circle = data.logo_position_y_circle;
            existing.logo_scale_circle = data.logo_scale_circle;
            existing.logo_position_x_square = data.logo_position_x_square;
            existing.logo_position_y_square = data.logo_position_y_square;
            existing.logo_scale_square = data.logo_scale_square;
          }
        }
      } else {
        // If no season filter, include all teams with their latest stats
        const logoUrl = data.logo_url || data.team_logo || data.logo || null;
        
        const existing = teamsMap.get(baseId);
        if (existing) {
          if (!existing.owner_name) existing.owner_name = data.owner_name || '';
          if (!existing.logo_url) {
            existing.logo = logoUrl;
            existing.logo_url = logoUrl;
          }
          existing.logo_position_x_circle = data.logo_position_x_circle;
          existing.logo_position_y_circle = data.logo_position_y_circle;
          existing.logo_scale_circle = data.logo_scale_circle;
          existing.logo_position_x_square = data.logo_position_x_square;
          existing.logo_position_y_square = data.logo_position_y_square;
          existing.logo_scale_square = data.logo_scale_square;
        } else {
          teamsMap.set(baseId, {
            id: baseId,
            team_id: baseId,
            team_name: data.team_name || 'Unknown Team',
            team_code: data.team_code || data.team_name?.substring(0, 3).toUpperCase() || 'UNK',
            owner_name: data.owner_name || '',
            balance: 0,
            players_count: 0,
            stats: {
              matches_played: 0,
              matches_won: 0,
              matches_drawn: 0,
              matches_lost: 0,
              points: 0,
              goal_difference: 0,
            },
            logo: logoUrl,
            logo_url: logoUrl,
            season_id: '',
            logo_position_x_circle: data.logo_position_x_circle,
            logo_position_y_circle: data.logo_position_y_circle,
            logo_scale_circle: data.logo_scale_circle,
            logo_position_x_square: data.logo_position_x_square,
            logo_position_y_square: data.logo_position_y_square,
            logo_scale_square: data.logo_scale_square,
          });
        }
      }
    });
    
    const teamsList = Array.from(teamsMap.values());
    
    // Sort by points descending for standings
    teamsList.sort((a, b) => {
      if (b.stats.points !== a.stats.points) {
        return b.stats.points - a.stats.points;
      }
      return b.stats.goal_difference - a.stats.goal_difference;
    });
    
    return teamsList;
  } catch (error) {
    console.error('Error building teams summary:', error);
    throw error;
  }
}

/**
 * Build aggregated players summary
 * This reduces 120+ individual player reads to 1 aggregated document
 */
export async function buildPlayersSummary(seasonId?: string): Promise<PlayerSummary[]> {
  try {
    const { getTournamentDb } = await import('@/lib/neon/tournament-config');
    const sql = getTournamentDb();
    
    let rows: any[];
    if (seasonId) {
      rows = await sql`SELECT * FROM footballplayers WHERE season_id = ${seasonId}`;
    } else {
      rows = await sql`SELECT * FROM footballplayers`;
    }
    
    const players: PlayerSummary[] = [];
    for (const data of rows) {
      players.push({
        id: data.id || data.player_id,
        name: data.name || 'Unknown',
        primary_position: data.primary_position || 'Unknown',
        team_id: data.team_id || null,
        team_name: data.team_name || null,
        team_code: data.team_code || null,
        base_price: data.base_price || 0,
        sold_price: data.sold_price || null,
        is_sold: data.is_sold || false,
        season_id: data.season_id || '',
        stats: {
          matches_played: data.matches_played || 0,
          goals: data.goals || 0,
          assists: data.assists || 0,
          yellow_cards: data.yellow_cards || 0,
          red_cards: data.red_cards || 0,
        },
        player_image: data.player_image || null,
        card_type: data.card_type || 'Gold',
      });
    }
    
    return players;
  } catch (error) {
    console.error('Error building players summary:', error);
    throw error;
  }
}

/**
 * Build comprehensive league statistics
 * This aggregates all key stats into one object
 */
export async function buildLeagueStats(seasonId?: string): Promise<LeagueStatsSummary> {
  try {
    const [teams, players] = await Promise.all([
      buildTeamsSummary(seasonId),
      buildPlayersSummary(seasonId),
    ]);
    
    const soldPlayers = players.filter(p => p.is_sold);
    const totalSpent = soldPlayers.reduce((sum, p) => sum + (p.sold_price || 0), 0);
    
    // Get top scorers (sorted by goals)
    const topScorers = players
      .filter(p => p.stats.goals > 0)
      .sort((a, b) => b.stats.goals - a.stats.goals)
      .slice(0, 10)
      .map(p => ({
        id: p.id,
        name: p.name,
        goals: p.stats.goals,
        team_name: p.team_name,
      }));
    
    return {
      totalTeams: teams.length,
      totalPlayers: players.length,
      soldPlayers: soldPlayers.length,
      totalSpent,
      averagePlayerPrice: soldPlayers.length > 0 ? totalSpent / soldPlayers.length : 0,
      topScorers,
      standings: teams, // Already sorted by points
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error building league stats:', error);
    throw error;
  }
}

/**
 * Store aggregated data in Firestore for quick retrieval
 * Optional: Use this to pre-build aggregates that can be fetched with a single read
 */
export async function storeAggregatedData(seasonId: string): Promise<void> {
  try {
    const [teams, players, stats] = await Promise.all([
      buildTeamsSummary(seasonId),
      buildPlayersSummary(seasonId),
      buildLeagueStats(seasonId),
    ]);
    
    const aggregatesRef = adminDb.collection('aggregates').doc(`season_${seasonId}`);
    
    await aggregatesRef.set({
      teams,
      players,
      stats,
      updated_at: new Date().toISOString(),
    });
    
    console.log(`Aggregated data stored for season ${seasonId}`);
  } catch (error) {
    console.error('Error storing aggregated data:', error);
    throw error;
  }
}

/**
 * Retrieve aggregated data from Firestore
 * This is a fallback option - reduces 260 reads to 1 read
 */
export async function getAggregatedData(seasonId: string) {
  try {
    const aggregatesRef = adminDb.collection('aggregates').doc(`season_${seasonId}`);
    const doc = await aggregatesRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    return doc.data();
  } catch (error) {
    console.error('Error getting aggregated data:', error);
    throw error;
  }
}
