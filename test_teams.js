const admin = require('firebase-admin');
if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json'); // maybe?
}
// Actually, I can just use neon to fetch all teams and map them!
