const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/dashboard/committee/team-management/tournament/page.tsx');

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  console.log("=== Scanning tournament page for tabs and selector states ===");

  // Find activeTab, selectedTournament, selectedRound state declarations
  lines.forEach((line, idx) => {
    if (line.includes('useState') && (line.includes('Tab') || line.includes('Round') || line.includes('Tournament'))) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });

  // Find where tab buttons are rendered
  console.log("\n=== Scanning for Tab Buttons ===");
  lines.forEach((line, idx) => {
    if (line.includes('setActiveTab') || line.includes('activeTab ===')) {
      if (idx > 1600 && idx < 2000) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
      }
    }
  });
} catch (error) {
  console.error("Error:", error);
}
