'use client';

import { useRef, useState } from 'react';
import { Trophy, Award } from 'lucide-react';
import { generateContainerPng, downloadPng, shareOrDownloadPng } from '@/lib/utils/export-image';

interface FantasyTeam {
  rank: number;
  team_name: string;
  owner_name?: string;
  total_points: number;
  player_points?: number;
  passive_points?: number;
  supported_team_name?: string;
  player_count?: number;
  last_round_points?: number;
  team_logo?: string;
}

interface ShareableFantasyLeaderboardProps {
  teams: FantasyTeam[];
  leagueName: string;
}

export default function ShareableFantasyLeaderboard({ 
  teams, 
  leagueName
}: ShareableFantasyLeaderboardProps) {
  const leaderboardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const generateImage = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!leaderboardRef.current) return;

    try {
      setIsGenerating(true);
      const dataUrl = await generateContainerPng(leaderboardRef.current);
      const filename = `${leagueName.replace(/\s+/g, '-')}-fantasy-leaderboard.png`;
      downloadPng(dataUrl, filename);
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const shareImage = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!leaderboardRef.current) return;

    try {
      setIsGenerating(true);
      const dataUrl = await generateContainerPng(leaderboardRef.current);
      const filename = `${leagueName.replace(/\s+/g, '-')}-fantasy-leaderboard.png`;
      await shareOrDownloadPng(dataUrl, filename, `${leagueName} - Fantasy Leaderboard`);
    } catch (error) {
      console.error('Error sharing image:', error);
      alert('Failed to share image. Downloading instead...');
      generateImage();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4 font-mono">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); setShowPreview(!showPreview); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-md cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {showPreview ? 'Hide Preview' : 'Preview Image'}
        </button>

        <button
          type="button"
          onClick={(e) => generateImage(e)}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Image
            </>
          )}
        </button>

        <button
          type="button"
          onClick={(e) => shareImage(e)}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
              Share Image
            </>
          )}
        </button>
      </div>

      {/* Preview/Hidden Leaderboard for Image Generation */}
      <div style={{ 
        position: showPreview ? 'relative' : 'fixed', 
        left: showPreview ? '0' : '-9999px', 
        top: '0',
        width: showPreview ? '100%' : '1200px',
        overflow: showPreview ? 'auto' : 'hidden'
      }}>
        <div 
          ref={leaderboardRef}
          className="bg-white font-mono"
          style={{ width: '1200px' }}
        >
          {/* Header with Gradient Background */}
          <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-center py-8 px-6">
            <h1 className="text-5xl font-black text-white uppercase tracking-wider mb-2" style={{ fontFamily: 'Arial Black, sans-serif' }}>
              {leagueName}
            </h1>
            <p className="text-2xl text-yellow-300 font-bold uppercase tracking-wide">
              ⚡ FANTASY LEAGUE STANDINGS ⚡
            </p>
          </div>

          {/* Leaderboard Title */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6 py-4 text-center">
            <h2 className="text-3xl font-bold uppercase tracking-wide flex items-center justify-center gap-2"><Trophy className="w-8 h-8 text-amber-500" /> LEADERBOARD <Trophy className="w-8 h-8 text-amber-500" /></h2>
          </div>

          {/* Table */}
          <div className="px-6 pb-6 pt-4">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-purple-100 to-indigo-100 text-gray-800 text-sm font-bold uppercase">
                  <th className="py-4 px-3 text-center border-2 border-purple-300">Rank</th>
                  <th className="py-4 px-6 text-left border-2 border-purple-300">Team / Owner</th>
                  <th className="py-4 px-4 text-center border-2 border-purple-300">Player Points</th>
                  <th className="py-4 px-4 text-center border-2 border-purple-300">Supported Team</th>
                  <th className="py-4 px-4 text-center border-2 border-purple-300">Total Points</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team, index) => {
                  const isTop3 = index < 3;
                  const bgColor = 
                    index === 0 ? 'bg-gradient-to-r from-yellow-100 to-yellow-200' :
                    index === 1 ? 'bg-gradient-to-r from-gray-100 to-gray-200' :
                    index === 2 ? 'bg-gradient-to-r from-orange-100 to-orange-200' :
                    index % 2 === 0 ? 'bg-purple-50' : 'bg-white';
                  
                  return (
                    <tr key={index} className={bgColor}>
                      {/* Rank */}
                      <td className="py-4 px-3 text-center border-2 border-purple-200">
                        <div className="flex items-center justify-center">
                          {index === 0 && (
                            <Award className="w-10 h-10 text-amber-500" />
                          )}
                          {index === 1 && (
                            <Award className="w-10 h-10 text-slate-400" />
                          )}
                          {index === 2 && (
                            <Award className="w-10 h-10 text-amber-700" />
                          )}
                          {index > 2 && (
                            <span className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold px-4 py-2 rounded-lg text-lg">
                              {index + 1}
                            </span>
                          )}
                        </div>
                      </td>
                      
                      {/* Team Name */}
                      <td className="py-4 px-6 border-2 border-purple-200">
                        <div className="flex items-center gap-3">
                          {team.team_logo ? (
                            <img 
                              src={team.team_logo} 
                              alt={`${team.team_name} logo`}
                              className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                              style={{
                                objectPosition: `${(team as any).logo_position_x_circle ?? 50}% ${(team as any).logo_position_y_circle ?? 50}%`,
                                transform: `scale(${(team as any).logo_scale_circle ?? 1})`,
                                transformOrigin: `${(team as any).logo_position_x_circle ?? 50}% ${(team as any).logo_position_y_circle ?? 50}%`,
                              }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                              {team.team_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <span className={`font-bold uppercase text-lg block ${isTop3 ? 'text-gray-900' : 'text-gray-800'}`}>
                              {team.team_name?.toUpperCase()}
                            </span>
                            {team.owner_name && (
                              <span className="text-xs text-gray-500 font-bold uppercase block">
                                Owner: {team.owner_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      {/* Player Points */}
                      <td className="py-4 px-4 text-center border-2 border-purple-200">
                        <span className="inline-block bg-blue-600 text-white font-black px-4 py-2 rounded-lg text-lg">
                          {team.player_points || 0} PTS
                        </span>
                      </td>
                      
                      {/* Supported Team & Passive Points */}
                      <td className="py-4 px-4 text-center border-2 border-purple-200">
                        <div className="flex flex-col items-center">
                          <span className="text-sm font-extrabold text-emerald-700 uppercase">
                            {team.supported_team_name || 'N/A'}
                          </span>
                          <span className="inline-block bg-emerald-600 text-white font-black px-3 py-1 rounded-md text-xs mt-1">
                            +{team.passive_points || 0} PTS
                          </span>
                        </div>
                      </td>
                      
                      {/* Total Points */}
                      <td className="py-4 px-4 text-center border-2 border-purple-200 bg-gradient-to-r from-indigo-100 to-purple-100">
                        <span className="font-black text-2xl text-indigo-700">
                          {team.total_points}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white px-6 py-4 text-center">
            <p className="text-lg font-bold uppercase tracking-wide">
              🎮 {teams.length} Teams Competing • Fantasy League Standings
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
