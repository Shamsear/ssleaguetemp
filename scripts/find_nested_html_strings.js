const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/dashboard/committee/team-management/tournament/page.tsx');

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  console.log("=== Scanning tournament page for string-wrapped tags ===");

  // Regular expression to match single or double quoted strings containing JSX elements/icons
  const regex = /(['"`])\s*<[A-Za-z]+[^>]*\/?>.*?\1/;

  lines.forEach((line, idx) => {
    if (regex.test(line)) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
  
} catch (error) {
  console.error("Error reading file:", error);
}
