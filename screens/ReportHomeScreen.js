import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { UrlTile } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { observer } from 'mobx-react-lite';
import { useReportMapStore } from '../stores/RootStore';

const ReportHomeScreen = observer(({ navigation, route }) => {
  const store = useReportMapStore();
  const mapRef = useRef(null);
  
  const TILE_SOURCES = [
    { name: 'OSM DE', url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
  ];

  useEffect(() => {
    (async () => {
      const nextRegion = await store.initializeLocation();
      if (nextRegion) {
        mapRef.current?.animateToRegion(nextRegion, 600);
      }
    })();
  }, []);

  // Handle params when navigated back from NearestMeters
  useEffect(() => {
    const sel = route?.params?.selectedMeter;
    if (sel) {
      const nextRegion = store.handleSelectedMeter(sel);
      if (nextRegion) {
        mapRef.current?.animateToRegion(nextRegion, 600);
      }
      navigation.setParams({ selectedMeter: null });
    }
  }, [route?.params]);

  // If another screen requested nearest-meter flow, forward to FindNearest
  useEffect(() => {
    const nearestReq = route?.params?.nearestRequest;
    const coords = route?.params?.coordinates;
    if (nearestReq) {
      // Clear param to avoid loops
      navigation.setParams({ nearestRequest: null, coordinates: null });
      // Forward to FindNearest with coordinates (if provided) so it can perform location-based search
      navigation.navigate('FindNearest', { coordinates: coords });
    }
  }, [route?.params]);

  const searchMeter = async () => {
    if (!store.meterNumber || store.meterNumber.trim() === '') {
      navigation.navigate('ReportMap', { meterNumber: store.meterNumber });
      return;
    }
    
    const result = await store.searchMeter();
    if (result) {
      navigation.navigate('ReportMap', { meterNumber: store.meterNumber, searchResult: result });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <StatusBar barStyle="light-content" backgroundColor="#1e5a8e" translucent />
      <LinearGradient
        colors={["#1e5a8e", "#2d7ab8"]}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={{ width: 44 }} />
          <View>
            <Text style={styles.headerTitle}>Report & Map</Text>
            <Text style={styles.headerSubtitle}>Search meters and find leaks</Text>
          </View>
        </View>
        <View style={{ width: 44 }} />
      </LinearGradient>

      <View style={styles.mapWrap}>
        <MapView ref={mapRef} style={styles.map} initialRegion={store.region} showsUserLocation>
          <UrlTile urlTemplate={TILE_SOURCES[store.tileIndex].url} maximumZ={19} tileSize={256} zIndex={0} />
        </MapView>

        <View style={styles.searchOverlay}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search" size={18} color="#9aa5b1" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Enter meter number..."
              placeholderTextColor="#9aa5b1"
              value={store.meterNumber}
              onChangeText={store.setMeterNumber}
              returnKeyType="search"
              onSubmitEditing={searchMeter}
              editable={!store.searching}
            />
          </View>
          <TouchableOpacity 
            style={[styles.searchBtn, store.searching && styles.searchBtnDisabled]} 
            onPress={searchMeter} 
            disabled={store.searching}
          >
            {store.searching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.searchBtnText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.buttonWrap}>
        <TouchableOpacity
          style={styles.primaryBtnLarge}
          onPress={() => navigation.navigate('FindNearest')}
          activeOpacity={0.85}
        >
          <Ionicons name="navigate" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.primaryBtnTextLarge}>Report Nearest Meter</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
});

export default ReportHomeScreen;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0f4f8' },
  header: { paddingHorizontal: 20, paddingVertical: 16, paddingTop: 50 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 4 },
  mapWrap: { height: 420, backgroundColor: '#ddd', marginTop: 16 },
  map: { ...StyleSheet.absoluteFillObject },
  searchOverlay: { 
    position: 'absolute', 
    top: 10, 
    left: 16, 
    right: 16, 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  searchInputWrap: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    paddingHorizontal: 12, 
    height: 44 
  },
  searchInput: { flex: 1, color: '#333' },
  searchBtn: { 
    marginLeft: 10, 
    backgroundColor: '#e6eef6', 
    height: 44, 
    paddingHorizontal: 14, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  searchBtnDisabled: { backgroundColor: '#cbd5e1', opacity: 0.6 },
  searchBtnText: { color: '#1e5a8e', fontWeight: '700' },
  buttonWrap: { padding: 20 },
  primaryBtnLarge: { 
    backgroundColor: '#1e5a8e', 
    paddingVertical: 16, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryBtnTextLarge: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
