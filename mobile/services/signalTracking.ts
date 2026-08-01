import { getApiHeaders } from '@/services/apiAuth';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export async function recordGeneratedSignal(signal: { id: string; pair: string; direction: 'BUY' | 'SELL'; entry: number; sl: number; tp: number; }) {
  try {
    await fetch(`${API_URL}/api/signals`, { method: 'POST', headers: await getApiHeaders(), body: JSON.stringify({ ...signal, generatedAt: new Date().toISOString() }) });
  } catch { /* Signal persistence must not block the user result. */ }
}

export async function recordSignalOutcome(id: string, outcome: 'win' | 'loss' | 'open', realizedR?: number) {
  try {
    await fetch(`${API_URL}/api/signals/${encodeURIComponent(id)}`, { method: 'PATCH', headers: await getApiHeaders(), body: JSON.stringify({ outcome, realizedR, outcomeAt: new Date().toISOString() }) });
  } catch { /* Outcome tracking is best effort until a journal UI is available. */ }
}
