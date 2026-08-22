import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Award, Star, Sparkles, Crown } from 'lucide-react';
import { SoccerBallIcon } from '@/components/ui/CustomIcons';

interface Tournament {
  id: string;
  season_id: string;
  tournament_type: 'league' | 'cup' | 'ucl' | 'uel' | 'super_cup' | 'league_cup';
  tournament_name: string;
  tournament_code?: string;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  start_date?: string;
  end_date?: string;
  description?: string;
  is_primary: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface UseTournamentsOptions {
  seasonId?: string;
  status?: 'upcoming' | 'active' | 'completed' | 'cancelled';
  enabled?: boolean;
}

export function useTournaments(options: UseTournamentsOptions = {}) {
  const { seasonId, status, enabled = true } = options;

  return useQuery<Tournament[]>({
    queryKey: ['tournaments', seasonId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (seasonId) params.append('season_id', seasonId);
      if (status) params.append('status', status);

      const response = await fetch(`/api/tournaments?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch tournaments');
      }

      const data = await response.json();
      return data.tournaments || [];
    },
    enabled: enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useTournament(tournamentId: string | null | undefined) {
  return useQuery<Tournament | null>({
    queryKey: ['tournament', tournamentId],
    queryFn: async () => {
      if (!tournamentId) return null;

      const response = await fetch(`/api/tournaments/${tournamentId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch tournament');
      }

      const data = await response.json();
      return data.tournament || null;
    },
    enabled: !!tournamentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Helper function to get tournament icon
export function getTournamentIcon(type: string): React.ReactNode {
  const className = 'w-5 h-5 inline-block';
  switch (type) {
    case 'league':
      return React.createElement(Trophy, { className: `${className} text-amber-500` });
    case 'cup':
      return React.createElement(Award, { className: `${className} text-amber-500` });
    case 'ucl':
      return React.createElement(Star, { className: `${className} text-amber-400 fill-amber-400` });
    case 'uel':
      return React.createElement(Sparkles, { className: `${className} text-amber-400` });
    case 'super_cup':
      return React.createElement(Crown, { className: `${className} text-amber-500` });
    case 'league_cup':
      return React.createElement(Award, { className: `${className} text-amber-500` });
    default:
      return React.createElement(SoccerBallIcon, { className });
  }
}

// Helper function to get tournament color
export function getTournamentColor(type: string): string {
  switch (type) {
    case 'league':
      return 'blue';
    case 'cup':
      return 'green';
    case 'ucl':
      return 'purple';
    case 'uel':
      return 'orange';
    case 'super_cup':
      return 'yellow';
    case 'league_cup':
      return 'red';
    default:
      return 'gray';
  }
}
