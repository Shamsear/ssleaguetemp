const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

// Use environment variables for safety
const serviceAccount = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
};

console.log('🔧 Testing Firebase Admin connection...');

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase admin initialization error:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();

async function testConnection() {
  try {
    console.log('🔍 Testing Firestore connection...');
    
    // Try to list collections
    const collections = await db.listCollections();
    console.log('✅ Connection successful!');
    console.log(`📊 Found ${collections.length} collections:`);
    collections.forEach(collection => {
      console.log(`  - ${collection.id}`);
    });
    
    // Try to get team_seasons count
    const teamSeasonsSnapshot = await db.collection('team_seasons').get();
    console.log(`📋 team_seasons documents: ${teamSeasonsSnapshot.size}`);
    
    // Try to get teams count
    const teamsSnapshot = await db.collection('teams').get();
    console.log(`🏆 teams documents: ${teamsSnapshot.size}`);
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
  } finally {
    process.exit(0);
  }
}

testConnection();