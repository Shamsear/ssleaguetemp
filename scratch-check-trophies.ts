import dotenv from 'dotenv';
import path from 'path';

// Load env variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function run() {
  try {
    const { adminDb } = await import('./lib/firebase/admin');
    const { getTournamentDb } = await import('./lib/neon/tournament-config');
    const sql = getTournamentDb();

    const teamId = 'SSPSLT0013'; // Psychoz

    // Fetch active seasons from Firebase
    const firebaseSeasons = await adminDb.collection('seasons').get();
    const activeSeasonIds = new Set();
    const seasonStatuses: Record<string, { is_active: boolean; status: string }> = {};

    firebaseSeasons.docs.forEach(doc => {
      const data = doc.data();
      seasonStatuses[doc.id] = {
        is_active: data.is_active === true,
        status: data.status
      };

      // Check if season has actually started
      let hasStarted = false;
      if (data.start_date) {
        const startDate = data.start_date.toDate ? data.start_date.toDate() : new Date(data.start_date);
        const now = new Date();
        hasStarted = startDate <= now;
      } else {
        hasStarted = data.status === 'completed' || data.status === 'active';
      }

      if (hasStarted) {
        activeSeasonIds.add(doc.id);
      }
    });

    console.log("activeSeasonIds:", Array.from(activeSeasonIds));

    // Fetch seasonStats
    const seasonStats = await sql`
      SELECT 
        team_id,
        MAX(team_name) as team_name,
        season_id,
        SUM(matches_played) as matches_played,
        SUM(wins) as wins,
        SUM(draws) as draws,
        SUM(losses) as losses,
        SUM(goals_for) as goals_for,
        SUM(goals_against) as goals_against,
        SUM(goal_difference) as goal_difference,
        SUM(points) as points,
        MAX(position) as position
      FROM teamstats
      WHERE team_id = ${teamId}
      GROUP BY team_id, season_id
      ORDER BY season_id DESC
    `;

    console.log("\nseasonStats results:");
    console.log(seasonStats);

    const seasons = [];
    for (const seasonData of seasonStats) {
      const seasonId = seasonData.season_id;

      if (!activeSeasonIds.has(seasonId)) {
        console.log(`Skipping future season ${seasonId}`);
        continue;
      }

      // Fetch trophies
      const neonTrophies = await sql`
        SELECT 
          id,
          trophy_name,
          trophy_type,
          position,
          trophy_position,
          notes
        FROM team_trophies
        WHERE team_id = ${teamId} AND season_id = ${seasonId}
        ORDER BY id DESC
      `;

      console.log(`Trophies for ${seasonId}:`, neonTrophies);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
