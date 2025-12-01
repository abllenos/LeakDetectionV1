import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { useReportMapStore } from '../stores/RootStore';
import LeafletMap from '../components/LeafletMap';
import styles from '../styles/ReportHomeStyles';

// Component wrapped with observer - navigation/route props extracted to prevent MobX observation
const ReportHomeScreenInner = observer(({ navigation, params }) => {
  const store = useReportMapStore();
  const [scrollEnabled, setScrollEnabled] = useState(true);

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

      <ScrollView 
        style={styles.scrollView} 
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

        <View 
          style={styles.mapWrap}
          onTouchStart={() => setScrollEnabled(false)}
          onTouchEnd={() => setScrollEnabled(true)}
          onTouchCancel={() => setScrollEnabled(true)}
        >
          <LeafletMap
            latitude={store.region.latitude}
            longitude={store.region.longitude}
            zoom={17}
            markers={[]}
            userLocation={{ latitude: store.userGpsLocation?.latitude || store.region.latitude, longitude: store.userGpsLocation?.longitude || store.region.longitude }}
            showUserLocation={true}
            style={styles.map}
          />
        </View>

        <View style={styles.optionsSection}>
          <Text style={styles.sectionTitle}>Start Leak Detection </Text>
          <Text style={styles.sectionSubtitle}>Leak Detected?, Report then Repair</Text>

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
              <Text style={styles.optionTitle}>Report Leak Detected</Text>
              <Text style={styles.optionDescription}>
                Find the 3 closest meters to your location and select one
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
