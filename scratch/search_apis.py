import os

api_dir = r"d:\Games\SS\nosqltest\nextjs-project\app\api"
matches = []

for root, dirs, files in os.walk(api_dir):
    for file in files:
        if file.endswith(".ts") or file.endswith(".js"):
            file_path = os.path.join(root, file)
            # Check if path contains seasons or tournaments
            if "seasons" in file_path or "tournaments" in file_path:
                matches.append(file_path)

print("Found API files:")
for m in matches:
    print(m)
