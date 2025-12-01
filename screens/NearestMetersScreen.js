import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Alert, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Polygon, Text as SvgText } from 'react-native-svg';
import { ActivityIndicator } from 'react-native';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { useNearestMetersStore } from '../stores/RootStore';
import LeafletMap from '../components/LeafletMap';
import styles from '../styles/NearestMetersStyles';

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
        initialZoom={18}
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
              {store.hasCustomerData 
                ? 'Up to 3 closest meters to your GPS. Choose from the list below.'
                : 'Customer data available offline when downloaded.'}
            </Text>
            {store.loading ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#1e5a8e" />
                <Text style={{ marginTop: 8, color: '#475569' }}>Looking up meter details from offline data…</Text>
              </View>
            ) : store.errorMessage ? (
              <View style={{ paddingVertical: 18, alignItems: 'center', paddingHorizontal: 16 }}>
                <Ionicons name="cloud-download-outline" size={40} color="#f59e0b" style={{ marginBottom: 10 }} />
                <Text style={{ color: '#b45309', marginBottom: 10, textAlign: 'center', fontSize: 14 }}>
                  {store.errorMessage}
                </Text>
                <TouchableOpacity 
                  onPress={() => navigation.navigate('Settings')} 
                  style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#f59e0b', borderRadius: 8, marginBottom: 8 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Go to Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => store.fetchNearest(coordinates)} 
                  style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#e5e7eb', borderRadius: 8 }}
                >
                  <Text style={{ color: '#374151', fontWeight: '600' }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : store.nearestMeters.length === 0 ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ color: '#475569', marginBottom: 10 }}>No nearby meters were found in the downloaded data.</Text>
                <TouchableOpacity onPress={() => store.fetchNearest(coordinates)} style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1e5a8e', borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 }}>
                  <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                  <Text style={{ marginLeft: 6, color: '#10b981', fontSize: 12, fontWeight: '600' }}>
                    Using offline customer data
                  </Text>
                </View>
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
                          <Text style={styles.meterId}>{meter.meterNumber || meter.accountNumber || meter.id}</Text>
                          <Text style={styles.meterAddress} numberOfLines={2}>{meter.address}</Text>
                          <Text style={styles.meterDistance}>
                            📍 {meter.distance < 1000 
                              ? `${Math.round(meter.distance)}m away` 
                              : `${(meter.distance / 1000).toFixed(2)}km away`}
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
