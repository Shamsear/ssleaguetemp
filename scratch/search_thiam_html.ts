import * as dotenv from 'dotenv';
import * as path from 'path';

async function main() {
  const url = 'https://efhub.com/players/100265';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const html = await res.text();
  
  // Search for 83 or Senegal
  const terms = ['83', 'Senegal', 'senegal'];
  terms.forEach(term => {
    let idx = 0;
    let count = 0;
    while ((idx = html.indexOf(term, idx)) !== -1) {
      count++;
      console.log(`Found ${term} at index ${idx}. Preview:`, html.substring(idx - 60, idx + 100));
      idx += term.length;
      if (count > 8) break;
    }
    console.log(`Total matches for ${term}: ${count}`);
    console.log('=======================================');
  });
}

main().catch(console.error);
