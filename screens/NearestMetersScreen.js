import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { UrlTile, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Polygon, Text as SvgText } from 'react-native-svg';
import { searchAccountOrMeter, fetchNearestMeters, getAvailableCustomers } from '../services/api';
import { ActivityIndicator } from 'react-native';

export default function NearestMetersScreen({ navigation, route }) {
  const { coordinates } = route.params || {};
  const mapRef = useRef(null);

  const [nearestMeters, setNearestMeters] = useState([]);
  const [selectedMeter, setSelectedMeter] = useState(null);
  const [loading, setLoading] = useState(true);

  // More accurate haversine distance calculation
  const toRad = (deg) => (deg * Math.PI) / 180;
  const haversine = (a, b) => {
    const R = 6371000; // Earth's radius in meters (more precise)
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    
    const sinDlat = Math.sin(dLat / 2);
    const sinDlon = Math.sin(dLon / 2);
    
    const a_calc = sinDlat * sinDlat + 
                   Math.cos(lat1) * Math.cos(lat2) * 
                   sinDlon * sinDlon;
    
    const c = 2 * Math.atan2(Math.sqrt(a_calc), Math.sqrt(1 - a_calc));
    
    return R * c; // Distance in meters with decimal precision
  };

  const TILE_SOURCES = [
    { name: 'OSM DE', url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' },
  ];
  
  // Hoisted fetch function so Retry can call it
  const fetchNearest = async () => {
    setLoading(true);
    try {
      console.log('🎯 Current user location:', coordinates);
      
      // Fetch available customers (includes partial downloads)
      console.log('📡 Loading customer data...');
      const allCustomers = await getAvailableCustomers();
      
      console.log(`✓ Loaded ${allCustomers.length} total customers`);
      
      if (!allCustomers || allCustomers.length === 0) {
        console.log('❌ No customers found in database');
        setNearestMeters([]);
        setLoading(false);
        Alert.alert(
          'No Data Available',
          'Please download customer data from Settings → Download Client Data to use this feature.',
          [
            { text: 'Go to Settings', onPress: () => navigation.navigate('Settings') },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
        return;
      }
      
      console.log('Sample customer:', allCustomers[0]);
      
      // Parse all customers and compute distance to current coordinates
      // Process in chunks to avoid stack overflow with large datasets
      console.log('📏 Computing distances...');
      const allMeters = [];
      const CHUNK_SIZE = 1000;
      
      for (let i = 0; i < allCustomers.length; i += CHUNK_SIZE) {
        const chunk = allCustomers.slice(i, i + CHUNK_SIZE);
        
        for (let j = 0; j < chunk.length; j++) {
          const it = chunk[j];
          const index = i + j;
          
          const lat = parseFloat(it.latitude || it.Latitude || it.lat || it.latValue || it.latitudeString);
          const lng = parseFloat(it.longitude || it.Longitude || it.lng || it.lon || it.long || it.longitudeString);
          
          // Skip meters without valid coordinates
          if (isNaN(lat) || isNaN(lng)) {
            continue;
          }
          
          // Keep full precision for accurate sorting
          const distance = haversine(coordinates, { latitude: lat, longitude: lng });
          
          // Generate unique ID by combining multiple fields with index as fallback
          const uniqueId = it.gid || 
                          (it.accountNumber ? `acc-${it.accountNumber}-${index}` : null) ||
                          (it.meterNumber ? `meter-${it.meterNumber}-${index}` : null) ||
                          it.id || 
                          it.MeterNo || 
                          it.meterNo || 
                          `customer-${index}`;
          
          allMeters.push({
            id: uniqueId, // Unique key for React lists
            meterId: it.accountNumber || it.meterNumber || it.id || it.MeterNo || it.meterNo || '',
            accountNumber: it.accountNumber || it.AccountNumber || it.accountNo || '',
            address: it.address || it.Address || it.fullAddress || '',
            latitude: lat,
            longitude: lng,
            distance,
            _raw: it,
          });
        }
        
        // Log progress every 50k records
        if ((i + CHUNK_SIZE) % 50000 === 0 || i + CHUNK_SIZE >= allCustomers.length) {
          console.log(`📏 Processed ${Math.min(i + CHUNK_SIZE, allCustomers.length)}/${allCustomers.length} customers...`);
        }
      }
      
      console.log(`✓ ${allMeters.length} customers have valid coordinates`);

      if (allMeters.length === 0) {
        console.log('❌ No meters with valid coordinates found');
        setNearestMeters([]);
        setLoading(false);
        return;
      }

      // Find the closest 3 unique meters efficiently
      console.log('🔍 Finding top 3 nearest unique meters...');
      const top3 = [];
      const seenAccounts = new Set(); // Track unique accounts
      
      for (const meter of allMeters) {
        // Skip if we've already seen this account/meter
        const accountKey = meter.meterId || meter.accountNumber || meter.id;
        if (seenAccounts.has(accountKey)) {
          continue;
        }
        
        if (top3.length < 3) {
          top3.push(meter);
          seenAccounts.add(accountKey);
          top3.sort((a, b) => a.distance - b.distance);
        } else if (meter.distance < top3[2].distance) {
          // Remove the furthest meter from the set
          const removedKey = top3[2].meterId || top3[2].accountNumber || top3[2].id;
          seenAccounts.delete(removedKey);
          
          // Add the new closer meter
          top3[2] = meter;
          seenAccounts.add(accountKey);
          top3.sort((a, b) => a.distance - b.distance);
        }
      }
      
      console.log('🏆 Top 3 nearest meters:');
      top3.forEach((m, i) => {
        console.log(`  ${i + 1}. Account: ${m.meterId}`);
        console.log(`     Address: ${m.address.trim()}`);
        console.log(`     Distance: ${m.distance.toFixed(2)}m`);
        console.log(`     Coords: ${m.latitude}, ${m.longitude}`);
      });
      
      setNearestMeters(top3);

      // Fit map to include the top results plus the user coordinate (if mapRef present)
      if (mapRef.current && top3.length > 0) {
        const allCoords = top3
          .map((m) => ({ latitude: m.latitude, longitude: m.longitude }))
          .filter(Boolean);
        allCoords.push(coordinates);

        setTimeout(() => {
          mapRef.current?.fitToCoordinates(allCoords, {
            edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
            animated: true,
          });
        }, 500);
      }
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
  }, [coordinates]);

  const handleMeterSelect = (meter) => {
    setSelectedMeter(meter);
    // Navigate directly to the LeakReportForm with the selected meter prefilled
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
      </MapView>

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
        )}
      </View>
    </View>
  );
}

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
