const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../app/api/realplayers/revert-fixture-stats/route.ts');
if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf8');
  console.log("=== Revert Fixture Stats Route ===");
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('player_seasons') || line.includes('realplayerstats') || line.includes('UPDATE') || line.includes('SELECT')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
}
