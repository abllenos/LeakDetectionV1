import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { UrlTile, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Polygon, Text as SvgText } from 'react-native-svg';
import { searchAccountOrMeter, fetchNearestMeters, getAvailableCustomers } from '../services/interceptor';
import { ActivityIndicator } from 'react-native';

// Default map tile source (OpenStreetMap)
const TILE_SOURCES = [
  {
    url: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'
  }
];

const NearestMetersScreen = function NearestMetersScreen({ navigation, route }) {
  const { coordinates } = route.params || {};
  const mapRef = useRef(null);

  const [nearestMeters, setNearestMeters] = useState([]);
  const [selectedMeter, setSelectedMeter] = useState(null);
  const [loading, setLoading] = useState(false);
  // Pinpoint drag feature
  const [dragPin, setDragPin] = useState(null);
  const [pinReady, setPinReady] = useState(false);
  const [dragMode, setDragMode] = useState(false);

  // More accurate haversine distance calculation
  const toRad = (deg) => (deg * Math.PI) / 180;
  const haversine = (a, b) => {
    const R = 6371e3; // Earth's radius in meters
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);

    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
  };

  // Fetch nearest meters from API and update state
  const fetchNearest = async () => {
    if (!coordinates) return;
    setLoading(true);
    try {
      // Fetch all meters (replace with your actual API call)
      const all = await getAvailableCustomers();
      // Calculate distances
      const allMeters = all.map((it, idx) => {
        const lat = parseFloat(it.latitude || it.lat);
        const lng = parseFloat(it.longitude || it.lng);
        const distance = haversine(
          { latitude: coordinates.latitude, longitude: coordinates.longitude },
          { latitude: lat, longitude: lng }
        );
        return {
          id: it.id || it.meterNumber || it.accountNumber || idx,
          meterId: it.meterNumber || it.accountNumber || it.id || '',
          accountNumber: it.accountNumber || '',
          address: it.address || '',
          latitude: lat,
          longitude: lng,
          distance,
          _raw: it,
        };
      });
      // Sort by distance
      const sorted = allMeters
        .filter(m => !isNaN(m.latitude) && !isNaN(m.longitude))
        .sort((a, b) => a.distance - b.distance);

      // Filter to 3 unique locations (unique lat/lng pairs)
      const unique = [];
      const seen = new Set();
      for (const meter of sorted) {
        const key = `${meter.latitude},${meter.longitude}`;
        if (!seen.has(key)) {
          unique.push(meter);
          seen.add(key);
        }
        if (unique.length === 3) break;
      }
      setNearestMeters(unique);
    } catch (err) {
      console.warn('searchAccountOrMeter failed', err);
      setNearestMeters([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!coordinates) {
      Alert.alert('Error', 'No coordinates provided');
      navigation.goBack();
      return;
    }
    // invoke
    fetchNearest();
    // eslint-disable-next-line
  }, [coordinates]);

  const handleMeterSelect = (meter) => {
    setSelectedMeter(meter);
    navigation.navigate('LeakReportForm', {
      meterData: {
        meterNumber: meter.id,
        accountNumber: meter.accountNumber,
        address: meter.address,
      },
      coordinates: {
        latitude: meter.latitude,
        longitude: meter.longitude,
      },
      fromNearest: true,
    });
  };

  const getBadgeColor = (index) => {
    if (index === 0) return '#10b981'; // green
    if (index === 1) return '#f59e0b'; // orange
    return '#ef4444'; // red
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1e5a8e" translucent />
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: coordinates?.latitude || 7.0731,
          longitude: coordinates?.longitude || 125.6129,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation
      >
        <UrlTile
          urlTemplate={TILE_SOURCES[0].url}
          maximumZ={19}
          tileSize={256}
          zIndex={0}
        />

        {/* Markers for nearest meters */}
        {nearestMeters.map((meter, idx) => (
          <Marker
            key={`marker-${idx}-${meter.id}`}
            coordinate={{ latitude: meter.latitude, longitude: meter.longitude }}
            onPress={() => handleMeterSelect(meter)}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.markerContainer}>
              <Svg width={36} height={36} viewBox="0 0 36 36">
                {/* outer translucent ring */}
                <Circle cx="18" cy="18" r="12" fill={getBadgeColor(idx)} opacity="0.18" />
                {/* solid inner circle */}
                <Circle cx="18" cy="18" r="6" fill={getBadgeColor(idx)} />
                {/* tiny center highlight */}
                <Circle cx="18" cy="18" r="2" fill="#ffffff" opacity="0.18" />
              </Svg>
            </View>
          </Marker>
        ))}
        {/* Pinpoint drag marker: only show when dragMode is true */}
        {dragMode && pinReady && dragPin && (
          <Marker
            key="drag-pin"
            coordinate={dragPin}
            draggable={true}
            pinColor="#3b82f6"
            title={'Drag to set location'}
            onDragEnd={e => {
              setDragPin(e.nativeEvent.coordinate);
              setDragMode(false);
              setPinReady(false);
              Alert.alert('Location Confirmed', 'You can now proceed to report the leak.');
            }}
            onDrag={e => setDragPin(e.nativeEvent.coordinate)}
          />
        )}
      </MapView>
      {/* Floating button to start drag mode */}
      {/* Floating button to start drag pin mode: only show when not in drag mode */}
      {/* Show the floating button only when not in drag mode (meter list panel is open) */}


      {/* Header */}
      <View style={styles.headerContainer}>
        <LinearGradient colors={['#1e5a8e', '#2d7ab8']} style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Nearest Meters</Text>
            <Text style={styles.headerSubtitle}>Tap a marker or select from list</Text>
          </View>
        </LinearGradient>
      </View>

      {/* Bottom Panel */}
      <View style={styles.panel}>
        {/* Panel for meter list selection */}
        {!dragMode && (
          <>
            <Text style={styles.panelTitle}>Select a nearest meter</Text>
            <Text style={styles.panelSubtitle}>
              Up to 3 closest meters to your GPS. Choose from the list below.
            </Text>
            {loading ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#1e5a8e" />
                <Text style={{ marginTop: 8, color: '#475569' }}>Looking up meter details…</Text>
              </View>
            ) : nearestMeters.length === 0 ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ color: '#475569', marginBottom: 10 }}>No nearby meters were found.</Text>
                <TouchableOpacity onPress={() => fetchNearest()} style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1e5a8e', borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <ScrollView style={styles.panelList} contentContainerStyle={styles.panelListContent}>
                  {nearestMeters.map((meter, idx) => (
                    <TouchableOpacity
                      key={`item-${idx}-${meter.id}`}
                      style={styles.meterItem}
                      onPress={() => handleMeterSelect(meter)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.meterLeft}>
                        <View style={[styles.badge, { backgroundColor: getBadgeColor(idx) }]}> 
                          <Text style={styles.badgeNumber}>{idx + 1}</Text>
                        </View>
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={styles.meterId}>{meter.meterId || meter.id}</Text>
                          <Text style={styles.meterAddress}>{meter.address}</Text>
                          <Text style={styles.meterDistance}>
                            {meter.distance < 1 
                              ? `${(meter.distance * 100).toFixed(0)} cm` 
                              : meter.distance < 1000
                              ? `${meter.distance.toFixed(1)} m`
                              : `${(meter.distance / 1000).toFixed(2)} km`
                            }
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </>
        )}
        {/* Panel for drag pin mode: show Start Pinpoint button here */}
        {dragMode && !pinReady && (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 10 }}>Drag Pin Mode</Text>
            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 18, textAlign: 'center' }}>
              Place a pin on the map by clicking Start Pinpoint, then drag it to the desired location.
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#2563eb',
                borderRadius: 24,
                paddingHorizontal: 24,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
              }}
              onPress={() => {
                // Offset from first meter (red pin) or from coordinates
                let baseLat = coordinates.latitude;
                let baseLng = coordinates.longitude;
                if (nearestMeters.length > 0) {
                  baseLat = nearestMeters[0].latitude;
                  baseLng = nearestMeters[0].longitude;
                }
                // Increase offset for blue pin (e.g. 0.004 instead of 0.001)
                setDragPin({
                  latitude: baseLat + 0.004,
                  longitude: baseLng + 0.004,
                });
                setPinReady(true);
                setDragMode(true);
              }}
            >
              <Ionicons name="navigate" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Start Pinpoint</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
export default NearestMetersScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  map: { ...StyleSheet.absoluteFillObject },
  headerContainer: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },
  markerContainer: { 
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
  },
  // markerPulse removed: using SVG marker instead
  // markerNumber removed (SVG dot now used)
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    maxHeight: '42%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  panelTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  panelSubtitle: { 
    fontSize: 13, 
    color: '#64748b', 
    marginBottom: 16, 
    lineHeight: 18 
  },
  meterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  meterLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNumber: { color: '#fff', fontSize: 16, fontWeight: '700' },
  meterId: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  meterAddress: { fontSize: 13, color: '#64748b', marginTop: 2 },
  meterDistance: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  panelList: {
    // Limit height so map remains visible
    maxHeight: 220,
  },
  panelListContent: {
    paddingBottom: 8,
  },
});
