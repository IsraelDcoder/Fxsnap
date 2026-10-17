import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLessonPracticePrompt, LEARNING_LESSONS, type LearningStep } from '../data/learningContent';

const MAX_SECTION_WORDS = 110;
const MIN_MERGE_WORD_COUNT = 25;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(SCRIPT_DIR, '../data');
const DEFAULT_OUTPUT_PATH = resolve(DATA_DIR, 'learningSteps.generated.ts');

function getVisualIcon(lesson: (typeof LEARNING_LESSONS)[number], title: string, body: string) {
  const concept = `${lesson.id} ${title} ${body}`.toLowerCase();
  const visuals: Array<[RegExp, string]> = [
    [/candlestick|candle|doji|wick|bar pattern|engulfing|hammer|shooting star|morning star|evening star/u, 'activity'],
    [/order|execution|spread|slippage|fill/u, 'sliders'],
    [/forex|currency|currencies|pair|pip|exchange rate/u, 'dollar-sign'],
    [/session|liquidity|volume/u, 'clock'],
    [/participant|market maker|dealer|investor/u, 'users'],
    [/head and shoulders|double top|double bottom|triangle|wedge|flag|pattern/u, 'layers'],
    [/structure|higher high|lower low|swing/u, 'git-branch'],
    [/trendline|trend|moving average/u, 'trending-up'],
    [/indicator|chart|technical/u, 'bar-chart-2'],
    [/position siz|leverage|stop.loss|risk|loss|ruin|exposure/u, 'shield'],
    [/reward|target|entry|exit|trade plan/u, 'target'],
    [/portfolio|correlation|diversif/u, 'pie-chart'],
    [/economic|calendar|release|policy|cpi|gdp|inflation/u, 'calendar'],
    [/company|fundamental|valuation|balance sheet/u, 'briefcase'],
    [/research|source|data|expectation/u, 'search'],
    [/psychology|emotion|fomo|revenge|bias|discipline/u, 'heart'],
    [/journal|review|record/u, 'book-open'],
    [/routine|process|habit/u, 'check-circle'],
    [/breakout|momentum|continuation/u, 'trending-up'],
    [/backtest|strategy|hypothesis|rules/u, 'crosshair'],
    [/practice|demo|simulat/u, 'repeat'],
    [/market|price|trade/u, 'activity'],
  ];
  const match = visuals.find(([pattern]) => pattern.test(concept));
  if (match) return match[1];

  switch (lesson.categoryId) {
    case 'fundamentals': return 'dollar-sign';
    case 'technical-analysis': return 'bar-chart-2';
    case 'risk-management': return 'shield';
    case 'fundamental-analysis': return 'globe';
    case 'trading-psychology': return 'heart';
    case 'strategies-practice': return 'crosshair';
  }
}

function wordCount(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function safeKeyPoint(value?: string) {
  const source = value?.replace(/\s+/gu, ' ').trim();
  if (!source) return undefined;
  const withoutTrailingPunctuation = source.replace(/[.?!]+$/u, '');
  return withoutTrailingPunctuation.length <= 140 ? withoutTrailingPunctuation : `${withoutTrailingPunctuation.slice(0, 137).trim()}...`;
}

function splitSectionBody(section: (typeof LEARNING_LESSONS)[number]['sections'][number]) {
  const paragraphs = (section.paragraphs ?? []).map((paragraph) => paragraph.trim()).filter(Boolean);
  const bullets = (section.bullets ?? []).map((bullet) => bullet.trim()).filter(Boolean);
  const appendix = [...bullets, ...(section.formula ? [section.formula.trim()] : [])].filter(Boolean);
  const totalWords = paragraphs.reduce((total, paragraph) => total + wordCount(paragraph), 0);

  if (paragraphs.length <= 1) {
    const fullBody = [...paragraphs, ...appendix].join('\n\n');
    return fullBody ? [fullBody] : appendix;
  }

  const chunks = paragraphs.map((paragraph) => paragraph);
  if (appendix.length > 0 && chunks.length > 0) {
    const lastChunk = chunks[chunks.length - 1];
    chunks[chunks.length - 1] = `${lastChunk}\n\n${appendix.join('\n\n')}`;
  }

  return chunks.length > 0 ? chunks : [appendix.join('\n\n')];
}

function mergeShortBodies(steps: LearningStep[]) {
  const merged: LearningStep[] = [];

  for (const step of steps) {
    if (step.type !== 'learn') {
      merged.push(step);
      continue;
    }

    const bodyWords = wordCount(step.body);
    if (bodyWords < MIN_MERGE_WORD_COUNT && merged.length > 0) {
      const previous = merged[merged.length - 1];
      if (previous.type === 'learn') {
        previous.body = `${previous.body}\n\n${step.body}`;
        if (previous.keyPoint === undefined && step.keyPoint) previous.keyPoint = step.keyPoint;
        continue;
      }
    }

    merged.push(step);
  }

  return merged;
}

function convertLesson(lesson: (typeof LEARNING_LESSONS)[number]): LearningStep[] {
  const steps: LearningStep[] = [
    {
      type: 'learn',
      title: lesson.title,
      body: lesson.intro,
      visual: getVisualIcon(lesson, lesson.title, lesson.intro),
      keyPoint: safeKeyPoint(lesson.shortDescription),
    },
  ];

  for (const section of lesson.sections) {
    const sectionBodies = splitSectionBody(section);
    const keyPointCandidates = [...(section.paragraphs ?? []), ...(section.bullets ?? [])].filter(Boolean);
    for (const body of sectionBodies) {
      const keyPoint = safeKeyPoint(keyPointCandidates[0] ?? section.heading);
      steps.push({
        type: 'learn',
        title: section.heading,
        body,
        visual: getVisualIcon(lesson, section.heading, body),
        keyPoint,
      });
    }
  }

  if (lesson.keyTakeaways.length > 0) {
    steps.push({
      type: 'learn',
      title: 'Key takeaways',
      body: lesson.keyTakeaways.join('\n\n'),
      visual: getVisualIcon(lesson, 'Key takeaways', lesson.keyTakeaways.join(' ')),
      keyPoint: safeKeyPoint(lesson.keyTakeaways[0]),
    });
  }

  if (lesson.commonMistakes.length > 0) {
    steps.push({
      type: 'learn',
      title: 'Common mistakes',
      body: lesson.commonMistakes.join('\n\n'),
      visual: getVisualIcon(lesson, 'Common mistakes', lesson.commonMistakes.join(' ')),
      keyPoint: safeKeyPoint(lesson.commonMistakes[0]),
    });
  }

  steps.push({ type: 'practice', body: getLessonPracticePrompt(lesson) });
  steps.push({
    type: 'recap',
    points: lesson.sections.slice(0, Math.min(3, lesson.sections.length)).map((section) => section.heading),
  });

  return mergeShortBodies(steps);
}

function getPreviousGeneratedCounts(path: string) {
  if (!existsSync(path)) return {} as Record<string, number>;
  const content = readFileSync(path, 'utf8');
  const match = content.match(/GENERATED_LEARNING_STEPS: Record<string, LearningStep\[]> = (\{[\s\S]*\});?\s*$/m);
  if (!match) return {} as Record<string, number>;

  try {
    const parsed = JSON.parse(match[1]);
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]));
  } catch {
    return {} as Record<string, number>;
  }
}

async function main() {
  const outputPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUTPUT_PATH;
  const resolvedOutputPath = resolve(outputPath);
  const backupPath = resolve(DATA_DIR, 'learningSteps.v1.generated.ts');
  const previousCounts = existsSync(resolvedOutputPath)
    ? getPreviousGeneratedCounts(resolvedOutputPath)
    : {} as Record<string, number>;

  if (existsSync(resolvedOutputPath) && process.argv[3] !== '--overwrite') {
    throw new Error(`Refusing to overwrite existing file: ${resolvedOutputPath}. Pass --overwrite to replace it.`);
  }

  if (existsSync(resolvedOutputPath) && !existsSync(backupPath)) {
    writeFileSync(backupPath, readFileSync(resolvedOutputPath, 'utf8'), 'utf8');
  }

  const converted = Object.fromEntries(LEARNING_LESSONS.map((lesson) => [lesson.id, convertLesson(lesson)]));
  const isTypeScript = resolvedOutputPath.endsWith('.ts');
  const output = isTypeScript
    ? `import type { LearningStep } from './learningContent';\n\nexport const GENERATED_LEARNING_STEPS: Record<string, LearningStep[]> = ${JSON.stringify(converted, null, 2)};\n`
    : `${JSON.stringify(converted, null, 2)}\n`;

  writeFileSync(resolvedOutputPath, output, 'utf8');

  const table = LEARNING_LESSONS.map((lesson) => ({
    lesson: lesson.id,
    before: previousCounts[lesson.id] ?? 0,
    after: converted[lesson.id].length,
  }));

  console.log(`Converted ${LEARNING_LESSONS.length} lessons into ${Object.values(converted).reduce((count, steps) => count + steps.length, 0)} steps.`);
  console.log('Before/after step count review table:');
  console.table(table);
  console.log(`Review output: ${resolvedOutputPath}`);
  console.log(`Backup saved to: ${backupPath}`);
}

void main();
