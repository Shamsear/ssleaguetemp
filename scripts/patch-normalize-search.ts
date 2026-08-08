/**
 * Bulk accent-normalization patcher.
 *
 * For every dashboard page that uses  .toLowerCase().includes(...)
 * to filter player / team names, this script:
 *   1. Adds an import for normalizeStr from '@/lib/utils/normalizeStr'
 *   2. Replaces  x.toLowerCase().includes(y.toLowerCase())
 *              with  normalizeStr(x).includes(normalizeStr(y))
 *   3. Replaces  x.toLowerCase().includes(y)              (where y is already lowercased)
 *              with  normalizeStr(x).includes(normalizeStr(y))
 *
 * Run with:   npx tsx scripts/patch-normalize-search.ts
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const DASHBOARD = path.join(ROOT, 'app', 'dashboard');
const IMPORT_LINE = `import { normalizeStr } from '@/lib/utils/normalizeStr';`;

// Files already updated manually – skip them
const ALREADY_DONE = new Set([
  'app/dashboard/committee/players/transfers/FootballPlayerForm.tsx',
  'app/dashboard/committee/players/transfers/SwapFormV2.tsx',
  'app/dashboard/committee/players/transfers/TransferFormV2.tsx',
  'app/dashboard/committee/players/transfers/BulkReleaseFootballPlayerForm.tsx',
  'app/dashboard/committee/players/transfers/ReleaseRealPlayerForm.tsx',
]);

function relativePath(absPath: string) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/');
}

function patch(filePath: string): boolean {
  const rel = relativePath(filePath);
  if (ALREADY_DONE.has(rel)) {
    console.log(`  SKIP (already done): ${rel}`);
    return false;
  }

  let src = fs.readFileSync(filePath, 'utf8');
  const original = src;

  // Replace  str.toLowerCase().includes(term.toLowerCase())
  // with     normalizeStr(str).includes(normalizeStr(term))
  src = src.replace(
    /([A-Za-z_$.][A-Za-z0-9_$.'?]*?)\.toLowerCase\(\)\.includes\(([A-Za-z_$.][A-Za-z0-9_$.'? ]*?)\.toLowerCase\(\)\)/g,
    'normalizeStr($1).includes(normalizeStr($2))'
  );

  // Replace  str.toLowerCase().includes(varAlreadyLower)
  // where varAlreadyLower has no .toLowerCase() call itself
  src = src.replace(
    /([A-Za-z_$.][A-Za-z0-9_$.'?]*?)\.toLowerCase\(\)\.includes\(([A-Za-z_$][A-Za-z0-9_$]*)\)/g,
    (match, haystack, needle) => {
      // Skip if we already wrapped it
      if (haystack.startsWith('normalizeStr(')) return match;
      return `normalizeStr(${haystack}).includes(normalizeStr(${needle}))`;
    }
  );

  if (src === original) return false; // nothing changed

  // Inject import if not already there
  if (!src.includes("from '@/lib/utils/normalizeStr'") && !src.includes('from "@/lib/utils/normalizeStr"')) {
    // Insert after the last existing import block
    const lastImportIdx = src.lastIndexOf("import ");
    const endOfLine = src.indexOf('\n', lastImportIdx);
    src = src.slice(0, endOfLine + 1) + IMPORT_LINE + '\n' + src.slice(endOfLine + 1);
  }

  fs.writeFileSync(filePath, src, 'utf8');
  return true;
}

function getAllTsx(dir: string): string[] {
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

const files = getAllTsx(DASHBOARD);
let patched = 0;
for (const f of files) {
  const changed = patch(f);
  if (changed) {
    console.log(`  PATCHED: ${relativePath(f)}`);
    patched++;
  }
}

// Also patch components
const compDir = path.join(ROOT, 'components');
const compFiles = getAllTsx(compDir);
for (const f of compFiles) {
  const changed = patch(f);
  if (changed) {
    console.log(`  PATCHED: ${relativePath(f)}`);
    patched++;
  }
}

console.log(`\n✅ Done. Patched ${patched} files.`);
