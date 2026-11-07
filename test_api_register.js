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
      teamId: 'SSPSLT0005',
      userId: 'rQ9mevM02USBOYvwxwNsgvtnflq2',
      joinFantasy: true
    })
  };
  const params = Promise.resolve({ id: 'SSPSLS19' });
  
  console.log('Testing fast POST /api/seasons/SSPSLS19/register with SSPSLT0005 ...');
  const t0 = Date.now();
  const res = await POST(req, { params });
  console.log('Finished in', Date.now() - t0, 'ms');
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Response body:', data);

  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.NEON_MAIN_DB_URL);
  const row = await sql`SELECT * FROM team_seasons WHERE id = 'SSPSLT0005_SSPSLS19'`;
  console.log('TM Asgardians in Neon team_seasons:', row.length > 0 ? 'YES! Found:' : 'NO!', row[0]?.team_name, row[0]?.status);
}

main().catch(console.error);
