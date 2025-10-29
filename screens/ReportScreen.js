import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, Modal, Alert, StatusBar, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { UrlTile, Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
// ...existing imports...
import { searchAccountOrMeter } from '../services/interceptor';

export default function ReportScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  // No-API tile sources (for development/testing). Be mindful of provider policies.
  const TILE_SOURCES = [
    { name: 'OSM DE', url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
    { name: 'OSM FR', url: 'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
    { name: 'HOT', url: 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
  ];
  const [tileIndex, setTileIndex] = useState(0);
  const mapRef = useRef(null);
  const [region, setRegion] = useState({
    latitude: 7.0731,
    longitude: 125.6129,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const [marker, setMarker] = useState({ latitude: region.latitude, longitude: region.longitude });
  const [coordsLabel, setCoordsLabel] = useState(`${region.latitude.toFixed(6)}, ${region.longitude.toFixed(6)}`);
  const [meterNumber, setMeterNumber] = useState('');
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [dragMode, setDragMode] = useState(false);
  const [dragPin, setDragPin] = useState(null); // New separate pin for dragging
  const [showDragConfirmModal, setShowDragConfirmModal] = useState(false);
  const [nearestModalVisible, setNearestModalVisible] = useState(false);
  const [nearestCandidate, setNearestCandidate] = useState(null);
  const [nearestSuccess, setNearestSuccess] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [currentMeterDetails, setCurrentMeterDetails] = useState(null);
  // Normalizer: map various API response shapes to a consistent meter object
  const normalizeMeterResult = (r) => {
    if (!r) return null;
    const latitude = r.latitude || r.Latitude || r.lat || r.Lat || r.latitudeString || null;
    const longitude = r.longitude || r.Longitude || r.lng || r.Long || r.longitudeString || null;

    const parsedLat = latitude !== null && latitude !== undefined && latitude !== '' ? parseFloat(latitude) : null;
    const parsedLng = longitude !== null && longitude !== undefined && longitude !== '' ? parseFloat(longitude) : null;

    return {
      // common keys used by the UI
      meterNumber: r.meterNumber || r.MeterNumber || r.meter_no || r.meterNo || r.meter || r.meter_no_string || '',
      accountNumber: r.accountNumber || r.AccountNumber || r.accountNo || r.account_number || r.account || r.account_no_string || '',
      address: r.address || r.Address || r.fullAddress || r.customerAddress || r.location || r.address_line || '',
      latitude: parsedLat,
      longitude: parsedLng,
      // keep original payload for debugging or future fields
      _raw: r,
    };
  };
  const cycleTiles = () => setTileIndex((prev) => (prev + 1) % TILE_SOURCES.length);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        const nextRegion = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
        setRegion(nextRegion);
        setMarker({ latitude: nextRegion.latitude, longitude: nextRegion.longitude });
        setCoordsLabel(`${nextRegion.latitude.toFixed(6)}, ${nextRegion.longitude.toFixed(6)}`);
        mapRef.current?.animateToRegion(nextRegion, 800);
      }
    })();
  }, []);

  // If navigated here with search results from ReportHome, ingest them
  useEffect(() => {
    const incoming = route?.params?.searchResult;
    const incomingMeter = route?.params?.meterNumber;
    if (incoming) {
      const arr = Array.isArray(incoming) ? incoming : [incoming];
      const normalized = arr.map(normalizeMeterResult);
      setSearchResults(normalized);
      setShowSearchResults(true);

      // Center map on first result if it has coordinates
      const first = normalized[0];
      if (first?.latitude && first?.longitude) {
        const nextRegion = { latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
        setRegion(nextRegion);
        setMarker({ latitude: nextRegion.latitude, longitude: nextRegion.longitude });
        setCoordsLabel(`${nextRegion.latitude.toFixed(6)}, ${nextRegion.longitude.toFixed(6)}`);
        mapRef.current?.animateToRegion(nextRegion, 800);
      }

      // Prefill search input
      setMeterNumber(incomingMeter || first?.meterNumber || first?.accountNumber || '');

      // Clear params to avoid reprocessing on back/forward
      try { navigation.setParams({ searchResult: null, meterNumber: null }); } catch (e) { /* noop */ }
    }
  }, [route?.params]);

  const handleMapPress = (e) => {
    // Don't update marker when in drag mode - let the drag pin handle it
    if (!dragMode) {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      setMarker({ latitude, longitude });
      setCoordsLabel(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    }
  };

  const locateMe = async () => {
    const loc = await Location.getCurrentPositionAsync({});
    const nextRegion = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
    setRegion(nextRegion);
    setMarker({ latitude: nextRegion.latitude, longitude: nextRegion.longitude });
    setCoordsLabel(`${nextRegion.latitude.toFixed(6)}, ${nextRegion.longitude.toFixed(6)}`);
    mapRef.current?.animateToRegion(nextRegion, 800);
  };

  const refresh = () => {
    mapRef.current?.animateToRegion(region, 500);
    setMarker({ latitude: region.latitude, longitude: region.longitude });
    setCoordsLabel(`${region.latitude.toFixed(6)}, ${region.longitude.toFixed(6)}`);
  };

  const searchMeter = async () => {
    if (!meterNumber || meterNumber.trim() === '') {
      Alert.alert('Search Error', 'Please enter a meter number or account number to search.');
      return;
    }

    setSearching(true);
    setSearchResults([]);
    
    try {
        const response = await searchAccountOrMeter(meterNumber.trim());
        const data = response?.data || response?.data?.data || response;
        const results = Array.isArray(data) ? data : data ? [data] : [];
        if (results.length > 0) {
          // Normalize results for consistent UI usage
          const normalized = results.map(normalizeMeterResult);
          setSearchResults(normalized);
          setShowSearchResults(true);
        } else {
          Alert.alert('No Results', 'No meter or account found matching your search.');
        }
    } catch (error) {
      // Friendlier message for "no results found" (API returns 404 with message)
      if (error.response?.data?.statusCode === 404 && error.response?.data?.message === 'No matching customer found.') {
        Alert.alert('No Results', 'No meter or account found matching your search.');
      } else {
        console.error('Search error:', error);
        console.error('Error details:', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          fullURL: error.config?.baseURL + error.config?.url
        });
        let errorMessage = 'Failed to search meter. Please try again.';
        if (error.response?.status === 404) {
          errorMessage = 'Search endpoint not found. The API may have changed or is unavailable.';
        } else if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        }
        Alert.alert('Search Failed', errorMessage + '\n\nURL: ' + (error.config?.baseURL || '') + (error.config?.url || ''));
      }
    } finally {
      setSearching(false);
    }
  };

  const selectSearchResult = (result) => {
    // Close search results modal
    setShowSearchResults(false);
    // Ensure normalized shape (in case searchResults were not normalized)
    const normalized = normalizeMeterResult(result);

    // If result has coordinates, move map to that location
    if (normalized?.latitude && normalized?.longitude) {
      const nextRegion = {
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(nextRegion);
      setMarker({ latitude: nextRegion.latitude, longitude: nextRegion.longitude });
      setCoordsLabel(`${nextRegion.latitude.toFixed(6)}, ${nextRegion.longitude.toFixed(6)}`);
      mapRef.current?.animateToRegion(nextRegion, 800);
    }

    // Update meter number and store normalized details
    setMeterNumber(normalized?.meterNumber || normalized?.accountNumber || '');
    setCurrentMeterDetails(normalized);

    Alert.alert('Meter Found', `Account: ${normalized?.accountNumber || 'N/A'}\nMeter: ${normalized?.meterNumber || 'N/A'}\nAddress: ${normalized?.address || 'N/A'}`);
  };

  const reportLeak = () => {
    // Show modal to select meter source (current / nearest / drag)
    setShowSourceModal(true);
  };

  // Mock meters (in real app, query server or local DB)
  const MOCK_METERS = [
    { id: 'M-1001', latitude: region.latitude + 0.0008, longitude: region.longitude + 0.0003 },
    { id: 'M-1002', latitude: region.latitude - 0.0004, longitude: region.longitude + 0.0006 },
    { id: 'M-1003', latitude: region.latitude + 0.0001, longitude: region.longitude - 0.0009 },
  ];

  const toRad = (deg) => (deg * Math.PI) / 180;
  const haversine = (a, b) => {
    const R = 6371e3; // meters
    const phi1 = toRad(a.latitude);
    const phi2 = toRad(b.latitude);
    const dPhi = toRad(b.latitude - a.latitude);
    const dLambda = toRad(b.longitude - a.longitude);
    const sinDphi = Math.sin(dPhi / 2) * Math.sin(dPhi / 2);
    const sinDlambda = Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(sinDphi + Math.cos(phi1) * Math.cos(phi2) * sinDlambda), Math.sqrt(1 - (sinDphi + Math.cos(phi1) * Math.cos(phi2) * sinDlambda)));
    return R * c;
  };

  const handleUseCurrentPinpoint = () => {
    setShowSourceModal(false);
    setDragMode(false);
    // Use dragPin if it exists (after drag mode), otherwise use marker
    const selectedCoordinates = dragPin || marker;
    setDragPin(null);
    // Navigate to the form with meter data and coordinates
    const normalized = currentMeterDetails || null;
    const meterData = normalized && (normalized.meterNumber || normalized.accountNumber)
      ? { meterNumber: normalized.meterNumber || '', accountNumber: normalized.accountNumber || '', address: normalized.address || '' }
      : { meterNumber: meterNumber || '', accountNumber: '', address: '' };

    // Ensure coordinates are numeric lat/lng
    const coords = {
      latitude: selectedCoordinates?.latitude,
      longitude: selectedCoordinates?.longitude,
    };

    navigation.navigate('LeakReportForm', {
      meterData,
      coordinates: coords,
    });
  };

  const handleNearestMeter = async () => {
    // Close the source modal and go back to ReportHome so the home screen can handle nearest-meter flow
    setShowSourceModal(false);
    setDragMode(false);
    setDragPin(null);
    try {
      navigation.navigate('ReportHome', { nearestRequest: true, coordinates: marker });
    } catch (err) {
      // Fallback: go back to previous screen
      navigation.goBack();
    }
  };

  const confirmUseNearest = () => {
    if (!nearestCandidate) return;
    const next = { latitude: nearestCandidate.latitude, longitude: nearestCandidate.longitude };
    setMarker(next);
    setCoordsLabel(`${next.latitude.toFixed(6)}, ${next.longitude.toFixed(6)}`);
    mapRef.current?.animateToRegion({ ...next, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 600);
    // Show success state inside the modal instead of a native alert
    setNearestSuccess(true);
    // Store selected nearest candidate as current meter details
    setCurrentMeterDetails(normalizeMeterResult({
      meterNumber: nearestCandidate.id || nearestCandidate.meterNumber || '',
      accountNumber: nearestCandidate.accountNumber || '',
      address: nearestCandidate.address || '',
      latitude: nearestCandidate.latitude,
      longitude: nearestCandidate.longitude,
      // include raw id
      id: nearestCandidate.id,
    }));
  };

  const cancelNearestModal = () => {
    // simply close and clear candidate, optionally reset map view
    setNearestModalVisible(false);
    setNearestCandidate(null);
    setNearestSuccess(false);
    // animate back to previous region
    mapRef.current?.animateToRegion(region, 400);
  };

  const closeNearestSuccess = () => {
    // Close modal and clear state after user taps OK on success
    setNearestModalVisible(false);
    setNearestCandidate(null);
    setNearestSuccess(false);
  };

  const handleDragPinOnMap = () => {
    // Show a nicer confirmation modal before entering drag mode
    setShowSourceModal(false);
    setShowDragConfirmModal(true);
  };

  const startDragFromModal = () => {
    // Start drag mode and place a draggable blue pin slightly offset so red current-location remains visible
    setDragMode(true);
    setDragPin({
      latitude: region.latitude + 0.001,
      longitude: region.longitude + 0.001,
    });
    setShowDragConfirmModal(false);
  };

  const cancelDragModal = () => {
    setShowDragConfirmModal(false);
  };

  const confirmDraggedLocation = () => {
    if (dragPin) {
      // Update coordinates label to show the dragged pin location
      setCoordsLabel(`${dragPin.latitude.toFixed(6)}, ${dragPin.longitude.toFixed(6)}`);
      setDragMode(false);
      // Keep dragPin visible (don't set to null)
      // Red pin (marker) stays at current location, blue pin stays where dragged
      Alert.alert('Location Confirmed', 'You can now proceed to report the leak.');
    }
  };

  const cancelDragMode = () => {
    setDragMode(false);
    setDragPin(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <StatusBar barStyle="light-content" backgroundColor="#1e5a8e" translucent />
      
      {/* Header/Navbar */}
      <LinearGradient
        colors={['#1e5a8e', '#2d7ab8']}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Report & Map</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.headerAction}>
          <Ionicons name="share-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Search bar */}
        <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={18} color="#9aa5b1" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Enter meter number..."
            placeholderTextColor="#9aa5b1"
            value={meterNumber}
            onChangeText={setMeterNumber}
            onSubmitEditing={searchMeter}
            returnKeyType="search"
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

      {/* Map */}
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          onPress={handleMapPress}
          mapType="none"
          showsUserLocation
        >
          <UrlTile
            urlTemplate={TILE_SOURCES[tileIndex].url}
            maximumZ={19}
            tileSize={256}
            zIndex={0}
          />

          {/* Current location marker */}
          <Marker
            key="current-location"
            coordinate={marker}
            pinColor="red"
            title="Current Location"
            description={`Lat: ${marker.latitude.toFixed(4)}, Lon: ${marker.longitude.toFixed(4)}`}
          />

          {/* Draggable/Confirmed pin (blue, visible in drag mode and after confirmation) */}
          {dragPin && (
            <>
              {/* Line connecting red and blue pin */}
              <Polyline
                coordinates={[marker, dragPin]}
                strokeColor="rgba(59, 130, 246, 0.7)" // semi-transparent blue
                strokeWidth={6}
                lineDashPattern={[10, 8]} // dashed line
              />
              <Marker
                key="drag-pin"
                coordinate={dragPin}
                draggable={dragMode}
                pinColor="#3b82f6"
                title={dragMode ? 'Drag to set location' : 'Selected Location'}
                description={`Lat: ${dragPin.latitude.toFixed(4)}, Lon: ${dragPin.longitude.toFixed(4)}`}
                onDragEnd={(e) => {
                  const { latitude, longitude } = e.nativeEvent.coordinate;
                  setDragPin({ latitude, longitude });
                  setDragMode(false);
                  setCoordsLabel(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
                  Alert.alert('Location Confirmed', 'You can now proceed to report the leak.');
                }}
                onDrag={(e) => {
                  const { latitude, longitude } = e.nativeEvent.coordinate;
                  setDragPin({ latitude, longitude });
                }}
              />
            </>
          )}
        </MapView>

        {/* Source selection modal */}
        <Modal visible={showSourceModal} animationType="fade" transparent onRequestClose={() => setShowSourceModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { paddingBottom: 24 + insets.bottom }]}>
              <Text style={styles.modalTitle}>Select Meter Source</Text>
              <Text style={styles.modalSubtitle}>Choose how you want to pick the meter for{'\n'}this leak report.</Text>

              <TouchableOpacity style={styles.modalOption} onPress={handleUseCurrentPinpoint} activeOpacity={0.7}>
                <View style={styles.optionIconWrapper}>
                  <Ionicons name="radio-button-on" size={24} color="#1e5a8e" />
                </View>
                <View style={styles.optionTextWrapper}>
                  <Text style={styles.optionTitle}>Current Pinpoint</Text>
                  <Text style={styles.optionSubtitle}>Use the currently selected meter</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalOption} onPress={handleNearestMeter} activeOpacity={0.7}>
                <View style={[styles.optionIconWrapper, { backgroundColor: '#d1fae5' }]}>
                  <Ionicons name="navigate-circle" size={24} color="#10b981" />
                </View>
                <View style={styles.optionTextWrapper}>
                  <Text style={styles.optionTitle}>Nearest Meter</Text>
                  <Text style={styles.optionSubtitle}>Find the nearest 1–3 meters using{'\n'}your GPS location</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalOption} onPress={handleDragPinOnMap} activeOpacity={0.7}>
                <View style={styles.optionIconWrapper}>
                  <Ionicons name="move" size={24} color="#1e5a8e" />
                </View>
                <View style={styles.optionTextWrapper}>
                  <Text style={styles.optionTitle}>Drag Pin on Map</Text>
                  <Text style={styles.optionSubtitle}>Manually drag the pin to set the{'\n'}leak location</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowSourceModal(false)} activeOpacity={0.8}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Nearest Meter Confirmation Modal */}
        <Modal visible={nearestModalVisible} animationType="fade" transparent onRequestClose={cancelNearestModal}>
          {/* Use centered overlay when showing success for a cleaner look */}
          <View style={nearestSuccess ? [styles.modalOverlay, { justifyContent: 'center' }] : styles.modalOverlay}>
            <View style={[ nearestSuccess ? styles.centeredModalCard : styles.modalCard, { padding: 20, paddingBottom: 20 + insets.bottom }]}>              
              {!nearestSuccess ? (
                <>
                  <Text style={styles.modalTitle}>Nearest Meter Found</Text>
                  {nearestCandidate ? (
                    <View style={{ alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700' }}>{nearestCandidate.id}</Text>
                      <Text style={{ color: '#6b7280', marginTop: 6 }}>Approximately {nearestCandidate.distance} m away</Text>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity style={[styles.modalSecondaryBtn, { flex: 1 }]} onPress={cancelNearestModal} activeOpacity={0.85}>
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalPrimaryLarge, { flex: 1 }]} onPress={confirmUseNearest}>
                      <LinearGradient colors={[ '#1e5a8e', '#0f4a78' ]} style={styles.modalPrimaryGradient}>
                        <Text style={styles.modalPrimaryText}>Use This Meter</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                // Improved, centered dialog-style success card
                <View style={styles.simpleSuccessCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <View style={styles.simpleIconCircle}>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.simpleSuccessTitle}>Nearest meter selected</Text>
                      {nearestCandidate ? (
                        <Text style={styles.simpleSuccessText}>Meter {nearestCandidate.id} selected ({nearestCandidate.distance} m)</Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.simpleOkRow}>
                    <TouchableOpacity onPress={closeNearestSuccess} style={styles.simpleOkBtn} activeOpacity={0.85}>
                      <Text style={styles.simpleOkText}>OK</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* Drag Confirmation Modal */}
        <Modal visible={showDragConfirmModal} animationType="slide" transparent onRequestClose={() => setShowDragConfirmModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { alignItems: 'center', paddingBottom: 48 + insets.bottom }]}>
              <View style={{ marginBottom: 8 }}>
                <LinearGradient colors={[ '#3a8ec9', '#1e5a8e' ]} style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Ionicons name="map" size={34} color="#fff" />
                </LinearGradient>
              </View>
              <Text style={styles.modalTitle}>Enter Drag Mode</Text>
              <Text style={[styles.modalSubtitle, { marginBottom: 20 }]}>Place a pin on the map by dragging it to the desired location. Your current location will remain visible for reference.</Text>

              <View style={{ flexDirection: 'row', width: '100%', gap: 12, marginBottom: 12 }}>
                <TouchableOpacity style={[styles.modalActionBtn, styles.modalSecondaryBtn, { flex: 1 }]} onPress={cancelDragModal} activeOpacity={0.85}>
                  <Text style={styles.modalCancelText}>Maybe Later</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.modalPrimaryLarge, { flex: 1 }]} onPress={startDragFromModal} activeOpacity={0.85}>
                  <LinearGradient colors={[ '#3a8ec9', '#1e5a8e' ]} style={styles.modalPrimaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="navigate" size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.modalPrimaryText}>Start Pinpoint</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Search Results Modal */}
        <Modal visible={showSearchResults} animationType="slide" transparent onRequestClose={() => setShowSearchResults(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: '70%', paddingBottom: 20 + insets.bottom }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={styles.modalTitle}>Search Results</Text>
                <TouchableOpacity onPress={() => setShowSearchResults(false)}>
                  <Ionicons name="close-circle" size={28} color="#9aa5b1" />
                </TouchableOpacity>
              </View>
              
              <ScrollView showsVerticalScrollIndicator={false}>
                {searchResults.map((result, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.searchResultItem}
                    onPress={() => selectSearchResult(result)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.searchResultIconWrapper}>
                      <Ionicons name="location" size={24} color="#1e5a8e" />
                    </View>
                    <View style={styles.searchResultContent}>
                      <Text style={styles.searchResultTitle}>
                        {result.meterNumber || result.accountNumber || 'N/A'}
                      </Text>
                      <Text style={styles.searchResultSubtitle}>
                        Account: {result.accountNumber || 'N/A'}
                      </Text>
                      <Text style={styles.searchResultAddress}>
                        {result.address || 'No address available'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Floating controls */}
        <View style={styles.floatControls}>
          <TouchableOpacity style={styles.floatBtn} onPress={cycleTiles} activeOpacity={0.7}>
            <Ionicons name="layers" size={22} color="#1e5a8e" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.floatBtn} onPress={locateMe} activeOpacity={0.7}>
            <MaterialIcons name="my-location" size={22} color="#10b981" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.floatBtn} onPress={refresh} activeOpacity={0.7}>
            <Ionicons name="refresh-circle" size={24} color="#6366f1" />
          </TouchableOpacity>
        </View>

        {/* Drag Mode Action Buttons */}
        {dragMode && dragPin && (
          <View style={styles.dragModeActions}>
            <TouchableOpacity style={styles.cancelDragBtn} onPress={cancelDragMode}>
              <Ionicons name="close-circle" size={20} color="#ef4444" />
              <Text style={styles.cancelDragText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmDragBtn} onPress={confirmDraggedLocation}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.confirmDragText}>Confirm Location</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tile Source Badge (top right) */}
        <View style={styles.tileSourceBadge}>
          <Ionicons name="map-outline" size={14} color="#1e5a8e" style={{ marginRight: 4 }} />
          <Text style={styles.tileSourceText}>{TILE_SOURCES[tileIndex].name}</Text>
        </View>

        {/* Coordinate pill */}
        <View style={styles.coordPill}>
          <Ionicons name="location" size={14} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.coordText}>{coordsLabel}</Text>
        </View>

        {/* Attribution */}
        <View style={styles.attribution}>
          <Text style={styles.attrText}>{TILE_SOURCES[tileIndex].attribution}</Text>
        </View>
      </View>

      {/* Meter Details Card */}
      <View style={styles.detailsCard}>
        <Text style={styles.detailsTitle}>Meter Details</Text>

        <View style={styles.detailRow}>
          <Ionicons name="speedometer-outline" size={18} color="#1e3a5f" style={styles.detailIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLabel}>Meter Number</Text>
            <Text style={styles.detailValue}>{currentMeterDetails?.meterNumber || meterNumber || 'N/A'}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="document-text-outline" size={18} color="#1e3a5f" style={styles.detailIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLabel}>Account Number</Text>
            <Text style={styles.detailValue}>{currentMeterDetails?.accountNumber || 'N/A'}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={18} color="#1e3a5f" style={styles.detailIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLabel}>Address</Text>
            <Text style={styles.detailValue}>{currentMeterDetails?.address || 'N/A'}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={reportLeak}>
          <Text style={styles.primaryBtnText}>Report Leak</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0f4f8' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100, paddingTop: 50 },
  headerSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  headerAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 10,
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
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  searchInput: { flex: 1, color: '#333' },
  searchBtn: {
    backgroundColor: '#e6eef6',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  searchBtnDisabled: {
    backgroundColor: '#cbd5e1',
    opacity: 0.6,
  },
  searchBtnText: { color: '#1e5a8e', fontWeight: '700', fontSize: 14, lineHeight: 18 },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchResultIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#e6eef6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  searchResultContent: {
    flex: 1,
  },
  searchResultTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e3a5f',
    marginBottom: 4,
  },
  searchResultSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 2,
  },
  searchResultAddress: {
    fontSize: 12,
    color: '#9aa5b1',
  },
  mapWrap: {
    marginTop: 12,
    marginHorizontal: 16,
    height: 300,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  floatControls: {
    position: 'absolute',
    right: 14,
    top: 14,
    gap: 10,
  },
  floatBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1e5a8e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tileSourceBadge: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tileSourceText: {
    color: '#1e5a8e',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  coordPill: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 90, 142, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  coordText: { 
    color: '#fff', 
    fontSize: 12, 
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  attribution: {
    position: 'absolute',
    left: 14,
    top: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  attrText: { 
    fontSize: 10, 
    color: '#475569',
    fontWeight: '500',
  },
  detailsCard: {
    backgroundColor: '#fff',
    marginTop: 12,
    marginHorizontal: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 6,
  },
  detailsTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  detailIcon: { marginRight: 10 },
  detailLabel: { fontSize: 12, color: '#6b7280' },
  detailValue: { fontSize: 14, color: '#1f2937', fontWeight: '600' },
  primaryBtn: {
    marginTop: 6,
    backgroundColor: '#1e5a8e',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
  
  /* Modal styles */
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'flex-end', 
    alignItems: 'center',
  },
  modalCard: { 
    width: '100%', 
    backgroundColor: '#fff', 
    borderTopLeftRadius: 20, 
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 32,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: -4 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 12, 
    elevation: 12,
  },
  modalTitle: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#111', 
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: { 
    color: '#6b7280', 
    fontSize: 13, 
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOption: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  optionIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e6f0fb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  optionTextWrapper: {
    flex: 1,
  },
  optionTitle: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#111',
    marginBottom: 3,
  },
  optionSubtitle: { 
    fontSize: 12, 
    color: '#6b7280',
    lineHeight: 16,
  },
  modalCancel: { 
    marginTop: 8, 
    alignItems: 'center', 
    paddingVertical: 14,
    borderRadius: 12,
  },
  modalCancelText: { 
    color: '#64748b', 
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  /* Drag mode action buttons */
  dragModeActions: {
    position: 'absolute',
    bottom: 20,
    left: 18,
    right: 18,
    flexDirection: 'row',
    gap: 14,
    zIndex: 10,
  },
  cancelDragBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  cancelDragText: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 15,
    marginLeft: 6,
  },
  confirmDragBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  confirmDragText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    marginLeft: 6,
  },
  modalPrimaryLarge: {
    borderRadius: 10,
    shadowColor: '#1e5a8e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  modalPrimaryGradient: {
    height: 44,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    overflow: 'hidden',
  },
  modalPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  /* Shared modal action button base */
  modalActionBtn: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 12,
  },
  /* Secondary button variant: flat, no border, subtle shadow */
  modalSecondaryBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    height: 44,
    paddingVertical: 0,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  /* Success centered card for nearest meter */
  successCardContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 6,
    marginBottom: 6,
    textAlign: 'center',
  },
  successSubtitle: {
    color: '#475569',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  successOkWrap: {
    width: '60%',
    alignSelf: 'center',
  },
  successOkBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  successOkText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  /* Simple alert-like success card styles */
  simpleSuccessCard: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 0,
    width: '100%',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  centeredModalCard: {
    width: '86%',
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
  },
  simpleIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  /* Custom map marker styles - modern circle pins */
  modernPinRed: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernPinInnerRed: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  modernPinBlue: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernPinInnerBlue: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  simpleSuccessTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  simpleSuccessText: {
    color: '#374151',
    fontSize: 14,
  },
  simpleOkRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingRight: 6,
  },
  simpleOkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  simpleOkText: {
    color: '#2563eb',
    fontWeight: '600',
  },
});
