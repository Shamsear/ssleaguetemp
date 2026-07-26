/**
 * Script to fix all 'committee' role references to 'committee_admin'
 */

import * as fs from 'fs';
import * as path from 'path';

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        if (item.name !== 'node_modules' && item.name !== '.next' && item.name !== '.git') {
          files.push(...getAllTsFiles(fullPath));
        }
      } else if (item.name.endsWith('.ts') || item.name.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

function fixFile(filePath: string): { fixed: boolean; changes: number } {
  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;
  
  // Pattern 1: verifyAuth(['committee'])
  const pattern1 = /verifyAuth\(\['committee'\]\)/g;
  const matches1 = content.match(pattern1);
  if (matches1) {
    content = content.replace(pattern1, "verifyAuth(['committee_admin'])");
    changes += matches1.length;
  }
  
  // Pattern 2: verifyAuth(['team', 'committee'])
  const pattern2 = /verifyAuth\(\['team',\s*'committee'\]\)/g;
  const matches2 = content.match(pattern2);
  if (matches2) {
    content = content.replace(pattern2, "verifyAuth(['team', 'committee_admin'])");
    changes += matches2.length;
  }
  
  // Pattern 3: verifyAuth(['admin', 'committee', 'committee_admin'])
  const pattern3 = /verifyAuth\(\['admin',\s*'committee',\s*'committee_admin'\]\)/g;
  const matches3 = content.match(pattern3);
  if (matches3) {
    content = content.replace(pattern3, "verifyAuth(['admin', 'committee_admin'])");
    changes += matches3.length;
  }
  
  if (changes > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { fixed: true, changes };
  }
  
  return { fixed: false, changes: 0 };
}

console.log('🔧 Fixing committee role references...\n');

const apiDir = path.join(process.cwd(), 'app', 'api');
const files = getAllTsFiles(apiDir);

console.log(`📁 Found ${files.length} TypeScript files in app/api\n`);

let totalFixed = 0;
let totalChanges = 0;

for (const file of files) {
  const result = fixFile(file);
  if (result.fixed) {
    const relativePath = path.relative(process.cwd(), file);
    console.log(`✅ ${relativePath} (${result.changes} changes)`);
    totalFixed++;
    totalChanges += result.changes;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files modified: ${totalFixed}`);
console.log(`   Total changes: ${totalChanges}`);

if (totalChanges > 0) {
  console.log(`\n✅ All 'committee' references have been changed to 'committee_admin'!`);
} else {
  console.log(`\n✨ No changes needed - all files already use 'committee_admin'`);
}
