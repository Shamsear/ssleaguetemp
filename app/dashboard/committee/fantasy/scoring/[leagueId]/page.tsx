'use client';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Edit2, Save, X, XCircle, Star, RefreshCw, CheckCircle, Shield, Trophy, Crown, Activity, BarChart2 } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface ScoringRule {
  rule_id: number;
  rule_name: string;
  rule_type: string;
  description?: string;
  points_value: number;
  applies_to: string;
  is_active: boolean;
  is_bonus_rule?: boolean;
  bonus_conditions?: any;
  priority?: number;
}

export default function CustomScoringRulesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<ScoringRule | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Create form state
  const [newRule, setNewRule] = useState({
    rule_name: '',
    rule_type: '',
    description: '',
    points_value: 0,
    applies_to: 'player',
    is_bonus_rule: false,
    bonus_condition_type: '',
    bonus_params: {} as any,
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'committee_admin' && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && leagueId) {
      loadRules();
    }
  }, [user, leagueId]);

  const loadRules = async () => {
    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/scoring-rules?league_id=${leagueId}`);
      if (!response.ok) throw new Error('Failed to load rules');
      
      const data = await response.json();
      setRules(data.rules || []);
    } catch (error) {
      console.error('Error loading rules:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createRule = async () => {
    if (!newRule.rule_name || !newRule.rule_type || newRule.points_value === null || newRule.points_value === undefined) {
      alert('Please fill in rule name, type, and points value');
      return;
    }
    
    if (newRule.is_bonus_rule && !newRule.bonus_condition_type) {
      alert('Please select a bonus condition type');
      return;
    }

    try {
      const payload: any = {
        league_id: leagueId,
        rule_name: newRule.rule_name,
        rule_type: newRule.rule_type,
        description: newRule.description,
        points_value: newRule.points_value,
        applies_to: newRule.applies_to,
        is_bonus_rule: newRule.is_bonus_rule,
      };
      
      if (newRule.is_bonus_rule) {
        payload.bonus_conditions = {
          condition_type: newRule.bonus_condition_type,
          ...newRule.bonus_params,
        };
      }
      
      const response = await fetchWithTokenRefresh('/api/fantasy/scoring-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create rule');
      }

      alert('Rule created successfully!');
      setShowCreateForm(false);
      setNewRule({
        rule_name: '',
        rule_type: '',
        description: '',
        points_value: 0,
        applies_to: 'player',
        is_bonus_rule: false,
        bonus_condition_type: '',
        bonus_params: {},
      });
      loadRules();
    } catch (error) {
      console.error('Error creating rule:', error);
      alert(error instanceof Error ? error.message : 'Failed to create rule');
    }
  };

  const updateRule = async (ruleId: number) => {
    if (!editingRule) return;

    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/scoring-rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_name: editingRule.rule_name,
          description: editingRule.description,
          points_value: editingRule.points_value,
          is_active: editingRule.is_active,
          applies_to: editingRule.applies_to,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update rule');
      }

      alert('Rule updated successfully!');
      setEditingRule(null);
      loadRules();
    } catch (error) {
      console.error('Error updating rule:', error);
      alert(error instanceof Error ? error.message : 'Failed to update rule');
    }
  };

  const deleteRule = async (ruleId: number, ruleName: string) => {
    if (!confirm(`Delete rule "${ruleName}"?`)) return;

    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/scoring-rules/${ruleId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete rule');
      }

      alert('Rule deleted successfully!');
      loadRules();
    } catch (error) {
      console.error('Error deleting rule:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete rule');
    }
  };

  const getRuleColor = (pointsValue: number) => {
    if (pointsValue > 0) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (pointsValue < 0) return 'text-rose-600 bg-rose-50 border-rose-200';
    return 'text-slate-500 bg-slate-50 border-slate-200';
  };

  const commonRuleTypes = [
    { value: 'goals_scored', label: 'Goal Scored', icon: <Activity className="w-3.5 h-3.5 text-red-500 inline-block mr-1 align-text-bottom" /> },
    { value: 'clean_sheet', label: 'Clean Sheet', icon: <Shield className="w-3.5 h-3.5 text-blue-500 inline-block mr-1 align-text-bottom" /> },
    { value: 'goals_conceded', label: 'Goal Conceded', icon: '🥅' },
    { value: 'motm', label: 'Man of the Match', icon: '⭐️' },
    { value: 'win', label: 'Win', icon: '✓' },
    { value: 'draw', label: 'Draw', icon: '🤝' },
    { value: 'loss', label: 'Loss', icon: '✗' },
    { value: 'fine_goals', label: 'Fine Goals', icon: '💸' },
    { value: 'substitution_penalty', label: 'Substitution Penalty', icon: '🔄' },
    { value: 'hat_trick', label: 'Hat-trick (3+ goals)', icon: '🎩' },
    { value: 'brace', label: 'Brace (2 goals)', icon: '⚔️' },
    { value: 'concedes_4_plus_goals', label: 'Concedes 4+ Goals', icon: '🚨' },
    { value: 'concedes_15_plus_goals', label: 'Concedes 15+ Goals', icon: '💥' },
    { value: 'scored_6_plus_goals', label: 'Scored 6+ Goals', icon: '🔥' },
    { value: 'match_played', label: 'Match Played', icon: '🎮' },
    { value: 'golden_boot', label: 'Golden Boot Award', icon: '👢' },
    { value: 'best_attacker', label: 'Best Attacker Award', icon: '⚔️' },
    { value: 'custom', label: 'Custom Rule', icon: '📋' },
  ];

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <Link
          href={`/dashboard/committee/fantasy/${leagueId}`}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-semibold text-sm transition-colors mb-6"
        >
          ← Back to League Dashboard
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Custom Scoring Rules</h1>
            <p className="text-slate-500 mt-1">Define how players and teams earn points</p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-5 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow"
          >
            <Plus className="w-5 h-5" />
            Create New Rule
          </button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Create New Scoring Rule</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Rule Name *</label>
                <input
                  type="text"
                  value={newRule.rule_name}
                  onChange={(e) => setNewRule({ ...newRule, rule_name: e.target.value })}
                  placeholder="e.g., Goal Bonus"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Rule Type *</label>
                <select
                  value={newRule.rule_type}
                  onChange={(e) => setNewRule({ ...newRule, rule_type: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">Select type...</option>
                  {commonRuleTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Points Value *</label>
                <input
                  type="number"
                  value={newRule.points_value}
                  onChange={(e) => setNewRule({ ...newRule, points_value: parseFloat(e.target.value) })}
                  placeholder="e.g., 10"
                  step="0.5"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Applies To</label>
                <select
                  value={newRule.applies_to}
                  onChange={(e) => setNewRule({ ...newRule, applies_to: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="player">Player</option>
                  <option value="team">Team</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                <input
                  type="text"
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                  placeholder="Optional description..."
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              
              {/* Bonus Rule Toggle */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={newRule.is_bonus_rule}
                    onChange={(e) => setNewRule({ ...newRule, is_bonus_rule: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                  />
                  <span className="text-sm font-bold text-slate-700">🎁 This is a Bonus/Conditional Rule</span>
                </label>
                <p className="text-xs text-slate-400 mt-1 ml-6">Enable this for special conditions like new player bonus, streak bonus, etc.</p>
              </div>
              
              {/* Conditional Fields for Bonus Rules */}
              {newRule.is_bonus_rule && (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Bonus Condition Type *</label>
                    <select
                      value={newRule.bonus_condition_type}
                      onChange={(e) => setNewRule({ ...newRule, bonus_condition_type: e.target.value, bonus_params: {} })}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">Select condition...</option>
                      <option value="new_player">🆕 New Player Bonus (first X matches)</option>
                      <option value="streak">🔥 Streak Bonus (consecutive events)</option>
                      <option value="milestone">🎯 Milestone Bonus (reach X goals/assists)</option>
                      <option value="match_result">🏆 Match Result Bonus (win/draw/loss)</option>
                      <option value="comeback">💪 Comeback Bonus (winning after being behind)</option>
                      <option value="clean_sheet_streak">🛡️ Clean Sheet Streak (consecutive clean sheets)</option>
                      <option value="goal_difference">⚡ Goal Difference Bonus (winning by X+ goals)</option>
                      <option value="against_top_team">👑 Top Team Bonus (performance vs top teams)</option>
                      <option value="captain_bonus">©️ Captain/Vice Captain Bonus (multiplier)</option>
                    </select>
                  </div>
                  
                  {/* Sub-conditions based on type */}
                  {newRule.bonus_condition_type === 'new_player' && (
                    <div className="md:col-span-2 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">First X Matches</label>
                        <input
                          type="number"
                          value={newRule.bonus_params.matches_count || 1}
                          onChange={(e) => setNewRule({ ...newRule, bonus_params: { ...newRule.bonus_params, matches_count: parseInt(e.target.value) } })}
                          min="1"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  )}
                  {newRule.bonus_condition_type === 'streak' && (
                    <div className="md:col-span-2 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Event Type</label>
                        <select
                          value={newRule.bonus_params.event_type || 'goal'}
                          onChange={(e) => setNewRule({ ...newRule, bonus_params: { ...newRule.bonus_params, event_type: e.target.value } })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="goal">Goals</option>
                          <option value="assist">Assists</option>
                          <option value="clean_sheet">Clean Sheets</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Consecutive Matches</label>
                        <input
                          type="number"
                          value={newRule.bonus_params.consecutive_matches || 3}
                          onChange={(e) => setNewRule({ ...newRule, bonus_params: { ...newRule.bonus_params, consecutive_matches: parseInt(e.target.value) } })}
                          min="2"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={createRule}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-sm shadow"
              >
                Create Rule
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Rules List */}
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Active Rules</h2>
          
          {rules.length === 0 ? (
            <p className="text-center text-slate-400 py-12 text-sm italic">No scoring rules yet. Create your first rule!</p>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.rule_id}
                  className={`flex items-center justify-between p-4 border rounded-xl transition-all ${
                    editingRule?.rule_id === rule.rule_id
                      ? 'border-indigo-300 bg-indigo-50/50 shadow-sm'
                      : 'border-slate-200 bg-slate-50/30 hover:border-slate-300'
                  }`}
                >
                  {editingRule?.rule_id === rule.rule_id ? (
                    // Edit Mode
                    <>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                          type="text"
                          value={editingRule.rule_name}
                          onChange={(e) => setEditingRule({ ...editingRule, rule_name: e.target.value })}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <input
                          type="number"
                          value={editingRule.points_value}
                          onChange={(e) => setEditingRule({ ...editingRule, points_value: parseFloat(e.target.value) })}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          step="0.5"
                        />
                        <select
                          value={editingRule.applies_to}
                          onChange={(e) => setEditingRule({ ...editingRule, applies_to: e.target.value })}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="player">Player</option>
                          <option value="team">Team</option>
                          <option value="both">Both</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => updateRule(rule.rule_id)}
                          className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingRule(null)}
                          className="p-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    // View Mode
                    <>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                          <h3 className="font-bold text-slate-800 text-sm">{rule.rule_name}</h3>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${getRuleColor(rule.points_value)}`}>
                            {rule.points_value > 0 ? '+' : ''}{rule.points_value} pts
                          </span>
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black rounded uppercase tracking-wider">
                            {rule.applies_to}
                          </span>
                          {!rule.is_active && (
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-500 text-[10px] font-black rounded uppercase tracking-wider">
                              Inactive
                            </span>
                          )}
                        </div>
                        {rule.description && (
                          <p className="text-xs text-slate-500 leading-relaxed">{rule.description}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1">Type: {rule.rule_type}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => setEditingRule(rule)}
                          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors border border-slate-200"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteRule(rule.rule_id, rule.rule_name)}
                          className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-indigo-850">
          <h4 className="font-bold text-indigo-900 text-sm mb-2">How Scoring Rules Work:</h4>
          <ul className="text-xs space-y-1.5 leading-relaxed text-indigo-750">
            <li>• Create custom rules to define how players earn points</li>
            <li>• Positive values add points, negative values deduct them</li>
            <li>• Rules can apply to individual players, teams, or both</li>
            <li>• Common types: goals, assists, clean sheets, team wins, cards, etc.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
