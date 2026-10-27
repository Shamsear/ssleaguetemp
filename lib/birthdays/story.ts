import { generateWithFallback } from '@/lib/gemini/config';

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
 * High-quality fallback template generator (instant, humorous, safe & respectful)
 */
export function generateFallbackBirthdayStory(ctx: PlayerBirthdayContext): BirthdayStoryResult {
  const { name, age, team, stats, seasonsCount } = ctx;
  const winRate = stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 50;

  // Tailored jokes based on stats
  let goalQuirk = '';
  if (stats.goals >= 50) {
    goalQuirk = `With a staggering ${stats.goals} career goals under his belt, opposition goalkeepers are reportedly pitching in to buy him the biggest birthday cake in town—strictly on the condition that he takes game night off.`;
  } else if (stats.goals > 15) {
    goalQuirk = `Having rattled the net ${stats.goals} times in SS League history, opposition defenses are currently drafting emergency petitions to make birthdays an official league rest day.`;
  } else {
    goalQuirk = `While other players count goals, ${name} counts pure tactical brilliance, game-management, and sheer intimidation factor every time he steps onto the pitch.`;
  }

  let defenseQuirk = '';
  if (stats.clean_sheets >= 3) {
    defenseQuirk = `Locker-room insiders confirm his ${stats.clean_sheets} clean sheets were achieved through a revolutionary combination of tactical genius and shouting 'STAY BACK!' louder than anyone else in the voice chat.`;
  } else {
    defenseQuirk = `He believes that the best defense is simply scoring more than the other guy—a philosophy that has provided fans with maximum entertainment and guaranteed heart-rate spikes.`;
  }

  let controllerQuirk = '';
  if (stats.matches > 30) {
    controllerQuirk = `After ${stats.matches} grueling matches across ${seasonsCount} seasons, sources close to the player reveal his controller's sprint trigger has officially filed for union protection.`;
  } else {
    controllerQuirk = `With a ${winRate}% win rate across ${stats.matches} battles, every point earned was celebrated with the intensity of a Champions League final whistle.`;
  }

  const headlines = [
    `OFFICIAL SCOUTING ALERT: ${name} Turns ${age} — Opposing Defenders Advised to Bring Birthday Cake, Not Tackles!`,
    `BREAKING NEWS: SS League Sensation ${name} Celebrates Birthday Milestone with ${stats.goals} Career Goals and Zero Apologies!`,
    `SPECIAL BULLETIN: ${name} Levels Up to ${age} Years Old — Controller Battery Reportedly at 100%!`,
  ];

  const subtitles = [
    `The ${team} star marks another trip around the sun while continuing to leave his mark on the SS League turf.`,
    `Teammates, rivals, and tournament spectators unite to salute one of the league's most dedicated gladiators.`,
    `From dramatic late winners to clutch defensive stops, celebrating a true SS League stalwart.`,
  ];

  const headline = headlines[Math.floor(Math.random() * headlines.length)];
  const subtitle = subtitles[Math.floor(Math.random() * subtitles.length)];

  const roastParagraph = `Today, the entire SS Premier Super League family halts play, turns down the stadium music, and sounds the vuvuzelas for ${name}, who officially turns ${age}! ${goalQuirk} ${controllerQuirk}`;

  const tacticalReport = `According to our advanced scouting analytics, ${name}'s stats speak for themselves: ${stats.matches} career appearances, ${stats.goals} goals converted, and ${stats.wins} victories etched into tournament folklore. ${defenseQuirk}`;

  const lockerRoomRumor = `Inside reports from the ${team} camp allege that today's training session has been replaced with tactical cake-eating drills, though teammates insist ${name} will still try to claim Man of the Match honors for blowing out all the candles in a single breath.`;

  const birthdayWish = `Jokes aside, huge congratulations and warmest birthday wishes from the entire SS League committee, teammates, and competitive community! May your year ahead be packed with top-corner screamers, clean sheets, clutch victories, and endless happiness both on and off the virtual pitch. Happy Birthday, ${name}! 🎉👑⚽`;

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
 * Generate a dynamic, personalized funny birthday chronicle using Gemini Flash
 */
export async function generateGeminiBirthdayStory(ctx: PlayerBirthdayContext): Promise<BirthdayStoryResult> {
  const { name, age, team, category, stats, seasonsCount } = ctx;

  const prompt = `
You are the witty, entertaining, and humorous head journalist for "SS League Sports Gazette", the premier eSports soccer tournament community news.
Write a funny, affectionate, and entertaining birthday toast and lighthearted roast for SS League player: ${name}.

PLAYER PROFILE & CAREER STATS:
- Name: ${name}
- Age: ${age} years old today
- Current Team: ${team}
- Category: ${category}
- Career Matches Played: ${stats.matches}
- Goals Scored: ${stats.goals}
- Goals Conceded: ${stats.goals_conceded}
- Matches Won: ${stats.wins} (Draws: ${stats.draws}, Losses: ${stats.losses})
- Clean Sheets: ${stats.clean_sheets}
- Man of the Match (MOTM) Awards: ${stats.motm_awards}
- Seasons Played: ${seasonsCount}

STRICT TONE & SAFETY GUIDELINES:
1. "DO NOT make comments which will make a bad impression or hurt them."
2. The tone MUST be warm, respectful, wholesome, humorous, and affectionate—like funny locker-room banter among best friends and gaming buddies.
3. Make clever, playful jokes about their stats, controller sprint triggers, celebrations, team tactics, and cake.
4. Conclude with heartfelt, energetic congratulations and birthday wishes from the SS League.

Please respond with ONLY a valid JSON object matching this structure (no markdown fences, just pure JSON):
{
  "headline": "Punchy, exciting, funny sports news headline",
  "subtitle": "Entertaining 1-sentence sub-headline",
  "roastParagraph": "2-3 funny sentences lovingly roasting them about their birthday milestone and stats",
  "tacticalReport": "2-3 humorous sentences analyzing their stats (goals, wins, clean sheets) in an esports commentary style",
  "lockerRoomRumor": "1-2 funny sentences about rumors from their team camp celebrating their birthday",
  "birthdayWish": "2-3 sentences of genuine, enthusiastic birthday wishes and congratulations from SS League"
}
`;

  try {
    const rawResponse = await generateWithFallback(prompt);
    // Clean up potential markdown formatting (```json ... ```)
    const cleaned = rawResponse
      .replace(/```json\s*/gi, '')
      .replace(/```\s*$/gi, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      headline: parsed.headline || `${name} Turns ${age} in Grand SS League Style!`,
      subtitle: parsed.subtitle || `Celebrating another legendary year on the SS League turf.`,
      roastParagraph: parsed.roastParagraph || '',
      tacticalReport: parsed.tacticalReport || '',
      lockerRoomRumor: parsed.lockerRoomRumor || '',
      birthdayWish: parsed.birthdayWish || `Happy Birthday to ${name} from all of us at SS League!`,
      isAiGenerated: true,
    };
  } catch (error) {
    console.warn('Gemini birthday story generation failed or timed out, using fallback:', error);
    return generateFallbackBirthdayStory(ctx);
  }
}
