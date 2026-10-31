import { generateWithFallback } from '../gemini/config';

export interface PlayerBirthdayContext {
  id: string;
  name: string;
  dob: string;
  age: number;
  team: string;
  category: string;
  stats: {
    matches: number;
    goals: number;
    goals_conceded: number;
    wins: number;
    draws: number;
    losses: number;
    clean_sheets: number;
    motm_awards: number;
    points: number;
  };
  awards?: any[];
  seasonsCount: number;
}

export interface BirthdayStoryResult {
  headline: string;
  subtitle: string;
  roastParagraph: string;
  tacticalReport: string;
  lockerRoomRumor: string;
  birthdayWish: string;
  isAiGenerated: boolean;
}

/**
 * Clean, human-written sports chronicle generator (instant fallback)
 */
export function generateFallbackBirthdayStory(ctx: PlayerBirthdayContext, lang: 'en' | 'ml' = 'en'): BirthdayStoryResult {
  const { name, age, team, stats, seasonsCount } = ctx;
  const winRate = stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 50;

  const hasTeam = Boolean(team && team.trim() && !['unknown', 'free agent', 'none', 'n/a', 'na'].includes(team.trim().toLowerCase()));
  const teamLabel = hasTeam ? team.trim() : '';

  if (lang === 'ml') {
    let goalQuirk = '';
    if (stats.goals >= 50) {
      goalQuirk = `കരിയറിൽ ${stats.goals} ഗോളുകൾ അടിച്ചുകൂട്ടിയ ഇദ്ദേഹത്തിന്റെ ബർത്ത്ഡേ കേക്ക് സ്പോൺസർ ചെയ്യാൻ എതിർ ടീം ഗോൾകീപ്പർമാർ റെഡിയാണ്, ഒരൊറ്റ കണ്ടീഷൻ മാത്രം: ഇന്നത്തെ മത്സരങ്ങളിൽ നിന്ന് ലീവെടുക്കണം!`;
    } else if (stats.goals > 15) {
      goalQuirk = `ടൂർണമെന്റിൽ ${stats.goals} തവണ എതിർവല കുലുക്കിയ ഇദ്ദേഹത്തിന് ഇന്ന് ജന്മദിനത്തിൽ റെസ്റ്റ് കൊടുക്കണമെന്ന് എതിർ പ്രതിരോധനിരക്കാർ കമ്മിറ്റിയോട് അപേക്ഷിക്കുന്നുണ്ട്.`;
    } else {
      goalQuirk = `വെറും ഗോളുകളേക്കാൾ കളി നിയന്ത്രിക്കാനും ടീമിനെ മുന്നിൽ നിന്ന് നയിക്കാനുമാണ് ${name} കൂടുതൽ പ്രാധാന്യം നൽകുന്നത്.`;
    }

    let defenseQuirk = '';
    if (stats.clean_sheets >= 5) {
      defenseQuirk = `${stats.clean_sheets} ക്ലീൻ ഷീറ്റുകൾ സാക്ഷ്യം വഹിക്കുന്നു — ഇദ്ദേഹം ഫോമിലായാൽ ഡിഫൻസ് ഭേദിക്കുക അസാധ്യമാണ്.`;
    } else {
      defenseQuirk = `പൂർണ്ണ ഊർജ്ജത്തോടെ ആക്രമിച്ചു കളിക്കുക, സ്കോർബോർഡ് തനിയെ സംസാരിച്ചോളും എന്നതാണ് ഇദ്ദേഹത്തിന്റെ ശൈലി.`;
    }

    let matchQuirk = '';
    if (stats.matches > 30) {
      matchQuirk = `${seasonsCount} സീസണുകളിലായി കളിച്ച ${stats.matches} പോരാട്ടങ്ങൾ കൊണ്ട് കൺട്രോളറിലെ ബട്ടണുകൾ പോലും തേഞ്ഞുപോയ അവസ്ഥയിലാണ്!`;
    } else {
      matchQuirk = `${stats.matches} മത്സരങ്ങളിൽ ${winRate}% വിജയനിരക്കുമായി ഒരോ പോയിന്റിനും അവസാന സെക്കൻഡ് വരെ പൊരുതുന്ന കളിക്കാരൻ.`;
    }

    return {
      headline: `ഹാപ്പി ബർത്ത്ഡേ ${name}! എസ്എസ് ലീഗിന്റെ കരുത്തനായ പോരാളിക്ക് ഇന്ന് ജന്മദിനം`,
      subtitle: hasTeam
        ? `${teamLabel} ടീമിന്റെ വിശ്വസ്ത താരത്തിന് ${age}-ാം പിറന്നാൾ ആശംസകളുമായി ടൂർണമെന്റ് കുടുംബം.`
        : `എസ്എസ് ലീഗിന്റെ കരുത്തനായ പോരാളിക്ക് ${age}-ാം പിറന്നാൾ ആശംസകളുമായി ടൂർണമെന്റ് കുടുംബം.`,
      roastParagraph: `ഇന്ന് എസ്എസ് പ്രീമിയർ സൂപ്പർ ലീഗ് കുടുംബം ആഘോഷമാക്കുകയാണ്; നമ്മുടെ പ്രിയ താരം ${name} ഔദ്യോഗികമായി ${age}-ാം വയസ്സിലേക്ക് കടക്കുന്നു. ${goalQuirk} ${matchQuirk}`,
      tacticalReport: `ടൂർണമെന്റ് കണക്കുകൾ പരിശോധിച്ചാൽ: ${stats.matches} കരിയർ മത്സരങ്ങൾ, ${stats.goals} കണ്ണഞ്ചിപ്പിക്കുന്ന ഗോളുകൾ, ഒപ്പം ${stats.wins} നിർണ്ണായക വിജയങ്ങൾ. ${defenseQuirk}`,
      lockerRoomRumor: hasTeam
        ? `${teamLabel} ക്യാമ്പിൽ നിന്നുള്ള റിപ്പോർട്ട് പ്രകാരം ഇന്നത്തെ പ്രാക്ടീസ് സെഷൻ കേക്ക് മുറിക്കലായി മാറിയിട്ടുണ്ട്. എങ്കിലും മെഴുകുതിരി കെടുത്തുന്നതിലും മാൻ ഓഫ് ദി മാച്ച് നേടാനാണ് ${name} നോക്കുന്നതെന്നാണ് സഹതാരങ്ങൾ പറയുന്നത്.`
        : `ടൂർണമെന്റ് ക്യാമ്പിൽ നിന്നുള്ള റിപ്പോർട്ട് പ്രകാരം ഇന്നത്തെ പ്രാക്ടീസ് സെഷൻ കേക്ക് മുറിക്കലായി മാറിയിട്ടുണ്ട്. എങ്കിലും മെഴുകുതിരി കെടുത്തുന്നതിലും മാൻ ഓഫ് ദി മാച്ച് നേടാനാണ് ${name} നോക്കുന്നതെന്നാണ് സഹതാരങ്ങൾ പറയുന്നത്.`,
      birthdayWish: `എസ്എസ് ലീഗ് മാനേജ്‌മെന്റിന്റെയും സഹതാരങ്ങളുടെയും മുഴുവൻ ആരാധകരുടെയും പേരിൽ ${name}ന് ഹൃദയം നിറഞ്ഞ ജന്മദിനാശംസകൾ. വരും മത്സരങ്ങളിലും വമ്പൻ വിജയങ്ങളും മാന്ത്രിക ഗോളുകളും നേടാൻ കഴിയട്ടെ!`,
      isAiGenerated: false,
    };
  }

  let goalQuirk = '';
  if (stats.goals >= 50) {
    goalQuirk = `With ${stats.goals} career goals on record, rival goalkeepers reportedly offered to sponsor his birthday cake under the sole condition that he takes match night off.`;
  } else if (stats.goals > 15) {
    goalQuirk = `Having found the net ${stats.goals} times in league history, opposition backlines are currently lobbying the committee to make birthdays an automatic suspension.`;
  } else {
    goalQuirk = `While other players obsess over goal tallies, ${name} focuses on orchestrating play, winning duels, and commanding the pitch.`;
  }

  let defenseQuirk = '';
  if (stats.clean_sheets >= 5) {
    defenseQuirk = `His ${stats.clean_sheets} clean sheets prove that when he locks in defensively, breaking through is harder than negotiating an unassigned transfer window.`;
  } else {
    defenseQuirk = `His philosophy remains straightforward: when in doubt, attack with full intensity and let the scoreboard sort out the rest.`;
  }

  let matchQuirk = '';
  if (stats.matches > 30) {
    matchQuirk = `Across ${stats.matches} battles spanning ${seasonsCount} tournament campaigns, his game controller has officially logged more flight hours than a regional airline pilot.`;
  } else {
    matchQuirk = `Holding a ${winRate}% win rate across ${stats.matches} matches, every single three points on his record was fought for until the final second.`;
  }

  const headlines = [
    `Scouting Bulletin: ${name} Turns ${age} as SS League Celebrates a Pillar of the Circuit`,
    `Milestone Day: ${name} Marks Year ${age} with ${stats.goals} Goals and Unmatched Dedication`,
    `Matchday Dispatch: ${name} Celebrates Birthday Milestone Amid Career Tournament Run`,
  ];

  const subtitles = [
    hasTeam
      ? `The ${teamLabel} stalwart celebrates another year of competitive consistency and leadership.`
      : `The esteemed tournament competitor celebrates another year of competitive consistency and leadership.`,
    `Teammates and rivals across the circuit unite to salute one of the league's most respected competitors.`,
    `From late-game winners to clutch defensive stops, revisiting a remarkable tournament journey.`,
  ];

  const headline = headlines[Math.floor(Math.random() * headlines.length)];
  const subtitle = subtitles[Math.floor(Math.random() * subtitles.length)];

  const roastParagraph = `Today the SS Premier Super League family marks a special occasion as ${name} officially turns ${age}. ${goalQuirk} ${matchQuirk}`;

  const tacticalReport = `Tournament analytics confirm the numbers behind the competitor: ${stats.matches} career appearances, ${stats.goals} goals converted, and ${stats.wins} victories etched into franchise records. ${defenseQuirk}`;

  const lockerRoomRumor = hasTeam
    ? `Inside reports from the ${teamLabel} camp allege that today's training drills have been replaced with cake cutting, although teammates maintain ${name} will still try to contest Man of the Match honors for extinguishing the candles in record time.`
    : `Inside reports from around the league allege that today's training drills have been replaced with cake cutting, although friends maintain ${name} will still try to contest Man of the Match honors for extinguishing the candles in record time.`;

  const birthdayWish = `Warmest congratulations and best wishes from the SS League management, team captains, and player roster. May the year ahead bring continued success, clinical finishing, and memorable victories both on and off the field. Happy Birthday, ${name}.`;

  return {
    headline,
    subtitle,
    roastParagraph,
    tacticalReport,
    lockerRoomRumor,
    birthdayWish,
    isAiGenerated: false,
  };
}

/**
 * Dynamic sports chronicle generation via Gemini 2.5 Flash
 */
export async function generateGeminiBirthdayStory(ctx: PlayerBirthdayContext, lang: 'en' | 'ml' = 'en'): Promise<BirthdayStoryResult> {
  const { name, age, team, category, stats, seasonsCount } = ctx;

  const prompt = lang === 'ml'
    ? `
You are a senior sports editor for the SS Premier Super League, an eFootball console tournament community in Kerala, India.
Write an authentic, witty, warm, and highly engaging birthday news feature in MALAYALAM (മലയാളത്തിൽ) for the player: ${name}.

PLAYER DATA:
- Name: ${name}
- Age: ${age}
- Team: ${team}
- Category: ${category}
- Matches: ${stats.matches}
- Goals: ${stats.goals}
- Conceded: ${stats.goals_conceded}
- Wins: ${stats.wins} (Draws: ${stats.draws}, Losses: ${stats.losses})
- Clean Sheets: ${stats.clean_sheets}
- MOTM Awards: ${stats.motm_awards}
- Seasons: ${seasonsCount}

EDITORIAL GUIDELINES:
1. Write in natural, stylish, authentic Malayalam used in Kerala sports journalism and friendly football locker-room banter (മനോഹരമായ മലയാളം, നല്ല തമാശയും സ്നേഹവും ഉള്ള ശൈലി).
2. ZERO emojis anywhere in the text.
3. ABSOLUTELY NO insulting, hurtful, demeaning, or body-shaming comments. Keep banter affectionate, witty, and locker-room friendly (e.g. കൺട്രോളറിലെ സ്പ്രിന്റ് ബട്ടൺ, ബോക്സിന് വെളിയിൽ നിന്നുള്ള വെടിക്കെട്ട് ഗോൾ, കേക്ക് കട്ടിംഗ് പ്രാക്ടീസ്, തുടങ്ങിയ കാര്യങ്ങൾ).
4. Integrate their real statistics naturally (${stats.matches} മത്സരങ്ങൾ, ${stats.goals} ഗോളുകൾ, ${stats.wins} വിജയങ്ങൾ).

Return ONLY pure valid JSON (no markdown fences, no backticks):
{
  "headline": "Stylish sports headline in Malayalam",
  "subtitle": "Professional 1-sentence sub-headline in Malayalam",
  "roastParagraph": "2-3 sentences of clever, affectionate banter in Malayalam about age and gaming habits",
  "tacticalReport": "2-3 sentences in Malayalam analyzing tournament metrics with humor and respect",
  "lockerRoomRumor": "1-2 sentences in Malayalam of fun team camp humor",
  "birthdayWish": "2 sentences in Malayalam of sincere congratulations from the SS League management and community"
}
`
    : `
You are a senior sports editor for the SS Premier Super League, an eFootball console tournament community in Kerala/India.
Write an authentic, witty, and warm birthday news feature for player: ${name}.

PLAYER DATA:
- Name: ${name}
- Age: ${age}
- Team: ${team || 'None (Currently unassigned in active campaign)'}
- Category: ${category || 'None (Unrated)'}
- Matches: ${stats.matches}
- Goals: ${stats.goals}
- Conceded: ${stats.goals_conceded}
- Wins: ${stats.wins} (Draws: ${stats.draws}, Losses: ${stats.losses})
- Clean Sheets: ${stats.clean_sheets}
- MOTM Awards: ${stats.motm_awards}
- Seasons: ${seasonsCount}

EDITORIAL GUIDELINES:
1. Write like a real, witty human sports journalist—NOT an AI bot. Avoid clichés like "In the thrilling realm of", "As another year dawns", "A force to be reckoned with".
2. ZERO emojis anywhere in the text.
3. ABSOLUTELY NO insulting, hurtful, demeaning, or body-shaming comments. Keep banter affectionate, witty, and locker-room friendly (e.g. controller sprint buttons, cake drills, goal celebrations).
4. Integrate their real statistics naturally.
5. If Team is None/unassigned, do NOT invent or attribute any franchise to the player. Refer to them as an esteemed league player or tournament competitor.

Return ONLY pure valid JSON (no markdown fences, no backticks):
{
  "headline": "Authentic sports headline in title case",
  "subtitle": "Professional 1-sentence sub-headline",
  "roastParagraph": "2-3 sentences of clever, affectionate banter about their age and gaming habits",
  "tacticalReport": "2-3 sentences analyzing their actual tournament metrics with humor",
  "lockerRoomRumor": "1-2 sentences of fun team camp humor",
  "birthdayWish": "2 sentences of sincere congratulations from the SS League management and community"
}
`;

  try {
    const rawResponse = await generateWithFallback(prompt);
    const cleaned = rawResponse
      .replace(/```json\s*/gi, '')
      .replace(/```\s*$/gi, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    const defaultHeadline = lang === 'ml'
      ? `ഹാപ്പി ബർത്ത്ഡേ ${name}! എസ്എസ് ലീഗിലെ പോരാളിക്ക് ഇന്ന് പിറന്നാൾ`
      : `${name} Marks Year ${age} in SS League Style`;

    const defaultSubtitle = lang === 'ml'
      ? `ടൂർണമെന്റ് സർക്യൂട്ടിലെ മറ്റൊരു വിജയകരമായ വർഷം ആഘോഷിക്കുന്നു.`
      : `Celebrating another competitive campaign on the tournament circuit.`;

    const defaultWish = lang === 'ml'
      ? `മുഴുവൻ എസ്എസ് ലീഗ് കുടുംബത്തിന്റെയും പേരിൽ ${name}ന് ഹൃദയം നിറഞ്ഞ ജന്മദിനാശംസകൾ.`
      : `Happy Birthday to ${name} from the entire SS League community.`;

    return {
      headline: parsed.headline || defaultHeadline,
      subtitle: parsed.subtitle || defaultSubtitle,
      roastParagraph: parsed.roastParagraph || '',
      tacticalReport: parsed.tacticalReport || '',
      lockerRoomRumor: parsed.lockerRoomRumor || '',
      birthdayWish: parsed.birthdayWish || defaultWish,
      isAiGenerated: true,
    };
  } catch (error) {
    console.warn('Gemini story fallback triggered:', error);
    return generateFallbackBirthdayStory(ctx, lang);
  }
}
