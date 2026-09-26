export type TradeDirection = 'BUY' | 'SELL';

export interface TradeRiskInput {
  pair: string;
  direction: TradeDirection;
  entry: number;
  stopLoss: number;
  takeProfit: number;
}

export interface RiskProfile {
  accountBalance: number;
  riskPercent: number;
  maxDailyLossPercent: number;
  maxOpenRiskPercent: number;
  maxTradesPerDay: number;
  maxConsecutiveLosses: number;
}

export interface OpenRiskPosition extends TradeRiskInput {
  id: string;
  riskAmount: number;
  lotSize: number;
  createdAt: string;
}

export interface DailyRiskActivity {
  dateKey: string;
  dailyNetPnl: number;
  tradesToday: number;
  consecutiveLosses: number;
  openPositions: OpenRiskPosition[];
}

export type RiskRuleCheck = {
  id: 'trade' | 'daily' | 'open' | 'trades' | 'streak';
  title: string;
  detail: string;
  passed: boolean;
};

export interface TradeRiskResult {
  valid: boolean;
  error?: string;
  stopLossPips: number;
  takeProfitPips: number;
  riskAmount: number;
  riskPercent: number;
  lotSize: number;
  potentialProfit: number;
  rewardRisk: number;
}

export function pipMultiplier(pair: string) {
  return pair.toUpperCase().replace('/', '').includes('JPY') ? 100 : 10000;
}

export function calculateLotSize(accountBalance: number, riskPercent: number, stopLossPips: number, pipValuePerLot = 10) {
  if (![accountBalance, riskPercent, stopLossPips, pipValuePerLot].every(Number.isFinite)
    || accountBalance <= 0 || riskPercent <= 0 || stopLossPips <= 0 || pipValuePerLot <= 0) {
    return { riskAmount: 0, lotSize: 0 };
  }
  const riskAmount = accountBalance * riskPercent / 100;
  return { riskAmount, lotSize: riskAmount / (stopLossPips * pipValuePerLot) };
}

export function calculateTradeRisk(profile: RiskProfile, trade: TradeRiskInput): TradeRiskResult {
  const invalid = (error: string): TradeRiskResult => ({
    valid: false,
    error,
    stopLossPips: 0,
    takeProfitPips: 0,
    riskAmount: 0,
    riskPercent: 0,
    lotSize: 0,
    potentialProfit: 0,
    rewardRisk: 0,
  });

  if (!Number.isFinite(profile.accountBalance) || profile.accountBalance <= 0) return invalid('Set a positive account balance in your risk profile.');
  if (!Number.isFinite(profile.riskPercent) || profile.riskPercent <= 0 || profile.riskPercent > 10) return invalid('Enter a per-trade risk percentage greater than 0% and no more than 10%.');
  if (![trade.entry, trade.stopLoss, trade.takeProfit].every((value) => Number.isFinite(value) && value > 0)) return invalid('Enter positive entry, stop-loss, and take-profit prices.');

  const isBuy = trade.direction === 'BUY';
  const stopIsValid = isBuy ? trade.stopLoss < trade.entry : trade.stopLoss > trade.entry;
  const targetIsValid = isBuy ? trade.takeProfit > trade.entry : trade.takeProfit < trade.entry;
  if (!stopIsValid) return invalid(`For a ${trade.direction.toLowerCase()} trade, stop loss must be ${isBuy ? 'below' : 'above'} entry.`);
  if (!targetIsValid) return invalid(`For a ${trade.direction.toLowerCase()} trade, take profit must be ${isBuy ? 'above' : 'below'} entry.`);

  const multiplier = pipMultiplier(trade.pair);
  const stopLossPips = Number((Math.abs(trade.entry - trade.stopLoss) * multiplier).toFixed(6));
  const takeProfitPips = Number((Math.abs(trade.takeProfit - trade.entry) * multiplier).toFixed(6));
  const riskPercent = Number.isFinite(profile.riskPercent) ? profile.riskPercent : 0;
  const { riskAmount, lotSize } = calculateLotSize(profile.accountBalance, riskPercent, stopLossPips);
  const potentialProfit = takeProfitPips * 10 * lotSize;

  return {
    valid: stopLossPips > 0 && lotSize > 0,
    error: stopLossPips > 0 && lotSize > 0 ? undefined : 'Trade distances must be greater than zero.',
    stopLossPips,
    takeProfitPips,
    riskAmount,
    riskPercent,
    lotSize,
    potentialProfit,
    rewardRisk: riskAmount > 0 ? potentialProfit / riskAmount : 0,
  };
}

export function createDailyRiskActivity(dateKey: string): DailyRiskActivity {
  return { dateKey, dailyNetPnl: 0, tradesToday: 0, consecutiveLosses: 0, openPositions: [] };
}

export function normalizeDailyRiskActivity(value: Partial<DailyRiskActivity> | null | undefined, dateKey: string): DailyRiskActivity {
  const previous = value && typeof value === 'object' ? value : {};
  const openPositions = Array.isArray(previous.openPositions) ? previous.openPositions : [];
  const consecutiveLosses = Number.isFinite(previous.consecutiveLosses) ? Math.max(0, Number(previous.consecutiveLosses)) : 0;
  if (previous.dateKey !== dateKey) {
    return { ...createDailyRiskActivity(dateKey), consecutiveLosses, openPositions };
  }
  return {
    dateKey,
    dailyNetPnl: Number.isFinite(previous.dailyNetPnl) ? Number(previous.dailyNetPnl) : 0,
    tradesToday: Number.isFinite(previous.tradesToday) ? Math.max(0, Number(previous.tradesToday)) : 0,
    consecutiveLosses,
    openPositions,
  };
}

export function getLocalRiskDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getRiskRuleChecks(profile: RiskProfile, activity: DailyRiskActivity, trade: TradeRiskResult): RiskRuleCheck[] {
  const currentOpenRisk = activity.openPositions.reduce((total, position) => total + Math.max(0, position.riskAmount), 0);
  const projectedDailyLoss = Math.max(0, -(activity.dailyNetPnl - trade.riskAmount));
  const maximumDailyLoss = profile.accountBalance * profile.maxDailyLossPercent / 100;
  const maximumOpenRisk = profile.accountBalance * profile.maxOpenRiskPercent / 100;
  const checks: RiskRuleCheck[] = [
    {
      id: 'trade',
      title: 'Per-trade risk',
      detail: `${trade.riskPercent.toFixed(1)}% planned · ${profile.riskPercent.toFixed(1)}% configured`,
      passed: trade.riskPercent <= profile.riskPercent + 1e-9,
    },
    {
      id: 'daily',
      title: 'Daily loss limit',
      detail: `Projected ${projectedDailyLoss.toFixed(2)} / ${maximumDailyLoss.toFixed(2)}`,
      passed: projectedDailyLoss <= maximumDailyLoss + 1e-9,
    },
    {
      id: 'open',
      title: 'Maximum open risk',
      detail: `Projected ${(currentOpenRisk + trade.riskAmount).toFixed(2)} / ${maximumOpenRisk.toFixed(2)}`,
      passed: currentOpenRisk + trade.riskAmount <= maximumOpenRisk + 1e-9,
    },
    {
      id: 'trades',
      title: 'Trades per day',
      detail: `${activity.tradesToday + 1} / ${profile.maxTradesPerDay} if added to exposure`,
      passed: activity.tradesToday < profile.maxTradesPerDay,
    },
    {
      id: 'streak',
      title: 'Consecutive losses',
      detail: `${activity.consecutiveLosses} / ${profile.maxConsecutiveLosses}`,
      passed: activity.consecutiveLosses < profile.maxConsecutiveLosses,
    },
  ];
  return checks;
}