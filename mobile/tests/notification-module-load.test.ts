import assert from 'node:assert/strict';
import test from 'node:test';

const Module = require('node:module');
const notificationServicePath = require.resolve('../server/notificationService.js');

test('notification service loads when expo-server-sdk cannot be required as CommonJS', () => {
  const originalLoad = Module._load;
  const originalPath = require.cache[notificationServicePath];
  delete require.cache[notificationServicePath];

  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'expo-server-sdk') {
      throw new Error('ERR_REQUIRE_ESM: expo-server-sdk is ESM-only in the Vercel runtime');
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    assert.doesNotThrow(() => require('../server/notificationService.js'));
  } finally {
    Module._load = originalLoad;
    if (originalPath) require.cache[notificationServicePath] = originalPath;
    else delete require.cache[notificationServicePath];
  }
});
