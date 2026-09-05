import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
// @ts-ignore
import * as cheerio from 'cheerio';
import { tempSql, initializeTempTable } from '@/lib/neon/temp-config';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

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
  23: 'Colombia',
  52: 'South Korea',
  47: 'USA',
  36: 'Japan',
  42: 'Mexico',
  44: 'Morocco',
  49: 'Nigeria',
  18: 'Denmark',
  57: 'Sweden',
  56: 'Switzerland',
  55: 'Serbia',
  48: 'Poland',
  60: 'Ukraine',
  21: 'Chile',
  20: 'Canada',
  11: 'Algeria',
  27: 'Egypt',
  29: 'Ghana',
  58: 'Tunisia',
  59: 'Turkey',
  61: 'Wales',
  62: 'Scotland',
  63: 'Northern Ireland',
  64: 'Republic of Ireland',
  31: 'Ivory Coast',
  32: 'Cameroon',
  16: 'Austria',
  22: 'China',
  15: 'Australia',
  43: 'Norway',
  24: 'Czech Republic',
  25: 'Greece',
  26: 'Hungary',
  30: 'Iceland',
  33: 'Israel',
  34: 'Finland',
  37: 'New Zealand',
  40: 'Peru',
  41: 'Paraguay',
  65: 'Ecuador',
  66: 'Venezuela',
  67: 'Bolivia',
  68: 'Costa Rica',
  69: 'Honduras',
  70: 'Panama',
  71: 'Jamaica',
  72: 'Trinidad and Tobago',
  73: 'Saudi Arabia',
  74: 'Iran',
  75: 'Iraq',
  76: 'UAE',
  77: 'Qatar',
  78: 'Uzbekistan',
  80: 'Thailand',
  81: 'Vietnam',
  82: 'Syria',
  83: 'Senegal',
  84: 'Bahrain',
  85: 'Kuwait',
  86: 'Oman',
  87: 'Lebanon',
  88: 'India',
  89: 'North Korea',
  90: 'Belgium',
  107: 'Mali',
  110: 'Morocco'
};

export async function POST(request: NextRequest) {
  try {
    const mainConnectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';
    const mainSql = mainConnectionString ? neon(mainConnectionString) as any : null;

    const body = await request.json();
    const { urls } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ success: false, error: 'An array of eFHub player URLs is required.' }, { status: 400 });
    }

    await initializeTempTable();
    const results: any[] = [];

    for (const rawUrl of urls) {
      const url = rawUrl.trim();
      if (!url) continue;

      try {
        // 1. Extract original player ID from URL (e.g. https://efhub.com/players/110578)
        const idMatch = url.match(/\/players\/(\d+)/);
        if (!idMatch) {
          results.push({ url, success: false, error: 'Invalid eFHub player URL format.' });
          continue;
        }

        const originalId = idMatch[1];
        console.log(`🔍 Scraping eFHub player ID ${originalId} from: ${url}`);

        // 2. Fetch page HTML
        const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        const sharedHeaders = {
          'User-Agent': randomUserAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://efhub.com/'
        };

        let html = '';
        try {
          const directRes = await fetch(url, { headers: sharedHeaders, cache: 'no-store' });
          if (directRes.status === 200) {
            html = await directRes.text();
          } else {
            // Try ScraperAPI fallback if configured
            const scraperKeys = [
              process.env.SCRAPER_API_KEY || "12e89d3469aa5f5bb80cbba557ceec9b",
              process.env.BACKUP_SCRAPER_API_KEY || "c042d3b9be6af433b58e0ace8b98d66b"
            ].filter(Boolean);

            if (scraperKeys.length > 0) {
              const proxyUrl = `http://api.scraperapi.com?api_key=${scraperKeys[0]}&keep_headers=true&url=${encodeURIComponent(url)}`;
              const proxyRes = await fetch(proxyUrl, { headers: sharedHeaders, cache: 'no-store' });
              if (proxyRes.status === 200) {
                html = await proxyRes.text();
              }
            }
          }
        } catch (fetchErr: any) {
          console.error(`Fetch error for ${url}:`, fetchErr);
        }

        if (!html) {
          results.push({ url, success: false, error: 'Failed to retrieve page HTML. The site may be blocking requests.' });
          continue;
        }

        // 3. Extract player details from Next.js chunk pushes
        const pushes: string[] = [];
        const pushRegex = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/g;
        let match;
        while ((match = pushRegex.exec(html)) !== null) {
          pushes.push(match[1]);
        }

        let chunkObj: any = null;
        for (const push of pushes) {
          if (push.includes('\\"baseStats\\":{')) {
            const cleanStr = push.replace(/\\"/g, '"');
            const startIdx = cleanStr.indexOf('{"baseStats":{');
            if (startIdx !== -1) {
              // Match braces to extract the valid JSON object
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
                  console.error('Failed to parse matched chunk JSON slice:', jsonErr);
                }
              }
            }
          }
        }

        if (!chunkObj) {
          results.push({ url, success: false, error: 'Player stats block not found in eFHub page structure.' });
          continue;
        }

        // Helper function to recursively find the nested player object inside chunkObj
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
          results.push({ url, success: false, error: 'Player metadata not found inside stats structure.' });
          continue;
        }

        // 4. Resolve ID conflict
        let assignedId = originalId;
        const checkConflict = await tempSql.query(
          'SELECT player_id FROM temp_players_import WHERE player_id = $1',
          [originalId]
        );

        if (checkConflict.length > 0) {
          // ID exists! Auto-assign a unique ID >= 100,000,000
          const maxQuery = await tempSql.query(
            "SELECT player_id FROM temp_players_import WHERE player_id ~ '^[0-9]+$'"
          );
          let maxVal = 99999999;
          maxQuery.forEach((row: any) => {
            const val = parseInt(row.player_id);
            if (val >= 100000000 && val > maxVal) {
              maxVal = val;
            }
          });
          assignedId = (maxVal + 1).toString();
          console.log(`⚠️ ID Conflict: ID ${originalId} is taken. Assigned new ID: ${assignedId}`);
        }

        // 5. Download and crop card image
        const cardImgUrl = `https://efimg.com/efootballhub22/images/player_cards/${originalId}_l.png`;
        let imageProcessed = false;
        let imageBuffer: Buffer | null = null;

        try {
          const imgRes = await fetch(cardImgUrl);
          if (imgRes.ok) {
            const rawBuffer = Buffer.from(await imgRes.arrayBuffer());
            const metadata = await sharp(rawBuffer).metadata();
            const width = metadata.width || 0;
            const height = metadata.height || 0;

            if (width > 0 && height > 0) {
              // Custom crop formula matching Renato Sanches visual test: cx=0.69, cy=0.24, size=0.45
              const centerX = Math.floor(width * 0.69);
              const centerY = Math.floor(height * 0.24);
              const desiredSize = Math.floor(Math.min(width * 0.45, height * 0.45));
              const faceSize = Math.max(10, Math.min(desiredSize, width, height));
              const left = Math.max(0, Math.min(centerX - Math.floor(faceSize / 2), width - faceSize));
              const top = Math.max(0, Math.min(centerY - Math.floor(faceSize / 2), height - faceSize));

              imageBuffer = await sharp(rawBuffer)
                .extract({ left, top, width: faceSize, height: faceSize })
                .resize(140, 140, { kernel: 'lanczos3', fit: 'fill' })
                .webp({ quality: 90 })
                .toBuffer();
            }
          }
        } catch (imgErr) {
          console.error(`Failed to crop card photo for ID ${originalId}:`, imgErr);
        }

        // 6. Save image to disk or commit to GitHub in production
        if (imageBuffer) {
          const isDev = process.env.NODE_ENV === 'development';
          const hasGithub = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);

          if (!isDev && hasGithub) {
            // Serverless production: commit to Github repository
            try {
              const token = process.env.GITHUB_TOKEN;
              const repo = process.env.GITHUB_REPO;
              const filePath = `public/images/players/${assignedId}.webp`;
              const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;

              let sha: string | null = null;
              const checkRes = await fetch(githubUrl, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/vnd.github+json',
                  'User-Agent': 'NextJS-App'
                }
              });
              if (checkRes.status === 200) {
                const fileData = await checkRes.json();
                sha = fileData.sha;
              }

              const bodyParams: any = {
                message: `Import eFHub player photo for ID: ${assignedId}`,
                content: imageBuffer.toString('base64')
              };
              if (sha) bodyParams.sha = sha;

              await fetch(githubUrl, {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/vnd.github+json',
                  'User-Agent': 'NextJS-App'
                },
                body: JSON.stringify(bodyParams)
              });
              imageProcessed = true;
            } catch (gitErr) {
              console.error('Error uploading photo to GitHub:', gitErr);
            }
          } else {
            // Local dev mode: save directly
            try {
              const dirPath = path.join(process.cwd(), 'public', 'images', 'players');
              await fs.mkdir(dirPath, { recursive: true });
              await fs.writeFile(path.join(dirPath, `${assignedId}.webp`), imageBuffer);
              imageProcessed = true;
            } catch (fsErr: any) {
              if (fsErr.code === 'EROFS' || fsErr.message?.includes('read-only')) {
                console.warn('⚠️ Serverless read-only file system detected, skipping local image save.');
              } else {
                console.error('Error writing player photo locally:', fsErr);
              }
            }
          }
        }

        // 7. Insert player stats into temp database
        const pStats = chunkObj.baseStats || playerObj.stats || playerObj.baseStats || {};

        // Resolve nationality and team/club name
        let nationality = playerObj.nationality || '';
        let teamName = playerObj.team || '';

        // Query active player database for existing player heuristics
        if (mainSql && playerObj.name) {
          try {
            // Check if table footballplayers exists by running query
            const mainCheck = await mainSql.query(
              "SELECT nationality, club FROM footballplayers WHERE name ILIKE $1 OR name ILIKE $2 LIMIT 1",
              [`%${playerObj.name}%`, `%${playerObj.name.split(' ').pop()}%`]
            );
            if (mainCheck.length > 0) {
              if (!nationality || nationality === '-') {
                nationality = mainCheck[0].nationality || '';
              }
              if (!teamName || teamName === '-') {
                teamName = mainCheck[0].club || '';
              }
            }
          } catch (dbErr) {
            console.warn('⚠️ footballplayers table not found or query failed, falling back to static mappings:', dbErr);
          }
        }

        // Fallback: Resolve nationality from countryId
        if (!nationality || nationality === '-') {
          if (playerObj.countryId) {
            nationality = COUNTRY_ID_MAP[Number(playerObj.countryId)] || '';
          }
        }
        if (!nationality) {
          nationality = '-';
        }

        // Fallback: Resolve team/club name from other card versions on page
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

        await tempSql.query(`
          INSERT INTO temp_players_import (
            player_id, name, position, team_name, nationality, age, playing_style, overall_rating,
            offensive_awareness, ball_control, dribbling, tight_possession, low_pass, lofted_pass, finishing, heading,
            set_piece_taking, curl, speed, acceleration, kicking_power, jumping, physical_contact, balance, stamina,
            defensive_awareness, tackling, aggression, defensive_engagement, gk_awareness, gk_catching, gk_parrying,
            gk_reflexes, gk_reach
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)
          ON CONFLICT (player_id) DO UPDATE SET
            name = EXCLUDED.name,
            position = EXCLUDED.position,
            team_name = EXCLUDED.team_name,
            nationality = EXCLUDED.nationality,
            age = EXCLUDED.age,
            playing_style = EXCLUDED.playing_style,
            overall_rating = EXCLUDED.overall_rating,
            offensive_awareness = EXCLUDED.offensive_awareness,
            ball_control = EXCLUDED.ball_control,
            dribbling = EXCLUDED.dribbling,
            tight_possession = EXCLUDED.tight_possession,
            low_pass = EXCLUDED.low_pass,
            lofted_pass = EXCLUDED.lofted_pass,
            finishing = EXCLUDED.finishing,
            heading = EXCLUDED.heading,
            set_piece_taking = EXCLUDED.set_piece_taking,
            curl = EXCLUDED.curl,
            speed = EXCLUDED.speed,
            acceleration = EXCLUDED.acceleration,
            kicking_power = EXCLUDED.kicking_power,
            jumping = EXCLUDED.jumping,
            physical_contact = EXCLUDED.physical_contact,
            balance = EXCLUDED.balance,
            stamina = EXCLUDED.stamina,
            defensive_awareness = EXCLUDED.defensive_awareness,
            tackling = EXCLUDED.tackling,
            aggression = EXCLUDED.aggression,
            defensive_engagement = EXCLUDED.defensive_engagement,
            gk_awareness = EXCLUDED.gk_awareness,
            gk_catching = EXCLUDED.gk_catching,
            gk_parrying = EXCLUDED.gk_parrying,
            gk_reflexes = EXCLUDED.gk_reflexes,
            gk_reach = EXCLUDED.gk_reach
        `, [
          assignedId,
          playerObj.name || 'Unknown',
          playerObj.position || 'CMF',
          teamName,
          nationality,
          playerObj.age || 0,
          playerObj.playingStyle || '-',
          playerObj.overallRating || 0,
          pStats.offensiveAwareness || 0,
          pStats.ballControl || 0,
          pStats.dribbling || 0,
          pStats.tightPossession || 0,
          pStats.lowPass || 0,
          pStats.loftedPass || 0,
          pStats.finishing || 0,
          pStats.heading || 0,
          pStats.setPieceTaking || 0,
          pStats.curl || 0,
          pStats.speed || 0,
          pStats.acceleration || 0,
          pStats.kickingPower || 0,
          pStats.jump || 0,
          pStats.physicalContact || 0,
          pStats.balance || 0,
          pStats.stamina || 0,
          pStats.defensiveAwareness || 0,
          pStats.ballWinning || pStats.tackling || 0,
          pStats.aggression || 0,
          pStats.trackingBack || pStats.defensiveEngagement || 0,
          pStats.gkAwareness || 0,
          pStats.gkCatching || 0,
          pStats.gkClearing || pStats.gkParrying || 0,
          pStats.gkReflexes || 0,
          pStats.gkReach || 0
        ]);

        results.push({
          url,
          success: true,
          player_id: assignedId,
          name: playerObj.name,
          overall_rating: playerObj.overallRating,
          photoSaved: imageProcessed
        });

      } catch (err: any) {
        console.error(`Error processing URL ${url}:`, err);
        results.push({ url, success: false, error: err.message || 'Internal processing error.' });
      }
    }

    return NextResponse.json({ success: true, results });

  } catch (error: any) {
    console.error('❌ Scraper error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
