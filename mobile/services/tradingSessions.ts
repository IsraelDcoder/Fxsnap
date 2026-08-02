export interface TradingSessionDefinition {
  name: 'Sydney' | 'Tokyo' | 'London' | 'New York';
  color: string;
  utcOpen: number;
  utcClose: number;
}

export interface TradingSessionState {
  activeSessions: TradingSessionDefinition[];
  headline: string;
  isOverlap: boolean;
  nowUtc: string;
}

export const SESSION_DEFINITIONS: TradingSessionDefinition[] = [
  { name: 'Sydney', utcOpen: 22 * 60, utcClose: 24 * 60, color: '#FF80AB' },
  { name: 'Tokyo', utcOpen: 0, utcClose: 9 * 60, color: '#FFD60A' },
  { name: 'London', utcOpen: 8 * 60, utcClose: 16 * 60, color: '#4FC3F7' },
  { name: 'New York', utcOpen: 13 * 60, utcClose: 21 * 60, color: '#00E676' },
];

function inRange(utcMinutes: number, session: TradingSessionDefinition) {
  const { utcOpen, utcClose } = session;
  if (utcClose <= utcOpen) {
    return utcMinutes >= utcOpen || utcMinutes < utcClose;
  }
  return utcMinutes >= utcOpen && utcMinutes < utcClose;
}

export function getTradingSessionState(referenceDate = new Date()): TradingSessionState {
  const utcMinutes = referenceDate.getUTCHours() * 60 + referenceDate.getUTCMinutes();
  const activeSessions = SESSION_DEFINITIONS.filter((session) => inRange(utcMinutes, session));

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
