import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AppHeader from '../components/AppHeader';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState, useRef } from 'react';
import { Modal, FlatList, ActivityIndicator } from 'react-native';
import { fetchNotifications, markAllRead, clearNotifications } from '../services/notifications';
import { startPeriodicDataCheck, stopPeriodicDataCheck } from '../services/dataChecker';
import { fetchLeakReports } from '../services/interceptor';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DashboardScreen({ navigation }) {
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dataCheckIntervalRef = useRef(null);
  
  // Leak reports state
  const [leakReportsData, setLeakReportsData] = useState(null);
  const [loadingReports, setLoadingReports] = useState(true);
  const [userData, setUserData] = useState({ name: 'User', avatar: 'U' });

  const loadNotifs = async () => {
    const list = await fetchNotifications();
    setNotifications(list);
    setUnreadCount(list.filter((n) => !n.read).length);
  };

  const handleNotificationClick = async (notification) => {
    console.log('Notification clicked:', notification);
    
    try {
      // Mark this notification as read
      const STORAGE_KEY = 'app_notifications';
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      
      const updatedList = list.map(n => 
        n.id === notification.id ? { ...n, read: true } : n
      );
      
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
      
      // Update local state
      setNotifications(updatedList);
      setUnreadCount(updatedList.filter((n) => !n.read).length);
      
      // Handle different notification types
      if (notification.type === 'data_update') {
        // Close modal and navigate to Settings screen
        setNotifModalVisible(false);
        navigation.navigate('Settings');
      }
    } catch (error) {
      console.error('Failed to handle notification click:', error);
    }
  };

  useEffect(() => {
    loadNotifs();
    
    // Start periodic data checking (every 1 hour)
    dataCheckIntervalRef.current = startPeriodicDataCheck();

    const unsubscribe = navigation.addListener('focus', () => {
      loadNotifs();
    });
    
    return () => {
      unsubscribe();
      // Stop periodic checking when component unmounts
      stopPeriodicDataCheck(dataCheckIntervalRef.current);
    };
  }, []);

  // Load user data and leak reports
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load user data
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const user = JSON.parse(userDataStr);
          console.log('👤 User data loaded:', user); // Debug log
          
          // Build full name from API fields: fName, mName, lName
          const firstName = user.fName || user.firstName || '';
          const middleName = user.mName || user.middleName || '';
          const lastName = user.lName || user.lastName || '';
          
          // Combine names (with middle initial if available)
          let userName = firstName;
          if (middleName) {
            userName += ' ' + middleName[0] + '.';
          }
          if (lastName) {
            userName += ' ' + lastName;
          }
          
          // Fallback to username or 'User' if no name found
          if (!userName.trim()) {
            userName = user.username || user.empId || 'User';
          }
          
          setUserData({
            name: userName.trim(),
            avatar: firstName ? firstName[0].toUpperCase() : 'U',
            empId: user.empId || user.employeeId || user.id || user.userId
          });
          
          console.log('✅ Dashboard user set:', { name: userName, empId: user.empId || user.employeeId || user.id });
          
          // Load leak reports with empId
          setLoadingReports(true);
          const empId = user.empId || user.employeeId || user.id || user.userId;
          const reportsData = await fetchLeakReports(empId);
          console.log('📊 Dashboard received reports data:', {
            totalReports: (reportsData?.reports || []).length,
            totalCount: reportsData?.totalCount,
            dispatchedCount: reportsData?.dispatchedCount,
            firstReportRefNo: reportsData?.reports?.[0]?.refNo
          });
          setLeakReportsData(reportsData);
        } else {
          console.warn('⚠️ No user data found in storage');
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoadingReports(false);
      }
    };
    
    loadData();
    
    // Reload when screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    
    return unsubscribe;
  }, []);

  const statsData = [
    {
      id: 1,
      iconName: 'water-drop',
      iconFamily: 'MaterialIcons',
      title: 'Total Reports',
      subtitle: 'All leak reports',
      count: leakReportsData?.totalCount || 0,
      color: '#2196F3',
      borderColor: '#2196F3',
    },
    {
      id: 3,
      iconName: 'checkmark-circle',
      iconFamily: 'Ionicons',
      title: 'Repaired',
      subtitle: 'Completed fixes',
      count: leakReportsData?.repairedCount || 0,
      color: '#9C27B0',
      borderColor: '#9C27B0',
    },
    {
      id: 4,
      iconName: 'camera',
      iconFamily: 'Ionicons',
      title: 'After Meter',
      subtitle: 'Post-meter leaks',
      count: leakReportsData?.afterCount || 0,
      color: '#FF9800',
      borderColor: '#FF9800',
    },
    {
      id: 5,
      iconName: 'alert-circle',
      iconFamily: 'Ionicons',
      title: 'Not Found',
      subtitle: 'Unlocated leaks',
      count: leakReportsData?.notFoundCount || 0,
      color: '#F44336',
      borderColor: '#F44336',
    },
  ];

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
  const recentActivity = (leakReportsData?.reports || [])
    .slice(0, 5)
    .map((report, index) => ({
      id: report.id || index,
      title: `${report.refNo || 'N/A'}`,
      location: report.reportedLocation || 'Unknown location',
      time: getTimeAgo(report.dtReported),
      iconName: getLeakTypeIcon(report.dispatchStat),
      iconFamily: 'Ionicons',
      iconBg: getLeakTypeColor(report.dispatchStat),
      meterNumber: report.referenceMtr,
      dispatchStatus: report.dispatchStat
    }));

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
            <Text style={styles.avatarText}>{userData.avatar}</Text>
          </LinearGradient>
          <View>
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.userName}>{userData.name}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.notificationButton} onPress={() => { setNotifModalVisible(true); }}>
          <Ionicons name="notifications-outline" size={24} color="#fff" />
          {unreadCount > 0 ? (
            <View style={[styles.notificationBadge, { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unreadCount}</Text>
            </View>
          ) : (
            <View style={styles.notificationBadge} />
          )}
        </TouchableOpacity>
      </LinearGradient>

      {/* Notifications Modal */}
      <Modal visible={notifModalVisible} animationType="slide" transparent onRequestClose={() => setNotifModalVisible(false)}>
        <View style={styles.notifModalOverlay}>
          <View style={styles.notifModalContainer}>
            {/* Header */}
            <View style={styles.notifModalHeader}>
              <View style={styles.notifHeaderLeft}>
                <View style={styles.notifIconCircle}>
                  <Ionicons name="notifications" size={22} color="#1e5a8e" />
                </View>
                <View>
                  <Text style={styles.notifModalTitle}>Notifications</Text>
                  <Text style={styles.notifModalSubtitle}>
                    {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setNotifModalVisible(false)} style={styles.notifCloseBtn}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            {notifications.length > 0 && (
              <View style={styles.notifActions}>
                <TouchableOpacity 
                  onPress={async () => { await markAllRead(); await loadNotifs(); setUnreadCount(0); }}
                  style={styles.notifActionBtn}
                >
                  <Ionicons name="checkmark-done" size={16} color="#1e5a8e" />
                  <Text style={styles.notifActionText}>Mark all read</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={async () => { await clearNotifications(); await loadNotifs(); setUnreadCount(0); }}
                  style={[styles.notifActionBtn, { marginLeft: 8 }]}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  <Text style={[styles.notifActionText, { color: '#ef4444' }]}>Clear all</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Notifications List */}
            <FlatList
              data={notifications}
              keyExtractor={(i) => String(i.id)}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.notifItem, !item.read && styles.notifItemUnread]}
                  onPress={() => handleNotificationClick(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.notifItemHeader}>
                    {!item.read && <View style={styles.notifUnreadDot} />}
                    <Text style={[styles.notifItemTitle, !item.read && styles.notifItemTitleUnread]}>
                      {item.title}
                    </Text>
                  </View>
                  {item.message ? (
                    <Text style={styles.notifItemBody}>{item.message}</Text>
                  ) : item.body ? (
                    <Text style={styles.notifItemBody}>{item.body}</Text>
                  ) : null}
                  {item.data && item.data.difference && (
                    <View style={styles.notifDataBadge}>
                      <Ionicons name="cloud-download-outline" size={14} color="#1e5a8e" />
                      <Text style={styles.notifDataText}>
                        {item.data.difference.toLocaleString()} new records
                      </Text>
                    </View>
                  )}
                  <View style={styles.notifItemFooter}>
                    <Ionicons name="time-outline" size={12} color="#94a3b8" />
                    <Text style={styles.notifItemTime}>
                      {new Date(item.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </Text>
                    {item.type === 'data_update' && (
                      <View style={styles.notifActionIndicator}>
                        <Ionicons name="chevron-forward" size={14} color="#64748b" />
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.notifEmptyState}>
                  <Ionicons name="notifications-off-outline" size={48} color="#cbd5e1" />
                  <Text style={styles.notifEmptyTitle}>No notifications</Text>
                  <Text style={styles.notifEmptySubtitle}>You're all caught up!</Text>
                </View>
              }
              contentContainerStyle={notifications.length === 0 ? { flex: 1 } : null}
            />
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Loading indicator */}
        {loadingReports && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#1e5a8e" />
            <Text style={{ color: '#6b7280', marginTop: 8 }}>Loading reports...</Text>
          </View>
        )}
        
        {/* Quick Stats Summary */}
        {!loadingReports && (
          <>
            <View style={styles.quickStats}>
              <View style={styles.quickStatItem}>
                <Text style={styles.quickStatValue}>{leakReportsData?.totalCount || 0}</Text>
                <Text style={styles.quickStatLabel}>Total</Text>
              </View>
              <View style={styles.quickStatDivider} />
              <View style={styles.quickStatItem}>
                <Text style={[styles.quickStatValue, { color: '#9C27B0' }]}>
                  {leakReportsData?.repairedCount || 0}
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
          <TouchableOpacity onPress={async () => {
            setLoadingReports(true);
            const reportsData = await fetchLeakReports(userData?.empId);
            setLeakReportsData(reportsData);
            setLoadingReports(false);
          }}>
            <Text style={styles.refreshButton}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* Activity List */}
        <View style={styles.activityContainer}>
          {loadingReports ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#1e5a8e" />
            </View>
          ) : recentActivity.length > 0 ? (
            recentActivity.map((activity) => (
              <TouchableOpacity 
                key={activity.id} 
                style={styles.activityCard}
                activeOpacity={0.7}
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

      {/* Bottom navigation now provided by Tab Navigator */}
    </View>
  );
}

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
  welcomeText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
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
  
  // bottom navigation styles removed - handled by Tab Navigator
});
