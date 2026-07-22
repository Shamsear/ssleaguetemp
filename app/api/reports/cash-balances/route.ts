import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { adminDb } from '@/lib/firebase/admin';
import { getTournamentDb } from '@/lib/tournament-db';
import {
  getOrCreateTeamCashBalance,
  updatePaymentType,
  recordCashPayment,
} from '@/lib/cash-balance-utils';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/reports/cash-balances
 * Fetch all team cash balances and logs for a given season
 * 
 * Query Parameters:
 * - season_id: string (required)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify auth - any authenticated user role can view
    const auth = await verifyAuth(['super_admin', 'admin', 'committee_admin', 'team'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const seasonId = searchParams.get('season_id');

    if (!seasonId) {
      return NextResponse.json(
        { success: false, error: 'season_id is required' },
        { status: 400 }
      );
    }

    let teamSeasons: Array<{ team_id: string; team_name: string; team_logo: string }> = [];

    if (seasonId === 'all') {
      // For 'all' view, fetch all teams from the teams collection
      const teamsSnapshot = await adminDb.collection('teams').get();
      teamSeasons = teamsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          team_id: doc.id,
          team_name: data.name || data.team_name || doc.id,
          team_logo: data.logo_url || data.team_logo || '',
        };
      });
    } else {
      // 1. Check if season is historical
      const seasonDoc = await adminDb.collection('seasons').doc(seasonId).get();
      const isHistorical = seasonDoc.exists && seasonDoc.data()?.is_historical === true;

      if (isHistorical) {
        // Query Neon for historical team names during this season
        const sql = getTournamentDb();
        const teamStatsData = await sql`
          SELECT team_id, team_name FROM teamstats WHERE season_id = ${seasonId}
        `;
        const teamNamesMap = new Map();
        teamStatsData.forEach((row: any) => {
          teamNamesMap.set(row.team_id, row.team_name);
        });

        // For historical seasons, find teams where seasons array contains seasonId
        const teamsSnapshot = await adminDb
          .collection('teams')
          .where('seasons', 'array-contains', seasonId)
          .get();

        teamSeasons = teamsSnapshot.docs.map(doc => {
          const data = doc.data();
          const historicalName = teamNamesMap.get(doc.id) || data.name || data.team_name || doc.id;
          return {
            team_id: doc.id,
            team_name: historicalName,
            team_logo: data.logo_url || data.team_logo || '',
          };
        });
      } else {
        const showAllTeams = searchParams.get('show_all_teams') === 'true';

        // Fetch all registered team_seasons for this season
        const teamSeasonsSnapshot = await adminDb
          .collection('team_seasons')
          .where('season_id', '==', seasonId)
          .where('status', '==', 'registered')
          .get();
          
        const registeredTeamIds = new Set(
          teamSeasonsSnapshot.docs.map(doc => {
            const data = doc.data();
            return data.team_id || data.teamId || doc.id.split('_')[0];
          })
        );

        if (showAllTeams) {
          // For committee view, get all teams from the teams collection
          const teamsSnapshot = await adminDb.collection('teams').get();
          teamSeasons = teamsSnapshot.docs.map(doc => {
            const data = doc.data();
            const teamId = doc.id;
            return {
              team_id: teamId,
              team_name: data.name || data.team_name || teamId,
              team_logo: data.logo_url || data.team_logo || '',
              is_registered: registeredTeamIds.has(teamId)
            };
          });
        } else {
          // For super admin filter view, get ONLY registered teams
          const teamsSnapshot = await adminDb.collection('teams').get();
          const allTeams = teamsSnapshot.docs.map(doc => {
            const data = doc.data();
            const teamId = doc.id;
            return {
              team_id: teamId,
              team_name: data.name || data.team_name || teamId,
              team_logo: data.logo_url || data.team_logo || '',
              is_registered: true
            };
          });
          teamSeasons = allTeams.filter(t => registeredTeamIds.has(t.team_id));
        }
      }
    }

    if (teamSeasons.length === 0) {
      return NextResponse.json({
        success: true,
        balances: [],
      });
    }

    // 2. Fetch cash balances documents and calculate balances dynamically for all these teams
    const balancesPromises = teamSeasons.map(async (ts) => {
      // Fetch the main team document to get the list of all seasons they joined
      const teamDoc = await adminDb.collection('teams').doc(ts.team_id).get();
      const teamData = teamDoc.exists ? teamDoc.data() : null;
      
      const liveName = teamData?.name || teamData?.team_name || ts.team_name || ts.team_id;
      const liveLogo = teamData?.logo_url || teamData?.team_logo || ts.team_logo || '';

      // Get all seasons they registered for (including historical ones)
      let joinedSeasons = (teamData?.seasons || []).map((s: any) => typeof s === 'string' ? s.trim() : s);
      
      // Ensure the current seasonId is included in the list for display if they are registered for it
      const isRegisteredForCurrentSeason = ts.is_registered || joinedSeasons.includes(seasonId);
      if (seasonId && seasonId !== 'all' && isRegisteredForCurrentSeason && !joinedSeasons.includes(seasonId)) {
        joinedSeasons = [...joinedSeasons, seasonId];
      }

      // Sort seasons played numerically ascending (e.g. S7, S8, S9, S10...)
      const getSeasonNum = (id: string) => parseInt(id.replace(/\D/g, '')) || 0;
      joinedSeasons = [...joinedSeasons].sort((a, b) => getSeasonNum(a) - getSeasonNum(b));

      // Fetch or create their cash balance doc using live name to ensure DB sync
      const balance = await getOrCreateTeamCashBalance(ts.team_id, liveName);

      const payments = balance.payments || [];
      const paymentType = balance.payment_type || 'seasonal';
      const seasonPlans = balance.season_plans || {};

      // Dynamically calculate the plan for each season using the 5-season expiration rule
      const computedSeasonPlans: Record<string, 'upfront' | 'seasonal'> = {};
      let runningPlan = paymentType;
      let upfrontSeasonsRemaining = 0;

      joinedSeasons.forEach((sid) => {
        const paymentsThisSeason = payments
          .filter((p: any) => p.season_id === sid)
          .reduce((sum: number, p: any) => sum + p.amount, 0);

        const manualPlan = seasonPlans[sid];
        
        if (manualPlan === 'upfront' || paymentsThisSeason >= 500) {
          runningPlan = 'upfront';
          upfrontSeasonsRemaining = 5;
        } else if (manualPlan === 'seasonal') {
          runningPlan = 'seasonal';
          upfrontSeasonsRemaining = 0;
        }

        const isCovered = upfrontSeasonsRemaining > 0;
        computedSeasonPlans[sid] = isCovered ? 'upfront' : 'seasonal';

        if (isCovered) {
          upfrontSeasonsRemaining--;
          if (upfrontSeasonsRemaining === 0) {
            runningPlan = 'seasonal';
          }
        }
      });

      // Calculate total payments
      const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

      // Generate deductions dynamically based on seasons played (always 100 per season)
      const deductions = joinedSeasons.map((sid) => {
        const amount = 100;
        return {
          deduction_id: `deduct_${ts.team_id}_${sid}`,
          amount,
          season_id: sid,
          date: new Date(), // Approximate date
        };
      });

      const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
      const remainingBalance = totalPayments - totalDeductions;

      // Self-healing database: Sync remaining_balance in Firestore if it is out-of-sync
      if (balance.remaining_balance !== remainingBalance) {
        try {
          await adminDb.collection('team_cash_balances').doc(ts.team_id).update({
            remaining_balance: remainingBalance,
            updated_at: new Date()
          });
        } catch (err) {
          console.error('Failed to update remaining_balance in Firestore:', err);
        }
      }

      return {
        team_id: ts.team_id,
        team_name: liveName,
        team_logo: liveLogo,
        payment_type: paymentType,
        season_plans: computedSeasonPlans,
        remaining_balance: remainingBalance,
        seasons_played: joinedSeasons,
        payments,
        deductions,
        is_registered: (ts as any).is_registered ?? false,
      };
    });

    const balances = await Promise.all(balancesPromises);

    // 3. Sort balances alphabetically by team name (case-insensitive)
    balances.sort((a, b) => a.team_name.localeCompare(b.team_name, undefined, { sensitivity: 'base' }));

    return NextResponse.json({
      success: true,
      balances,
    });

  } catch (error) {
    console.error('Error in GET /api/reports/cash-balances:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reports/cash-balances
 * Manage team cash balance settings and payments
 * Restricted to super_admin
 */
export async function POST(request: NextRequest) {
  try {
    // Verify auth - super_admin/admin/committee_admin roles
    const auth = await verifyAuth(['super_admin', 'admin', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, teamId, teamName, paymentType, amount, seasonId, notes } = body;

    if (action === 'bulk_payment') {
      if (!seasonId) {
        return NextResponse.json(
          { success: false, error: 'seasonId is required' },
          { status: 400 }
        );
      }

      // 1. Fetch all teams in the season (check historical seasons first)
      const seasonDoc = await adminDb.collection('seasons').doc(seasonId).get();
      const isHistorical = seasonDoc.exists && seasonDoc.data()?.is_historical === true;

      let teamsList: Array<{ team_id: string; team_name: string }> = [];

      if (isHistorical) {
        const sql = getTournamentDb();
        const teamStatsData = await sql`
          SELECT team_id, team_name FROM teamstats WHERE season_id = ${seasonId}
        `;
        const teamNamesMap = new Map();
        teamStatsData.forEach((row: any) => {
          teamNamesMap.set(row.team_id, row.team_name);
        });

        const teamsSnapshot = await adminDb
          .collection('teams')
          .where('seasons', 'array-contains', seasonId)
          .get();

        teamsList = teamsSnapshot.docs.map(doc => {
          const data = doc.data();
          const historicalName = teamNamesMap.get(doc.id) || data.name || data.team_name || doc.id;
          return {
            team_id: doc.id,
            team_name: historicalName,
          };
        });
      } else {
        const teamSeasonsSnapshot = await adminDb
          .collection('team_seasons')
          .where('season_id', '==', seasonId)
          .where('status', '==', 'registered')
          .get();

        teamsList = teamSeasonsSnapshot.docs.map(doc => ({
          team_id: doc.data().team_id || doc.data().teamId,
          team_name: doc.data().team_name || doc.data().teamName,
        }));
      }

      if (teamsList.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No teams registered for this season' },
          { status: 400 }
        );
      }

      // 2. Add payment to all teams (skipping those that already have a payment for this season)
      const bulkPromises = teamsList.map(async (t) => {
        const docRef = adminDb.collection('team_cash_balances').doc(t.team_id);
        const docSnap = await docRef.get();
        
        let paymentType = 'seasonal';
        let seasonPlans: Record<string, string> = {};
        let payments: any[] = [];

        if (docSnap.exists) {
          const balanceData = docSnap.data();
          paymentType = balanceData?.payment_type || 'seasonal';
          seasonPlans = balanceData?.season_plans || {};
          payments = balanceData?.payments || [];
        }

        // Fetch team seasons to calculate if they are already covered by an upfront balance
        const teamDoc = await adminDb.collection('teams').doc(t.team_id).get();
        const teamData = teamDoc.exists ? teamDoc.data() : null;
        const liveName = teamData?.name || teamData?.team_name || t.team_name || t.team_id;

        // Use the plan type defined on the main team record if the cash balance doc doesn't exist yet
        if (!docSnap.exists && teamData) {
          paymentType = teamData.payment_type || 'seasonal';
        }

        // Determine plan for this season (fallback default)
        let planForSeason = paymentType;

        let joinedSeasons = (teamData?.seasons || []).map((s: any) => typeof s === 'string' ? s.trim() : s);
        
        const getSeasonNum = (id: string) => parseInt(id.replace(/\D/g, '')) || 0;
        let seasonsToProcess = [...joinedSeasons];
        if (seasonId && seasonId !== 'all') {
          seasonsToProcess = seasonsToProcess.filter(sid => getSeasonNum(sid) <= getSeasonNum(seasonId));
          if (!seasonsToProcess.includes(seasonId)) {
            seasonsToProcess.push(seasonId);
          }
        }

        // Sort seasons played numerically ascending
        const sortedSeasons = seasonsToProcess.sort((a, b) => getSeasonNum(a) - getSeasonNum(b));

        // Chronological plan calculation to determine current season's plan type
        let runningPlan = paymentType;
        let upfrontSeasonsRemaining = 0;

        sortedSeasons.forEach((sid) => {
          // Include current payments in this check except when calculating if they've paid S6
          const paymentsThisSeason = payments
            .filter((p: any) => p.season_id === sid)
            .reduce((sum: number, p: any) => sum + p.amount, 0);

          const manualPlan = seasonPlans[sid];
          
          if (manualPlan === 'upfront' || paymentsThisSeason >= 500) {
            runningPlan = 'upfront';
            upfrontSeasonsRemaining = 5;
          } else if (manualPlan === 'seasonal') {
            runningPlan = 'seasonal';
            upfrontSeasonsRemaining = 0;
          }

          const isCovered = upfrontSeasonsRemaining > 0;
          if (sid === seasonId) {
            planForSeason = isCovered ? 'upfront' : 'seasonal';
          }

          if (isCovered) {
            upfrontSeasonsRemaining--;
            if (upfrontSeasonsRemaining === 0) {
              runningPlan = 'seasonal';
            }
          }
        });

        // Carryover/coverage calculation (excluding current season payment, as we want to check status prior to bulk credit)
        let carryover = 0;
        const seasonStates: Record<string, { status: 'paid' | 'unpaid' | 'prepaid', debt: number }> = {};

        sortedSeasons.forEach((sid) => {
          const fee = 100;
          const paymentsThisSeason = payments
            .filter((p: any) => p.season_id === sid && p.season_id !== seasonId)
            .reduce((sum: number, p: any) => sum + p.amount, 0);

          const netBeforePayments = carryover - fee;
          const netAfterPayments = netBeforePayments + paymentsThisSeason;

          if (netAfterPayments >= 0) {
            const isPrepaid = paymentsThisSeason === 0 && carryover >= fee;
            seasonStates[sid] = {
              status: isPrepaid ? 'prepaid' : 'paid',
              debt: 0
            };
            carryover = netAfterPayments;
          } else {
            seasonStates[sid] = {
              status: 'unpaid',
              debt: Math.abs(netAfterPayments)
            };
            carryover = 0;
          }
        });

        const currentSeasonState = seasonStates[seasonId];
        const isPrepaidCovered = currentSeasonState ? currentSeasonState.status === 'prepaid' : (carryover >= 100);

        // Skip if covered by upfront balance (regardless of upfront or seasonal) or payment already logged
        const hasPaid = payments.some((p: any) => p.season_id === seasonId) || isPrepaidCovered;
        if (hasPaid) {
          return;
        }

        // Upfront pays 500, Seasonal pays 100
        const creditAmount = planForSeason === 'upfront' ? 500 : 100;

        await recordCashPayment(
          t.team_id,
          liveName,
          creditAmount,
          seasonId,
          notes || `Bulk Credit (${planForSeason === 'upfront' ? 'Upfront' : 'Seasonal'})`,
          auth.userId || 'super_admin'
        );
      });

      await Promise.all(bulkPromises);

      return NextResponse.json({
        success: true,
        message: `Successfully processed bulk credits: credited ₹500 to Upfront and ₹100 to Seasonal teams.`,
      });
    } else if (action === 'bulk_update_type') {
      if (!paymentType || !['upfront', 'seasonal'].includes(paymentType)) {
        return NextResponse.json(
          { success: false, error: 'Invalid paymentType. Must be upfront or seasonal' },
          { status: 400 }
        );
      }

      if (!seasonId) {
        return NextResponse.json(
          { success: false, error: 'seasonId is required' },
          { status: 400 }
        );
      }

      // Fetch all teams in this season (check historical seasons first)
      const seasonDoc = await adminDb.collection('seasons').doc(seasonId).get();
      const isHistorical = seasonDoc.exists && seasonDoc.data()?.is_historical === true;

      let teamsList: Array<{ team_id: string; team_name: string }> = [];

      if (isHistorical) {
        const sql = getTournamentDb();
        const teamStatsData = await sql`
          SELECT team_id, team_name FROM teamstats WHERE season_id = ${seasonId}
        `;
        const teamNamesMap = new Map();
        teamStatsData.forEach((row: any) => {
          teamNamesMap.set(row.team_id, row.team_name);
        });

        const teamsSnapshot = await adminDb
          .collection('teams')
          .where('seasons', 'array-contains', seasonId)
          .get();

        teamsList = teamsSnapshot.docs.map(doc => {
          const data = doc.data();
          const historicalName = teamNamesMap.get(doc.id) || data.name || data.team_name || doc.id;
          return {
            team_id: doc.id,
            team_name: historicalName,
          };
        });
      } else {
        const teamSeasonsSnapshot = await adminDb
          .collection('team_seasons')
          .where('season_id', '==', seasonId)
          .where('status', '==', 'registered')
          .get();

        teamsList = teamSeasonsSnapshot.docs.map(doc => ({
          team_id: doc.data().team_id || doc.data().teamId,
          team_name: doc.data().team_name || doc.data().teamName,
        }));
      }

      if (teamsList.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No teams registered for this season' },
          { status: 400 }
        );
      }

      // Update the plan for all teams in the season
      const updatePromises = teamsList.map(async (t) => {
        // Initialize/retrieve the balance document to ensure it exists in Firestore
        await getOrCreateTeamCashBalance(t.team_id, t.team_name);

        const docRef = adminDb.collection('team_cash_balances').doc(t.team_id);
        const updateKey = `season_plans.${seasonId}`;
        await docRef.update({
          [updateKey]: paymentType,
          updated_at: new Date()
        });

        // Sync to main teams collection doc
        try {
          await adminDb.collection('teams').doc(t.team_id).update({
            payment_type: paymentType,
            updated_at: new Date()
          });
        } catch (err) {
          console.error('Failed to update payment_type in teams collection bulk:', err);
        }
      });

      await Promise.all(updatePromises);

      return NextResponse.json({
        success: true,
        message: `Successfully set all ${teamsList.length} teams to ${paymentType === 'upfront' ? 'Upfront Subscriber' : 'Seasonal Payer'} for this season.`,
      });
    } else if (action === 'bulk_delete_payments') {
      if (!seasonId) {
        return NextResponse.json(
          { success: false, error: 'seasonId is required' },
          { status: 400 }
        );
      }

      // Fetch all teams in this season (check historical seasons first)
      const seasonDoc = await adminDb.collection('seasons').doc(seasonId).get();
      const isHistorical = seasonDoc.exists && seasonDoc.data()?.is_historical === true;

      let teamsList: Array<{ team_id: string; team_name: string }> = [];

      if (isHistorical) {
        const sql = getTournamentDb();
        const teamStatsData = await sql`
          SELECT team_id, team_name FROM teamstats WHERE season_id = ${seasonId}
        `;
        const teamNamesMap = new Map();
        teamStatsData.forEach((row: any) => {
          teamNamesMap.set(row.team_id, row.team_name);
        });

        const teamsSnapshot = await adminDb
          .collection('teams')
          .where('seasons', 'array-contains', seasonId)
          .get();

        teamsList = teamsSnapshot.docs.map(doc => {
          const data = doc.data();
          const historicalName = teamNamesMap.get(doc.id) || data.name || data.team_name || doc.id;
          return {
            team_id: doc.id,
            team_name: historicalName,
          };
        });
      } else {
        const teamSeasonsSnapshot = await adminDb
          .collection('team_seasons')
          .where('season_id', '==', seasonId)
          .where('status', '==', 'registered')
          .get();

        teamsList = teamSeasonsSnapshot.docs.map(doc => ({
          team_id: doc.data().team_id || doc.data().teamId,
          team_name: doc.data().team_name || doc.data().teamName,
        }));
      }

      if (teamsList.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No teams registered for this season' },
          { status: 400 }
        );
      }

      // Delete payments logged for this season from all teams
      const deletePromises = teamsList.map(async (t) => {
        const docRef = adminDb.collection('team_cash_balances').doc(t.team_id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const balanceData = docSnap.data();
          const payments = balanceData?.payments || [];
          const seasonPayments = payments.filter((p: any) => p.season_id === seasonId);
          if (seasonPayments.length > 0) {
            const updatedPayments = payments.filter((p: any) => p.season_id !== seasonId);
            
            // Recalculate remaining_balance
            const totalPayments = updatedPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
            
            const teamDoc = await adminDb.collection('teams').doc(t.team_id).get();
            const teamData = teamDoc.exists ? teamDoc.data() : null;
            let joinedSeasons = (teamData?.seasons || []).map((s: any) => typeof s === 'string' ? s.trim() : s);
            if (seasonId && !joinedSeasons.includes(seasonId)) {
              joinedSeasons = [...joinedSeasons, seasonId];
            }
            const totalDeductions = joinedSeasons.length * 100;
            const newBalance = totalPayments - totalDeductions;

            await docRef.update({
              payments: updatedPayments,
              remaining_balance: newBalance,
              updated_at: new Date()
            });
          }
        }
      });

      await Promise.all(deletePromises);

      return NextResponse.json({
        success: true,
        message: `Successfully deleted payments logged for season ${seasonId.replace('SSPSLS', 'S')} from all teams.`,
      });
    }

    if (!teamId || !teamName) {
      return NextResponse.json(
        { success: false, error: 'teamId and teamName are required' },
        { status: 400 }
      );
    }

    // Initialize/retrieve the balance document
    await getOrCreateTeamCashBalance(teamId, teamName);

    if (action === 'update_type') {
      if (!paymentType || !['upfront', 'seasonal'].includes(paymentType)) {
        return NextResponse.json(
          { success: false, error: 'Invalid paymentType. Must be upfront or seasonal' },
          { status: 400 }
        );
      }

      if (!seasonId) {
        return NextResponse.json(
          { success: false, error: 'seasonId is required for changing payment plan' },
          { status: 400 }
        );
      }
      const docRef = adminDb.collection('team_cash_balances').doc(teamId);
      const updateKey = `season_plans.${seasonId}`;
      await docRef.update({
        [updateKey]: paymentType,
        updated_at: new Date()
      });

      // Sync default payment_type in the main teams collection doc
      try {
        await adminDb.collection('teams').doc(teamId).update({
          payment_type: paymentType,
          updated_at: new Date()
        });
      } catch (err) {
        console.error('Failed to update payment_type in teams collection:', err);
      }
      
      return NextResponse.json({
        success: true,
        message: `Updated payment type for ${teamName} to ${paymentType} for season ${seasonId.replace('SSPSLS', 'S')}`,
      });

    } else if (action === 'record_payment') {
      if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
        return NextResponse.json(
          { success: false, error: 'Valid positive amount is required' },
          { status: 400 }
        );
      }

      if (!seasonId) {
        return NextResponse.json(
          { success: false, error: 'seasonId is required' },
          { status: 400 }
        );
      }

      // Check if a payment for this season already exists for this team, or if a seasonal team is already prepaid covered
      const docRef = adminDb.collection('team_cash_balances').doc(teamId);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const balanceData = docSnap.data();
        const payments = balanceData?.payments || [];
        const existingPayment = payments.find((p: any) => p.season_id === seasonId);
        if (existingPayment) {
          return NextResponse.json(
            { 
              success: false, 
              error: `A payment of ₹${existingPayment.amount} has already been logged for ${teamName} in season ${seasonId.replace('SSPSLS', 'S')}. Please delete the existing payment first if you need to update it.` 
            },
            { status: 400 }
          );
        }

        // Validate prepaid coverage block for seasonal teams
        const paymentType = balanceData?.payment_type || 'seasonal';
        const seasonPlans = balanceData?.season_plans || {};
        const currentPlan = seasonPlans[seasonId] || paymentType;

        if (currentPlan === 'seasonal') {
          // Fetch team seasons to calculate if they are already covered by an upfront balance
          const teamDoc = await adminDb.collection('teams').doc(teamId).get();
          const teamData = teamDoc.exists ? teamDoc.data() : null;
          let joinedSeasons = (teamData?.seasons || []).map((s: any) => typeof s === 'string' ? s.trim() : s);
          
          const getSeasonNum = (id: string) => parseInt(id.replace(/\D/g, '')) || 0;
          let seasonsToProcess = [...joinedSeasons];
          if (seasonId && seasonId !== 'all') {
            seasonsToProcess = seasonsToProcess.filter(sid => getSeasonNum(sid) <= getSeasonNum(seasonId));
            if (!seasonsToProcess.includes(seasonId)) {
              seasonsToProcess.push(seasonId);
            }
          }
          const sortedSeasons = seasonsToProcess.sort((a, b) => getSeasonNum(a) - getSeasonNum(b));

          let carryover = 0;
          const seasonStates: Record<string, { status: 'paid' | 'unpaid' | 'prepaid', debt: number }> = {};

          sortedSeasons.forEach((sid) => {
            const fee = 100;
            const paymentsThisSeason = payments
              .filter((p: any) => p.season_id === sid && p.season_id !== seasonId)
              .reduce((sum: number, p: any) => sum + p.amount, 0);

            const netBeforePayments = carryover - fee;
            const netAfterPayments = netBeforePayments + paymentsThisSeason;

            if (netAfterPayments >= 0) {
              const isPrepaid = paymentsThisSeason === 0 && carryover >= fee;
              seasonStates[sid] = {
                status: isPrepaid ? 'prepaid' : 'paid',
                debt: 0
              };
              carryover = netAfterPayments;
            } else {
              seasonStates[sid] = {
                status: 'unpaid',
                debt: Math.abs(netAfterPayments)
              };
              carryover = 0;
            }
          });

          const currentSeasonState = seasonStates[seasonId];
          const isPrepaidCovered = currentSeasonState ? currentSeasonState.status === 'prepaid' : (carryover >= 100);

          if (isPrepaidCovered) {
            return NextResponse.json(
              { 
                success: false, 
                error: `Cannot record payment: ${teamName} is already marked as Prepaid (Covered by carryover balance) for season ${seasonId.replace('SSPSLS', 'S')}.` 
              },
              { status: 400 }
            );
          }
        }
      }

      await recordCashPayment(
        teamId,
        teamName,
        Number(amount),
        seasonId,
        notes || '',
        auth.userId || 'super_admin'
      );

      return NextResponse.json({
        success: true,
        message: `Successfully recorded payment of ${amount} for ${teamName}`,
      });

    } else if (action === 'delete_payment') {
      const { paymentId } = body;
      if (!paymentId) {
        return NextResponse.json(
          { success: false, error: 'paymentId is required' },
          { status: 400 }
        );
      }

      const docRef = adminDb.collection('team_cash_balances').doc(teamId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return NextResponse.json(
          { success: false, error: 'Team cash balance record not found' },
          { status: 404 }
        );
      }

      const balanceData = docSnap.data();
      const payments = balanceData?.payments || [];
      const paymentToDelete = payments.find((p: any) => p.payment_id === paymentId);

      if (!paymentToDelete) {
        return NextResponse.json(
          { success: false, error: 'Payment record not found' },
          { status: 404 }
        );
      }

      const updatedPayments = payments.filter((p: any) => p.payment_id !== paymentId);
      const amountToSubtract = paymentToDelete.amount;

      await docRef.update({
        payments: updatedPayments,
        remaining_balance: FieldValue.increment(-amountToSubtract),
        updated_at: new Date(),
      });

      return NextResponse.json({
        success: true,
        message: `Successfully deleted payment of ₹${amountToSubtract} for ${teamName}`,
      });

    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error in POST /api/reports/cash-balances:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
