const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../app/api/fixtures/[fixtureId]/lineup/route.ts');
if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf8');
  console.log("=== Lineup route content ===");
  // Print lines with salary or star
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('salary') || line.includes('star') || line.includes('cap') || line.includes('limit') || line.includes('validate')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
} else {
  console.log("File not found");
}
