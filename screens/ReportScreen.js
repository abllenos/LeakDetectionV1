import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, Modal, Alert, StatusBar, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { useReportMapStore } from '../stores/RootStore';
import LeafletMap from '../components/LeafletMap';
import { useFocusEffect } from '@react-navigation/native';

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
    return () => {};
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
              latitudeDelta: 0.01,
              longitudeDelta: 0.01
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
        const nextRegion = { latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
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
      const nextRegion = {
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      mapRef.current?.animateToRegion(nextRegion, 800);
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
    const meterData = normalized && (normalized.meterNumber || normalized.accountNumber)
      ? { meterNumber: normalized.meterNumber || '', accountNumber: normalized.accountNumber || '', address: normalized.address || '' }
      : { meterNumber: store.meterNumber || '', accountNumber: '', address: '' };

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
      <StatusBar barStyle="light-content" backgroundColor="#1e5a8e" translucent />
      
      {/* Header with Gradient */}
      <LinearGradient
        colors={['#1e5a8e', '#2d7ab8']}
        style={styles.header}
      >
        <TouchableOpacity 
          onPress={() => navigation.navigate('ReportHome')} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.headerTitle}>Report & Map</Text>
            <Text style={styles.headerSubtitle}>Search meter or pick location</Text>
          </View>
        </View>
      </LinearGradient>

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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0f4f8' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  headerSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
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
  // Leak location selection mode styles
  leakSelectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 8,
  },
  leakSelectionBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#991b1b',
    fontWeight: '500',
  },
  leakSelectionCancelBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  leakSelectionCancelText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
  },
  leakSelectionBtn: {
    backgroundColor: '#dc2626',
  },
  mapWrap: {
    marginTop: 12,
    marginHorizontal: 16,
    height: 400,
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

// Wrapper to extract route params before passing to observer component
const ReportScreen = ({ navigation, route }) => {
  const params = route?.params || {};
  return <ReportScreenInner navigation={navigation} params={params} />;
};

export default ReportScreen;
