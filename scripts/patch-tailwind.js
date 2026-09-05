const fs = require('fs');
const path = require('path');

const files = [
  'node_modules/@tailwindcss/node/dist/index.js',
  'node_modules/@tailwindcss/node/dist/index.mjs',
];

files.forEach((relativePath) => {
  const filePath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // Check if already patched
  if (content.includes('process.platform!=="win32"') || content.includes('process.platform==="win32"')) {
    return;
  }

  // Patch CJS and ESM module registration on Windows
  content = content
    .replace('!process.versions.bun', 'process.platform!=="win32"&&!process.versions.bun')
    .replace('process.versions.bun||At.register', 'process.platform==="win32"||process.versions.bun||At.register');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[patch-tailwind] Guarded module.register in ${relativePath}`);
});
