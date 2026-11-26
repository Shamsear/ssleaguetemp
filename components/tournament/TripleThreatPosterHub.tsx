'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, RefreshCw, Layers, Trophy, Calendar, Sparkles, ChevronRight, Check, X } from 'lucide-react';
import { generateContainerPng, downloadPng } from '@/lib/utils/export-image';

const TRIPLE_THREAT_FONT_URL =
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;0,900;1,700;1,800;1,900&family=Montserrat:wght@400;500;600;700;800&display=swap';

interface TripleThreatPosterHubProps {
  tournamentId: string;
}

export default function TripleThreatPosterHub({ tournamentId }: TripleThreatPosterHubProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'ranking' | 'groups' | 'points' | 'results' | 'final' | 'fixtures'>('ranking');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [fixtureMd, setFixtureMd] = useState<string>('1');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const posterRef = useRef<HTMLDivElement>(null);

  // Load fonts and external styles
  useEffect(() => {
    // Add Google Fonts
    const fontId = 'google-fonts-barlow-montserrat';
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.crossOrigin = 'anonymous';
      link.href = TRIPLE_THREAT_FONT_URL;
      document.head.appendChild(link);
    }

    // Add Triple Threat stylesheet
    const styleId = 'triple-threat-custom-styles';
    if (!document.getElementById(styleId)) {
      const link = document.createElement('link');
      link.id = styleId;
      link.rel = 'stylesheet';
      link.href = '/triple-threat/style.css';
      document.head.appendChild(link);
    }

    fetchData();

    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, [tournamentId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/triple-threat-data`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);

        // Find next pending matchday if available
        if (json.data.matches && json.data.matches.length > 0) {
          const next = json.data.matches.find((m: any) => m.status !== 'FT');
          if (next) {
            setFixtureMd(String(next.md));
          }
        }
      }
    } catch (err) {
      console.error('Failed to load Triple Threat live data:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportFilename = `SS Triple Threat - ${activeTab.toUpperCase()}${activeTab === 'fixtures' ? ` MD${fixtureMd}` : ''}.png`;

  const handleDownloadPng = async () => {
    if (!posterRef.current || !data) return;

    setIsExporting(true);
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const isPointsView = activeTab === 'points';
      const OUT_W = isPointsView ? 1920 : 1080;

      // Capture via native browser SVG foreignObject engine (html-to-image) so CSS grid,
      // flex centering, skewX badges, and condensed font baselines match the live page 1:1.
      const dataUrl = await generateContainerPng(posterRef.current, {
        width: OUT_W,
        backgroundColor: '#050604',
        fontEmbedUrl: TRIPLE_THREAT_FONT_URL,
        filter: (el) => !(el.classList && el.classList.contains('chips')),
        beforeCapture: (clone) => {
          clone.classList.add('tt-scope', 'export');
          clone.classList.remove('export-fixed', 'export-fixtures', 'export-groups', 'export-final');

          clone.style.width = `${OUT_W}px`;
          clone.style.maxWidth = `${OUT_W}px`;
          clone.style.borderRadius = '0';
          clone.style.border = '0';
          clone.style.margin = '0';
          clone.style.height = 'auto';
          clone.style.minHeight = 'auto';
          clone.style.overflow = 'visible';

          if (isPointsView) {
            clone.classList.add('export-land', 'export-points');
          }
        },
      });

      downloadPng(dataUrl, exportFilename);
      setPreviewImage(dataUrl);
    } catch (err: any) {
      console.error('Error generating poster image:', err);
      alert('Could not generate poster: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-4 bg-[#050604] rounded-3xl border border-white/10 text-white font-mono">
        <RefreshCw className="w-8 h-8 animate-spin text-[#c5f018]" />
        <p className="text-sm tracking-wider uppercase">Loading SS Triple Threat Live Engine...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-16 text-center bg-[#050604] rounded-3xl border border-white/10 text-white font-mono space-y-3">
        <p className="text-rose-400 font-bold">Failed to load tournament data.</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold uppercase tracking-wider"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { meta, teams, groups, breakdown, matches, knockout } = data;

  const esc = (s: any) => String(s == null ? '' : s);
  const short = (n: string) => (teams[n] && teams[n].short) || n.slice(0, 3);
  const groupTitle = (g: string) => (g === 'TBD' ? 'Group not assigned' : 'Group ' + g);

  const renderLogo = (teamName: string) => {
    const t = teams[teamName] || {};
    if (t.logo) {
      return (
        <div className="logo">
          <img src={t.logo} alt="" loading="eager" decoding="async" />
        </div>
      );
    }
    const ini = teamName
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((w: string) => w[0])
      .join('')
      .slice(0, 3);
    return <div className="logo ph">{ini}</div>;
  };

  const KO_ROUNDS: Record<string, string> = { QF: 'Quarter-finals', SF: 'Semi-finals', FINAL: 'Final' };
  const fixLabel = (md: string) => KO_ROUNDS[md] || ('Matchday ' + md);
  const mdList = () => {
    const mds: string[] = Array.from(new Set<string>(matches.map((m: any) => String(m.md)))).filter(Boolean).sort((a, b) => Number(a) - Number(b));
    const ko = (knockout && knockout.matches) || [];
    Object.keys(KO_ROUNDS).forEach((k) => {
      if (ko.some((m: any) => m.id.indexOf(k) === 0 && (m.home || m.away))) mds.push(k);
    });
    return mds;
  };

  return (
    <div className="triple-threat-hub-root tt-scope space-y-4">
      {/* Top Controller Bar */}
      <div className="toolbar bg-[#0d1109] p-3 rounded-2xl border border-white/10 flex flex-wrap items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="tabs flex flex-wrap gap-1.5 p-1 bg-black/40 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('ranking')}
            className={`tab ${activeTab === 'ranking' ? 'on' : ''}`}
          >
            Standings
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`tab ${activeTab === 'groups' ? 'on' : ''}`}
          >
            Groups
          </button>
          <button
            onClick={() => setActiveTab('points')}
            className={`tab ${activeTab === 'points' ? 'on' : ''}`}
          >
            Points
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`tab ${activeTab === 'results' ? 'on' : ''}`}
          >
            Results
          </button>
          <button
            onClick={() => setActiveTab('final')}
            className={`tab ${activeTab === 'final' ? 'on' : ''}`}
          >
            Road to Final
          </button>
          <button
            onClick={() => setActiveTab('fixtures')}
            className={`tab ${activeTab === 'fixtures' ? 'on' : ''}`}
          >
            Fixtures Poster
          </button>
        </div>

        {/* Action Controls */}
        <div className="actions flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={fetchData}
            title="Refresh Live Data"
            className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-[#c5f018]" />
          </button>
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={isExporting}
            className="btn solid flex items-center gap-2 px-5 py-2.5 bg-[#c5f018] hover:bg-[#a6d40a] text-[#0b0f02] font-black rounded-xl font-mono text-xs uppercase tracking-wider shadow-lg shadow-[#c5f018]/10 cursor-pointer disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Creating PNG...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download PNG (2X Sharp)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Group and Matchday Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs font-mono">
        {activeTab !== 'fixtures' && activeTab !== 'final' && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Group Filter:</span>
            <div className="flex gap-1.5">
              {['ALL', 'A', 'B', 'C', 'D'].map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupFilter(g)}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                    groupFilter === g
                      ? 'bg-[#c5f018] text-[#0b0f02]'
                      : 'bg-[#0d1109] text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  {g === 'ALL' ? 'All Groups' : `Group ${g}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'fixtures' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Matchday / Stage:</span>
            <div className="flex flex-wrap gap-1.5">
              {mdList().map((k) => (
                <button
                  key={k}
                  onClick={() => setFixtureMd(k)}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                    fixtureMd === k
                      ? 'bg-[#c5f018] text-[#0b0f02]'
                      : 'bg-[#0d1109] text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  {KO_ROUNDS[k] ? KO_ROUNDS[k] : `MD ${k}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-[11px] text-slate-400 ml-auto hidden sm:block">
          Export Canvas: <strong className="text-[#c5f018]">{activeTab === 'points' ? '16:9 Landscape (3840×2160)' : 'Exact Page Match 2X HD'}</strong>
        </div>
      </div>

      {/* The Printable / Renderable Poster Node */}
      <div className="stage-wrapper overflow-x-auto p-1 sm:p-2 bg-black/60 rounded-3xl border border-white/10">
        <div id="poster" ref={posterRef} className="poster-container has-bg mx-auto">
          <div className="inner">
            {/* Header / Hero */}
            <header className="hero" id="hero">
              {meta.logo ? (
                <img className="hero-logo" src={meta.logo} alt="SS Triple Threat" loading="eager" decoding="async" />
              ) : (
                <div className="hero-text">
                  <div className="league">{meta.league}</div>
                  <div className="title">
                    SS TRIPLE <span>THREAT</span>
                  </div>
                  <div className="tagline">{meta.tagline}</div>
                </div>
              )}
            </header>

            {/* TAB 1: STANDINGS */}
            {activeTab === 'ranking' && (
              <section id="v-ranking">
                <div className="section-title">
                  <div className="slash"></div>
                  <h2>
                    Points <span>Table</span>
                  </h2>
                  <div className="rule-line"></div>
                  <div className="pill-note">Pts = Mode Points + Bonus</div>
                </div>

                <div className="rank-wrap">
                  {groups
                    .filter((g: any) => groupFilter === 'ALL' || g.name === groupFilter)
                    .map((g: any) => (
                      <div key={g.name} className="rank-col">
                        <div className="rank-head">{groupTitle(g.name)}</div>
                        <div className="rank-row rank-th">
                          <div>#</div>
                          <div className="l">TEAM</div>
                          <div>P</div>
                          <div>W</div>
                          <div>D</div>
                          <div>L</div>
                          <div className="hide-sm">PF</div>
                          <div className="hide-sm">PA</div>
                          <div>GD</div>
                          <div>PTS</div>
                          <div className="hide-sm">FORM</div>
                        </div>

                        {g.standings.map((r: any) => {
                          const form = [...r.form].slice(-5);
                          while (form.length < 5) form.unshift('N');

                          return (
                            <div
                              key={r.team}
                              className={`rank-row ${r.p > 0 && r.pos <= (meta.qualify || 2) ? `p${r.pos}` : ''}`}
                            >
                              <div className="pos">
                                <b>{r.pos}</b>
                              </div>
                              <div className="team">
                                {renderLogo(r.team)}
                                <div className="tname">{r.team}</div>
                              </div>
                              <div className="dim">{r.p}</div>
                              <div>{r.w}</div>
                              <div>{r.d}</div>
                              <div>{r.l}</div>
                              <div className="dim hide-sm">{r.pf}</div>
                              <div className="dim hide-sm">{r.pa}</div>
                              <div className={`gd ${r.gd > 0 ? 'up' : r.gd < 0 ? 'down' : ''}`}>
                                {r.gd > 0 ? '+' : ''}
                                {r.gd}
                              </div>
                              <div className="pts">
                                <b>{r.pts}</b>
                              </div>
                              <div className="form hide-sm">
                                {form.map((f: string, i: number) => (
                                  <span key={i} className={`f ${f}`}>
                                    {f === 'N' ? '' : f}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* TAB 2: GROUPS */}
            {activeTab === 'groups' && (
              <section id="v-groups">
                <div className="section-title">
                  <div className="slash"></div>
                  <h2>
                    The <span>Groups</span>
                  </h2>
                  <div className="rule-line"></div>
                  <div className="pill-note">{meta.stage || 'Group Stage'}</div>
                </div>

                <div className="gwrap">
                  {groups
                    .filter((g: any) => groupFilter === 'ALL' || g.name === groupFilter)
                    .map((g: any) => {
                      const names = Object.keys(teams).filter(
                        (n) => (teams[n].group || 'TBD') === g.name
                      );

                      return (
                        <div key={g.name} className="gcol">
                          <div className="ghead">
                            {groupTitle(g.name)}
                            <span>{names.length} TEAMS</span>
                          </div>
                          <div className="gcards">
                            {names.map((name) => {
                              const t = teams[name] || {};
                              return (
                                <div key={name} className="gt">
                                  {renderLogo(name)}
                                  <div className="gt-t">
                                    <div className="gt-n">{name}</div>
                                    {t.manager && (
                                      <div className="gt-m">Manager · {t.manager}</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </section>
            )}

            {/* TAB 3: MATCHDAY POINTS */}
            {activeTab === 'points' && (
              <section id="v-points">
                <div className="section-title">
                  <div className="slash"></div>
                  <h2>
                    Matchday <span>Points</span>
                  </h2>
                  <div className="rule-line"></div>
                  <div className="pill-note">Detailed Breakdown</div>
                </div>

                <div className="tablewrap">
                  <table className="bd">
                    <thead>
                      <tr>
                        <th rowSpan={2} className="tlogo-h">
                          TEAM
                        </th>
                        {data.matchdays.map((d: number, i: number) => (
                          <th key={d} colSpan={6} className={`sep ${i % 2 ? 'mdB' : 'mdA'}`}>
                            MD {d}
                          </th>
                        ))}
                        <th rowSpan={2} className="sep tot">
                          TOTAL
                          <br />
                          POINTS
                        </th>
                      </tr>
                      <tr>
                        {data.matchdays.map((d: number, i: number) => {
                          const c = i % 2 ? 'mdB' : 'mdA';
                          return ['VS', 'DUO', 'COOP', 'SINGLE', 'BONUS', 'TOTAL'].map((s, k) => (
                            <th key={`${d}-${s}`} className={`${c} ${k === 0 ? 'sep' : ''}`}>
                              {s}
                            </th>
                          ));
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown
                        .filter((r: any) => groupFilter === 'ALL' || r.group === groupFilter)
                        .map((r: any, idx: number) => (
                          <tr key={r.team}>
                            <td className="tcell tlogo" title={r.team}>
                              {renderLogo(r.team)}
                            </td>
                            {r.mds.map((m: any, mIdx: number) => {
                              const opp = m.opp ? short(m.opp) : '';
                              return (
                                <React.Fragment key={mIdx}>
                                  <td className="vs sep">
                                    {opp ? `vs ${opp}` : <span className="dim">–</span>}
                                  </td>
                                  <td>{m.duo === null ? <span className="dim">–</span> : m.duo}</td>
                                  <td>{m.coop === null ? <span className="dim">–</span> : m.coop}</td>
                                  <td>{m.single === null ? <span className="dim">–</span> : m.single}</td>
                                  <td className={m.bonus ? 'bonus' : 'dim'}>
                                    {m.bonus ? `+${m.bonus}` : <span className="dim">–</span>}
                                  </td>
                                  <td className="mdt">{m.total === null ? <span className="dim">–</span> : m.total}</td>
                                </React.Fragment>
                              );
                            })}
                            <td className="tot sep">{r.total}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* TAB 4: RESULTS */}
            {activeTab === 'results' && (
              <section id="v-results">
                <div className="section-title">
                  <div className="slash"></div>
                  <h2>
                    Results <span>& Fixtures</span>
                  </h2>
                  <div className="rule-line"></div>
                </div>

                <div className="results-list space-y-6">
                  {data.matchdays.map((k: number) => {
                    const mdMatches = matches.filter(
                      (m: any) =>
                        m.md === k && (groupFilter === 'ALL' || m.group === groupFilter)
                    );
                    if (mdMatches.length === 0) return null;

                    return (
                      <div key={k} className="md-block">
                        <div className="mdhead">MATCHDAY {k}</div>
                        <div className="cards">
                          {mdMatches.map((m: any) => {
                            const ft = m.status === 'FT';
                            const hw = ft && m.hp > m.ap;
                            const aw = ft && m.ap > m.hp;

                            return (
                              <div key={m.id} className={`card ${m.status === 'UPCOMING' ? 'up' : ''}`}>
                                <div className="vsrow">
                                  <div className={`side ${hw ? 'win' : ''}`}>
                                    {renderLogo(m.home)}
                                    <span className="nm">{m.home}</span>
                                  </div>
                                  <div className="score">
                                    {m.done ? `${m.hp} : ${m.ap}` : 'VS'}
                                    <small>POINTS</small>
                                  </div>
                                  <div className={`side ${aw ? 'win' : ''}`}>
                                    {renderLogo(m.away)}
                                    <span className="nm">{m.away}</span>
                                  </div>
                                </div>

                                <div className="modes">
                                  {m.modes.map((x: any) => (
                                    <div key={x.key} className="mode">
                                      <b>{x.label}</b>
                                      <span>
                                        {x.h === null || x.a === null ? '–' : `${x.h} - ${x.a}`}
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                <div className="tags">
                                  {m.group && (
                                    <span className="status grp-tag">GROUP {m.group}</span>
                                  )}{' '}
                                  <span className={`status st-${m.status}`}>
                                    {m.status === 'FT'
                                      ? 'FULL TIME'
                                      : m.status === 'LIVE'
                                      ? 'IN PROGRESS'
                                      : 'UPCOMING'}
                                  </span>
                                  {(m.hb || m.ab) && (
                                    <span className="bonus-tag">
                                      +{m.hb || m.ab} BONUS · {short(m.hb ? m.home : m.away)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* TAB 5: ROAD TO FINAL */}
            {activeTab === 'final' && (
              <section id="v-final">
                <div className="section-title">
                  <div className="slash"></div>
                  <h2>
                    Road to <span>Final</span>
                  </h2>
                  <div className="rule-line"></div>
                  <div className="pill-note">Live Projection / Knockouts</div>
                </div>

                <div className="rf-sum4">
                  {groups.map((g: any) => (
                    <div key={g.name} className="rf-box">
                      <div className="rf-g">GROUP {g.name}</div>
                      <div className="rf-c">{g.standings.length} TEAMS</div>
                    </div>
                  ))}
                </div>
                <div className="rf-top">TOP 2 FROM EACH GROUP QUALIFY</div>
                <div className="rf-note">
                  Quarter-finals: A1 v B2 · C1 v D2 · B1 v A2 · D1 v C2
                </div>

                {/* Knockout Bracket Grid */}
                <div className="bracket-wrap mt-4">
                  <div className="bracket">
                    {/* QF Column */}
                    <div className="bcol">
                      <div className="bhead">Quarter-finals</div>
                      <div className="slots">
                        {['QF1', 'QF3', 'QF2', 'QF4'].map((qfId) => {
                          const m = knockout.matches.find((x: any) => x.id === qfId);
                          if (!m) return null;
                          return (
                            <div key={qfId} className="slot">
                              <div className="mc" data-id={qfId}>
                                <div className="mc-h">
                                  <span>{qfId}</span>
                                  <span className={`st st-${m.status}`}>{m.status}</span>
                                </div>
                                <div className={`mt ${m.winner && m.winner === m.home ? 'win' : ''} ${!m.home ? 'tbd' : ''}`}>
                                  <em>{m.homeSeed}</em>
                                  {m.home ? renderLogo(m.home) : <div className="logo ph">?</div>}
                                  <span className="mt-n">
                                    {m.home || m.homeLabel}
                                    {m.homeProjected && <small> proj.</small>}
                                  </span>
                                  <b>{m.done ? m.hp : ''}</b>
                                </div>
                                <div className={`mt ${m.winner && m.winner === m.away ? 'win' : ''} ${!m.away ? 'tbd' : ''}`}>
                                  <em>{m.awaySeed}</em>
                                  {m.away ? renderLogo(m.away) : <div className="logo ph">?</div>}
                                  <span className="mt-n">
                                    {m.away || m.awayLabel}
                                    {m.awayProjected && <small> proj.</small>}
                                  </span>
                                  <b>{m.done ? m.ap : ''}</b>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Connectors QF -> SF */}
                    <div className="bcol">
                      <div className="bhead">&nbsp;</div>
                      <div className="conn">
                        <i className="h" style={{ left: 0, width: '50%', top: '12.5%' }}></i>
                        <i className="h" style={{ left: 0, width: '50%', top: '37.5%' }}></i>
                        <i className="v" style={{ left: '50%', top: '12.5%', height: '25%' }}></i>
                        <i className="h" style={{ left: '50%', width: '50%', top: '25%' }}></i>

                        <i className="h" style={{ left: 0, width: '50%', top: '62.5%' }}></i>
                        <i className="h" style={{ left: 0, width: '50%', top: '87.5%' }}></i>
                        <i className="v" style={{ left: '50%', top: '62.5%', height: '25%' }}></i>
                        <i className="h" style={{ left: '50%', width: '50%', top: '75%' }}></i>
                      </div>
                    </div>

                    {/* SF Column */}
                    <div className="bcol">
                      <div className="bhead">Semi-finals</div>
                      <div className="slots">
                        {['SF1', 'SF2'].map((sfId) => {
                          const m = knockout.matches.find((x: any) => x.id === sfId);
                          if (!m) return null;
                          return (
                            <div key={sfId} className="slot">
                              <div className="mc" data-id={sfId}>
                                <div className="mc-h">
                                  <span>{sfId}</span>
                                  <span className={`st st-${m.status}`}>{m.status}</span>
                                </div>
                                <div className={`mt noseed ${m.winner && m.winner === m.home ? 'win' : ''} ${!m.home ? 'tbd' : ''}`}>
                                  {m.home ? renderLogo(m.home) : <div className="logo ph">?</div>}
                                  <span className="mt-n">{m.home || m.homeLabel}</span>
                                  <b>{m.done ? m.hp : ''}</b>
                                </div>
                                <div className={`mt noseed ${m.winner && m.winner === m.away ? 'win' : ''} ${!m.away ? 'tbd' : ''}`}>
                                  {m.away ? renderLogo(m.away) : <div className="logo ph">?</div>}
                                  <span className="mt-n">{m.away || m.awayLabel}</span>
                                  <b>{m.done ? m.ap : ''}</b>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Connectors SF -> Final */}
                    <div className="bcol">
                      <div className="bhead">&nbsp;</div>
                      <div className="conn">
                        <i className="h" style={{ left: 0, width: '50%', top: '25%' }}></i>
                        <i className="h" style={{ left: 0, width: '50%', top: '75%' }}></i>
                        <i className="v" style={{ left: '50%', top: '25%', height: '50%' }}></i>
                        <i className="h" style={{ left: '50%', width: '50%', top: '50%' }}></i>
                      </div>
                    </div>

                    {/* Final Column */}
                    <div className="bcol">
                      <div className="bhead">Final</div>
                      <div className="slots">
                        <div className="slot">
                          <div className="fcard w-full">
                            {(() => {
                              const m = knockout.matches.find((x: any) => x.id === 'FINAL');
                              if (!m) return null;
                              return (
                                <div className="mc final" data-id="FINAL">
                                  <div className="mc-h">
                                    <span>FINAL</span>
                                    <span className={`st st-${m.status}`}>{m.status}</span>
                                  </div>
                                  <div className={`mt noseed ${m.winner && m.winner === m.home ? 'win' : ''} ${!m.home ? 'tbd' : ''}`}>
                                    {m.home ? renderLogo(m.home) : <div className="logo ph">?</div>}
                                    <span className="mt-n">{m.home || m.homeLabel}</span>
                                    <b>{m.done ? m.hp : ''}</b>
                                  </div>
                                  <div className={`mt noseed ${m.winner && m.winner === m.away ? 'win' : ''} ${!m.away ? 'tbd' : ''}`}>
                                    {m.away ? renderLogo(m.away) : <div className="logo ph">?</div>}
                                    <span className="mt-n">{m.away || m.awayLabel}</span>
                                    <b>{m.done ? m.ap : ''}</b>
                                  </div>
                                </div>
                              );
                            })()}

                            <div className={`champ ${knockout.champion ? 'on' : ''} mt-4`}>
                              <div className="cup">🏆</div>
                              <div className="ct">CHAMPION</div>
                              {knockout.champion ? (
                                <>
                                  {renderLogo(knockout.champion)}
                                  <div className="cn">{knockout.champion}</div>
                                </>
                              ) : (
                                <div className="cn dim">To be decided</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* TAB 6: FIXTURES POSTER */}
            {activeTab === 'fixtures' && (
              <section id="v-fixtures">
                {(() => {
                  const isKo = !!KO_ROUNDS[fixtureMd];
                  const roundMatches = isKo
                    ? ((knockout && knockout.matches) || []).filter(
                        (m: any) => m.id.indexOf(fixtureMd) === 0
                      )
                    : matches.filter((m: any) => String(m.md) === fixtureMd);

                  const anyPlayed = roundMatches.some((m: any) => m.done > 0);

                  return (
                    <>
                      <div className="fx-title">
                        <div className="fx-md">{fixLabel(fixtureMd)}</div>
                        <div className="fx-sub">{anyPlayed ? 'RESULTS' : 'FIXTURES'}</div>
                      </div>

                      <div className="fx-wrap">
                        {isKo ? (
                          <div className="fx-group">
                            <div className="fx-list">
                              {roundMatches.map((m: any) => {
                                const played = m.done > 0;
                                const winH = m.status === 'FT' && (m.winner ? m.winner === m.home : m.hp > m.ap);
                                const winA = m.status === 'FT' && (m.winner ? m.winner === m.away : m.ap > m.hp);

                                return (
                                  <div key={m.id} className={`fxc ${played ? 'played' : ''}`}>
                                    <div className="fx-row">
                                      <div className={`fxs ${winH ? 'win' : ''}`}>
                                        {m.home ? renderLogo(m.home) : <div className="logo ph">?</div>}
                                        <div className="fxn">{m.home || m.homeLabel || 'TBD'}</div>
                                      </div>
                                      <div className={`fxv ${played ? 'sc' : ''}`}>
                                        {played ? `${m.hp} : ${m.ap}` : 'VS'}
                                        {played && (
                                          <small>
                                            {m.status === 'FT' ? 'FULL TIME' : 'IN PROGRESS'}
                                          </small>
                                        )}
                                      </div>
                                      <div className={`fxs r ${winA ? 'win' : ''}`}>
                                        <div className="fxn">{m.away || m.awayLabel || 'TBD'}</div>
                                        {m.away ? renderLogo(m.away) : <div className="logo ph">?</div>}
                                      </div>
                                    </div>
                                    {played && m.modes && (
                                      <div className="fx-mline">
                                        {m.modes
                                          .map((x: any) => `${x.label.replace('SINGLE', 'SOLO')} ${x.h === null ? '–' : `${x.h}-${x.a}`}`)
                                          .join('  ·  ')}
                                        {(m.hb || m.ab) && (
                                          <b> ⭐ +{m.hb || m.ab} BONUS</b>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          ['A', 'B', 'C', 'D'].map((g) => {
                            const groupMatches = roundMatches.filter(
                              (m: any) => (m.group || '') === g
                            );
                            if (groupMatches.length === 0) return null;

                            return (
                              <div key={g} className="fx-group">
                                <div className="fx-gh">{groupTitle(g)}</div>
                                <div className="fx-list">
                                  {groupMatches.map((m: any) => {
                                    const played = m.done > 0;
                                    const winH = m.status === 'FT' && m.hp > m.ap;
                                    const winA = m.status === 'FT' && m.ap > m.hp;

                                    return (
                                      <div key={m.id} className={`fxc ${played ? 'played' : ''}`}>
                                        <div className="fx-row">
                                          <div className={`fxs ${winH ? 'win' : ''}`}>
                                            {m.home ? renderLogo(m.home) : <div className="logo ph">?</div>}
                                            <div className="fxn">{m.home}</div>
                                          </div>
                                          <div className={`fxv ${played ? 'sc' : ''}`}>
                                            {played ? `${m.hp} : ${m.ap}` : 'VS'}
                                            {played && (
                                              <small>
                                                {m.status === 'FT' ? 'FULL TIME' : 'IN PROGRESS'}
                                              </small>
                                            )}
                                          </div>
                                          <div className={`fxs r ${winA ? 'win' : ''}`}>
                                            <div className="fxn">{m.away}</div>
                                            {m.away ? renderLogo(m.away) : <div className="logo ph">?</div>}
                                          </div>
                                        </div>
                                        {played && m.modes && (
                                          <div className="fx-mline">
                                            {m.modes
                                              .map((x: any) => `${x.label.replace('SINGLE', 'SOLO')} ${x.h === null ? '–' : `${x.h}-${x.a}`}`)
                                              .join('  ·  ')}
                                            {(m.hb || m.ab) && (
                                              <b> ⭐ +{m.hb || m.ab} BONUS</b>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="fx-modes">
                        CO-OP · DUO · SOLO — THREE MODES. ONE CHAMPION.
                      </div>
                    </>
                  );
                })()}
              </section>
            )}

            {/* Rules Strip & Footer */}
            <div className="rules" id="rules">
              <span className="rule">
                Win <em>{meta.win}</em>
              </span>
              <span className="rule">
                Draw <em>{meta.draw}</em>
              </span>
              <span className="rule">Loss <em>0</em></span>
              <span className="rule">
                Clean sweep bonus <em>+{meta.bonus}</em>
              </span>
              <span className="rule">
                Max <em>{meta.win * 3 + meta.bonus}</em> per match
              </span>
              <span className="rule">GD = points for − points against</span>
            </div>
            <footer id="footer">{meta.footer}</footer>
          </div>
        </div>
      </div>

      {/* Preview Modal if Download is triggered */}
      {mounted && previewImage && createPortal(
        <div className="fixed inset-0 z-[99999999] bg-black/92 backdrop-blur-md flex flex-col items-center justify-between p-3 sm:p-5 overflow-hidden animate-fade-in">
          {/* Header bar (always visible at top, completely above navbar!) */}
          <div className="w-full max-w-5xl flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#c5f018]" />
              <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider font-mono">
                Poster Export Ready <span className="text-[#c5f018]">(2X Ultra HD)</span>
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Central image display (scaled to viewport, crisp, high-res) */}
          <div className="flex-1 w-full max-w-5xl min-h-0 flex items-center justify-center p-2 sm:p-4 overflow-auto">
            <img
              src={previewImage}
              alt="Generated Poster"
              className="max-h-full max-w-full w-auto h-auto object-contain rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] border border-white/10"
            />
          </div>

          {/* Bottom action bar (sticky, always visible on all screens!) */}
          <div className="w-full max-w-5xl pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <p className="text-xs text-slate-400 font-mono text-center sm:text-left">
              Download started automatically! On mobile phones or tablets, you can also long-press the image to save.
            </p>
            <div className="flex items-center gap-3">
              <a
                href={previewImage}
                download={exportFilename}
                onClick={(e) => {
                  e.preventDefault();
                  downloadPng(previewImage, exportFilename);
                }}
                className="px-6 py-2.5 bg-[#c5f018] hover:bg-[#b0d912] text-[#0b0f02] font-black text-xs uppercase tracking-wider rounded-xl shadow-lg cursor-pointer inline-flex items-center gap-2 transition-all active:scale-95"
              >
                <Download className="w-4 h-4" /> Save PNG Image
              </a>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
