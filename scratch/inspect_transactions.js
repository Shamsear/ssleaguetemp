const fs = require('fs');
const path = require('path');

const postgresMatches = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres_all_matches.json'), 'utf8'));

console.log('=== MAIN_DB transactions breakdown ===');
const tr = postgresMatches.find(m => m.database === 'MAIN_DB' && m.table === 'transactions');
if (tr) {
  console.log(`Total transactions matching: ${tr.rows.length}`);
  const sample = tr.rows.slice(0, 10);
  sample.forEach(r => {
    console.log(`[${r.id}] type: ${r.type || r.transaction_type} | desc: ${r.description} | created_by: ${r.created_by}`);
  });
  
  // Count by creator
  const creators = {};
  tr.rows.forEach(r => {
    const cb = r.created_by || r.raw_data?.created_by || 'unknown';
    creators[cb] = (creators[cb] || 0) + 1;
  });
  console.log('\nTransactions grouped by created_by / actor:', creators);
}
