import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Polygon, Text as SvgText } from 'react-native-svg';
import { ActivityIndicator } from 'react-native';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { useNearestMetersStore } from '../stores/RootStore';
import LeafletMap from '../components/LeafletMap';

const NearestMetersScreenInner = observer(function NearestMetersScreenInner({ navigation, coordinates }) {
  const mapRef = useRef(null);
  const store = useNearestMetersStore();

  useEffect(() => {
    if (!coordinates) {
      Alert.alert('Error', 'No coordinates provided');
      navigation.goBack();
      return;
    }
    store.reset();
    store.fetchNearest(coordinates);
    // eslint-disable-next-line
  }, [coordinates]);

  const handleMeterSelect = (meter) => {
    store.setSelectedMeter(meter);
    // Navigate to ReportScreen (map view) with meter details instead of form
    navigation.navigate('ReportMap', {
      meterNumber: meter.id || meter.meterId,
      prefilledData: {
        accountNumber: meter.accountNumber,
        address: meter.address,
        dma: meter.dma,
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
      <LeafletMap
        ref={mapRef}
        initialCenter={[
          coordinates?.latitude || 7.0731,
          coordinates?.longitude || 125.6129
        ]}
        initialZoom={15}
        markers={store.nearestMeters.map((meter, idx) => {
          const offsetLat = idx === 0 ? 0 : (Math.cos((idx - 1) * Math.PI) * 0.0001);
          const offsetLng = idx === 0 ? 0 : (Math.sin((idx - 1) * Math.PI) * 0.0001);
          return {
            position: [meter.latitude + offsetLat, meter.longitude + offsetLng],
            label: `${idx + 1}`,
            color: getBadgeColor(idx),
            onClick: () => handleMeterSelect(meter)
          };
        })}
        showUserLocation={true}
        userLocation={coordinates ? { latitude: coordinates.latitude, longitude: coordinates.longitude } : null}
      />
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
        {!store.dragMode && (
          <>
            <Text style={styles.panelTitle}>Select a nearest meter</Text>
            <Text style={styles.panelSubtitle}>
              Up to 3 closest meters to your GPS. Choose from the list below.
            </Text>
            {store.loading ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#1e5a8e" />
                <Text style={{ marginTop: 8, color: '#475569' }}>Looking up meter details…</Text>
              </View>
            ) : store.nearestMeters.length === 0 ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ color: '#475569', marginBottom: 10 }}>No nearby meters were found.</Text>
                <TouchableOpacity onPress={() => store.fetchNearest(coordinates)} style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1e5a8e', borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <ScrollView style={styles.panelList} contentContainerStyle={styles.panelListContent}>
                  {store.nearestMeters.map((meter, idx) => (
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
        {store.dragMode && !store.pinReady && (
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
              onPress={() => store.startPinpoint(coordinates, store.nearestMeters)}
            >
              <Ionicons name="navigate" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Start Pinpoint</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Panel when drag pin is ready - show confirm button */}
        {store.dragMode && store.pinReady && store.dragPin && (
          <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: '#f0fdf4' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 10 }}>Drag the Blue Pin</Text>
            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 8, textAlign: 'center' }}>
              Drag the blue pin to the exact leak location, then confirm.
            </Text>
            <Text style={{ fontSize: 12, color: '#10b981', marginBottom: 18, textAlign: 'center' }}>
              dragMode: {store.dragMode ? 'Yes' : 'No'}, pinReady: {store.pinReady ? 'Yes' : 'No'}, 
              dragPin: {store.dragPin ? `${store.dragPin.latitude?.toFixed(6)}, ${store.dragPin.longitude?.toFixed(6)}` : 'None'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#64748b',
                  borderRadius: 24,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
                onPress={() => {
                  store.setDragMode(false);
                  store.setPinReady(false);
                  store.setDragPin(null);
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: '#10b981',
                  borderRadius: 24,
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
                onPress={() => {
                  console.log('Confirm button pressed');
                  if (store.dragPin) {
                    const coords = toJS(store.dragPin);
                    console.log('Navigating to LeakReportForm with coords:', coords);
                    navigation.navigate('LeakReportForm', {
                      meterData: null,
                      coordinates: {
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                      },
                      fromNearest: false,
                    });
                  } else {
                    console.log('No drag pin set');
                  }
                }}
              >
                <Ionicons name="checkmark" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Confirm Location</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
});

// Wrapper to extract route params before passing to observer component
const NearestMetersScreen = ({ navigation, route }) => {
  const { coordinates } = route.params || {};
  return <NearestMetersScreenInner navigation={navigation} coordinates={coordinates} />;
};

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
    width: 40,
    height: 50,
    alignItems: 'center',
    justifyContent: 'flex-end',
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
