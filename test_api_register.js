const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

async function main() {
  const { POST } = require('./app/api/seasons/[id]/register/route');
  const req = {
    json: async () => ({
      action: 'join',
      userId: '2Nzm6mnAvUZzlR4hM1b3EX9jqUM2', // Raees (Red Hawks FC)
      joinFantasy: true
    })
  };
  const params = Promise.resolve({ id: 'SSPSLS19' });
  
  console.log('Testing POST /api/seasons/SSPSLS19/register with SSPSLT0004 ...');
  const res = await POST(req, { params });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Response body:', data);

  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.NEON_MAIN_DB_URL);
  const row = await sql`SELECT * FROM team_seasons WHERE id = 'SSPSLT0004_SSPSLS19'`;
  console.log('Red Hawks in Neon team_seasons:', row.length > 0 ? 'YES! Found:' : 'NO!', row[0]?.team_name, row[0]?.status);
}

main().catch(console.error);
