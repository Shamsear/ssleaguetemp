const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../components/FixtureLineup.tsx');
if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf8');
  console.log("=== FixtureLineup.tsx occurrences ===");
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('star_rating') || line.includes('salary') || line.includes('limit') || line.includes('cap') || line.includes('starRating')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
} else {
  console.log("File not found");
}
