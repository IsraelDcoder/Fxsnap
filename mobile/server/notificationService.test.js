const test = require('node:test');
const assert = require('node:assert/strict');
const supabasePushStore = require('./supabasePushStore');
const { registerPushToken, unregisterPushToken } = require('./notificationService');

test('push token registration stores the anonymous device account association', async () => {
  const originalRegister = supabasePushStore.register;
  let registration;
  supabasePushStore.register = async (...args) => { registration = args; };

  try {
    const accountId = `device_${'b'.repeat(32)}`;
    await registerPushToken('anonymous-device-identifier-1234', {
      token: 'ExponentPushToken[test-token-123]',
      platform: 'ios',
      preferences: { enabled: true },
      accountId,
      supabaseUserId: null,
    });

    test('push token unregistration removes the signed device registration regardless of account association', async () => {
      const originalRemove = supabasePushStore.remove;
      let removedDeviceId;
      supabasePushStore.remove = async (deviceId) => { removedDeviceId = deviceId; };

      try {
        await unregisterPushToken('anonymous-device-identifier-1234');
        assert.equal(removedDeviceId, 'anonymous-device-identifier-1234');
      } finally {
        supabasePushStore.remove = originalRemove;
      }
    });

    assert.equal(registration[4], accountId);
    assert.equal(registration[5], null);
  } finally {
    supabasePushStore.register = originalRegister;
  }
});
