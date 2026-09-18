const fs = require("fs");
const path = require("path");

const envContent = fs.readFileSync(path.join(__dirname, ".env.local"), "utf-8");
envContent.split("\n").forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const idx = trimmed.indexOf("=");
    if (idx !== -1) {
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  }
});

const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.NEON_TOURNAMENT_DB_URL);

async function checkRajesh() {
  const seasonId = "SSPSLS18";
  const roundNumber = 12;
  console.log("=".repeat(80));
  console.log("S18 Round " + roundNumber + " - Legends / Rajesh sub investigation");
  console.log("=".repeat(80));

  const fixtures = await sql`
    SELECT id, home_team_id, away_team_id,
           home_team_name, away_team_name,
           round_number, leg, status
    FROM fixtures
    WHERE season_id = ${seasonId}
      AND round_number = ${roundNumber}
    ORDER BY leg ASC, id ASC
  `;

  if (fixtures.length === 0) { console.log("No fixtures found"); return; }

  console.log("\n" + fixtures.length + " fixture(s):");
  fixtures.forEach(f => console.log("  [" + f.id + "] leg=" + f.leg + " | " + (f.home_team_name||f.home_team_id) + " vs " + (f.away_team_name||f.away_team_id) + " | " + f.status));

  const legendsFix = fixtures.filter(f =>
    (f.home_team_name||"").toLowerCase().includes("legend") ||
    (f.away_team_name||"").toLowerCase().includes("legend")
  );
  const targets = legendsFix.length > 0 ? legendsFix : fixtures;
  console.log(legendsFix.length > 0 ? "\nLegends fixtures: " + legendsFix.length : "\nNo Legends found - checking all");

  for (const fixture of targets) {
    const homeTeam = fixture.home_team_name || fixture.home_team_id;
    const awayTeam = fixture.away_team_name || fixture.away_team_id;
    console.log("\n" + "-".repeat(70));
    console.log("Fixture " + fixture.id + " | " + homeTeam + " vs " + awayTeam + " | leg " + fixture.leg);

    console.log("\n[LINEUPS]");
    const lineups = await sql`
      SELECT team_id, starting_xi, substitutes, is_locked, is_valid
      FROM lineups
      WHERE fixture_id = ${fixture.id}
    `;
    if (lineups.length === 0) {
      console.log("  (none)");
    } else {
      lineups.forEach(l => {
        const label = l.team_id === fixture.home_team_id ? homeTeam + " (HOME)" : awayTeam + " (AWAY)";
        console.log("  " + label + " | locked=" + l.is_locked);
        const xi = l.starting_xi || [];
        const subs = l.substitutes || [];
        console.log("  Starting XI (" + xi.length + "):");
        xi.forEach((p, i) => {
          const raj = JSON.stringify(p).toLowerCase().includes("rajesh") || JSON.stringify(p).toLowerCase().includes("rajish") ? "  <-- RAJESH/RAJISH" : "";
          console.log("    " + (i+1) + ". " + JSON.stringify(p) + raj);
        });
        console.log("  Substitutes (" + subs.length + "):");
        subs.forEach((p, i) => {
          const raj = JSON.stringify(p).toLowerCase().includes("rajesh") || JSON.stringify(p).toLowerCase().includes("rajish") ? "  <-- RAJESH/RAJISH" : "";
          console.log("    " + (i+1) + ". " + JSON.stringify(p) + raj);
        });
      });
    }


    console.log("\n[MATCHUPS]");
    const matchups = await sql`
      SELECT position, home_player_name, away_player_name, status
      FROM matchups
      WHERE fixture_id = ${fixture.id}
      ORDER BY position ASC
    `;
    if (matchups.length === 0) {
      console.log("  (none)");
    } else {
      matchups.forEach(m => {
        const hR = (m.home_player_name||"").toLowerCase().includes("rajesh") ? " <--RAJESH" : "";
        const aR = (m.away_player_name||"").toLowerCase().includes("rajesh") ? " <--RAJESH" : "";
        console.log("  #" + m.position + ": [" + m.home_player_name + "]" + hR + " vs [" + m.away_player_name + "]" + aR + " | " + m.status);
      });
    }
  }
}

checkRajesh().catch(console.error);
