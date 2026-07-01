const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../app/api/fixtures/[fixtureId]/edit-result/route.ts');
if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('Rewards') || line.includes('rewards') || line.includes('budget') || line.includes('season')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
}
