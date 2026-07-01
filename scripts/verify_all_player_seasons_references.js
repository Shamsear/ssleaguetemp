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
  console.log(`=== AUDITING ALL REFERENCES TO player_seasons ===`);
  
  files.forEach(file => {
    if (file.includes('inspect_') || file.includes('search_') || file.includes('find_') || file.includes('preview_') || file.includes('verify_') || file.includes('cleanup_')) return;
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('player_seasons')) {
      console.log(`File: ${path.relative(rootDir, file)}`);
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('player_seasons') || line.includes('seasonNum') || line.includes('isModern')) {
          console.log(`  Line ${idx + 1}: ${line.trim()}`);
        }
      });
    }
  });
} catch (error) {
  console.error("Error:", error);
}
