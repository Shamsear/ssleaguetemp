/**
 * Utility to enrich team-of-day awards with fixture/match information
 * Fetches opponent team, score, and match details from fixtures table (tournament DB)
 * Fetches team logos from Firebase team_seasons collection
 */

import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/firebase/admin';

export interface TeamAward {
  id: string;
  award_type: string;
  team_id: string;
  team_name: string;
  team_logo?: string;
  round_number: number;
  tournament_id: string;
  season_id: string;
  performance_stats?: {
    wins: number;
    draws: number;
    losses: number;
    goals_for: number;
    clean_sheet: boolean;
    goals_against: number;
    goal_difference: number;
  };
}

export interface EnrichedTeamAward extends TeamAward {
  home_team?: string;
  home_team_id?: string;
  home_team_logo?: string;
  home_score?: number;
  away_team?: string;
  away_team_id?: string;
  away_team_logo?: string;
  away_score?: number;
  fixture_id?: string;
  match_date?: string;
}

/**
 * Enrich a single team-of-day award with fixture information
 */
export async function enrichTeamAward(award: TeamAward): Promise<EnrichedTeamAward> {
  try {
    console.log('[enrichTeamAward] Starting enrichment for:', {
      team_id: award.team_id,
      team_name: award.team_name,
      season_id: award.season_id,
      round_number: award.round_number,
    });

    // Get tournament database connection
    const sql = getTournamentDb();

    // First, get team logo from Firebase team_seasons collection
    const teamSeasonId = `${award.team_id}_${award.season_id}`;
    let teamLogo = award.team_logo;
    
    try {
      console.log('[enrichTeamAward] Fetching team logo from Firebase:', teamSeasonId);
      const teamSeasonDoc = await adminDb.collection('team_seasons').doc(teamSeasonId).get();
      if (teamSeasonDoc.exists) {
        const teamSeasonData = teamSeasonDoc.data();
        teamLogo = teamSeasonData?.team_logo || teamLogo;
        console.log('[enrichTeamAward] Found team logo:', teamLogo);
      } else {
        console.warn('[enrichTeamAward] Team season document not found:', teamSeasonId);
      }
    } catch (fbError) {
      console.error(`[enrichTeamAward] Firebase error for ${teamSeasonId}:`, fbError);
    }

    // Find the fixture where this team played in the specified round
    console.log('[enrichTeamAward] Looking for fixture...');
    const fixtures = await sql`
      SELECT 
        f.id as fixture_id,
        f.home_team_id,
        f.away_team_id,
        f.home_team_name,
        f.away_team_name,
        f.home_score,
        f.away_score,
        f.match_day,
        COALESCE(f.played_date, f.scheduled_date) as match_date
      FROM fixtures f
      WHERE f.tournament_id = ${award.tournament_id}
        AND f.round_number = ${award.round_number}
        AND (f.home_team_id = ${award.team_id} OR f.away_team_id = ${award.team_id})
        AND f.status = 'completed'
      LIMIT 1
    `;

    if (fixtures.length === 0) {
      console.warn(`[enrichTeamAward] No fixture found for team ${award.team_name} in round ${award.round_number}`);
      return {
        ...award,
        team_logo: teamLogo,
      } as EnrichedTeamAward;
    }

    const fixture = fixtures[0];
    console.log('[enrichTeamAward] Found fixture:', {
      home_team: fixture.home_team_name,
      away_team: fixture.away_team_name,
      score: `${fixture.home_score}-${fixture.away_score}`,
    });

    // Get team logos from Firebase team_seasons for both home and away teams
    const homeTeamSeasonId = `${fixture.home_team_id}_${award.season_id}`;
    const awayTeamSeasonId = `${fixture.away_team_id}_${award.season_id}`;
    
    let homeTeamLogo = null;
    let awayTeamLogo = null;

    try {
      console.log('[enrichTeamAward] Fetching opponent logos from Firebase...');
      const [homeTeamSeasonDoc, awayTeamSeasonDoc] = await Promise.all([
        adminDb.collection('team_seasons').doc(homeTeamSeasonId).get(),
        adminDb.collection('team_seasons').doc(awayTeamSeasonId).get(),
      ]);

      if (homeTeamSeasonDoc.exists) {
        const homeTeamSeasonData = homeTeamSeasonDoc.data();
        homeTeamLogo = homeTeamSeasonData?.team_logo || null;
        console.log('[enrichTeamAward] Home team logo:', homeTeamLogo);
      } else {
        console.warn('[enrichTeamAward] Home team season not found:', homeTeamSeasonId);
      }

      if (awayTeamSeasonDoc.exists) {
        const awayTeamSeasonData = awayTeamSeasonDoc.data();
        awayTeamLogo = awayTeamSeasonData?.team_logo || null;
        console.log('[enrichTeamAward] Away team logo:', awayTeamLogo);
      } else {
        console.warn('[enrichTeamAward] Away team season not found:', awayTeamSeasonId);
      }
    } catch (fbError) {
      console.error('[enrichTeamAward] Firebase error fetching opponent logos:', fbError);
    }

    const enrichedAward = {
      ...award,
      team_logo: teamLogo,
      fixture_id: fixture.fixture_id,
      match_date: fixture.match_date,
      home_team: fixture.home_team_name,
      home_team_id: fixture.home_team_id,
      home_team_logo: homeTeamLogo,
      home_score: fixture.home_score,
      away_team: fixture.away_team_name,
      away_team_id: fixture.away_team_id,
      away_team_logo: awayTeamLogo,
      away_score: fixture.away_score,
    };

    console.log('[enrichTeamAward] Enrichment complete:', enrichedAward);
    return enrichedAward;
  } catch (error) {
    console.error('[enrichTeamAward] Error enriching team award:', error);
    return award as EnrichedTeamAward;
  }
}

/**
 * Enrich multiple team-of-day awards with fixture information
 */
export async function enrichTeamAwards(awards: TeamAward[]): Promise<EnrichedTeamAward[]> {
  const enrichedAwards = await Promise.all(
    awards.map(award => enrichTeamAward(award))
  );
  return enrichedAwards;
}

/**
 * Enrich Team of Week award with team logo from Firebase
 */
export async function enrichTeamOfWeekAward(award: any): Promise<any> {
  try {
    console.log('[enrichTeamOfWeekAward] Starting enrichment for:', {
      team_id: award.team_id,
      team_name: award.team_name,
      season_id: award.season_id,
      week_number: award.week_number,
    });

    // Get team logo from Firebase team_seasons collection
    const teamSeasonId = `${award.team_id}_${award.season_id}`;
    let teamLogo = award.team_logo;
    
    try {
      console.log('[enrichTeamOfWeekAward] Fetching team logo from Firebase:', teamSeasonId);
      const teamSeasonDoc = await adminDb.collection('team_seasons').doc(teamSeasonId).get();
      if (teamSeasonDoc.exists) {
        const teamSeasonData = teamSeasonDoc.data();
        teamLogo = teamSeasonData?.team_logo || teamLogo;
        console.log('[enrichTeamOfWeekAward] Found team logo:', teamLogo);
      } else {
        console.warn('[enrichTeamOfWeekAward] Team season document not found:', teamSeasonId);
      }
    } catch (fbError) {
      console.error(`[enrichTeamOfWeekAward] Firebase error for ${teamSeasonId}:`, fbError);
    }

    const enrichedAward = {
      ...award,
      team_logo: teamLogo,
    };

    console.log('[enrichTeamOfWeekAward] Enrichment complete:', enrichedAward);
    return enrichedAward;
  } catch (error) {
    console.error('[enrichTeamOfWeekAward] Error enriching team of week award:', error);
    return award;
  }
}

/**
 * Enrich multiple Team of Week awards
 */
export async function enrichTeamOfWeekAwards(awards: any[]): Promise<any[]> {
  const enrichedAwards = await Promise.all(
    awards.map(award => enrichTeamOfWeekAward(award))
  );
  return enrichedAwards;
}

/**
 * Get team-of-day awards with fixture information for a specific tournament/season
 */
export async function getEnrichedTeamOfDayAwards(
  tournamentId: string,
  seasonId: string
): Promise<EnrichedTeamAward[]> {
  try {
    // Get tournament database connection
    const sql = getTournamentDb();
    
    // Fetch TOD awards
    const awards = await sql`
      SELECT 
        a.*,
        t.name as team_name,
        t.logo_url as team_logo
      FROM awards a
      LEFT JOIN teams t ON a.team_id = t.id
      WHERE a.tournament_id = ${tournamentId}
        AND a.season_id = ${seasonId}
        AND a.award_type = 'TOD'
      ORDER BY a.round_number DESC
    `;

    // Enrich each award with fixture data
    const enrichedAwards = await enrichTeamAwards(awards as TeamAward[]);

    return enrichedAwards;
  } catch (error) {
    console.error('Error getting enriched team awards:', error);
    return [];
  }
}
