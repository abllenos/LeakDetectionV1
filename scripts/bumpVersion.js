#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read package.json
const packagePath = path.join(__dirname, '../package.json');
const appConfigPath = path.join(__dirname, '../app.config.js');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// Parse current version
const [major, minor, patch] = packageJson.version.split('.').map(Number);

// Increment patch version
const newVersion = `${major}.${minor}.${patch + 1}`;

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`✅ Version bumped: ${packageJson.version} → ${newVersion}`);

// Update app.config.js (for Expo)
let appConfig = fs.readFileSync(appConfigPath, 'utf8');

// Update version in app.config.js
appConfig = appConfig.replace(
  /version:\s*["'][\d.]+["']/,
  `version: "${newVersion}"`
);

// Increment buildNumber
const buildMatch = appConfig.match(/buildNumber:\s*["'](\d+)["']/);
if (buildMatch) {
  const currentBuild = parseInt(buildMatch[1]);
  const newBuild = currentBuild + 1;
  appConfig = appConfig.replace(
    /buildNumber:\s*["']\d+["']/,
    `buildNumber: "${newBuild}"`
  );
  console.log(`✅ Build number bumped: ${currentBuild} → ${newBuild}`);
}

// Increment versionCode for Android
const versionCodeMatch = appConfig.match(/versionCode:\s*(\d+)/);
if (versionCodeMatch) {
  const currentVersionCode = parseInt(versionCodeMatch[1]);
  const newVersionCode = currentVersionCode + 1;
  appConfig = appConfig.replace(
    /versionCode:\s*\d+/,
    `versionCode: ${newVersionCode}`
  );
  console.log(`✅ Android versionCode bumped: ${currentVersionCode} → ${newVersionCode}`);
}

fs.writeFileSync(appConfigPath, appConfig);

console.log(`\n🎉 Version bump complete!`);
console.log(`   Version: ${newVersion}`);
console.log(`   Ready to commit and push\n`);
