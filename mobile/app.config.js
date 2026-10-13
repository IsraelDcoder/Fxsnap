const config = require('./app.json').expo;
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

if (googleServicesFile) {
  config.android.googleServicesFile = googleServicesFile;
}

module.exports = config;
