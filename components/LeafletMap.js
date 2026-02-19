import React, { useState, useEffect } from 'react';
import { WebView } from 'react-native-webview';
import { View, ActivityIndicator, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import MapStore from '../stores/MapStore';

const OFFLINE_MAP_KEY = '@offline_map_enabled';

/**
 * Leaflet Map Component using WebView
 * Works reliably in standalone APK builds with OpenStreetMap tiles
 * Supports offline mode with cached tiles from MapStore
 * Respects user's offline mode preference even when online
 */
const LeafletMap = ({
  latitude = 7.0731,
  longitude = 125.6128,
  zoom = 17,
  initialCenter = null,
  initialZoom = null,
  markers = [],
  polylines = [], // Add polylines support
  showUserLocation = true,
  userLocation = null, // Pass user location from React Native
  onMarkerPress,
  onMapPress,
  tileUrl = null, // Allow custom tile URL to be passed
  style
}) => {
  const [isOnline, setIsOnline] = useState(true);
  const [useOfflineMap, setUseOfflineMap] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Check network status and offline map preference
  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      try {
        // Check network status
        const netState = await NetInfo.fetch();
        const online = netState.isConnected && netState.isInternetReachable !== false;

        // Check offline map preference from AsyncStorage
        const offlineMapPref = await AsyncStorage.getItem(OFFLINE_MAP_KEY);
        const shouldUseOffline = offlineMapPref === 'true';

        if (mounted) {
          setIsOnline(online);
          setUseOfflineMap(shouldUseOffline);
          setIsReady(true);

          console.log(`[LeafletMap] Network: ${online ? 'Online' : 'Offline'}`);
          console.log(`[LeafletMap] Offline map preference: ${shouldUseOffline ? 'Enabled' : 'Disabled'}`);
          console.log(`[LeafletMap] MapStore ready: ${MapStore.isReady}`);
          console.log(`[LeafletMap] MapStore path: ${MapStore.mapTilesPath || 'N/A'}`);
        }
      } catch (error) {
        console.warn('[LeafletMap] Error checking status:', error);
        if (mounted) {
          setIsOnline(true); // Assume online on error
          setUseOfflineMap(false);
          setIsReady(true);
        }
      }
    };

    checkStatus();

    // Listen for network changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      if (mounted) {
        setIsOnline(online);
        console.log(`[LeafletMap] Network changed: ${online ? 'Online' : 'Offline'}`);
      }
    });

    // Listen for AsyncStorage changes (if preference is updated)
    const checkInterval = setInterval(async () => {
      try {
        const offlineMapPref = await AsyncStorage.getItem(OFFLINE_MAP_KEY);
        const shouldUseOffline = offlineMapPref === 'true';
        if (mounted && shouldUseOffline !== useOfflineMap) {
          setUseOfflineMap(shouldUseOffline);
          console.log(`[LeafletMap] Offline map preference changed: ${shouldUseOffline ? 'Enabled' : 'Disabled'}`);
        }
      } catch (error) {
        console.warn('[LeafletMap] Error checking preference:', error);
      }
    }, 2000); // Check every 2 seconds

    return () => {
      mounted = false;
      unsubscribe();
      clearInterval(checkInterval);
    };
  }, [useOfflineMap]);

  // Use initialCenter if provided, otherwise use latitude/longitude
  const centerLat = initialCenter ? initialCenter[0] : latitude;
  const centerLng = initialCenter ? initialCenter[1] : longitude;
  const mapZoom = initialZoom || zoom;

  // Use passed userLocation or try to get from props
  const userLat = userLocation ? userLocation.latitude : latitude;
  const userLng = userLocation ? userLocation.longitude : longitude;

  // Determine tile URL based on offline mode preference and availability
  const getEffectiveTileUrl = () => {
    // If custom tileUrl is passed (from ReportScreen), use it
    if (tileUrl) {
      console.log('[LeafletMap] Using custom tile URL:', tileUrl);
      return tileUrl;
    }

    // If offline mode is enabled AND MapStore has offline tiles ready, use offline tiles
    if (useOfflineMap && MapStore.isReady && MapStore.mapTilesPath) {
      // Check if path already starts with file:// or /
      let offlineTileUrl;
      if (MapStore.mapTilesPath.startsWith('file://')) {
        offlineTileUrl = `${MapStore.mapTilesPath}{z}/{x}/{y}.png`;
      } else {
        offlineTileUrl = `file://${MapStore.mapTilesPath}{z}/{x}/{y}.png`;
      }
      console.log('[LeafletMap] Using offline tiles:', offlineTileUrl);
      console.log('[LeafletMap] MapStore path:', MapStore.mapTilesPath);
      return offlineTileUrl;
    }

    // Default to online tiles
    console.log('[LeafletMap] Using online tiles');
    return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  };

  const effectiveTileUrl = getEffectiveTileUrl();
  const isUsingOfflineTiles = effectiveTileUrl.startsWith('file://');

  // Show loading state while checking status
  if (!isReady) {
    return (
      <View style={[{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e5e7eb' }, style]}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ marginTop: 10, color: '#6b7280' }}>Loading map...</Text>
      </View>
    );
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html, #map { 
          margin: 0; 
          padding: 0; 
          height: 100%; 
          width: 100%;
        }
        .custom-marker {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .offline-indicator {
          position: fixed;
          top: 10px;
          right: 10px;
          background: ${isUsingOfflineTiles ? '#A1A1A1' : (isOnline ? '#10b981' : '#f59e0b')};
          color: white;
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: bold;
          z-index: 9999;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
      </style>
    </head>
    <body>
      <div id="map"></div>
      <div class="offline-indicator">${isUsingOfflineTiles ? 'Offline Map' : (isOnline ? 'Online' : 'Offline Mode')}</div>
      <script>
        // Initialize map - default center to GPS location
        const userLocationCoords = [${userLat}, ${userLng}];
        const mapCenterCoords = ${initialCenter ? `[${initialCenter[0]}, ${initialCenter[1]}]` : 'userLocationCoords'};
        const mapZoomLevel = ${initialZoom || 17};

        const map = L.map('map', {
          center: mapCenterCoords,
          zoom: mapZoomLevel,
          minZoom: 0,
          maxZoom: 19,
          maxNativeZoom: 17,
          zoomControl: true
        });

        // Choose tile source based on offline mode - FIXED: Properly quote the URL
          const tileUrl = '${effectiveTileUrl}';
          const isOffline = ${isUsingOfflineTiles ? 'true' : 'false'};
          const isOnline = ${isOnline ? 'true' : 'false'};

        const attribution = '${isUsingOfflineTiles ? 'Davao Roads © DCWD' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}';

          console.log('Using tile URL:', tileUrl);
          console.log('Is offline:', isOffline);
          console.log('Is online:', isOnline);

          // Add tile layer
          L.tileLayer(tileUrl, {
            attribution: attribution,
            maxZoom: 19,
            maxNativeZoom: 17,
            tileSize: 256,
            errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            crossOrigin: true
          }).addTo(map);

        console.log('🗺️ Map initialized with tiles:', tileUrl);
        console.log('📦 Using offline tiles:', isOffline);

        // Add custom icon function
        function createCustomIcon(label, color) {
          return L.divIcon({
            className: 'custom-div-icon',
            html: '<div class="custom-marker" style="background-color: ' + color + ';">' + label + '</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });
        }

        // Add markers with custom styling
        var markers = ${JSON.stringify(markers)};
        markers.forEach(function(marker) {
          var lat = marker.position ? marker.position[0] : marker.latitude;
          var lng = marker.position ? marker.position[1] : marker.longitude;
          var label = marker.label || '';
          var color = marker.color || '#3b82f6';
          
          var icon = label ? createCustomIcon(label, color) : L.Icon.Default();
          
          var m = L.marker([lat, lng], { icon: icon })
            .addTo(map);
          
          if (marker.title || marker.description) {
            m.bindPopup('<b>' + (marker.title || '') + '</b><br>' + (marker.description || ''));
          }
          
          if (marker.onClick) {
            m.on('click', function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'markerPress',
                data: marker
              }));
            });
          }
        });

        // Always show user location with person.png icon
        // Add user location marker directly from React Native props
        var userLocationMarker = {
          latitude: ${userLat},
          longitude: ${userLng}
        };
        
        // User location marker with simple blue pulsing dot
        var userIcon = L.divIcon({
          className: 'user-location-marker',
          html: '<div style="position: relative; width: 32px; height: 32px;">' +
                  '<div style="position: absolute; width: 32px; height: 32px; background-color: rgba(59, 130, 246, 0.3); border-radius: 50%; animation: pulse 2s infinite;"></div>' +
                  '<div style="position: absolute; width: 20px; height: 20px; top: 6px; left: 6px; background-color: #3b82f6; border: 4px solid white; border-radius: 50%; box-shadow: 0 3px 10px rgba(0,0,0,0.4);"></div>' +
                '</div>' +
                '<style>@keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.8); opacity: 0.5; } 100% { transform: scale(2.5); opacity: 0; }}</style>',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
        
        // User location marker is NOT interactive (no click/drag)
        L.marker([userLocationMarker.latitude, userLocationMarker.longitude], { 
          icon: userIcon,
          interactive: false,  // Prevent clicks
          keyboard: false,
          zIndexOffset: -1000  // Keep below other markers
        })
          .addTo(map)
          .bindPopup('<b>📍 Your Current Location</b>');
        
        console.log('✅ User location marker added at:', userLocationMarker.latitude, userLocationMarker.longitude);

        // Add polylines (for routes/paths)
        var polylines = ${JSON.stringify(polylines)};
        polylines.forEach(function(polyline) {
          var coordinates = polyline.coordinates || [];
          var color = polyline.color || '#3b82f6';
          var weight = polyline.weight || 4;
          var opacity = polyline.opacity || 0.7;
          
          L.polyline(coordinates, {
            color: color,
            weight: weight,
            opacity: opacity,
            smoothFactor: 1
          }).addTo(map);
        });

        // Handle map clicks
        map.on('click', function(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mapPress',
            latitude: e.latlng.lat,
            longitude: e.latlng.lng
          }));
        });

        // Notify React Native that map is ready
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'mapReady'
        }));
      </script>
    </body>
    </html>
  `;

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'mapPress' && onMapPress) {
        onMapPress({
          latitude: data.latitude,
          longitude: data.longitude
        });
      } else if (data.type === 'markerPress' && onMarkerPress) {
        onMarkerPress(data.data);
      } else if (data.type === 'mapReady') {
        console.log('[LeafletMap] Map loaded successfully');
        console.log('[LeafletMap] Mode:', isUsingOfflineTiles ? 'Offline Tiles' : (isOnline ? 'Online' : 'Offline'));
      }
    } catch (error) {
      console.error('[LeafletMap] Error handling message:', error);
    }
  };

  return (
    <View style={[{ flex: 1 }, style]}>
      <WebView
        source={{ html: htmlContent, baseUrl: 'file:///' }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        allowingReadAccessToURL={'file://'}
        originWhitelist={['*']}
        onMessage={handleMessage}
        renderLoading={() => (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        )}
      />
    </View>
  );
};

export default LeafletMap;
