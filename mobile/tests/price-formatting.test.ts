import assert from 'node:assert/strict';
import test from 'node:test';
import { formatInstrumentPrice, formatInstrumentPriceText } from '../services/priceFormatting';

test('removes only insignificant fractional zeros', () => {
  assert.equal(formatInstrumentPrice('82439.21000', 'BTCUSD'), '82439.21');
  assert.equal(formatInstrumentPrice('1.08450000', 'EURUSD'), '1.0845');
  assert.equal(formatInstrumentPrice('1.27500000', 'EURUSD'), '1.275');
  assert.equal(formatInstrumentPrice('2650.23000', 'XAUUSD'), '2650.23');
  assert.equal(formatInstrumentPrice('149.50000', 'USDJPY'), '149.5');
  assert.equal(formatInstrumentPrice('1.084523', 'EURUSD'), '1.084523');
});

test('accepts numeric values and preserves integer prices without a decimal point', () => {
  assert.equal(formatInstrumentPrice(2650.23, 'XAUUSD'), '2650.23');
  assert.equal(formatInstrumentPrice('1e-7', 'EURUSD'), '0.0000001');
  assert.equal(formatInstrumentPrice('68,000.000', 'BTCUSD'), '68000');
  assert.equal(formatInstrumentPrice(82439, 'BTCUSD'), '82439');
});

test('keeps fixed precision only when explicitly configured', () => {
  assert.equal(formatInstrumentPrice('149.5', 'USDJPY', { fixedPrecision: 3 }), '149.500');
  assert.equal(formatInstrumentPrice('149.5123', 'USDJPY', { fixedPrecision: 3 }), '149.5123');
  assert.equal(formatInstrumentPrice('149.5', 'USDJPY', { fixedPrecision: -1 }), null);
});

test('rejects missing, invalid, and non-finite numeric prices', () => {
  assert.equal(formatInstrumentPrice(null, 'EURUSD'), null);
  assert.equal(formatInstrumentPrice(undefined, 'EURUSD'), null);
  assert.equal(formatInstrumentPrice('', 'EURUSD'), null);
  assert.equal(formatInstrumentPrice('not-a-price', 'EURUSD'), null);
  assert.equal(formatInstrumentPrice(Number.NaN, 'EURUSD'), null);
  assert.equal(formatInstrumentPrice(Number.POSITIVE_INFINITY, 'EURUSD'), null);
});

test('formats numeric price text and leaves non-price labels intact', () => {
  assert.equal(formatInstrumentPriceText('1.08450000 – 1.08500000', 'EURUSD'), '1.0845 – 1.085');
  assert.equal(formatInstrumentPriceText('68,000.50000 / 67,500.000', 'BTCUSD'), '68000.5 / 67500');
  assert.equal(formatInstrumentPriceText('Not identified', 'EURUSD'), 'Not identified');
  assert.equal(formatInstrumentPriceText(Number.NaN, 'EURUSD'), '—');
  assert.equal(formatInstrumentPriceText('Infinity', 'EURUSD'), '—');
});
