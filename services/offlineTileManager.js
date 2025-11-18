import * as FileSystem from 'expo-file-system';
import { Directory, Paths, File } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Tile configuration for Davao City area
const DAVAO_BOUNDS = {
  minLat: 6.9,
  maxLat: 7.2,
  minLon: 125.5,
  maxLon: 125.7,
};

// Zoom levels 1-16 for complete map coverage
// Lower levels (1-11) = few tiles, broad view
// Higher levels (12-16) = many tiles, detailed view
const ZOOM_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

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

// Download a single tile
const downloadTile = async (z, x, y, source = 'osm') => {
  const filePath = getTileFilePath(z, x, y, source);
  const sourceUrl = TILE_SOURCES[source] || TILE_SOURCES.osm;
  const url = sourceUrl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  
  try {
    // Ensure directory exists - create parent directories recursively
    const cacheDir = getTileCacheDir();
    if (!cacheDir.exists) cacheDir.create();
    
    const sourceDir = new Directory(cacheDir, source);
    if (!sourceDir.exists) sourceDir.create();
    
    const zoomDir = new Directory(sourceDir, String(z));
    if (!zoomDir.exists) zoomDir.create();
    
    const xDir = new Directory(zoomDir, String(x));
    if (!xDir.exists) xDir.create();
    
    // Download tile using the new File.downloadFileAsync method
    const file = await File.downloadFileAsync(url, xDir);
    
    // Verify file was actually created
    if (file.exists && file.size > 0) {
      return true;
    } else {
      console.warn(`Tile ${z}/${x}/${y} downloaded but file is empty or doesn't exist`);
      return false;
    }
  } catch (error) {
    console.warn(`Failed to download tile ${z}/${x}/${y}:`, error.message);
    return false;
  }
};

// Download tiles for Davao City area
export const downloadTilesForArea = async (onProgress) => {
  const totalTiles = calculateTileCount();
  let downloadedCount = 0;
  let successCount = 0;
  let failCount = 0;
  
  console.log(`[OfflineTiles] Starting download of ${totalTiles} tiles...`);
  console.log(`[OfflineTiles] Zoom levels: ${ZOOM_LEVELS.join(', ')}`);
  console.log(`[OfflineTiles] Bounds:`, DAVAO_BOUNDS);
  
  // Batch size for concurrent downloads
  const BATCH_SIZE = 10; // Download 10 tiles at once
  
  for (const zoom of ZOOM_LEVELS) {
    const minTile = latLonToTile(DAVAO_BOUNDS.maxLat, DAVAO_BOUNDS.minLon, zoom);
    const maxTile = latLonToTile(DAVAO_BOUNDS.minLat, DAVAO_BOUNDS.maxLon, zoom);
    
    console.log(`[OfflineTiles] Zoom ${zoom}: tiles from (${minTile.x},${minTile.y}) to (${maxTile.x},${maxTile.y})`);
    
    // Collect all tiles for this zoom level
    const tilesToDownload = [];
    for (let x = minTile.x; x <= maxTile.x; x++) {
      for (let y = minTile.y; y <= maxTile.y; y++) {
        tilesToDownload.push({ x, y, z: zoom });
      }
    }
    
    // Download in batches
    for (let i = 0; i < tilesToDownload.length; i += BATCH_SIZE) {
      const batch = tilesToDownload.slice(i, i + BATCH_SIZE);
      
      // Download batch concurrently
      const results = await Promise.all(
        batch.map(async ({ x, y, z }) => {
          const exists = await checkTileExists(z, x, y);
          if (!exists) {
            const success = await downloadTile(z, x, y);
            return success;
          }
          return true; // Already exists, count as success
        })
      );
      
      // Count results
      results.forEach(success => {
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
        downloadedCount++;
      });
      
      // Report progress
      if (onProgress) {
        onProgress({
          current: downloadedCount,
          total: totalTiles,
          percentage: Math.round((downloadedCount / totalTiles) * 100),
          successCount,
        });
      }
    }
  }
  
  console.log(`[OfflineTiles] Download complete: ${successCount} success, ${failCount} failed, ${totalTiles} total`);
  
  // Save metadata
  await AsyncStorage.setItem('offline_tiles_metadata', JSON.stringify({
    downloadedAt: new Date().toISOString(),
    totalTiles: successCount,
    zoomLevels: ZOOM_LEVELS,
    bounds: DAVAO_BOUNDS,
  }));
  
  console.log(`[OfflineTiles] Metadata saved: ${successCount} tiles`);
  return { total: totalTiles, success: successCount };
};

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
  try {
    const cacheDir = getTileCacheDir();
    if (cacheDir.exists) {
      cacheDir.delete();
    }
    await AsyncStorage.removeItem('offline_tiles_metadata');
    console.log('Tile cache cleared');
    return true;
  } catch (error) {
    console.error('Failed to clear tile cache:', error);
    return false;
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
