import React, { useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Alert, StatusBar, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { useReportMapStore } from '../stores/RootStore';
import LeafletMap from '../components/LeafletMap';
import { useFocusEffect } from '@react-navigation/native';
import styles from '../styles/ReportStyles';

const ReportScreenInner = observer(({ navigation, params }) => {
  const insets = useSafeAreaInsets();
  const store = useReportMapStore();
  const mapRef = useRef(null);
  const [routeCoordinates, setRouteCoordinates] = React.useState([]);
  const [hasError, setHasError] = React.useState(false);
  const [nearestMeterData, setNearestMeterData] = React.useState(null);
  const [scrollEnabled, setScrollEnabled] = React.useState(true);

  // Error boundary effect
  useEffect(() => {
    const errorHandler = (error, isFatal) => {
      console.error('[ReportScreen] Error caught:', error);
      if (isFatal) {
        setHasError(true);
      }
    };
    return () => { };
  }, []);

  if (hasError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Ionicons name="alert-circle" size={48} color="#ef4444" />
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 16 }}>Something went wrong</Text>
        <Text style={{ textAlign: 'center', marginTop: 8, color: '#666' }}>
          Please restart the app or contact support if the problem persists.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 20, backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
          onPress={() => {
            setHasError(false);
            navigation.goBack();
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const TILE_SOURCES = [
    { name: 'OSM DE', url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
    { name: 'OSM FR', url: 'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
    { name: 'HOT', url: 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
  ];
  const cycleTiles = () => store.cycleTiles();

  // Fetch road route using free OSRM routing service
  const fetchRoadRoute = React.useCallback(async (start, end) => {
    if (!start || !end) return;

    try {
      // OSRM (Open Source Routing Machine) - completely free, no API key needed
      const url = `https://router.project-osrm.org/route/v1/foot/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map(coord => ({
          latitude: coord[1],
          longitude: coord[0],
        }));
        setRouteCoordinates(coordinates);
        console.log(`✅ Road route fetched: ${coordinates.length} points`);
      } else {
        // Fallback to straight line if routing fails
        console.warn('⚠️ Routing failed, using straight line');
        setRouteCoordinates([start, end]);
      }
    } catch (error) {
      console.error('❌ Error fetching road route:', error);
      // Fallback to straight line on error
      setRouteCoordinates([start, end]);
    }
  }, []);

  // Update route when drag pin changes (with debouncing to reduce API calls)
  React.useEffect(() => {
    if (store.dragPin && store.userGpsLocation) {
      // Debounce: only fetch route after user stops dragging for 500ms
      const timeoutId = setTimeout(() => {
        fetchRoadRoute(toJS(store.userGpsLocation), toJS(store.dragPin));
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [store.dragPin?.latitude, store.dragPin?.longitude, fetchRoadRoute]);

  // Update route when a meter is searched and found
  React.useEffect(() => {
    if (store.currentMeterDetails?.latitude && store.currentMeterDetails?.longitude && store.userGpsLocation && !store.dragMode) {
      const meterLocation = {
        latitude: store.currentMeterDetails.latitude,
        longitude: store.currentMeterDetails.longitude
      };
      fetchRoadRoute(toJS(store.userGpsLocation), meterLocation);
    }
  }, [store.currentMeterDetails?.latitude, store.currentMeterDetails?.longitude, fetchRoadRoute, store.dragMode]);

  useEffect(() => {
    (async () => {
      const nextRegion = await store.initializeLocation();
      if (nextRegion) {
        mapRef.current?.animateToRegion(nextRegion, 800);
      }
    })();
  }, []);

  // If navigated here with search results from ReportHome, ingest them
  useEffect(() => {
    const incoming = params?.searchResult;
    const incomingMeter = params?.meterNumber;
    const incomingLat = params?.latitude;
    const incomingLng = params?.longitude;
    const prefilledData = params?.prefilledData;
    const fromNearest = params?.fromNearest;

    // Handle incoming from NearestMeters screen with prefilled meter data
    if (fromNearest && prefilledData) {
      console.log('📍 Showing meter from NearestMeters:', prefilledData);
      const reportLocation = {
        latitude: parseFloat(prefilledData.latitude),
        longitude: parseFloat(prefilledData.longitude)
      };

      // Store meter data in state for later use
      setNearestMeterData({
        meterNumber: incomingMeter,
        accountNumber: prefilledData.accountNumber,
        address: prefilledData.address,
        dma: prefilledData.dma,
        latitude: reportLocation.latitude,
        longitude: reportLocation.longitude,
      });

      // Update store marker to show this location
      store.updateMarkerAndLabel(reportLocation.latitude, reportLocation.longitude);

      // Set meter number if provided
      if (incomingMeter) {
        store.setMeterNumber(incomingMeter);
      }

      // Animate map to this location
      const nextRegion = {
        latitude: reportLocation.latitude,
        longitude: reportLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005
      };
      mapRef.current?.animateToRegion(nextRegion, 800);

      // Clear params to prevent re-triggering
      try {
        navigation.setParams({ fromNearest: null, prefilledData: null });
      } catch (e) { /* noop */ }
    }
    // Handle incoming from Dashboard "View on Map" with direct coordinates
    else if (incomingLat && incomingLng) {
      const reportLocation = {
        latitude: parseFloat(incomingLat),
        longitude: parseFloat(incomingLng)
      };

      // Update store marker to show this location
      store.updateMarkerAndLabel(reportLocation.latitude, reportLocation.longitude);

      // Animate map to this location
      const nextRegion = {
        latitude: reportLocation.latitude,
        longitude: reportLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01
      };
      mapRef.current?.animateToRegion(nextRegion, 800);

      // Clear params to prevent re-triggering
      try {
        navigation.setParams({ latitude: null, longitude: null });
      } catch (e) { /* noop */ }
    }
    // Handle incoming meter number without coordinates - search for it
    else if (incomingMeter && !incoming) {
      console.log('🔍 Searching for meter coordinates:', incomingMeter);
      // Set the meter number in the store and search
      store.setMeterNumber(incomingMeter);
      store.searchMeter().then((results) => {
        // After search, check if we found results
        if (results && results.length > 0) {
          const first = results[0];
          if (first.latitude && first.longitude) {
            store.updateMarkerAndLabel(first.latitude, first.longitude);
            const nextRegion = {
              latitude: first.latitude,
              longitude: first.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005
            };
            mapRef.current?.animateToRegion(nextRegion, 800);
            console.log('✅ Found meter location:', first);
          }
        } else {
          console.warn('⚠️ No results found for meter:', incomingMeter);
        }
      }).catch((error) => {
        console.error('❌ Error searching meter:', error);
      });

      // Clear param
      try {
        navigation.setParams({ meterNumber: null });
      } catch (e) { /* noop */ }
    }
    // Handle search results from ReportHome
    else if (incoming) {
      const first = store.handleIncomingSearchResult(incoming, incomingMeter);
      if (first?.latitude && first?.longitude) {
        const nextRegion = { latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 };
        mapRef.current?.animateToRegion(nextRegion, 800);
      }
      try { navigation.setParams({ searchResult: null, meterNumber: null }); } catch (e) { /* noop */ }
    }
  }, [params]);

  // Handle useDragPin and useCurrentLocation params from ReportHomeScreen
  useEffect(() => {
    const useDragPin = params?.useDragPin;
    const useCurrentLocation = params?.useCurrentLocation;

    if (useDragPin) {
      // Directly enter drag mode without showing modals
      console.log('Entering drag mode directly from ReportHome');
      // Clear any previous meter data from Nearest Meters
      setNearestMeterData(null);
      store.setCurrentMeterDetails(null);
      store.setMeterNumber('');
      store.setShowSourceModal(false);
      store.setShowDragConfirmModal(false);
      store.confirmStartDrag(); // This sets dragMode=true and creates the drag pin
      // Clear the param to prevent re-triggering
      try { navigation.setParams({ useDragPin: null, fromNearest: null, prefilledData: null }); } catch (e) { /* noop */ }
    } else if (useCurrentLocation) {
      // Directly use current location
      const coords = store.marker || store.region;
      if (coords) {
        navigation.navigate('LeakReportForm', {
          meterData: null,
          coordinates: {
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
          fromNearest: false,
        });
      }
      // Clear the param
      try { navigation.setParams({ useCurrentLocation: null }); } catch (e) { /* noop */ }
    }
  }, [params]);

  // Handle fromDraft - navigate to form with draft data
  useEffect(() => {
    const fromDraft = params?.fromDraft;
    const draftData = params?.draftData;
    const draftId = params?.draftId;

    if (fromDraft && draftData) {
      console.log('📝 Loading draft:', draftId);

      // Navigate to form with draft data
      navigation.navigate('LeakReportForm', {
        meterData: draftData.meterData || null,
        coordinates: draftData.coordinates || null,
        fromNearest: false,
        fromDraft: true,
        draftId: draftId,
        draftData: draftData,
      });

      // Clear params
      try { navigation.setParams({ fromDraft: null, draftData: null, draftId: null }); } catch (e) { /* noop */ }
    }
  }, [params?.fromDraft]);

  // Handle selectLeakLocation mode - for selecting where the actual leak is (from LeakReportForm)
  const [leakSelectionMode, setLeakSelectionMode] = React.useState(false);
  const [leakSelectionData, setLeakSelectionData] = React.useState(null);

  useEffect(() => {
    const selectLeakLocation = params?.selectLeakLocation;
    const meterCoordinates = params?.meterCoordinates;
    const meterDataParam = params?.meterData;

    if (selectLeakLocation && meterCoordinates) {
      console.log('🎯 Entering leak location selection mode');
      setLeakSelectionMode(true);
      setLeakSelectionData({ meterCoordinates, meterData: meterDataParam });

      // Center map on meter location
      if (meterCoordinates?.latitude && meterCoordinates?.longitude) {
        const nextRegion = {
          latitude: meterCoordinates.latitude,
          longitude: meterCoordinates.longitude,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        };
        mapRef.current?.animateToRegion(nextRegion, 800);

        // Start drag mode with pin at meter location (user will drag to leak location)
        store.setDragMode(true);
        store.setDragPin({
          latitude: meterCoordinates.latitude,
          longitude: meterCoordinates.longitude,
        });
      }

      // Clear params
      try { navigation.setParams({ selectLeakLocation: null, meterCoordinates: null, meterData: null }); } catch (e) { /* noop */ }
    }
  }, [params?.selectLeakLocation]);

  // Clear nearest meter data when screen gains focus (after navigating back)
  useFocusEffect(
    React.useCallback(() => {
      // Clear meter data when screen regains focus (e.g., coming back from another screen)
      console.log('🔄 Focus effect triggered. nearestMeterData:', nearestMeterData);
      if (nearestMeterData) {
        console.log('🧹 Clearing nearest meter data on focus');
        setNearestMeterData(null);
        store.setCurrentMeterDetails(null);
        store.setMeterNumber('');
      }
    }, [nearestMeterData])
  );

  const handleMapPress = (e) => {
    // Handle both react-native-maps format (e.nativeEvent.coordinate) 
    // and LeafletMap format (direct latitude/longitude)
    const latitude = e?.nativeEvent?.coordinate?.latitude || e?.latitude;
    const longitude = e?.nativeEvent?.coordinate?.longitude || e?.longitude;

    console.log('📍 Map pressed:', { latitude, longitude, dragMode: store.dragMode });

    if (latitude && longitude) {
      if (store.dragMode) {
        // In drag mode, update the drag pin location
        console.log('🎯 Updating drag pin to:', { latitude, longitude });
        store.setDragPin({ latitude, longitude });
      } else {
        // Not in drag mode, update the main marker
        store.updateMarkerAndLabel(latitude, longitude);
      }
    }
  };

  const locateMe = async () => {
    const nextRegion = await store.locateMe();
    if (nextRegion) {
      mapRef.current?.animateToRegion(nextRegion, 800);
    }
  };

  const refresh = () => {
    const region = store.refresh();
    mapRef.current?.animateToRegion(region, 500);
  };

  const searchMeter = async () => {
    await store.searchMeter();
  };

  const selectSearchResult = (result) => {
    const normalized = store.selectSearchResult(result);
    if (normalized?.latitude && normalized?.longitude) {
      // Close modal first, then animate
      store.setShowSearchResults(false);

      // Use setTimeout to allow modal to close before animating
      setTimeout(() => {
        const nextRegion = {
          latitude: normalized.latitude,
          longitude: normalized.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        };
        console.log('📍 Centering to searched meter:', normalized);
        mapRef.current?.animateToRegion(nextRegion, 1000);
      }, 300);
    }
  };

  const reportLeak = () => {
    // Handle leak location selection mode - return leak location back to LeakReportForm
    if (leakSelectionMode && leakSelectionData) {
      const dragCoords = store.dragPin;
      if (!dragCoords?.latitude || !dragCoords?.longitude) {
        Alert.alert('No Location', 'Please drag the pin to where the leak is located.');
        return;
      }

      console.log('📍 Returning leak location:', dragCoords);
      console.log('📍 Meter data to restore:', leakSelectionData.meterData);
      console.log('📍 Meter coordinates to restore:', leakSelectionData.meterCoordinates);

      // Save data before resetting state
      const savedMeterData = leakSelectionData.meterData;
      const savedMeterCoordinates = leakSelectionData.meterCoordinates;
      const savedLeakLocation = {
        latitude: dragCoords.latitude,
        longitude: dragCoords.longitude,
      };

      // Reset leak selection mode
      setLeakSelectionMode(false);
      setLeakSelectionData(null);
      store.setDragMode(false);
      store.setDragPin(null);

      // Use goBack and pass params - this ensures we go back to the SAME screen instance
      // Then immediately set params on that screen
      navigation.navigate({
        name: 'LeakReportForm',
        params: {
          meterData: savedMeterData,
          coordinates: savedMeterCoordinates,
          leakLocation: savedLeakLocation,
          fromLeakLocationSelection: true,
          _timestamp: Date.now(), // Force param change detection
        },
        merge: true, // Merge with existing params
      });
      return;
    }

    // If in drag mode with a drag pin, go directly to form with drag pin location
    if (store.dragMode && store.dragPin) {
      const coords = {
        latitude: store.dragPin.latitude,
        longitude: store.dragPin.longitude,
      };

      navigation.navigate('LeakReportForm', {
        meterData: { meterNumber: store.meterNumber || '', accountNumber: '', address: '' },
        coordinates: coords,
        fromDragPin: true,
      });
      return;
    }

    // Check if we have stored meter data from NearestMeters
    if (nearestMeterData) {
      // Directly navigate to leak form with the meter data
      const meterData = {
        meterNumber: nearestMeterData.meterNumber || '',
        accountNumber: nearestMeterData.accountNumber || '',
        address: nearestMeterData.address || '',
        dma: nearestMeterData.dma || '',
      };

      const coords = {
        latitude: nearestMeterData.latitude,
        longitude: nearestMeterData.longitude,
      };

      navigation.navigate('LeakReportForm', {
        meterData,
        coordinates: coords,
        fromNearest: true,
      });
      return;
    }

    // Check if we have meter details from search or confirmUseNearest
    if (store.currentMeterDetails && store.currentMeterDetails.latitude && store.currentMeterDetails.longitude) {
      const meterData = {
        meterNumber: store.currentMeterDetails.meterNumber || '',
        accountNumber: store.currentMeterDetails.accountNumber || '',
        address: store.currentMeterDetails.address || '',
        dma: store.currentMeterDetails.dma || '',
      };

      const coords = {
        latitude: store.currentMeterDetails.latitude,
        longitude: store.currentMeterDetails.longitude,
      };

      navigation.navigate('LeakReportForm', {
        meterData,
        coordinates: coords,
      });
      return;
    }

    // No meter data - show source modal
    store.setShowSourceModal(true);
  };

  const handleUseCurrentPinpoint = () => {
    store.setShowSourceModal(false);
    store.setDragMode(false);
    const selectedCoordinates = store.dragPin || store.marker;
    store.setDragPin(null);

    // Clear nearest meter data when using current pinpoint
    if (nearestMeterData) {
      setNearestMeterData(null);
      store.setCurrentMeterDetails(null);
      store.setMeterNumber('');
    }

    const normalized = store.currentMeterDetails || null;
    const meterData = (normalized && (normalized.meterNumber || normalized.accountNumber))
      ? {
        meterNumber: normalized.meterNumber || '',
        accountNumber: normalized.accountNumber || '',
        address: normalized.address || '',
        dma: normalized.dma || ''
      }
      : { meterNumber: store.meterNumber || '', accountNumber: '', address: '', dma: '' };

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
    store.setShowSourceModal(false);
    store.setDragMode(false);
    store.setDragPin(null);
    try {
      navigation.navigate('ReportHome', { nearestRequest: true, coordinates: store.marker });
    } catch (err) {
      navigation.goBack();
    }
  };

  const handleDragPinOnMap = () => {
    // Clear any existing meter search params to prevent auto-search
    try {
      navigation.setParams({ meterNumber: null, searchResult: null, fromNearest: null, prefilledData: null });
    } catch (e) { /* noop */ }
    // Clear the nearest meter data when switching to drag mode
    setNearestMeterData(null);
    store.setCurrentMeterDetails(null);
    store.setMeterNumber('');
    store.startDragMode();
  };

  const confirmUseNearest = () => {
    const nextRegion = store.confirmUseNearest();
    if (nextRegion) {
      mapRef.current?.animateToRegion(nextRegion, 600);
    }
  };

  const cancelNearestModal = () => {
    const region = store.cancelNearestModal();
    mapRef.current?.animateToRegion(region, 400);
  };

  const closeNearestSuccess = () => {
    store.closeNearestSuccess();
  };

  const cancelDragModal = () => {
    store.setShowDragConfirmModal(false);
  };

  const startDragFromModal = () => {
    store.confirmStartDrag();
  };

  const confirmDraggedLocation = () => {
    if (store.dragPin) {
      const coords = toJS(store.dragPin);
      store.confirmDragLocation(); // This shows alert and exits drag mode
      // Navigate to form with the dragged pin coordinates
      navigation.navigate('LeakReportForm', {
        meterData: null,
        coordinates: {
          latitude: coords.latitude,
          longitude: coords.longitude,
        },
        fromNearest: false,
      });
    }
  };

  const cancelDragMode = () => {
    store.cancelDragMode();
  };

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f0f4f8" translucent />

      {/* Header with Gradient */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate('ReportHome')}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.headerTitle}>Report & Map</Text>
            <Text style={styles.headerSubtitle}>Search meter or pick location</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={scrollEnabled}
        nestedScrollEnabled={true}
      >
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
              onSubmitEditing={searchMeter}
              returnKeyType="search"
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

        {/* Leak Location Selection Mode Banner */}
        {leakSelectionMode && (
          <View style={styles.leakSelectionBanner}>
            <Ionicons name="water" size={18} color="#991b1b" />
            <Text style={styles.leakSelectionBannerText}>
              Drag the red pin to where the leak is located
            </Text>
            <TouchableOpacity
              onPress={() => {
                setLeakSelectionMode(false);
                setLeakSelectionData(null);
                store.setDragMode(false);
                store.setDragPin(null);
                navigation.goBack();
              }}
              style={styles.leakSelectionCancelBtn}
            >
              <Text style={styles.leakSelectionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Map */}
        <View
          style={styles.mapWrap}
          onTouchStart={() => setScrollEnabled(false)}
          onTouchEnd={() => setScrollEnabled(true)}
          onTouchCancel={() => setScrollEnabled(true)}
        >
          <LeafletMap
            key={`map-${store.currentMeterDetails?.latitude?.toFixed(4) || 'none'}-${store.currentMeterDetails?.longitude?.toFixed(4) || 'none'}`}
            latitude={store.currentMeterDetails?.latitude || store.marker.latitude}
            longitude={store.currentMeterDetails?.longitude || store.marker.longitude}
            zoom={18}
            markers={[
              // Show meter marker in leak selection mode (fixed, green)
              ...(leakSelectionMode && leakSelectionData?.meterCoordinates ? [{
                latitude: leakSelectionData.meterCoordinates.latitude,
                longitude: leakSelectionData.meterCoordinates.longitude,
                title: '🚰 Meter Location',
                description: `${leakSelectionData.meterData?.meterNumber || 'N/A'} (fixed)`,
                color: '#10b981',
                label: '🚰'
              }] : []),
              // Add selected meter marker if available (from search or confirmUseNearest)
              ...(!leakSelectionMode && store.currentMeterDetails?.latitude && store.currentMeterDetails?.longitude && !store.dragMode ? [{
                latitude: store.currentMeterDetails.latitude,
                longitude: store.currentMeterDetails.longitude,
                title: '🚰 Selected Meter',
                description: `${store.currentMeterDetails.meterNumber || 'N/A'} - ${store.currentMeterDetails.address || 'N/A'}`,
                color: '#10b981',
                label: '📍'
              }] : []),
              // Add drag pin if in drag mode - make it prominent
              ...(store.dragPin ? [{
                latitude: store.dragPin.latitude,
                longitude: store.dragPin.longitude,
                title: store.dragMode ? '📍 Drag to set location' : '✅ Selected Location',
                description: '',
                color: store.dragMode ? '#f59e0b' : '#10b981',
                label: store.dragMode ? '📌' : '✓'
              }] : [])
            ]}
            polylines={routeCoordinates.length > 0 ? [{
              coordinates: routeCoordinates.map(coord => [coord.latitude, coord.longitude]),
              color: '#3b82f6',
              weight: 5,
              opacity: 0.8
            }] : []}
            userLocation={{ latitude: store.userGpsLocation.latitude, longitude: store.userGpsLocation.longitude }}
            showUserLocation={true}
            onMapPress={handleMapPress}
            style={StyleSheet.absoluteFill}
          />

          {/* Source selection modal */}
          <Modal visible={store.showSourceModal} animationType="fade" transparent onRequestClose={() => store.setShowSourceModal(false)}>
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

                <TouchableOpacity style={styles.modalCancel} onPress={() => store.setShowSourceModal(false)} activeOpacity={0.8}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Drag Confirmation Modal */}
          <Modal visible={store.showDragConfirmModal} animationType="slide" transparent onRequestClose={() => store.setShowDragConfirmModal(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { alignItems: 'center', paddingBottom: 48 + insets.bottom }]}>
                <View style={{ marginBottom: 8 }}>
                  <LinearGradient colors={['#3a8ec9', '#1e5a8e']} style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
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
                    <LinearGradient colors={['#3a8ec9', '#1e5a8e']} style={styles.modalPrimaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
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
          <Modal visible={store.showSearchResults} animationType="slide" transparent onRequestClose={() => store.setShowSearchResults(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { maxHeight: '70%', paddingBottom: 20 + insets.bottom }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={styles.modalTitle}>Search Results</Text>
                  <TouchableOpacity onPress={() => store.setShowSearchResults(false)}>
                    <Ionicons name="close-circle" size={28} color="#9aa5b1" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {store.searchResults.map((result, index) => (
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

          {/* Tile Source Badge (top right) */}
          <View style={styles.tileSourceBadge}>
            <Ionicons name="map-outline" size={14} color="#1e5a8e" style={{ marginRight: 4 }} />
            <Text style={styles.tileSourceText}>{TILE_SOURCES[store.tileIndex].name}</Text>
          </View>

          {/* Attribution */}
          <View style={styles.attribution}>
            <Text style={styles.attrText}>{TILE_SOURCES[store.tileIndex].attribution}</Text>
          </View>
        </View>

        {/* Meter Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Meter Details</Text>

          <View style={styles.detailRow}>
            <Ionicons name="speedometer-outline" size={18} color="#1e3a5f" style={styles.detailIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>Meter Number</Text>
              <Text style={styles.detailValue}>{store.currentMeterDetails?.meterNumber || store.meterNumber || 'N/A'}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="document-text-outline" size={18} color="#1e3a5f" style={styles.detailIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>Account Number</Text>
              <Text style={styles.detailValue}>{store.currentMeterDetails?.accountNumber || 'N/A'}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={18} color="#1e3a5f" style={styles.detailIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>Address</Text>
              <Text style={styles.detailValue}>{store.currentMeterDetails?.address || 'N/A'}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="water-outline" size={18} color="#1e3a5f" style={styles.detailIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>DMA (District Metered Area)</Text>
              <Text style={styles.detailValue}>{store.currentMeterDetails?.dma || nearestMeterData?.dma || 'N/A'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, leakSelectionMode && styles.leakSelectionBtn]}
            onPress={reportLeak}
          >
            <Text style={styles.primaryBtnText}>
              {leakSelectionMode ? 'Confirm Leak Location' : 'Report Leak'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
});

// Wrapper to extract route params before passing to observer component
const ReportScreen = ({ navigation, route }) => {
  const params = route?.params || {};
  return <ReportScreenInner navigation={navigation} params={params} />;
};

export default ReportScreen;
