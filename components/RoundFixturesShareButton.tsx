'use client';

import { useState, useRef } from 'react';
import { toPng } from 'html-to-image';
import { FixturesSnapshot, Match } from './tournament/FixturesSnapshot';

interface Fixture {
  id: string;
  round_number: number;
  match_number: number;
  home_team_name: string;
  away_team_name: string;
  home_score?: number;
  away_score?: number;
  status: string;
  scheduled_date?: string;
  leg?: string;
}

interface Props {
  roundNumber: number;
  fixtures: Fixture[];
  tournamentName?: string;
}

export default function RoundFixturesShareButton({ roundNumber, fixtures, tournamentName = "SSPS League" }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const generateImage = async () => {
    if (!cardRef.current || fixtures.length === 0) return;

    setIsGenerating(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });

      // Create download link
      const link = document.createElement('a');
      link.download = `round-${roundNumber}-fixtures.png`;
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'in_progress':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'scheduled':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  if (fixtures.length === 0) {
    return null;
  }

  return (
    <>
      <button
        onClick={generateImage}
        disabled={isGenerating}
        className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isGenerating ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Generating...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Round {roundNumber}
          </>
        )}
      </button>

      {/* Hidden card for image generation */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div ref={cardRef}>
          <FixturesSnapshot 
            matches={fixtures.map((f): Match => ({
              id: f.id || String(f.match_number),
              matchDate: f.scheduled_date || new Date().toISOString(),
              status: f.status === 'in_progress' ? 'LIVE' : f.status === 'completed' ? 'COMPLETED' : 'SCHEDULED',
              homeScore: f.home_score !== undefined ? f.home_score : null,
              awayScore: f.away_score !== undefined ? f.away_score : null,
              homeTeam: { team: { name: f.home_team_name, logoUrl: (f as any).home_team_logo || null } },
              awayTeam: { team: { name: f.away_team_name, logoUrl: (f as any).away_team_logo || null } }
            }))}
            tournamentName={tournamentName}
            seasonName="SSPS LEAGUE"
            activeRound={`ROUND ${roundNumber}`}
          />
        </div>
      </div>
    </>
  );
}
