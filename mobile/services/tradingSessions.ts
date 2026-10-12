export interface TradingSessionDefinition {
  name: 'Sydney' | 'Tokyo' | 'London' | 'New York';
  color: string;
  timeZone: string;
  localOpen: number;
  localClose: number;
}

export interface TradingSessionState {
  activeSessions: TradingSessionDefinition[];
  headline: string;
  isOverlap: boolean;
  nowUtc: string;
}

export const SESSION_DEFINITIONS: TradingSessionDefinition[] = [
  { name: 'Sydney', timeZone: 'Australia/Sydney', localOpen: 8 * 60, localClose: 17 * 60, color: '#FF80AB' },
  { name: 'Tokyo', timeZone: 'Asia/Tokyo', localOpen: 9 * 60, localClose: 18 * 60, color: '#FFD60A' },
  { name: 'London', timeZone: 'Europe/London', localOpen: 8 * 60, localClose: 17 * 60, color: '#4FC3F7' },
  { name: 'New York', timeZone: 'America/New_York', localOpen: 8 * 60, localClose: 17 * 60, color: '#00E676' },
];

function getLocalSessionTime(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const weekday = value('weekday');
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  return {
    isWeekday: weekday !== 'Sat' && weekday !== 'Sun',
    minutes: hour * 60 + minute,
  };
}

function isSessionOpen(date: Date, session: TradingSessionDefinition) {
  const local = getLocalSessionTime(date, session.timeZone);
  return local.isWeekday && local.minutes >= session.localOpen && local.minutes < session.localClose;
}

export function getTradingSessionState(referenceDate = new Date()): TradingSessionState {
  const activeSessions = SESSION_DEFINITIONS.filter((session) => isSessionOpen(referenceDate, session));

  const headline = activeSessions.length === 0
    ? 'No major session active'
    : activeSessions.length === 1
      ? `${activeSessions[0].name} session active`
      : `${activeSessions.map((session) => session.name).join(' + ')} overlap`;

  return {
    activeSessions,
    headline,
    isOverlap: activeSessions.length > 1,
    nowUtc: referenceDate.toISOString(),
  };
}
