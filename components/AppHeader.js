import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { preCacheCustomers } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';

export default function AppHeader({ left, title, subtitle, right, showDownload = true }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const timeoutRef = useRef();
  const [statusBadge, setStatusBadge] = useState(null);
  const isFocused = useIsFocused?.() ?? true;

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
          setStatusBadge(obj);
        } else {
          setStatusBadge(null);
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

  const startDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setProgress(0);
    setStatusMsg('Starting client download...');

    try {
      // Read preset from storage and map to opts (fallback to fast)
      let preset = 'fast';
      try {
        const p = await AsyncStorage.getItem('download_preset');
        if (p) preset = p;
      } catch (e) {
        // ignore
      }

      const mapPreset = (pr) => {
        switch (pr) {
          case 'safe': return { pageSize: 500, concurrency: 2 };
          case 'normal': return { pageSize: 1000, concurrency: 4 };
          case 'fast':
          default:
            return { pageSize: 2000, concurrency: 6 };
        }
      };

      const opts = mapPreset(preset);

      await preCacheCustomers((p) => {
        if (typeof p === 'number') {
          setProgress(Math.round(p));
        } else if (p && typeof p === 'object') {
          if (p.percent != null) setProgress(Math.round(p.percent));
          else if (p.done != null && p.total != null) setProgress(Math.round((p.done / p.total) * 100));
        }
      }, opts);

      setStatusMsg('Client data ready');
      setProgress(100);
      timeoutRef.current = setTimeout(() => setStatusMsg(''), 3000);
    } catch (err) {
      console.warn('Background download failed', err);
      setStatusMsg('Client download failed');
      timeoutRef.current = setTimeout(() => setStatusMsg(''), 4000);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SafeAreaView>
      <LinearGradient colors={["#1e5a8e", "#2d7ab8"]} style={styles.header}>
        <View style={styles.left}>{left || <View style={{ width: 44 }} />}</View>
        <View style={styles.center}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {statusMsg ? <Text style={styles.status}>{statusMsg}{progress != null ? ` (${progress}%)` : ''}</Text> : null}
        </View>
        <View style={styles.right}>
          {right || (
            showDownload ? (
              <TouchableOpacity onPress={startDownload} style={{ padding: 6, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name={downloading ? 'download' : 'download-outline'} size={22} color="#fff" />
                {statusBadge && typeof statusBadge.percent === 'number' ? (
                  <View style={{ marginLeft: 6, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{statusBadge.percent}%</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : (
              <View style={{ width: 44 }} />
            )
          )}
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

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
  status: { color: 'rgba(255,255,255,0.95)', fontSize: 12, marginTop: 4 },
});
