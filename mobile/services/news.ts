import { resolveApiBaseUrl } from './apiAuth';

export type NewsSentiment = 'positive' | 'negative' | 'neutral';
export type NewsImpact = 'LOW' | 'MEDIUM' | 'HIGH';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  url?: string | null;
  sentiment?: NewsSentiment;
  impact?: NewsImpact;
  currencies?: string[];
}

export interface UpcomingEvent {
  id: string;
  title: string;
  date: string;
  impact: NewsImpact;
  country?: string | null;
  currency?: string | null;
  actual?: string | null;
  forecast?: string | null;
  previous?: string | null;
}

export interface EconomicCalendarResponse {
  events: UpcomingEvent[];
  live: boolean;
  source: string | null;
  updatedAt: string | null;
}

export interface DailyBriefCard {
  id: string;
  instrument: string;
  category: string;
  headline: string;
  subheading: string;
  explanation: string;
  timestamp: string;
  impact: NewsImpact;
}

export interface DailyBriefResponse {
  title: string;
  dateText: string;
  updatesToday: number;
  cards: DailyBriefCard[];
}

export interface NewsProvider {
  getNewsForInstrument(symbol: string): Promise<NewsItem[]>;
  getUpcomingEvents(symbol: string): Promise<UpcomingEvent[]>;
  getDailyBrief(symbols?: string[]): Promise<DailyBriefResponse>;
}

const API_BASE = resolveApiBaseUrl();

export class DefaultNewsProvider implements NewsProvider {
  async getEconomicCalendar(forceRefresh = false): Promise<EconomicCalendarResponse> {
    const refreshQuery = forceRefresh ? `?refresh=${Date.now()}` : '';
    const response = await fetch(`${API_BASE}/market/calendar${refreshQuery}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = payload && typeof payload.error === 'string' ? `: ${payload.error}` : '';
      throw new Error(`Economic calendar request failed (${response.status})${detail}`);
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.events)) {
      throw new Error('The economic calendar returned an invalid response.');
    }
    return {
      events: payload.events,
      live: payload.dataSource === 'forex_factory_weekly' || payload.dataSource === 'finnhub',
      source: typeof payload.dataSource === 'string' ? payload.dataSource : null,
      updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
    };
  }

  async getNewsForInstrument(symbol: string): Promise<NewsItem[]> {
    try {
      const response = await fetch(`${API_BASE}/market/news?symbol=${encodeURIComponent(symbol)}`);
      if (!response.ok) return [];
      const payload = await response.json();
      return Array.isArray(payload?.articles) ? payload.articles : [];
    } catch {
      return [];
    }
  }

  async getUpcomingEvents(symbol: string): Promise<UpcomingEvent[]> {
    try {
      const response = await fetch(`${API_BASE}/market/events?symbol=${encodeURIComponent(symbol)}`);
      if (!response.ok) return [];
      const payload = await response.json();
      return Array.isArray(payload?.events) ? payload.events : [];
    } catch {
      return [];
    }
  }

  async getDailyBrief(symbols: string[] = [
    'EUR/USD',
    'GBP/USD',
    'USD/JPY',
    'AUD/USD',
    'USD/CAD',
    'USD/CHF',
    'NZD/USD',
    'XAU/USD',
  ]): Promise<DailyBriefResponse> {
    try {
      const response = await fetch(`${API_BASE}/market/daily-brief?watchlist=${encodeURIComponent(symbols.join(','))}`);
      if (!response.ok) {
        return {
          title: 'Your daily brief is ready',
          dateText: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
          updatesToday: 0,
          cards: [],
        };
      }
      const payload = await response.json();
      return {
        title: typeof payload?.title === 'string' ? payload.title : 'Your daily brief is ready',
        dateText: typeof payload?.dateText === 'string' ? payload.dateText : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
        updatesToday: Number(payload?.updatesToday || payload?.cards?.length || 0),
        cards: Array.isArray(payload?.cards) ? payload.cards : [],
      };
    } catch {
      return {
        title: 'Your daily brief is ready',
        dateText: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
        updatesToday: 0,
        cards: [],
      };
    }
  }
}
