import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    }
  });
}

async function check() {
  const { adminDb } = await import('../lib/firebase/admin');
  const snap = await adminDb.collection('users').where('role', 'in', ['committee_admin', 'super_admin']).get();
  snap.forEach(d => {
    const data = d.data();
    console.log(`ID: ${d.id} | username: ${data.username} | role: ${data.role} | seasonId: ${data.seasonId} | seasonName: ${data.seasonName}`);
  });
}
check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
