# LeakDetection App - Technical Documentation

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Getting Started](#getting-started)
5. [Development Guide](#development-guide)
6. [Building & Deployment](#building--deployment)
7. [App Features](#app-features)
8. [Architecture](#architecture)
9. [API Integration](#api-integration)
10. [Offline Functionality](#offline-functionality)
11. [Location Services](#location-services)
12. [Version Management](#version-management)
13. [Troubleshooting](#troubleshooting)
14. [Maintenance Guide](#maintenance-guide)

---

## Overview

**LeakDetection** is a mobile application built for field personnel to report water leaks, locate nearby water meters, and manage leak reports. The app is designed to work both online and offline, ensuring field workers can continue their tasks even in areas with poor connectivity.

### Key Features
- 🔐 Secure user authentication
- 📍 GPS-based leak location tracking
- 🗺️ Interactive maps with meter locations
- 📝 Leak report creation with photo attachments
- 💾 Offline data storage and sync
- 🔄 Background location tracking
- 📊 Dashboard with statistics
- 🔍 Meter search functionality
- 📋 Draft reports management

---

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React Native | 0.81.5 | Mobile app framework |
| Expo | SDK 54 | Development platform |
| MobX | 6.13.5 | State management |
| React Navigation | 6.x | App navigation |
| Axios | 1.12.2 | HTTP client |
| AsyncStorage | 2.2.0 | Local data persistence |
| expo-location | 19.0.7 | GPS/Location services |
| expo-image-picker | 17.0.8 | Camera/Photo access |
| react-native-maps | 1.20.1 | Map integration |
| react-native-webview | 13.15.0 | WebView for Leaflet maps |

---

## Project Structure

```
LeakDetectionV1/
├── App.js                    # Main app entry point
├── app.config.js             # Expo configuration
├── app.json                  # App manifest
├── eas.json                  # EAS Build configuration
├── package.json              # Dependencies & scripts
├── babel.config.js           # Babel configuration
├── metro.config.js           # Metro bundler config
│
├── android/                  # Native Android project
│   ├── app/
│   │   ├── build.gradle      # App-level build config
│   │   └── src/main/         # Android source files
│   ├── build.gradle          # Project-level build config
│   └── gradle.properties     # Gradle properties
│
├── assets/                   # Static assets (images, icons)
│
├── components/               # Reusable UI components
│   ├── AppHeader.js          # App header component
│   ├── ErrorBoundary.js      # Error handling wrapper
│   ├── LeafletMap.js         # Custom Leaflet map component
│   ├── NotificationBanner.js # In-app notifications
│   └── OfflineTile.js        # Offline map tiles
│
├── navigation/               # Navigation configuration
│   └── AppNavigator.js       # Main navigation setup
│
├── screens/                  # App screens
│   ├── DashboardScreen.js    # Main dashboard
│   ├── DraftsScreen.js       # Draft reports
│   ├── FindNearestScreen.js  # Find nearest meter
│   ├── HomeScreen.js         # Home screen
│   ├── LeakReportFormScreen.js # Leak report form
│   ├── LoginScreen.js        # User login
│   ├── NearestMetersScreen.js # Nearby meters list
│   ├── ReportHomeScreen.js   # Report section home
│   ├── ReportScreen.js       # Report map view
│   ├── SettingsScreen.js     # App settings
│   └── SplashScreen.js       # App splash/loading
│
├── services/                 # Business logic & API
│   ├── autoLogout.js         # Auto-logout functionality
│   ├── dataChecker.js        # Data sync checker
│   ├── downloadService.js    # Offline data download
│   ├── draftService.js       # Draft management
│   ├── interceptor.js        # API interceptor & auth
│   ├── locationGuard.js      # Location permission guard
│   ├── locationTracker.js    # Background location tracking
│   ├── notifications.js      # Push notifications
│   ├── offlineQueue.js       # Offline request queue
│   ├── offlineTileManager.js # Map tile caching
│   ├── syncService.js        # Data synchronization
│   └── updateChecker.js      # App update checker
│
├── stores/                   # MobX state stores
│   ├── AuthStore.js          # Authentication state
│   ├── DashboardStore.js     # Dashboard data
│   ├── DownloadStore.js      # Download progress
│   ├── DraftsStore.js        # Draft reports state
│   ├── LeakReportStore.js    # Leak report form state
│   ├── LocationStore.js      # Location state
│   ├── NearestMetersStore.js # Nearby meters state
│   ├── NotificationStore.js  # Notification state
│   ├── OfflineStore.js       # Offline mode state
│   ├── ReportMapStore.js     # Map state
│   ├── RootStore.js          # Root store provider
│   └── SettingsStore.js      # Settings state
│
├── styles/                   # Separated StyleSheet files
│   ├── DashboardStyles.js
│   ├── DraftsStyles.js
│   ├── FindNearestStyles.js
│   ├── HomeStyles.js
│   ├── LeakReportFormStyles.js
│   ├── LoginStyles.js
│   ├── NearestMetersStyles.js
│   ├── ReportHomeStyles.js
│   ├── ReportStyles.js
│   ├── SettingsStyles.js
│   └── SplashStyles.js
│
├── scripts/                  # Utility scripts
│   └── bumpVersion.js        # Version management script
│
└── docs/                     # Documentation
    └── DOCUMENTATION.md      # This file
```

---

## Getting Started

### Prerequisites

1. **Node.js** (v18 or higher recommended)
   - Download: https://nodejs.org/

2. **Expo CLI**
   ```bash
   npm install -g expo-cli
   ```

3. **EAS CLI** (for building)
   ```bash
   npm install -g eas-cli
   ```

4. **Expo Go App** (for development testing)
   - [Android Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)

5. **Android Studio** (for native builds - optional)
   - Required for `expo run:android`
   - Download: https://developer.android.com/studio

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/B0GARTT00/LeakDetectionV1.git
   cd LeakDetectionV1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables** (if needed)
   - Create `.env` file for API keys
   - Configure Google Maps API key in `app.config.js`

---

## Development Guide

### Starting the Development Server

```bash
# Start Expo development server
npm start
# or
expo start

# Start with cache cleared
expo start -c

# Start for specific platform
expo start --android
expo start --ios
```

### Running on Device/Emulator

**Using Expo Go (Recommended for development):**
1. Start the dev server: `npm start`
2. Scan QR code with Expo Go app

**Using Native Build:**
```bash
# Android
expo run:android

# iOS (macOS only)
expo run:ios
```

### Code Structure Guidelines

#### Screens
- Each screen is in `screens/` folder
- Screens use MobX stores for state management
- Wrap components with `observer` from `mobx-react-lite`
- Styles are separated into `styles/` folder

#### Stores (MobX)
- All state management uses MobX
- Stores are in `stores/` folder
- Access stores via hooks from `RootStore.js`

```javascript
// Example: Using a store
import { observer } from 'mobx-react-lite';
import { useAuthStore } from '../stores/RootStore';

const MyScreen = observer(() => {
  const authStore = useAuthStore();
  // Use authStore.someValue, authStore.someAction()
});
```

#### Services
- Business logic in `services/` folder
- API calls through `interceptor.js`
- Offline handling in dedicated services

---

## Building & Deployment

### Quick Build (Recommended)

The fastest way to build a production-ready AAB for Play Store with auto version increment:

```bash
node scripts/bumpVersion.js --build
```

This single command will:
1. ✅ Increment the patch version (e.g., 1.0.7 → 1.0.8)
2. ✅ Update version in `package.json`, `app.config.js`, and `build.gradle`
3. ✅ Build the release AAB automatically

#### Version Bump Options

| Command | Version Change | Example |
|---------|---------------|---------|
| `node scripts/bumpVersion.js --build` | Patch | 1.0.7 → 1.0.8 |
| `node scripts/bumpVersion.js minor --build` | Minor | 1.0.7 → 1.1.0 |
| `node scripts/bumpVersion.js major --build` | Major | 1.0.7 → 2.0.0 |

#### Build Output Location

After successful build, the AAB file is located at:
```
android/app/build/outputs/bundle/release/app-release.aab
```

---

### Build Types

| Build Type | Command | Output | Use Case |
|------------|---------|--------|----------|
| Development | `eas build --profile development` | APK | Internal testing with dev client |
| Preview | `eas build --profile preview` | APK | Internal distribution |
| Production | `eas build --profile production` | AAB | Play Store submission |

### Building for Android

#### Preview Build (APK)
```bash
eas build --platform android --profile preview
```

#### Production Build (AAB for Play Store)
```bash
eas build --platform android --profile production
```

### Building Locally

```bash
# Generate native Android project (if not already done)
expo prebuild

# Navigate to android folder
cd android

# Build Debug APK
./gradlew assembleDebug

# Build Release APK
./gradlew assembleRelease

# Build Release AAB (for Play Store)
./gradlew bundleRelease

# Build all variants
./gradlew build

# Clean build folder before building
./gradlew clean
./gradlew bundleRelease
```

Build outputs:
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release APK: `android/app/build/outputs/apk/release/app-release.apk`
- Release AAB: `android/app/build/outputs/bundle/release/app-release.aab`

### Common Gradle Commands

| Command | Description |
|---------|-------------|
| `./gradlew assembleDebug` | Build debug APK |
| `./gradlew assembleRelease` | Build release APK |
| `./gradlew bundleRelease` | Build release AAB for Play Store |
| `./gradlew build` | Build all variants |
| `./gradlew clean` | Clean build folder |
| `./gradlew tasks` | List all available tasks |

### Play Store Submission

1. **Build with version increment:**
   ```bash
   node scripts/bumpVersion.js --build
   ```
2. **Locate the AAB file:**
   ```
   android/app/build/outputs/bundle/release/app-release.aab
   ```
3. **Upload to Play Console:**
   - Go to [Google Play Console](https://play.google.com/console/)
   - Select **LeakDetection** app
   - Navigate to **Production** → **Create new release**
   - Upload the `app-release.aab` file
   - Add release notes
   - Submit for review

---

## App Features

### 1. Authentication
- Username/password login
- Token-based authentication with refresh
- "Remember Me" functionality
- Auto-logout after inactivity

### 2. Dashboard
- Overview statistics
- Recent activity
- Quick actions
- Pending sync indicator

### 3. Leak Reporting
- Create new leak reports
- Capture photos (camera/gallery)
- GPS location tagging
- Form validation
- Draft saving

### 4. Map Features
- Interactive map view
- Meter locations display
- Leak location selection
- Offline tile caching
- Current location tracking

### 5. Meter Search
- Search by meter number
- Find nearest meters
- View meter details
- Navigate to meter location

### 6. Offline Mode
- Automatic offline detection
- Data caching
- Queue pending requests
- Sync when online
- Download data for offline use

### 7. Settings
- View account info
- Download offline data
- Clear cached data
- Check for updates
- Logout

---

## Architecture

### State Management (MobX)

```
┌─────────────────────────────────────────────────┐
│                   RootStore                      │
│  (Provider for all stores)                       │
├─────────────────────────────────────────────────┤
│  AuthStore      │ DashboardStore │ OfflineStore │
│  LocationStore  │ LeakReportStore│ DraftsStore  │
│  SettingsStore  │ ReportMapStore │ etc...       │
└─────────────────────────────────────────────────┘
```

### Navigation Structure

```
NavigationContainer
├── Stack.Navigator
│   ├── SplashScreen
│   ├── LoginScreen
│   └── MainTabs (Bottom Tab Navigator)
│       ├── Dashboard Tab
│       │   └── DashboardScreen
│       ├── Report Tab (Stack)
│       │   ├── ReportHomeScreen
│       │   ├── ReportScreen (Map)
│       │   ├── FindNearestScreen
│       │   ├── NearestMetersScreen
│       │   └── LeakReportFormScreen
│       ├── Drafts Tab
│       │   └── DraftsScreen
│       └── Settings Tab
│           └── SettingsScreen
```

### Data Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Screen  │ ──► │  Store   │ ──► │ Service  │
│(observer)│ ◄── │  (MobX)  │ ◄── │  (API)   │
└──────────┘     └──────────┘     └──────────┘
                       │
                       ▼
               ┌──────────────┐
               │ AsyncStorage │
               │ (Offline DB) │
               └──────────────┘
```

---

## API Integration

### Base Configuration

API configuration is in `services/interceptor.js`:

```javascript
export const API_BASE = 'https://your-api-server.com';
```

### Authentication Flow

1. User submits credentials
2. `login()` sends POST to `/admin/userlogin/login`
3. Server returns tokens (access + refresh)
4. Tokens stored in AsyncStorage
5. Axios interceptor adds token to all requests
6. Token refresh handled automatically on 401

### Key API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/userlogin/login` | POST | User login |
| `/admin/userlogin/refresh` | POST | Refresh token |
| `/leak-reports` | GET/POST | Leak reports CRUD |
| `/meters` | GET | Fetch meters |
| `/meters/search` | GET | Search meters |
| `/customers` | GET | Customer data |

---

## Offline Functionality

### How Offline Mode Works

1. **Detection**: App monitors network status via `@react-native-community/netinfo`
2. **Data Caching**: Critical data cached in AsyncStorage
3. **Request Queue**: Failed requests queued in `offlineQueue.js`
4. **Sync**: Queued requests sent when connection restored

### Downloading Offline Data

Users can download data for offline use in Settings:

1. Go to Settings
2. Tap "Download Offline Data"
3. Wait for download to complete
4. Data available offline

### Cached Data Includes
- Customer/meter information
- DMA codes
- Map tiles (configurable area)
- User preferences

---

## Location Services

### Permissions Required

**Android:**
- `ACCESS_FINE_LOCATION` - Precise GPS
- `ACCESS_COARSE_LOCATION` - Approximate location
- `ACCESS_BACKGROUND_LOCATION` - Background tracking

**iOS:**
- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`

### Location Guard

The app uses `locationGuard.js` to verify user is within allowed service area before allowing access.

### Background Tracking

Background location tracking is handled by `locationTracker.js`:
- Uses `expo-task-manager`
- Tracks location when app is backgrounded
- Sends location updates to server

---

## Version Management

### Current Version Info

- **App Version**: 1.0.7 (in `app.config.js`)
- **Version Code**: 11 (Android)
- **Build Number**: 11 (iOS)

### Version Bump Script

Use the included script to manage versions:

```bash
# Increment patch version (1.0.7 → 1.0.8)
npm run version:bump

# Increment minor version (1.0.7 → 1.1.0)
npm run version:bump minor

# Increment major version (1.0.7 → 2.0.0)
npm run version:bump major

# Bump and build AAB
npm run version:bump -- --build
```

The script updates:
- `package.json` version
- `app.config.js` version and versionCode
- `android/app/build.gradle` versionCode and versionName

### Manual Version Update

If needed, update these files manually:

1. **package.json**: `"version": "x.x.x"`
2. **app.config.js**: 
   - `version: "x.x.x"`
   - `android.versionCode: N` (increment by 1)
   - `ios.buildNumber: "N"` (increment by 1)
3. **android/app/build.gradle**:
   - `versionCode N`
   - `versionName "x.x.x"`

---

## Troubleshooting

### Common Issues

#### 1. "Metro bundler stuck"
```bash
# Clear cache and restart
expo start -c
```

#### 2. "Unable to resolve module"
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
```

#### 3. "Build failed - Gradle error"
```bash
# Clean Android build
cd android
./gradlew clean
cd ..
expo run:android
```

#### 4. "Location permission denied"
- Check device settings
- Ensure location services enabled
- Grant app location permission

#### 5. "API connection failed"
- Check internet connectivity
- Verify API server is running
- Check API_BASE URL in interceptor.js

#### 6. "Storage full error"
- App automatically clears heavy cache
- User can manually clear in Settings
- Check device storage space

### Debug Mode

Enable debug logs:
```javascript
// In any service file
console.log('[ServiceName] Debug message', data);
```

View logs:
```bash
# React Native logs
npx react-native log-android

# Or in Expo
expo start --dev-client
```

---

## Maintenance Guide

### Regular Maintenance Tasks

1. **Weekly**
   - Check for dependency updates
   - Review error logs
   - Monitor API performance

2. **Monthly**
   - Update Expo SDK if new version available
   - Review and clean up unused code
   - Update documentation

3. **Before Release**
   - Bump version numbers
   - Test on multiple devices
   - Verify offline functionality
   - Check all API endpoints
   - Review Play Store requirements

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update Expo SDK
expo upgrade

# Update specific package
npm update package-name

# Update all packages (use cautiously)
npm update
```

### Database/Cache Cleanup

Users can clear cache from Settings screen. For development:

```bash
# Clear AsyncStorage (in app)
await AsyncStorage.clear();

# Clear Expo cache
expo start -c
```

### Monitoring

Key metrics to monitor:
- App crash rate
- API response times
- Offline sync success rate
- Location tracking accuracy
- User session duration

---

## Quick Reference

### NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run android` | Run on Android |
| `npm run ios` | Run on iOS |
| `npm run version:bump` | Increment version |

### EAS Commands

| Command | Description |
|---------|-------------|
| `eas build --platform android --profile preview` | Build preview APK |
| `eas build --platform android --profile production` | Build production AAB |
| `eas submit --platform android` | Submit to Play Store |

### Useful Links

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Docs](https://reactnative.dev/)
- [MobX Documentation](https://mobx.js.org/)
- [EAS Build Docs](https://docs.expo.dev/build/introduction/)
- [Play Console](https://play.google.com/console/)

---

## Contact & Support

For technical support or questions about this application, contact the development team.

---

*Last Updated: December 2024*
*Version: 1.0.7*
