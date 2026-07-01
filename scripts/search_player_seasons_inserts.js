const fs = require('fs');
const path = require('path');

const excludeDirs = ['node_modules', '.next', '.git'];

function walkDir(currentDir) {
  let results = [];
  const list = fs.readdirSync(currentDir);
  
  list.forEach(file => {
    const filePath = path.join(currentDir, file);
    const stat = fs.statSync(filePath);
    
    if (stat && stat.isDirectory()) {
      if (!excludeDirs.includes(file)) {
        results = results.concat(walkDir(filePath));
      }
    } else {
      if (filePath.endsWith('.tsx') || filePath.endsWith('.ts') || filePath.endsWith('.js')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

try {
  const rootDir = path.join(__dirname, '..');
  const files = walkDir(rootDir);
  
  files.forEach(file => {
    if (file.includes('inspect_') || file.includes('search_')) return;
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('INSERT INTO player_seasons') || content.includes('player_seasons') && content.includes('INSERT')) {
      console.log(`File: ${path.relative(rootDir, file)}`);
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('player_seasons') || line.includes('INSERT') || line.includes('realplayerstats')) {
          console.log(`  Line ${idx + 1}: ${line.trim()}`);
        }
      });
    }
  });
} catch (error) {
  console.error("Error:", error);
}
