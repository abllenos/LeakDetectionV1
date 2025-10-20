import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { UrlTile } from 'react-native-maps';
import { searchAccountOrMeter } from '../services/api';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

export default function ReportHomeScreen({ navigation, route }) {
  const TILE_SOURCES = [
    { name: 'OSM DE', url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
  ];

  const [tileIndex] = useState(0);
  const mapRef = useRef(null);
  const [region, setRegion] = useState({ latitude: 7.0731, longitude: 125.6129, latitudeDelta: 0.05, longitudeDelta: 0.05 });
  const [meterNumber, setMeterNumber] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        const nextRegion = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 };
        setRegion(nextRegion);
        mapRef.current?.animateToRegion(nextRegion, 600);
      }
    })();
  }, []);

  // Handle params when navigated back from NearestMeters
  useEffect(() => {
    const sel = route?.params?.selectedMeter;
    if (sel) {
      // Prefill the input
      setMeterNumber(sel.meterNumber || '');
      // Center map to the selected meter coordinates if provided
      if (sel.latitude && sel.longitude) {
        const nextRegion = { latitude: sel.latitude, longitude: sel.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
        setRegion(nextRegion);
        mapRef.current?.animateToRegion(nextRegion, 600);
      }
      // Clear the param so repeated navigations don't reapply
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
    if (!meterNumber || meterNumber.trim() === '') {
      // Navigate to report map for general reporting
      navigation.navigate('ReportMap', { meterNumber });
      return;
    }
    setSearching(true);
    try {
      const resp = await searchAccountOrMeter(meterNumber.trim());
      const result = resp?.data || resp?.data?.data || resp;
      if (!result || (Array.isArray(result) && result.length === 0)) {
        Alert.alert('No results', 'No meter or account found for that query.');
      }
      // Pass API result to ReportMap for display/selection
      navigation.navigate('ReportMap', { meterNumber: meterNumber.trim(), searchResult: result });
    } catch (err) {
      console.warn('search api error', err);
      Alert.alert('Search failed', 'Unable to search at this time.');
    } finally {
      setSearching(false);
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
        <MapView ref={mapRef} style={styles.map} initialRegion={region} showsUserLocation>
          <UrlTile urlTemplate={TILE_SOURCES[tileIndex].url} maximumZ={19} tileSize={256} zIndex={0} />
        </MapView>

        <View style={styles.searchOverlay}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search" size={18} color="#9aa5b1" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Enter meter number..."
              placeholderTextColor="#9aa5b1"
              value={meterNumber}
              onChangeText={setMeterNumber}
              returnKeyType="search"
              onSubmitEditing={searchMeter}
              editable={!searching}
            />
          </View>
          <TouchableOpacity 
            style={[styles.searchBtn, searching && styles.searchBtnDisabled]} 
            onPress={searchMeter} 
            disabled={searching}
          >
            {searching ? (
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
}

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
