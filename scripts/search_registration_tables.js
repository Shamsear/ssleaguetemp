const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../app/api/register/player/confirm/route.ts');
if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf8');
  console.log("=== Registration Confirm Route Tables ===");
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('player_seasons') || line.includes('realplayerstats') || line.includes('INSERT') || line.includes('INTO')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
} else {
  console.log("File not found");
}
