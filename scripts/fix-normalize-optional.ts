import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

function getAllTsx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsx(full));
    } else if (entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

const dirs = [
  path.join(ROOT, 'app', 'dashboard'),
  path.join(ROOT, 'components'),
];

let fixed = 0;
for (const dir of dirs) {
  for (const file of getAllTsx(dir)) {
    const src = fs.readFileSync(file, 'utf8');
    // Fix: normalizeStr(x?) => normalizeStr(x)  (stray ? inside function call)
    const patched = src.replace(/normalizeStr\(([^)]+?)\?\)/g, 'normalizeStr($1)');
    if (patched !== src) {
      fs.writeFileSync(file, patched, 'utf8');
      console.log(`FIXED: ${path.relative(ROOT, file)}`);
      fixed++;
    }
  }
}
console.log(`\n✅ Fixed ${fixed} files.`);
