import React from 'react';
import { WebView } from 'react-native-webview';
import { View, ActivityIndicator } from 'react-native';

/**
 * Leaflet Map Component using WebView
 * Works reliably in standalone APK builds with OpenStreetMap tiles
 */
const LeafletMap = ({ 
  latitude = 7.0731, 
  longitude = 125.6128, 
  zoom = 14,
  initialCenter = null,
  initialZoom = null,
  markers = [],
  polylines = [], // Add polylines support
  showUserLocation = true,
  userLocation = null, // Pass user location from React Native
  onMarkerPress,
  onMapPress,
  style
}) => {
  
  // Use initialCenter if provided, otherwise use latitude/longitude
  const centerLat = initialCenter ? initialCenter[0] : latitude;
  const centerLng = initialCenter ? initialCenter[1] : longitude;
  const mapZoom = initialZoom || zoom;
  
  // Use passed userLocation or try to get from props
  const userLat = userLocation ? userLocation.latitude : latitude;
  const userLng = userLocation ? userLocation.longitude : longitude;
  
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
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        // Initialize map with performance optimizations
        var map = L.map('map', {
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true,
          tap: true,
          tapTolerance: 15,
          zoomSnap: 0.5,
          zoomDelta: 0.5,
          wheelPxPerZoomLevel: 120,
          bounceAtZoomLimits: false
        }).setView([${centerLat}, ${centerLng}], ${mapZoom});

        // Add OpenStreetMap tiles
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

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

        // Always show user location with a blue pulsing marker
        // Add user location marker directly from React Native props
        var userLocationMarker = {
          latitude: ${userLat},
          longitude: ${userLng}
        };
        
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
        
        L.marker([userLocationMarker.latitude, userLocationMarker.longitude], { icon: userIcon })
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
      }
    } catch (error) {
      console.error('[LeafletMap] Error handling message:', error);
    }
  };

  return (
    <View style={[{ flex: 1 }, style]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        androidHardwareAccelerationDisabled={false}
        androidLayerType="hardware"
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        renderLoading={() => (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        )}
        style={{ flex: 1 }}
      />
    </View>
  );
};

export default LeafletMap;
