import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearAnalysisRetryRequest,
  getAnalysisRetryRequest,
  storeAnalysisRetryRequest,
} from '../services/analysisRetry';

test('failed chart analysis retry keeps the uploaded image in transient app memory', () => {
  const request = {
    imageBase64: 'chart-image',
    imageMimeType: 'image/png',
    imageUri: 'file:///chart.png',
    pair: 'GBPUSD',
  };

  storeAnalysisRetryRequest(request);
  assert.deepEqual(getAnalysisRetryRequest(), request);

  clearAnalysisRetryRequest();
  assert.equal(getAnalysisRetryRequest(), null);
});
