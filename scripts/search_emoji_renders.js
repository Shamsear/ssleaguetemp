const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/dashboard/committee/team-management/tournament/page.tsx');

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  console.log("=== Scanning for emoji usage ===");
  lines.forEach((line, idx) => {
    if (line.includes('.emoji') || line.includes('["emoji"]') || line.includes("['emoji']")) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
} catch (error) {
  console.error("Error:", error);
}
