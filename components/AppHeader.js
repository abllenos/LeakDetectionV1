import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import { useDownloadStore, useOfflineStore } from '../stores/RootStore';
import { hasOfflineTiles } from '../services/offlineTileManager';

const AppHeader = observer(({ left, title, subtitle, right, showDownload = true }) => {
  const downloadStore = useDownloadStore();
  const offlineStore = useOfflineStore();
  const timeoutRef = useRef();
  const isFocused = useIsFocused?.() ?? true;
  const [offlineMapsAvailable, setOfflineMapsAvailable] = useState(false);

  // Check for offline maps
  useEffect(() => {
    const checkOfflineMaps = async () => {
      const hasOffline = await hasOfflineTiles();
      setOfflineMapsAvailable(hasOffline);
    };
    checkOfflineMaps();
  }, [isFocused]);

  // Poll download status while component is mounted/focused
  useEffect(() => {
    let mounted = true;
    const key = 'allCustomers_download_status';
    const readStatus = async () => {
      try {
        const s = await AsyncStorage.getItem(key);
        if (!mounted) return;
        if (s) {
          const obj = JSON.parse(s);
          downloadStore.setStatusBadge(obj);
        } else {
          downloadStore.setStatusBadge(null);
        }
      } catch (e) {
        // ignore
      }
    };

    readStatus();
    const iv = setInterval(() => { if (isFocused) readStatus(); }, 3000);
    return () => { mounted = false; clearInterval(iv); };
  }, [isFocused]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <>
      <SafeAreaView>
        <LinearGradient colors={["#1e5a8e", "#2d7ab8"]} style={styles.header}>
          <View style={styles.left}>{left || <View style={{ width: 44 }} />}</View>
          <View style={styles.center}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {offlineMapsAvailable && (
              <View style={styles.offlineIndicator}>
                <Ionicons name="map" size={10} color="#10b981" />
                <Text style={styles.offlineText}>Offline Maps Active</Text>
              </View>
            )}
            {downloadStore.statusMsg ? <Text style={styles.status}>{downloadStore.statusMsg}{downloadStore.progress != null ? ` (${downloadStore.progress}%)` : ''}</Text> : null}
          </View>
          <View style={styles.right}>
            {right || (
              <View style={{ width: 44 }} />
            )}
          </View>
        </LinearGradient>
      </SafeAreaView>

      {/* Offline Banner */}
      {!offlineStore.isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color="#fff" />
          <Text style={styles.offlineBannerText}>
            You are offline. {offlineStore.pendingCount > 0 ? `${offlineStore.pendingCount} report(s) queued` : 'Changes will be saved locally'}
          </Text>
        </View>
      )}

      {/* Syncing Banner */}
      {offlineStore.isSyncing && (
        <View style={styles.syncingBanner}>
          <Ionicons name="sync" size={16} color="#fff" />
          <Text style={styles.syncingBannerText}>
            Syncing {offlineStore.syncProgress}%...
          </Text>
        </View>
      )}
    </>
  );
});

export default AppHeader;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingTop: 48, // match Dashboard paddingTop
  },
  left: { width: 80 },
  center: { flex: 1, alignItems: 'flex-start' },
  right: { width: 60, alignItems: 'flex-end' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  offlineText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  status: { color: 'rgba(255,255,255,0.95)', fontSize: 12, marginTop: 4 },
  offlineBanner: {
    backgroundColor: '#ef4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  offlineBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  syncingBanner: {
    backgroundColor: '#3b82f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  syncingBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
