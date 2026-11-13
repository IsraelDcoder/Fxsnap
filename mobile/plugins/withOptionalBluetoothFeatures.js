const { withAndroidManifest } = require('@expo/config-plugins');

const OPTIONAL_BLUETOOTH_FEATURES = [
  'android.hardware.bluetooth',
  'android.hardware.bluetooth_le',
];

function ensureOptionalHardwareFeature(manifest, featureName) {
  const features = manifest['uses-feature'] ?? [];
  const existingFeature = features.find((feature) => feature.$?.['android:name'] === featureName);

  if (existingFeature) {
    existingFeature.$['android:required'] = 'false';
  } else {
    features.push({
      $: {
        'android:name': featureName,
        'android:required': 'false',
      },
    });
  }

  manifest['uses-feature'] = features;
}

function withOptionalBluetoothFeatures(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    for (const featureName of OPTIONAL_BLUETOOTH_FEATURES) {
      ensureOptionalHardwareFeature(configWithManifest.modResults.manifest, featureName);
    }
    return configWithManifest;
  });
}

module.exports = withOptionalBluetoothFeatures;
module.exports.ensureOptionalHardwareFeature = ensureOptionalHardwareFeature;
