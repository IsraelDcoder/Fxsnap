const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
import { getApiHeaders } from '@/services/apiAuth';

export interface ChartValidationResult {
  isChart: boolean;
  confidence: number;
  reason: string;
  detectedPair?: string | null;
  timeframe?: string | null;
  trend?: string | null;
  indicators?: string[];
  support?: string[];
  resistance?: string[];
  chartNotes?: string[];
}

export async function validateChartImage(imageBase64: string, mimeType = 'image/jpeg', pair?: string): Promise<ChartValidationResult> {
  try {
    const response = await fetch(`${API_URL}/api/chart-analysis`, { method: 'POST', headers: await getApiHeaders(), body: JSON.stringify({ imageBase64, mimeType, pair }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Chart AI is unavailable.');
    return { isChart: payload.isChart === true, confidence: Math.max(0, Math.min(100, Number(payload.confidence) || 0)), reason: typeof payload.reason === 'string' ? payload.reason : 'Chart analysis completed.', detectedPair: payload.detectedPair || null, timeframe: payload.timeframe || null, trend: payload.trend || null, indicators: Array.isArray(payload.indicators) ? payload.indicators : [], support: Array.isArray(payload.support) ? payload.support : [], resistance: Array.isArray(payload.resistance) ? payload.resistance : [], chartNotes: Array.isArray(payload.chartNotes) ? payload.chartNotes : [] };
  } catch (error) { console.error('[Chart Detection] Error:', error); return { isChart: false, confidence: 0, reason: error instanceof Error ? error.message : 'Unable to analyze image.' }; }
}

export async function detectPairFromChart(imageBase64: string, mimeType = 'image/jpeg'): Promise<string | null> {
  const result = await validateChartImage(imageBase64, mimeType);
  return result.detectedPair || null;
}
