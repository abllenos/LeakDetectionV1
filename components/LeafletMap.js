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
  markers = [],
  onMarkerPress,
  onMapPress,
  style
}) => {
  
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
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        // Initialize map
        var map = L.map('map', {
          zoomControl: true,
          attributionControl: true
        }).setView([${latitude}, ${longitude}], ${zoom});

        // Add OpenStreetMap tiles
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Add markers
        var markers = ${JSON.stringify(markers)};
        markers.forEach(function(marker) {
          var m = L.marker([marker.latitude, marker.longitude])
            .addTo(map);
          
          if (marker.title || marker.description) {
            m.bindPopup('<b>' + (marker.title || '') + '</b><br>' + (marker.description || ''));
          }
          
          m.on('click', function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'markerPress',
              data: marker
            }));
          });
        });

        // Handle map clicks
        map.on('click', function(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mapPress',
            latitude: e.latlng.lat,
            longitude: e.latlng.lng
          }));
        });

        // Expose functions for React Native to call
        window.updateCenter = function(lat, lng, zoom) {
          map.setView([lat, lng], zoom || map.getZoom());
        };

        window.addMarker = function(lat, lng, title, description) {
          L.marker([lat, lng])
            .addTo(map)
            .bindPopup('<b>' + (title || '') + '</b><br>' + (description || ''));
        };

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
