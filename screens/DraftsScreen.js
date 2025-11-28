import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { observer } from 'mobx-react-lite';
import { useDraftsStore } from '../stores/RootStore';
import { useFocusEffect } from '@react-navigation/native';

const DraftsScreen = observer(({ navigation }) => {
  const draftsStore = useDraftsStore();

  // Reload drafts when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      draftsStore.loadDrafts();
    }, [])
  );

  const handleOpenDraft = (draft) => {
    // Navigate to the leak report form with the draft data
    draftsStore.setCurrentDraftId(draft.id);
    
    // Navigate to Report stack with the draft
    navigation.navigate('Report', {
      screen: 'ReportMap',
      params: {
        fromDraft: true,
        draftId: draft.id,
        draftData: draft,
      },
    });
  };

  const handleDeleteDraft = (draft) => {
    Alert.alert(
      'Delete Draft',
      'Are you sure you want to delete this draft?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => draftsStore.deleteDraft(draft.id),
        },
      ]
    );
  };

  const handleClearAll = () => {
    if (draftsStore.drafts.length === 0) return;
    
    Alert.alert(
      'Clear All Drafts',
      `Are you sure you want to delete all ${draftsStore.drafts.length} drafts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => draftsStore.clearAllDrafts(),
        },
      ]
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getLeakTypeLabel = (type) => {
    const types = {
      '1': 'Service Connection',
      '2': 'Main Line',
      '3': 'Valve',
      '4': 'Fire Hydrant',
      '5': 'Others',
    };
    return types[type] || 'Unknown';
  };

  const renderDraftItem = ({ item }) => (
    <TouchableOpacity
      style={styles.draftCard}
      onPress={() => handleOpenDraft(item)}
      activeOpacity={0.7}
    >
      <View style={styles.draftHeader}>
        <View style={styles.draftIconWrap}>
          <Ionicons name="document-text" size={24} color="#3b82f6" />
        </View>
        <View style={styles.draftInfo}>
          <Text style={styles.draftTitle}>
            {item.meterData?.meterNumber || 'No Meter Selected'}
          </Text>
          <Text style={styles.draftSubtitle}>
            {getLeakTypeLabel(item.leakType) || 'Leak type not set'}
          </Text>
          <Text style={styles.draftDate}>
            {formatDate(item.updatedAt || item.createdAt)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDeleteDraft(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.draftDetails}>
        {item.meterData?.address && (
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={14} color="#64748b" />
            <Text style={styles.detailText} numberOfLines={1}>
              {item.meterData.address}
            </Text>
          </View>
        )}
        {item.location && (
          <View style={styles.detailRow}>
            <Ionicons name="map-outline" size={14} color="#64748b" />
            <Text style={styles.detailText} numberOfLines={1}>
              {item.location}
            </Text>
          </View>
        )}
        {item.autoSaved && (
          <View style={styles.autoSaveBadge}>
            <Ionicons name="save-outline" size={12} color="#f59e0b" />
            <Text style={styles.autoSaveText}>Auto-saved</Text>
          </View>
        )}
        {item.offlineSaved && (
          <View style={styles.offlineBadge}>
            <Ionicons name="cloud-offline-outline" size={12} color="#6366f1" />
            <Text style={styles.offlineText}>Saved offline</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="documents-outline" size={64} color="#cbd5e1" />
      <Text style={styles.emptyTitle}>No Drafts</Text>
      <Text style={styles.emptySubtitle}>
        Your incomplete leak reports will appear here.{'\n'}
        Drafts are auto-saved when you're offline or logged out.
      </Text>
    </View>
  );

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1e5a8e" translucent />
      <LinearGradient colors={["#1e5a8e", "#2d7ab8"]} style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Drafts Management</Text>
          <Text style={styles.subtitle}>
            {draftsStore.draftCount > 0 
              ? `${draftsStore.draftCount} saved draft${draftsStore.draftCount > 1 ? 's' : ''}`
              : 'No drafts saved'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {draftsStore.draftCount > 0 ? (
            <TouchableOpacity onPress={handleClearAll} style={styles.clearAllBtn}>
              <Ionicons name="trash-outline" size={22} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={styles.iconWrap}>
              <Ionicons name="documents" size={22} color="#fff" />
            </View>
          )}
        </View>
      </LinearGradient>
      
      {draftsStore.loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading drafts...</Text>
        </View>
      ) : (
        <FlatList
          data={draftsStore.drafts}
          renderItem={renderDraftItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            draftsStore.drafts.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
});

export default DraftsScreen;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    fontSize: 13,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAllBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },
  listContent: {
    padding: 16,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  draftCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  draftHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  draftIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  draftInfo: {
    flex: 1,
  },
  draftTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  draftSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  draftDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  deleteBtn: {
    padding: 8,
  },
  draftDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#64748b',
    marginLeft: 6,
    flex: 1,
  },
  autoSaveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  autoSaveText: {
    fontSize: 11,
    color: '#d97706',
    fontWeight: '600',
    marginLeft: 4,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  offlineText: {
    fontSize: 11,
    color: '#4f46e5',
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
