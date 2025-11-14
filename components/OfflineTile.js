import React, { useState, useEffect, useCallback } from 'react';
import { UrlTile } from 'react-native-maps';
import { hasOfflineTiles, getTileCacheDir } from '../services/offlineTileManager';
import * as FileSystem from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';

/**
 * OfflineTile component that automatically switches between online and offline tiles
 * based on internet connectivity and tile availability.
 * 
 * Priority:
 * 1. If online AND has internet → Use online tiles
 * 2. If offline OR no internet → Use offline tiles (if available)
 * 3. If offline AND no cached tiles → Fall back to online (will fail gracefully)
 * 
 * Usage: Replace <UrlTile> with <OfflineTile> in map screens
 */
const OfflineTile = ({ urlTemplate, source = 'osm', ...props }) => {
  const [tileUrlTemplate, setTileUrlTemplate] = useState(urlTemplate);
  const [offlineMode, setOfflineMode] = useState(false);
  const [isOnline, setIsOnline] = useState(null); // null = unknown, true = online, false = offline
  const [hasOfflineCache, setHasOfflineCache] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        // First, get the network status
        const state = await NetInfo.fetch();
        const online = state.isConnected && state.isInternetReachable !== false;
        
        if (mounted) {
          console.log('[OfflineTile] Initial network status:', online ? 'Online' : 'Offline');
          setIsOnline(online);
        }

        // Then check if offline tiles are available
        const hasOffline = await hasOfflineTiles();
        
        if (hasOffline && mounted) {
          const cacheDir = getTileCacheDir();
          const dirInfo = await FileSystem.getInfoAsync(cacheDir);
          
          if (dirInfo.exists && mounted) {
            console.log('[OfflineTile] Offline tiles available');
            setHasOfflineCache(true);
          }
        }

        if (mounted) {
          setIsInitialized(true);
        }
      } catch (error) {
        console.warn('[OfflineTile] Error during initialization:', error);
        if (mounted) {
          setIsOnline(true); // Assume online on error
          setIsInitialized(true);
        }
      }
    };

    initialize();

    // Set up network listener
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      console.log('[OfflineTile] Network status changed:', online ? 'Online' : 'Offline');
      if (mounted) {
        setIsOnline(online);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const updateTileSource = useCallback(() => {
    // Priority: Online first, then offline cache
    if (isOnline) {
      // User is online - ALWAYS use online tiles for fresh data
      console.log('[OfflineTile] Using ONLINE tiles (fresh from server)');
      setTileUrlTemplate(urlTemplate);
      setOfflineMode(false);
    } else if (hasOfflineCache) {
      // User is offline but has cached tiles - use offline tiles
      const cacheDir = getTileCacheDir();
      const localTemplate = `${cacheDir}${source}/{z}/{x}/{y}.png`;
      console.log('[OfflineTile] Using OFFLINE tiles (cached):', localTemplate);
      setTileUrlTemplate(localTemplate);
      setOfflineMode(true);
    } else {
      // User is offline and no cache - fall back to online URL (will fail to load)
      console.log('[OfflineTile] Offline with no cache - tiles may not load');
      setTileUrlTemplate(urlTemplate);
      setOfflineMode(false);
    }
  }, [isOnline, hasOfflineCache, urlTemplate, source]);

  // Switch between online/offline tiles when network status changes OR when initialized
  useEffect(() => {
    if (isInitialized && isOnline !== null) {
      updateTileSource();
    }
  }, [isInitialized, isOnline, updateTileSource]);

  return (
    <UrlTile
      urlTemplate={tileUrlTemplate}
      offlineMode={offlineMode}
      {...props}
    />
  );
};

export default OfflineTile;

