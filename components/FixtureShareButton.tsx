'use client';

import { useState, useRef } from 'react';
import { toPng } from 'html-to-image';
import { FixturesSnapshot, Match } from './tournament/FixturesSnapshot';

interface Matchup {
  position: number;
  home_player_name: string;
  away_player_name: string;
  home_goals: number | null;
  away_goals: number | null;
}

interface Fixture {
  round_number: number;
  match_number: number;
  home_team_name: string;
  away_team_name: string;
  home_score?: number;
  away_score?: number;
  status: string;
  scheduled_date?: string;
}

interface Props {
  fixture: Fixture;
  matchups: Matchup[];
}

export default function FixtureShareButton({ fixture, matchups }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const generateImage = async () => {
    if (!cardRef.current) return;

    setIsGenerating(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });

      // Create download link
      const link = document.createElement('a');
      link.download = `fixture-R${fixture.round_number}M${fixture.match_number}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image');
    } finally {
      setIsGenerating(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'TBD';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = () => {
    switch (fixture.status) {
      case 'completed':
        return <span className="text-green-600 font-bold">✓ COMPLETED</span>;
      case 'scheduled':
        return <span className="text-blue-600 font-bold">⏰ SCHEDULED</span>;
      case 'in_progress':
        return <span className="text-orange-600 font-bold">⚽ IN PROGRESS</span>;
      default:
        return <span className="text-gray-600 font-bold">📋 {fixture.status.toUpperCase()}</span>;
    }
  };

  return (
    <>
      <button
        onClick={generateImage}
        disabled={isGenerating}
        className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isGenerating ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Generating...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Fixture
          </>
        )}
      </button>

      {/* Hidden card for image generation */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div ref={cardRef}>
          <FixturesSnapshot 
            matches={[{
              id: String(fixture.match_number),
              matchDate: fixture.scheduled_date || new Date().toISOString(),
              status: fixture.status === 'in_progress' ? 'LIVE' : fixture.status === 'completed' ? 'COMPLETED' : 'SCHEDULED',
              homeScore: fixture.home_score !== undefined ? fixture.home_score : null,
              awayScore: fixture.away_score !== undefined ? fixture.away_score : null,
              homeTeam: { team: { name: fixture.home_team_name, logoUrl: (fixture as any).home_team_logo || null } },
              awayTeam: { team: { name: fixture.away_team_name, logoUrl: (fixture as any).away_team_logo || null } }
            }]}
            tournamentName="SSPS LEAGUE"
            seasonName="SSPS LEAGUE"
            activeRound={`Round ${fixture.round_number} - Match ${fixture.match_number}`}
          />
        </div>
      </div>
    </>
  );
}
