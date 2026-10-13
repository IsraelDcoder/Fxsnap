import assert from 'node:assert/strict';
import test from 'node:test';
import { getNotificationEnableErrorMessage } from '../services/notificationErrors';

test('notification errors distinguish network failures from backend registration errors', () => {
  assert.match(getNotificationEnableErrorMessage(new TypeError('Network request failed')), /internet connection/i);
  assert.match(getNotificationEnableErrorMessage(new Error('Push token registration failed (503): storage unavailable')), /temporarily unavailable/i);
  assert.match(getNotificationEnableErrorMessage(new Error('Push token registration failed (400): Invalid Expo push token.')), /Invalid Expo push token/i);
});

test('notification errors explain Expo token setup and missing project configuration', () => {
  assert.match(getNotificationEnableErrorMessage(new Error('Expo push-token request failed: Firebase credentials missing')), /push token/i);
  assert.match(getNotificationEnableErrorMessage(new Error('Expo project ID is missing from app configuration.')), /not configured/i);
});

test('production Expo token errors include safe native diagnostic fields', async () => {
  const { formatExpoPushTokenError } = await import('../services/notificationErrors');
  const detail = formatExpoPushTokenError({
    name: 'FirebaseError',
    message: 'FCM registration failed with API_KEY=private-value',
    code: 'MismatchSenderId',
    details: 'ExponentPushToken[private-token]',
  });

  assert.match(detail, /FirebaseError/);
  assert.match(detail, /MismatchSenderId/);
  assert.match(detail, /API_KEY=\[redacted\]/);
  assert.doesNotMatch(detail, /private-value|private-token/);
});
