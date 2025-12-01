#!/usr/bin/env node

/**
 * Version Bump Script for LeakDetection
 * 
 * Usage:
 *   node scripts/bumpVersion.js           - Increment patch version (1.0.4 -> 1.0.5)
 *   node scripts/bumpVersion.js minor     - Increment minor (1.0.4 -> 1.1.0)
 *   node scripts/bumpVersion.js major     - Increment major (1.0.4 -> 2.0.0)
 *   node scripts/bumpVersion.js --build   - Build AAB after incrementing
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// File paths
const packagePath = path.join(__dirname, '../package.json');
const appConfigPath = path.join(__dirname, '../app.config.js');
const buildGradlePath = path.join(__dirname, '../android/app/build.gradle');

// Parse args
const args = process.argv.slice(2);
const bumpType = args.find(a => ['patch', 'minor', 'major'].includes(a)) || 'patch';
const shouldBuild = args.includes('--build');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// Parse current version
const [major, minor, patch] = packageJson.version.split('.').map(Number);

// Calculate new version based on bump type
let newVersion;
switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

console.log(`\n📦 LeakDetection Version Bump (${bumpType})\n`);

// Update package.json
const oldVersion = packageJson.version;
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
console.log(`✅ package.json: ${oldVersion} → ${newVersion}`);

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

// Update android/app/build.gradle
let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');

// Update versionCode in build.gradle
const gradleVersionCodeMatch = buildGradle.match(/versionCode\s+(\d+)/);
if (gradleVersionCodeMatch) {
  const currentGradleVersionCode = parseInt(gradleVersionCodeMatch[1]);
  const newGradleVersionCode = currentGradleVersionCode + 1;
  buildGradle = buildGradle.replace(
    /versionCode\s+\d+/,
    `versionCode ${newGradleVersionCode}`
  );
  console.log(`✅ build.gradle versionCode: ${currentGradleVersionCode} → ${newGradleVersionCode}`);
}

// Update versionName in build.gradle
buildGradle = buildGradle.replace(
  /versionName\s+["'][^"']+["']/,
  `versionName "${newVersion}"`
);
console.log(`✅ build.gradle versionName: → ${newVersion}`);

fs.writeFileSync(buildGradlePath, buildGradle);

console.log(`\n🎉 Version bump complete!`);
console.log(`   Version: ${newVersion}`);

// Build if requested
if (shouldBuild) {
  console.log(`\n🔨 Building AAB...\n`);
  try {
    execSync('cd android && .\\gradlew bundleRelease', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log(`\n✅ Build complete!`);
    console.log(`📁 AAB: android/app/build/outputs/bundle/release/app-release.aab\n`);
  } catch (error) {
    console.error(`\n❌ Build failed\n`);
    process.exit(1);
  }
} else {
  console.log(`\n💡 To build AAB, run:`);
  console.log(`   node scripts/bumpVersion.js --build`);
  console.log(`   or: cd android && .\\gradlew bundleRelease\n`);
}
