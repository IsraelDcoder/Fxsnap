const fs = require('node:fs');
const path = require('node:path');
const config = require('./app.json').expo;
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

if (googleServicesFile) {
  const resolvedGoogleServicesFile = path.resolve(googleServicesFile);
  if (!fs.existsSync(resolvedGoogleServicesFile)) {
    throw new Error('GOOGLE_SERVICES_JSON must point to an available google-services.json file.');
  }
  const googleServices = JSON.parse(fs.readFileSync(resolvedGoogleServicesFile, 'utf8'));
  const packageName = config.android.package;
  const matchingClient = googleServices.client?.find(
    (client) => client.client_info?.android_client_info?.package_name === packageName,
  );
  const hasFirebaseApiKey = matchingClient?.api_key?.some(
    (key) => typeof key.current_key === 'string' && key.current_key.length > 0,
  );
  if (!googleServices.project_info?.project_id
    || !googleServices.project_info?.project_number
    || !matchingClient
    || !hasFirebaseApiKey) {
    throw new Error(`google-services.json does not contain a Firebase Android client for ${packageName}.`);
  }
  config.android.googleServicesFile = resolvedGoogleServicesFile;
} else if (process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PROFILE === 'production') {
  throw new Error('GOOGLE_SERVICES_JSON is required for the Android production build.');
}

module.exports = config;
