'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function RulesPage() {
    const [activeSection, setActiveSection] = useState<string>('part1');

    const sections = [
        { id: 'part1', title: 'Part 1: Match Day Schedule & Extra Rules', icon: '🟨' },
        { id: 'part2', title: 'Part 2: Common Match Rules', icon: '🟦' },
        { id: 'part3', title: 'Part 3: Additional Rules & Important Notes', icon: '🟪' },
    ];

    return (
        <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
            {/* Ambient Gold Glow */}
            <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

            <div className="max-w-6xl mx-auto relative z-10 space-y-6">
                {/* Header */}
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm font-mono relative overflow-hidden mb-6 sm:mb-8">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                        <div className="w-full sm:w-auto">
                            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold uppercase tracking-wider text-slate-800">⚽ SS PES SUPER LEAGUE</h1>
                            <p className="text-xs text-slate-500 uppercase font-bold mt-1">SEASON 16 - RULES & REGULATIONS</p>
                        </div>
                        <Link
                            href="/"
                            className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit"
                        >
                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            Home
                        </Link>
                    </div>
                    <div className="border-t border-slate-100 pt-3 sm:pt-4 mt-3 sm:mt-4">
                        <p className="text-slate-500 text-xs sm:text-sm font-semibold">
                            📋 Complete tournament rules and regulations for all participants
                        </p>
                    </div>
                </div>

                {/* Section Tabs */}
                <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-2 font-mono mb-4 sm:mb-6 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2">
                        {sections.map((section) => (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                className={`p-3 sm:p-4 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all cursor-pointer ${activeSection === section.id
                                        ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                                        : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
                                    }`}
                            >
                                <div className="text-xl sm:text-2xl mb-1">{section.icon}</div>
                                <div className="text-xs sm:text-sm leading-tight">{section.title}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 md:p-8 shadow-sm font-mono">
                    {activeSection === 'part1' && <Part1Rules />}
                    {activeSection === 'part2' && <Part2Rules />}
                    {activeSection === 'part3' && <Part3Rules />}
                </div>

                {/* Footer */}
                <div className="mt-6 sm:mt-8 text-center font-mono">
                    <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
                        <p className="text-base font-extrabold uppercase tracking-wider text-slate-800 mb-2">🤝 SEASON 16 COMMITTEE</p>
                        <p className="text-xs text-slate-500 uppercase font-semibold">
                            WISH YOU A GREAT SUPER LEAGUE SEASON... and ALL THE BEST 👏
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Part1Rules() {
    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="border-l-4 border-amber-500 pl-3 sm:pl-4 mb-2">
                <h2 className="text-base sm:text-lg font-black text-slate-800 uppercase tracking-wider">
                    🌐 Match Day Time Table, Extra Rules and Suggestions
                </h2>
            </div>

            {/* First Day */}
            <RuleSection title="👉 First Day 1️⃣" color="blue">
                <RuleItem icon="🔸" title="Fixture: 8am">
                    ഫിക്സചർ നമ്മുടെ ആപ്പ് വഴി ആണ് ഇടേണ്ടത്.
                </RuleItem>

                <RuleItem icon="🔸" title="Lineup Setup">
                    ടൂർണമെന്റ് തുടങ്ങുമ്പോൾ തന്നെ എല്ലാ മാച്ച്ഡേയിലേക്കും ഉള്ള ലൈനപ്പ് (സ്റ്റാർട്ടിങ് 5+ സബ്) നിങ്ങൾക്ക് നമ്മുടെ ആപ്പിൽ സറ്റ് ചെയ്തു വെക്കാവുന്നതാണ്. അതല്ല അതാത് മാച്ച്ഡേയിൽ ചെയ്യണമെങ്കിൽ അതും ചെയ്യാവുന്നതാണ്.
                </RuleItem>

                <RuleItem icon="🔸" title="Lineup Deadline">
                    അതാത് മാച്ച്ഡേ ലൈനപ്പ് റെഡി ആക്കാനുള്ള അവസാന സമയം എന്നത് ഫിക്സചർ വരുന്ന ദിവസം രാവിലെ 8മണി വരെ ആണ്.
                </RuleItem>

                <RuleItem icon="🔸" title="Warning System">
                    ലൈനപ്പ് സെറ്റ് ആക്കീട്ടിലെങ്കിൽ ആദ്യ വാണിംഗ് ഉണ്ടാവുന്നതാണ് അതിനും ശേഷവും സെറ്റ് ആക്കീട്ടിലെങ്കിൽ എതിരാളികൾക്ക് തീരുമാനിക്കാം.
                </RuleItem>

                <RuleItem icon="🔸" title="Home Team Fixture">
                    മാച്ച്ഡേ ഫിക്സചർ വന്നു 5 മണിക് ഹോം ടീം അവരുടെ ഫിക്സചർ ഇടേണ്ടതാണ്. 5മണിക് ഹോം ടീം ഇട്ടില്ലെങ്കിൽ പിന്നീട് അദ്യം വരുന്ന ഫിക്സചർ കളിച്ചു തീർക്കേണ്ടതാണ്.
                </RuleItem>

                <RuleItem icon="🔸" title="Match Time Confirmation">
                    9 PM - Opponent ന് തനിക്ക് കളിക്കാൻ സാധിക്കുന്ന ടൈം വെളിപ്പെടുത്തി മെസ്സേജ് അയച്ചു കളിക്കാൻ ഉള്ള ടൈം ഫിക്സ് ചെയ്യാൻ ഉള്ള അവസാന സമയം 9 PM ആണ്.
                </RuleItem>

                <div className="bg-amber-50/60 border border-amber-200/60 p-4 rounded-xl flex gap-3 items-start mt-2">
                    <span className="text-lg flex-shrink-0">⚠️</span>
                    <div>
                        <span className="font-extrabold text-amber-800 text-[10px] uppercase tracking-wider block mb-1">Important Notice</span>
                        <p className="text-xs sm:text-sm text-amber-900 leading-relaxed font-semibold">
                            പ്ലെയർ തന്റെ അവൈലബിലിറ്റി വ്യക്തമാക്കിയിട്ടും Opponent തൻറെ Availability വ്യക്തമാക്കാത്ത സാഹചര്യത്തിൽ പ്ലെയറിന് Advantage എടുത്തു കൊണ്ട് താൻ പറയുന്ന സമയത്ത് Opponent നിർബന്ധമായി കളിക്കാൻ വരേണ്ടതാണ്.
                        </p>
                    </div>
                </div>
            </RuleSection>

            {/* Second Day */}
            <RuleSection title="👉 Second Day 2️⃣" color="indigo">
                <RuleItem icon="🔹" title="9 PM: SUB Rule">
                    SUB റൂൾ ഉപയോഗിക്കാൻ ഉള്ള അവസാന സമയം 9 PM ആയിരിക്കും
                </RuleItem>

                <RuleItem icon="🔸" title="11 PM: Issue Reporting">
                    എന്തെങ്കിലും ഇഷ്യൂ വന്നാൽ ടീമുകൾ റിപ്പോർട്ട് ചെയ്യാൻ ഉള്ള അവസാന സമയം 11 PM ആയിരിക്കും
                </RuleItem>

                <RuleItem icon="🔹" title="11:40 PM: Match Start">
                    Deadline 12:00 Am ആയതിനാൽ മാച്ച് 11.40ന് എങ്കിലും ആരംഭിച്ചിരിക്കണം
                </RuleItem>

                <div className="bg-rose-50/60 border border-rose-200/60 p-4 rounded-xl flex gap-3 items-center mt-2">
                    <span className="text-lg flex-shrink-0">🚨</span>
                    <div>
                        <span className="font-extrabold text-rose-800 text-[10px] uppercase tracking-wider block mb-0.5">Final Deadline</span>
                        <p className="text-base sm:text-lg font-black text-rose-900 uppercase">12:00 AM</p>
                    </div>
                </div>
            </RuleSection>

            {/* Extra Rules */}
            <RuleSection title="🛑 Extra Rules" color="green">
                <RuleItem icon="🟩" title="Message Response Rule">
                    ഏത് സമയത്ത് ആണെങ്കിലും SS സൂപ്പർ ലീഗിലെ മത്സരം കളിക്കുന്നതും ആയി ബന്ധപ്പെട്ട മെസ്സേജ് അയച്ചത് കണ്ടിട്ടും ഒരു മണിക്കൂറിനുള്ളിൽ യാതൊരു മറുപടിയും കൊടുത്തില്ല എങ്കിൽ +1 മെസ്സേജ് അയച്ച വ്യക്തിക്ക് ലഭിക്കും.
                </RuleItem>

                <RuleItem icon="🟫" title="Result Update Deadline">
                    SS Super League സീസൺ 16 മാച്ചുകളുടെ deadline 12:00 AM ആയിരിക്കും. റിസൾട്ട്‌ update ആക്കാൻ ഉള്ള അവസാന സമയം :- 12:10am ആയിരിക്കും.
                </RuleItem>

                <RuleItem icon="🔳" title="Self Resolution">
                    നിസാര പ്രശ്നങ്ങൾ മാനേജർമാർ വഴി പരസ്പരം സംസാരിച്ചു SSPSL സീസൺ 16ൻ്റെ റൂൾസ് ചെക്ക് ചെയ്തു സ്വയം സോൾവ് ചെയ്യാൻ ശ്രമിക്കുക.
                </RuleItem>

                <RuleItem icon="🟥" title="Committee Communication">
                    ലീഗിനെ സംബന്ധിക്കുന്ന കാര്യങ്ങൾ, പരാതികൾ എന്നിവ ഒരു കാരണവശാലും പേഴ്സണലി ആയി കമ്മറ്റി അംഗങ്ങളോട് സംസാരിക്കാൻ പാടില്ല. അത് ക്യാപ്റ്റൻ, ഓണർ, മാനേജർ എന്നിവർ വഴി മാർക്വീ/ഓണേഴ്സ് ഗ്രൂപ്പിൽ മാത്രം പങ്കുവെക്കുക.
                </RuleItem>
            </RuleSection>

            {/* Suggestions */}
            <RuleSection title="♦️ Committee Suggestions" color="purple">
                <RuleItem icon="❤" title="Early Completion">
                    മത്സരങ്ങൾ Deadline (11.59 PM) നു 4 മണിക്കൂർ മുമ്പ് എങ്കിലും പൂർത്തീകരിക്കാൻ പരമാവധി ശ്രമിക്കുക.
                </RuleItem>

                <RuleItem icon="💚" title="Respect Time">
                    സമയം കൃത്യമായി പാലിച്ചും എതിരാളിയുടെ സാഹചര്യത്തെ കൂടി മാനിച്ചും എതിരാളിയെ അനാവശ്യമായി വെയിറ്റ് ചെയ്യിപ്പിക്കാതെ മത്സരങ്ങൾ പൂർത്തീകരിക്കുക.
                </RuleItem>

                <RuleItem icon="❤" title="Communication">
                    ക്യാപ്റ്റൻ, മാനേജർമാർ ടീം അംഗങ്ങൾ എന്നിവർ തമ്മിൽ കൃത്യമായ ആശയവിനിമയം ലീഗിലുടനീളം നിലനിർത്തുക.
                </RuleItem>

                <RuleItem icon="💙" title="Committee Availability">
                    കമ്മറ്റി അംഗങ്ങൾക്ക് അടക്കം മറ്റു ജോലികളും ഉത്തരവാദിത്തങ്ങളും കുടുംബവും ഉള്ളതിനാൽ എല്ലായ്പ്പോഴും available ആയി കൂടണം എന്നില്ല. അതിനാൽ റൂൾസ് ചെക്ക് ചെയ്തു പരസ്പരം സംസാരിച്ചു പ്രശ്നം പരിഹരിക്കാൻ ശ്രമിക്കുക.
                </RuleItem>
            </RuleSection>
        </div>
    );
}

function Part2Rules() {
    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="border-l-4 border-amber-500 pl-3 sm:pl-4 mb-2">
                <h2 className="text-base sm:text-lg font-black text-slate-800 uppercase tracking-wider">
                    🚨 COMMON MATCH RULES
                </h2>
            </div>

            <RuleSection title="Basic Tournament Rules" color="blue">
                <NumberedRule number="1">
                    ലേലത്തിൽ വിളിച്ചെടുത്ത 25 അംഗ സ്‌ക്വാഡുമായി ആണ് SSPS SEASON 16 ലീഗിൽ പങ്കെടുക്കേണ്ടത്
                </NumberedRule>

                <NumberedRule number="2">
                    14 ടീമുകൾ ആണ് ലീഗിൽ പങ്കെടുക്കുന്നത്. എല്ലാ പ്ലയേഴ്‌സും മെയിൻ ഗ്രൂപ്പിലും ടീം ഗ്രൂപ്പിലും ആക്റ്റീവ് ആയിരിക്കണം.
                </NumberedRule>

                <NumberedRule number="3">
                    <div className="space-y-2">
                        <p>HOME x AWAY രീതിയിൽ LEAGUE ഗ്രൂപ്പ് റൗണ്ട് അവസാനിക്കുമ്പോൾ:</p>
                        <ul className="list-disc list-inside ml-2 sm:ml-4 space-y-1 text-xs sm:text-sm">
                            <li>Top 2 To Semifinals</li>
                            <li>3-6 Teams To Qualifier</li>
                        </ul>
                        <p className="text-xs sm:text-sm text-slate-500 font-semibold">ഗോളിന്റെ എണ്ണമനുസരിച്ചു ആയിരികും വിജയിയെ തീരുമാനിക്കുക.</p>
                    </div>
                </NumberedRule>

                <NumberedRule number="4">
                    മത്സരം ഹോസ്റ്റ് ചെയ്യാൻ ഉള്ള അവസരം HOME ടീമിന് ആയിരിക്കും. ഇനി എന്തെങ്കിലും സാഹചര്യത്തിൽ ഹോം ടീമിന് ഹോസ്റ്റ് ചെയ്യാൻ സാധിക്കാതെ വന്നാൽ AWAY ടീമിന് ഹോസ്റ്റ് ചെയ്യാവുന്നതാണ്.
                </NumberedRule>

                <NumberedRule number="5">
                    <div className="space-y-2 w-full">
                        <p className="font-extrabold text-slate-800 text-xs sm:text-sm uppercase tracking-wider">Match Settings:</p>
                        <ul className="list-disc list-inside ml-2 sm:ml-4 space-y-1 text-xs sm:text-sm text-slate-600">
                            <li>MATCH TIME - (6-8 MINUTE)</li>
                            <li>CONDITION - EXCELLENT</li>
                            <li>SUBSTITUTES - 5</li>
                            <li>SQUAD - SSPSL SEASON 16 SQUAD</li>
                        </ul>
                        <div className="mt-3 p-3 bg-amber-50/60 border border-amber-200/60 rounded-xl flex gap-2.5 items-start">
                            <span className="text-lg flex-shrink-0">⚠️</span>
                            <div>
                                <span className="font-extrabold text-amber-800 text-[9px] uppercase tracking-wider block mb-0.5">Penalty Rule</span>
                                <p className="text-xs text-amber-900 leading-relaxed font-semibold font-mono">
                                    6 മിനിറ്റ് മാച്ചിന് പകരം 8 മിനിറ്റ് ആണ് SET ചെയ്തു ചീറ്റിംഗ് നടത്തിയാൽ ഓപ്പോണെന്റിനു +6 ADVANTAGE നൽകുന്നതായിരിക്കും.
                                </p>
                            </div>
                        </div>
                    </div>
                </NumberedRule>

                <NumberedRule number="6">
                    DEADLINE മുന്നേ കളികൾ പൂർത്തിയാക്കുക. DEADLINE ശേഷവും കളികൾ പൂർത്തിയാക്കാതിരിക്കുകയും, പൂർത്തിയാക്കിയ മത്സരഫലം ഇരു ടീമുകളും അറിയിക്കാതെയും വന്നാൽ 0-0 എന്ന രീതിയിൽ ഇരു ടീമിന്റെയും ടോട്ടൽ സ്കോർ അവസാനിപ്പിക്കുന്നതാണ്.
                </NumberedRule>

                <NumberedRule number="7">
                    കളിക്കാനുള്ള അവസാന മെസ്സേജ് അയക്കേണ്ട സമയം ഡെഡ്‌ലൈനു 30 മിനിറ്റ് മുമ്പ് അതായത് 11.30 PM ആയിരിക്കും. കളി ആരംഭിക്കാനുള്ള അവസാന സമയം 11.40 PM ആയിരിക്കും.
                </NumberedRule>

                <NumberedRule number="8">
                    ഡെഡ്ലൈൻ സമയത്തിന് മുൻപേ കളികൾ പൂർത്തിയാക്കി റിസൾട്ട് കൈമാറേണ്ടതാണ്.
                </NumberedRule>

                <NumberedRule number="9">
                    HOME ടീമിന് FIXTURE തയ്യാറാക്കാൻ ഉള്ള സമയം 6 PM വരേ ആയിരിക്കും.
                </NumberedRule>

                <NumberedRule number="10">
                    <div className="space-y-2 w-full">
                        <p>മാച്ചിനുള്ള ഫിക്ച്ചർ വന്നതിനു ശേഷം ടീമംഗങ്ങൾ കളിക്കാനുള്ള സമയം രാത്രി 9 മണിക്ക് മുമ്പ് തന്നെ തൻ്റെ എതിരാളിയുമായി സമയം വ്യക്തമാക്കി മെസ്സേജ് അയച്ചു തമ്മിൽ ധാരണ ആയിട്ടുണ്ട് എന്ന് ക്യാപ്റ്റൻ/മാനേജർ ഉറപ്പു വരുത്തണം.</p>
                        <div className="bg-emerald-50/60 border border-emerald-200/60 p-3 rounded-xl flex gap-2.5 items-start">
                            <span className="text-lg flex-shrink-0">💡</span>
                            <div>
                                <span className="font-extrabold text-emerald-800 text-[9px] uppercase tracking-wider block mb-0.5">Response advantage</span>
                                <p className="text-xs text-emerald-950 leading-relaxed font-semibold">
                                    Opponent മെസ്സേജ് വായിച്ചിട്ടും 1 മണിക്കൂറിനുള്ളിൽ റിപ്ലെ നൽകിയില്ല എങ്കിൽ +1 ലഭിക്കുന്നതാണ്.
                                </p>
                            </div>
                        </div>
                    </div>
                </NumberedRule>
            </RuleSection>

            <RuleSection title="Match Issues & Penalties" color="red">
                <NumberedRule number="11">
                    തീരുമാനിച്ച മത്സര സമയത്തിനുള്ളിൽ കളിയ്ക്കാൻ പ്ലേയർ തയ്യാറാവാത്ത കേസുകളിലും, മാച്ച് കളിക്കാൻ സാധിക്കാത്ത അവസരങ്ങളിലും ഏത് TEAM / PLAYER ആണോ കൂടുതൽ ആയി കളിക്കാൻ ശ്രമിച്ചത്, കൂടുതല് സമയം കാത്തിരുന്നത് എന്നതിനെ ഒക്കെ വിലയിരുത്തി ആയിരിക്കും കമ്മറ്റി വാക്കോവർ അടക്കം ഉള്ള കര്യങ്ങൾ തീരുമാനിക്കുക.
                </NumberedRule>

                <NumberedRule number="12">
                    നിങ്ങളുടെ ടീമിനെ പ്രതിനിധീകരിച്ചു കളിക്കേണ്ട MATCH/PLAYER എന്തെങ്കിലും പ്രശ്നങ്ങളുണ്ടാവുന്ന സമയങ്ങളിൽ ടീമിനെ പ്രതിനിധീകരിച്ചു MARQUEE/OWNER ഗ്രൂപ്പിൽ ഉള്ള ആളുകൾ ആ വിഷയത്തെ കുറിച്ചു DEADLINE ന്റെ ഒരു മണിക്കൂർ മുമ്പ് എങ്കിലും പ്രതികരിച്ചില്ലങ്കിൽ ആ കളി എതിർ ടീമിന് +6 നൽകും.
                </NumberedRule>

                <NumberedRule number="14">
                    നെറ്റ്‌വർക്ക് മിസ്റ്റേക്ക് കാരണം മത്സരം കട്ട് ആവുകയാണെങ്കിൽ ബാക്കിയുള്ള സമയം സ്കോർ നില നിർത്തി റീ മാച്ച് +5 മിനിറ്റ്സ് കളിക്കേണ്ടതാണ്.
                </NumberedRule>

                <NumberedRule number="15">
                    വ്യക്തമായ കാരണവും PROOF ഉം ഇല്ലാതെ ഒരു MATCH 2 ഒ അതില് കൂടുതല് തവണ CUT ആക്കിയാല് എതിരാളിക്ക് +3 നൽകുന്നതായിരിക്കും
                </NumberedRule>

                <NumberedRule number="21">
                    <div className="bg-rose-50/60 border border-rose-200/60 p-4 rounded-xl flex gap-3 items-start w-full">
                        <span className="text-xl flex-shrink-0">🔴</span>
                        <div>
                            <span className="font-extrabold text-rose-800 text-[10px] uppercase tracking-wider block mb-1">RED CARD Rule</span>
                            <p className="text-xs sm:text-sm text-rose-950 leading-relaxed font-semibold">
                                DRAW/LOSE ആയ മാച്ച് റീമാച് ചെയ്യാൻ OPPONENT നു താൽപര്യം ഇല്ലങ്കിൽ, പിന്നെ REMATCH നു സഭ്യമല്ലാത്ത രീതിയിൽ നിർബന്ധിച്ച് വെല്ലുവിളിക്കുന്നവർക്ക് RED CARD തന്നെ നൽകുന്നതായിരിക്കും. RED CARD ലഭിക്കുന്ന കളിക്കാരന് അടുത്ത ഒരു കളിയിൽ വിലക്ക് വരുന്നതാണ്.
                            </p>
                        </div>
                    </div>
                </NumberedRule>
            </RuleSection>

            <RuleSection title="SUB Rule (Rule 18)" color="purple">
                <div className="bg-purple-50/40 p-4 sm:p-5 rounded-2xl border border-purple-100 space-y-4">
                    <h4 className="font-extrabold text-purple-900 uppercase tracking-wider text-xs sm:text-sm">2 തരം സബുകൾ ഉണ്ട്:</h4>

                    <div className="space-y-3 sm:space-y-4">
                        <div className="bg-white border border-slate-200/40 p-3 sm:p-4 rounded-xl shadow-sm">
                            <p className="font-extrabold text-purple-900 text-xs sm:text-sm uppercase tracking-wider mb-1.5">1. സബ് ഉള്ള കളിക്കാരൻ ഇറങ്ങാൻ ഉള്ള അവസരം</p>
                            <p className="text-xs sm:text-sm text-slate-600">ഇവിടെ +2 കൊടുത്ത് സബ് ഇറങ്ങാവുന്നതാണ്.</p>
                        </div>

                        <div className="bg-white border border-slate-200/40 p-3 sm:p-4 rounded-xl shadow-sm space-y-3">
                            <div>
                                <p className="font-extrabold text-purple-900 text-xs sm:text-sm uppercase tracking-wider mb-1.5">2. മാച്ച്ഡേയിൽ കളിച്ചു കൊണ്ടിരിക്കുന്ന താരത്തിനും സബ് ഇറങ്ങാം</p>
                                <p className="text-xs sm:text-sm text-slate-600">അങ്ങനെ ഉള്ള താരം കളിക്കാൻ ഇറങ്ങുമ്പോൾ ഏത് സബ്ബിനും അടിസ്ഥാനമായി (Base) +2 നൽകണം.</p>
                            </div>

                            <div className="bg-sky-50/60 border border-sky-100 p-3 rounded-xl flex gap-2 items-center">
                                <span className="text-xs font-black bg-slate-800 text-white px-2 py-0.5 rounded uppercase font-mono">Formula</span>
                                <span className="text-xs sm:text-sm font-extrabold text-sky-900 font-mono">Total Sub Cost = +2 (Base) + Position Difference</span>
                            </div>
                        </div>

                        <div className="bg-amber-50/60 border border-amber-200/40 p-3 sm:p-4 rounded-xl">
                            <p className="font-extrabold text-amber-900 text-xs sm:text-sm uppercase tracking-wider mb-2">ഉദാഹരണം:</p>
                            <ul className="text-xs sm:text-sm text-amber-900 space-y-1.5 font-semibold font-mono">
                                <li>• Rank 4 OUT, Rank 1 IN → Diff: 3 → Total: +2 + 3 = <strong>+5</strong></li>
                                <li>• Rank 5 OUT, Rank 3 IN → Diff: 2 → Total: +2 + 2 = <strong>+4</strong></li>
                                <li>• Rank 3 OUT, Rank 2 IN → Diff: 1 → Total: +2 + 1 = <strong>+3</strong></li>
                            </ul>
                        </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-purple-100 space-y-2 text-xs sm:text-sm text-purple-950 font-semibold leading-relaxed">
                        <p>⏰ <strong>ഹോം ടീമിന്:</strong> രാത്രി 9 മണി വരെ (ഡെഡ്‌ലൈന് 3 മണിക്കൂർ മുൻപ് വരെ) ലൈനപ്പിൽ സബ്സ്റ്റിറ്റ്യൂഷൻ വരുത്താം.</p>
                        <p>⏰ <strong>എവേ ടീമിന്:</strong> രാത്രി 9 മണിക്ക് മുൻപ് ലൈനപ്പിൽ സബ്സ്റ്റിറ്റ്യൂഷൻ ചെയ്യാം.</p>
                        <p>📩 <strong>മെസ്സേജ് സമയം:</strong> ലൈനപ്പ് സബ്സ്റ്റിറ്റ്യൂഷൻ ചെയ്ത പ്ലയറിന് മെസ്സേജ് അയക്കാനുള്ള അവസാന സമയം 9:10 ആണ്.</p>
                    </div>
                </div>
            </RuleSection>

            <RuleSection title="Other Important Rules" color="gray">
                <NumberedRule number="19">
                    (6 or 8 time) സമയം നിശ്ചയിക്കുന്ന സ്വാതന്ത്രം പൂർണമായും ഹോം ടീമിന് തന്നെ ആയിരിക്കും. പ്ലയറെ SWAP ചെയ്യാനുള്ള ഡെഡ് ലൈൻ സമയം IST 10:00PM ആയിരിക്കും.
                </NumberedRule>

                <NumberedRule number="20">
                    തുടർച്ചയായി 10 മിനിറ്റിൽ കൂടുതൽ സ്വന്തം ഹാഫിൽ പാസ്സിട്ടു കളിക്കുന്നത് ശ്രദ്ധയിൽ പെട്ടാൽ തെളിവു സഹിതം കമ്മിറ്റിയിൽ പരാതി ഉന്നയിച്ചാൽ കമ്മിറ്റി നടപടി എടുക്കും.
                </NumberedRule>

                <NumberedRule number="22">
                    ഏതെങ്കിലും പ്ലയറിന് മെഡിക്കൽ ഇഷ്യൂസോ മറ്റ് ജെനുവിൻ (Genuine) ആയ കാരണങ്ങളോ ഉണ്ടെങ്കിൽ, സാഹചര്യം വിലയിരുത്തി കമ്മിറ്റി എക്സ്റ്റൻഷൻ നൽകുന്നതാണ്.
                </NumberedRule>

                <NumberedRule number="23">
                    Extended Match ആണെങ്കിൽ, ഡെഡ്‌ലൈന് (Deadline) മുൻപായി 'Extended match' എന്ന് കൃത്യമായി രേഖപ്പെടുത്തി റിസൾട്ട് പോസ്റ്റ് ചെയ്യേണ്ടതാണ്.
                </NumberedRule>
            </RuleSection>

            <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-4 sm:p-6 mt-4 sm:mt-6 text-center">
                <span className="text-2xl mb-1.5 block">❌</span>
                <p className="text-rose-950 font-black text-sm sm:text-base uppercase tracking-wider">
                    തെളിവ് ഇല്ലാത്ത വാദങ്ങൾ കമ്മിറ്റി പരിഗണിക്കില്ല
                </p>
            </div>
        </div>
    );
}

function Part3Rules() {
    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="border-l-4 border-amber-500 pl-3 sm:pl-4 mb-2">
                <h2 className="text-base sm:text-lg font-black text-slate-800 uppercase tracking-wider">
                    🔰 ADDITIONAL RULES
                </h2>
            </div>

            <RuleSection title="▶️ Time Availability Rule" color="blue">
                <NumberedRule number="1">
                    ഫസ്റ്റ് മെസേജിന് 20 മണിക്കൂർ കഴിഞ്ഞും ഓപ്പണന്റിന്റെ റിപ്ലേ ഒന്നും ഇല്ലെങ്കിൽ മെസേജ് അയച്ച പ്ലെയറിന്/ടീമിന് +2+sub rule അഡ്വാന്റേജ് കൊടുക്കുന്നതായിരിക്കും.
                </NumberedRule>

                <NumberedRule number="2">
                    ഡെഡ്ലൈനിന് മുന്നേ മാച്ച് കളിച്ചില്ലെങ്കിൽ, സമയം പോലും ഫിക്സ് ചെയ്തില്ല എങ്കിൽ കൂടുതൽ അവൈലബിൾ ആയിട്ടുള്ള പ്ലെയറിന്റെ ഓപ്പണന്റ് ടീം സബ് ഇറക്കി കളിപ്പിക്കേണ്ടതാണ്.
                </NumberedRule>
            </RuleSection>

            <RuleSection title="▶️ Claim ആക്കാൻ പാലിക്കേണ്ട വിധം" color="green">
                <div className="bg-emerald-50/40 p-4 sm:p-5 rounded-2xl border border-emerald-100 space-y-4">
                    <p className="text-emerald-950 font-semibold text-xs sm:text-sm">
                        ഹോം ടീം ഫിക്സ്ചർ ഇട്ട് കഴിഞ്ഞാൽ 9 മണിക്കൂ മുമ്പ് തന്നെ 2 ടീമിലെയും പ്ലെയേഴ്സ് പരസ്പരം മാച്ച് ടൈം ഫിക്സ് ചെയ്യുന്നതിനുള്ള മാച്ച് ഇൻവിറ്റേഷൻ മെസ്സേജ് അയക്കാൻ ശ്രദ്ധിക്കുക.
                    </p>

                    <div className="bg-white border border-slate-200/40 p-3.5 rounded-xl shadow-sm space-y-2">
                        <p className="font-extrabold text-emerald-900 text-xs sm:text-sm uppercase tracking-wider">മാച്ച് ഇൻവിറ്റേഷൻ മെസ്സേജ് Format:</p>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-xs sm:text-sm text-slate-700 leading-relaxed">
                            Hi Bro<br />
                            SS Match ഉണ്ട്<br />
                            ഞാൻ evening 03.00 PM തൊട്ട് 09.00 PM വരെ അവൈലബിൾ ആയിരിക്കുകയുള്ളൂ.
                        </div>
                    </div>

                    <div className="space-y-2 text-xs sm:text-sm text-emerald-900 font-semibold font-sans">
                        <p>✅ മാച്ച് ഇൻവിറ്റേഷൻ മെസ്സേജിൽ സൗത്ത് സോക്കേർസ് ടൂർണമെന്റ് ആണെന്നും മെൻഷൻ ചെയ്യണം</p>
                        <p>✅ മെസ്സേജ് അയയ്ക്കുന്ന ആളുടെ അവൈലബിലിറ്റി സമയം കൃത്യമായി മെൻഷൻ ചെയ്യണം</p>
                        <p>✅ നിങ്ങളുടെ ടീമിനെ സംബന്ധിച്ചുള്ള ഏതൊരു ഇഷ്യൂ ഉം ഓപ്പണന്റ് ടീം Cap/Manager ആയി സംസാരിച്ച് പരിഹരിക്കാൻ ശ്രമിക്കുക</p>
                    </div>
                </div>
            </RuleSection>

            <RuleSection title="▶️ NO REPLAY AFTER MESSAGE SEEING" color="amber">
                <div className="bg-amber-50/40 p-4 sm:p-5 rounded-2xl border border-amber-100 space-y-3">
                    <p className="text-amber-955 font-semibold text-xs sm:text-sm">
                        ലീഗ് റൂളിൽ പറഞ്ഞ പ്രകാരമുള്ള മാച്ച് ഇൻവിറ്റേഷൻ കാര്യങ്ങളിൽ ഓപ്പണന്റ് ന്റെ ഭാഗത്ത് നിന്നും മെസ്സേജ് സീൻ ആക്കിയിട്ട് മറുപടി ഒന്നും ഇല്ലെങ്കിൽ:
                    </p>
                    <div className="space-y-2.5 font-sans">
                        <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-amber-200/50">
                            <span className="text-xl">🟨</span>
                            <p className="text-amber-900 text-xs sm:text-sm font-semibold">സെയിം മാച്ച്ഡേ തന്നെ റൂൾ violate ചെയ്ത പ്ലെയറിന് YELLOW കാർഡ്</p>
                        </div>
                        <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-amber-200/50">
                            <span className="text-xl">🟥</span>
                            <p className="text-amber-900 text-xs sm:text-sm font-semibold">ആവർത്തിക്കുന്നത് RED (2 YELLOW) കാർഡും മാച്ച് ബാൻ</p>
                        </div>
                    </div>
                </div>
            </RuleSection>

            <RuleSection title="▶️ CUSTOM FORMATION RULE" color="purple">
                <div className="bg-purple-50/40 p-4 sm:p-5 rounded-2xl border border-purple-100 space-y-3.5">
                    <p className="text-purple-955 text-xs sm:text-sm font-semibold">
                        ഓപ്പണന്റ് അയച്ച് തരുന്ന മാച്ച് റൂമിൽ കയറിയതിന് ശേഷം കാണുന്ന വിൻഡോയിലെ (സ്ക്രീനിലെ) ഗെയിം പ്ലാനിൽ മാത്രമേ നിങ്ങൾക്ക് ഫോർമേഷൻ കസ്റ്റം ചെയ്യാൻ പറ്റുകയുള്ളൂ.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-rose-50/60 border border-rose-200/60 p-3.5 rounded-xl font-sans">
                            <span className="font-extrabold text-rose-800 text-[10px] uppercase tracking-wider block mb-1.5">❌ പാടില്ലാത്തത്:</span>
                            <ul className="text-xs text-rose-900 space-y-1.5 font-semibold">
                                <li>• TO MATCH എന്ന ഓപ്ഷൻ കൊടുത്ത് MATCH CONNECT ആയതിനു ശേഷം</li>
                                <li>• മാച്ചിനിടയ്ക്കുള്ള PAUSE/HALF TIME കളിൽ</li>
                            </ul>
                        </div>

                        <div className="bg-emerald-50/60 border border-emerald-200/60 p-3.5 rounded-xl font-sans">
                            <span className="font-extrabold text-emerald-800 text-[10px] uppercase tracking-wider block mb-1.5">✅ അനുവദനീയം:</span>
                            <p className="text-xs text-emerald-900 font-semibold leading-relaxed">INBUILD or DEFAULT ഫോർമേഷനുകൾ ഉപയോഗിക്കാവുന്നതാണ്.</p>
                        </div>
                    </div>

                    <div className="bg-amber-50/60 border border-amber-200/60 p-3.5 rounded-xl">
                        <span className="font-extrabold text-amber-800 text-[10px] uppercase tracking-wider block mb-1.5">⚠️ Penalty:</span>
                        <p className="text-xs text-amber-900 font-semibold">
                            മാച്ചിന് ഇടയിൽ ഫോർമേഷൻ custom ചെയ്‌താൽ എതിർ ടീമിന് +3 advantage നൽകുന്നതാണ്.
                        </p>
                    </div>
                </div>
            </RuleSection>

            <RuleSection title="▶️ 🆘 ഇഷ്യൂ കാർഡ്" color="red">
                <div className="bg-rose-50/40 p-4 sm:p-5 rounded-2xl border border-rose-100 space-y-2">
                    <p className="text-rose-955 font-semibold text-xs sm:text-sm">
                        ഓപ്പണന്റ് cap/manager ആയി സംസാരിച്ചു പരിഹാരം ആവാത്ത കാര്യങ്ങൾക്ക് മാത്രം കമ്മിറ്റിയിലെ പ്രോബ്ലം സോൾവിങ് മെംബേഴ്സിനെ മെൻഷൻ ചെയ്ത് ഇഷ്യൂ കാർഡ് ഉപയോഗിക്കുക.
                    </p>
                    <p className="text-rose-900 font-bold text-xs">
                        ⚠️ അനാവിശ്യമായി ഇഷ്യൂ കാർഡ് റിപ്പോർട്ട് ചെയ്യാതിരിക്കുക.
                    </p>
                </div>
            </RuleSection>

            <div className="console-card bg-slate-900 border border-slate-950 text-white rounded-2xl p-5 sm:p-6 md:p-8 mt-6 sm:mt-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
                <h3 className="text-lg sm:text-xl font-black text-rose-400 mb-3 text-center uppercase tracking-wider flex items-center justify-center gap-2">
                    <span>🛑</span> MOST IMPORTANT <span>🛑</span>
                </h3>
                <p className="text-rose-200 text-center mb-4 text-xs sm:text-sm font-bold leading-relaxed">
                    കളി അവസാനിച്ച ശേഷം എതിരാളിയോട് രീതിയിൽ ഉള്ള മോശമായ പെരുമാറ്റം നിങ്ങളുടെ ഭാഗത്ത് നിന്നുണ്ടായാൽ കടുത്ത നടപടി തന്നെ എടുക്കുന്നത് ആയിരിക്കും.
                </p>
                <p className="text-slate-400 text-center text-xs sm:text-sm leading-relaxed font-sans">
                    ഇതൊരു എൻ്റർടൈൻമെൻ്റ് ലീഗ് ആണെന്നുന്നുള്ള കാര്യവും അതിലുപരി നമുക്കിដയിൽ പരസ്പര സൗഹൃദം ലക്ഷ്യമാക്കി ഉള്ള കൂട്ടായ്മ ആണെന്നും മനസ്സിലാക്കി ലീഗിനെ നല്ല രീതിയിൽ മുന്നോട്ട് കൊണ്ട് പോകാൻ എല്ലാവരും പരമാവധി സഹകരിക്കണം
                </p>
            </div>

            <div className="bg-sky-50/50 border border-sky-100 rounded-2xl p-4 sm:p-5 mt-4 sm:mt-6 space-y-3 shadow-inner">
                <h4 className="font-extrabold text-sky-955 uppercase tracking-wider text-xs sm:text-sm">💠 Final Notes:</h4>
                <ul className="space-y-2 text-xs sm:text-sm text-sky-900 font-semibold font-sans">
                    <li>• റൂളിൽ പരാമർശിക്കാത്ത ഇഷ്യൂസ് വന്നാൽ കമ്മറ്റി ചർച്ച ചെയ്തു തീരുമാനം അറിയിക്കും</li>
                    <li>• കമ്മറ്റിയുടെ ഈ തീരുമാനം അന്തിമമായിരിക്കും</li>
                    <li>• കമ്മറ്റി അംഗങ്ങൾ ഉൾപ്പെടുന്ന ടീമുകളുടെ പ്രശ്നത്തിൽ കമ്മറ്റി അംഗം എന്ന നിലയിൽ ആ ടീമിലെ കമ്മറ്റി അംഗത്തിന് ഇടപെടാൻ സാധിക്കില്ല</li>
                </ul>
            </div>
        </div>
    );
}

// Helper Components
function RuleSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
    const borderColors = {
        blue: 'border-l-4 border-l-sky-500',
        indigo: 'border-l-4 border-l-indigo-500',
        green: 'border-l-4 border-l-emerald-500',
        purple: 'border-l-4 border-l-purple-500',
        red: 'border-l-4 border-l-rose-500',
        amber: 'border-l-4 border-l-amber-500',
        gray: 'border-l-4 border-l-slate-500',
    };

    const bgColors = {
        blue: 'bg-sky-50/30',
        indigo: 'bg-indigo-50/30',
        green: 'bg-emerald-50/30',
        purple: 'bg-purple-50/30',
        red: 'bg-rose-50/30',
        amber: 'bg-amber-50/30',
        gray: 'bg-slate-50/30',
    };

    const textColors = {
        blue: 'text-slate-800',
        indigo: 'text-slate-800',
        green: 'text-slate-800',
        purple: 'text-slate-800',
        red: 'text-slate-800',
        amber: 'text-slate-800',
        gray: 'text-slate-800',
    };

    return (
        <div className={`rounded-2xl border border-slate-200/60 overflow-hidden ${borderColors[color as keyof typeof borderColors] || borderColors.blue}`}>
            <div className={`px-4 py-3 border-b border-slate-100 font-extrabold text-xs sm:text-sm uppercase tracking-wider ${bgColors[color as keyof typeof bgColors] || bgColors.blue} ${textColors[color as keyof typeof textColors] || textColors.blue}`}>
                {title}
            </div>
            <div className="p-4 sm:p-5 space-y-3.5 bg-white">
                {children}
            </div>
        </div>
    );
}

function RuleItem({ icon, title, children }: { icon: string; title?: string; children: React.ReactNode }) {
    return (
        <div className="flex gap-3 items-start bg-slate-50/50 hover:bg-slate-50/80 p-3 rounded-xl border border-slate-100/50 transition-all duration-200">
            <span className="text-base flex-shrink-0 w-7 h-7 rounded-lg bg-white shadow-sm border border-slate-100 flex items-center justify-center">
                {icon}
            </span>
            <div className="flex-1 min-w-0">
                {title && <p className="font-extrabold text-slate-800 text-xs sm:text-sm uppercase tracking-wider mb-1">{title}</p>}
                <div className="text-slate-650 text-xs sm:text-sm leading-relaxed">{children}</div>
            </div>
        </div>
    );
}

function NumberedRule({ number, children }: { number: string; children: React.ReactNode }) {
    return (
        <div className="flex gap-3 items-start bg-slate-50/50 hover:bg-slate-50/80 p-3.5 rounded-xl border border-slate-100/80 transition-all duration-200">
            <div className="flex-shrink-0">
                <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-900 text-amber-400 flex items-center justify-center font-black text-xs sm:text-sm shadow-md">
                    {number}
                </div>
            </div>
            <div className="flex-1 text-slate-600 text-xs sm:text-sm leading-relaxed pt-1">{children}</div>
        </div>
    );
}
