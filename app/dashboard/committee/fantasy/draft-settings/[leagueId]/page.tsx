'use client';
import { DollarSign, Users, Plus, Trash2, ListFilter, ShieldCheck, ArrowLeft, AlertCircle, RefreshCw, ArrowLeftRight, Settings, ClipboardList, Smartphone, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface Slot {
  slot_index: number;
  name: string;
  list_id: string;
  base_price: number;
}

interface DraftSettings {
  budget_per_team: number;
  min_squad_size: number;
  max_squad_size: number;
  draft_status: string;
  draft_opens_at: string;
  draft_closes_at: string;
  category_settings: {
    slots: Slot[];
    lists: Record<string, string[]>; // list_id -> array of player_ids
    max_bids_per_team?: number;
  };
}

interface Player {
  real_player_id: string;
  player_name: string;
  real_team_name: string;
  category: string;  star_rating: number;
}

interface RedListPanelProps {
  listId: string;
  label: string;
  players: Player[];
  otherListId: string;
  movePlayerBetweenLists: (playerId: string, fromList: string, toList: string) => void;
  allocatePlayer: (playerId: string, listId: string) => void;
  wouldListConflict: (playerId: string, listId: string) => boolean;
  getPlayerListAssignment: (playerId: string) => string;
}

function RedListPanel({ listId, label, players, otherListId, movePlayerBetweenLists, allocatePlayer, wouldListConflict, getPlayerListAssignment }: RedListPanelProps) {
  const sortedPlayers = [...players].sort((a, b) => {
    const teamA = (a.real_team_name || '').toUpperCase();
    const teamB = (b.real_team_name || '').toUpperCase();
    if (teamA !== teamB) return teamA.localeCompare(teamB);
    return (a.player_name || '').toUpperCase().localeCompare((b.player_name || '').toUpperCase());
  });

  const generateWhatsAppMessage = () => {
    let msg = `📋 *${label.toUpperCase()}*\n`;
    msg += `Players: ${sortedPlayers.length}\n`;
    msg += `────────────────\n`;
    sortedPlayers.forEach((p, i) => {
      msg += `${i + 1}. ${p.player_name} - ${p.real_team_name || 'No Team'}\n`;
    });
    return msg;
  };

  const handleCopyWhatsApp = async () => {
    const msg = generateWhatsAppMessage();
    try {
      await navigator.clipboard.writeText(msg);
      alert('Copied! Paste in WhatsApp.');
    } catch {
      alert('Failed to copy. Please try again.');
    }
  };

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{label}</h4>
          <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
            {players.length}
          </span>
        </div>
        {players.length > 0 && (
          <button
            type="button"
            onClick={handleCopyWhatsApp}
            className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-md transition-colors cursor-pointer uppercase"
            title="Copy list to WhatsApp"
          ><Smartphone className="w-3 h-3 inline-block mr-1" /> Copy</button>
        )}
      </div>
      <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100">
        {sortedPlayers.map(player => {
          const hasConflict = wouldListConflict(player.real_player_id, listId);
          return (
            <div key={player.real_player_id} className={`px-4 py-3 flex items-center justify-between gap-3 ${hasConflict ? 'bg-red-50' : ''}`}>
              <div className="min-w-0">
                <div className="font-black text-slate-800 text-[11px] uppercase truncate">{player.player_name}</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">{player.real_team_name || '—'}</div>                    {hasConflict && <div className="text-[10px] text-red-500 font-black uppercase flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Same team</div>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => movePlayerBetweenLists(player.real_player_id, listId, otherListId)}
                  className="px-2 py-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors cursor-pointer uppercase"
                  title={`Move to ${otherListId}`}
                ><ArrowLeftRight className="w-3 h-3" /></button>
                <button
                  type="button"
                  onClick={() => allocatePlayer(player.real_player_id, '')}
                  className="px-2 py-1 text-[10px] font-bold bg-slate-50 text-slate-500 border border-slate-200 rounded-md hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer uppercase"
                  title="Unassign"
                ><X className="w-3 h-3" /></button>
              </div>
            </div>
          );
        })}
        {players.length === 0 && (
          <div className="p-8 text-center text-slate-300 text-xs font-bold uppercase">
            No players assigned
          </div>
        )}
      </div>
    </div>
  
    </AuthGuard>
  );
}

export default function DraftSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPopulating, setIsPopulating] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'slots' | 'lists'>('general');
  const [playerTab, setPlayerTab] = useState<string>('RED');
  const [teamSearch, setTeamSearch] = useState('');

  // Players Pool
  const [players, setPlayers] = useState<Player[]>([]);
  // Registered football clubs (for Real Team Slot)
  const [registeredTeams, setRegisteredTeams] = useState<Array<{ team_id: string; team_name: string; team_uid?: string }>>([]);


  const [settings, setSettings] = useState<DraftSettings>({
    budget_per_team: 500,
    min_squad_size: 5,
    max_squad_size: 7,
    draft_status: 'pending',
    draft_opens_at: '',
    draft_closes_at: '',
    category_settings: {
      slots: [
        { slot_index: 1, name: 'Red Slot 1', list_id: 'red_list_1', base_price: 20 },
        { slot_index: 2, name: 'Red Slot 2', list_id: 'red_list_2', base_price: 15 },
        { slot_index: 3, name: 'Blue Slot', list_id: 'blue_list', base_price: 10 },
        { slot_index: 4, name: 'Black Slot', list_id: 'black_list', base_price: 5 },
        { slot_index: 5, name: 'White Slot', list_id: 'white_list', base_price: 3 },
        { slot_index: 6, name: 'Real Team Slot', list_id: 'real_team_list', base_price: 25 }
      ],
      lists: {
        red_list_1: [],
        red_list_2: [],
        blue_list: [],
        black_list: [],
        white_list: [],
        real_team_list: []
      },
      max_bids_per_team: 10
    }
  });

  const { alertState, showAlert, closeAlert } = useModal();

  const loadAllData = async () => {
    if (!leagueId) return;

    try {
      // 1. Fetch settings
      const settingsResponse = await fetchWithTokenRefresh(`/api/fantasy/draft/settings?league_id=${leagueId}`);
      if (settingsResponse.ok) {
        const data = await settingsResponse.json();
        if (data.settings) {
          // Format ISO string dates to YYYY-MM-DDTHH:MM for datetime-local inputs
          const defaultCategorySettings = {
            slots: [
              { slot_index: 1, name: 'Red Slot 1', list_id: 'red_list_1', base_price: 20 },
              { slot_index: 2, name: 'Red Slot 2', list_id: 'red_list_2', base_price: 15 },
              { slot_index: 3, name: 'Blue Slot', list_id: 'blue_list', base_price: 10 },
              { slot_index: 4, name: 'Black Slot', list_id: 'black_list', base_price: 5 },
              { slot_index: 5, name: 'White Slot', list_id: 'white_list', base_price: 3 },
              { slot_index: 6, name: 'Real Team Slot', list_id: 'real_team_list', base_price: 25 }
            ],
            lists: {
              red_list_1: [],
              red_list_2: [],
              blue_list: [],
              black_list: [],
              white_list: [],
              real_team_list: []
            },
            max_bids_per_team: 15
          };

          const categorySettings = data.settings.category_settings || defaultCategorySettings;

          // Ensure lists exist in structure
          if (!categorySettings.lists) {
            categorySettings.lists = defaultCategorySettings.lists;
          }
          if (!categorySettings.slots) {
            categorySettings.slots = defaultCategorySettings.slots;
          }
          if (categorySettings.max_bids_per_team === undefined) {
            categorySettings.max_bids_per_team = 10;
          }

          setSettings({
            budget_per_team: data.settings.budget_per_team || 500,
            min_squad_size: data.settings.min_squad_size || 5,
            max_squad_size: data.settings.max_squad_size || 7,
            draft_status: data.settings.draft_status || 'pending',
            draft_opens_at: '',
            draft_closes_at: '',
            category_settings: categorySettings
          });
        }
      }

      // 2. Fetch players pool
      const playersResponse = await fetchWithTokenRefresh(`/api/fantasy/players/pool?league_id=${leagueId}`);
      if (playersResponse.ok) {
        const data = await playersResponse.json();
        const poolPlayers = data.players || [];
        setPlayers(poolPlayers);

        // Dynamically select the first category that has players
        if (poolPlayers.length > 0) {
          const availableCategories = ['RED', 'BLUE', 'BLACK', 'WHITE', 'ICONIC'].filter(cat => 
            poolPlayers.some((p: any) => (p.category || '').toUpperCase() === cat)
          );
          if (availableCategories.length > 0 && !availableCategories.includes(playerTab)) {
            setPlayerTab(availableCategories[0]);
          }
        }
      }

      // 3. Fetch registered teams for Real Team Slot
      const seasonId = leagueId.replace('SSPSLFLS', 'SSPSLS');
      const teamsResponse = await fetchWithTokenRefresh(`/api/teams/registered?season_id=${seasonId}`);
      if (teamsResponse.ok) {
        const teamsData = await teamsResponse.json();
        setRegisteredTeams(teamsData.teams || []);
      }

    } catch (error: any) {
      console.error('Error loading settings data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadAllData();
    }
  }, [user, leagueId]);

  const handlePopulatePlayers = async () => {
    setIsPopulating(true);
    try {
      const seasonId = leagueId.replace('SSPSLFLS', 'SSPSLS');
      const response = await fetchWithTokenRefresh('/api/fantasy/players/populate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          season_id: seasonId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to populate players');
      }

      showAlert({
        type: 'success',
        title: 'Success',
        message: 'Fantasy player pool populated successfully!',
      });
      loadAllData();
    } catch (error: any) {
      console.error('Error populating players:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to populate players',
      });
    } finally {
      setIsPopulating(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/draft/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fantasy_league_id: leagueId,
          budget_per_team: settings.budget_per_team,
          min_squad_size: settings.min_squad_size,
          max_squad_size: settings.max_squad_size,
          category_settings: settings.category_settings
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      showAlert({
        type: 'success',
        title: 'Success!',
        message: 'Draft settings saved successfully',
      });
      loadAllData();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to save settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateSlot = (index: number, updatedFields: Partial<Slot>) => {
    const updatedSlots = [...settings.category_settings.slots];
    updatedSlots[index] = { ...updatedSlots[index], ...updatedFields };
    setSettings({
      ...settings,
      category_settings: {
        ...settings.category_settings,
        slots: updatedSlots
      }
    });
  };

  const addSlot = () => {
    const nextIndex = settings.category_settings.slots.length + 1;
    const newListId = `custom_list_${nextIndex}`;
    const newSlot: Slot = {
      slot_index: nextIndex,
      name: `Custom Slot ${nextIndex}`,
      list_id: newListId,
      base_price: 10
    };

    setSettings({
      ...settings,
      category_settings: {
        slots: [...settings.category_settings.slots, newSlot],
        lists: {
          ...settings.category_settings.lists,
          [newListId]: []
        }
      }
    });
  };

  const removeSlot = (index: number) => {
    const slotToRemove = settings.category_settings.slots[index];
    const updatedSlots = settings.category_settings.slots.filter((_, i) => i !== index)
      .map((slot, i) => ({ ...slot, slot_index: i + 1 })); // Re-index

    // Also remove the associated list configuration
    const updatedLists = { ...settings.category_settings.lists };
    delete updatedLists[slotToRemove.list_id];

    setSettings({
      ...settings,
      category_settings: {
        slots: updatedSlots,
        lists: updatedLists
      }
    });
  };

  const allocatePlayer = (playerId: string, listId: string) => {
    const updatedLists = { ...settings.category_settings.lists };

    // Validate: same-category players from the same real team cannot be in the same list
    if (listId) {
      const player = players.find(p => p.real_player_id === playerId);
      const playerCat = (player?.category?.toUpperCase() || '');
      if (player && playerCat && player.real_team_name) {
        const catLists = getListsForCategory(playerCat);
        if (catLists.length >= 2) {
          const teamMates = (updatedLists[listId] || []).filter(id => {
            if (id === playerId) return false;
            const p = players.find(pl => pl.real_player_id === id);
            return p && (p.category?.toUpperCase() || '') === playerCat && p.real_team_name === player.real_team_name;
          });
          if (teamMates.length > 0) {
            showAlert({
              type: 'error',
              title: 'Same-Team Conflict',
              message: `${player.real_team_name} already has a ${playerCat} player in this list. Players from the same team must be in different ${playerCat} lists.`,
            });
            return;
          }
        }
      }
    }

    // 1. Remove player from all other lists
    Object.keys(updatedLists).forEach(key => {
      updatedLists[key] = updatedLists[key].filter(id => id !== playerId);
    });

    // 2. Add player to selected list if it's not "unassigned" (empty string)
    if (listId) {
      if (!updatedLists[listId]) {
        updatedLists[listId] = [];
      }
      updatedLists[listId].push(playerId);
    }

    setSettings({
      ...settings,
      category_settings: {
        ...settings.category_settings,
        lists: updatedLists
      }
    });
  };

  const autoCategorizeAll = () => {
    const updatedLists = { ...settings.category_settings.lists };
    Object.keys(updatedLists).forEach(key => { updatedLists[key] = [];
    });

    // Group players by category
    const categoryMap: Record<string, Player[]> = {};
    players.forEach(p => {
      const cat = (p.category?.toUpperCase() || 'UNASSIGNED');
      if (!categoryMap[cat]) categoryMap[cat] = [];
      categoryMap[cat].push(p);
    });

    Object.entries(categoryMap).forEach(([cat, catPlayers]) => {
      const catLists = getListsForCategory(cat);
      if (catLists.length >= 2) {
        // Multi-list category: split same-team players across lists
        const teamMap: Record<string, number> = {};
        catPlayers.forEach(p => {
          const team = p.real_team_name || 'unknown';
          let idx = teamMap[team] !== undefined ? teamMap[team] : -1;
          if (idx === -1) {
            idx = updatedLists[catLists[0]].length <= updatedLists[catLists[1]].length ? 0 : 1;
            teamMap[team] = idx;
          } else {
            idx = idx === 0 ? 1 : 0;
            teamMap[team] = idx;
          }
          updatedLists[catLists[idx]].push(p.real_player_id);
        });
      } else if (catLists.length === 1) {
        // Single list: assign all players
        catPlayers.forEach(p => {
          updatedLists[catLists[0]].push(p.real_player_id);
        });
      }
      // 0 lists for this category: skip (unassigned)
    });

    setSettings({
      ...settings,
      category_settings: {
        ...settings.category_settings,
        lists: updatedLists
      }
    });

    showAlert({
      type: 'success',
      title: 'Auto-allocation Complete',
      message: 'All players have been distributed to lists matching their color category. Click "Save Settings" to persist these changes.'
    });
  };

  const getPlayerListAssignment = (playerId: string): string => {
    const lists = settings.category_settings.lists;
    let foundList = '';
    Object.keys(lists).forEach(key => {
      if (lists[key].includes(playerId)) {
        foundList = key;
      }
    });
    return foundList;
  };

  /** Get all list IDs that belong to a category (by prefix match on list_id) */
  const getListsForCategory = (category: string): string[] => {
    const prefix = category.toLowerCase() + '_list';
    return Object.keys(settings.category_settings.lists).filter(k =>
      k.toLowerCase() === prefix || k.toLowerCase().startsWith(prefix + '_')
    );
  };

  /** Swap all players between the first two lists of a category */
  const swapCategoryLists = (category: string) => {
    const lists = getListsForCategory(category);
    if (lists.length < 2) return;
    const updatedLists = { ...settings.category_settings.lists };
    const temp = [...(updatedLists[lists[0]] || [])];
    updatedLists[lists[0]] = [...(updatedLists[lists[1]] || [])];
    updatedLists[lists[1]] = temp;
    setSettings({
      ...settings,
      category_settings: {
        ...settings.category_settings,
        lists: updatedLists
      }
    });
  };

  const movePlayerBetweenLists = (playerId: string, fromList: string, toList: string) => {
    const updatedLists = { ...settings.category_settings.lists };
    updatedLists[fromList] = (updatedLists[fromList] || []).filter(id => id !== playerId);
    if (!updatedLists[toList]) updatedLists[toList] = [];
    updatedLists[toList].push(playerId);
    setSettings({
      ...settings,
      category_settings: {
        ...settings.category_settings,
        lists: updatedLists
      }
    });
  };

  const getPlayersInList = (listId: string) => {
    const ids = settings.category_settings.lists[listId] || [];
    return ids.map(id => players.find(p => p.real_player_id === id)).filter(Boolean) as Player[];
  };

  const getUnassignedForCategory = (category: string) => {
    return players.filter(p => {
      const cat = (p.category || '').toUpperCase();
      if (cat !== category) return false;
      return getPlayerListAssignment(p.real_player_id) === '';
    });
  };

  /** Check if assigning a player to a list would conflict with a same-team player in a multi-list category */
  const wouldListConflict = (playerId: string, listId: string): boolean => {
    const player = players.find(p => p.real_player_id === playerId);
    if (!player || !player.real_team_name) return false;
    const playerCat = (player.category?.toUpperCase() || '');
    const catLists = getListsForCategory(playerCat);
    if (catLists.length < 2) return false;
    const listPlayerIds = settings.category_settings.lists[listId] || [];
    return listPlayerIds.some(id => {
      if (id === playerId) return false;
      const p = players.find(pl => pl.real_player_id === id);
      return p && (p.category?.toUpperCase() || '') === playerCat && p.real_team_name === player.real_team_name;
    });
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <AlertModal {...alertState} onClose={closeAlert} />
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">FANTASY CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Draft Settings
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Configure draft windows, slot structures, and player allocations
            </p>
          </div>
          
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 border border-amber-600 font-bold rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 text-xs uppercase tracking-wider font-black shrink-0 cursor-pointer"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Player Pool Warning Banner */}
        {players.length === 0 && (
          <div className="console-card bg-amber-50 border border-amber-250/60 rounded-2xl p-5 text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-[10px] font-black uppercase mb-1">Player Pool Empty</h4>
                <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase">
                  No players have been populated into the fantasy database for this league yet. 
                  You must populate the players first.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePopulatePlayers}
              disabled={isPopulating}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 border border-amber-600 text-xs font-black uppercase rounded-xl transition-all shadow-sm shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-black"
            >
              {isPopulating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Populating...
                </>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5" />
                  Populate Players
                </>
              )}
            </button>
          </div>
        )}

        {/* Tab Controls */}
        <div className="flex border-b border-slate-200 gap-2 text-xs font-black uppercase tracking-wider">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-3 border-b-2 transition-all cursor-pointer ${
              activeTab === 'general'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Settings className="w-3.5 h-3.5 inline-block mr-1" /> General config
          </button>
          <button
            onClick={() => setActiveTab('slots')}
            className={`px-4 py-3 border-b-2 transition-all cursor-pointer ${
              activeTab === 'slots'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5 inline-block mr-1" /> Squad Slots & Prices
          </button>
          <button
            onClick={() => setActiveTab('lists')}
            className={`px-4 py-3 border-b-2 transition-all cursor-pointer ${
              activeTab === 'lists'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5 inline-block mr-1" /> Player List allocations
          </button>
        </div>

        {/* TAB 1: General Configuration */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* Budget */}
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-500" />
                Team Budget configuration
              </h2>
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase">Starting Budget (Credits)</label>
                <input
                  type="number"
                  value={settings.budget_per_team}
                  onChange={(e) => setSettings({ ...settings, budget_per_team: parseInt(e.target.value) || 0 })}
                  className="w-full max-w-md px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-slate-900 bg-white shadow-sm text-xs font-bold uppercase"
                  min="1"
                  required
                />
                <p className="text-[10px] text-slate-400 font-bold uppercase">The starting balance provided to each team (defaults to 500).</p>
              </div>
            </div>

            {/* Max Bids per Team */}
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-500" />
                Max Bids Limit per Team
              </h2>
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase">Max Bids Allowed per Round</label>
                <input
                  type="number"
                  value={settings.category_settings.max_bids_per_team || 15}
                  onChange={(e) => setSettings({
                    ...settings,
                    category_settings: {
                      ...settings.category_settings,
                      max_bids_per_team: parseInt(e.target.value) || 0
                    }
                  })}
                  className="w-full max-w-md px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-slate-900 bg-white shadow-sm text-xs font-bold uppercase"
                  min="1"
                  required
                />
                <p className="text-[10px] text-slate-400 font-bold uppercase">The maximum number of bids (including primary & fallback choices) a team is allowed to place for each round/slot (defaults to 15).</p>
              </div>
            </div>


          </div>
        )}

        {/* TAB 2: Squad Slots configuration */}
        {activeTab === 'slots' && (
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-6">
            <div className="flex justify-between items-center pb-4 border-b">
              <div>
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Roster Slot specifications</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Specify the slots each manager must bid on</p>
              </div>
              <button
                type="button"
                onClick={addSlot}
                className="px-4 py-2 text-xs bg-slate-100 text-slate-700 border border-slate-200 font-bold rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-1 uppercase tracking-wider cursor-pointer font-black"
              >
                <Plus className="w-3.5 h-3.5" /> Add Slot
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {settings.category_settings.slots.map((slot, index) => (
                <div key={slot.slot_index} className="py-4 flex flex-col md:flex-row items-start md:items-center gap-4">
                  <div className="bg-slate-100 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-slate-600">
                    {slot.slot_index}
                  </div>
                  
                  <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] text-slate-455 font-bold mb-1.5 uppercase">Slot Name</label>
                      <input
                        type="text"
                        value={slot.name}
                        onChange={(e) => updateSlot(index, { name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-slate-900 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-455 font-bold mb-1.5 uppercase">Target List ID</label>
                      <input
                        type="text"
                        value={slot.list_id}
                        onChange={(e) => {
                          const newId = e.target.value.trim();
                          const oldId = slot.list_id;
                          
                          // Update slot list_id
                          const updatedSlots = [...settings.category_settings.slots];
                          updatedSlots[index] = { ...updatedSlots[index], list_id: newId };
                          
                          // Rename the list key in category_settings.lists
                          const updatedLists = { ...settings.category_settings.lists };
                          if (oldId !== newId && newId) {
                            updatedLists[newId] = updatedLists[oldId] || [];
                            delete updatedLists[oldId];
                          }
                          
                          setSettings({
                            ...settings,
                            category_settings: {
                              slots: updatedSlots,
                              lists: updatedLists
                            }
                          });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-slate-900 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-455 font-bold mb-1.5 uppercase">Base Price (Credits)</label>
                      <input
                        type="number"
                        value={slot.base_price}
                        onChange={(e) => updateSlot(index, { base_price: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-slate-900 bg-white"
                        min="0"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSlot(index)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-5 md:mt-0 cursor-pointer"
                    title="Delete Slot"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: Player List Allocations */}
        {activeTab === 'lists' && (
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-4 border-b gap-4">
              <div>
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Allocate players to lists</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Assign players from the active season pool to draft lists</p>
              </div>
              
              {players.length > 0 && (
                <button
                  type="button"
                  onClick={autoCategorizeAll}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-amber-400 text-xs font-black rounded-xl transition-all shadow flex items-center gap-1.5 uppercase tracking-wider cursor-pointer"
                >
                  <ListFilter className="w-4 h-4" /> Auto Categorize
                </button>
              )}
            </div>

            {/* Category tabs */}
            <div className="flex flex-wrap gap-2 mb-6 pb-2">
              {['RED', 'BLUE', 'BLACK', 'WHITE', 'ICONIC']
                .filter(cat => players.some(p => (p.category || '').toUpperCase() === cat))
                .map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPlayerTab(cat)}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-full border uppercase tracking-wider transition-all cursor-pointer ${
                    playerTab === cat
                      ? 'bg-amber-500 text-slate-900 border-amber-600 shadow-sm'
                      : 'bg-slate-100 text-slate-600 border-slate-200/60 hover:bg-slate-200'
                  }`}
                >
                  {cat} ({players.filter(p => (p.category || '').toUpperCase() === cat).length})
                </button>
              ))}
              {/* Real Team Slot tab */}
              <button
                type="button"
                onClick={() => setPlayerTab('REAL_TEAM')}
                className={`px-3 py-1.5 text-[10px] font-black rounded-full border uppercase tracking-wider transition-all cursor-pointer ${
                  playerTab === 'REAL_TEAM'
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                    : 'bg-slate-100 text-slate-600 border-slate-200/60 hover:bg-slate-200'
                }`}
              >
                Real Team Slot ({(settings.category_settings.lists['real_team_list'] || []).length})
              </button>
            </div>

            {/* Player list panels (hidden when Real Team tab active) */}
            {playerTab !== 'REAL_TEAM' && (
            <>
            {/* Dynamic: side-by-side for categories with 2+ lists */}
            {getListsForCategory(playerTab).length >= 2 ? (
              <div className="space-y-4">
                {/* Swap button */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => swapCategoryLists(playerTab)}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-amber-400 text-xs font-black rounded-xl transition-all shadow flex items-center gap-2 uppercase tracking-wider cursor-pointer"
                  >
                    <ArrowLeftRight className="w-4 h-4" /> Swap Lists
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {getListsForCategory(playerTab).slice(0, 2).map((listId, i, arr) => (
                    <RedListPanel
                      key={listId}
                      listId={listId}
                      label={listId.replace(/_/g, ' ')}
                      players={getPlayersInList(listId)}
                      otherListId={arr[1 - i]}
                      movePlayerBetweenLists={movePlayerBetweenLists}
                      allocatePlayer={allocatePlayer}
                      wouldListConflict={wouldListConflict}
                      getPlayerListAssignment={getPlayerListAssignment}
                    />
                  ))}
                </div>

                {/* Unassigned players for this category */}
                {getUnassignedForCategory(playerTab).length > 0 && (
                  <div className="border border-dashed border-slate-300 rounded-xl p-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-3">Unassigned ({getUnassignedForCategory(playerTab).length})</h4>
                    <div className="space-y-2">
                      {getUnassignedForCategory(playerTab).map(p => (
                        <div key={p.real_player_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <span className="font-black text-slate-800 text-xs uppercase">{p.player_name}</span>
                            <span className="text-[10px] text-slate-400 font-bold ml-2">{p.real_team_name}</span>
                          </div>
                          <div className="flex gap-1.5">
                            {getListsForCategory(playerTab).slice(0, 2).map((listId, i) => (
                              <button
                                key={listId}
                                type="button"
                                onClick={() => allocatePlayer(p.real_player_id, listId)}
                                className="px-3 py-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer uppercase"
                              >→ List {i + 1}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Single-list or no-list: dropdown-based view */
              <div className="space-y-4">
                {/* Copy single list to WhatsApp */}
                {(() => {
                  const catLists = getListsForCategory(playerTab);
                  const listId = catLists[0];
                  if (!listId) return null;
                  const listPlayers = getPlayersInList(listId);
                  if (listPlayers.length === 0) return null;
                  const sorted = [...listPlayers].sort((a, b) => {
                    const tA = (a.real_team_name || '').toUpperCase();
                    const tB = (b.real_team_name || '').toUpperCase();
                    if (tA !== tB) return tA.localeCompare(tB);
                    return (a.player_name || '').toUpperCase().localeCompare((b.player_name || '').toUpperCase());
                  });
                  return (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={async () => {
                          let msg = `📋 *${playerTab.toUpperCase()}*\n`;
                          msg += `Players: ${sorted.length}\n`;
                          msg += `────────────────\n`;
                          sorted.forEach((p, i) => {
                            msg += `${i + 1}. ${p.player_name} - ${p.real_team_name || 'No Team'}\n`;
                          });
                          try {
                            await navigator.clipboard.writeText(msg);
                            alert('Copied! Paste in WhatsApp.');
                          } catch {
                            alert('Failed to copy.');
                          }
                        }}
                        className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-md transition-colors cursor-pointer uppercase flex items-center gap-1"
                      ><Smartphone className="w-3 h-3" /> Copy to WhatsApp</button>
                    </div>
                  );
                })()}
                <div className="max-h-[500px] overflow-y-auto border rounded-xl divide-y divide-slate-100">
                {players
                  .filter(p => (p.category || '').toUpperCase() === playerTab)
                  .map(player => {
                    const currentList = getPlayerListAssignment(player.real_player_id);
                    return (

                      <div key={player.real_player_id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <h4 className="font-black text-slate-800 text-xs uppercase">{player.player_name}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{player.real_team_name || 'No Team'}</p>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <span className="text-[10px] text-slate-400 font-bold uppercase whitespace-nowrap">Assign to:</span>
                          <select
                            value={currentList}
                            onChange={(e) => allocatePlayer(player.real_player_id, e.target.value)}
                            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold uppercase bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent w-full sm:w-48 cursor-pointer"
                          >
                            <option value="">-- Unassigned --</option>
                            {Object.keys(settings.category_settings.lists).map(listId => (
                              <option key={listId} value={listId}>{listId}</option>
                            ))}
                          </select>
                        </div>
                      </div>

  );
                  })}

                {players.filter(p => (p.category || '').toUpperCase() === playerTab).length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-xs font-bold uppercase">
                    No players found in category {playerTab} for the current season.
                  </div>
                )}
              </div>
              </div>
            )}
            </>
            )}

            {/* Real Team Slot Panel */}
            {playerTab === 'REAL_TEAM' && (
              <div className="space-y-4">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">
                  Select which real teams fantasy managers can bid on for the Real Team Slot ({(settings.category_settings.lists['real_team_list'] || []).length} selected)
                </div>

                {/* Search */}
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={teamSearch}
                  onChange={e => setTeamSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                />

                {/* Teams list */}
                <div className="max-h-[500px] overflow-y-auto border rounded-xl divide-y divide-slate-100">
                  {registeredTeams
                    .filter(t => t.team_name.toLowerCase().includes(teamSearch.toLowerCase()))
                    .map(team => {
                      const teamId = team.team_uid || team.team_id;
                      const currentList: string[] = settings.category_settings.lists['real_team_list'] || [];
                      const isSelected = currentList.includes(teamId);
                      return (
                        <div key={teamId} className={`p-4 flex items-center justify-between gap-4 ${isSelected ? 'bg-indigo-50/40' : 'bg-white'}`}>
                          <div>
                            <h4 className="font-black text-slate-800 text-xs uppercase">{team.team_name}</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{teamId}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const updatedList = isSelected
                                ? currentList.filter(id => id !== teamId)
                                : [...currentList, teamId];
                              setSettings({
                                ...settings,
                                category_settings: {
                                  ...settings.category_settings,
                                  lists: {
                                    ...settings.category_settings.lists,
                                    real_team_list: updatedList
                                  }
                                }
                              });
                            }}
                            className={`px-3 py-1.5 text-[10px] font-black rounded-lg border uppercase tracking-wider transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                            }`}
                          >
                            {isSelected ? '✕ Remove' : '+ Add'}
                          </button>
                        </div>
                      );
                    })}
                  {registeredTeams.filter(t => t.team_name.toLowerCase().includes(teamSearch.toLowerCase())).length === 0 && (
                    <div className="p-8 text-center text-slate-300 text-xs font-bold uppercase">No teams found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
