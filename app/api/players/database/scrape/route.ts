import { NextRequest, NextResponse } from 'next/server';
import { tempSql, initializeTempTable } from '@/lib/neon/temp-config';
import * as cheerio from 'cheerio';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
];

const POSITION_CODES: { [key: string]: number } = {
  GK: 0, CB: 1, LB: 2, RB: 3, DMF: 4, CMF: 5, LMF: 6, RMF: 7, AMF: 8, LWF: 9, RWF: 10, SS: 11, CF: 12
};

function normalizeClub(club: any): string {
  if (!club) return 'Free Agents';
  const trimmed = String(club).trim();
  if (
    !trimmed ||
    trimmed === '-' ||
    trimmed.toUpperCase() === 'FREE' ||
    trimmed.toLowerCase() === 'free agent' ||
    trimmed.toLowerCase() === 'free agents' ||
    trimmed.toLowerCase() === 'freeagent' ||
    trimmed.toLowerCase() === 'freeagents' ||
    trimmed.toLowerCase() === 'none'
  ) {
    return 'Free Agents';
  }
  return trimmed;
}

const STATS_COLUMNS = [
  'offensive_awareness', 'ball_control', 'dribbling', 'tight_possession', 'low_pass', 'lofted_pass',
  'finishing', 'heading', 'set_piece_taking', 'curl', 'speed', 'acceleration', 'kicking_power', 'jumping',
  'physical_contact', 'balance', 'stamina', 'defensive_awareness', 'tackling', 'aggression',
  'defensive_engagement', 'gk_awareness', 'gk_catching', 'gk_parrying', 'gk_reflexes', 'gk_reach'
];

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      try {
        results[idx] = await fn(items[idx]);
      } catch (e: any) {
        console.error(`Error processing item ${idx}:`, e.message);
        results[idx] = null as any;
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchHtmlWithFallback(url: string, headers: any, scraperKeys: string[]): Promise<string> {
  // 1. Direct fetch
  try {
    const directRes = await fetch(url, { headers, cache: 'no-store' });
    if (directRes.status === 200) {
      return await directRes.text();
    }
  } catch (e) {
    // Direct fetch failed, fallback to ScraperAPI
  }

  // 2. ScraperAPI fallback
  for (const key of scraperKeys) {
    try {
      const proxyUrl = `http://api.scraperapi.com?api_key=${key}&keep_headers=true&url=${encodeURIComponent(url)}`;
      const proxyRes = await fetch(proxyUrl, { headers, cache: 'no-store' });
      if (proxyRes.status === 200) {
        return await proxyRes.text();
      }
    } catch (e) {
      // Continue to next key
    }
  }

  return '';
}

async function fetchPlayerDetailStats(playerId: string, scraperKeys: string[]): Promise<{ stats: { [key: string]: number }; playing_style: string }> {
  const url = `https://pesdb.net/efootball/?id=${playerId}`;
  const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const headers = {
    'User-Agent': randomUserAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  };

  const html = await fetchHtmlWithFallback(url, headers, scraperKeys);
  if (!html) {
    return { stats: {}, playing_style: '' };
  }

  const $ = cheerio.load(html);
  const stats: { [key: string]: number } = {};
  $('[data-stat-value]').each(function() {
    const k = $(this).attr('data-stat-value');
    if (k) {
      stats[k] = parseInt($(this).text().replace(/[^0-9]/g, '')) || 0;
    }
  });

  const playing_style = $('a[href*="playing_style_2"]').first().text().trim() || $('a[href*="playing_style"]').first().text().trim() || '';
  return { stats, playing_style };
}

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

    // 2. Build target URL with standard availability and overall rating sort descending
    const targetUrl = `https://pesdb.net/efootball/players/?pos[0]=${posCode}&page=${page}&availability=standard&sort=overall_rating&order=desc`;
    const scraperKeys = [
      process.env.SCRAPER_API_KEY,
      process.env.BACKUP_SCRAPER_API_KEY,
      "c042d3b9be6af433b58e0ace8b98d66b",
      "12e89d3469aa5f5bb80cbba557ceec9b"
    ].filter(Boolean) as string[];

    const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const sharedHeaders = {
      'User-Agent': randomUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': 'https://pesdb.net/efootball/players/',
      'Cookie': 'pesdb_efootball_search=' + encodeURIComponent(JSON.stringify({ view: 'table' }))
    };

    console.log(`🌐 Fetching search results for ${positionUpper} page ${page}...`);
    const html = await fetchHtmlWithFallback(targetUrl, sharedHeaders, scraperKeys);

    if (!html) {
      return NextResponse.json({ success: false, error: 'Failed to fetch search page from pesdb.net' }, { status: 502 });
    }

    // 3. Parse players from HTML (table view or card view)
    const $ = cheerio.load(html);
    const tableRows = $('table.player-results-table tbody tr');
    const cards = $('.efootball-result-card');

    const basicPlayers: any[] = [];

    if (tableRows.length > 0) {
      tableRows.each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 5) return;
        const nameA = cells.eq(1).find('a');
        const name = nameA.text().trim();
        const href = nameA.attr('href') || '';
        const idMatch = href.match(/-(\d+)$/);
        const playerId = idMatch ? idMatch[1] : '';
        if (!playerId || !name) return;

        const playerPos = cells.eq(0).text().trim().toUpperCase() || positionUpper;
        const club = normalizeClub(cells.eq(2).text().trim());
        const nat = cells.eq(3).text().trim();
        const age = parseInt(cells.eq(6).text().replace(/[^0-9]/g, '')) || 0;
        const overall_rating = parseInt(cells.last().text().replace(/[^0-9]/g, '')) || 0;

        basicPlayers.push({
          player_id: playerId,
          name,
          position: playerPos,
          team_name: club,
          nationality: nat,
          age,
          overall_rating
        });
      });
    } else if (cards.length > 0) {
      cards.each((_, card) => {
        const nameA = $(card).find('h2.efootball-result-name a');
        const name = nameA.text().trim();
        const href = nameA.attr('href') || '';
        const idMatch = href.match(/-(\d+)$/);
        const playerId = idMatch ? idMatch[1] : '';
        if (!playerId || !name) return;

        const img = $(card).find('img');
        const alt = img.attr('alt') || '';
        const ovrMatch = alt.match(/OVR\s*(\d+)/i);
        const overall_rating = ovrMatch ? parseInt(ovrMatch[1]) : 0;
        const posMatch = alt.match(/—\s*([A-Z]+),/i);
        const playerPos = posMatch ? posMatch[1].toUpperCase() : positionUpper;

        basicPlayers.push({
          player_id: playerId,
          name,
          position: playerPos,
          team_name: 'Free Agents',
          nationality: '',
          age: 0,
          overall_rating
        });
      });
    }

    if (basicPlayers.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No players found on page' });
    }

    // 4. Min Rating filter & threshold check
    let minRatingReached = false;
    let eligiblePlayers = basicPlayers;

    if (minRating > 0) {
      eligiblePlayers = basicPlayers.filter(p => p.overall_rating >= minRating);
      if (eligiblePlayers.length < basicPlayers.length) {
        minRatingReached = true;
      }
      if (eligiblePlayers.length === 0) {
        return NextResponse.json({
          success: true,
          count: 0,
          minRatingReached: true,
          message: `All players on page ${page} are below minimum rating ${minRating}`
        });
      }
    }

    // 5. Fetch full detailed stats concurrently (concurrency 4)
    console.log(`⚡ Fetching detailed stats for ${eligiblePlayers.length} players from ${positionUpper} page ${page}...`);
    const detailedPlayers = await mapConcurrent(eligiblePlayers, 4, async (p) => {
      const { stats, playing_style } = await fetchPlayerDetailStats(p.player_id, scraperKeys);
      return {
        ...p,
        playing_style: playing_style || p.playing_style || '',
        ...stats
      };
    });

    const validPlayers = detailedPlayers.filter(Boolean);
    if (validPlayers.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'Failed to process players' });
    }

    // 6. Batch-Insert players into PostgreSQL temp table
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

    validPlayers.forEach((p: any) => {
      const rowPlaceholders: string[] = [];
      columnsToInsert.forEach((col: any) => {
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
      count: validPlayers.length,
      minRatingReached,
      message: `Scraped ${validPlayers.length} players from ${positionUpper} page ${page}`
    });

  } catch (error: any) {
    console.error('❌ Scraper error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
