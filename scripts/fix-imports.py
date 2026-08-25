#!/usr/bin/env python3
"""Fix files where AuthGuard import was placed inside a lucide-react import block."""
import re
import sys
import os

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    fixed = False
    
    # Pattern: "import { \nimport AuthGuard ...;\n  ArrowLeft, "
    # Need to move AuthGuard import after the closing "} from 'lucide-react';"
    
    i = 0
    new_lines = []
    auth_guard_line = None
    in_broken_import = False
    
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Check for pattern: "import {" followed by "import AuthGuard"
        if stripped == 'import {' and i + 1 < len(lines) and "import AuthGuard from" in lines[i + 1]:
            # This is the broken pattern - skip the import { and continue
            # We'll collect the rest of the import block and fix it
            in_broken_import = True
            auth_guard_line = lines[i + 1]
            new_lines.append(line)  # Keep "import {"
            i += 1  # Skip the AuthGuard line
            continue
        
        if in_broken_import and "} from '" in stripped:
            # End of lucide-react import - add closing, then AuthGuard
            in_broken_import = False
            new_lines.append(line)
            new_lines.append(auth_guard_line)
            fixed = True
            i += 1
            continue
        
        if in_broken_import and "import AuthGuard from" in stripped:
            # Already captured, skip
            i += 1
            continue
        
        new_lines.append(line)
        i += 1
    
    if fixed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines))
        print(f"  FIXED: {filepath}")
        return True
    else:
        print(f"  OK (no fix needed): {filepath}")
        return False

# Files with errors
files = [
    "app/dashboard/committee/auction-settings/page.tsx",
    "app/dashboard/committee/awards/page.tsx",
    "app/dashboard/committee/bulk-rounds/page.tsx",
    "app/dashboard/committee/database/retired/page.tsx",
    "app/dashboard/committee/polls/page.tsx",
    "app/dashboard/committee/team-management/categories/[id]/edit/page.tsx",
    "app/dashboard/committee/team-management/match-days/edit/page.tsx",
    "app/dashboard/committee/team-management/match-days/page.tsx",
    "app/dashboard/committee/team-management/tournament/lineup-status/page.tsx",
    "app/dashboard/superadmin/award-photos/page.tsx",
    "app/dashboard/superadmin/cleanup-player-users/page.tsx",
    "app/dashboard/superadmin/cleanup-realplayers/page.tsx",
    "app/dashboard/superadmin/historical-seasons/[id]/edit/page.tsx",
    "app/dashboard/superadmin/historical-seasons/import/page.tsx",
    "app/dashboard/superadmin/historical-seasons/page.tsx",
    "app/dashboard/superadmin/invites/page.tsx",
    "app/dashboard/superadmin/page.tsx",
    "app/dashboard/superadmin/password-requests/page.tsx",
    "app/dashboard/superadmin/player-stats-bulk-update/page.tsx",
    "app/dashboard/superadmin/players/import-preview/page.tsx",
    "app/dashboard/superadmin/realplayers/[playerId]/page.tsx",
    "app/dashboard/superadmin/seasons/create/page.tsx",
    "app/dashboard/superadmin/seasons/page.tsx",
    "app/dashboard/superadmin/teams/[id]/page.tsx",
    "app/dashboard/superadmin/teams/page.tsx",
    "app/dashboard/superadmin/upload-award-images/page.tsx",
    "app/dashboard/superadmin/users/page.tsx",
    "app/dashboard/committee/reports/match-rewards-audit/page.tsx",
]

count = 0
for f in files:
    if os.path.exists(f):
        if fix_file(f):
            count += 1
    else:
        print(f"  SKIP (not found): {f}")

print(f"\nFixed {count} files")
