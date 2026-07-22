import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export interface CashPayment {
  payment_id: string;
  amount: number;
  season_id: string;
  date: any; // Date or Timestamp
  notes: string;
  recorded_by: string;
}

export interface CashDeduction {
  deduction_id: string;
  amount: number;
  season_id: string;
  date: any; // Date or Timestamp
}

export interface TeamCashBalance {
  team_id: string;
  team_name: string;
  payment_type: 'upfront' | 'seasonal';
  remaining_balance: number;
  seasons_played: string[];
  payments: CashPayment[];
  deductions: CashDeduction[];
  created_at: any;
  updated_at: any;
}

/**
 * Gets or initializes the cash balance document for a team
 */
export async function getOrCreateTeamCashBalance(teamId: string, teamName: string): Promise<TeamCashBalance> {
  const docRef = adminDb.collection('team_cash_balances').doc(teamId);
  const docSnap = await docRef.get();

  if (docSnap.exists) {
    const data = docSnap.data() as Omit<TeamCashBalance, 'team_id'>;
    return {
      team_id: teamId,
      ...data,
    } as TeamCashBalance;
  }

  // Initialize new document if not present
  const newBalance: Omit<TeamCashBalance, 'team_id'> = {
    team_name: teamName,
    payment_type: 'seasonal', // default to seasonal
    remaining_balance: 0,
    seasons_played: [],
    payments: [],
    deductions: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  await docRef.set(newBalance);

  return {
    team_id: teamId,
    ...newBalance,
  } as TeamCashBalance;
}

/**
 * Updates subscription type for a team
 */
export async function updatePaymentType(teamId: string, paymentType: 'upfront' | 'seasonal'): Promise<void> {
  const docRef = adminDb.collection('team_cash_balances').doc(teamId);
  await docRef.update({
    payment_type: paymentType,
    updated_at: new Date(),
  });
}

/**
 * Records a cash payment (increases remaining_balance)
 */
export async function recordCashPayment(
  teamId: string,
  teamName: string,
  amount: number,
  seasonId: string,
  notes: string,
  recordedBy: string
): Promise<void> {
  // Ensure the document exists first
  await getOrCreateTeamCashBalance(teamId, teamName);

  const docRef = adminDb.collection('team_cash_balances').doc(teamId);
  const payment: CashPayment = {
    payment_id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
    amount,
    season_id: seasonId,
    date: new Date(),
    notes,
    recorded_by: recordedBy,
  };

  await docRef.update({
    remaining_balance: FieldValue.increment(amount),
    payments: FieldValue.arrayUnion(payment),
    updated_at: new Date(),
  });
}

/**
 * Records a cash deduction (decreases remaining_balance and adds season to seasons_played)
 */
export async function recordCashDeduction(
  teamId: string,
  teamName: string,
  amount: number,
  seasonId: string
): Promise<void> {
  const balance = await getOrCreateTeamCashBalance(teamId, teamName);

  // If this season is already processed in deductions, skip it to prevent double deductions
  const alreadyDeducted = balance.deductions?.some((d) => d.season_id === seasonId);
  if (alreadyDeducted) {
    console.log(`⚠️ Cash deduction already exists for team ${teamId} in season ${seasonId}. Skipping.`);
    return;
  }

  const docRef = adminDb.collection('team_cash_balances').doc(teamId);
  const deduction: CashDeduction = {
    deduction_id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
    amount,
    season_id: seasonId,
    date: new Date(),
  };

  const updateData: any = {
    remaining_balance: FieldValue.increment(-amount),
    deductions: FieldValue.arrayUnion(deduction),
    updated_at: new Date(),
  };

  // Add to seasons_played if not already in the array
  if (!balance.seasons_played?.includes(seasonId)) {
    updateData.seasons_played = FieldValue.arrayUnion(seasonId);
  }

  await docRef.update(updateData);
  console.log(`✅ Cash deduction of ${amount} recorded for team ${teamName} (Season: ${seasonId})`);
}
