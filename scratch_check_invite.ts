import { adminDb } from '@/lib/firebase/admin';

async function checkInvite() {
  const code = 'T789-MJLK-HGG6';
  const doc = await adminDb.collection('invites').doc(code).get();
  console.log('Invite code:', code, 'Exists?', doc.exists);
  if (doc.exists) {
    const data = doc.data();
    console.log('Invite Data:', {
      ...data,
      expiresAt: data?.expiresAt?.toDate?.() || data?.expiresAt,
      createdAt: data?.createdAt?.toDate?.() || data?.createdAt,
    });
  } else {
    // List all invites in collection
    const all = await adminDb.collection('invites').get();
    console.log('All invite IDs in collection:', all.docs.map(d => d.id));
    for (const d of all.docs) {
      console.log(d.id, '=>', d.data());
    }
  }
}

checkInvite().catch(console.error);
