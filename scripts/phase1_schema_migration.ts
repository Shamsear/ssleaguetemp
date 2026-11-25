import { getTournamentDb } from '../lib/neon/tournament-config';

async function migrate() {
  const sql = getTournamentDb();
  console.log('Connecting to Tournament DB...');

  // 1. Add columns to matchups table
  console.log('Checking and adding columns to matchups...');
  await sql`
    ALTER TABLE matchups
      ADD COLUMN IF NOT EXISTS match_mode VARCHAR(30) DEFAULT 'individual',
      ADD COLUMN IF NOT EXISTS home_player_ids TEXT[],
      ADD COLUMN IF NOT EXISTS home_player_names TEXT[],
      ADD COLUMN IF NOT EXISTS away_player_ids TEXT[],
      ADD COLUMN IF NOT EXISTS away_player_names TEXT[],
      ADD COLUMN IF NOT EXISTS points_awarded_home INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS points_awarded_away INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS bonus_awarded_home INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS bonus_awarded_away INT DEFAULT 0;
  `;
  console.log('✅ matchups columns updated successfully');

  // 2. Add columns to tournament_settings table
  console.log('Checking and adding columns to tournament_settings...');
  await sql`
    ALTER TABLE tournament_settings
      ADD COLUMN IF NOT EXISTS matchday_format VARCHAR(50) DEFAULT 'standard',
      ADD COLUMN IF NOT EXISTS clean_sweep_bonus INT DEFAULT 1,
      ADD COLUMN IF NOT EXISTS points_as_gd BOOLEAN DEFAULT false;
  `;
  console.log('✅ tournament_settings columns updated successfully');

  // 3. Add columns to fixtures table
  console.log('Checking and adding columns to fixtures...');
  await sql`
    ALTER TABLE fixtures
      ADD COLUMN IF NOT EXISTS home_points_earned INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS away_points_earned INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS home_points_difference INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS away_points_difference INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS clean_sweep_winner VARCHAR(50);
  `;
  console.log('✅ fixtures columns updated successfully');

  // 4. Check columns in matchups
  const cols = await sql`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'matchups' 
      AND column_name IN ('match_mode', 'home_player_ids', 'home_player_names', 'away_player_ids', 'away_player_names', 'points_awarded_home', 'points_awarded_away')
    ORDER BY column_name;
  `;
  console.log('Verified matchups new columns:', cols);
}

migrate()
  .then(() => {
    console.log('Migration finished successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
