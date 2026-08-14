'use client';
import { DollarSign, Users, Calendar, Plus, Trash2, ListFilter, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

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
  };
}

interface Player {
  real_player_id: string;
  player_name: string;
  real_team_name: string;
  category: string;
  star_rating: number;
}

export default function DraftSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'slots' | 'lists'>('general');
  const [playerTab, setPlayerTab] = useState<string>('RED');
  
  // Players Pool
  const [players, setPlayers] = useState<Player[]>([]);
  
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
      }
    }
  });

  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'committee_admin' && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const loadAllData = async () => {
    if (!leagueId) return;

    try {
      // 1. Fetch settings
      const settingsResponse = await fetchWithTokenRefresh(`/api/fantasy/draft/settings?league_id=${leagueId}`);
      if (settingsResponse.ok) {
        const data = await settingsResponse.json();
        if (data.settings) {
          // Format ISO string dates to YYYY-MM-DDTHH:MM for datetime-local inputs
          const formatForInput = (isoString?: string) => {
            if (!isoString) return '';
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return '';
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          };

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
            }
          };

          const categorySettings = data.settings.category_settings || defaultCategorySettings;

          // Ensure lists exist in structure
          if (!categorySettings.lists) {
            categorySettings.lists = defaultCategorySettings.lists;
          }
          if (!categorySettings.slots) {
            categorySettings.slots = defaultCategorySettings.slots;
          }

          setSettings({
            budget_per_team: data.settings.budget_per_team || 500,
            min_squad_size: data.settings.min_squad_size || 5,
            max_squad_size: data.settings.max_squad_size || 7,
            draft_status: data.settings.draft_status || 'pending',
            draft_opens_at: formatForInput(data.settings.draft_opens_at),
            draft_closes_at: formatForInput(data.settings.draft_closes_at),
            category_settings: categorySettings
          });
        }
      }

      // 2. Fetch players pool
      const playersResponse = await fetchWithTokenRefresh(`/api/fantasy/players/pool?league_id=${leagueId}`);
      if (playersResponse.ok) {
        const data = await playersResponse.json();
        setPlayers(data.players || []);
      }

    } catch (error) {
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // Validate dates
      let opensAtIso = null;
      let closesAtIso = null;

      if (settings.draft_opens_at) {
        const openDate = new Date(settings.draft_opens_at);
        if (!isNaN(openDate.getTime())) {
          opensAtIso = openDate.toISOString();
        }
      }
      if (settings.draft_closes_at) {
        const closeDate = new Date(settings.draft_closes_at);
        if (!isNaN(closeDate.getTime())) {
          closesAtIso = closeDate.toISOString();
        }
      }

      const response = await fetchWithTokenRefresh('/api/fantasy/draft/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fantasy_league_id: leagueId,
          budget_per_team: settings.budget_per_team,
          min_squad_size: settings.min_squad_size,
          max_squad_size: settings.max_squad_size,
          draft_opens_at: opensAtIso,
          draft_closes_at: closesAtIso,
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
    } catch (error) {
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
    
    // Reset lists
    Object.keys(updatedLists).forEach(key => {
      updatedLists[key] = [];
    });

    // Auto assign based on player category matching the list name
    players.forEach(p => {
      const category = p.category?.toUpperCase() || 'WHITE';
      if (category === 'RED') {
        // Distribute RED players between red_list_1 and red_list_2
        if (updatedLists['red_list_1'].length <= updatedLists['red_list_2'].length) {
          updatedLists['red_list_1'].push(p.real_player_id);
        } else {
          updatedLists['red_list_2'].push(p.real_player_id);
        }
      } else if (category === 'BLUE') {
        updatedLists['blue_list'].push(p.real_player_id);
      } else if (category === 'BLACK') {
        updatedLists['black_list'].push(p.real_player_id);
      } else if (category === 'WHITE') {
        updatedLists['white_list'].push(p.real_player_id);
      } else if (category === 'ICONIC') {
        // Fallback to iconic or red list
        if (updatedLists['red_list_1']) {
          updatedLists['red_list_1'].push(p.real_player_id);
        }
      }
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

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors mb-4 text-sm font-semibold"
          >
            ← Back to Dashboard
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Fantasy settings</h1>
              <p className="text-slate-500 mt-1">Configure draft windows, squad slot structures, and player allocations</p>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : '💾 Save Settings'}
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-200 mb-6 gap-2">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-3 font-semibold text-sm border-b-2 transition-all ${activeTab === 'general' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            ⚙️ General config
          </button>
          <button
            onClick={() => setActiveTab('slots')}
            className={`px-4 py-3 font-semibold text-sm border-b-2 transition-all ${activeTab === 'slots' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            📋 Squad Slots & Prices
          </button>
          <button
            onClick={() => setActiveTab('lists')}
            className={`px-4 py-3 font-semibold text-sm border-b-2 transition-all ${activeTab === 'lists' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            👥 Player List allocations
          </button>
        </div>

        {/* TAB 1: General Configuration */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* Budget */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-500" />
                Team Budget configuration
              </h2>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Starting Budget (Credits)</label>
                <input
                  type="number"
                  value={settings.budget_per_team}
                  onChange={(e) => setSettings({ ...settings, budget_per_team: parseInt(e.target.value) || 0 })}
                  className="w-full max-w-xs px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  min="1"
                  required
                />
                <p className="text-xs text-slate-400 mt-2">The starting balance provided to each team (defaults to 500).</p>
              </div>
            </div>

            {/* Time Window */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-500" />
                Draft timeline (Bidding Window)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Draft Window Opens At</label>
                  <input
                    type="datetime-local"
                    value={settings.draft_opens_at}
                    onChange={(e) => setSettings({ ...settings, draft_opens_at: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Draft Window Closes At</label>
                  <input
                    type="datetime-local"
                    value={settings.draft_closes_at}
                    onChange={(e) => setSettings({ ...settings, draft_closes_at: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">Teams can only place, modify or lock bids while the current time is between these boundaries.</p>
            </div>
          </div>
        )}

        {/* TAB 2: Squad Slots configuration */}
        {activeTab === 'slots' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Roster Slot specifications</h2>
                <p className="text-xs text-slate-400 mt-0.5">Specify the slots each manager must bid on and populate</p>
              </div>
              <button
                type="button"
                onClick={addSlot}
                className="px-4 py-2 text-sm bg-indigo-50 text-indigo-600 border border-indigo-200 font-bold rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Slot
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
                      <label className="block text-xs text-slate-400 font-bold mb-1 uppercase">Slot Name</label>
                      <input
                        type="text"
                        value={slot.name}
                        onChange={(e) => updateSlot(index, { name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 font-bold mb-1 uppercase">Target List ID</label>
                      <select
                        value={slot.list_id}
                        onChange={(e) => updateSlot(index, { list_id: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {Object.keys(settings.category_settings.lists).map(listId => (
                          <option key={listId} value={listId}>{listId}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 font-bold mb-1 uppercase">Base Price (Credits)</label>
                      <input
                        type="number"
                        value={slot.base_price}
                        onChange={(e) => updateSlot(index, { base_price: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        min="0"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSlot(index)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-5 md:mt-0"
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
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Allocate players to lists</h2>
                <p className="text-xs text-slate-400 mt-0.5">Assign players from the active season pool to draft lists</p>
              </div>
              <button
                type="button"
                onClick={autoCategorizeAll}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow"
              >
                <ListFilter className="w-4 h-4" /> Auto Categorize
              </button>
            </div>

            {/* Category tabs */}
            <div className="flex flex-wrap gap-2 mb-6 border-b pb-4">
              {['RED', 'BLUE', 'BLACK', 'WHITE', 'ICONIC'].map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPlayerTab(cat)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-all ${playerTab === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  {cat} ({players.filter(p => (p.category || '').toUpperCase() === cat).length})
                </button>
              ))}
            </div>

            {/* Player list */}
            <div className="max-h-[500px] overflow-y-auto border rounded-xl divide-y divide-slate-100">
              {players
                .filter(p => (p.category || '').toUpperCase() === playerTab)
                .map(player => {
                  const currentList = getPlayerListAssignment(player.real_player_id);
                  return (
                    <div key={player.real_player_id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{player.player_name}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{player.real_team_name || 'No Team'}</p>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-xs text-slate-400 whitespace-nowrap">Assign to:</span>
                        <select
                          value={currentList}
                          onChange={(e) => allocatePlayer(player.real_player_id, e.target.value)}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-44"
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
                <div className="p-8 text-center text-slate-400 text-sm">
                  No players found in category {playerTab} for the current season.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
