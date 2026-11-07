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
      userId: 'V9JF0vmyiHPVE09FQElZzBpUQW03', // Hijas
      joinFantasy: true
    })
  };
  const params = Promise.resolve({ id: 'SSPSLS19' });
  
  console.log('Testing POST /api/seasons/SSPSLS19/register ...');
  const res = await POST(req, { params });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Response body:', data);
}

main().catch(console.error);
