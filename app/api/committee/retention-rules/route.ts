import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';
import { verifyAuth } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface RetentionTier {
  id: string;
  label: string;
  minRank: number;
  maxRank: number;
  formula: string;
  percentage: number;
  amount: number;
}

export interface CategoryRetentionRules {
  basePrice: number;
  tiers: RetentionTier[];
}

export interface RetentionSettings {
  seasonId: string;
  mode: 'rank' | 'percentage';
  totalPurse: number;
  rules: {
    WHITE: CategoryRetentionRules;
    BLUE: CategoryRetentionRules;
    BLACK: CategoryRetentionRules;
    RED: CategoryRetentionRules;
    [key: string]: CategoryRetentionRules;
  };
}

export const DEFAULT_SEASON_19_RULES: RetentionSettings['rules'] = {
  WHITE: {
    basePrice: 10,
    tiers: [
      { id: 'white-1', label: 'Rank 1-6', minRank: 1, maxRank: 6, formula: 'Base + 500%', percentage: 600, amount: 60 },
      { id: 'white-2', label: 'Rank 7-12', minRank: 7, maxRank: 12, formula: 'Base + 400%', percentage: 500, amount: 50 },
      { id: 'white-3', label: 'Rank 13-16', minRank: 13, maxRank: 16, formula: '400% of Base', percentage: 400, amount: 40 },
    ],
  },
  BLUE: {
    basePrice: 15,
    tiers: [
      { id: 'blue-1', label: 'Rank 1-8', minRank: 1, maxRank: 8, formula: 'Base + 400%', percentage: 500, amount: 75 },
      { id: 'blue-2', label: 'Rank 9-16', minRank: 9, maxRank: 16, formula: '400% of Base', percentage: 400, amount: 60 },
    ],
  },
  BLACK: {
    basePrice: 20,
    tiers: [
      { id: 'black-1', label: 'Rank 1-6', minRank: 1, maxRank: 6, formula: 'Base + 500%', percentage: 600, amount: 120 },
      { id: 'black-2', label: 'Rank 7-12', minRank: 7, maxRank: 12, formula: 'Base + 400%', percentage: 500, amount: 100 },
      { id: 'black-3', label: 'Rank 13-16', minRank: 13, maxRank: 16, formula: '400% of Base', percentage: 400, amount: 80 },
    ],
  },
  RED: {
    basePrice: 25,
    tiers: [
      { id: 'red-1', label: 'Rank 1-8', minRank: 1, maxRank: 8, formula: 'Base + 600%', percentage: 700, amount: 175 },
      { id: 'red-2', label: 'Rank 9-16', minRank: 9, maxRank: 16, formula: 'Base + 500%', percentage: 600, amount: 150 },
      { id: 'red-3', label: 'Rank 17-32', minRank: 17, maxRank: 32, formula: 'Base + 400%', percentage: 500, amount: 125 },
    ],
  },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('seasonId');

    if (!seasonId) {
      return NextResponse.json({ success: false, error: 'seasonId is required' }, { status: 400 });
    }

    const sql = getMainDb();
    const seasonRows = await sql`SELECT id, dollar_budget, raw_data FROM seasons WHERE id = ${seasonId} LIMIT 1`;

    if (seasonRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Season not found' }, { status: 404 });
    }

    const season = seasonRows[0];
    const rawData = season.raw_data || {};
    const existingSettings = rawData.retention_settings;

    const totalPurse = existingSettings?.totalPurse ?? (season.dollar_budget ? Number(season.dollar_budget) : 400);
    const mode = existingSettings?.mode ?? 'rank';
    const rules = existingSettings?.rules ?? DEFAULT_SEASON_19_RULES;

    return NextResponse.json({
      success: true,
      data: {
        seasonId,
        mode,
        totalPurse,
        rules,
      },
    });
  } catch (error: any) {
    console.error('Error fetching retention rules:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { seasonId, mode, totalPurse, rules, syncTeamBudgets } = body;

    if (!seasonId) {
      return NextResponse.json({ success: false, error: 'seasonId is required' }, { status: 400 });
    }

    const sql = getMainDb();

    // Fetch current raw_data
    const seasonRows = await sql`SELECT id, dollar_budget, raw_data FROM seasons WHERE id = ${seasonId} LIMIT 1`;
    if (seasonRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Season not found' }, { status: 404 });
    }

    const season = seasonRows[0];
    const rawData = season.raw_data || {};
    const updatedRetentionSettings = {
      seasonId,
      mode: mode || 'rank',
      totalPurse: Number(totalPurse) || (season.dollar_budget ? Number(season.dollar_budget) : 400),
      rules: rules || DEFAULT_SEASON_19_RULES,
      updated_at: new Date().toISOString(),
    };

    const newRawData = {
      ...rawData,
      retention_settings: updatedRetentionSettings,
    };

    // Update seasons table
    await sql`
      UPDATE seasons
      SET dollar_budget = ${updatedRetentionSettings.totalPurse},
          raw_data = ${JSON.stringify(newRawData)}::jsonb,
          updated_at = NOW()
      WHERE id = ${seasonId}
    `;

    // Optionally sync all team purses in team_seasons
    if (syncTeamBudgets) {
      const purse = updatedRetentionSettings.totalPurse;
      await sql`
        UPDATE team_seasons
        SET real_player_budget = ${purse} - COALESCE(real_player_spent, 0),
            raw_data = jsonb_set(
              jsonb_set(COALESCE(raw_data, '{}'::jsonb), '{real_player_budget}', ${String(purse)}::jsonb),
              '{initial_real_player_budget}', ${String(purse)}::jsonb
            ),
            updated_at = NOW()
        WHERE season_id = ${seasonId}
      `;
    }

    return NextResponse.json({
      success: true,
      message: 'Retention rules saved successfully',
      data: updatedRetentionSettings,
    });
  } catch (error: any) {
    console.error('Error saving retention rules:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
