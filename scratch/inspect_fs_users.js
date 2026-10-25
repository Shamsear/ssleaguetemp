const fs = require('fs');
const path = require('path');

const firestoreMatches = JSON.parse(fs.readFileSync(path.join(__dirname, 'firestore_matches.json'), 'utf8'));

console.log(`\n=== FIRESTORE COLLECTION: users ===`);
const docs = firestoreMatches.filter(m => m.collection === 'users');
docs.forEach(d => console.log(d.docId, JSON.stringify(d.data)));
