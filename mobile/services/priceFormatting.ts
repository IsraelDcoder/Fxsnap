import { getInstrument } from '@/services/instruments';

export interface PriceFormatOptions {
  fixedPrecision?: number;
}

function expandScientificNotation(value: string) {
  const match = value.match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
  if (!match) return value;

  const [, sign, integer, fraction = '', exponentText] = match;
  const digits = `${integer}${fraction}`;
  const decimalPosition = integer.length + Number(exponentText);
  if (decimalPosition <= 0) return `${sign}0.${'0'.repeat(-decimalPosition)}${digits}`;
  if (decimalPosition >= digits.length) return `${sign}${digits}${'0'.repeat(decimalPosition - digits.length)}`;
  return `${sign}${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
}

function normalizeNumericPrice(value: string) {
  const input = value.trim();
  const trimmed = /[eE][+-]?\d+$/.test(input) && Number.isFinite(Number(input))
    ? expandScientificNotation(input)
    : input;
  const match = trimmed.match(/^([+-]?)(?:(\d{1,3}(?:,\d{3})+|\d+))(?:\.(\d+))?$/);
  if (!match) return null;
  const [, sign, integer, fraction = ''] = match;
  const normalizedFraction = fraction.replace(/0+$/, '');
  return `${sign}${integer.replace(/,/g, '')}${normalizedFraction ? `.${normalizedFraction}` : ''}`;
}

export function formatInstrumentPrice(
  value: unknown,
  instrumentId: string,
  options: PriceFormatOptions = {},
): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'string' && !value.trim()) return null;

  const instrument = getInstrument(instrumentId.replace(/[^A-Z0-9]/gi, ''));
  const fixedPrecision = options.fixedPrecision ?? instrument?.fixedPricePrecision;
  if (fixedPrecision !== undefined
    && (!Number.isInteger(fixedPrecision) || fixedPrecision < 0 || fixedPrecision > 20)) {
    return null;
  }

  const raw = typeof value === 'number'
    ? expandScientificNotation(value.toString())
    : value;
  const normalized = normalizeNumericPrice(raw);
  if (normalized === null) return null;

  if (fixedPrecision === undefined) return normalized;
  const [integer, fraction = ''] = normalized.split('.');
  return `${integer}${fixedPrecision > 0
    ? `.${fraction.padEnd(fixedPrecision, '0')}`
    : ''}`;
}

export function formatInstrumentPriceText(value: unknown, instrumentId: string): string {
  if (value == null || (typeof value === 'number' && !Number.isFinite(value))) return '—';
  if (typeof value === 'number') return formatInstrumentPrice(value, instrumentId) ?? '—';
  if (typeof value !== 'string') return '—';

  const text = value.trim();
  if (!text || /^(?:nan|[+-]?infinity)$/i.test(text)) return '—';
  if (/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) {
    return formatInstrumentPrice(text, instrumentId) ?? '—';
  }
  const pricePattern = /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  return text.replace(pricePattern, (match) => formatInstrumentPrice(match, instrumentId) ?? match);
}
