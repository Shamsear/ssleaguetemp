const fs = require('fs');
const path = require('path');

const firestoreMatches = JSON.parse(fs.readFileSync(path.join(__dirname, 'firestore_matches.json'), 'utf8'));

['notifications', 'passwordResetRequests', 'inviteUsages', 'usernames'].forEach(col => {
  console.log(`\n=== FIRESTORE COLLECTION: ${col} ===`);
  const docs = firestoreMatches.filter(m => m.collection === col);
  docs.forEach(d => console.log(d.docId, JSON.stringify(d.data)));
});
