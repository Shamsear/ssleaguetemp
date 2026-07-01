const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../app/api/realplayers/revert-fixture-points/route.ts');
if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf8');
  console.log("Includes player_seasons?", content.includes('player_seasons'));
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('player_seasons') || line.includes('realplayerstats') || line.includes('UPDATE')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
}
