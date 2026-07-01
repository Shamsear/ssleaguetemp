const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '../lib/finalize-round.ts'),
  path.join(__dirname, '../app/api/fantasy/round-complete/route.ts')
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`=== ${path.basename(file)} ===`);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('salary') || line.includes('contract') || line.includes('deduct') || line.includes('cost') || line.includes('budget')) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
      }
    });
  } else {
    console.log(`File not found: ${path.basename(file)}`);
  }
});
