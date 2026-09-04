'use client';

import { useState, useRef } from 'react';
import { FixturesSnapshot, Match } from './tournament/FixturesSnapshot';
import { Download, Share2 } from 'lucide-react';
import { generateContainerPng, downloadPng, shareOrDownloadPng } from '@/lib/utils/export-image';

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

  const handleDownload = async () => {
    if (!cardRef.current || fixtures.length === 0) return;
    setIsGenerating(true);
    try {
      const dataUrl = await generateContainerPng(cardRef.current);
      const filename = `round-${roundNumber}-fixtures.png`;
      downloadPng(dataUrl, filename);
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download image');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!cardRef.current || fixtures.length === 0) return;
    setIsGenerating(true);
    try {
      const dataUrl = await generateContainerPng(cardRef.current);
      const filename = `round-${roundNumber}-fixtures.png`;
      await shareOrDownloadPng(dataUrl, filename, `${tournamentName} Round ${roundNumber}`);
    } catch (error) {
      console.error('Error sharing image:', error);
      alert('Failed to share image');
    } finally {
      setIsGenerating(false);
    }
  };

  if (fixtures.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Download Button */}
        <button
          onClick={handleDownload}
          disabled={isGenerating}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-amber-400 font-extrabold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-xs uppercase font-mono border border-slate-900"
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
          className="px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-extrabold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-xs uppercase font-mono"
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
            matches={fixtures.map((f): Match => ({
              id: f.id || String(f.match_number),
              matchDate: f.scheduled_date || new Date().toISOString(),
              status: f.status === 'in_progress' ? 'LIVE' : f.status === 'completed' ? 'COMPLETED' : 'SCHEDULED',
              homeScore: f.home_score !== undefined ? f.home_score : null,
              awayScore: f.away_score !== undefined ? f.away_score : null,
              homeTeam: { team: { name: f.home_team_name, logoUrl: (f as any).home_team_logo || (f as any).home_team_logo_url || (f as any).home_team_logoUrl || null } },
              awayTeam: { team: { name: f.away_team_name, logoUrl: (f as any).away_team_logo || (f as any).away_team_logo_url || (f as any).away_team_logoUrl || null } }
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
