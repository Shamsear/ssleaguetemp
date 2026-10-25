const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envVars[key] = val;
    }
  }
});

const neonKeys = [
  'NEON_AUCTION_DB_URL',
  'NEON_DATABASE_URL',
  'DATABASE_URL',
  'NEON_TOURNAMENT_DB_URL',
  'FANTASY_DATABASE_URL',
  'TEMP_DATABASE_URL',
  'NEON_MAIN_DB_URL'
];

const uniqueUrls = new Map();
for (const k of neonKeys) {
  if (envVars[k]) {
    try {
      const u = new URL(envVars[k]);
      const redacted = `${u.protocol}//${u.username}:***@${u.host}${u.pathname}`;
      if (!uniqueUrls.has(envVars[k])) {
        uniqueUrls.set(envVars[k], { keys: [k], redacted, url: envVars[k] });
      } else {
        uniqueUrls.get(envVars[k]).keys.push(k);
      }
    } catch (e) {
      console.log('Error parsing URL for', k, e.message);
    }
  }
}

console.log('--- Unique Postgres Databases ---');
for (const [url, info] of uniqueUrls.entries()) {
  console.log(`${info.keys.join(', ')} -> ${info.redacted}`);
}

console.log('\n--- Firebase Info ---');
console.log('Project ID:', envVars['FIREBASE_ADMIN_PROJECT_ID'] || envVars['NEXT_PUBLIC_FIREBASE_PROJECT_ID']);
console.log('Client Email:', envVars['FIREBASE_ADMIN_CLIENT_EMAIL']);
console.log('Has Admin Private Key:', Boolean(envVars['FIREBASE_ADMIN_PRIVATE_KEY']));
console.log('RTDB URL:', envVars['NEXT_PUBLIC_FIREBASE_DATABASE_URL']);
