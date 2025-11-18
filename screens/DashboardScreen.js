import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  StatusBar,
  Modal,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AppHeader from '../components/AppHeader';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator } from 'react-native';
import { startPeriodicDataCheck, stopPeriodicDataCheck } from '../services/dataChecker';
import { observer } from 'mobx-react-lite';
import { useDashboardStore } from '../stores/RootStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { preCacheCustomers, getAllCustomersCount } from '../services/interceptor';

const DashboardScreen = observer(({ navigation }) => {
  const dashboardStore = useDashboardStore();
  const dataCheckIntervalRef = useRef(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  
  // Customer download states
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [newCustomersAvailable, setNewCustomersAvailable] = useState(0);

  useEffect(() => {
    console.log('[Dashboard] Component mounted, loading data...');
    
    const loadData = async () => {
      try {
        // Load user data and reports
        await dashboardStore.loadUserData();
        await dashboardStore.loadLeakReports();
        setInitialLoadComplete(true);
        console.log('[Dashboard] Initial data load complete');
        
        // Check for new customers after initial load
        checkForNewCustomers();
      } catch (error) {
        console.error('[Dashboard] Error loading initial data:', error);
        setInitialLoadComplete(true); // Still mark as complete to prevent infinite loading
      }
    };
    
    loadData();
    
    // Start periodic data checking (every 1 hour)
    dataCheckIntervalRef.current = startPeriodicDataCheck();

    const unsubscribe = navigation.addListener('focus', () => {
      console.log('[Dashboard] Screen focused, refreshing data...');
      dashboardStore.loadUserData();
      dashboardStore.loadLeakReports();
      // Also check for new customers when screen is focused
      checkForNewCustomers();
    });
    
    return () => {
      unsubscribe();
      // Stop periodic checking when component unmounts
      stopPeriodicDataCheck(dataCheckIntervalRef.current);
      console.log('[Dashboard] Component unmounted');
    };
  }, []);

  const statsData = [
    {
      id: 1,
      iconName: 'water-drop',
      iconFamily: 'MaterialIcons',
      title: 'Total Reports',
      subtitle: 'All leak reports',
      count: dashboardStore.totalReports,
      color: '#2196F3',
      borderColor: '#2196F3',
    },
    {
      id: 3,
      iconName: 'checkmark-circle',
      iconFamily: 'Ionicons',
      title: 'Repaired',
      subtitle: 'Completed fixes',
      count: dashboardStore.repairedCount,
      color: '#9C27B0',
      borderColor: '#9C27B0',
    },
    {
      id: 4,
      iconName: 'camera',
      iconFamily: 'Ionicons',
      title: 'After Meter',
      subtitle: 'Post-meter leaks',
      count: dashboardStore.afterCount,
      color: '#FF9800',
      borderColor: '#FF9800',
    },
    {
      id: 5,
      iconName: 'alert-circle',
      iconFamily: 'Ionicons',
      title: 'Not Found',
      subtitle: 'Unlocated leaks',
      count: dashboardStore.notFoundCount,
      color: '#F44336',
      borderColor: '#F44336',
    },
  ];

  // Helper function to get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 18) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  };

  // Helper function to format time ago
  const getTimeAgo = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Check for new customers and prompt download
  const checkForNewCustomers = async () => {
    try {
      // Get cached customer count
      const cachedCount = await AsyncStorage.getItem('customerCount');
      const cachedCustomerCount = cachedCount ? parseInt(cachedCount, 10) : 0;

      // Get current API customer count
      const apiCount = await getAllCustomersCount();

      if (apiCount > cachedCustomerCount) {
        setNewCustomersAvailable(true);
        setShowDownloadPrompt(true);
      }
    } catch (error) {
      console.log('Error checking for new customers:', error);
    }
  };

  // Handle download customers
  const handleDownloadCustomers = async () => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      await preCacheCustomers((progress) => {
        setDownloadProgress(progress);
      });

      setDownloadComplete(true);
      setIsDownloading(false);
      
      setTimeout(() => {
        setShowDownloadPrompt(false);
        setDownloadComplete(false);
        setNewCustomersAvailable(false);
      }, 2000);
    } catch (error) {
      console.log('Error downloading customers:', error);
      Alert.alert('Download Failed', 'Failed to download customer data. Please try again.');
      setIsDownloading(false);
    }
  };

  // Helper function to get leak type color
  const getLeakTypeColor = (dispatchStat) => {
    switch (dispatchStat) {
      case 0: return '#2196F3'; // Reported
      case 1: return '#FF9800'; // Scheduled
      case 2: return '#4CAF50'; // Dispatched
      case 3: return '#9C27B0'; // Repaired
      case 4: return '#F44336'; // Not found
      default: return '#6b7280';
    }
  };

  // Helper function to get leak type icon
  const getLeakTypeIcon = (dispatchStat) => {
    switch (dispatchStat) {
      case 0: return 'alert-circle'; // Reported
      case 1: return 'time'; // Scheduled
      case 2: return 'send'; // Dispatched
      case 3: return 'checkmark-circle'; // Repaired
      case 4: return 'close-circle'; // Not found
      default: return 'water';
    }
  };

  // Transform API reports to recent activity format (show latest 5)
  const recentActivity = dashboardStore.recentReports.map((report, index) => {
    // Debug: Log report structure to find coordinate fields
    if (index === 0) {
      console.log('📍 Report structure:', Object.keys(report));
      console.log('📍 Full first report:', JSON.stringify(report, null, 2));
    }
    
    return {
      id: report.id || index,
      title: `${report.refNo || 'N/A'}`,
      location: report.reportedLocation || 'Unknown location',
      time: getTimeAgo(report.dtReported),
      iconName: getLeakTypeIcon(report.dispatchStat),
      iconFamily: 'Ionicons',
      iconBg: getLeakTypeColor(report.dispatchStat),
      meterNumber: report.referenceMtr,
      dispatchStatus: report.dispatchStat,
      // Try multiple possible coordinate field names
      latitude: report.latitude || report.lat || report.Latitude || report.LAT,
      longitude: report.longitude || report.lng || report.Longitude || report.LNG,
      // Store full report object for potential future use
      fullReport: report
    };
  });

  const renderIcon = (iconFamily, iconName, size, color) => {
    switch (iconFamily) {
      case 'Ionicons':
        return <Ionicons name={iconName} size={size} color={color} />;
      case 'MaterialIcons':
        return <MaterialIcons name={iconName} size={size} color={color} />;
      case 'MaterialCommunityIcons':
        return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
      default:
        return <Ionicons name={iconName} size={size} color={color} />;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1e5a8e" translucent />
      
      {/* Header with Gradient */}
      <LinearGradient
        colors={['#1e5a8e', '#2d7ab8']}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={['#fff', '#f0f9ff']}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{dashboardStore.userAvatar}</Text>
          </LinearGradient>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.userName}>{dashboardStore.userName}</Text>
          </View>
        </View>
        {/* Notification button removed - SMS feature planned for future */}
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Loading indicator */}
        {dashboardStore.loadingReports && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#1e5a8e" />
            <Text style={{ color: '#6b7280', marginTop: 8 }}>Loading reports...</Text>
          </View>
        )}
        
        {/* Quick Stats Summary */}
        {!dashboardStore.loadingReports && (
          <>
            <View style={styles.quickStats}>
              <View style={styles.quickStatItem}>
                <Text style={styles.quickStatValue}>{dashboardStore.totalReports}</Text>
                <Text style={styles.quickStatLabel}>Total</Text>
              </View>
              <View style={styles.quickStatDivider} />
              <View style={styles.quickStatItem}>
                <Text style={[styles.quickStatValue, { color: '#9C27B0' }]}>
                  {dashboardStore.repairedCount}
                </Text>
                <Text style={styles.quickStatLabel}>Repaired</Text>
              </View>
            </View>
          </>
        )}

        {/* Overview Section */}
        <Text style={styles.sectionTitle}>Leak Reports Overview</Text>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          {statsData.map((stat) => (
            <TouchableOpacity 
              key={stat.id} 
              style={[styles.statCard, { borderLeftColor: stat.borderColor }]}
              activeOpacity={0.7}
            >
              <View style={styles.statLeft}>
                <View style={[styles.statIconContainer, { backgroundColor: stat.color + '20' }]}>
                  {renderIcon(stat.iconFamily, stat.iconName, 24, stat.color)}
                </View>
                <View style={styles.statInfo}>
                  <Text style={styles.statTitle}>{stat.title}</Text>
                  <Text style={styles.statSubtitle}>{stat.subtitle}</Text>
                </View>
              </View>
              <Text style={[styles.statCount, { color: stat.color }]}>{stat.count}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Activity Section */}
        <View style={styles.activityHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity onPress={() => dashboardStore.loadLeakReports()}>
            <Text style={styles.refreshButton}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* Activity List */}
        <View style={styles.activityContainer}>
          {dashboardStore.loadingReports ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#1e5a8e" />
            </View>
          ) : recentActivity.length > 0 ? (
            recentActivity.map((activity) => (
              <TouchableOpacity 
                key={activity.id} 
                style={styles.activityCard}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedActivity(activity);
                  setDetailsModalVisible(true);
                }}
              >
                <View style={[styles.activityIconContainer, { backgroundColor: activity.iconBg + '20' }]}>
                  {renderIcon(activity.iconFamily, activity.iconName, 20, activity.iconBg)}
                </View>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityTitle}>{activity.title}</Text>
                  <Text style={styles.activityLocation}>{activity.location}</Text>
                  {activity.meterNumber && (
                    <Text style={styles.activityMeter}>Meter: {activity.meterNumber}</Text>
                  )}
                </View>
                <Text style={styles.activityTime}>{activity.time}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="clipboard-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyStateTitle}>No Recent Activity</Text>
              <Text style={styles.emptyStateText}>Your leak reports will appear here</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Customer Download Prompt Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showDownloadPrompt}
        onRequestClose={() => !isDownloading && setShowDownloadPrompt(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.downloadModalContainer}>
            {/* Modal Header */}
            <View style={styles.downloadModalHeader}>
              <View style={styles.downloadIconContainer}>
                <Ionicons 
                  name={downloadComplete ? "checkmark-circle" : "cloud-download"} 
                  size={48} 
                  color={downloadComplete ? "#4CAF50" : "#1e5a8e"} 
                />
              </View>
              <Text style={styles.downloadModalTitle}>
                {downloadComplete ? "Download Complete!" : "New Customer Data Available"}
              </Text>
              <Text style={styles.downloadModalSubtitle}>
                {downloadComplete 
                  ? "Customer data has been updated successfully"
                  : "Updated customer data is available for download"}
              </Text>
            </View>

            {/* Progress Bar */}
            {isDownloading && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${downloadProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>{Math.round(downloadProgress)}%</Text>
              </View>
            )}

            {/* Action Buttons */}
            {!downloadComplete && (
              <View style={styles.downloadModalButtons}>
                <TouchableOpacity
                  style={[styles.downloadModalButton, styles.downloadCancelButton]}
                  onPress={() => setShowDownloadPrompt(false)}
                  disabled={isDownloading}
                >
                  <Text style={styles.downloadCancelButtonText}>
                    {isDownloading ? "Downloading..." : "Later"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.downloadModalButton, styles.downloadConfirmButton]}
                  onPress={handleDownloadCustomers}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.downloadConfirmButtonText}>Download Now</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Report Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={detailsModalVisible}
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailsModalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Details</Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedActivity && (
              <ScrollView style={styles.modalContent}>
                {/* Reference Number */}
                <View style={styles.detailRow}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="document-text" size={20} color="#1e5a8e" />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Reference Number</Text>
                    <Text style={styles.detailValue}>{selectedActivity.title}</Text>
                  </View>
                </View>

                {/* Location */}
                <View style={styles.detailRow}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="location" size={20} color="#1e5a8e" />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Location</Text>
                    <Text style={styles.detailValue}>{selectedActivity.location}</Text>
                  </View>
                </View>

                {/* Meter Number */}
                {selectedActivity.meterNumber && (
                  <View style={styles.detailRow}>
                    <View style={styles.detailIconContainer}>
                      <Ionicons name="speedometer" size={20} color="#1e5a8e" />
                    </View>
                    <View style={styles.detailTextContainer}>
                      <Text style={styles.detailLabel}>Meter Number</Text>
                      <Text style={styles.detailValue}>{selectedActivity.meterNumber}</Text>
                    </View>
                  </View>
                )}

                {/* Time Reported */}
                <View style={styles.detailRow}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="time" size={20} color="#1e5a8e" />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Time Reported</Text>
                    <Text style={styles.detailValue}>{selectedActivity.time}</Text>
                  </View>
                </View>

                {/* Status */}
                <View style={styles.detailRow}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name={selectedActivity.iconName} size={20} color={selectedActivity.iconBg} />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Dispatch Status</Text>
                    <View style={[styles.statusBadge, { backgroundColor: selectedActivity.iconBg + '20' }]}>
                      <Text style={[styles.statusBadgeText, { color: selectedActivity.iconBg }]}>
                        {selectedActivity.dispatchStatus === 0 ? 'Pending' :
                         selectedActivity.dispatchStatus === 1 ? 'Dispatched' :
                         selectedActivity.dispatchStatus === 2 ? 'Repaired' :
                         selectedActivity.dispatchStatus === 3 ? 'Closed' :
                         selectedActivity.dispatchStatus === 4 ? 'Not Found' : 'Unknown'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalActionButton}
                onPress={() => {
                  setDetailsModalVisible(false);
                  
                  // Check if we have direct coordinates
                  if (selectedActivity.latitude && selectedActivity.longitude) {
                    navigation.navigate('Report', { 
                      screen: 'ReportMap',
                      params: { 
                        refNo: selectedActivity.title,
                        latitude: selectedActivity.latitude,
                        longitude: selectedActivity.longitude,
                        location: selectedActivity.location,
                        meterNumber: selectedActivity.meterNumber
                      }
                    });
                  } 
                  // Try to get coordinates from meter number if available
                  else if (selectedActivity.meterNumber) {
                    Alert.alert(
                      'Searching Location',
                      'Looking up meter coordinates...',
                      [{ text: 'OK' }]
                    );
                    
                    // Navigate to Report tab with meter number to search
                    navigation.navigate('Report', { 
                      screen: 'ReportMap',
                      params: { 
                        meterNumber: selectedActivity.meterNumber,
                        refNo: selectedActivity.title
                      }
                    });
                  } 
                  else {
                    Alert.alert(
                      'Location Unavailable',
                      'GPS coordinates and meter information are not available for this report.',
                      [{ text: 'OK' }]
                    );
                  }
                }}
              >
                <Ionicons name="map" size={20} color="#fff" />
                <Text style={styles.modalActionText}>View on Map</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalActionButton, { backgroundColor: '#64748b' }]}
                onPress={() => setDetailsModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#fff" />
                <Text style={styles.modalActionText}>Close</Text>
              </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Bottom navigation now provided by Tab Navigator */}
    </View>
  );
});

export default DashboardScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e5a8e',
  },
  greeting: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 0.3,
    textTransform: 'capitalize',
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginTop: 2,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF5252',
    borderWidth: 2,
    borderColor: '#1e5a8e',
  },
  content: {
    flex: 1,
  },
  quickStats: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  quickStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e5a8e',
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    fontWeight: '500',
  },
  quickStatDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 8,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1e3a5f',
    marginBottom: 14,
    marginHorizontal: 20,
  },
  statsContainer: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  statCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 16,
    marginBottom: 14,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  statLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  statInfo: {
    flex: 1,
  },
  statTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e3a5f',
    marginBottom: 3,
  },
  statSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  statCount: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    marginHorizontal: 20,
  },
  refreshButton: {
    fontSize: 14,
    color: '#1e5a8e',
    fontWeight: '700',
  },
  activityContainer: {
    marginBottom: 80,
    paddingHorizontal: 16,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  activityIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e3a5f',
    marginBottom: 3,
  },
  activityLocation: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  activityMeter: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500',
  },
  activityTime: {
    fontSize: 12,
    color: '#9aa5b1',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  
  // Notification Modal Styles
  notifModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notifModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    maxHeight: '80%',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  notifModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  notifHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  notifIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e6f0fb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notifModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  notifModalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  notifCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  notifActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  notifActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e5a8e',
    marginLeft: 6,
  },
  notifItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  notifItemUnread: {
    backgroundColor: '#f8fafc',
  },
  notifItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  notifUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginRight: 8,
  },
  notifItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  notifItemTitleUnread: {
    fontWeight: '700',
    color: '#0f172a',
  },
  notifItemBody: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 8,
  },
  notifDataBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  notifDataText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e5a8e',
    marginLeft: 4,
  },
  notifItemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notifItemTime: {
    fontSize: 12,
    color: '#94a3b8',
    marginLeft: 4,
    flex: 1,
  },
  notifActionIndicator: {
    marginLeft: 'auto',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
  },
  notifEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  notifEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginTop: 16,
  },
  notifEmptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  detailsModalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalContent: {
    padding: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  detailIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e6f0fb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  modalActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e5a8e',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  modalActionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  // Download Modal Styles
  downloadModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  downloadModalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  downloadIconContainer: {
    marginBottom: 16,
  },
  downloadModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 8,
  },
  downloadModalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1e5a8e',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '600',
  },
  downloadModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  downloadModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadCancelButton: {
    backgroundColor: '#f1f5f9',
  },
  downloadCancelButtonText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '600',
  },
  downloadConfirmButton: {
    backgroundColor: '#1e5a8e',
  },
  downloadConfirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  
  // bottom navigation styles removed - handled by Tab Navigator
});
