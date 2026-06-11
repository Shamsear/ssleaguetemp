const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, files);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
      files.push(filePath);
    }
  }
  return files;
}

const apiFiles = walk('app/api');
apiFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('season_id') && content.includes('sql`')) {
    // Find lines with season_id inside SQL template literals
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('season_id') && (line.includes('=') || line.includes('IN')) && !line.includes('LOWER(')) {
        console.log(`${file}:${idx+1}: ${line.trim()}`);
      }
    });
  }
});
