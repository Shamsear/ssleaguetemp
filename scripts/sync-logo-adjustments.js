const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

if (!admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  };
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function syncLogoAdjustments() {
  console.log('Starting Team Logo Positioning Adjustments Sync...\n');
  
  try {
    const teamsSnapshot = await db.collection('teams').get();
    console.log(`Found ${teamsSnapshot.size} base teams.`);
    
    let updatedCount = 0;
    
    for (const teamDoc of teamsSnapshot.docs) {
      const teamId = teamDoc.id;
      const teamData = teamDoc.data();
      
      const {
        logo_position_x_circle,
        logo_position_y_circle,
        logo_scale_circle,
        logo_position_x_square,
        logo_position_y_square,
        logo_scale_square,
        logo_url,
        team_name
      } = teamData;
      
      // We check if there's any positioning fields or logo url to sync
      if (logo_position_x_circle !== undefined || logo_position_y_circle !== undefined ||
          logo_position_x_square !== undefined || logo_position_y_square !== undefined || logo_url) {
        
        console.log(`Syncing settings for Team: ${team_name || teamId} (${teamId})`);
        
        const teamSeasonsSnapshot = await db.collection('team_seasons')
          .where('team_id', '==', teamId)
          .get();
        
        if (teamSeasonsSnapshot.empty) {
          console.log(`  No matching team_seasons found for team ${teamId}`);
          continue;
        }
        
        console.log(`  Found ${teamSeasonsSnapshot.size} matching team_seasons.`);
        
        for (const doc of teamSeasonsSnapshot.docs) {
          const updateData = { updated_at: new Date() };
          
          if (logo_url) {
            updateData.team_logo = logo_url;
            updateData.logo_url = logo_url;
          }
          if (logo_position_x_circle !== undefined) updateData.logo_position_x_circle = logo_position_x_circle;
          if (logo_position_y_circle !== undefined) updateData.logo_position_y_circle = logo_position_y_circle;
          if (logo_scale_circle !== undefined) updateData.logo_scale_circle = logo_scale_circle;
          if (logo_position_x_square !== undefined) updateData.logo_position_x_square = logo_position_x_square;
          if (logo_position_y_square !== undefined) updateData.logo_position_y_square = logo_position_y_square;
          if (logo_scale_square !== undefined) updateData.logo_scale_square = logo_scale_square;
          
          await doc.ref.update(updateData);
          updatedCount++;
        }
      }
    }
    
    console.log(`\nSync complete! Updated ${updatedCount} team_seasons documents.`);
  } catch (error) {
    console.error('Error during sync:', error);
  }
}

syncLogoAdjustments().then(() => process.exit(0));
