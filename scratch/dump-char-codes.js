const fs = require('fs');
const content = fs.readFileSync('app/api/reports/cash-balances/route.ts', 'utf8');
const lines = content.split('\n');

for (let i = 415; i <= 445; i++) {
  const line = lines[i - 1];
  if (line === undefined) continue;
  console.log(`${i}: ${JSON.stringify(line)}`);
}
