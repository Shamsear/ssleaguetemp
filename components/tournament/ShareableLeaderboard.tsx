'use client';

import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { LeaderboardSnapshot, StandingRow } from './LeaderboardSnapshot';

interface GroupTeam {
  team_id: string;
  team_name: string;
  team_logo?: string;
  group: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  position: number;
  qualifies: boolean;
}

interface TeamStats {
  team_id: string;
  team_name: string;
  team_logo?: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
}

interface ShareableLeaderboardProps {
  standings?: TeamStats[];
  groupStandings?: Record<string, GroupTeam[]>;
  tournamentName: string;
  seasonName?: string;
  format?: string;
  selectedRound?: number | null;
  availableRounds?: number[];
}

export default function ShareableLeaderboard({ 
  standings,
  groupStandings,
  tournamentName,
  seasonName,
  format = 'league',
  selectedRound = null,
}: ShareableLeaderboardProps) {
  const leaderboardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('');

  // Initialize selected group for group stage
  useState(() => {
    if (groupStandings && !selectedGroup) {
      const groups = Object.keys(groupStandings).sort();
      if (groups.length > 0) {
        setSelectedGroup(groups[0]);
      }
    }
  });

  const isGroupStage = format === 'group_stage' && groupStandings;
  const groups = isGroupStage ? Object.keys(groupStandings).sort() : [];
  const currentStandings = isGroupStage && selectedGroup 
    ? groupStandings[selectedGroup] 
    : standings || [];

  const generateImage = async () => {
    if (!leaderboardRef.current) return;

    try {
      setIsGenerating(true);
      
      // Ensure preview is visible for rendering
      const wasHidden = !showPreview;
      if (wasHidden) {
        setShowPreview(true);
        // Wait for DOM to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const dataUrl = await toPng(leaderboardRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
        skipFonts: true,
      });

      // Hide preview again if it was hidden
      if (wasHidden) {
        setShowPreview(false);
      }

      // Create download link
      const link = document.createElement('a');
      link.download = `${tournamentName.replace(/\s+/g, '-')}-leaderboard.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const shareImage = async () => {
    if (!leaderboardRef.current) return;

    try {
      setIsGenerating(true);
      
      // Ensure preview is visible for rendering
      const wasHidden = !showPreview;
      if (wasHidden) {
        setShowPreview(true);
        // Wait for DOM to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const dataUrl = await toPng(leaderboardRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
        skipFonts: true,
      });

      // Hide preview again if it was hidden
      if (wasHidden) {
        setShowPreview(false);
      }

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `${tournamentName}-leaderboard.png`, { type: 'image/png' });

      // Check if Web Share API is available
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${tournamentName} - Leaderboard`,
          text: `Check out the current standings for ${tournamentName}!`,
          files: [file],
        });
      } else {
        // Fallback to download
        generateImage();
      }
    } catch (error) {
      console.error('Error sharing image:', error);
      // Fallback to download
      generateImage();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Group Selector for Group Stage */}
      {isGroupStage && groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-semibold text-gray-700 flex items-center">Select Group:</span>
          {groups.map((group) => (
            <button
              key={group}
              onClick={() => setSelectedGroup(group)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all text-sm ${
                selectedGroup === group
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Group {group}
            </button>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors shadow-md"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {showPreview ? 'Hide Preview' : 'Preview Image'}
        </button>

        <button
          onClick={generateImage}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Image
            </>
          )}
        </button>

        <button
          onClick={shareImage}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
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
              Share Image
            </>
          )}
        </button>
      </div>

      {/* Preview/Hidden Leaderboard for Image Generation */}
      <div className={showPreview ? 'block' : 'hidden'} style={{ overflowX: 'auto' }}>
        <div ref={leaderboardRef} style={{ width: 'max-content' }}>
          <LeaderboardSnapshot 
            standings={currentStandings.map((team: any, index: number): StandingRow => ({
              id: team.team_id,
              position: index + 1,
              played: team.matches_played,
              won: team.wins,
              drawn: team.draws,
              lost: team.losses,
              goalsFor: team.goals_for,
              goalsAgainst: team.goals_against,
              goalDiff: team.goal_difference,
              points: team.points,
              groupName: isGroupStage ? `Group ${selectedGroup}` : null,
              seasonTeam: {
                team: {
                  name: team.team_name,
                  logoUrl: team.team_logo || null
                }
              }
            }))}
            tournamentName={tournamentName}
            seasonName={seasonName || `SEASON ${new Date().getFullYear()}`}
          />
        </div>
      </div>
    </div>
  );
}
