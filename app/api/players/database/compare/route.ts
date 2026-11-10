import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon/config';
import { tempSql, initializeTempTable } from '@/lib/neon/temp-config';

export async function GET(request: NextRequest) {
  try {
    // 1. Initialize temp table if missing
    await initializeTempTable();

    // 2. Fetch all temp players
    let tempPlayers: any[] = [];
    try {
      tempPlayers = await tempSql.query('SELECT * FROM temp_players_import ORDER BY name ASC');
    } catch (e: any) {
      console.error('Error fetching temp players:', e);
      return NextResponse.json({ success: false, error: 'Failed to query temporary database table.' }, { status: 500 });
    }

    // 3. Fetch all active players
    let activePlayers: any[] = [];
    try {
      // Fetch stats columns as well as basic info (excluding retired players)
      activePlayers = await sql.query('SELECT * FROM footballplayers WHERE (retired IS NOT TRUE) ORDER BY name ASC');
    } catch (e: any) {
      console.error('Error fetching active players:', e);
      return NextResponse.json({ success: false, error: 'Failed to query active database players.' }, { status: 500 });
    }

    // 4. Create maps for quick lookup
    const activeMap = new Map<string, any>();
    activePlayers.forEach(p => {
      if (p.player_id) {
        activeMap.set(p.player_id.toString(), p);
      }
    });

    const tempMap = new Map<string, any>();
    tempPlayers.forEach(p => {
      if (p.player_id) {
        tempMap.set(p.player_id.toString(), p);
      }
    });

    // Pre-build index for active players by name + nationality for O(1) duplicate checks
    const activeDupMap = new Map<string, any[]>();
    activePlayers.forEach(p => {
      if (p.name && p.nationality) {
        const key = `${p.name.trim().toLowerCase()}_${p.nationality.trim().toLowerCase()}`;
        if (!activeDupMap.has(key)) {
          activeDupMap.set(key, []);
        }
        activeDupMap.get(key)!.push(p);
      }
    });

    // Pre-build index for temp players by name + nationality for O(1) duplicate checks
    const tempDupMap = new Map<string, any[]>();
    tempPlayers.forEach(p => {
      if (p.name && p.nationality) {
        const key = `${p.name.trim().toLowerCase()}_${p.nationality.trim().toLowerCase()}`;
        if (!tempDupMap.has(key)) {
          tempDupMap.set(key, []);
        }
        tempDupMap.get(key)!.push(p);
      }
    });

    // 5. Compare player data
    const toUpdate: any[] = [];
    const toCreate: any[] = [];
    const unchanged: any[] = [];
    const notFoundInNew: any[] = [];

    const normalizeVal = (val: any) => {
      if (val === null || val === undefined || val === '') return '';
      return String(val).trim();
    };

    const normalizeNumber = (val: any) => {
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    const statsFields = [
      'offensive_awareness', 'ball_control', 'dribbling', 'tight_possession',
      'low_pass', 'lofted_pass', 'finishing', 'heading', 'set_piece_taking',
      'curl', 'speed', 'acceleration', 'kicking_power', 'jumping',
      'physical_contact', 'balance', 'stamina', 'defensive_awareness',
      'tackling', 'aggression', 'defensive_engagement', 'gk_awareness',
      'gk_catching', 'gk_parrying', 'gk_reflexes', 'gk_reach'
    ];

    const statLabels: Record<string, string> = {
      speed: 'Pace / Speed',
      acceleration: 'Acceleration',
      finishing: 'Shooting / Finishing',
      low_pass: 'Passing / Low Pass',
      lofted_pass: 'Lofted Pass',
      dribbling: 'Dribbling',
      ball_control: 'Ball Control',
      tight_possession: 'Tight Possession',
      offensive_awareness: 'Offensive Awareness',
      heading: 'Heading',
      set_piece_taking: 'Set Piece',
      curl: 'Curl',
      kicking_power: 'Kicking Power',
      jumping: 'Jumping',
      physical_contact: 'Physical Contact',
      balance: 'Balance',
      stamina: 'Stamina',
      defensive_awareness: 'Defending Awareness',
      tackling: 'Tackling',
      aggression: 'Aggression',
      defensive_engagement: 'Defensive Engagement',
      gk_awareness: 'GK Awareness',
      gk_catching: 'GK Catching',
      gk_parrying: 'GK Parrying',
      gk_reflexes: 'GK Reflexes',
      gk_reach: 'GK Reach'
    };

    // Check temp players to update or create
    tempPlayers.forEach(tempPlayer => {
      const playerId = tempPlayer.player_id?.toString();
      if (!playerId) return;

      const activePlayer = activeMap.get(playerId);
      if (activePlayer) {
        // Build comparative records mapping aggregate attributes for UI
        const oldValues: any = {
          position: normalizeVal(activePlayer.position),
          overall_rating: normalizeNumber(activePlayer.overall_rating),
          playing_style: normalizeVal(activePlayer.playing_style),
          team_name: normalizeVal(activePlayer.team_name), // SS League team
          club: normalizeVal(activePlayer.club), // real club
          nationality: normalizeVal(activePlayer.nationality),
          age: normalizeNumber(activePlayer.age), // age
        };

        const newValues: any = {
          position: normalizeVal(tempPlayer.position) || normalizeVal(activePlayer.position),
          overall_rating: normalizeNumber(tempPlayer.overall_rating) || normalizeNumber(activePlayer.overall_rating),
          playing_style: normalizeVal(tempPlayer.playing_style) || normalizeVal(activePlayer.playing_style),
          team_name: normalizeVal(activePlayer.team_name), // preserve the active SS League team assignment so we don't overwrite it or flag it as a change!
          club: normalizeVal(tempPlayer.team_name) || normalizeVal(activePlayer.club), // real club from temp database
          nationality: normalizeVal(tempPlayer.nationality) || normalizeVal(activePlayer.nationality),
          age: normalizeNumber(tempPlayer.age) || normalizeNumber(activePlayer.age), // age from temp database
        };

        const changes: any[] = [];

        if (oldValues.club !== newValues.club) {
          changes.push({
            field: 'club',
            label: 'Club',
            category: 'info',
            old: oldValues.club || 'None',
            new: newValues.club || 'None'
          });
        }

        if (oldValues.position !== newValues.position) {
          changes.push({
            field: 'position',
            label: 'Position',
            category: 'info',
            old: oldValues.position || '-',
            new: newValues.position || '-'
          });
        }

        if (oldValues.overall_rating !== newValues.overall_rating) {
          changes.push({
            field: 'overall_rating',
            label: 'Overall Rating (OVR)',
            category: 'stat',
            old: oldValues.overall_rating,
            new: newValues.overall_rating,
            diff: newValues.overall_rating - oldValues.overall_rating
          });
        }

        if (oldValues.playing_style !== newValues.playing_style) {
          changes.push({
            field: 'playing_style',
            label: 'Playing Style',
            category: 'info',
            old: oldValues.playing_style || 'None',
            new: newValues.playing_style || 'None'
          });
        }

        if (oldValues.age !== newValues.age) {
          changes.push({
            field: 'age',
            label: 'Age',
            category: 'info',
            old: oldValues.age,
            new: newValues.age,
            diff: newValues.age - oldValues.age
          });
        }

        if (oldValues.nationality !== newValues.nationality) {
          changes.push({
            field: 'nationality',
            label: 'Nationality',
            category: 'info',
            old: oldValues.nationality || 'None',
            new: newValues.nationality || 'None'
          });
        }

        // Add all stats comparison
        statsFields.forEach(stat => {
          const oldStat = normalizeNumber(activePlayer[stat]);
          let newStat = normalizeNumber(tempPlayer[stat]);
          // Fall back to oldStat if newStat is 0 (missing in import) but oldStat is > 0
          if (newStat === 0 && oldStat > 0) {
            newStat = oldStat;
          }
          oldValues[stat] = oldStat;
          newValues[stat] = newStat;
          if (oldStat !== newStat) {
            changes.push({
              field: stat,
              label: statLabels[stat] || stat,
              category: 'stat',
              old: oldStat,
              new: newStat,
              diff: newStat - oldStat
            });
          }
        });

        // Set aliases for UI grids
        oldValues.pace = oldValues.speed;
        newValues.pace = newValues.speed;
        oldValues.shooting = oldValues.finishing;
        newValues.shooting = newValues.finishing;
        oldValues.passing = oldValues.low_pass;
        newValues.passing = newValues.low_pass;
        oldValues.dribbling = oldValues.dribbling;
        newValues.dribbling = newValues.dribbling;
        oldValues.defending = oldValues.defensive_awareness;
        newValues.defending = newValues.defensive_awareness;
        oldValues.physical = oldValues.physical_contact;
        newValues.physical = newValues.physical_contact;

        if (changes.length > 0) {
          toUpdate.push({
            player_id: playerId,
            name: tempPlayer.name,
            old: oldValues,
            new: newValues,
            changes
          });
        } else {
          unchanged.push({
            player_id: playerId,
            name: tempPlayer.name,
            position: activePlayer.position,
            overall_rating: activePlayer.overall_rating,
            team_name: activePlayer.team_name,
            club: activePlayer.club
          });
        }
      } else {
        // Player in scraped temp database but not active database -> will be created
        // Cross check with active players using name and nationality (O(1) Map Lookup)
        const dupKey = tempPlayer.name && tempPlayer.nationality
          ? `${tempPlayer.name.trim().toLowerCase()}_${tempPlayer.nationality.trim().toLowerCase()}`
          : '';

        const activeDuplicates = dupKey ? (activeDupMap.get(dupKey) || []) : [];
        const tempDuplicates = dupKey 
          ? (tempDupMap.get(dupKey) || []).filter(tempP => tempP.player_id?.toString() !== playerId)
          : [];

        const allDuplicates = [
          ...activeDuplicates.map(d => ({
            id: d.id,
            player_id: d.player_id,
            name: d.name,
            overall_rating: d.overall_rating,
            position: d.position,
            club: d.club,
            team_name: d.team_name,
            nationality: d.nationality,
            source: 'active'
          })),
          ...tempDuplicates.map(d => ({
            player_id: d.player_id,
            name: d.name,
            overall_rating: d.overall_rating,
            position: d.position,
            club: d.team_name,
            team_name: d.team_name,
            nationality: d.nationality,
            source: 'temp'
          }))
        ];

        toCreate.push({
          player_id: playerId,
          name: tempPlayer.name,
          position: tempPlayer.position,
          overall_rating: tempPlayer.overall_rating,
          playing_style: tempPlayer.playing_style,
          team_name: tempPlayer.team_name,
          nationality: tempPlayer.nationality,
          age: tempPlayer.age,
          pace: tempPlayer.speed,
          shooting: tempPlayer.finishing,
          passing: tempPlayer.low_pass,
          dribbling: tempPlayer.dribbling,
          defending: tempPlayer.defensive_awareness,
          physical: tempPlayer.physical_contact,
          hasDuplicates: allDuplicates.length > 0,
          duplicates: allDuplicates
        });
      }
    });

    // Fetch counts from bids, round_bids, and player_history grouped by player_id
    const bidsCountsResult = await sql.query('SELECT player_id, COUNT(*) as count FROM bids GROUP BY player_id');
    const roundBidsCountsResult = await sql.query('SELECT player_id, COUNT(*) as count FROM round_bids GROUP BY player_id');
    const historyCountsResult = await sql.query('SELECT player_id, COUNT(*) as count FROM player_history GROUP BY player_id');
    const teamPlayersCountsResult = await sql.query('SELECT player_id, COUNT(*) as count FROM team_players GROUP BY player_id');

    // Create maps for quick O(1) count lookup
    const bidsCountsMap = new Map<string, number>();
    bidsCountsResult.forEach((row: any) => bidsCountsMap.set(String(row.player_id), Number(row.count)));

    const roundBidsCountsMap = new Map<string, number>();
    roundBidsCountsResult.forEach((row: any) => roundBidsCountsMap.set(String(row.player_id), Number(row.count)));

    const historyCountsMap = new Map<string, number>();
    historyCountsResult.forEach((row: any) => historyCountsMap.set(String(row.player_id), Number(row.count)));

    const teamPlayersCountsMap = new Map<string, number>();
    teamPlayersCountsResult.forEach((row: any) => teamPlayersCountsMap.set(String(row.player_id), Number(row.count)));

    // Check active players not found in new temp upload
    activePlayers.forEach(activePlayer => {
      const playerId = activePlayer.player_id?.toString();
      if (!playerId) return;

      if (!tempMap.has(playerId)) {
        const uuid = activePlayer.id;
        const scrapedId = activePlayer.player_id?.toString();

        const bidsCount = bidsCountsMap.get(uuid) || 0;
        const roundBidsCount = roundBidsCountsMap.get(uuid) || 0;
        const historyCount = scrapedId ? (historyCountsMap.get(scrapedId) || 0) : 0;
        const teamPlayersCount = teamPlayersCountsMap.get(uuid) || 0;

        notFoundInNew.push({
          id: uuid,
          player_id: playerId,
          name: activePlayer.name,
          position: activePlayer.position,
          overall_rating: activePlayer.overall_rating,
          team_name: activePlayer.team_name,
          is_sold: activePlayer.is_sold,
          nationality: activePlayer.nationality,
          club: activePlayer.club,
          age: activePlayer.age,
          bidsCount,
          roundBidsCount,
          historyCount,
          teamPlayersCount
        });
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        toUpdate,
        toCreate,
        unchanged,
        notFoundInNew,
        summary: {
          totalExisting: activePlayers.length,
          totalNew: tempPlayers.length,
          totalTemp: tempPlayers.length,
          willUpdate: toUpdate.length,
          willCreate: toCreate.length,
          unchanged: unchanged.length,
          notFound: notFoundInNew.length
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Error comparing temp import:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
