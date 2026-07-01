const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '../app/dashboard/committee/real-players/page.tsx'),
  path.join(__dirname, '../app/teams/[id]/page.tsx')
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`=== ${path.basename(file)} ===`);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('16') || line.includes('isModern')) {
        console.log(`  Line ${idx + 1}: ${line.trim()}`);
      }
    });
  }
});
