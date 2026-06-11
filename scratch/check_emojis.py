import re
import sys

# Force stdout to be utf-8
sys.stdout.reconfigure(encoding='utf-8')

files = [
    r"d:\Games\SS\nosqltest\nextjs-project\components\layout\Navbar.tsx",
    r"d:\Games\SS\nosqltest\nextjs-project\components\layout\MobileNav.tsx",
    r"d:\Games\SS\nosqltest\nextjs-project\components\layout\Footer.tsx"
]

emoji_pattern = re.compile(
    "["
    "\U00010000-\U0010ffff"  # emoji range
    "\u2000-\u32ff"          # icons, symbols
    "]+", flags=re.UNICODE
)

for file_path in files:
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            print(f"File: {file_path}")
            found = False
            for idx, line in enumerate(lines):
                matches = emoji_pattern.findall(line)
                if matches:
                    found = True
                    print(f"  Line {idx+1}: {line.strip()}")
            if not found:
                print("  No emojis found.")
    except Exception as e:
        print(f"Error checking {file_path}: {e}")
