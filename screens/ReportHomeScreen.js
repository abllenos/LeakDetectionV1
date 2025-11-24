import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { useReportMapStore } from '../stores/RootStore';
import LeafletMap from '../components/LeafletMap';

// Component wrapped with observer - navigation/route props extracted to prevent MobX observation
const ReportHomeScreenInner = observer(({ navigation, params }) => {
  const store = useReportMapStore();

  useEffect(() => {
    (async () => {
      await store.initializeLocation();
    })();
  }, []);

  // Handle params when navigated back from NearestMeters
  useEffect(() => {
    const sel = params?.selectedMeter;
    if (sel) {
      store.handleSelectedMeter(sel);
      navigation.setParams({ selectedMeter: null });
    }
  }, [params]);

  // If another screen requested nearest-meter flow, forward to FindNearest
  useEffect(() => {
    const nearestReq = params?.nearestRequest;
    const coords = params?.coordinates;
    if (nearestReq) {
      // Clear param to avoid loops
      navigation.setParams({ nearestRequest: null, coordinates: null });
      // Forward to FindNearest with coordinates (if provided) so it can perform location-based search
      navigation.navigate('FindNearest', { coordinates: coords });
    }
  }, [params]);

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
        colors={['#1e5a8e', '#2d7ab8']}
        style={styles.header}
      >
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.headerTitle}>Report Leak</Text>
            <Text style={styles.headerSubtitle}>Choose how to report</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Search bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search" size={18} color="#9aa5b1" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Enter meter number..."
              placeholderTextColor="#9aa5b1"
              value={store.meterNumber}
              onChangeText={(text) => store.setMeterNumber(text)}
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

        <View style={styles.mapWrap}>
          <LeafletMap
            latitude={store.region.latitude}
            longitude={store.region.longitude}
            zoom={14}
            markers={[]}
            userLocation={{ latitude: store.region.latitude, longitude: store.region.longitude }}
            showUserLocation={true}
            style={styles.map}
          />
        </View>

        <View style={styles.optionsSection}>
          <Text style={styles.sectionTitle}>Report Options</Text>
          <Text style={styles.sectionSubtitle}>Choose the best way to report the leak location</Text>

          {/* Report Nearest Meter */}
          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => navigation.navigate('FindNearest')}
            activeOpacity={0.7}
          >
            <View style={[styles.optionIconWrap, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="navigate" size={28} color="#1e5a8e" />
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Report Nearest Meter</Text>
              <Text style={styles.optionDescription}>
                Find the 3 closest meters to your location and select one
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
          </TouchableOpacity>

          {/* Use Current Location */}
          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => navigation.navigate('ReportMap', { useCurrentLocation: true })}
            activeOpacity={0.7}
          >
            <View style={[styles.optionIconWrap, { backgroundColor: '#f0fdf4' }]}>
              <Ionicons name="location" size={28} color="#10b981" />
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Use Current Location</Text>
              <Text style={styles.optionDescription}>
                Report the leak at your current GPS position
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
          </TouchableOpacity>

          {/* Drag Pin on Map */}
          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => navigation.navigate('ReportMap', { useDragPin: true })}
            activeOpacity={0.7}
          >
            <View style={[styles.optionIconWrap, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="pin" size={28} color="#3b82f6" />
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Drag Pin on Map</Text>
              <Text style={styles.optionDescription}>
                Manually place a pin on the map by dragging
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
});

// Wrapper to extract route params before passing to observer component
const ReportHomeScreen = ({ navigation, route }) => {
  // Extract params to prevent MobX from trying to observe route object
  const params = route?.params || {};
  return <ReportHomeScreenInner navigation={navigation} params={params} />;
};

export default ReportHomeScreen;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0f4f8' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: 50,
    padding: 8,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  headerSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2, textAlign: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    gap: 10,
  },
  searchInputWrap: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    paddingHorizontal: 12, 
    height: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: { flex: 1, color: '#333', fontSize: 15 },
  searchBtn: { 
    backgroundColor: '#1e5a8e', 
    height: 44, 
    paddingHorizontal: 18, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchBtnDisabled: { backgroundColor: '#cbd5e1', opacity: 0.6 },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  mapWrap: { 
    height: 400, 
    backgroundColor: '#ddd', 
    marginHorizontal: 16, 
    borderRadius: 16, 
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  map: { ...StyleSheet.absoluteFillObject },
  
  optionsSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  optionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
});
