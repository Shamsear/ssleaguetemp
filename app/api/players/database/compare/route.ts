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
      // Fetch stats columns as well as basic info
      activePlayers = await sql.query('SELECT * FROM footballplayers ORDER BY name ASC');
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
          team_name: normalizeVal(activePlayer.team_name || activePlayer.club),
          pace: normalizeNumber(activePlayer.speed),
          shooting: normalizeNumber(activePlayer.finishing),
          passing: normalizeNumber(activePlayer.low_pass),
          dribbling: normalizeNumber(activePlayer.dribbling),
          defending: normalizeNumber(activePlayer.defensive_awareness),
          physical: normalizeNumber(activePlayer.physical_contact),
          acceleration: normalizeNumber(activePlayer.acceleration),
          ball_control: normalizeNumber(activePlayer.ball_control),
          tight_possession: normalizeNumber(activePlayer.tight_possession),
          lofted_pass: normalizeNumber(activePlayer.lofted_pass),
          heading: normalizeNumber(activePlayer.heading),
          kicking_power: normalizeNumber(activePlayer.kicking_power),
          jumping: normalizeNumber(activePlayer.jumping),
          stamina: normalizeNumber(activePlayer.stamina),
          tackling: normalizeNumber(activePlayer.tackling),
          aggression: normalizeNumber(activePlayer.aggression),
        };

        const newValues: any = {
          position: normalizeVal(tempPlayer.position),
          overall_rating: normalizeNumber(tempPlayer.overall_rating),
          playing_style: normalizeVal(tempPlayer.playing_style),
          team_name: normalizeVal(tempPlayer.team_name || tempPlayer.club),
          pace: normalizeNumber(tempPlayer.speed),
          shooting: normalizeNumber(tempPlayer.finishing),
          passing: normalizeNumber(tempPlayer.low_pass),
          dribbling: normalizeNumber(tempPlayer.dribbling),
          defending: normalizeNumber(tempPlayer.defensive_awareness),
          physical: normalizeNumber(tempPlayer.physical_contact),
          acceleration: normalizeNumber(tempPlayer.acceleration),
          ball_control: normalizeNumber(tempPlayer.ball_control),
          tight_possession: normalizeNumber(tempPlayer.tight_possession),
          lofted_pass: normalizeNumber(tempPlayer.lofted_pass),
          heading: normalizeNumber(tempPlayer.heading),
          kicking_power: normalizeNumber(tempPlayer.kicking_power),
          jumping: normalizeNumber(tempPlayer.jumping),
          stamina: normalizeNumber(tempPlayer.stamina),
          tackling: normalizeNumber(tempPlayer.tackling),
          aggression: normalizeNumber(tempPlayer.aggression),
        };

        // Add all stats comparison
        let hasStatChange = false;
        statsFields.forEach(stat => {
          const oldStat = normalizeNumber(activePlayer[stat]);
          const newStat = normalizeNumber(tempPlayer[stat]);
          oldValues[stat] = oldStat;
          newValues[stat] = newStat;
          if (oldStat !== newStat) {
            hasStatChange = true;
          }
        });

        // Determine if any mapped fields changed
        const hasBaseChange = 
          oldValues.position !== newValues.position ||
          oldValues.overall_rating !== newValues.overall_rating ||
          oldValues.playing_style !== newValues.playing_style ||
          oldValues.team_name !== newValues.team_name ||
          oldValues.pace !== newValues.pace ||
          oldValues.shooting !== newValues.shooting ||
          oldValues.passing !== newValues.passing ||
          oldValues.dribbling !== newValues.dribbling ||
          oldValues.defending !== newValues.defending ||
          oldValues.physical !== newValues.physical;

        if (hasBaseChange || hasStatChange) {
          toUpdate.push({
            player_id: playerId,
            name: tempPlayer.name,
            old: oldValues,
            new: newValues
          });
        } else {
          unchanged.push({
            player_id: playerId,
            name: tempPlayer.name,
            position: activePlayer.position,
            overall_rating: activePlayer.overall_rating,
            team_name: activePlayer.team_name
          });
        }
      } else {
        // Player in scraped temp database but not active database -> will be created
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
        });
      }
    });

    // Check active players not found in new temp upload
    activePlayers.forEach(activePlayer => {
      const playerId = activePlayer.player_id?.toString();
      if (!playerId) return;

      if (!tempMap.has(playerId)) {
        notFoundInNew.push({
          player_id: playerId,
          name: activePlayer.name,
          position: activePlayer.position,
          overall_rating: activePlayer.overall_rating,
          team_name: activePlayer.team_name,
          is_sold: activePlayer.is_sold
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
