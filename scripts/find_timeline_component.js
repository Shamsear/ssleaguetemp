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
      if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

try {
  const dirs = [
    path.join(__dirname, '../components'),
    path.join(__dirname, '../app')
  ];
  
  let files = [];
  dirs.forEach(d => {
    if (fs.existsSync(d)) {
      files = files.concat(walkDir(d));
    }
  });

  files.forEach(file => {
    const basename = path.basename(file);
    if (basename.toLowerCase().includes('timeline')) {
      console.log(`Found Timeline File: ${path.relative(path.join(__dirname, '..'), file)}`);
    }
  });
} catch (error) {
  console.error("Error:", error);
}
