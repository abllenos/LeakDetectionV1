import * as FileSystem from 'expo-file-system/legacy';
import { Directory, Paths, File } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notificationStore from '../stores/NotificationStore';

// Tile configuration for Davao City area
const DAVAO_BOUNDS = {
  minLat: 6.9679, // covers full city area
  maxLat: 7.4135,
  minLon: 125.2244,
  maxLon: 125.6862,
};

// Zoom levels 10-18 for detailed street-level coverage
// Level 10-12: City overview
// Level 13-15: Neighborhood/street detail
// Level 16-18: Building-level detail (most tiles, highest detail)
const ZOOM_LEVELS = [10, 11, 12, 13, 14, 15, 16, 17, 18];

const TILE_SOURCES = {
  osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  osmde: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
};

// Get tile cache directory
const getTileCacheDir = () => {
  const cacheDir = new Directory(Paths.cache, 'map_tiles');
  return cacheDir;
};

// Export getTileCacheDir so it can be used by OfflineTile component
export { getTileCacheDir };

// Convert lat/lon to tile coordinates
const latLonToTile = (lat, lon, zoom) => {
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  return { x, y, z: zoom };
};

// Calculate total tiles needed
export const calculateTileCount = () => {
  let total = 0;
  ZOOM_LEVELS.forEach(zoom => {
    const minTile = latLonToTile(DAVAO_BOUNDS.maxLat, DAVAO_BOUNDS.minLon, zoom);
    const maxTile = latLonToTile(DAVAO_BOUNDS.minLat, DAVAO_BOUNDS.maxLon, zoom);
    const tilesX = maxTile.x - minTile.x + 1;
    const tilesY = maxTile.y - minTile.y + 1;
    const zoomTotal = tilesX * tilesY;
    console.log(`[TileCalc] Zoom ${zoom}: ${tilesX}x${tilesY} = ${zoomTotal} tiles`);
    total += zoomTotal;
  });
  console.log(`[TileCalc] Total tiles needed: ${total}`);
  return total;
};

// Generate tile file path
const getTileFilePath = (z, x, y, source = 'osm') => {
  const cacheDir = getTileCacheDir();
  return `${cacheDir.uri}/${source}/${z}/${x}/${y}.png`;
};

// Check if tile exists locally
export const checkTileExists = async (z, x, y, source = 'osm') => {
  const filePath = getTileFilePath(z, x, y, source);
  try {
    const file = new FileSystem.File(filePath);
    return file.exists;
  } catch {
    return false;
  }
};

// Get local tile URI or fallback to online
export const getTileUri = async (z, x, y, source = 'osm') => {
  const filePath = getTileFilePath(z, x, y, source);
  const exists = await checkTileExists(z, x, y, source);
  
  if (exists) {
    return `file://${filePath}`;
  }
  
  // Fallback to online URL
  const sourceUrl = TILE_SOURCES[source] || TILE_SOURCES.osm;
  return sourceUrl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
};

// Download a single tile - optimized version
const downloadTile = async (z, x, y, source = 'osm') => {
  const sourceUrl = TILE_SOURCES[source] || TILE_SOURCES.osm;
  const url = sourceUrl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  
  // Build file path using legacy API
  const tileDir = `${FileSystem.cacheDirectory}map_tiles/${source}/${z}/${x}`;
  const filePath = `${tileDir}/${y}.png`;
  
  try {
    // Check if file already exists
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists && info.size > 0) {
      return true; // Already downloaded
    }
    
    // Ensure directory exists
    const dirInfo = await FileSystem.getInfoAsync(tileDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(tileDir, { intermediates: true });
    }
    
    // Download using legacy FileSystem API (more reliable and faster)
    await FileSystem.downloadAsync(url, filePath);
    return true;
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      return true;
    }
    // Don't log every failure to avoid console spam
    return false;
  }
};

// Download tiles for Davao City area
export const downloadTilesForArea = async (onProgress, isPaused, isCancelled) => {
  const totalTiles = calculateTileCount();
  let downloadedCount = 0;
  let successCount = 0;
  let failCount = 0;
  let lastMetadataUpdate = Date.now();
  
  console.log(`[OfflineTiles] Starting download of ${totalTiles} tiles...`);
  
  // Large batch size for faster downloads - maximize concurrent requests
  const BATCH_SIZE = 500;
  
  // Helper to save progress metadata (for persisting across navigation)
  const saveProgressMetadata = async () => {
    await AsyncStorage.setItem('offline_tiles_metadata', JSON.stringify({
      downloadedAt: new Date().toISOString(),
      totalTiles: successCount,
      zoomLevels: ZOOM_LEVELS,
      bounds: DAVAO_BOUNDS,
      downloadComplete: false,
      inProgress: true,
      progress: Math.round((downloadedCount / totalTiles) * 100),
    }));
  };
  
  for (const zoom of ZOOM_LEVELS) {
    // Check if cancelled
    if (isCancelled && isCancelled()) {
      console.log('[OfflineTiles] Download cancelled by user');
      return { total: totalTiles, success: successCount, cancelled: true };
    }
    
    const minTile = latLonToTile(DAVAO_BOUNDS.maxLat, DAVAO_BOUNDS.minLon, zoom);
    const maxTile = latLonToTile(DAVAO_BOUNDS.minLat, DAVAO_BOUNDS.maxLon, zoom);
    
    // Collect all tiles for this zoom level
    const tilesToDownload = [];
    for (let x = minTile.x; x <= maxTile.x; x++) {
      for (let y = minTile.y; y <= maxTile.y; y++) {
        tilesToDownload.push({ x, y, z: zoom });
      }
    }
    
    // Download in batches
    for (let i = 0; i < tilesToDownload.length; i += BATCH_SIZE) {
      // Check if cancelled
      if (isCancelled && isCancelled()) {
        console.log('[OfflineTiles] Download cancelled by user');
        return { total: totalTiles, success: successCount, cancelled: true };
      }
      
      // Check if paused
      if (isPaused && isPaused()) {
        while (isPaused && isPaused() && !(isCancelled && isCancelled())) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        // Check again if cancelled while paused
        if (isCancelled && isCancelled()) {
          return { total: totalTiles, success: successCount, cancelled: true };
        }
      }

      const batch = tilesToDownload.slice(i, i + BATCH_SIZE);

      // Download batch concurrently - no artificial delays
      try {
        const results = await Promise.all(
          batch.map(({ x, y, z }) => downloadTile(z, x, y))
        );
        
        results.forEach(success => {
          if (success) successCount++;
          else failCount++;
          downloadedCount++;
        });
      } catch (batchError) {
        downloadedCount += batch.length;
        failCount += batch.length;
      }

      // Report progress
      if (onProgress) {
        onProgress({
          current: downloadedCount,
          total: totalTiles,
          percentage: Math.round((downloadedCount / totalTiles) * 100),
          successCount,
          failCount,
        });
      }
      
      // Save progress metadata every 5 seconds (for persistence across navigation)
      const now = Date.now();
      if (now - lastMetadataUpdate >= 5000) {
        await saveProgressMetadata();
        lastMetadataUpdate = now;
      }
    }
  }

  console.log(`[OfflineTiles] Download complete: ${successCount} success, ${failCount} failed`);
  await AsyncStorage.setItem('offline_tiles_metadata', JSON.stringify({
    downloadedAt: new Date().toISOString(),
    totalTiles: successCount,
    zoomLevels: ZOOM_LEVELS,
    bounds: DAVAO_BOUNDS,
    downloadComplete: true,
  }));
  return { total: totalTiles, success: successCount };
}

// Calculate storage used
export const calculateStorageUsed = async () => {
  try {
    const cacheDir = getTileCacheDir();
    if (!cacheDir.exists) return 0;
    
    // Estimate: average tile is ~15KB
    const metadata = await AsyncStorage.getItem('offline_tiles_metadata');
    if (metadata) {
      const { totalTiles } = JSON.parse(metadata);
      return (totalTiles * 15) / 1024; // Convert KB to MB
    }
    return 0;
  } catch {
    return 0;
  }
};

// Get cached tile count
export const getCachedTileCount = async () => {
  try {
    const metadata = await AsyncStorage.getItem('offline_tiles_metadata');
    if (metadata) {
      const { totalTiles } = JSON.parse(metadata);
      return totalTiles || 0;
    }
    return 0;
  } catch {
    return 0;
  }
};

// Clear all cached tiles
export const clearTileCache = async () => {
  console.log('[OfflineTiles] clearTileCache called');
  
  try {
    // Always remove metadata first
    await AsyncStorage.removeItem('offline_tiles_metadata');
    console.log('[OfflineTiles] Metadata removed');
    
    // Use legacy FileSystem API directly for the cache path
    const cacheDirUri = FileSystem.cacheDirectory + 'map_tiles';
    console.log('[OfflineTiles] Cache directory URI:', cacheDirUri);
    
    // Add timeout wrapper for getInfoAsync
    const getInfoWithTimeout = (uri, timeout = 5000) => {
      return Promise.race([
        FileSystem.getInfoAsync(uri),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeout)
        )
      ]);
    };
    
    // Check if directory exists
    let dirInfo;
    try {
      console.log('[OfflineTiles] Checking directory...');
      dirInfo = await getInfoWithTimeout(cacheDirUri);
      console.log('[OfflineTiles] Directory exists:', dirInfo?.exists);
    } catch (infoError) {
      console.log('[OfflineTiles] Could not get directory info:', infoError?.message);
      // Try to delete anyway
      try {
        await FileSystem.deleteAsync(cacheDirUri, { idempotent: true });
      } catch (e) {
        // Ignore
      }
      return true;
    }
    
    if (dirInfo && dirInfo.exists) {
      console.log('[OfflineTiles] Deleting cache directory...');
      
      try {
        await FileSystem.deleteAsync(cacheDirUri, { idempotent: true });
        console.log('[OfflineTiles] Cache directory deleted successfully');
      } catch (deleteError) {
        console.warn('[OfflineTiles] Error deleting directory:', deleteError?.message);
      }
    } else {
      console.log('[OfflineTiles] Cache directory does not exist');
    }
    
    console.log('[OfflineTiles] Tile cache cleared successfully');
    return true;
  } catch (error) {
    console.error('[OfflineTiles] Failed to clear tile cache:', error?.message);
    return true; // Return true anyway since metadata was cleared
  }
};

// Check if offline tiles are available
export const hasOfflineTiles = async () => {
  try {
    const metadata = await AsyncStorage.getItem('offline_tiles_metadata');
    if (!metadata) return false;
    
    const data = JSON.parse(metadata);
    return data.totalTiles > 0;
  } catch {
    return false;
  }
};

// Get tile metadata
export const getTileMetadata = async () => {
  try {
    const metadata = await AsyncStorage.getItem('offline_tiles_metadata');
    return metadata ? JSON.parse(metadata) : null;
  } catch {
    return null;
  }
};
