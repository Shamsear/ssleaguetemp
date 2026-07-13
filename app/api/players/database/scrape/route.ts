import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { tempSql, initializeTempTable } from '@/lib/neon/temp-config';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
];

const POSITION_CODES: { [key: string]: number } = {
  GK: 0, CB: 1, LB: 2, RB: 3, DMF: 4, CMF: 5, LMF: 6, RMF: 7, AMF: 8, LWF: 9, RWF: 10, SS: 11, CF: 12
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pos = searchParams.get('pos');
    const pageStr = searchParams.get('page') || '1';
    const page = parseInt(pageStr);
    const minRatingStr = searchParams.get('minRating') || '0';
    const minRating = parseInt(minRatingStr);

    if (!pos || POSITION_CODES[pos.toUpperCase()] === undefined) {
      return NextResponse.json({ success: false, error: 'Valid position (pos) is required' }, { status: 400 });
    }

    const positionUpper = pos.toUpperCase();
    const posCode = POSITION_CODES[positionUpper];

    // 1. Initialize temp table if needed
    await initializeTempTable();

    // 2. Fetch page HTML (set all=0 to search standard players only)
    // IMPORTANT: The Cookie header value must be plain text — browsers never URL-encode
    // cookie values, so pesdb.net expects `columns=pos,name,...` not `columns=pos%2Cname,...`
    const targetUrl = `https://pesdb.net/efootball/?pos=${posCode}&page=${page}&all=0`;
    const scraperApiKey = "12e89d3469aa5f5bb80cbba557ceec9b";
    const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    // Cookie with plain-text (decoded) values — this is how browsers send cookies
    const COLUMNS_COOKIE = 'columns=pos,name,club_team,nationality,height,weight,age,foot,featured,offensive_awareness,ball_control,dribbling,tight_possession,low_pass,lofted_pass,finishing,heading,set_piece_taking,curl,speed,acceleration,kicking_power,jumping,physical_contact,balance,stamina,defensive_awareness,tackling,aggression,defensive_engagement,gk_awareness,gk_catching,gk_parrying,gk_reflexes,gk_reach,weak_foot_usage,weak_foot_accuracy,form,injury_resistance,condition,overall_rating,max_level,overall_at_max_level,playing_style,S01,S02,S03,S04,S05,S06,S07,S08,S09,S10,S11,S12,S13,S14,S15,S16,S17,S18,S19,S20,S21,S22,S23,S24,S25,S26,S27,S28,S29,S30,S31,S32,S33,S34,S35,S36,S37,S38,S39,S40,S41,S42,S43,S44,S45,S46,S47,S48,S49,S50,S51,S52,S53,S54,S55,S56,S57,S58,S59,S60,S61,S62,P01,P02,P03,P04,P05,P06,P07';

    const sharedHeaders = {
      'User-Agent': randomUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      'Referer': 'https://pesdb.net/efootball/',
      'Cookie': COLUMNS_COOKIE,
    };

    let html = '';
    let usedProxy = false;

    // --- Attempt 1: Direct fetch (works on local dev and most cloud providers) ---
    try {
      console.log(`🌐 Direct fetch: ${targetUrl}`);
      const directRes = await fetch(targetUrl, {
        headers: sharedHeaders,
        cache: 'no-store',
      });

      if (directRes.status === 200) {
        html = await directRes.text();
        console.log(`✅ Direct fetch succeeded (${html.length} bytes)`);
      } else if (directRes.status === 403 || directRes.status === 429 || directRes.status === 503) {
        // Vercel/cloud IP is blocked — fall through to ScraperAPI
        console.warn(`⚠️ Direct fetch blocked (${directRes.status}), retrying via ScraperAPI...`);
      } else {
        return NextResponse.json({ success: false, error: `pesdb.net returned HTTP ${directRes.status}` }, { status: 500 });
      }
    } catch (e: any) {
      console.warn(`⚠️ Direct fetch failed (${e.message}), retrying via ScraperAPI...`);
    }

    // --- Attempt 2: ScraperAPI fallback (rotates IPs when the server is blocked) ---
    if (!html) {
      try {
        usedProxy = true;
        // keep_headers=true tells ScraperAPI to forward our headers (including Cookie) to the target
        const proxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&keep_headers=true&url=${encodeURIComponent(targetUrl)}`;
        console.log(`🔀 ScraperAPI fetch: ${targetUrl}`);
        const proxyRes = await fetch(proxyUrl, {
          headers: sharedHeaders,
          cache: 'no-store',
        });

        if (proxyRes.status !== 200) {
          return NextResponse.json({ success: false, error: `ScraperAPI returned HTTP ${proxyRes.status}` }, { status: 500 });
        }
        html = await proxyRes.text();
        console.log(`✅ ScraperAPI fetch succeeded (${html.length} bytes)`);
      } catch (e: any) {
        console.error('❌ ScraperAPI fetch error:', e);
        return NextResponse.json({ success: false, error: `All fetch attempts failed: ${e.message}` }, { status: 500 });
      }
    }


    // 3. Parse players with Cheerio
    const $ = cheerio.load(html);
    const playersTable = $('table.players').first().length ? $('table.players').first() : $('table').first();

    if (!playersTable.length) {
      return NextResponse.json({ success: true, count: 0, message: 'No players table found' });
    }

    const rows = playersTable.find('tr');
    if (rows.length < 2) {
      return NextResponse.json({ success: true, count: 0, message: 'No players found on page' });
    }

    // Map headers to fields
    const headerCols = rows.first().find('th');
    const colMap: { [key: string]: number } = {};

    headerCols.each((idx, col) => {
      const link = $(col).find('a');
      const colText = (link.length ? link.text() : $(col).text()).trim().toLowerCase();

      // Mappings similar to scraper.py
      const mappings: { [key: string]: string } = {
        'id': 'player_id',
        'pos': 'position',
        'position': 'position',
        'shirt name': 'shirt_name',
        'club team': 'team_name',
        'team name': 'team_name',
        'club_team': 'team_name',
        'nationality': 'nationality',
        'height': 'height',
        'weight': 'weight',
        'age': 'age',
        'overall rating': 'overall_rating',
        'overall_rating': 'overall_rating',
        'playing style': 'playing_style',
        'playing_style': 'playing_style',
        'offensive awareness': 'offensive_awareness',
        'ball control': 'ball_control',
        'dribbling': 'dribbling',
        'tight possession': 'tight_possession',
        'low pass': 'low_pass',
        'lofted pass': 'lofted_pass',
        'finishing': 'finishing',
        'heading': 'heading',
        'set piece taking': 'set_piece_taking',
        'curl': 'curl',
        'speed': 'speed',
        'acceleration': 'acceleration',
        'kicking power': 'kicking_power',
        'jumping': 'jumping',
        'physical contact': 'physical_contact',
        'balance': 'balance',
        'stamina': 'stamina',
        'defensive awareness': 'defensive_awareness',
        'tackling': 'tackling',
        'aggression': 'aggression',
        'defensive engagement': 'defensive_engagement',
        'gk awareness': 'gk_awareness',
        'gk catching': 'gk_catching',
        'gk parrying': 'gk_parrying',
        'gk reflexes': 'gk_reflexes',
        'gk reach': 'gk_reach',
        'featured': 'featured',
        'featured players': 'featured',
        'featured_players': 'featured'
      };

      for (const [key, value] of Object.entries(mappings)) {
        if (colText === key) {
          colMap[value] = idx;
          break;
        }
      }

      // Fallback substring mapping
      if (colMap['player_id'] === undefined && colText.includes('id')) colMap['player_id'] = idx;
      if (colMap['team_name'] === undefined && (colText.includes('club') || colText.includes('team'))) colMap['team_name'] = idx;
    });

    // Make sure we have name mapping
    headerCols.each((idx, col) => {
      const colText = $(col).text().trim().toLowerCase();
      if (colText === 'name' || colText === 'player name') {
        colMap['name'] = idx;
      }
    });

    // Parse players rows
    const parsedPlayers: any[] = [];
    let totalRowsParsed = 0;
    let belowMinRatingCount = 0;
    let noStatsCount = 0; // Players where cookie didn't apply — stats all zero

    // Detect if the stat columns were actually returned by pesdb.net.
    // If colMap has no entry for 'offensive_awareness' the cookie was ignored.
    const statsColumns = [
      'offensive_awareness', 'ball_control', 'dribbling', 'tight_possession', 'low_pass', 'lofted_pass',
      'finishing', 'heading', 'set_piece_taking', 'curl', 'speed', 'acceleration', 'kicking_power', 'jumping',
      'physical_contact', 'balance', 'stamina', 'defensive_awareness', 'tackling', 'aggression',
      'defensive_engagement', 'gk_awareness', 'gk_catching', 'gk_parrying', 'gk_reflexes', 'gk_reach'
    ];
    const cookieWorked = statsColumns.some(f => colMap[f] !== undefined);

    if (!cookieWorked) {
      // The cookie was stripped — pesdb.net rendered a minimal table with no stat columns.
      // Return an error so the frontend can retry rather than save stat-less records.
      console.warn('⚠️ No stat columns found in HTML — cookie was not applied by the proxy.');
      return NextResponse.json({
        success: false,
        cookieError: true,
        error: 'Stat columns missing: the columns cookie was not forwarded to pesdb.net. Retry this page.'
      }, { status: 502 });
    }
    
    rows.slice(1).each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length < 5) return;
      totalRowsParsed++;

      const safeInt = (text: string) => {
        const val = parseInt(text.replace(/[^0-9]/g, ''));
        return isNaN(val) ? 0 : val;
      };

      const safeText = (text: string) => {
        return text.trim();
      };

      // Extract player_id from link
      let playerId = '';
      const nameIndex = colMap['name'] !== undefined ? colMap['name'] : 0;
      const nameCell = cols.eq(nameIndex);
      const link = nameCell.find('a');
      if (link.length && link.attr('href')) {
        const href = link.attr('href') || '';
        if (href.includes('?id=')) {
          playerId = href.split('?id=')[1].split('&')[0];
        }
      }

      if (!playerId) {
        // Fallback to reading player_id column
        const idIndex = colMap['player_id'];
        if (idIndex !== undefined) {
          playerId = cols.eq(idIndex).text().trim();
        }
      }

      if (!playerId) return; // Skip if no ID

      // Extract featured column and skip if it is a featured player
      const featuredIndex = colMap['featured'];
      const featuredVal = featuredIndex !== undefined ? safeText(cols.eq(featuredIndex).text()) : '';
      if (featuredVal && featuredVal.toLowerCase() !== 'none') {
        return; // Skip featured players (continue to next row)
      }

      // Extract position from columns, fallback to positionUpper if column is missing
      const posIndex = colMap['position'];
      let playerPosition = positionUpper;
      if (posIndex !== undefined) {
        const textVal = safeText(cols.eq(posIndex).text()).toUpperCase();
        if (textVal) {
          playerPosition = textVal;
        }
      }

      const player: any = {
        player_id: playerId,
        name: safeText(cols.eq(nameIndex).text()),
        position: playerPosition,
        team_name: colMap['team_name'] !== undefined ? safeText(cols.eq(colMap['team_name']).text()) : '',
        nationality: colMap['nationality'] !== undefined ? safeText(cols.eq(colMap['nationality']).text()) : '',
        age: colMap['age'] !== undefined ? safeInt(cols.eq(colMap['age']).text()) : 0,
        playing_style: colMap['playing_style'] !== undefined ? safeText(cols.eq(colMap['playing_style']).text()) : '',
        overall_rating: colMap['overall_rating'] !== undefined ? safeInt(cols.eq(colMap['overall_rating']).text()) : 0
      };

      // Extract stats
      statsColumns.forEach(field => {
        const idx = colMap[field];
        player[field] = idx !== undefined ? safeInt(cols.eq(idx).text()) : 0;
      });

      // Guard: if all numeric stats are 0 but the player has a rating, the cookie
      // didn't apply for this row. Skip instead of saving zeroed-out data.
      const hasAnyStats = statsColumns.some(f => player[f] > 0);
      if (!hasAnyStats && player.overall_rating > 0) {
        noStatsCount++;
        return;
      }

      if (minRating > 0 && player.overall_rating < minRating) {
        belowMinRatingCount++;
        return; // Skip if below minimum rating
      }

      if (player.name && player.player_id) {
        parsedPlayers.push(player);
      }
    });

    if (parsedPlayers.length === 0) {
      if (totalRowsParsed > 0 && belowMinRatingCount === totalRowsParsed) {
        return NextResponse.json({ success: true, count: 0, minRatingReached: true, message: 'Reached minimum rating threshold' });
      }
      if (noStatsCount > 0) {
        return NextResponse.json({ success: false, cookieError: true, count: 0, error: `All ${noStatsCount} rows had zero stats — cookie may not have been applied. Retry this page.` }, { status: 502 });
      }
      return NextResponse.json({ success: true, count: 0, message: 'Failed to parse any players from page' });
    }

    // 4. Batch-Insert players into PostgreSQL temp table
    const columnsToInsert = [
      'player_id', 'name', 'position', 'team_name', 'nationality', 'age', 'playing_style', 'overall_rating',
      'offensive_awareness', 'ball_control', 'dribbling', 'tight_possession', 'low_pass', 'lofted_pass',
      'finishing', 'heading', 'set_piece_taking', 'curl', 'speed', 'acceleration', 'kicking_power', 'jumping',
      'physical_contact', 'balance', 'stamina', 'defensive_awareness', 'tackling', 'aggression',
      'defensive_engagement', 'gk_awareness', 'gk_catching', 'gk_parrying', 'gk_reflexes', 'gk_reach'
    ];

    const valuePlaceholders: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    parsedPlayers.forEach(p => {
      const rowPlaceholders: string[] = [];
      columnsToInsert.forEach(col => {
        rowPlaceholders.push(`$${paramIndex++}`);
        if (col === 'overall_rating' || col === 'age') {
          queryParams.push(p[col] ? Number(p[col]) : null);
        } else if (typeof p[col] === 'number') {
          queryParams.push(Number(p[col]));
        } else {
          queryParams.push(p[col] || null);
        }
      });
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    });

    const query = `
      INSERT INTO temp_players_import (${columnsToInsert.join(', ')})
      VALUES ${valuePlaceholders.join(', ')}
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
        gk_reach = EXCLUDED.gk_reach;
    `;

    await tempSql.query(query, queryParams);

    return NextResponse.json({
      success: true,
      count: parsedPlayers.length,
      noStatsSkipped: noStatsCount,
      message: `Scraped ${parsedPlayers.length} players from ${positionUpper} page ${page}${noStatsCount > 0 ? ` (${noStatsCount} skipped — no stats)` : ''}`
    });

  } catch (error: any) {
    console.error('❌ Scraper error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
