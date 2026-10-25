const fs = require('fs');
const path = require('path');

const authMatches = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase_auth_matches.json'), 'utf8'));
const firestoreMatches = JSON.parse(fs.readFileSync(path.join(__dirname, 'firestore_matches.json'), 'utf8'));
const postgresMatches = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres_all_matches.json'), 'utf8'));

console.log('=== SUMMARY OF FIREBASE AUTH ===');
authMatches.forEach(u => {
  console.log(`- UID: ${u.uid} | Email: ${u.email} | DisplayName: ${u.displayName} | Created: ${u.metadata?.creationTime}`);
});

console.log('\n=== SUMMARY OF FIRESTORE ===');
const fsByCol = {};
firestoreMatches.forEach(m => {
  fsByCol[m.collection] = (fsByCol[m.collection] || 0) + 1;
});
console.log(fsByCol);

console.log('\n=== FIRESTORE USERS ===');
firestoreMatches.filter(m => m.collection === 'users').forEach(m => {
  console.log(`DocID: ${m.docId}`, JSON.stringify(m.data));
});

console.log('\n=== FIRESTORE USERNAMES ===');
firestoreMatches.filter(m => m.collection === 'usernames').forEach(m => {
  console.log(`DocID: ${m.docId}`, JSON.stringify(m.data));
});

console.log('\n=== FIRESTORE REALPLAYERS ===');
firestoreMatches.filter(m => m.collection === 'realplayers').forEach(m => {
  console.log(`DocID: ${m.docId}`, JSON.stringify(m.data));
});

console.log('\n=== FIRESTORE TEAMS ===');
firestoreMatches.filter(m => m.collection === 'teams').forEach(m => {
  console.log(`DocID: ${m.docId}`, JSON.stringify(m.data));
});

console.log('\n=== FIRESTORE TEAM_SEASONS ===');
firestoreMatches.filter(m => m.collection === 'team_seasons').forEach(m => {
  console.log(`DocID: ${m.docId}`, JSON.stringify(m.data));
});

console.log('\n=== SUMMARY OF POSTGRES BY DATABASE & TABLE ===');
postgresMatches.forEach(pm => {
  console.log(`DB: ${pm.database} | Table: ${pm.table} | Count: ${pm.count}`);
});
