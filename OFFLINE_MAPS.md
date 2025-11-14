# Offline Maps Implementation

## Overview
The LeakDetection app now supports **true offline maps** functionality. Map tiles for Davao City area are downloaded and cached locally, allowing the app to work without internet connectivity.

## Features

### ✅ What Works
- **Automatic Tile Downloading**: Downloads map tiles for Davao City area (zoom levels 12-16)
- **Local Tile Storage**: Stores tiles in device cache using expo-file-system
- **Progress Tracking**: Real-time download progress with percentage
- **Storage Management**: Calculates and displays storage usage
- **Cache Clearing**: Ability to delete all cached tiles
- **Automatic Online/Offline Switching**: Detects internet connection and automatically switches between online and offline tiles
  - **When Online**: Uses fresh online tiles from OSM servers
  - **When Offline**: Switches to cached offline tiles automatically
  - **Real-time Detection**: Network status is monitored continuously

### 📍 Coverage Area
**Davao City Bounds:**
- Latitude: 6.9° to 7.2° N
- Longitude: 125.5° to 125.7° E
- Zoom Levels: 12, 13, 14, 15, 16 (suitable for leak detection work)

**Estimated Storage:**
- Total Tiles: ~15,000-20,000 tiles
- Storage Required: ~220-300 MB
- Average Tile Size: 15 KB

## How to Use

### For Users

#### Downloading Offline Maps
1. Open the app and go to **Settings** (gear icon)
2. Find the **"Offline Maps"** card
3. Tap **"Update Maps"** button
4. Confirm the download in the modal
5. Wait for download to complete (progress bar shows status)
6. Maps are now available offline!

#### Checking Status
- **Status Badge**: Shows "Offline Mode" when tiles are cached, "Online Only" when not
- **Cached Tiles**: Number of tiles stored locally
- **Storage Used**: Amount of device storage used in MB

#### Clearing Cache
1. Go to Settings → Offline Maps
2. Tap **"Clear Cache"** button
3. Confirm deletion
4. All cached tiles will be removed

### For Developers

#### Service API (`services/offlineTileManager.js`)

```javascript
import {
  downloadTilesForArea,
  calculateTileCount,
  getCachedTileCount,
  calculateStorageUsed,
  clearTileCache,
  hasOfflineTiles,
  getTileUri,
  checkTileExists,
} from '../services/offlineTileManager';

// Download tiles for Davao City
await downloadTilesForArea((progress) => {
  console.log(`${progress.percentage}% complete`);
  console.log(`${progress.current}/${progress.total} tiles`);
});

// Check if offline tiles exist
const hasOffline = await hasOfflineTiles(); // true/false

// Get cached tile count
const count = await getCachedTileCount(); // number

// Calculate storage used
const storageMB = await calculateStorageUsed(); // number in MB

// Clear all tiles
await clearTileCache();

// Get URI for specific tile (offline first, fallback to online)
const uri = await getTileUri(zoom, x, y, 'osm');
```

#### OfflineTile Component (`components/OfflineTile.js`)

The `OfflineTile` component automatically handles switching between online and offline map tiles based on network connectivity.

**Features:**
- **Automatic Network Detection**: Uses `@react-native-community/netinfo` to monitor internet connection
- **Smart Switching**: 
  - When **online** → Uses online tiles (fresh data from OSM servers)
  - When **offline** + has cache → Uses cached offline tiles
  - When **offline** + no cache → Falls back to online URL (will fail gracefully)
- **Real-time Updates**: Switches immediately when network status changes
- **Seamless Experience**: No user intervention needed

**Usage in Map Screens:**

```javascript
import MapView from 'react-native-maps';
import OfflineTile from '../components/OfflineTile';

<MapView>
  <OfflineTile 
    urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    maximumZ={19} 
    tileSize={256} 
  />
</MapView>
```

**How It Works:**

1. **Initialization**: Component checks if offline tiles are available on mount
2. **Network Listener**: Sets up listener for network status changes
3. **Automatic Switching**:
   - Network goes **offline** → Switches to local cached tiles
   - Network comes **online** → Switches back to online tiles
4. **Console Logging**: Logs all tile source changes for debugging

**Example Console Output:**
```
[OfflineTile] Offline tiles available
[OfflineTile] Network status changed: Online
[OfflineTile] Switching to ONLINE tiles
[OfflineTile] Network status changed: Offline
[OfflineTile] Switching to OFFLINE tiles from: file:///...
```

**Already Implemented In:**
- `screens/ReportScreen.js` - Main leak reporting map
- `screens/ReportHomeScreen.js` - Report home map view
- `screens/NearestMetersScreen.js` - Nearest meters map

#### Store Integration (`stores/SettingsStore.js`)

The SettingsStore automatically:
- Loads offline tile status on app start
- Updates tile count and storage when download completes
- Clears metadata when cache is deleted

```javascript
// In your component
const store = useSettingsStore();

// Start download
store.updateMaps(); // Opens modal
store.startMapDownload(); // Starts actual download

// Clear cache
store.clearCache(); // Opens confirmation modal
store.confirmClearCache(); // Deletes tiles

// Check status
console.log(store.cachedTiles); // Number of tiles
console.log(store.storageUsed); // MB used
console.log(store.mapsStatus); // "Offline Mode" or "Online Only"
```

## Technical Details

### Automatic Online/Offline Switching Logic

The `OfflineTile` component uses the following decision tree:

```
Network Status Check
   │
   ├─ Is Online?
   │  ├─ YES → Use ONLINE tiles (fresh from OSM servers)
   │  │         └─ urlTemplate = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
   │  │
   │  └─ NO → Is offline cache available?
   │           ├─ YES → Use OFFLINE tiles (from local storage)
   │           │         └─ urlTemplate = "file:///...cache.../osm/{z}/{x}/{y}.png"
   │           │
   │           └─ NO → Fallback to online URL (will fail to load)
   │                    └─ urlTemplate = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
```

**Network Detection:**
- Uses `@react-native-community/netinfo` package
- Considers device online only when BOTH conditions are met:
  - `state.isConnected === true` (device has network interface)
  - `state.isInternetReachable !== false` (device can reach internet servers)

**Switching Behavior:**
- **Going Offline**: Map immediately switches to cached tiles (if available)
- **Going Online**: Map immediately switches back to online tiles
- **No User Action Required**: Completely automatic and transparent

### Tile Coordinate System
Uses Web Mercator projection (EPSG:3857):
- Tiles are addressed as `/{z}/{x}/{y}.png`
- Z = zoom level (12-16)
- X = tile column (longitude-based)
- Y = tile row (latitude-based)

### File Structure
```
[cacheDirectory]/map_tiles/
  └── osm/
      ├── 12/
      │   ├── 3456/
      │   │   ├── 2123.png
      │   │   └── 2124.png
      │   └── 3457/
      ├── 13/
      ├── 14/
      ├── 15/
      └── 16/
```

### Metadata Storage
Stored in AsyncStorage as `offline_tiles_metadata`:
```json
{
  "downloadedAt": "2025-11-14T12:34:56.789Z",
  "totalTiles": 18432,
  "zoomLevels": [12, 13, 14, 15, 16],
  "bounds": {
    "minLat": 6.9,
    "maxLat": 7.2,
    "minLon": 125.5,
    "maxLon": 125.7
  }
}
```

### Download Behavior
- Downloads tiles sequentially to avoid overwhelming OSM servers
- 50ms delay between tile downloads (rate limiting)
- Skips tiles that already exist (resumable downloads)
- Progress reported after each tile
- Metadata saved after successful download

## Limitations

### Current Limitations
1. **react-native-maps UrlTile Constraint**: The `UrlTile` component doesn't support per-tile URL resolution. Tiles must be pre-downloaded; the component can't dynamically choose local vs online per tile.
   
2. **Coverage Area**: Only Davao City area is covered. To expand:
   - Edit `DAVAO_BOUNDS` in `offlineTileManager.js`
   - Edit `ZOOM_LEVELS` array for different detail levels

3. **Tile Source**: Currently uses OpenStreetMap. To use different sources:
   - Edit `TILE_SOURCES` object in `offlineTileManager.js`
   - Pass `source` parameter when downloading

4. **Storage**: Uses app cache directory (can be cleared by system)

### Future Enhancements
- [ ] Background download support
- [ ] Selective zoom level downloads
- [ ] Multiple tile source support
- [ ] Automatic tile updates
- [ ] Tile expiration/refresh
- [ ] Custom area selection
- [ ] Download pause/resume
- [ ] WiFi-only download option

## Testing

### Test Offline Functionality
1. Download offline maps via Settings
2. Enable Airplane Mode on device
3. Navigate to Report → Map screen
4. Verify maps display correctly
5. Test map interactions (pan, zoom, markers)
6. Disable Airplane Mode
7. Verify maps still work with internet

### Verify Storage Management
1. Check cached tiles count in Settings
2. Note storage used
3. Clear cache
4. Verify count resets to 0
5. Verify storage drops to 0 MB
6. Re-download and verify numbers update

## Troubleshooting

### Maps Don't Work Offline
- **Symptom**: Blank/gray tiles when offline
- **Cause**: Tiles not downloaded or cache cleared
- **Solution**: Go to Settings → Update Maps

### Download Fails
- **Symptom**: Progress stops or error message
- **Cause**: Network issues or storage full
- **Solution**: Check internet connection and storage space

### High Storage Usage
- **Symptom**: App using hundreds of MB
- **Cause**: Multiple tile sources or large area
- **Solution**: Clear cache and adjust zoom levels/bounds in code

### Tiles Not Updating
- **Symptom**: Old map data displayed
- **Cause**: Cached tiles don't expire
- **Solution**: Clear cache and re-download

## Performance

### Download Times (estimated)
- **Fast WiFi**: 10-15 minutes for full coverage
- **4G/LTE**: 20-30 minutes
- **Slow Connection**: 45+ minutes

### Memory Usage
- **RAM**: Minimal impact (~5-10 MB during download)
- **Storage**: 220-300 MB when complete
- **Battery**: Moderate drain during download

## Code Examples

### Check and Load Tiles on App Start
```javascript
// In App.js or root component
useEffect(() => {
  const initializeOfflineMaps = async () => {
    const hasOffline = await hasOfflineTiles();
    if (hasOffline) {
      const count = await getCachedTileCount();
      const storage = await calculateStorageUsed();
      console.log(`Offline maps ready: ${count} tiles, ${storage.toFixed(1)} MB`);
    } else {
      console.log('No offline maps cached');
    }
  };
  
  initializeOfflineMaps();
}, []);
```

### Custom Download Progress UI
```javascript
const [downloadProgress, setDownloadProgress] = useState(0);

const startDownload = async () => {
  await downloadTilesForArea((progress) => {
    setDownloadProgress(progress.percentage);
    // progress.current, progress.total, progress.successCount also available
  });
  Alert.alert('Complete!', 'Offline maps ready');
};
```

## Attribution

Map tiles from [OpenStreetMap](https://www.openstreetmap.org/copyright):
© OpenStreetMap contributors

Please ensure proper attribution is displayed in the app UI when using OSM tiles.
