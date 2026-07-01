const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../app/api/team/[teamId]/route.ts');
if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('16') || line.includes('isModern') || line.includes('season')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
}
