const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

async function main() {
  const { GET } = require('./app/api/teams/route');
  const req = {};
  const res = await GET(req);
  const data = await res.json();
  let nullCount = 0;
  data.teams?.forEach(t => {
    if (!t.userId && !t.owner_uid) {
      console.log(`❌ Team ${t.id} (${t.team_name}) has NO userId and NO owner_uid!`);
      nullCount++;
    }
  });
  console.log(`Total teams missing UID: ${nullCount} / ${data.teams?.length}`);
}

main().catch(console.error);
