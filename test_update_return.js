const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.NEON_MAIN_DB_URL);

async function testUpdate() {
  const res1 = await sql.query('UPDATE teams SET updated_at = NOW() WHERE id = $1', ['SSPSLT0002']);
  console.log('Without RETURNING:');
  console.log('res1 type:', typeof res1, Array.isArray(res1));
  console.log('res1:', res1);
  console.log('res1.rowCount:', res1.rowCount);
  console.log('res1.length:', res1.length);

  const res2 = await sql.query('UPDATE teams SET updated_at = NOW() WHERE id = $1 RETURNING id', ['SSPSLT0002']);
  console.log('With RETURNING:');
  console.log('res2:', res2);
  console.log('res2.length:', res2.length);
}

testUpdate().catch(console.error);
