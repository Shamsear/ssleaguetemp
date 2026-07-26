import { adminDb } from './lib/firebase/admin';

async function checkCategoryPrices() {
  console.log('🔍 Checking category base prices...\n');
  
  try {
    const categoriesSnapshot = await adminDb.collection('categories').get();
    
    if (categoriesSnapshot.empty) {
      console.log('No categories found in database.');
      return;
    }
    
    console.log('📊 Current Category Prices:\n');
    console.log('ID'.padEnd(25), 'Name'.padEnd(15), 'Base Price', 'Priority');
    console.log('-'.repeat(70));
    
    categoriesSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(
        doc.id.padEnd(25),
        (data.name || 'N/A').padEnd(15),
        (data.base_price !== undefined ? data.base_price : 'undefined').toString().padEnd(11),
        data.priority || 'N/A'
      );
    });
    
    console.log('\n✅ Check complete!');
  } catch (error) {
    console.error('❌ Error checking categories:', error);
  }
}

checkCategoryPrices()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
