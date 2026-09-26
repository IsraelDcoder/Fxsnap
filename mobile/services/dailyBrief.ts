import AsyncStorage from '@react-native-async-storage/async-storage';

export type BriefCategory =
  | 'Trading Psychology'
  | 'Risk Management'
  | 'Technical Analysis'
  | 'Forex Fundamentals'
  | 'Trading Discipline'
  | 'Market Structure'
  | 'Trading Mistakes'
  | 'Strategy Education'
  | 'Candlestick Education'
  | 'Trading Sessions'
  | 'Position Sizing'
  | 'Trading Journaling';

export type BriefVisual = 'psychology' | 'risk' | 'technical' | 'fundamentals' | 'discipline' | 'structure' | 'mistakes' | 'strategy' | 'candles' | 'sessions' | 'sizing' | 'journal';

export interface DailyBriefItem {
  id: string;
  category: BriefCategory;
  title: string;
  body: string;
  takeaway: string;
  visual: BriefVisual;
}

export interface DailyBriefState {
  dateKey: string;
  briefs: DailyBriefItem[];
  readIds: string[];
  unreadCount: number;
  total: number;
}

export interface DailyVideoBrief {
  id: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  title: string;
  description: string;
  date: string;
}

const ASSIGNMENTS_KEY = 'fxsnap:dailyBrief:assignments:v1';
const READS_KEY = 'fxsnap:dailyBrief:reads:v1';
const BRIEFS_PER_DAY = 15;

export const CURATED_BRIEFS: DailyBriefItem[] = [
  { id: 'psych-01', category: 'Trading Psychology', visual: 'psychology', title: "Don't confuse a good trade with a winning trade.", body: 'A good trade can lose money. If you followed your strategy, respected your risk and executed according to your plan, the trade can still be sound even when price moves against you.', takeaway: 'Judge your process before judging your result.' },
  { id: 'psych-02', category: 'Trading Psychology', visual: 'psychology', title: 'A missed trade is not a loss.', body: 'Watching a move leave without you can feel uncomfortable. Chasing it often replaces a planned entry with an emotional one and changes the risk you originally accepted.', takeaway: 'Let missed opportunities pass without rewriting your rules.' },
  { id: 'psych-03', category: 'Trading Psychology', visual: 'psychology', title: 'Confidence should come from repetition.', body: 'One profitable trade cannot prove an approach works, and one losing trade cannot disprove it. Confidence grows from observing the same process across a meaningful sample.', takeaway: 'Build confidence from reviewed evidence, not a single outcome.' },
  { id: 'psych-04', category: 'Trading Psychology', visual: 'psychology', title: 'Notice the urge to win it back.', body: 'After a loss, the desire to recover immediately can make larger size or weaker entries seem reasonable. A pause gives you room to choose rather than react.', takeaway: 'After a difficult trade, reset before considering another.' },
  { id: 'risk-01', category: 'Risk Management', visual: 'risk', title: 'Define the invalidation before the entry.', body: 'A stop should reflect where the trade idea no longer makes sense, not where the loss starts to feel painful. Decide that level before committing to the position.', takeaway: 'Know what proves the idea wrong before acting on it.' },
  { id: 'risk-02', category: 'Risk Management', visual: 'risk', title: 'Risk is more than the stop distance.', body: 'Position size, leverage, spread, slippage and correlated positions all influence exposure. A narrow stop does not automatically make a trade low risk.', takeaway: 'Review total exposure, not just one chart level.' },
  { id: 'risk-03', category: 'Risk Management', visual: 'risk', title: 'A smaller position can improve decision quality.', body: 'When size is too large, normal price fluctuations can dominate attention. Reducing exposure can make it easier to follow the plan and assess the setup clearly.', takeaway: 'Choose size that lets you execute without panic.' },
  { id: 'risk-04', category: 'Risk Management', visual: 'risk', title: 'Set a daily loss boundary in advance.', body: 'A predefined stopping point can prevent a frustrating session from turning into a string of increasingly emotional trades. The exact boundary should fit your plan and circumstances.', takeaway: 'Decide when to stop before the session begins.' },
  { id: 'tech-01', category: 'Technical Analysis', visual: 'technical', title: 'A level is an area, not a magic line.', body: 'Price rarely reacts to every pip with perfect precision. Treat support and resistance as zones where decisions may cluster, then look for evidence of a response.', takeaway: 'Use zones for context; use price action for confirmation.' },
  { id: 'tech-02', category: 'Technical Analysis', visual: 'technical', title: 'Indicators summarize price; they do not guarantee it.', body: 'Most indicators are derived from past price or volume. They can help organize information, but several indicators built from the same data may repeat one signal rather than add independent evidence.', takeaway: 'Understand what an indicator measures before adding it.' },
  { id: 'tech-03', category: 'Technical Analysis', visual: 'technical', title: 'Choose the timeframe that matches your question.', body: 'A higher timeframe can frame the broader context while a lower one shows detail. Looking at too many timeframes without a clear role can create conflicting interpretations.', takeaway: 'Give each timeframe a specific job in your process.' },
  { id: 'tech-04', category: 'Technical Analysis', visual: 'technical', title: 'A breakout needs context.', body: 'A candle beyond a level is only one piece of information. The surrounding structure, close, follow-through and nearby liquidity can change how meaningful that break is.', takeaway: 'Assess acceptance beyond a level, not just a brief wick.' },
  { id: 'fund-01', category: 'Forex Fundamentals', visual: 'fundamentals', title: 'Currencies are relative prices.', body: 'A currency pair compares two economies and their policy expectations. A currency can strengthen broadly while its pair falls if the other currency strengthens more.', takeaway: 'Ask which side is relatively stronger, not whether one is simply strong.' },
  { id: 'fund-02', category: 'Forex Fundamentals', visual: 'fundamentals', title: 'Interest-rate expectations can matter more than the current rate.', body: 'Markets respond to how policy may change as well as what central banks have already decided. Shifts in expectations can influence currencies before a rate announcement.', takeaway: 'Separate current policy from the expected policy path.' },
  { id: 'fund-03', category: 'Forex Fundamentals', visual: 'fundamentals', title: 'Economic releases are compared with expectations.', body: 'A headline number alone may not explain a currency reaction. Traders also consider forecasts, revisions, details within the report and how much was already priced in.', takeaway: 'Compare the release with expectations and prior context.' },
  { id: 'fund-04', category: 'Forex Fundamentals', visual: 'fundamentals', title: 'Safe-haven behavior is conditional.', body: 'Currencies sometimes respond to uncertainty through perceived safety, liquidity or policy differences. Those relationships can change with the source of stress and the broader economic backdrop.', takeaway: 'Treat macro relationships as context, not permanent rules.' },
  { id: 'discipline-01', category: 'Trading Discipline', visual: 'discipline', title: 'Write the setup before the candle closes.', body: 'If your plan only becomes clear after the move, it is easy to reinterpret the chart to justify an entry. Writing conditions in advance makes the decision easier to review.', takeaway: 'Make your criteria observable before price reaches them.' },
  { id: 'discipline-02', category: 'Trading Discipline', visual: 'discipline', title: 'One rule broken is useful information.', body: 'A rule violation can reveal that the plan is unclear, the workflow is inconvenient or the emotional trigger needs attention. Hiding it makes the same pattern harder to change.', takeaway: 'Record deviations honestly and improve the process.' },
  { id: 'discipline-03', category: 'Trading Discipline', visual: 'discipline', title: 'Build a pre-trade pause.', body: 'A short checklist between spotting a setup and placing an order creates a moment to verify direction, invalidation, size and event exposure before execution.', takeaway: 'Add a pause where impulsive decisions usually happen.' },
  { id: 'discipline-04', category: 'Trading Discipline', visual: 'discipline', title: 'Consistency is a series of small decisions.', body: 'Following the plan on quiet days and after a loss is less dramatic than a perfect entry, but those ordinary decisions determine whether your method can be evaluated fairly.', takeaway: 'Protect the routine, especially when nothing exciting is happening.' },
  { id: 'structure-01', category: 'Market Structure', visual: 'structure', title: 'Swing points need confirmation.', body: 'A potential high or low is provisional until later price action gives it meaning. Labeling every small pivot as a major turning point can make structure appear more certain than it is.', takeaway: 'Use consistent rules to distinguish meaningful swings from noise.' },
  { id: 'structure-02', category: 'Market Structure', visual: 'structure', title: 'A trend is a sequence, not a single candle.', body: 'Trend context comes from how successive swings develop. One strong candle may be important, but it does not by itself establish a durable change in structure.', takeaway: 'Read the sequence of highs and lows before naming a trend.' },
  { id: 'structure-03', category: 'Market Structure', visual: 'structure', title: 'Liquidity can explain where price may travel.', body: 'Orders often gather around obvious highs, lows and widely watched levels. These areas can attract price, but a liquidity target does not predict what price will do after reaching it.', takeaway: 'Separate a likely destination from a confirmed trade direction.' },
  { id: 'structure-04', category: 'Market Structure', visual: 'structure', title: 'A structure break changes a hypothesis.', body: 'When price invalidates a swing sequence, it may weaken the previous directional idea. It does not automatically prove the opposite trend has begun.', takeaway: 'Update your scenario without jumping to its inverse.' },
  { id: 'mistake-01', category: 'Trading Mistakes', visual: 'mistakes', title: 'Moving a stop is a new decision.', body: 'Widening a stop after entry changes the maximum planned loss. Sometimes the thesis has changed; often discomfort is driving the adjustment. Either way, treat it as a fresh risk decision.', takeaway: 'Do not disguise increased risk as routine trade management.' },
  { id: 'mistake-02', category: 'Trading Mistakes', visual: 'mistakes', title: 'More analysis can create less clarity.', body: 'Adding indicators and drawing more levels may feel productive while making the actual decision harder. A compact framework is easier to apply and review consistently.', takeaway: 'Remove tools that do not change a decision.' },
  { id: 'mistake-03', category: 'Trading Mistakes', visual: 'mistakes', title: 'A winning streak does not remove risk.', body: 'Recent success can encourage larger positions or looser rules. But the next trade still has uncertainty, regardless of how the previous trades ended.', takeaway: 'Keep risk rules stable through both wins and losses.' },
  { id: 'mistake-04', category: 'Trading Mistakes', visual: 'mistakes', title: 'Do not optimize a plan on one example.', body: 'Changing rules after a memorable trade can overfit your process to an unusual event. Review a broad sample before deciding that a rule needs adjustment.', takeaway: 'Look for repeated evidence before changing your system.' },
  { id: 'strategy-01', category: 'Strategy Education', visual: 'strategy', title: 'A strategy needs conditions and exclusions.', body: 'Useful rules explain when to act and when not to act. Defining market conditions that invalidate a setup can reduce low-quality trades as much as refining an entry.', takeaway: 'Write both your entry criteria and your no-trade criteria.' },
  { id: 'strategy-02', category: 'Strategy Education', visual: 'strategy', title: 'Keep a strategy small enough to test.', body: 'If a method has many subjective exceptions, it becomes difficult to tell whether it has an edge. Start with a few observable rules and evaluate them before adding complexity.', takeaway: 'Make the first version measurable.' },
  { id: 'strategy-03', category: 'Strategy Education', visual: 'strategy', title: 'Separate setup quality from execution quality.', body: 'A valid setup can be executed poorly, and a weak setup can happen to profit. Tracking these separately helps you improve the part of the process that actually needs work.', takeaway: 'Review the decision and the outcome as different data.' },
  { id: 'strategy-04', category: 'Strategy Education', visual: 'strategy', title: 'A no-trade decision is part of the strategy.', body: 'Waiting can preserve capital and attention when conditions do not match your tested plan. It is not a failure to participate; it is a rule-based outcome.', takeaway: 'Count disciplined waiting as a valid execution.' },
  { id: 'candle-01', category: 'Candlestick Education', visual: 'candles', title: 'A long wick shows rejection, not certainty.', body: 'A wick records movement that did not hold through the candle close. Its meaning depends on location, timeframe and what price does afterward.', takeaway: 'Read a candle in context, then wait for follow-through.' },
  { id: 'candle-02', category: 'Candlestick Education', visual: 'candles', title: 'The close carries different information from the wick.', body: 'A candle can travel far intraperiod and still close near its open. The closing location helps describe which side maintained pressure by the end of that interval.', takeaway: 'Compare the close with the full range, not only the extreme.' },
  { id: 'candle-03', category: 'Candlestick Education', visual: 'candles', title: 'A doji means indecision within that interval.', body: 'When open and close are similar, neither side held a clear advantage by the close. A doji is not automatically a reversal signal.', takeaway: 'Use the surrounding structure to interpret a small real body.' },
  { id: 'candle-04', category: 'Candlestick Education', visual: 'candles', title: 'Candle size should be compared with recent volatility.', body: 'A wide candle can signal a notable expansion in movement, but what counts as wide varies by instrument and timeframe. Context helps avoid treating normal variation as exceptional.', takeaway: 'Compare range with recent instrument behavior.' },
  { id: 'session-01', category: 'Trading Sessions', visual: 'sessions', title: 'Session opens can change participation.', body: 'Different regional trading hours bring changing liquidity and participant activity. The effect depends on the instrument, scheduled events and the day’s broader conditions.', takeaway: 'Use session time as context, not as a standalone signal.' },
  { id: 'session-02', category: 'Trading Sessions', visual: 'sessions', title: 'Overlaps can be active and unpredictable.', body: 'When major sessions overlap, participation may rise, but so can rapid movement around news or key levels. More activity does not guarantee cleaner setups.', takeaway: 'Plan for volatility before the busy hours begin.' },
  { id: 'session-03', category: 'Trading Sessions', visual: 'sessions', title: 'Market hours are not equal across instruments.', body: 'A currency pair may be most active when one of its related markets is open. Other instruments can follow different schedules and liquidity patterns.', takeaway: 'Match your session assumptions to the instrument you trade.' },
  { id: 'session-04', category: 'Trading Sessions', visual: 'sessions', title: 'Know your own best trading window.', body: 'A theoretically active period is not useful if it conflicts with your attention or routine. A repeatable schedule can make preparation and review more sustainable.', takeaway: 'Choose hours you can follow with focus and consistency.' },
  { id: 'sizing-01', category: 'Position Sizing', visual: 'sizing', title: 'Position size links risk to invalidation.', body: 'The account risk you choose and the distance to the stop together determine position size. If the stop distance changes, size should be recalculated rather than guessed.', takeaway: 'Calculate size after defining the stop.' },
  { id: 'sizing-02', category: 'Position Sizing', visual: 'sizing', title: 'Pip value depends on the pair and account currency.', body: 'A simple pip-value estimate can be inaccurate when the quote currency differs from your account currency. Conversion rates and broker specifications affect the final amount.', takeaway: 'Check the instrument contract details before relying on an estimate.' },
  { id: 'sizing-03', category: 'Position Sizing', visual: 'sizing', title: 'Correlated positions can add up.', body: 'Several trades that appear separate may all depend on the same currency direction. Their combined exposure can be much larger than each position suggests on its own.', takeaway: 'Review portfolio-level currency exposure.' },
  { id: 'sizing-04', category: 'Position Sizing', visual: 'sizing', title: 'Leverage changes exposure, not certainty.', body: 'Leverage lets a smaller deposit control a larger notional position. It does not improve the probability of a trade and can magnify losses as well as gains.', takeaway: 'Choose exposure based on risk, not available leverage.' },
  { id: 'journal-01', category: 'Trading Journaling', visual: 'journal', title: 'Record what you knew at entry time.', body: 'A useful journal captures the chart context, plan and reason for entry as they appeared then. Writing only after the outcome invites hindsight to rewrite the decision.', takeaway: 'Save the thesis before the result is known.' },
  { id: 'journal-02', category: 'Trading Journaling', visual: 'journal', title: 'Track rule adherence alongside returns.', body: 'Profit and loss alone cannot show whether a process is repeatable. Recording whether you followed your setup and risk rules adds useful context to performance reviews.', takeaway: 'Measure execution quality, not just outcomes.' },
  { id: 'journal-03', category: 'Trading Journaling', visual: 'journal', title: 'Review patterns on a schedule.', body: 'A brief regular review can reveal repeated errors or conditions where your approach is clearer. Frequent rule changes after every trade make those patterns harder to see.', takeaway: 'Set a review cadence and keep it stable.' },
  { id: 'journal-04', category: 'Trading Journaling', visual: 'journal', title: 'Screenshots preserve context.', body: 'A chart image can make an entry easier to understand later, especially when paired with the timeframe, planned invalidation and a short note about the setup.', takeaway: 'Capture the chart and the reasoning together.' },
];

type AssignmentMap = Record<string, string[]>;
type ReadMap = Record<string, string[]>;

export function getBriefDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseMap<T>(value: string | null): T {
  if (!value) return {} as T;
  try { return JSON.parse(value) as T; } catch { return {} as T; }
}

function seededShuffle<T>(values: T[], seedText: string): T[] {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  const random = () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function selectDailyBriefIds(dateKey: string, assignments: AssignmentMap): string[] {
  const previousDates = Object.keys(assignments).filter((key) => key < dateKey).sort().reverse().slice(0, 2);
  const recentIds = new Set(previousDates.flatMap((key) => assignments[key] || []));
  const pool = CURATED_BRIEFS.filter((brief) => !recentIds.has(brief.id));
  const selection = seededShuffle(pool.length >= BRIEFS_PER_DAY ? pool : CURATED_BRIEFS, dateKey).slice(0, BRIEFS_PER_DAY);
  return selection.map((brief) => brief.id);
}

export function addBriefRead(readIds: string[], briefId: string) {
  return Array.from(new Set([...readIds, briefId]));
}

export function getUnreadBriefCount(total: number, readIds: string[]) {
  return Math.max(0, total - new Set(readIds).size);
}

export async function getDailyBriefState(date = new Date()): Promise<DailyBriefState> {
  const dateKey = getBriefDateKey(date);
  const [assignmentJson, readJson] = await Promise.all([
    AsyncStorage.getItem(ASSIGNMENTS_KEY),
    AsyncStorage.getItem(READS_KEY),
  ]);
  const assignments = parseMap<AssignmentMap>(assignmentJson);
  const reads = parseMap<ReadMap>(readJson);
  let assignedIds = assignments[dateKey];

  if (!Array.isArray(assignedIds) || assignedIds.length !== BRIEFS_PER_DAY) {
    assignedIds = selectDailyBriefIds(dateKey, assignments);
    const retained = Object.fromEntries(Object.entries(assignments).sort(([left], [right]) => right.localeCompare(left)).slice(0, 13));
    retained[dateKey] = assignedIds;
    await AsyncStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(retained));
  }

  const byId = new Map(CURATED_BRIEFS.map((brief) => [brief.id, brief]));
  const briefs = assignedIds.map((id) => byId.get(id)).filter((brief): brief is DailyBriefItem => Boolean(brief));
  const readIds = reads[dateKey] || [];
  return {
    dateKey,
    briefs,
    readIds,
    unreadCount: getUnreadBriefCount(briefs.length, readIds),
    total: briefs.length,
  };
}

export async function markDailyBriefRead(briefId: string, date = new Date()): Promise<DailyBriefState> {
  const state = await getDailyBriefState(date);
  if (!state.briefs.some((brief) => brief.id === briefId)) return state;
  const readJson = await AsyncStorage.getItem(READS_KEY);
  const reads = parseMap<ReadMap>(readJson);
  reads[state.dateKey] = addBriefRead(reads[state.dateKey] || [], briefId);
  const retainedReads = Object.fromEntries(Object.entries(reads).sort(([left], [right]) => right.localeCompare(left)).slice(0, 14));
  await AsyncStorage.setItem(READS_KEY, JSON.stringify(retainedReads));
  return {
    ...state,
    readIds: retainedReads[state.dateKey],
    unreadCount: getUnreadBriefCount(state.total, retainedReads[state.dateKey]),
  };
}

export function getDailyVideoBrief(): DailyVideoBrief | null {
  const videoUrl = process.env.EXPO_PUBLIC_DAILY_VIDEO_URL?.trim();
  if (!videoUrl) return null;
  const date = process.env.EXPO_PUBLIC_DAILY_VIDEO_DATE?.trim() || getBriefDateKey();
  if (date !== getBriefDateKey()) return null;
  return {
    id: process.env.EXPO_PUBLIC_DAILY_VIDEO_ID?.trim() || getBriefDateKey(),
    videoUrl,
    thumbnailUrl: process.env.EXPO_PUBLIC_DAILY_VIDEO_THUMBNAIL?.trim() || null,
    title: process.env.EXPO_PUBLIC_DAILY_VIDEO_TITLE?.trim() || 'Your 60-second FX insight',
    description: process.env.EXPO_PUBLIC_DAILY_VIDEO_DESCRIPTION?.trim() || 'A short, editor-selected forex lesson.',
    date,
  };
}