import * as cheerio from 'cheerio';
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const tempConnectionString = process.env.TEMP_DATABASE_URL || process.env.NEON_DATABASE_URL || 'postgresql://neondb_owner:npg_8VjT5XvWkexd@ep-calm-sunset-a267j54f-pooler.eastus2.azure.neon.tech/neondb?sslmode=require';
const tempSql = neon(tempConnectionString);

const COUNTRY_ID_MAP: { [key: number]: string } = {
  228: 'Portugal',
  35: 'France',
  19: 'England',
  14: 'Brazil',
  53: 'Spain',
  28: 'Germany',
  13: 'Argentina',
  39: 'Italy',
  5: 'Belgium',
  45: 'Netherlands',
  46: 'Uruguay',
  17: 'Croatia',
  51: 'Senegal',
  83: 'Senegal',
  23: 'Colombia',
  52: 'South Korea'
};

async function testScrape(url: string) {
  try {
    console.log('Fetching URL:', url);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await res.text();
    console.log('Downloaded HTML length:', html.length);

    const pushes: string[] = [];
    const pushRegex = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/g;
    let match;
    while ((match = pushRegex.exec(html)) !== null) {
      pushes.push(match[1]);
    }
    console.log('Found pushes count:', pushes.length);

    let chunkObj: any = null;
    for (const push of pushes) {
      if (push.includes('\\"baseStats\\":{')) {
        const cleanStr = push.replace(/\\"/g, '"');
        const startIdx = cleanStr.indexOf('{"baseStats":{');
        if (startIdx !== -1) {
          const jsonSlice = cleanStr.substring(startIdx);
          let braceCount = 0;
          let jsonEndIndex = -1;
          for (let i = 0; i < jsonSlice.length; i++) {
            if (jsonSlice[i] === '{') {
              braceCount++;
            } else if (jsonSlice[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEndIndex = i;
                break;
              }
            }
          }
          if (jsonEndIndex !== -1) {
            try {
              chunkObj = JSON.parse(jsonSlice.substring(0, jsonEndIndex + 1));
              break;
            } catch (jsonErr) {
              console.error('JSON parse error:', jsonErr);
            }
          }
        }
      }
    }

    if (!chunkObj) {
      console.error('chunkObj not found');
      return;
    }

    function findNestedPlayer(obj: any): any {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.id && obj.name && obj.preferredFoot) {
        return obj;
      }
      for (const key of Object.keys(obj)) {
        const found = findNestedPlayer(obj[key]);
        if (found) return found;
      }
      return null;
    }

    const playerObj = findNestedPlayer(chunkObj);
    if (!playerObj) {
      console.error('playerObj not found');
      return;
    }

    console.log('Parsed Player:', {
      id: playerObj.id,
      name: playerObj.name,
      nationality: playerObj.nationality,
      countryId: playerObj.countryId,
      team: playerObj.team
    });

    let nationality = playerObj.nationality || '';
    if (!nationality && playerObj.countryId) {
      nationality = COUNTRY_ID_MAP[Number(playerObj.countryId)] || '';
    }
    if (!nationality) {
      nationality = '-';
    }

    let teamName = playerObj.team || '';
    if (teamName === '-' || !teamName) {
      const teamRegex = /"team":"([^"\-]+)"/g;
      let teamMatch;
      while ((teamMatch = teamRegex.exec(html)) !== null) {
        if (teamMatch[1] && teamMatch[1] !== '-') {
          teamName = teamMatch[1];
          break;
        }
      }
    }
    if (!teamName || teamName === '-') {
      teamName = 'Free Agent';
    }

    console.log('Resolved details:', {
      teamName,
      nationality
    });

  } catch (err) {
    console.error('Error during test:', err);
  }
}

testScrape('https://efhub.com/players/100265');
