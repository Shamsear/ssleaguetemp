import os
import re

search_dir = r"d:\Games\SS\nosqltest\nextjs-project"
keywords = [re.compile(r"hall\s+of\s+fame", re.IGNORECASE), re.compile(r"top\s+scorer", re.IGNORECASE)]

found_files = []

for root, dirs, files in os.walk(search_dir):
    # Skip build folders and node_modules
    if any(p in root for p in [".next", "node_modules", ".git"]):
        continue
    for file in files:
        if file.endswith(".tsx") or file.endswith(".ts"):
            file_path = os.path.join(root, file)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    for kw in keywords:
                        if kw.search(content):
                            found_files.append((file_path, kw.pattern))
            except Exception as e:
                pass

print("Search results:")
for file_path, kw in found_files:
    print(f"File: {file_path} (matched: {kw})")
