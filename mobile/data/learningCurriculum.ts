import { getLessonKnowledgeCheck, LEARNING_LESSONS, type LearningLesson, type LearningStep } from './learningContent';

export interface LearningUnit {
  id: string;
  title: string;
  lessonIds: string[];
}

export interface LearningLevel {
  id: string;
  number: number;
  title: string;
  description: string;
  units: LearningUnit[];
}

const curriculumDefinition: LearningLevel[] = [
  {
    id: 'level-01',
    number: 1,
    title: 'Trading Foundations',
    description: 'Learn what markets are, who participates, and what a trade involves.',
    units: [
      { id: 'level-01-markets', title: 'Markets and trades', lessonIds: ['fundamentals-market-basics', 'fundamentals-market-participants', 'fundamentals-how-trades-work', 'fundamentals-choosing-a-forex-broker'] },
    ],
  },
  {
    id: 'level-02',
    number: 2,
    title: 'Forex and Instruments',
    description: 'Understand currency quotes, pip measurements, and market sessions.',
    units: [
      { id: 'level-02-forex', title: 'Currencies and quotes', lessonIds: ['fundamentals-forex-pairs', 'fundamentals-forex-prices-pips', 'fundamentals-trading-account-equity-margin'] },
      { id: 'level-02-sessions', title: 'Sessions and conditions', lessonIds: ['fundamentals-sessions-liquidity'] },
    ],
  },
  {
    id: 'level-03',
    number: 3,
    title: 'Orders and Execution',
    description: 'Compare order instructions and the practical limits of execution.',
    units: [
      { id: 'level-03-execution', title: 'Orders and trading costs', lessonIds: ['fundamentals-orders-execution', 'fundamentals-order-types-and-financing'] },
    ],
  },
  {
    id: 'level-04',
    number: 4,
    title: 'Candlestick Foundations',
    description: 'Read candle components and distinguish developing candles from completed ones.',
    units: [
      { id: 'level-04-candles', title: 'Candle anatomy and context', lessonIds: ['technical-candlestick-anatomy', 'technical-forming-candles', 'technical-doji-and-spinning-top'] },
    ],
  },
  {
    id: 'level-05',
    number: 5,
    title: 'Candlestick Patterns',
    description: 'Describe common candle patterns without treating them as predictions.',
    units: [
      { id: 'level-05-patterns', title: 'Recognising candle patterns', lessonIds: ['technical-hammer-shooting-star', 'technical-engulfing-patterns', 'technical-morning-evening-star'] },
    ],
  },
  {
    id: 'level-06',
    number: 6,
    title: 'Classic Chart Patterns',
    description: 'Identify selected chart structures and plan for pattern failure.',
    units: [
      { id: 'level-06-structures', title: 'Common formations', lessonIds: ['technical-inside-outside-bars', 'technical-double-tops-bottoms', 'technical-head-and-shoulders'] },
    ],
  },
  {
    id: 'level-07',
    number: 7,
    title: 'Advanced Chart Formations',
    description: 'Compare broader formations and define how an idea could be tested.',
    units: [
      { id: 'level-07-formations', title: 'Patterns and limitations', lessonIds: ['technical-triangles-flags-wedges', 'technical-classic-patterns'] },
    ],
  },
  {
    id: 'level-08',
    number: 8,
    title: 'Market Structure',
    description: 'Classify observable trends, ranges, and changes in swing structure.',
    units: [
      { id: 'level-08-structure', title: 'Structure and regimes', lessonIds: ['technical-market-structure', 'technical-market-regimes'] },
    ],
  },
  {
    id: 'level-09',
    number: 9,
    title: 'Technical Tools',
    description: 'Use chart references and indicators with consistent rules and restraint.',
    units: [
      { id: 'level-09-tools', title: 'Chart tools and methods', lessonIds: ['technical-trendlines', 'technical-indicators', 'technical-timeframes-and-candle-close'] },
    ],
  },
  {
    id: 'level-10',
    number: 10,
    title: 'Chart Reading and Liquidity',
    description: 'Build a repeatable chart-reading process and treat liquidity labels as hypotheses.',
    units: [
      { id: 'level-10-chart-reading', title: 'Evidence and data', lessonIds: ['technical-chart-reading', 'technical-volume-data'] },
      { id: 'level-10-liquidity', title: 'Liquidity concepts', lessonIds: ['technical-liquidity-smc', 'technical-liquidity-zones'] },
    ],
  },
  {
    id: 'level-11',
    number: 11,
    title: 'Risk and Trade Planning',
    description: 'Plan risk, size, and reward before considering a trade.',
    units: [
      { id: 'level-11-planning', title: 'Building a trade plan', lessonIds: ['risk-position-sizing', 'risk-risk-reward', 'risk-trade-planning', 'risk-setting-a-risk-budget', 'risk-calculating-pip-value'] },
    ],
  },
  {
    id: 'level-12',
    number: 12,
    title: 'Capital Protection',
    description: 'Account for execution gaps, aggregate exposure, leverage, and drawdown.',
    units: [
      { id: 'level-12-protection', title: 'Protecting trading capital', lessonIds: ['risk-stop-and-gap-risk', 'risk-portfolio-exposure', 'risk-leverage-and-ruin', 'risk-understanding-drawdown'] },
    ],
  },
  {
    id: 'level-13',
    number: 13,
    title: 'Risk Limits and Losing Streaks',
    description: 'Set loss limits in advance and understand how losing sequences affect capital.',
    units: [
      { id: 'level-13-limits', title: 'Loss limits', lessonIds: ['risk-streaks-and-loss-limits'] },
    ],
  },
  {
    id: 'level-14',
    number: 14,
    title: 'Economic Fundamentals',
    description: 'Interpret economic indicators and compare reported data with expectations.',
    units: [
      { id: 'level-14-economics', title: 'Economic drivers and releases', lessonIds: ['fundamental-economic-drivers', 'fundamental-economic-releases', 'fundamental-market-expectations', 'fundamental-interest-rate-differentials', 'fundamental-reading-employment-data'] },
    ],
  },
  {
    id: 'level-15',
    number: 15,
    title: 'Policy and Event Risk',
    description: 'Understand policy context and prepare for scheduled events without predicting outcomes.',
    units: [
      { id: 'level-15-events', title: 'Policy and scheduled events', lessonIds: ['fundamental-economic-policy', 'fundamentals-events-calendar', 'fundamental-event-preparation'] },
    ],
  },
  {
    id: 'level-16',
    number: 16,
    title: 'Research and Asset Analysis',
    description: 'Check information quality and recognise the assumptions behind valuation.',
    units: [
      { id: 'level-16-research', title: 'Research methods', lessonIds: ['fundamentals-research-sources', 'fundamentals-company-analysis'] },
    ],
  },
  {
    id: 'level-17',
    number: 17,
    title: 'Trading Decisions and Emotions',
    description: 'Separate decision quality from outcomes and recognise common behavioural risks.',
    units: [
      { id: 'level-17-decisions', title: 'Decision-making', lessonIds: ['psychology-process-over-outcome', 'psychology-losses', 'psychology-biases-and-fomo', 'psychology-fear-and-greed', 'psychology-confirmation-bias'] },
    ],
  },
  {
    id: 'level-18',
    number: 18,
    title: 'Discipline and Review',
    description: 'Use routines, journaling, and boundaries to support deliberate practice.',
    units: [
      { id: 'level-18-review', title: 'Routines and self-review', lessonIds: ['psychology-journaling', 'psychology-routines', 'psychology-revenge-and-overtrading', 'psychology-post-loss-reset', 'psychology-boundaries-and-screen-time'] },
    ],
  },
  {
    id: 'level-19',
    number: 19,
    title: 'Strategy Design',
    description: 'Turn ideas into explicit rules and review decisions consistently.',
    units: [
      { id: 'level-19-strategy', title: 'Rules and execution', lessonIds: ['strategies-rules-and-hypotheses', 'strategies-entry-exit-and-review', 'strategies-breakout-example', 'strategies-writing-a-trading-checklist'] },
    ],
  },
  {
    id: 'level-20',
    number: 20,
    title: 'Testing and Deliberate Practice',
    description: 'Evaluate a strategy using historical tests and structured simulation.',
    units: [
      { id: 'level-20-testing', title: 'Backtesting and practice', lessonIds: ['strategies-backtesting-basics', 'strategies-paper-practice', 'strategies-understanding-expectancy', 'strategies-defining-a-test-sample', 'strategies-overfitting-and-out-of-sample', 'strategies-scenario-rehearsal'] },
    ],
  },
];

export const LEARNING_CURRICULUM: LearningLevel[] = curriculumDefinition;

const levelByLessonId = new Map(
  LEARNING_CURRICULUM.flatMap((level) => level.units.flatMap((unit) => unit.lessonIds.map((lessonId) => [lessonId, level] as const))),
);

export function getLearningLevelForLesson(lessonId: string) {
  return levelByLessonId.get(lessonId);
}

export function getLearningLevelProgress(level: LearningLevel, completedLessonIds: string[]) {
  const lessonIds = level.units.flatMap((unit) => unit.lessonIds);
  const completed = new Set(completedLessonIds);
  const completedCount = lessonIds.filter((lessonId) => completed.has(lessonId)).length;
  return {
    completedCount,
    lessonCount: lessonIds.length,
    percent: lessonIds.length ? Math.round((completedCount / lessonIds.length) * 100) : 0,
    isComplete: lessonIds.length > 0 && completedCount === lessonIds.length,
  };
}

export function isLearningLevelUnlocked(levelId: string, completedLessonIds: string[]) {
  const levelIndex = LEARNING_CURRICULUM.findIndex((level) => level.id === levelId);
  if (levelIndex < 0) return false;
  if (levelIndex === 0) return true;
  return LEARNING_CURRICULUM
    .slice(0, levelIndex)
    .every((level) => getLearningLevelProgress(level, completedLessonIds).isComplete);
}

export function getCurrentLearningLevel(completedLessonIds: string[]) {
  return LEARNING_CURRICULUM.find((level) => !getLearningLevelProgress(level, completedLessonIds).isComplete);
}

export function getLearningLessonSteps(lesson: LearningLesson): LearningStep[] {
  const lessonSteps = lesson.steps ?? [];
  if (lessonSteps.some((step) => step.type === 'check')) return lessonSteps;

  const knowledgeCheck = getLessonKnowledgeCheck(lesson);
  const [correctOption, incorrectOption] = knowledgeCheck.options;
  if (!correctOption || !incorrectOption) {
    throw new Error(`Lesson "${lesson.id}" must have exactly two knowledge-check options.`);
  }
  const questionIndex = hashLessonId(lesson.id) % 2;
  const options: [string, string] = questionIndex === 0
    ? [correctOption.text, incorrectOption.text]
    : [incorrectOption.text, correctOption.text];
  const checkStep: LearningStep = {
    type: 'check',
    question: knowledgeCheck.question,
    options,
    correctIndex: questionIndex,
    feedback: `Key idea: ${correctOption.text} The alternative reflects a common pitfall; review the lesson before continuing.`,
  };
  const practiceIndex = lessonSteps.findIndex((step) => step.type === 'practice');
  const insertAt = practiceIndex < 0 ? lessonSteps.length : practiceIndex;
  return [...lessonSteps.slice(0, insertAt), checkStep, ...lessonSteps.slice(insertAt)];
}

function hashLessonId(value: string) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

export function validateLearningCurriculum() {
  const lessonIds = LEARNING_CURRICULUM.flatMap((level) => level.units.flatMap((unit) => unit.lessonIds));
  const knownLessonIds = new Set(LEARNING_LESSONS.map((lesson) => lesson.id));
  const duplicates = lessonIds.filter((lessonId, index) => lessonIds.indexOf(lessonId) !== index);
  const unknownLessons = lessonIds.filter((lessonId) => !knownLessonIds.has(lessonId));
  const unmappedLessons = LEARNING_LESSONS.filter((lesson) => !lessonIds.includes(lesson.id)).map((lesson) => lesson.id);
  if (duplicates.length || unknownLessons.length || unmappedLessons.length) {
    throw new Error(`Invalid learning curriculum mapping: duplicate=${duplicates.join(',')}; unknown=${unknownLessons.join(',')}; unmapped=${unmappedLessons.join(',')}.`);
  }
}
