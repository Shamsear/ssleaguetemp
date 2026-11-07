const { FieldValue } = require('firebase-admin/firestore');

const st = FieldValue.serverTimestamp();
console.log('st:', st);
console.log('constructor:', st.constructor?.name);
console.log('keys:', Object.keys(st));
console.log('isEqual function?:', typeof st.isEqual);
console.log('JSON.stringify:', JSON.stringify(st));
