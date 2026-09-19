const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
});

const { neon } = require('@neondatabase/serverless');
const tournamentDbUrl = process.env.NEON_TOURNAMENT_DB_URL || process.env.FANTASY_DATABASE_URL;
const sql = neon(tournamentDbUrl);

async function updateAndVerify() {
  console.log('--- Updating Round 12 deadline to give full time for result entry ---');
  // Update result_entry_deadline_time to '23:59' (or offset 3) so teams have adequate time
  await sql`
    UPDATE round_deadlines
    SET result_entry_deadline_time = '23:59',
        result_entry_deadline_day_offset = 3
    WHERE tournament_id = 'SSPSLS18L' AND round_number = 12
  `;

  const updated = await sql`
    SELECT * FROM round_deadlines WHERE tournament_id = 'SSPSLS18L' AND round_number = 12
  `;
  console.log('Updated Round 12 deadline:', updated);

  // Now simulate the phase calculation with the updated code
  const deadline = updated[0];
  let schedDateStr = '';
  if (typeof deadline.scheduled_date === 'string') {
    if (deadline.scheduled_date.includes('T')) {
      const d = new Date(deadline.scheduled_date);
      const ist = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
      schedDateStr = ist.toISOString().split('T')[0];
    } else {
      schedDateStr = deadline.scheduled_date.split('T')[0];
    }
  } else if (deadline.scheduled_date instanceof Date) {
    const ist = new Date(deadline.scheduled_date.getTime() + (5.5 * 60 * 60 * 1000));
    schedDateStr = ist.toISOString().split('T')[0];
  }

  const homeDeadline = new Date(`${schedDateStr}T${deadline.home_fixture_deadline_time || '17:00'}:00+05:30`);
  const awayDeadline = new Date(`${schedDateStr}T${deadline.away_fixture_deadline_time || '17:00'}:00+05:30`);

  const resultDate = new Date(schedDateStr);
  resultDate.setDate(resultDate.getDate() + (deadline.result_entry_deadline_day_offset || 2));
  const resultDateStr = resultDate.toISOString().split('T')[0];
  const resultDeadline = new Date(`${resultDateStr}T${deadline.result_entry_deadline_time || '00:30'}:00+05:30`);

  const now = new Date();
  console.log('Current UTC:', now.toISOString());
  console.log('Parsed schedDateStr (IST):', schedDateStr);
  console.log('Home deadline:', homeDeadline.toISOString());
  console.log('Away deadline:', awayDeadline.toISOString());
  console.log('Result deadline:', resultDeadline.toISOString());
  console.log('Is now < homeDeadline?', now < homeDeadline);
  console.log('Is now < awayDeadline?', now < awayDeadline);
  console.log('Is now < resultDeadline?', now < resultDeadline);

  let phase = 'closed';
  if (now < homeDeadline) {
    phase = 'home_fixture';
  } else if (now < awayDeadline) {
    phase = 'fixture_entry';
  } else if (now < resultDeadline) {
    phase = 'result_entry';
  }
  console.log('Calculated Phase:', phase);
}

updateAndVerify().catch(console.error);
