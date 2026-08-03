'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useAuctionWebSocket } from '@/hooks/useWebSocket';
import { useAutoFinalize } from '@/hooks/useAutoFinalize';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft, Trash2, ShieldAlert, CheckCircle2, AlertTriangle, Info, Sparkles, Plus, Clock, Users, ChevronRight, ChevronDown, RefreshCw, Play, DollarSign, Check, FileText, Settings, Calendar, ArrowRight, Download, CheckCircle, XCircle } from 'lucide-react';

interface Bid {
  id: string;
  team_id: string;
  player_id: string;
  player_name: string;
  position: string;
  team_name: string;
  overall_rating: number;
  round_id: string;
  amount: number;
  status: string;
  created_at: string;
  phase?: 'regular' | 'incomplete';
  actual_bid_amount?: number;
}

interface BidsByPlayer {
  [playerId: string]: {
    player: {
      id: string;
      name: string;
      position: string;
      overall_rating: number;
    };
    bids: Bid[];
    winningBid: Bid | null;
  };
}

interface TeamBids {
  [teamId: string]: {
    team: {
      id: string;
      name: string;
    };
    bids: Array<{
      player: { id: string; name: string; position: string; overall_rating: number };
      amount: number;
      timestamp: string;
      won: boolean;
      lossReason?: string;
    }>;
  };
}

interface Round {
  id: string;
  season_id: string;
  position: string;
  max_bids_per_team: number;
  status: string;
  start_time?: string;
  end_time?: string;
  created_at: string;
  updated_at: string;
  bids: Bid[];
  round_type?: string; // 'bulk' or 'regular'
  finalization_mode?: 'auto' | 'manual';
}

interface TeamBidCount {
  team_id: string;
  team_name: string;
  bid_count: number;
  required_bids: number;
}


export default function RoundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { id: roundId } = use(params);
  const [round, setRound] = useState<Round | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [teamBidCounts, setTeamBidCounts] = useState<TeamBidCount[]>([]);

  // <CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Enable WebSocket for real-time bid updates
  const { isConnected } = useAuctionWebSocket(roundId, true);

  // Fetch round details function (moved up for use in auto-finalize)
  const fetchRound = async () => {
    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/rounds/${roundId}`);
      const { success, data } = await response.json();

      if (success) {
        setRound(data);
        // Calculate team bid counts
        if (data.bids) {
          const counts = new Map<string, { name: string; count: number }>();
          data.bids.forEach((bid: Bid) => {
            if (!counts.has(bid.team_id)) {
              counts.set(bid.team_id, { name: bid.team_name, count: 0 });
            }
            counts.get(bid.team_id)!.count++;
          });
          const countArray = Array.from(counts.entries()).map(([teamId, info]) => ({
            team_id: teamId,
            team_name: info.name,
            bid_count: info.count,
            required_bids: data.max_bids_per_team,
          }));
          setTeamBidCounts(countArray);
        }
      }
    } catch (err) {
      console.error('Error fetching round:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // <CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Enable auto-finalization when timer reaches zero
  const { timeRemaining, isFinalizing } = useAutoFinalize({
    roundId,
    endTime: round?.end_time || null,
    finalizationMode: round?.finalization_mode || 'auto',
    enabled: round?.status === 'active',
    onFinalizationStart: () => {
      console.log('<RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Auto-finalization started');
      setShowLoadingOverlay(true);
    },
    onFinalizationComplete: () => {
      console.log('<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Auto-finalization completed');
      setShowLoadingOverlay(false);
      fetchRound(); // Refresh round data
    },
    onFinalizationError: (error) => {
      console.error('<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> Auto-finalization error:', error);
      setShowLoadingOverlay(false);
      alert(`Finalization failed: ${error}`);
    },
  });
  const handleUpdateStatus = async (newStatus: string) => {
    if (!round) return;

    const confirmMessage = `Are you sure you want to change the round status to "${newStatus}"?`;
    if (!confirm(confirmMessage)) return;

    try {
      const response = await fetchWithTokenRefresh(`/api/rounds/${round.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const { success, data } = await response.json();

      if (success) {
        setRound({ ...round, ...data });
        alert(`Round status updated to ${newStatus}`);
      }
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update status');
    }
  };

  const handleDeleteRound = async () => {
    if (!round) return;

    if (round.status === 'active' || round.status === 'completed') {
      alert('Cannot delete active or completed rounds');
      return;
    }

    const confirmMessage = 'Are you sure you want to delete this round? This action cannot be undone.';
    if (!confirm(confirmMessage)) return;

    try {
      const response = await fetchWithTokenRefresh(`/api/rounds/${round.id}`, {
        method: 'DELETE',
      });

      const { success } = await response.json();

      if (success) {
        alert('Round deleted successfully');
        router.push('/dashboard/committee/rounds');
      }
    } catch (err) {
      console.error('Error deleting round:', err);
      alert('Failed to delete round');
    }
  };


  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch round details on mount
  useEffect(() => {
    if (roundId) {
      fetchRound();
    }
  }, [roundId]);

  // Organize bids by player
  const organizeBidsByPlayer = (): BidsByPlayer => {
    if (!round?.bids) return {};

    const bidsByPlayer: BidsByPlayer = {};

    round.bids.forEach((bid) => {
      if (!bidsByPlayer[bid.player_id]) {
        bidsByPlayer[bid.player_id] = {
          player: {
            id: bid.player_id,
            name: bid.player_name,
            position: bid.position,
            overall_rating: bid.overall_rating,
          },
          bids: [],
          winningBid: null,
        };
      }

      bidsByPlayer[bid.player_id].bids.push(bid);

      // Set winning bid (status 'won' for completed rounds)
      if (bid.status === 'won') {
        bidsByPlayer[bid.player_id].winningBid = bid;
      }
    });

    return bidsByPlayer;
  };

  // Organize bids by team
  const organizeBidsByTeam = (bidsByPlayer: BidsByPlayer): TeamBids => {
    const teamBids: TeamBids = {};

    Object.values(bidsByPlayer).forEach((playerData) => {
      playerData.bids.forEach((bid) => {
        if (!teamBids[bid.team_id]) {
          teamBids[bid.team_id] = {
            team: {
              id: bid.team_id,
              name: bid.team_name,
            },
            bids: [],
          };
        }

        // Determine loss reason
        let lossReason = '';
        if (bid.status === 'lost') {
          // Check if this team won a different player
          const teamWonBid = round?.bids.find(
            b => b.team_id === bid.team_id && b.status === 'won'
          );
          
          // Only show loss reason if the bid was higher than what they won
          // (No need to explain why lower bids lost)
          if (teamWonBid && bid.amount > teamWonBid.amount) {
            // First check if another team won this specific player
            if (playerData.winningBid && playerData.winningBid.team_id !== bid.team_id) {
              // This player was won by another team - show who won
              lossReason = `${playerData.player.name} won by ${playerData.winningBid.team_name} (£${playerData.winningBid.amount.toLocaleString()})`;
            } else {
              // Team's other higher bids were cancelled after winning a player
              lossReason = `Team already won ${teamWonBid.player_name}`;
            }
          } else if (!teamWonBid) {
            // Team didn't win anything - show who won this player
            if (playerData.winningBid && playerData.winningBid.team_id !== bid.team_id) {
              lossReason = `${playerData.player.name} won by ${playerData.winningBid.team_name} (£${playerData.winningBid.amount.toLocaleString()})`;
            } else {
              lossReason = 'Lost bid';
            }
          }
        }

        teamBids[bid.team_id].bids.push({
          player: playerData.player,
          amount: bid.amount,
          timestamp: bid.created_at,
          won: bid.status === 'won',
          lossReason,
        });
      });
    });

    return teamBids;
  };

  const toggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
      }
      return newSet;
    });
  };

  const getPositionColor = (position: string) => {
    const positionMap: { [key: string]: string } = {
      GK: 'bg-blue-100 text-blue-800',
      CB: 'bg-green-100 text-green-800',
      RB: 'bg-green-100 text-green-800',
      LB: 'bg-green-100 text-green-800',
      CMF: 'bg-yellow-100 text-yellow-800',
      DMF: 'bg-yellow-100 text-yellow-800',
      AMF: 'bg-purple-100 text-purple-800',
      RMF: 'bg-purple-100 text-purple-800',
      LMF: 'bg-purple-100 text-purple-800',
      RWF: 'bg-purple-100 text-purple-800',
      LWF: 'bg-purple-100 text-purple-800',
      SS: 'bg-orange-100 text-orange-800',
      CF: 'bg-red-100 text-red-800',
    };
    return positionMap[position] || 'bg-gray-100 text-gray-800';
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 85) return 'bg-green-100 text-green-800';
    if (rating >= 75) return 'bg-blue-100 text-blue-800';
    if (rating >= 65) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const handleExport = async () => {
    if (!round) return;
    setShowLoadingOverlay(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      
      // Sheet 1: Round Summary
      const summarySheet = workbook.addWorksheet('Round Summary');
      summarySheet.columns = [
        { header: 'Field', key: 'field', width: 20 },
        { header: 'Value', key: 'value', width: 40 }
      ];
      
      summarySheet.addRows([
        { field: 'Round ID', value: round.id },
        { field: 'Position', value: round.position },
        { field: 'Status', value: round.status },
        { field: 'Max Bids Per Team', value: round.max_bids_per_team },
        { field: 'Start Time', value: round.start_time ? new Date(round.start_time).toLocaleString() : 'N/A' },
        { field: 'End Time', value: round.end_time ? new Date(round.end_time).toLocaleString() : 'N/A' },
        { field: 'Created At', value: round.created_at ? new Date(round.created_at).toLocaleString() : 'N/A' },
        { field: 'Total Bids', value: round.bids?.length || 0 }
      ]);
      
      // Style the summary sheet
      summarySheet.getRow(1).font = { bold: true };
      summarySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }
      };
      
      // Sheet 2: Winning Bids (if completed)
      if (isCompleted && winningBids.length > 0) {
        const winningSheet = workbook.addWorksheet('Winning Bids');
        winningSheet.columns = [
          { header: 'Player Name', key: 'playerName', width: 25 },
          { header: 'Position', key: 'position', width: 12 },
          { header: 'Overall Rating', key: 'rating', width: 15 },
          { header: 'Team Name', key: 'teamName', width: 25 },
          { header: 'Bid Amount', key: 'amount', width: 15 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Phase', key: 'phase', width: 12 },
          { header: 'Actual Bid Amount', key: 'actualAmount', width: 18 }
        ];
        
        winningBids.forEach(playerData => {
          const bid = playerData.winningBid!;
          winningSheet.addRow({
            playerName: playerData.player.name,
            position: playerData.player.position,
            rating: playerData.player.overall_rating,
            teamName: bid.team_name,
            amount: bid.amount,
            status: 'Won',
            phase: bid.phase || 'regular',
            actualAmount: bid.actual_bid_amount || bid.amount
          });
        });
        
        // Style the winning bids sheet
        winningSheet.getRow(1).font = { bold: true };
        winningSheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD1FAE5' }
        };
      }
      
      // Sheet 3: All Bids by Team
      const allBidsSheet = workbook.addWorksheet('All Bids by Team');
      allBidsSheet.columns = [
        { header: 'Team Name', key: 'teamName', width: 25 },
        { header: 'Player Name', key: 'playerName', width: 25 },
        { header: 'Position', key: 'position', width: 12 },
        { header: 'Overall Rating', key: 'rating', width: 15 },
        { header: 'Bid Amount', key: 'amount', width: 15 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Timestamp', key: 'timestamp', width: 20 },
        { header: 'Loss Reason', key: 'lossReason', width: 40 }
      ];
      
      Object.entries(teamBids).forEach(([teamId, teamData]) => {
        teamData.bids.forEach(bid => {
          allBidsSheet.addRow({
            teamName: teamData.team.name,
            playerName: bid.player.name,
            position: bid.player.position,
            rating: bid.player.overall_rating,
            amount: bid.amount,
            status: bid.won ? 'Won' : 'Lost',
            timestamp: new Date(bid.timestamp).toLocaleString(),
            lossReason: bid.lossReason || ''
          });
        });
      });
      
      // Style the all bids sheet
      allBidsSheet.getRow(1).font = { bold: true };
      allBidsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF3C7' }
      };
      
      // Sheet 4: Team Bid Counts
      const bidCountsSheet = workbook.addWorksheet('Team Bid Counts');
      bidCountsSheet.columns = [
        { header: 'Team Name', key: 'teamName', width: 25 },
        { header: 'Bids Submitted', key: 'bidCount', width: 18 },
        { header: 'Required Bids', key: 'requiredBids', width: 18 },
        { header: 'Complete', key: 'complete', width: 12 }
      ];
      
      teamBidCounts.forEach(teamCount => {
        bidCountsSheet.addRow({
          teamName: teamCount.team_name,
          bidCount: teamCount.bid_count,
          requiredBids: teamCount.required_bids,
          complete: teamCount.bid_count >= teamCount.required_bids ? 'Yes' : 'No'
        });
      });
      
      // Style the bid counts sheet
      bidCountsSheet.getRow(1).font = { bold: true };
      bidCountsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFBFDBFE' }
      };
      
      // Generate Excel file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // Download file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `round_${round.id.substring(0, 8)}_${round.position}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data. Please try again.');
    } finally {
      setShowLoadingOverlay(false);
    }
  };

  if (loading || isLoading || !round) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto animate-duration-1000"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading round details...</p>
        </div>
      </div>
    );
  }

  const bidsByPlayer = organizeBidsByPlayer();
  const teamBids = organizeBidsByTeam(bidsByPlayer);
  const winningBids = Object.values(bidsByPlayer).filter((p) => p.winningBid);
  const isCompleted = round.status === 'completed';

  return (
    <>
      {/* Loading Overlay */}
      {showLoadingOverlay && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity duration-300 font-mono">
          <div className="flex flex-col items-center">
            <RefreshCw className="w-12 h-12 text-amber-400 animate-spin mb-4" />
            <p className="text-white font-bold text-xs uppercase tracking-wider">Exporting round data...</p>
          </div>
        </div>
      )}

      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
        {/* Decorative glowing ambient overlay */}
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10 space-y-6">
          {/* Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/dashboard/committee/rounds"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Rounds
            </Link>

            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-100" /> Export to Excel
            </button>
          </div>

          {/* Header Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
                <Settings className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">COMMITTEE CONSOLE</span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                  Round Details
                </h1>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Manage players and control auction round #{round.id.substring(0, 8)}.
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* WebSocket Status */}
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase font-mono shadow-sm ${
                isConnected 
                  ? 'bg-green-50 border-green-200 text-green-800' 
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-2 ${
                  isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
                }`}></span>
                {isConnected ? 'Live Sync' : 'Offline'}
              </span>

              <span className={`inline-flex px-3 py-1.5 rounded-full text-[10px] font-bold uppercase border font-mono shadow-sm ${
                round.status === 'active'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}>
                {round.status}
              </span>
            </div>
          </div>

          {/* Round Info Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <h3 className="text-sm font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500" />
              Round Information
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Position</div>
                <div className="text-base font-extrabold text-slate-800 mt-1">{round.position}</div>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Max Bids Per Team</div>
                <div className="text-base font-extrabold text-slate-800 mt-1">{round.max_bids_per_team}</div>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Total Bids Placed</div>
                <div className="text-base font-extrabold text-slate-800 mt-1">{round.bids?.length || 0}</div>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Unique Players</div>
                <div className="text-base font-extrabold text-slate-800 mt-1">
                  {new Set(round.bids?.map(b => b.player_id) || []).size}
                </div>
              </div>
            </div>

            {/* Status Controls */}
            <div className="pt-6 border-t border-slate-100 space-y-3">
              <div className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider block">Round Status Controls</div>
              <div className="flex flex-wrap items-center gap-3">
                {round.status === 'draft' && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus('scheduled')}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                    >
                      Schedule Round
                    </button>
                    <button
                      onClick={() => handleUpdateStatus('active')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                    >
                      Start Round Now
                    </button>
                  </>
                )}
                {round.status === 'scheduled' && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus('active')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                    >
                      Start Round
                    </button>
                    <button
                      onClick={() => handleUpdateStatus('draft')}
                      className="px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Back to Draft
                    </button>
                  </>
                )}
                {round.status === 'active' && (
                  <button
                    onClick={() => handleUpdateStatus('completed')}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                  >
                    Complete Round
                  </button>
                )}
                {(round.status === 'draft' || round.status === 'scheduled') && (
                  <button
                    onClick={handleDeleteRound}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer ml-auto"
                  >
                    Delete Round
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Winning Bids Section */}
          {isCompleted && winningBids.length > 0 && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
              <h3 className="text-sm sm:text-base font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Winning Bids
              </h3>

              {/* Mobile-friendly card view */}
              <div className="block md:hidden space-y-3 font-mono text-xs">
                {winningBids.map((playerData, index) => {
                  const bid = playerData.winningBid!;
                  const isIncomplete = bid.phase === 'incomplete';
                  const teamInfo = teamBidCounts.find(t => t.team_id === bid.team_id);
                  return (
                    <div
                      key={playerData.player.id}
                      className="p-4 bg-slate-50 border border-slate-200 rounded-2xl border-l-4 border-l-emerald-500 space-y-3"
                    >
                      <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                        <div className="font-bold text-slate-800 text-sm">{playerData.player.name}</div>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold uppercase text-[9px] border border-slate-200">
                          {playerData.player.position}
                        </span>
                      </div>
                      {isIncomplete && teamInfo && round.round_type !== 'bulk' && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-[10px] text-orange-800 flex items-start gap-1.5 font-bold">
                          <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <div>
                            <strong>Incomplete Bid:</strong> {bid.team_name} only submitted {teamInfo.bid_count}/{teamInfo.required_bids} bids. Player assigned at average price of £{bid.amount.toLocaleString()}
                            {bid.actual_bid_amount && (
                              <span className="block mt-1 text-orange-700">Original bid: £{bid.actual_bid_amount.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="bg-white p-2 rounded-lg border border-slate-200">
                          <div className="text-slate-400 font-bold uppercase">Team</div>
                          <div className="font-bold text-slate-800 truncate">{bid.team_name}</div>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200">
                          <div className="text-slate-400 font-bold uppercase">Amount</div>
                          <div className="font-bold text-emerald-700">£{bid.amount.toLocaleString()}</div>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200">
                          <div className="text-slate-400 font-bold uppercase">Rating</div>
                          <div>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border ${getRatingColor(playerData.player.overall_rating)}`}>
                              {playerData.player.overall_rating}
                            </span>
                          </div>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200">
                          <div className="text-slate-400 font-bold uppercase">Status</div>
                          <span className="px-2 py-0.5 inline-flex text-[9px] leading-5 font-extrabold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">
                            Won
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Table for larger screens */}
              <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-white">
                <table className="min-w-full divide-y divide-slate-100 font-mono text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Player</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Position</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bid Amount</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Overall Rating</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {winningBids.map((playerData, index) => {
                      const bid = playerData.winningBid!;
                      const isIncomplete = bid.phase === 'incomplete';
                      const teamInfo = teamBidCounts.find(t => t.team_id === bid.team_id);
                      return (
                        <tr
                          key={playerData.player.id}
                          className={`hover:bg-slate-50/50 transition-colors ${isIncomplete ? 'bg-orange-50/10' : ''}`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-col">
                              <div className="font-bold text-slate-800">{playerData.player.name}</div>
                              {isIncomplete && teamInfo && round.round_type !== 'bulk' && (
                                <div className="text-[10px] text-orange-600 flex items-center gap-1 mt-0.5 font-bold">
                                  <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                                  Incomplete ({teamInfo.bid_count}/{teamInfo.required_bids})
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 inline-flex text-[9px] font-extrabold uppercase rounded-full ${getPositionColor(playerData.player.position)}`}>
                              {playerData.player.position}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-700">{bid.team_name}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-bold text-emerald-700">
                              £{bid.amount.toLocaleString()}
                              {round.round_type === 'bulk' && (
                                <span className="text-blue-600 text-[9px] block font-bold uppercase mt-0.5">(Base price)</span>
                              )}
                              {isIncomplete && round.round_type !== 'bulk' && (
                                <span className="text-orange-600 text-[9px] block font-bold uppercase mt-0.5">
                                  (Average price)
                                  {bid.actual_bid_amount && (
                                    <span className="block mt-0.5">Bid: £{bid.actual_bid_amount.toLocaleString()}</span>
                                  )}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 inline-flex text-[9px] font-extrabold uppercase rounded border ${getRatingColor(playerData.player.overall_rating)}`}>
                              {playerData.player.overall_rating}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className="px-2 py-0.5 inline-flex text-[9px] font-extrabold uppercase rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">
                              Won
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* All Bids Section */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <h3 className="text-sm font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              All Bids by Team
            </h3>

            <div className="space-y-4 font-mono">
              {Object.keys(teamBids).length > 0 ? (
                Object.entries(teamBids).map(([teamId, teamData], index) => {
                  const isExpanded = expandedTeams.has(teamId);
                  const wonCount = teamData.bids.filter((b) => b.won).length;

                  return (
                    <div
                      key={teamId}
                      className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/10"
                    >
                      {/* Expandable header */}
                      <div
                        className="p-4 bg-slate-50 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors"
                        onClick={() => toggleTeam(teamId)}
                      >
                        <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                          <Users className="w-4 h-4 text-slate-500 shrink-0" />
                          {teamData.team.name}
                        </h4>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-bold text-slate-605">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>{teamData.bids.length} bids</span>
                          </div>
                          {wonCount > 0 && (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-[10px] font-bold text-emerald-700">
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span>{wonCount} won</span>
                            </div>
                          )}
                          <ChevronRight
                            className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${
                              isExpanded ? 'rotate-90' : ''
                            }`}
                          />
                        </div>
                      </div>

                      {/* Collapsible content */}
                      {isExpanded && (
                        <div className="divide-y divide-slate-100 bg-white">
                          {teamData.bids
                            .sort((a, b) => b.amount - a.amount)
                            .map((bid, bidIndex) => (
                              <div
                                key={bidIndex}
                                className={`p-4 hover:bg-slate-50/30 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs ${
                                  bid.won ? 'border-l-4 border-l-emerald-500' : ''
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="h-8 w-8 flex-shrink-0 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center font-bold text-slate-600">
                                    {bid.player.name.substring(0, 2)}
                                  </div>
                                  <div className="flex flex-col">
                                    <div className="font-bold text-slate-800 flex items-center gap-2">
                                      {bid.player.name}
                                      {bid.won && (
                                        <span className="inline-flex items-center justify-center bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                                          Won
                                        </span>
                                      )}
                                      {!bid.won && bid.lossReason && (
                                        <span className="inline-flex items-center justify-center bg-orange-50 border border-orange-200 text-orange-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                                          Cancelled
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase mt-1 flex items-center gap-2 flex-wrap">
                                      <span className={`px-2 py-0.5 rounded-full ${getPositionColor(bid.player.position)}`}>
                                        {bid.player.position}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                        {new Date(bid.timestamp).toLocaleTimeString()}
                                      </span>
                                    </div>
                                    {bid.lossReason && (
                                      <div className="text-[10px] text-orange-600 mt-1 font-bold italic flex items-center gap-1">
                                        <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                        {bid.lossReason}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end shrink-0 ml-auto sm:ml-0">
                                  <div className={`text-base font-black ${bid.won ? 'text-emerald-700' : 'text-slate-800'}`}>
                                    £{bid.amount.toLocaleString()}
                                  </div>
                                  <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                                    {new Date(bid.timestamp).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 bg-slate-50 border border-slate-100 rounded-2xl space-y-3 font-mono text-xs">
                  <FileText className="w-10 h-10 mx-auto text-slate-300" />
                  <h3 className="font-extrabold text-slate-500 uppercase tracking-wide">No bids found</h3>
                  <p className="text-slate-400">This round has no bidding activity.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );

}
