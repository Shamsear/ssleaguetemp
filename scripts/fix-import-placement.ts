/**
 * Fixes misplaced `import { normalizeStr }` lines that were injected
 * inside multi-line import blocks or function bodies.
 *
 * Strategy:
 *  1. Remove every occurrence of the normalizeStr import line from the file
 *  2. If the file uses normalizeStr, re-add the import at the correct location
 *     (after the last top-level import statement)
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const IMPORT_LINE = `import { normalizeStr } from '@/lib/utils/normalizeStr';`;

const FILES = [
  'app/dashboard/committee/team-management/player-stats/page.tsx',
  'app/dashboard/committee/database/add-new/page.tsx',
  'app/dashboard/committee/database/not-in-temp/page.tsx',
  'app/dashboard/committee/player-categorization/page.tsx',
  'app/dashboard/committee/team-slots/page.tsx',
  'app/dashboard/superadmin/media/page.tsx',
  'app/dashboard/superadmin/player-photos/page.tsx',
  'app/dashboard/superadmin/season-player-stats/page.tsx',
  'app/dashboard/superadmin/teams/page.tsx',
  'app/dashboard/committee/player-selection/page.tsx',
];

for (const rel of FILES) {
  const filePath = path.join(ROOT, rel);
  let src = fs.readFileSync(filePath, 'utf8');

  // Step 1: Remove ALL occurrences of the normalizeStr import line
  const cleaned = src
    .split('\n')
    .filter(line => !line.includes("from '@/lib/utils/normalizeStr'") && !line.includes('from "@/lib/utils/normalizeStr"'))
    .join('\n');

  // Step 2: If file still uses normalizeStr, re-insert the import at the right place
  const usesNormalizeStr = cleaned.includes('normalizeStr(');
  let final = cleaned;

  if (usesNormalizeStr) {
    const lines = cleaned.split('\n');
    // Find last line that starts with 'import ' at column 0
    let lastImportIdx = -1;
    let inMultilineImport = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (inMultilineImport) {
        if (trimmed.includes('}')) {
          inMultilineImport = false;
          lastImportIdx = i;
        }
        continue;
      }
      if (/^import\s/.test(lines[i])) {
        lastImportIdx = i;
        // Check if it's a multi-line import (has { but no } on the same line)
        if (trimmed.includes('{') && !trimmed.includes('}')) {
          inMultilineImport = true;
        }
      }
    }

    if (lastImportIdx >= 0) {
      lines.splice(lastImportIdx + 1, 0, IMPORT_LINE);
    } else {
      // Prepend after 'use client' if present
      const useClientIdx = lines.findIndex(l => l.trim() === "'use client';");
      lines.splice(useClientIdx >= 0 ? useClientIdx + 1 : 0, 0, IMPORT_LINE);
    }
    final = lines.join('\n');
  }

  fs.writeFileSync(filePath, final, 'utf8');
  console.log(`FIXED: ${rel}`);
}

console.log('\n✅ Done.');
