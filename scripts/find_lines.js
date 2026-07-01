const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../app/api/stats/players/route.ts');
if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('seasonNum === 16 || seasonNum === 17')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
}
