import React, { useState, useEffect, useCallback } from 'react';
import { UrlTile } from 'react-native-maps';
import { hasOfflineTiles, getTileCacheDir } from '../services/offlineTileManager';
import { Directory } from 'expo-file-system';
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
  const [isOnline, setIsOnline] = useState(true); // Start as online to prevent blank maps
  const [hasOfflineCache, setHasOfflineCache] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasError, setHasError] = useState(false);

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
          try {
            const cacheDir = getTileCacheDir();
            
            if (cacheDir.exists && mounted) {
              console.log('[OfflineTile] Offline tiles available');
              setHasOfflineCache(true);
            }
          } catch (err) {
            console.warn('[OfflineTile] Error checking cache dir:', err);
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
          setHasError(true);
        }
      }
    };

    initialize();

    // Set up network listener
    let unsubscribe;
    try {
      unsubscribe = NetInfo.addEventListener((state) => {
        const online = state.isConnected && state.isInternetReachable !== false;
        console.log('[OfflineTile] Network status changed:', online ? 'Online' : 'Offline');
        if (mounted) {
          setIsOnline(online);
        }
      });
    } catch (error) {
      console.warn('[OfflineTile] Error setting up network listener:', error);
      setHasError(true);
    }

    return () => {
      mounted = false;
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (e) {
          console.warn('[OfflineTile] Error unsubscribing:', e);
        }
      }
    };
  }, []);

  const updateTileSource = useCallback(() => {
    try {
      // Priority: Online first, then offline cache
      if (isOnline || hasError) {
        // User is online OR we had an error - ALWAYS use online tiles
        console.log('[OfflineTile] Using ONLINE tiles');
        setTileUrlTemplate(urlTemplate);
        setOfflineMode(false);
      } else if (hasOfflineCache) {
        // User is offline but has cached tiles - use offline tiles
        const cacheDir = getTileCacheDir();
        const localTemplate = `${cacheDir.uri}/${source}/{z}/{x}/{y}.png`;
        console.log('[OfflineTile] Using OFFLINE tiles (cached)');
        setTileUrlTemplate(localTemplate);
        setOfflineMode(true);
      } else {
        // User is offline and no cache - fall back to online URL
        console.log('[OfflineTile] Offline with no cache - using online fallback');
        setTileUrlTemplate(urlTemplate);
        setOfflineMode(false);
      }
    } catch (error) {
      console.warn('[OfflineTile] Error updating tile source:', error);
      // Fall back to online on error
      setTileUrlTemplate(urlTemplate);
      setOfflineMode(false);
    }
  }, [isOnline, hasOfflineCache, urlTemplate, source, hasError]);

  // Switch between online/offline tiles when network status changes OR when initialized
  useEffect(() => {
    if (isInitialized && isOnline !== null) {
      updateTileSource();
    }
  }, [isInitialized, isOnline, updateTileSource]);

  // Render with error boundary
  try {
    return (
      <UrlTile
        urlTemplate={tileUrlTemplate}
        offlineMode={offlineMode}
        {...props}
      />
    );
  } catch (error) {
    console.error('[OfflineTile] Render error:', error);
    // Fallback to basic UrlTile on render error
    return (
      <UrlTile
        urlTemplate={urlTemplate}
        {...props}
      />
    );
  }
};

export default OfflineTile;

