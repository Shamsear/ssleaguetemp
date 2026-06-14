'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DollarSign, Users, Filter, TrendingUp, TrendingDown, Calendar, ArrowLeft, Trophy, ClipboardList, Download, Share2, Check, ChevronDown, Award, Gift, Wallet, UserCheck, Gavel, AlertTriangle, ArrowRightLeft, RefreshCw, Undo2, FileText, Settings, Info, CheckCircle, BarChart2 } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { usePermissions } from '@/hooks/usePermissions';

interface Transaction {
  id: string;
  team_id: string;
  team_name?: string;
  season_id: string;
  transaction_type: string;
  currency_type: 'football' | 'real';
  amount: number;
  amount_football?: number;
  amount_real?: number;
  description: string;
  created_at: any;
  metadata?: any;
}

interface TeamSummary {
  teamId: string;
  teamName: string;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  eCoinIncome: number;
  eCoinExpense: number;
  sSCoinIncome: number;
  sSCoinExpense: number;
  transactionCount: number;
}

export default function AllTransactionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { userSeasonId } = usePermissions();

  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');
  const [selectedTransactionType, setSelectedTransactionType] = useState<string>('all');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('all');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('current');
  const [teams, setTeams] = useState<any[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingTransactions, setIsFetchingTransactions] = useState(false);
  const [teamSummary, setTeamSummary] = useState<TeamSummary[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [totalTransactions, setTotalTransactions] = useState(0);

  // Transaction type categories
  const INCOME_TYPES = ['match_reward', 'position_reward', 'completion_bonus', 'knockout_reward', 'bonus', 'transfer_compensation', 'swap_fee_received', 'release_refund', 'player_release_refund', 'release', 'initial_balance', 'refund', 'football_refund', 'real_player_refund', 'slot_refund'];
  const EXPENSE_TYPES = ['salary_payment', 'salary', 'real_player_fee', 'auction_win', 'fine', 'transfer_payment', 'swap_fee_paid', 'slot_purchase'];

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && user.role === 'committee_admin' && userSeasonId) {
      loadInitialData();
    }
  }, [user, userSeasonId]);

  useEffect(() => {
    if (userSeasonId) {
      setCurrentPage(1); // Reset to page 1 when filters change
      
      // Reload teams when season changes
      if (selectedSeasonId !== 'current' && selectedSeasonId !== 'all') {
        loadTeamsForSeason(selectedSeasonId);
      } else {
        loadTeamsForSeason(userSeasonId);
      }
      
      if (showSummary) {
        loadTeamSummary();
      } else {
        loadTransactions();
      }
    }
  }, [selectedTeamId, selectedTransactionType, selectedCurrency, selectedSeasonId, userSeasonId, showSummary]);

  useEffect(() => {
    if (userSeasonId && !showSummary) {
      loadTransactions();
    }
  }, [currentPage]);

  const loadTeamsForSeason = async (seasonId: string) => {
    try {
      const teamSeasonsQuery = query(
        collection(db, 'team_seasons'),
        where('season_id', '==', seasonId)
      );
      
      const teamSeasonsSnapshot = await getDocs(teamSeasonsQuery);

      const teamsList: any[] = [];
      const teamsMap: Record<string, string> = {};

      teamSeasonsSnapshot.forEach(doc => {
        const data = doc.data();
        const teamId = data.team_id;
        const teamName = data.team_name || teamId;
        
        teamsMap[teamId] = teamName;
        teamsList.push({
          team: {
            id: teamId,
            name: teamName
          }
        });
      });

      teamsList.sort((a, b) => a.team.name.localeCompare(b.team.name));
      setTeams(teamsList);
      
      // Store teams map for quick lookup
      (window as any).teamsMap = teamsMap;
    } catch (error) {
      console.error('Error loading teams for season:', error);
    }
  };

  const loadInitialData = async () => {
    if (!userSeasonId) return;

    try {
      setIsLoading(true);

      // Load teams from team_seasons for the current season
      await loadTeamsForSeason(userSeasonId);

      // Load seasons that have team_seasons records
      const teamSeasonsSnapshot = await getDocs(collection(db, 'team_seasons'));
      const seasonIdsSet = new Set<string>();
      
      teamSeasonsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.season_id) {
          seasonIdsSet.add(data.season_id);
        }
      });

      // Fetch season details from seasons collection
      const seasonsSnapshot = await getDocs(collection(db, 'seasons'));
      const seasonsList: any[] = [];
      const foundSeasonIds = new Set<string>();
      
      seasonsSnapshot.forEach(doc => {
        if (seasonIdsSet.has(doc.id)) {
          foundSeasonIds.add(doc.id);
          seasonsList.push({
            id: doc.id,
            ...doc.data()
          });
        }
      });

      // Add season IDs that have team_seasons but no season document
      seasonIdsSet.forEach(seasonId => {
        if (!foundSeasonIds.has(seasonId)) {
          seasonsList.push({
            id: seasonId,
            name: seasonId, // Use ID as name if no document exists
            created_at: null
          });
        }
      });

      seasonsList.sort((a, b) => {
        if (a.created_at && b.created_at) {
          return b.created_at.toMillis() - a.created_at.toMillis();
        }
        // Put seasons without created_at at the end, or sort by name
        if (!a.created_at && !b.created_at) {
          return a.name.localeCompare(b.name);
        }
        return a.created_at ? -1 : 1;
      });

      setSeasons(seasonsList);
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportToExcel = () => {
    // Validate that single team and single currency are selected
    if (selectedTeamId === 'all') {
      alert('[WARNING]  Please select a specific team to export.\n\nExport works for one team at a time.');
      return;
    }
    
    if (selectedCurrency === 'all') {
      alert('[WARNING]  Please select a specific currency (eCoin or SSCoin) to export.\n\nExport works for one currency at a time.');
      return;
    }
    
    try {
      // Get team name
      const teamName = teams.find(t => t.team?.id === selectedTeamId)?.team?.name || selectedTeamId;
      const currencyName = selectedCurrency === 'football' ? 'eCoin' : 'SSCoin';
      
      // Create CSV content with UTF-8 BOM for proper character encoding
      const BOM = '\uFEFF';
      let csv = BOM + 'Date,Type,Description,Debit,Credit,Balance\n';
      
      // Sort transactions by date (oldest first for running balance)
      const sortedTransactions = [...transactions].sort((a, b) => {
        const aTime = a.created_at?.toDate?.() || new Date(a.created_at);
        const bTime = b.created_at?.toDate?.() || new Date(b.created_at);
        return aTime.getTime() - bTime.getTime();
      });
      
      let runningBalance = 0;
      
      sortedTransactions.forEach(txn => {
        const date = new Date(txn.created_at?.toDate?.() || txn.created_at);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const amount = txn.amount || 0;
        const isIncome = isIncomeTransaction(txn.transaction_type, amount);
        
        // Update running balance
        runningBalance += amount;
        
        // Format type
        const type = formatTransactionType(txn.transaction_type);
        
        // Format description - include player name if available
        let description = txn.description;
        if (txn.metadata?.player_name) {
          description = `${txn.metadata.player_name} - ${description}`;
        }
        
        // Escape quotes in description for CSV
        description = description.replace(/"/g, '""');
        
        // Debit (negative) or Credit (positive)
        const debit = amount < 0 ? Math.abs(amount) : '';
        const credit = amount > 0 ? amount : '';
        
        csv += `"${dateStr}","${type}","${description}",${debit},${credit},${runningBalance}\n`;
      });
      
      // Create blob with UTF-8 encoding
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const seasonName = selectedSeasonId === 'current' ? userSeasonId : selectedSeasonId;
      const filename = `${teamName}_${currencyName}_${seasonName}_Transactions.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Exported ${transactions.length} transactions to ${filename}\n\nNote: The file will open correctly in Excel and Google Sheets with proper character encoding.`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('[ERROR]  Error exporting data. Check console for details.');
    }
  };

  const copyToWhatsApp = () => {
    try {
      let message = '*<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Transaction Summary*\n\n';
      
      // Add filters info
      const seasonName = selectedSeasonId === 'current' ? userSeasonId : selectedSeasonId === 'all' ? 'All Seasons' : selectedSeasonId;
      const teamName = selectedTeamId === 'all' ? 'All Teams' : teams.find(t => t.team?.id === selectedTeamId)?.team?.name || selectedTeamId;
      const currencyName = selectedCurrency === 'all' ? 'Both' : selectedCurrency === 'football' ? 'eCoin' : 'SSCoin';
      
      message += `Season: ${seasonName}\n`;
      message += `Team: ${teamName}\n`;
      message += `Currency: ${currencyName}\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      if (showSummary && teamSummary.length > 0) {
        // Team Summary View
        message += '*Overall Stats*\n\n';
        
        teamSummary.forEach((team, index) => {
          message += `*${index + 1}. ${team.teamName}*\n`;
          message += `Income: ${team.totalIncome} | Expense: ${team.totalExpense}\n`;
          message += `Net: ${team.netBalance >= 0 ? '+' : ''}${team.netBalance}\n`;
          
          // Only show currencies with non-zero values
          if (selectedCurrency === 'all') {
            const eCoinNet = team.eCoinIncome - team.eCoinExpense;
            const sSCoinNet = team.sSCoinIncome - team.sSCoinExpense;
            
            if (eCoinNet !== 0) {
              message += `eCoin: ${eCoinNet >= 0 ? '+' : ''}${eCoinNet}\n`;
            }
            if (sSCoinNet !== 0) {
              message += `SSCoin: ${sSCoinNet >= 0 ? '+' : ''}${sSCoinNet}\n`;
            }
          }
          message += `\n`;
        });
      } else {
        // Overall Stats
        message += '*Overall Stats*\n';
        message += `Income: ${overallStats.totalIncome} | Expense: ${overallStats.totalExpense}\n`;
        message += `Net: ${overallStats.netBalance >= 0 ? '+' : ''}${overallStats.netBalance}\n`;
        
        // Only show currencies with non-zero values
        if (selectedCurrency === 'all') {
          if (overallStats.totalECoin !== 0) {
            message += `eCoin: ${overallStats.totalECoin >= 0 ? '+' : ''}${overallStats.totalECoin}\n`;
          }
          if (overallStats.totalSSCoin !== 0) {
            message += `SSCoin: ${overallStats.totalSSCoin >= 0 ? '+' : ''}${overallStats.totalSSCoin}\n`;
          }
        }
        message += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        // All transactions
        if (transactions.length > 0) {
          message += '*Recent Transactions*\n\n';
          
          transactions.forEach((txn, index) => {
            const amount = txn.amount || txn.amount_football || txn.amount_real || 0;
            const currency = txn.currency_type === 'football' ? 'eCoin' : 'SSCoin';
            const sign = amount >= 0 ? '+' : '';
            const date = new Date(txn.created_at?.toDate?.() || txn.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            message += `${index + 1}. ${txn.team_name || 'Unknown'}\n`;
            
            // Check for auction value and refund details
            const auctionValue = txn.metadata?.auction_value || (txn as any).auction_value;
            const refundPercentage = txn.metadata?.refund_percentage ?? (txn as any).refund_percentage;
            const playerName = txn.metadata?.player_name || (txn as any).player_name;
            
            // Currency and amount
            message += `${currency}: ${sign}${amount}\n`;
            
            // Description with player name and refund details
            let desc = txn.description;
            if (playerName) {
              // If player name is in description, remove it to avoid duplication
              desc = desc.replace(playerName, '').trim();
              desc = desc.replace(/^[-:]\s*/, '').trim(); // Remove leading dash or colon
            }
            // Remove common prefixes
            desc = desc.replace(/^Player release refund:\s*/i, '');
            desc = desc.replace(/\s*\(\d+%\s*refund\)\s*$/i, '');
            
            // Build description line
            if (playerName) {
              if (auctionValue && refundPercentage !== undefined) {
                message += `Player release refund: ${playerName} (${refundPercentage}% refund)\n`;
              } else if (desc) {
                message += `${desc}: ${playerName}\n`;
              } else {
                message += `${playerName}\n`;
              }
            } else if (desc) {
              message += `${desc}\n`;
            }
            
            // Show value and refund details if available
            if (auctionValue && refundPercentage !== undefined) {
              message += `Value: ${auctionValue} | Refund: ${refundPercentage}%\n`;
            }
            
            message += `${date}\n\n`;
          });
        }
      }
      
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
      message += `<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> ${totalTransactions} total\n`;
      message += `🕐 ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}\n`;
      
      // Copy to clipboard
      navigator.clipboard.writeText(message).then(() => {
        alert('[SUCCESS]  Copied to clipboard!\nPaste in WhatsApp.');
      }).catch(err => {
        console.error('Failed to copy:', err);
        alert('[ERROR]  Failed to copy. Please try again.');
      });
    } catch (error) {
      console.error('Error generating WhatsApp message:', error);
      alert('[ERROR]  Error generating summary.');
    }
  };

  const loadTransactions = async () => {
    if (!userSeasonId) return;

    try {
      setIsFetchingTransactions(true);

      // HYBRID APPROACH: Use Firestore query for season filter to reduce reads
      // Determine which season to filter by
      const filterSeasonId = selectedSeasonId === 'current' ? userSeasonId : selectedSeasonId;
      
      let q;
      if (selectedSeasonId === 'all') {
        // Fetch all transactions (no season filter)
        q = query(collection(db, 'transactions'));
      } else {
        // Query with season filter - SIGNIFICANTLY reduces reads
        // Example: Instead of reading 3913 docs, only read ~100-200 for current season
        q = query(
          collection(db, 'transactions'),
          where('season_id', '==', filterSeasonId)
        );
      }

      const snapshot = await getDocs(q);
      const allTransactions: Transaction[] = [];

      snapshot.forEach(doc => {
        const data = doc.data();

        // Season filter already applied in query (unless 'all' selected)
        // No need to filter again here

        // Apply team filter
        if (selectedTeamId !== 'all' && data.team_id !== selectedTeamId) {
          return;
        }

        // Apply transaction type filter
        if (selectedTransactionType !== 'all') {
          // Handle release-related transaction types (they should all be grouped together)
          if (selectedTransactionType === 'player_release_refund') {
            const releaseTypes = ['player_release_refund', 'release_refund', 'release'];
            if (!releaseTypes.includes(data.transaction_type)) {
              return;
            }
          } else if (data.transaction_type !== selectedTransactionType) {
            return;
          }
        }

        const teamName = teams.find(t => t.team.id === data.team_id)?.team.name || 
                        (window as any).teamsMap?.[data.team_id] || 
                        data.team_id;
        
        // Handle both old and new format
        // Check if fields exist (not just if they're non-zero)
        const hasFootball = data.amount_football !== undefined && data.amount_football !== null;
        const hasReal = data.amount_real !== undefined && data.amount_real !== null;
        const hasRefundAmount = data.refund_amount !== undefined && data.refund_amount !== null;

        if (hasFootball || hasReal) {
          // New format with separate amounts
          // Build metadata from document fields
          const metadata: any = data.metadata || {};
          
          // Add release transaction fields to metadata if they exist
          if (data.auction_value) metadata.auction_value = data.auction_value;
          if (data.refund_amount) metadata.refund_amount = data.refund_amount;
          if (data.refund_percentage !== undefined) metadata.refund_percentage = data.refund_percentage;
          if (data.player_name) metadata.player_name = data.player_name;
          if (data.player_type) metadata.player_type = data.player_type;
          
          if (hasFootball && data.amount_football !== 0 && (selectedCurrency === 'all' || selectedCurrency === 'football')) {
            allTransactions.push({
              id: `${doc.id}_football`,
              team_id: data.team_id,
              team_name: teamName,
              season_id: data.season_id,
              transaction_type: data.transaction_type,
              currency_type: 'football',
              amount: data.amount_football,
              description: data.description || '',
              created_at: data.created_at,
              metadata
            });
          }

          if (hasReal && data.amount_real !== 0 && (selectedCurrency === 'all' || selectedCurrency === 'real')) {
            allTransactions.push({
              id: `${doc.id}_real`,
              team_id: data.team_id,
              team_name: teamName,
              season_id: data.season_id,
              transaction_type: data.transaction_type,
              currency_type: 'real',
              amount: data.amount_real,
              description: data.description || '',
              created_at: data.created_at,
              metadata
            });
          }
        } else if (data.amount !== undefined && data.amount !== null && data.amount !== 0) {
          // Old format with single amount
          // First check currency_type, then fallback to player_type
          let currencyType = data.currency_type;
          
          if (!currencyType && data.player_type) {
            // Fallback to player_type if currency_type not found
            currencyType = data.player_type;
          }
          
          const isSSCoin = currencyType === 'real' || currencyType === 'real_player';
          const isECoin = currencyType === 'football';
          
          const shouldInclude = 
            selectedCurrency === 'all' ||
            (selectedCurrency === 'real' && isSSCoin) ||
            (selectedCurrency === 'football' && isECoin);
          
          if (shouldInclude) {
            // Build metadata from document fields
            const metadata: any = data.metadata || {};
            
            // Add release transaction fields to metadata if they exist
            if (data.auction_value) metadata.auction_value = data.auction_value;
            if (data.refund_amount) metadata.refund_amount = data.refund_amount;
            if (data.refund_percentage !== undefined) metadata.refund_percentage = data.refund_percentage;
            if (data.player_name) metadata.player_name = data.player_name;
            if (data.player_type) metadata.player_type = data.player_type;
            
            allTransactions.push({
              id: doc.id,
              team_id: data.team_id,
              team_name: teamName,
              season_id: data.season_id,
              transaction_type: data.transaction_type,
              currency_type: isSSCoin ? 'real' : 'football', // Normalize to 'real' or 'football'
              amount: data.amount,
              description: data.description || '',
              created_at: data.created_at,
              metadata
            });
          }
        } else if (hasRefundAmount && data.refund_amount !== 0) {
          // Handle release transactions with refund_amount
          // Use player_type to determine currency
          const isSSCoin = data.player_type === 'real' || data.player_type === 'real_player';
          const isECoin = data.player_type === 'football';
          
          const shouldInclude = 
            selectedCurrency === 'all' ||
            (selectedCurrency === 'real' && isSSCoin) ||
            (selectedCurrency === 'football' && isECoin);
          
          if (shouldInclude) {
            // Build metadata from document fields
            const metadata: any = data.metadata || {};
            
            // Add release transaction fields to metadata
            if (data.auction_value) metadata.auction_value = data.auction_value;
            if (data.refund_amount) metadata.refund_amount = data.refund_amount;
            if (data.refund_percentage !== undefined) metadata.refund_percentage = data.refund_percentage;
            if (data.player_name) metadata.player_name = data.player_name;
            if (data.player_type) metadata.player_type = data.player_type;
            
            allTransactions.push({
              id: doc.id,
              team_id: data.team_id,
              team_name: teamName,
              season_id: data.season_id,
              transaction_type: data.transaction_type,
              currency_type: isSSCoin ? 'real' : 'football',
              amount: data.refund_amount, // Use refund_amount as the amount
              description: data.description || `Player release refund: ${data.player_name || 'Unknown'} (${data.refund_percentage || 0}% refund)`,
              created_at: data.created_at,
              metadata
            });
          }
        }
      });

      // Sort by created_at
      allTransactions.sort((a, b) => {
        const aTime = a.created_at?.toDate?.() || new Date(a.created_at);
        const bTime = b.created_at?.toDate?.() || new Date(b.created_at);
        return bTime.getTime() - aTime.getTime();
      });

      setTotalTransactions(allTransactions.length);
      setTransactions(allTransactions);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setIsFetchingTransactions(false);
    }
  };

  const loadTeamSummary = async () => {
    if (!userSeasonId) return;

    try {
      setIsFetchingTransactions(true);

      // Fetch all transactions for the season
      const q = query(collection(db, 'transactions'));
      const snapshot = await getDocs(q);

      const teamTotals: Record<string, TeamSummary> = {};

      // Initialize team totals
      teams.forEach(teamData => {
        teamTotals[teamData.team.id] = {
          teamId: teamData.team.id,
          teamName: teamData.team.name,
          totalIncome: 0,
          totalExpense: 0,
          netBalance: 0,
          eCoinIncome: 0,
          eCoinExpense: 0,
          sSCoinIncome: 0,
          sSCoinExpense: 0,
          transactionCount: 0,
        };
      });

      // Determine which season to filter by
      const filterSeasonId = selectedSeasonId === 'current' ? userSeasonId : selectedSeasonId;

      snapshot.forEach(doc => {
        const data = doc.data();

        // Apply season filter
        if (selectedSeasonId === 'all') {
          // Show all seasons
        } else if (data.season_id !== filterSeasonId) {
          return;
        }

        const teamId = data.team_id;
        if (!teamTotals[teamId]) {
          const teamName = teams.find(t => t.team.id === teamId)?.team.name || 
                         (window as any).teamsMap?.[teamId] || 
                         teamId;
          teamTotals[teamId] = {
            teamId,
            teamName,
            totalIncome: 0,
            totalExpense: 0,
            netBalance: 0,
            eCoinIncome: 0,
            eCoinExpense: 0,
            sSCoinIncome: 0,
            sSCoinExpense: 0,
            transactionCount: 0,
          };
        }

        const eCoinAmount = data.amount_football || (data.currency_type === 'football' ? data.amount : 0) || 0;
        const sSCoinAmount = data.amount_real || ((data.currency_type === 'real' || data.currency_type === 'real_player') ? data.amount : 0) || 0;

        // If no currency_type, check player_type as fallback
        let finalECoinAmount = eCoinAmount;
        let finalSSCoinAmount = sSCoinAmount;
        
        if (!data.currency_type && data.player_type && data.amount) {
          if (data.player_type === 'football') {
            finalECoinAmount = data.amount;
          } else if (data.player_type === 'real' || data.player_type === 'real_player') {
            finalSSCoinAmount = data.amount;
          }
        }

        const isIncome = INCOME_TYPES.includes(data.transaction_type) || 
                        (data.amount > 0 && !EXPENSE_TYPES.includes(data.transaction_type));

        // Track if we counted this transaction
        let transactionCounted = false;

        if (finalECoinAmount !== 0) {
          if (isIncome || finalECoinAmount > 0) {
            teamTotals[teamId].eCoinIncome += Math.abs(finalECoinAmount);
          } else {
            teamTotals[teamId].eCoinExpense += Math.abs(finalECoinAmount);
          }
          transactionCounted = true;
        }

        if (finalSSCoinAmount !== 0) {
          if (isIncome || finalSSCoinAmount > 0) {
            teamTotals[teamId].sSCoinIncome += Math.abs(finalSSCoinAmount);
          } else {
            teamTotals[teamId].sSCoinExpense += Math.abs(finalSSCoinAmount);
          }
          transactionCounted = true;
        }

        // Only count the transaction once, even if it has both currencies
        if (transactionCounted) {
          teamTotals[teamId].transactionCount++;
        }
      });

      // Calculate net balance and sort
      const summaryArray = Object.values(teamTotals)
        .map(team => {
          const totalIncome = team.eCoinIncome + team.sSCoinIncome;
          const totalExpense = team.eCoinExpense + team.sSCoinExpense;
          return {
            ...team,
            totalIncome,
            totalExpense,
            netBalance: totalIncome - totalExpense
          };
        })
        .filter(team => team.transactionCount > 0)
        .sort((a, b) => b.netBalance - a.netBalance);

      setTeamSummary(summaryArray);
    } catch (error) {
      console.error('Error loading team summary:', error);
    } finally {
      setIsFetchingTransactions(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCurrencyBadge = (type: string) => {
    if (type === 'football') {
      return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-lg">eCoin</span>;
    }
    return <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-lg">SSCoin</span>;
  };

  const renderTransactionIcon = (type: string) => {
    const iconClass = "w-4 h-4";
    const icons: Record<string, React.ReactNode> = {
      'match_reward': <Trophy className={`${iconClass} text-amber-500`} />,
      'position_reward': <Award className={`${iconClass} text-amber-500`} />,
      'completion_bonus': <Gift className={`${iconClass} text-emerald-500`} />,
      'knockout_reward': <Trophy className={`${iconClass} text-amber-500`} />,
      'salary_payment': <Wallet className={`${iconClass} text-blue-500`} />,
      'salary': <Wallet className={`${iconClass} text-blue-500`} />,
      'real_player_fee': <UserCheck className={`${iconClass} text-purple-500`} />,
      'auction_win': <Gavel className={`${iconClass} text-amber-600`} />,
      'fine': <AlertTriangle className={`${iconClass} text-rose-500`} />,
      'bonus': <Gift className={`${iconClass} text-emerald-500`} />,
      'transfer_payment': <ArrowRightLeft className={`${iconClass} text-rose-500`} />,
      'transfer_compensation': <ArrowRightLeft className={`${iconClass} text-emerald-500`} />,
      'swap_fee_paid': <RefreshCw className={`${iconClass} text-rose-500`} />,
      'swap_fee_received': <RefreshCw className={`${iconClass} text-emerald-500`} />,
      'release_refund': <Undo2 className={`${iconClass} text-emerald-500`} />,
      'player_release_refund': <Undo2 className={`${iconClass} text-emerald-500`} />,
      'release': <Undo2 className={`${iconClass} text-emerald-500`} />,
      'initial_balance': <Wallet className={`${iconClass} text-blue-500`} />,
      'adjustment': <Settings className={`${iconClass} text-slate-500`} />,
    };
    return icons[type] || <FileText className={`${iconClass} text-slate-500`} />;
  };

  const formatTransactionType = (type: string) => {
    if (!type) return 'Unknown';
    
    const typeMap: Record<string, string> = {
      'match_reward': 'Match Reward',
      'position_reward': 'Position Reward',
      'completion_bonus': 'Completion Bonus',
      'knockout_reward': 'Knockout Reward',
      'salary_payment': 'Salary Payment',
      'real_player_fee': 'Real Player Fee',
      'auction_win': 'Auction Win',
      'initial_balance': 'Initial Balance',
      'transfer_payment': 'Transfer Payment',
      'transfer_compensation': 'Transfer Compensation',
      'swap_fee_paid': 'Swap Fee Paid',
      'swap_fee_received': 'Swap Fee Received',
      'player_release_refund': 'Release',
      'release_refund': 'Release',
      'release': 'Release',
      'refund': 'Refund',
      'football_refund': 'Football Refund',
      'real_player_refund': 'Real Player Refund',
    };
    
    return typeMap[type] || type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const isIncomeTransaction = (type: string, amount: number) => {
    return INCOME_TYPES.includes(type) || amount > 0;
  };

  const copyTeamSummaryToWhatsApp = () => {
    if (teamSummary.length === 0) return;

    let message = `*<DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> COMPLETE TRANSACTION SUMMARY*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    teamSummary.forEach((team, index) => {
      const rank = index === 0 ? '<Trophy className="w-4 h-4 inline-block text-amber-500 fill-amber-500 mr-1 align-text-bottom" />' : index === 1 ? '<Trophy className="w-4 h-4 inline-block text-slate-400 fill-slate-400 mr-1 align-text-bottom" />' : index === 2 ? '<Trophy className="w-4 h-4 inline-block text-amber-700 fill-amber-700 mr-1 align-text-bottom" />' : `${index + 1}.`;

      message += `${rank} *${team.teamName}*\n`;
      message += `   💵 Net Balance: ${team.netBalance >= 0 ? '+' : ''}${team.netBalance}\n\n`;
      
      message += `   📈 INCOME:\n`;
      message += `      🔵 eCoin: +${team.eCoinIncome}\n`;
      message += `      🟣 SSCoin: +${team.sSCoinIncome}\n`;
      message += `      Total: +${team.totalIncome}\n\n`;
      
      message += `   📉 EXPENSES:\n`;
      message += `      🔵 eCoin: -${team.eCoinExpense}\n`;
      message += `      🟣 SSCoin: -${team.sSCoinExpense}\n`;
      message += `      Total: -${team.totalExpense}\n\n`;
      
      message += `   <BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Transactions: ${team.transactionCount}\n\n`;
    });

    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `*GRAND TOTALS*\n`;
    message += `Total Income: +${teamSummary.reduce((sum, t) => sum + t.totalIncome, 0)}\n`;
    message += `Total Expenses: -${teamSummary.reduce((sum, t) => sum + t.totalExpense, 0)}\n`;
    message += `Teams: ${teamSummary.length}`;

    navigator.clipboard.writeText(message).then(() => {
      alert('[SUCCESS]  Summary copied to clipboard! You can now paste it in WhatsApp.');
    }).catch(() => {
      alert('[ERROR]  Failed to copy to clipboard');
    });
  };

  // Pagination - only for "all teams" view
  const shouldPaginate = selectedTeamId === 'all';
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayTransactions = shouldPaginate ? transactions.slice(startIndex, endIndex) : transactions;
  const totalPages = shouldPaginate ? Math.ceil(totalTransactions / itemsPerPage) : 1;
  const paginatedTransactions = displayTransactions;

  // Calculate overall summary stats
  const overallStats = {
    totalIncome: transactions.filter(t => isIncomeTransaction(t.transaction_type, t.amount)).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    totalExpense: transactions.filter(t => !isIncomeTransaction(t.transaction_type, t.amount)).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    get netBalance() {
      return this.totalIncome - this.totalExpense;
    },
    totalECoin: transactions.filter(t => t.currency_type === 'football').reduce((sum, t) => {
      const isIncome = isIncomeTransaction(t.transaction_type, t.amount);
      return sum + (isIncome ? Math.abs(t.amount) : -Math.abs(t.amount));
    }, 0),
    totalSSCoin: transactions.filter(t => t.currency_type === 'real').reduce((sum, t) => {
      const isIncome = isIncomeTransaction(t.transaction_type, t.amount);
      return sum + (isIncome ? Math.abs(t.amount) : -Math.abs(t.amount));
    }, 0),
    matchRewards: transactions.filter(t => t.transaction_type === 'match_reward').reduce((sum, t) => sum + Math.abs(t.amount), 0),
    tournamentRewards: transactions.filter(t => ['position_reward', 'completion_bonus', 'knockout_reward'].includes(t.transaction_type)).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    salaries: transactions.filter(t => ['salary_payment', 'salary'].includes(t.transaction_type)).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    realPlayerFees: transactions.filter(t => t.transaction_type === 'real_player_fee').reduce((sum, t) => sum + Math.abs(t.amount), 0),
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading transactions...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Ambient Gold Glow Overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 text-slate-500 hover:text-slate-800 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all shadow-sm cursor-pointer mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
                <DollarSign className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">All Transactions</h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Complete financial transaction history</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportToExcel}
                disabled={selectedTeamId === 'all' || selectedCurrency === 'all'}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 border border-slate-950 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                title={selectedTeamId === 'all' || selectedCurrency === 'all' ? 'Select a specific team and currency to export' : 'Export to Excel/Sheets'}
              >
                <Download className="w-4 h-4 text-emerald-500" />
                <span className="hidden sm:inline">Export to Excel</span>
              </button>
              <button
                onClick={copyToWhatsApp}
                className="px-3.5 py-1.5 bg-slate-800 text-amber-400 border border-slate-900 hover:bg-slate-900 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                title="Copy summary to WhatsApp"
              >
                <Share2 className="w-4 h-4 text-amber-500" />
                <span className="hidden sm:inline">Copy to WhatsApp</span>
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {!showSummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm text-center">
              <TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-2" />
              <div className="text-xl font-extrabold text-emerald-600">{overallStats.totalIncome}</div>
              <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">Total Income</div>
            </div>

            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm text-center">
              <TrendingDown className="w-5 h-5 text-rose-500 mx-auto mb-2" />
              <div className="text-xl font-extrabold text-rose-600">{overallStats.totalExpense}</div>
              <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">Total Expenses</div>
            </div>

            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm text-center">
              <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200/50 uppercase mb-2">eCoin</span>
              <div className="text-xl font-extrabold text-slate-800">{overallStats.totalECoin}</div>
              <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">Net eCoin Balance</div>
            </div>

            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm text-center">
              <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-extrabold text-purple-700 bg-purple-50 border border-purple-200/50 uppercase mb-2">SSCoin</span>
              <div className="text-xl font-extrabold text-slate-800">{overallStats.totalSSCoin}</div>
              <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">Net SSCoin Balance</div>
            </div>
          </div>
        )}

        {/* View Toggle */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex p-1 bg-slate-50 border border-slate-200 rounded-xl">
            <button
              onClick={() => setShowSummary(false)}
              className={`px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-wider font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                !showSummary
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Detailed View
            </button>
            <button
              onClick={() => setShowSummary(true)}
              className={`px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-wider font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                showSummary
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              Team Summary
            </button>
          </div>
        </div>

        {/* Filters - Only show in detailed view */}
        {!showSummary && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm font-mono mb-6">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <Filter className="w-4 h-4 text-amber-500" />
              <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Filters</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Season Filter */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Season
                </label>
                <select
                  value={selectedSeasonId}
                  onChange={(e) => setSelectedSeasonId(e.target.value)}
                  className="w-full py-2.5 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer"
                >
                  <option value="current">Current Season</option>
                  <option value="all">All Seasons</option>
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Team Filter */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  Team
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full py-2.5 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer"
                >
                  <option value="all">All Teams</option>
                  {teams.map((teamData) => (
                    <option key={teamData.team.id} value={teamData.team.id}>
                      {teamData.team.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Transaction Type Filter */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                  Transaction Type
                </label>
                <select
                  value={selectedTransactionType}
                  onChange={(e) => setSelectedTransactionType(e.target.value)}
                  className="w-full py-2.5 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer"
                >
                  <option value="all">All Types</option>
                  <optgroup label="Income">
                    <option value="match_reward">Match Rewards</option>
                    <option value="position_reward">Position Rewards</option>
                    <option value="completion_bonus">Completion Bonus</option>
                    <option value="knockout_reward">Knockout Rewards</option>
                    <option value="bonus">Bonus</option>
                  </optgroup>
                  <optgroup label="Expenses">
                    <option value="salary_payment">Salary Payments</option>
                    <option value="real_player_fee">Real Player Fees</option>
                    <option value="auction_win">Auction Wins</option>
                    <option value="fine">Fines</option>
                  </optgroup>
                  <optgroup label="Transfers">
                    <option value="transfer_payment">Transfer Payments</option>
                    <option value="transfer_compensation">Transfer Compensation</option>
                    <option value="swap_fee_paid">Swap Fee Paid</option>
                    <option value="swap_fee_received">Swap Fee Received</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="player_release_refund">Release</option>
                    <option value="initial_balance">Initial Balance</option>
                  </optgroup>
                </select>
              </div>

              {/* Currency Filter */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  Currency
                </label>
                <select
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  className="w-full py-2.5 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer"
                >
                  <option value="all">All Currencies</option>
                  <option value="football">eCoin Only</option>
                  <option value="real">SSCoin Only</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isFetchingTransactions && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 text-center shadow-sm font-mono">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber-500 border-t-transparent mx-auto"></div>
            <p className="text-slate-400 text-xs font-extrabold uppercase tracking-wider mt-4">Loading transactions...</p>
          </div>
        )}

        {/* Team Summary View */}
        {!isFetchingTransactions && showSummary && teamSummary.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden mb-6 font-mono">
            <div className="bg-slate-800 text-white border-b border-slate-900 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-slate-900 border border-slate-950 rounded-lg">
                    <DollarSign className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-xs font-extrabold uppercase tracking-wider">Team Financial Summary</h2>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Income vs Expenses by team</p>
                  </div>
                </div>
                <button
                  onClick={copyTeamSummaryToWhatsApp}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-950 text-amber-400 border border-slate-950 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer"
                  title="Copy summary to clipboard for WhatsApp"
                >
                  <Share2 className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Copy to WhatsApp</span>
                  <span className="sm:hidden">Copy</span>
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200/60">
                    <tr>
                      <th className="px-4 lg:px-6 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rank</th>
                      <th className="px-4 lg:px-6 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team Name</th>
                      <th className="px-4 lg:px-6 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Income</th>
                      <th className="px-4 lg:px-6 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expenses</th>
                      <th className="px-4 lg:px-6 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net Balance</th>
                      <th className="px-4 lg:px-6 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Transactions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {teamSummary.map((team, index) => (
                      <tr key={team.teamId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 lg:px-6 py-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-sm border ${
                            index === 0 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            index === 1 ? 'bg-slate-100 text-slate-600 border-slate-200' :
                            index === 2 ? 'bg-orange-50 text-orange-700 border-orange-200' :
                            'bg-slate-50 text-slate-500 border-slate-200'
                          }`}>
                            {index + 1}
                          </div>
                        </td>
                        <td className="px-4 lg:px-6 py-3">
                          <div className="font-extrabold text-slate-850 text-sm uppercase tracking-wider">{team.teamName}</div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase mt-1 flex flex-wrap gap-2">
                            <span>eCoin: <strong className="text-blue-600">+{team.eCoinIncome}/-{team.eCoinExpense}</strong></span>
                            <span>•</span>
                            <span>SSCoin: <strong className="text-purple-600">+{team.sSCoinIncome}/-{team.sSCoinExpense}</strong></span>
                          </div>
                        </td>
                        <td className="px-4 lg:px-6 py-3 text-right">
                          <span className="font-extrabold text-emerald-600">+{team.totalIncome}</span>
                        </td>
                        <td className="px-4 lg:px-6 py-3 text-right">
                          <span className="font-extrabold text-rose-600">-{team.totalExpense}</span>
                        </td>
                        <td className="px-4 lg:px-6 py-3 text-right">
                          <span className={`text-base font-black ${team.netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {team.netBalance >= 0 ? '+' : ''}{team.netBalance}
                          </span>
                        </td>
                        <td className="px-4 lg:px-6 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black bg-slate-50 border border-slate-200 text-slate-700">
                            {team.transactionCount}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200/80">
                    <tr>
                      <td colSpan={2} className="px-4 lg:px-6 py-3 text-right font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                        Grand Total:
                      </td>
                      <td className="px-4 lg:px-6 py-3 text-right font-extrabold text-emerald-600 text-xs sm:text-sm">
                        +{teamSummary.reduce((sum, team) => sum + team.totalIncome, 0)}
                      </td>
                      <td className="px-4 lg:px-6 py-3 text-right font-extrabold text-rose-600 text-xs sm:text-sm">
                        -{teamSummary.reduce((sum, team) => sum + team.totalExpense, 0)}
                      </td>
                      <td className="px-4 lg:px-6 py-3 text-right font-black text-slate-800 text-sm sm:text-base">
                        {teamSummary.reduce((sum, team) => sum + team.netBalance, 0)}
                      </td>
                      <td className="px-4 lg:px-6 py-3 text-center font-extrabold text-slate-700 text-xs">
                        {teamSummary.reduce((sum, team) => sum + team.transactionCount, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* No Transactions */}
        {!isFetchingTransactions && !showSummary && transactions.length === 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 text-center shadow-sm font-mono">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800 border border-slate-900 shadow-md mb-4">
              <DollarSign className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">No Transactions Found</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase">No transactions match the selected filters</p>
          </div>
        )}

        {/* Detailed Transactions List - Grouped by Category */}
        {!isFetchingTransactions && !showSummary && transactions.length > 0 && (
          <>
            {/* Income Transactions */}
            {(() => {
              const incomeTransactions = paginatedTransactions.filter(t => isIncomeTransaction(t.transaction_type, t.amount));
              const incomeByTypeCurrency = incomeTransactions.reduce((acc, txn) => {
                const key = `${txn.transaction_type}_${txn.currency_type}`;
                if (!acc[key]) acc[key] = { type: txn.transaction_type, currency: txn.currency_type, transactions: [] };
                acc[key].transactions.push(txn);
                return acc;
              }, {} as Record<string, { type: string; currency: string; transactions: Transaction[] }>);

              const eCoinIncome = incomeTransactions.filter(t => t.currency_type === 'football').reduce((sum, t) => sum + Math.abs(t.amount), 0);
              const sSCoinIncome = incomeTransactions.filter(t => t.currency_type === 'real').reduce((sum, t) => sum + Math.abs(t.amount), 0);

              return Object.keys(incomeByTypeCurrency).length > 0 && (
                <div className="console-card bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden mb-6 font-mono">
                  <div className="bg-slate-800 text-white border-b border-slate-900 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-slate-900 border border-slate-950 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-xs font-extrabold uppercase tracking-wider">Income Transactions</h2>
                        <div className="flex flex-wrap gap-3 mt-1.5 text-[9px] font-bold uppercase text-slate-400">
                          <span>eCoin: <strong className="text-blue-500">+{eCoinIncome.toLocaleString()}</strong></span>
                          <span>•</span>
                          <span>SSCoin: <strong className="text-purple-500">+{sSCoinIncome.toLocaleString()}</strong></span>
                          <span>•</span>
                          <span>Total: <strong className="text-emerald-500">+{ (eCoinIncome + sSCoinIncome).toLocaleString() }</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 space-y-6">
                    {Object.entries(incomeByTypeCurrency).map(([key, data]) => {
                      const typeTotal = data.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                      return (
                        <div key={key} className="border border-slate-200/60 rounded-2xl overflow-hidden">
                          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200/60 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1 bg-white border border-slate-200/60 rounded-lg">
                                {renderTransactionIcon(data.type)}
                              </div>
                              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">{formatTransactionType(data.type)}</h3>
                              {data.currency === 'football' ? (
                                <span className="px-1.5 py-0.5 bg-blue-50/50 border border-blue-200 text-blue-600 rounded text-[9px] font-extrabold uppercase">eCoin</span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-purple-50/50 border border-purple-200 text-purple-600 rounded text-[9px] font-extrabold uppercase">SSCoin</span>
                              )}
                              <span className="text-[10px] text-slate-400 font-bold uppercase">({data.transactions.length} txs)</span>
                            </div>
                            <span className="text-sm font-black text-emerald-600">+{typeTotal.toLocaleString()}</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-slate-50 border-b border-slate-200/60">
                                <tr>
                                  <th className="px-4 py-2.5 text-left text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Date</th>
                                  <th className="px-4 py-2.5 text-left text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Team</th>
                                  <th className="px-4 py-2.5 text-left text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Description</th>
                                  <th className="px-4 py-2.5 text-right text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {data.transactions.map((txn) => (
                                  <tr key={txn.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-4 py-3 text-[10px] font-bold text-slate-400 whitespace-nowrap">{formatDate(txn.created_at)}</td>
                                    <td className="px-4 py-3 text-xs font-extrabold text-slate-800 uppercase tracking-wider">{txn.team_name}</td>
                                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                                      {txn.metadata?.player_name ? (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded text-[9px] font-extrabold uppercase">{txn.metadata.player_name}</span>
                                          <span className="text-slate-500">{txn.description}</span>
                                        </div>
                                      ) : (
                                        txn.description
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs font-black text-emerald-600">+{Math.abs(txn.amount).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-slate-50 border-t border-slate-200/60">
                                <tr>
                                  <td colSpan={3} className="px-4 py-2 text-right text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Subtotal:</td>
                                  <td className="px-4 py-2 text-right text-xs font-black text-emerald-600">+{typeTotal.toLocaleString()}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Expense Transactions */}
            {(() => {
              const expenseTransactions = paginatedTransactions.filter(t => !isIncomeTransaction(t.transaction_type, t.amount));
              const expenseByTypeCurrency = expenseTransactions.reduce((acc, txn) => {
                const key = `${txn.transaction_type}_${txn.currency_type}`;
                if (!acc[key]) acc[key] = { type: txn.transaction_type, currency: txn.currency_type, transactions: [] };
                acc[key].transactions.push(txn);
                return acc;
              }, {} as Record<string, { type: string; currency: string; transactions: Transaction[] }>);

              const eCoinExpense = expenseTransactions.filter(t => t.currency_type === 'football').reduce((sum, t) => sum + Math.abs(t.amount), 0);
              const sSCoinExpense = expenseTransactions.filter(t => t.currency_type === 'real').reduce((sum, t) => sum + Math.abs(t.amount), 0);

              return Object.keys(expenseByTypeCurrency).length > 0 && (
                <div className="console-card bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden mb-6 font-mono">
                  <div className="bg-slate-800 text-white border-b border-slate-900 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-slate-900 border border-slate-950 rounded-lg">
                        <TrendingDown className="w-5 h-5 text-rose-500" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-xs font-extrabold uppercase tracking-wider">Expense Transactions</h2>
                        <div className="flex flex-wrap gap-3 mt-1.5 text-[9px] font-bold uppercase text-slate-400">
                          <span>eCoin: <strong className="text-blue-500">-{eCoinExpense.toLocaleString()}</strong></span>
                          <span>•</span>
                          <span>SSCoin: <strong className="text-purple-500">-{sSCoinExpense.toLocaleString()}</strong></span>
                          <span>•</span>
                          <span>Total: <strong className="text-rose-500">-{(eCoinExpense + sSCoinExpense).toLocaleString()}</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 space-y-6">
                    {Object.entries(expenseByTypeCurrency).map(([key, data]) => {
                      const typeTotal = data.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                      return (
                        <div key={key} className="border border-slate-200/60 rounded-2xl overflow-hidden">
                          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200/60 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1 bg-white border border-slate-200/60 rounded-lg">
                                {renderTransactionIcon(data.type)}
                              </div>
                              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">{formatTransactionType(data.type)}</h3>
                              {data.currency === 'football' ? (
                                <span className="px-1.5 py-0.5 bg-blue-50/50 border border-blue-200 text-blue-600 rounded text-[9px] font-extrabold uppercase">eCoin</span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-purple-50/50 border border-purple-200 text-purple-600 rounded text-[9px] font-extrabold uppercase">SSCoin</span>
                              )}
                              <span className="text-[10px] text-slate-400 font-bold uppercase">({data.transactions.length} txs)</span>
                            </div>
                            <span className="text-sm font-black text-rose-600">-{typeTotal.toLocaleString()}</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-slate-50 border-b border-slate-200/60">
                                <tr>
                                  <th className="px-4 py-2.5 text-left text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Date</th>
                                  <th className="px-4 py-2.5 text-left text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Team</th>
                                  <th className="px-4 py-2.5 text-left text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Description</th>
                                  <th className="px-4 py-2.5 text-right text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {data.transactions.map((txn) => (
                                  <tr key={txn.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-4 py-3 text-[10px] font-bold text-slate-400 whitespace-nowrap">{formatDate(txn.created_at)}</td>
                                    <td className="px-4 py-3 text-xs font-extrabold text-slate-800 uppercase tracking-wider">{txn.team_name}</td>
                                    <td className="px-4 py-3 text-xs text-slate-650 max-w-xs truncate">
                                      {txn.metadata?.player_name ? (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded text-[9px] font-extrabold uppercase">{txn.metadata.player_name}</span>
                                          <span className="text-slate-500">{txn.description}</span>
                                        </div>
                                      ) : (
                                        txn.description
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs font-black text-rose-600">-{Math.abs(txn.amount).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-slate-50 border-t border-slate-200/60">
                                <tr>
                                  <td colSpan={3} className="px-4 py-2 text-right text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Subtotal:</td>
                                  <td className="px-4 py-2 text-right text-xs font-black text-rose-600">-{typeTotal.toLocaleString()}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Pagination Controls - Only show when viewing all teams */}
            {shouldPaginate && totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <div>
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 text-slate-500 hover:text-slate-800 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 text-slate-500 hover:text-slate-800 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 text-slate-500 hover:text-slate-800 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 text-slate-500 hover:text-slate-800 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Last
                  </button>
                </div>
                <div>
                  Showing {startIndex + 1}-{Math.min(endIndex, totalTransactions)} of {totalTransactions}
                </div>
              </div>
            )}
          </>
        )}

        {/* Info Box */}
        <div className="mt-6 console-card bg-amber-50/50 border border-amber-250/60 p-5 rounded-2xl font-mono text-slate-700 relative z-10">
          <div className="flex items-center gap-2 text-amber-800 mb-3 border-b border-amber-200/50 pb-2">
            <Info className="w-4 h-4" />
            <h4 className="font-extrabold text-xs uppercase tracking-wider">About Transaction Types</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <strong className="text-amber-800 text-[10px] uppercase tracking-wider block mb-1">Income</strong>
              <ul className="text-xs font-medium text-slate-600 mt-1 space-y-1">
                <li>• Match Rewards (Win/Draw/Loss)</li>
                <li>• Tournament Rewards (Position/Completion/Knockout)</li>
                <li>• Transfer Compensation</li>
                <li>• Release</li>
              </ul>
            </div>
            <div>
              <strong className="text-amber-800 text-[10px] uppercase tracking-wider block mb-1">Expenses</strong>
              <ul className="text-xs font-medium text-slate-600 mt-1 space-y-1">
                <li>• Salary Payments (Real & Football Players)</li>
                <li>• Real Player Registration Fees</li>
                <li>• Auction Wins</li>
                <li>• Transfer Payments</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
