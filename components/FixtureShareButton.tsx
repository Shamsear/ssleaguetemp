'use client';

import { useState, useRef } from 'react';
import { FixturesSnapshot } from './tournament/FixturesSnapshot';
import { Download, Share2 } from 'lucide-react';
import { generateContainerPng, downloadPng, shareOrDownloadPng } from '@/lib/utils/export-image';

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

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setIsGenerating(true);
    try {
      const dataUrl = await generateContainerPng(cardRef.current);
      const filename = `fixture-R${fixture.round_number}M${fixture.match_number}.png`;
      downloadPng(dataUrl, filename);
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download image');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!cardRef.current) return;
    setIsGenerating(true);
    try {
      const dataUrl = await generateContainerPng(cardRef.current);
      const filename = `fixture-R${fixture.round_number}M${fixture.match_number}.png`;
      await shareOrDownloadPng(dataUrl, filename, `Round ${fixture.round_number} Match ${fixture.match_number}`);
    } catch (error) {
      console.error('Error sharing image:', error);
      alert('Failed to share image');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Download Button */}
        <button
          onClick={handleDownload}
          disabled={isGenerating}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-amber-400 font-extrabold rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-xs uppercase font-mono border border-slate-900"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-400"></div>
              Generating...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Download Image
            </>
          )}
        </button>

        {/* Share Button */}
        <button
          onClick={handleShare}
          disabled={isGenerating}
          className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-extrabold rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-xs uppercase font-mono"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Generating...
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4" />
              Share
            </>
          )}
        </button>
      </div>

      {/* Hidden card for image generation */}
      <div style={{ position: 'fixed', left: '-9999px', top: '0px', width: '1200px', pointerEvents: 'none' }}>
        <div ref={cardRef}>
          <FixturesSnapshot 
            matches={[{
              id: String(fixture.match_number),
              matchDate: fixture.scheduled_date || new Date().toISOString(),
              status: fixture.status === 'in_progress' ? 'LIVE' : fixture.status === 'completed' ? 'COMPLETED' : 'SCHEDULED',
              homeScore: fixture.home_score !== undefined ? fixture.home_score : null,
              awayScore: fixture.away_score !== undefined ? fixture.away_score : null,
              homeTeam: { team: { name: fixture.home_team_name, logoUrl: (fixture as any).home_team_logo || (fixture as any).home_team_logo_url || (fixture as any).home_team_logoUrl || null } },
              awayTeam: { team: { name: fixture.away_team_name, logoUrl: (fixture as any).away_team_logo || (fixture as any).away_team_logo_url || (fixture as any).away_team_logoUrl || null } }
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
