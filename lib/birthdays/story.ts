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
export function generateFallbackBirthdayStory(ctx: PlayerBirthdayContext): BirthdayStoryResult {
  const { name, age, team, stats, seasonsCount } = ctx;
  const winRate = stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 50;

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
    `Scouting Bulletin: ${name} Turns ${age} as SS League Celebrates a Pillar of the Franchise`,
    `Milestone Day: ${name} Marks Year ${age} with ${stats.goals} Goals and Unmatched Dedication`,
    `Matchday Dispatch: ${name} Celebrates Birthday Milestone Amid Career Tournament Run`,
  ];

  const subtitles = [
    `The ${team} stalwart celebrates another year of competitive consistency and locker-room leadership.`,
    `Teammates and rivals across the circuit unite to salute one of the league's most respected competitors.`,
    `From late-game winners to clutch defensive stops, revisiting a remarkable tournament journey.`,
  ];

  const headline = headlines[Math.floor(Math.random() * headlines.length)];
  const subtitle = subtitles[Math.floor(Math.random() * subtitles.length)];

  const roastParagraph = `Today the SS Premier Super League family marks a special occasion as ${name} officially turns ${age}. ${goalQuirk} ${matchQuirk}`;

  const tacticalReport = `Tournament analytics confirm the numbers behind the competitor: ${stats.matches} career appearances, ${stats.goals} goals converted, and ${stats.wins} victories etched into franchise records. ${defenseQuirk}`;

  const lockerRoomRumor = `Inside reports from the ${team} camp allege that today's training drills have been replaced with cake cutting, although teammates maintain ${name} will still try to contest Man of the Match honors for extinguishing the candles in record time.`;

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
export async function generateGeminiBirthdayStory(ctx: PlayerBirthdayContext): Promise<BirthdayStoryResult> {
  const { name, age, team, category, stats, seasonsCount } = ctx;

  const prompt = `
You are a senior sports editor for the SS Premier Super League, an eFootball console tournament community in Kerala/India.
Write an authentic, witty, and warm birthday news feature for player: ${name}.

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
1. Write like a real, witty human sports journalist—NOT an AI bot. Avoid clichés like "In the thrilling realm of", "As another year dawns", "A force to be reckoned with".
2. ZERO emojis anywhere in the text.
3. ABSOLUTELY NO insulting, hurtful, demeaning, or body-shaming comments. Keep banter affectionate, witty, and locker-room friendly (e.g. controller sprint buttons, cake drills, goal celebrations).
4. Integrate their real statistics naturally.

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

    return {
      headline: parsed.headline || `${name} Marks Year ${age} in SS League Style`,
      subtitle: parsed.subtitle || `Celebrating another competitive campaign on the tournament circuit.`,
      roastParagraph: parsed.roastParagraph || '',
      tacticalReport: parsed.tacticalReport || '',
      lockerRoomRumor: parsed.lockerRoomRumor || '',
      birthdayWish: parsed.birthdayWish || `Happy Birthday to ${name} from the entire SS League community.`,
      isAiGenerated: true,
    };
  } catch (error) {
    console.warn('Gemini story fallback triggered:', error);
    return generateFallbackBirthdayStory(ctx);
  }
}
