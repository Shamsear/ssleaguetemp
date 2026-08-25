import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuth } from '@/lib/auth-helper';

export async function POST(request: NextRequest) {
  try {
    // ✅ ZERO FIREBASE READS - Uses JWT claims only
    const auth = await verifyAuth(['super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    console.log('🚀 Starting cleanup of legacy balance fields from dual currency teams...');

    // Find all team_seasons with dual currency system
    const teamSeasonsSnapshot = await adminDb.collection('team_seasons')
      .where('currency_system', '==', 'dual')
      .get();
    
    console.log(`📊 Found ${teamSeasonsSnapshot.size} dual currency team_seasons to clean up`);

    let updatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    const batch = adminDb.batch();
    let batchCount = 0;

    for (const doc of teamSeasonsSnapshot.docs) {
      try {
        const data = doc.data();
        
        // Check if legacy fields exist
        const hasLegacyFields = data.balance !== undefined || 
                                data.budget !== undefined || 
                                data.starting_balance !== undefined || 
                                data.total_spent !== undefined;
        
        if (hasLegacyFields) {
          console.log(`  🔄 Cleaning legacy fields from: ${data.team_name || doc.id}`);
          
          // Remove legacy balance fields
          batch.update(doc.ref, {
            balance: FieldValue.delete(),
            budget: FieldValue.delete(),
            starting_balance: FieldValue.delete(),
            total_spent: FieldValue.delete(),
            updated_at: FieldValue.serverTimestamp()
          });
          
          batchCount++;
          updatedCount++;

          // Commit batch if we've reached 500 (Firestore limit)
          if (batchCount >= 500) {
            await batch.commit();
            console.log(`  ✅ Committed batch of ${batchCount} updates`);
            batchCount = 0;
          }
        } else {
          skippedCount++;
        }
      } catch (error: any) {
        console.error(`  ❌ Error processing document ${doc.id}:`, error.message);
        errors.push(`Error processing ${doc.id}: ${error.message}`);
      }
    }

    // Commit any remaining updates
    if (batchCount > 0) {
      await batch.commit();
      console.log(`  ✅ Committed final batch of ${batchCount} updates`);
    }

    console.log('✅ Cleanup completed successfully!');

    return NextResponse.json({
      success: true,
      message: 'Legacy fields cleanup completed successfully',
      stats: {
        total: teamSeasonsSnapshot.size,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errors.length,
        errorDetails: errors
      }
    });

  } catch (error: any) {
    console.error('❌ Cleanup failed:', error);
    return NextResponse.json({
      error: 'Cleanup failed',
      details: error.message
    }, { status: 500 });
  }
}
