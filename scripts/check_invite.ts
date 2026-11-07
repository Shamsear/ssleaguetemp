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

async function checkInvite() {
  const { adminDb } = await import('../lib/firebase/admin');
  const code = 'TJ72-T2DC-4NAL';
  const doc = await adminDb.collection('invites').doc(code).get();
  if (!doc.exists) {
    console.log('Invite doc does NOT exist with id:', code);
    const snap = await adminDb.collection('invites').where('code', '==', code).get();
    if (snap.empty) {
      console.log('No invite found with code field ==', code);
      // List recent invites
      const all = await adminDb.collection('invites').limit(10).get();
      console.log('Recent 10 invites in db:');
      all.forEach(d => console.log(d.id, d.data().seasonId, d.data().type, d.data().isActive));
    } else {
      console.log('Found invite by code field:');
      snap.forEach(d => console.log(d.id, d.data()));
    }
  } else {
    console.log('Invite doc data:', doc.id, JSON.stringify(doc.data(), null, 2));
  }
}
checkInvite().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
