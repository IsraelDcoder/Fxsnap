const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureOptionalHardwareFeature } = require('../plugins/withOptionalBluetoothFeatures');

test('adds Bluetooth features as optional when absent', () => {
  const manifest = {};

  ensureOptionalHardwareFeature(manifest, 'android.hardware.bluetooth');

  assert.deepEqual(manifest['uses-feature'], [{
    $: {
      'android:name': 'android.hardware.bluetooth',
      'android:required': 'false',
    },
  }]);
});

test('makes an existing Bluetooth feature optional without duplicating it', () => {
  const feature = { $: { 'android:name': 'android.hardware.bluetooth', 'android:required': 'true' } };
  const manifest = { 'uses-feature': [feature] };

  ensureOptionalHardwareFeature(manifest, 'android.hardware.bluetooth');
  ensureOptionalHardwareFeature(manifest, 'android.hardware.bluetooth');

  assert.equal(manifest['uses-feature'].length, 1);
  assert.equal(feature.$['android:required'], 'false');
});
