import React from 'react';
import { 
  View, 
  Text, 
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
import { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';
import { startPeriodicDataCheck, stopPeriodicDataCheck } from '../services/dataChecker';
import { observer } from 'mobx-react-lite';
import { useDashboardStore, useOfflineStore } from '../stores/RootStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { preCacheCustomers, checkCustomerDataIntegrity, resumeCustomerDownload } from '../services/interceptor';
import styles from '../styles/DashboardStyles';

const DashboardScreen = observer(({ navigation }) => {
  const dashboardStore = useDashboardStore();
  const offlineStore = useOfflineStore();
  const dataCheckIntervalRef = useRef(null);

  useEffect(() => {
    console.log('[Dashboard] Component mounted, loading data...');
    
    const loadData = async () => {
      try {
        // Load user data and reports
        await dashboardStore.loadUserData();
        await dashboardStore.loadLeakReports();
        // Check customer data status for offline access
        await dashboardStore.checkCustomerDataStatus();
        dashboardStore.setInitialLoadComplete(true);
        console.log('[Dashboard] Initial data load complete');
        
        // Check for new customers after initial load
        checkForNewCustomers();
      } catch (error) {
        console.error('[Dashboard] Error loading initial data:', error);
        dashboardStore.setInitialLoadComplete(true); // Still mark as complete to prevent infinite loading
      }
    };
    
    loadData();
    
    // Start periodic data checking (every 1 hour)
    dataCheckIntervalRef.current = startPeriodicDataCheck();

    const unsubscribe = navigation.addListener('focus', () => {
      console.log('[Dashboard] Screen focused, refreshing data...');
      dashboardStore.loadUserData();
      dashboardStore.loadLeakReports();
      // Re-check customer data status
      dashboardStore.checkCustomerDataStatus();
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
      onPress: () => dashboardStore.setAllReportsModalVisible(true),
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
      // First check data integrity - if incomplete, prompt to continue download
      const integrityCheck = await checkCustomerDataIntegrity();
      console.log('[Dashboard] Customer data integrity check:', integrityCheck);
      
      if (!integrityCheck.complete && integrityCheck.missingChunks && integrityCheck.missingChunks.length > 0) {
        console.log(`[Dashboard] ⚠️ Customer data incomplete - ${integrityCheck.loadedRecords || 0} records downloaded`);
        // Show alert to inform user about incomplete data and offer to continue download
        Alert.alert(
          'Customer Data Incomplete',
          `Download was interrupted. ${integrityCheck.loadedRecords || 0} records downloaded so far. Would you like to continue downloading the remaining data?`,
          [
            { 
              text: 'Later', 
              style: 'cancel',
              onPress: () => console.log('[Dashboard] User chose to download later')
            },
            { 
              text: 'Continue Download', 
              onPress: () => {
                console.log('[Dashboard] Continuing download of customer data...');
                // Show download prompt which will trigger resume
                dashboardStore.setShowDownloadPrompt(true);
                dashboardStore.setResumeDownload(true);
              }
            }
          ]
        );
        return;
      }
      
      // Check if download was completed successfully
      const manifest = await AsyncStorage.getItem('allCustomers_manifest');
      const cachedCount = await AsyncStorage.getItem('allCustomers_count');
      
      if (manifest && cachedCount) {
        const manifestData = JSON.parse(manifest);
        // Only skip if download was completed successfully
        if (manifestData.status === 'complete') {
          console.log('[Dashboard] Customer data already downloaded:', cachedCount, 'records');
          return;
        }
      }

      console.log('[Dashboard] No complete customer download found - showing prompt');
      dashboardStore.setShowDownloadPrompt(true);
    } catch (error) {
      console.log('Error checking for new customers:', error);
    }
  };

  // Handle download customers (supports both fresh download and resume)
  const handleDownloadCustomers = async () => {
    try {
      dashboardStore.setIsDownloading(true);
      dashboardStore.setDownloadProgress(0);
      dashboardStore.setDownloadedRecords(0);

      // Check if we should resume an incomplete download
      if (dashboardStore.resumeDownload) {
        console.log('[Dashboard] Resuming incomplete download...');
        await resumeCustomerDownload((progress) => {
          const percentage = typeof progress === 'object' ? progress.percentage : progress;
          const current = typeof progress === 'object' ? progress.current : 0;
          dashboardStore.setDownloadProgress(percentage || 0);
          dashboardStore.setDownloadedRecords(current || 0);
        });
        dashboardStore.setResumeDownload(false); // Reset flag
      } else {
        // Fresh download
        await preCacheCustomers((progress) => {
          const percentage = typeof progress === 'object' ? progress.percentage : progress;
          const current = typeof progress === 'object' ? progress.current : 0;
          dashboardStore.setDownloadProgress(percentage || 0);
          dashboardStore.setDownloadedRecords(current || 0);
        });
      }

      dashboardStore.setDownloadComplete(true);
      dashboardStore.setIsDownloading(false);
      dashboardStore.setDownloadProgress(100);
      
      setTimeout(() => {
        dashboardStore.setShowDownloadPrompt(false);
        dashboardStore.setDownloadComplete(false);
        dashboardStore.setNewCustomersAvailable(false);
        dashboardStore.setResumeDownload(false);
        dashboardStore.setDownloadedRecords(0);
      }, 2000);
    } catch (error) {
      console.log('Error downloading customers:', error);
      Alert.alert('Download Failed', error.message || 'Failed to download customer data. Please try again.');
      dashboardStore.setIsDownloading(false);
      dashboardStore.setResumeDownload(false);
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

  // Transform all reports for the All Reports modal
  const allReportsData = dashboardStore.allReports.map((report, index) => ({
    id: report.id || index,
    title: `${report.refNo || 'N/A'}`,
    location: report.reportedLocation || 'Unknown location',
    time: getTimeAgo(report.dtReported),
    iconName: getLeakTypeIcon(report.dispatchStat),
    iconFamily: 'Ionicons',
    iconBg: getLeakTypeColor(report.dispatchStat),
    meterNumber: report.referenceMtr,
    dispatchStatus: report.dispatchStat,
    latitude: report.latitude || report.lat || report.Latitude || report.LAT,
    longitude: report.longitude || report.lng || report.Longitude || report.LNG,
    fullReport: report
  }));

  // Helper to get status text
  const getStatusText = (status) => {
    console.log('📊 getStatusText called with:', status, typeof status);
    switch (status) {
      case 0: return 'Pending';
      case 1: return 'Dispatched';
      case 2: return 'Repaired';
      case 3: return 'Closed';
      case 4: return 'Not Found';
      default: return 'Unknown';
    }
  };

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
        
        {/* Offline Mode Banner - Only shows when offline */}
        {!offlineStore.isOnline && (
          <View style={styles.offlineModeBanner}>
            <Ionicons name="cloud-offline" size={20} color="#dc2626" />
            <Text style={styles.offlineModeBannerText}>Offline Mode</Text>
            <Text style={styles.offlineModeBannerSubtext}>Using cached data</Text>
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
        <Text style={styles.sectionTitle}>Leak Detection Overview</Text>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          {statsData.map((stat) => (
            <TouchableOpacity 
              key={stat.id} 
              style={[styles.statCard, { borderLeftColor: stat.borderColor }]}
              activeOpacity={0.7}
              onPress={stat.onPress}
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
                  dashboardStore.setSelectedActivity(activity);
                  dashboardStore.setDetailsModalVisible(true);
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
        visible={dashboardStore.showDownloadPrompt}
        onRequestClose={() => !dashboardStore.isDownloading && dashboardStore.setShowDownloadPrompt(false)}
      >
        <View style={styles.downloadModalOverlay}>
          <View style={styles.downloadModalContainer}>
            {/* Modal Header */}
            <View style={styles.downloadModalHeader}>
              <View style={styles.downloadIconContainer}>
                <Ionicons 
                  name={dashboardStore.downloadComplete ? "checkmark-circle" : "cloud-download"} 
                  size={48} 
                  color={dashboardStore.downloadComplete ? "#4CAF50" : "#1e5a8e"} 
                />
              </View>
              <Text style={styles.downloadModalTitle}>
                {dashboardStore.downloadComplete ? "Download Complete!" : "New Customer Data Available"}
              </Text>
              <Text style={styles.downloadModalSubtitle}>
                {dashboardStore.downloadComplete 
                  ? "Customer data has been updated successfully"
                  : "Updated customer data is available for download"}
              </Text>
            </View>

            {/* Progress Bar */}
            {dashboardStore.isDownloading && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${dashboardStore.downloadProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {dashboardStore.downloadedRecords > 0 
                    ? `${dashboardStore.downloadedRecords.toLocaleString()} records`
                    : 'Starting...'}
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            {!dashboardStore.downloadComplete && (
              <View style={styles.downloadModalButtons}>
                <TouchableOpacity
                  style={[styles.downloadModalButton, styles.downloadCancelButton]}
                  onPress={() => dashboardStore.setShowDownloadPrompt(false)}
                  disabled={dashboardStore.isDownloading}
                >
                  <Text style={styles.downloadCancelButtonText}>
                    {dashboardStore.isDownloading ? "Downloading..." : "Later"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.downloadModalButton, styles.downloadConfirmButton]}
                  onPress={handleDownloadCustomers}
                  disabled={dashboardStore.isDownloading}
                >
                  {dashboardStore.isDownloading ? (
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
        visible={dashboardStore.detailsModalVisible}
        onRequestClose={() => dashboardStore.setDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailsModalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Details</Text>
              <TouchableOpacity onPress={() => dashboardStore.setDetailsModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            {dashboardStore.selectedActivity && (
              <ScrollView style={styles.modalContent}>
                {/* Reference Number */}
                <View style={styles.detailRow}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="document-text" size={20} color="#1e5a8e" />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Reference Number</Text>
                    <Text style={styles.detailValue}>{dashboardStore.selectedActivity.title}</Text>
                  </View>
                </View>

                {/* Location */}
                <View style={styles.detailRow}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="location" size={20} color="#1e5a8e" />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Location</Text>
                    <Text style={styles.detailValue}>{dashboardStore.selectedActivity.location}</Text>
                  </View>
                </View>

                {/* Meter Number */}
                {dashboardStore.selectedActivity.meterNumber && (
                  <View style={styles.detailRow}>
                    <View style={styles.detailIconContainer}>
                      <Ionicons name="speedometer" size={20} color="#1e5a8e" />
                    </View>
                    <View style={styles.detailTextContainer}>
                      <Text style={styles.detailLabel}>Meter Number</Text>
                      <Text style={styles.detailValue}>{dashboardStore.selectedActivity.meterNumber}</Text>
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
                    <Text style={styles.detailValue}>{dashboardStore.selectedActivity.time}</Text>
                  </View>
                </View>

                {/* Status */}
                <View style={styles.detailRow}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name={dashboardStore.selectedActivity.iconName} size={20} color={dashboardStore.selectedActivity.iconBg} />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <View style={[styles.statusBadge, { backgroundColor: dashboardStore.selectedActivity.iconBg + '20' }]}>
                      <Text style={[styles.statusBadgeText, { color: dashboardStore.selectedActivity.iconBg }]}>
                        {dashboardStore.selectedActivity.dispatchStatus === 0 ? 'Pending' :
                         dashboardStore.selectedActivity.dispatchStatus === 1 ? 'Dispatched' :
                         dashboardStore.selectedActivity.dispatchStatus === 2 ? 'Repaired' :
                         dashboardStore.selectedActivity.dispatchStatus === 3 ? 'Closed' :
                         dashboardStore.selectedActivity.dispatchStatus === 4 ? 'Not Found' : 'Unknown'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalActionButton}
                onPress={() => {
                  dashboardStore.setDetailsModalVisible(false);
                  
                  // Check if we have direct coordinates
                  if (dashboardStore.selectedActivity.latitude && dashboardStore.selectedActivity.longitude) {
                    navigation.navigate('Report', { 
                      screen: 'ReportMap',
                      params: { 
                        refNo: dashboardStore.selectedActivity.title,
                        latitude: dashboardStore.selectedActivity.latitude,
                        longitude: dashboardStore.selectedActivity.longitude,
                        location: dashboardStore.selectedActivity.location,
                        meterNumber: dashboardStore.selectedActivity.meterNumber
                      }
                    });
                  } 
                  // Try to get coordinates from meter number if available
                  else if (dashboardStore.selectedActivity.meterNumber) {
                    Alert.alert(
                      'Searching Location',
                      'Looking up meter coordinates...',
                      [{ text: 'OK' }]
                    );
                    
                    // Navigate to Report tab with meter number to search
                    navigation.navigate('Report', { 
                      screen: 'ReportMap',
                      params: { 
                        meterNumber: dashboardStore.selectedActivity.meterNumber,
                        refNo: dashboardStore.selectedActivity.title
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
                onPress={() => dashboardStore.setDetailsModalVisible(false)}
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

      {/* All Reports Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={dashboardStore.allReportsModalVisible}
        onRequestClose={() => dashboardStore.setAllReportsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.allReportsModalContainer}>
            {/* Modal Header */}
            <View style={styles.allReportsHeader}>
              <View style={styles.allReportsHeaderLeft}>
                <View style={styles.allReportsIconContainer}>
                  <Ionicons name="document-text" size={24} color="#2196F3" />
                </View>
                <View>
                  <Text style={styles.allReportsTitle}>All Leak Reports</Text>
                  <Text style={styles.allReportsSubtitle}>{dashboardStore.totalReports} total reports</Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.allReportsCloseBtn}
                onPress={() => dashboardStore.setAllReportsModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Reports List */}
            <ScrollView 
              style={styles.allReportsList}
              showsVerticalScrollIndicator={false}
            >
              {allReportsData.length > 0 ? (
                allReportsData.map((report) => (
                  <TouchableOpacity 
                    key={report.id} 
                    style={styles.allReportsItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      dashboardStore.setAllReportsModalVisible(false);
                      dashboardStore.setSelectedActivity(report);
                      dashboardStore.setDetailsModalVisible(true);
                    }}
                  >
                    <View style={[styles.allReportsItemIcon, { backgroundColor: report.iconBg + '20' }]}>
                      {renderIcon(report.iconFamily, report.iconName, 20, report.iconBg)}
                    </View>
                    <View style={styles.allReportsItemContent}>
                      <View style={styles.allReportsItemHeader}>
                        <Text style={styles.allReportsItemTitle}>{report.title}</Text>
                        <View style={[styles.allReportsStatusBadge, { backgroundColor: report.iconBg + '20' }]}>
                          <Text style={[styles.allReportsStatusText, { color: report.iconBg }]}>
                            {getStatusText(report.dispatchStatus)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.allReportsItemLocation} numberOfLines={1}>
                        {report.location}
                      </Text>
                      {report.meterNumber && (
                        <Text style={styles.allReportsItemMeter}>Meter: {report.meterNumber}</Text>
                      )}
                      <Text style={styles.allReportsItemTime}>{report.time}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.allReportsEmpty}>
                  <Ionicons name="clipboard-outline" size={48} color="#cbd5e1" />
                  <Text style={styles.allReportsEmptyTitle}>No Reports Found</Text>
                  <Text style={styles.allReportsEmptyText}>Your leak reports will appear here</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bottom navigation now provided by Tab Navigator */}
    </View>
  );
});

export default DashboardScreen;
