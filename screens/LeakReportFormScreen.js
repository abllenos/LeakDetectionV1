import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { pushNotification } from '../services/notifications';
import { submitLeakReport } from '../services/interceptor';
import { observer } from 'mobx-react-lite';
import { useLeakReportStore, useDraftsStore, useOfflineStore } from '../stores/RootStore';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { saveCurrentFormData, clearCurrentFormData, saveToDrafts, setFormActive } from '../services/draftService';
import styles from '../styles/LeakReportFormStyles';

const LeakReportFormScreenInner = observer(({ meterData: initialMeterData, coordinates: initialCoordinates, fromNearest, navigation, route }) => {
  const form = useLeakReportStore();
  const draftsStore = useDraftsStore();
  const offlineStore = useOfflineStore();
  const [showPreview, setShowPreview] = React.useState(false);
  const isFocused = useIsFocused();
  
  // Store meter data and coordinates in local state to persist across navigations
  const [meterData, setMeterData] = React.useState(initialMeterData);
  const [coordinates, setCoordinates] = React.useState(initialCoordinates);
  
  // Track if we've processed the leak location params
  const processedTimestampRef = React.useRef(null);
  
  // Auto-save interval ref
  const autoSaveIntervalRef = useRef(null);
  
  // Track if loading from draft
  const [loadingFromDraft, setLoadingFromDraft] = React.useState(false);
  const [currentDraftId, setCurrentDraftId] = React.useState(null);
  
  // Mark form as active when screen is focused, inactive when leaving
  useEffect(() => {
    // Mark form as active when entering
    setFormActive(true);
    console.log('[LeakReportForm] Form screen entered - marked as ACTIVE');
    
    return () => {
      // Mark form as inactive when leaving (but NOT if going to map for location)
      // The cleanup will run when unmounting
      console.log('[LeakReportForm] Form screen cleanup');
    };
  }, []);
  
  // Handle navigation away - clear active flag only on real leave (not map selection)
  useFocusEffect(
    React.useCallback(() => {
      // Screen focused
      setFormActive(true);
      
      return () => {
        // Screen unfocused - check if navigating to map for location selection
        const currentRoute = navigation.getState?.()?.routes?.slice(-1)[0]?.name;
        if (currentRoute !== 'LeakLocationSelection') {
          // Not going to location selection, so we're really leaving
          // Don't clear active flag here - let it be cleared only on submit/discard
        }
      };
    }, [navigation])
  );
  
  // Initialize meter data from props on mount
  useEffect(() => {
    if (initialMeterData) {
      setMeterData(initialMeterData);
    }
    if (initialCoordinates) {
      setCoordinates(initialCoordinates);
    }
  }, []);

  // Load draft data if coming from drafts screen
  useEffect(() => {
    const params = route?.params || {};
    if (params.fromDraft && params.draftData) {
      setLoadingFromDraft(true);
      setCurrentDraftId(params.draftId);
      
      const draft = params.draftData;
      console.log('[LeakReportForm] Loading from draft:', draft.id);
      
      // Restore meter data and coordinates
      if (draft.meterData) setMeterData(draft.meterData);
      if (draft.coordinates) setCoordinates(draft.coordinates);
      
      // Restore form fields
      if (draft.leakType) form.setLeakType(draft.leakType);
      if (draft.location) form.setLocation(draft.location);
      if (draft.contactName) form.setContactName(draft.contactName);
      if (draft.contactNumber) form.setContactNumber(draft.contactNumber);
      if (draft.landmark) form.setLandmark(draft.landmark);
      if (draft.pressure) form.setPressure(draft.pressure);
      if (draft.covering) form.setCovering(draft.covering);
      if (draft.causeOfLeak) form.setCauseOfLeak(draft.causeOfLeak);
      if (draft.causeOther) form.setCauseOther(draft.causeOther);
      if (draft.dma) form.setDma(draft.dma);
      if (draft.flagProjectLeak !== null) form.setFlagProjectLeak(draft.flagProjectLeak);
      if (draft.featuredId) form.setFeaturedId(draft.featuredId);
      
      // Restore photos
      if (draft.leakPhotos && draft.leakPhotos.length > 0) {
        draft.leakPhotos.forEach(uri => form.addLeakPhoto(uri));
      }
      if (draft.landmarkPhoto) form.setLandmarkPhoto(draft.landmarkPhoto);
      
      // Restore leak location
      if (draft.leakLatitude && draft.leakLongitude) {
        form.setLeakLocation(draft.leakLatitude, draft.leakLongitude, draft.leakLocationMethod);
      }
      
      setLoadingFromDraft(false);
    }
  }, [route?.params?.fromDraft]);

  // Auto-save form data every 30 seconds
  useEffect(() => {
    const saveFormForRecovery = () => {
      const formData = {
        meterData,
        coordinates,
        leakType: form.leakType,
        location: form.location,
        contactName: form.contactName,
        contactNumber: form.contactNumber,
        landmark: form.landmark,
        leakPhotos: form.leakPhotos,
        landmarkPhoto: form.landmarkPhoto,
        pressure: form.pressure,
        covering: form.covering,
        causeOfLeak: form.causeOfLeak,
        causeOther: form.causeOther,
        dma: form.dma,
        flagProjectLeak: form.flagProjectLeak,
        featuredId: form.featuredId,
        leakLatitude: form.leakLatitude,
        leakLongitude: form.leakLongitude,
        leakLocationMethod: form.leakLocationMethod,
      };
      
      // Only save if there's meaningful data
      if (meterData || form.leakType || form.location || form.leakPhotos.length > 0) {
        saveCurrentFormData(formData);
      }
    };
    
    // Save immediately when form changes
    saveFormForRecovery();
    
    // Set up periodic auto-save
    autoSaveIntervalRef.current = setInterval(saveFormForRecovery, 30000);
    
    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [
    meterData, coordinates, form.leakType, form.location, form.contactName,
    form.contactNumber, form.landmark, form.leakPhotos, form.landmarkPhoto,
    form.pressure, form.covering, form.causeOfLeak, form.causeOther,
    form.dma, form.flagProjectLeak, form.featuredId, form.leakLatitude,
    form.leakLongitude, form.leakLocationMethod
  ]);

  // Handle incoming leak location from map - MUST run before reset
  // Using useLayoutEffect to ensure it runs synchronously before other effects
  React.useLayoutEffect(() => {
    const params = route?.params || {};
    const timestamp = params._timestamp;
    
    console.log('📍 LeakReportForm LAYOUT EFFECT - checking params');
    console.log('📍 params:', JSON.stringify(params));
    console.log('📍 processedTimestampRef:', processedTimestampRef.current, 'current timestamp:', timestamp);
    
    if (params.fromLeakLocationSelection && params.leakLocation && timestamp && timestamp !== processedTimestampRef.current) {
      console.log('📍 ✅ Processing leak location selection return in LAYOUT EFFECT!');
      processedTimestampRef.current = timestamp;
      
      // Set the leak location IMMEDIATELY
      const lat = params.leakLocation.latitude;
      const lng = params.leakLocation.longitude;
      console.log('📍 ✅ Setting leak location:', lat, lng);
      form.setLeakLocation(lat, lng, 'dragPin');
      
      // Restore meter data if passed back
      if (params.meterData) {
        console.log('📍 Restoring meter data:', params.meterData);
        setMeterData(params.meterData);
      }
      if (params.coordinates) {
        console.log('📍 Restoring coordinates:', params.coordinates);
        setCoordinates(params.coordinates);
      }
    }
  }, [route?.params]);

  const pickLeakPhoto = async () => {
    if (form.leakPhotos.length >= 2) {
      Alert.alert('Limit reached', 'You can only upload 2 leak photos.');
      return;
    }
    
    // Request camera permissions and take photo
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera permissions are needed to take photos.');
      return;
    }
    
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      form.addLeakPhoto(result.assets[0].uri);
    }
  };

  const removeLeakPhoto = (index) => {
    form.removeLeakPhoto(index);
  };

  const pickLandmarkPhoto = async () => {
    // Request camera permissions and take photo
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera permissions are needed to take photos.');
      return;
    }
    
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      form.setLandmarkPhoto(result.assets[0].uri);
    }
  };

  const removeLandmarkPhoto = () => {
    form.clearLandmarkPhoto();
  };

  // Save current form as draft
  const handleSaveDraft = async () => {
    const formData = {
      meterData,
      coordinates,
      leakType: form.leakType,
      location: form.location,
      contactName: form.contactName,
      contactNumber: form.contactNumber,
      landmark: form.landmark,
      leakPhotos: form.leakPhotos,
      landmarkPhoto: form.landmarkPhoto,
      pressure: form.pressure,
      covering: form.covering,
      causeOfLeak: form.causeOfLeak,
      causeOther: form.causeOther,
      dma: form.dma,
      flagProjectLeak: form.flagProjectLeak,
      featuredId: form.featuredId,
      leakLatitude: form.leakLatitude,
      leakLongitude: form.leakLongitude,
      leakLocationMethod: form.leakLocationMethod,
    };
    
    try {
      if (currentDraftId) {
        // Update existing draft
        await draftsStore.updateDraft(currentDraftId, formData);
      } else {
        // Save as new draft
        const draftId = await draftsStore.saveDraft(formData);
        setCurrentDraftId(draftId);
      }
      
      // Clear current form data since it's now in drafts
      await clearCurrentFormData();
      
      Alert.alert('Saved', 'Report saved as draft.', [
        { text: 'Continue Editing' },
        { 
          text: 'Go to Drafts', 
          onPress: () => {
            setFormActive(false); // Clear active flag when leaving
            form.reset();
            navigation.navigate('MainTabs', { screen: 'Drafts' });
          }
        },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save draft.');
      console.error('[LeakReportForm] Error saving draft:', error);
    }
  };

  const handleSendReport = async () => {
    // Basic validation
    if (!form.leakType) {
      Alert.alert('Missing info', 'Please select a leak type.');
      return;
    }
    if (!form.location) {
      Alert.alert('Missing info', 'Please select a location (Surface/Non-Surface).');
      return;
    }
    if (!form.covering) {
      Alert.alert('Missing info', 'Please select the covering.');
      return;
    }
    if (!form.causeOfLeak) {
      Alert.alert('Missing info', 'Please select the cause of leak.');
      return;
    }
    if (form.causeOfLeak === 'Others' && !form.causeOther.trim()) {
      Alert.alert('Missing info', 'Please describe the cause of leak.');
      return;
    }
    if (!form.contactName) {
      Alert.alert('Missing info', 'Please provide contact person.');
      return;
    }
    
    // Show preview modal instead of sending directly
    setShowPreview(true);
  };

  const confirmSendReport = async () => {
    setShowPreview(false);
    form.submitting = true;
    
    // Check if offline - save as draft instead
    if (!offlineStore.isOnline) {
      try {
        const formData = {
          meterData,
          coordinates,
          leakType: form.leakType,
          location: form.location,
          contactName: form.contactName,
          contactNumber: form.contactNumber,
          landmark: form.landmark,
          leakPhotos: form.leakPhotos,
          landmarkPhoto: form.landmarkPhoto,
          pressure: form.pressure,
          covering: form.covering,
          causeOfLeak: form.causeOfLeak,
          causeOther: form.causeOther,
          dma: form.dma,
          flagProjectLeak: form.flagProjectLeak,
          featuredId: form.featuredId,
          leakLatitude: form.leakLatitude,
          leakLongitude: form.leakLongitude,
          leakLocationMethod: form.leakLocationMethod,
        };
        
        await saveToDrafts(formData, { offlineSaved: true });
        await clearCurrentFormData();
        await setFormActive(false); // Clear active flag on offline save
        
        // Delete the draft if we were editing one
        if (currentDraftId) {
          await draftsStore.deleteDraft(currentDraftId);
        }
        
        form.submitting = false;
        Alert.alert(
          'Saved Offline', 
          'You are offline. Your report has been saved to drafts and will need to be submitted when you are back online.',
          [{ text: 'OK', onPress: () => {
            form.reset();
            navigation.navigate('MainTabs', { screen: 'Drafts' });
          }}]
        );
        return;
      } catch (error) {
        form.submitting = false;
        Alert.alert('Error', 'Failed to save report offline.');
        return;
      }
    }
    
    try {
      // Use leak location if set, otherwise use meter coordinates
      const leakCoords = form.leakLatitude && form.leakLongitude
        ? { latitude: form.leakLatitude, longitude: form.leakLongitude }
        : coordinates;
      
      // Build Geom field for backend (comma-separated string) - this is the LEAK location
      const Geom = leakCoords && leakCoords.longitude && leakCoords.latitude
        ? `${leakCoords.longitude}, ${leakCoords.latitude}`
        : null;
      // Build payload for backend
      const payload = {
  leakType: form.leakType,
  location: form.location,
  covering: form.covering,
  causeOfLeak: form.causeOfLeak,
  causeOther: form.causeOther,
  dma: form.dma,
  contactName: form.contactName,
  contactNumber: form.contactNumber,
  landmark: form.landmark,
  leakPhotos: form.leakPhotos,
  landmarkPhoto: form.landmarkPhoto,
  pressure: form.pressure,
  flagProjectLeak: form.flagProjectLeak,
  featuredId: form.featuredId,
  meterData,
  coordinates: leakCoords, // This is the actual leak location (or meter location if not set)
  meterCoordinates: coordinates, // Original meter coordinates for reference
  geom: Geom,
  leakLocationMethod: form.leakLocationMethod, // 'current', 'dragPin', or null
      };
      await submitLeakReport(payload);
      
      // Clear current form data and delete draft if editing
      await clearCurrentFormData();
      await setFormActive(false); // Clear active flag on successful submit
      if (currentDraftId) {
        await draftsStore.deleteDraft(currentDraftId);
      }
      
      form.submitting = false;
      Alert.alert('Report sent', 'Your leak report has been submitted successfully.', [
        { text: 'OK', onPress: () => {
          form.reset();
          navigation.goBack();
        }},
      ]);
      try {
        pushNotification({
          title: 'Report submitted',
          body: `Leak report for meter ${meterData?.meterNumber || 'N/A'} submitted.`,
        });
      } catch (err) {
        console.warn('Failed to push notification:', err);
      }
      console.log('Report:', payload);
    } catch (err) {
      form.submitting = false;
      Alert.alert('Submission failed', err.message || 'Failed to submit report');
    }
  };

  // Load DMA options from server on mount
  useEffect(() => {
    // Don't reset if we're returning from leak location selection
    const params = route?.params || {};
    if (!params.fromLeakLocationSelection) {
      form.reset();
    }
    form.loadDmaOptions();
    return () => {};
  }, []);

  // Auto-populate contact name and number with logged-in user's data
  useEffect(() => {
    form.autofillContactFromUser();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            // If came from nearest meters flow, navigate to ReportMap
            if (fromNearest) {
              navigation.navigate('ReportMap');
            } else {
              navigation.goBack();
            }
          }} 
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={24} color="#334155" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Leak Report Form</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Selected Meter Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="checkmark-circle" size={18} color="#10b981" />
            <Text style={styles.infoHeaderText}>  Selected Meter</Text>
          </View>
          <View style={styles.infoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Meter Number</Text>
              <Text style={styles.infoValue}>{meterData?.meterNumber || ''}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoValue}>{meterData?.address || ''}</Text>
            </View>
          </View>
        </View>

        {/* Leak Location Section */}
        <View style={styles.leakLocationCard}>
          <View style={styles.leakLocationHeader}>
            <Ionicons name="pin" size={18} color="#dc2626" />
            <Text style={styles.leakLocationTitle}>  Leak Location</Text>
          </View>
          
          {form.leakLatitude && form.leakLongitude ? (
            <View style={styles.leakLocationSet}>
              <Text style={styles.leakMethodText}>
                {form.leakLocationMethod === 'current' ? '📍 Using current GPS location' : '🗺️ Selected on map'}
              </Text>
              <TouchableOpacity 
                style={styles.clearLeakLocationBtn}
                onPress={() => form.clearLeakLocation()}
              >
                <Ionicons name="close-circle" size={16} color="#dc2626" />
                <Text style={styles.clearLeakLocationText}>Clear & use meter location</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.leakLocationOptions}>
              <Text style={styles.leakLocationHint}>
                Where is the actual leak? (If different from meter location)
              </Text>
              <View style={styles.leakLocationButtons}>
                <TouchableOpacity
                  style={styles.leakLocationBtn}
                  onPress={async () => {
                    try {
                      const { status } = await require('expo-location').requestForegroundPermissionsAsync();
                      if (status !== 'granted') {
                        Alert.alert('Permission denied', 'Location permission is required');
                        return;
                      }
                      const location = await require('expo-location').getCurrentPositionAsync({
                        accuracy: require('expo-location').Accuracy.BestForNavigation
                      });
                      form.setLeakLocation(location.coords.latitude, location.coords.longitude, 'current');
                    } catch (err) {
                      Alert.alert('Error', 'Could not get current location');
                    }
                  }}
                >
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={styles.leakLocationBtnText}>Use Current Location</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.leakLocationBtn, styles.leakLocationBtnSecondary]}
                  onPress={() => {
                    navigation.navigate('ReportMap', { 
                      selectLeakLocation: true,
                      meterCoordinates: coordinates,
                      meterData: meterData,
                    });
                  }}
                >
                  <Ionicons name="map" size={18} color="#1e5a8e" />
                  <Text style={[styles.leakLocationBtnText, { color: '#1e5a8e' }]}>Drag Pin on Map</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.leakLocationNote}>
                💡 Skip this if the leak is at the meter location
              </Text>
            </View>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.instructionRow}>
          <Ionicons name="information-circle" size={18} color="#1e5a8e" />
          <Text style={styles.instructionText}>  Please provide details about the leak</Text>
        </View>

        {/* Pressure */}
        <Text style={styles.sectionLabel}>PRESSURE <Text style={{ color: '#ef4444' }}>*</Text></Text>
        <View style={styles.radioGroupSmall}>
          <TouchableOpacity style={styles.radioRow} onPress={() => form.setPressure('Low')}>
            <View style={[styles.radioCircle, form.pressure === 'Low' && styles.radioCircleActive]} />
            <Text style={styles.radioLabel}>LOW</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioRow} onPress={() => form.setPressure('High')}>
            <View style={[styles.radioCircle, form.pressure === 'High' && styles.radioCircleActive]} />
            <Text style={styles.radioLabel}>HIGH</Text>
          </TouchableOpacity>
        </View>

        {/* Leak Type */}
        <Text style={styles.sectionLabel}>Leak Type <Text style={{ color: '#ef4444' }}>*</Text></Text>
        <View style={styles.buttonGrid}>
          <TouchableOpacity
            style={[styles.choiceBtn, form.leakType === 'Unidentified' && styles.choiceBtnActive]}
            onPress={() => form.setLeakType('Unidentified')}
          >
            <Text style={[styles.choiceBtnText, form.leakType === 'Unidentified' && styles.choiceBtnTextActive]}>Unidentified</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.choiceBtn, form.leakType === 'Serviceline' && styles.choiceBtnActive]}
            onPress={() => form.setLeakType('Serviceline')}
          >
            <Text style={[styles.choiceBtnText, form.leakType === 'Serviceline' && styles.choiceBtnTextActive]}>Serviceline</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.buttonGrid}>
          <TouchableOpacity
            style={[styles.choiceBtn, form.leakType === 'Mainline' && styles.choiceBtnActive]}
            onPress={() => form.setLeakType('Mainline')}
          >
            <Text style={[styles.choiceBtnText, form.leakType === 'Mainline' && styles.choiceBtnTextActive]}>Mainline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.choiceBtn, form.leakType === 'Others' && styles.choiceBtnActive]}
            onPress={() => form.setLeakType('Others')}
          >
            <Text style={[styles.choiceBtnText, form.leakType === 'Others' && styles.choiceBtnTextActive]}>Others</Text>
          </TouchableOpacity>
        </View>

        {/* Location */}
        <Text style={styles.sectionLabel}>Location <Text style={{ color: '#ef4444' }}>*</Text></Text>
        <View style={styles.buttonGrid}>
          <TouchableOpacity
            style={[styles.choiceBtn, form.location === 'Surface' && styles.choiceBtnActive]}
            onPress={() => form.setLocation('Surface')}
          >
            <Text style={[styles.choiceBtnText, form.location === 'Surface' && styles.choiceBtnTextActive]}>Surface</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.choiceBtn, form.location === 'Non-Surface' && styles.choiceBtnActive]}
            onPress={() => form.setLocation('Non-Surface')}
          >
            <Text style={[styles.choiceBtnText, form.location === 'Non-Surface' && styles.choiceBtnTextActive]}>Non-Surface</Text>
          </TouchableOpacity>
        </View>

        {/* Covering */}
        <TouchableOpacity 
          style={styles.collapseHeader} 
          onPress={() => form.setCoveringExpanded(!form.coveringExpanded)}
          activeOpacity={0.7}
        >
          <View style={styles.collapseHeaderLeft}>
            <Text style={styles.sectionLabel}>COVERING <Text style={{ color: '#ef4444' }}>*</Text></Text>
            {form.covering && !form.coveringExpanded && (
              <Text style={styles.selectedValue}>{form.covering}</Text>
            )}
          </View>
          <Ionicons 
            name={form.coveringExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#6b7280" 
          />
        </TouchableOpacity>
        
        {form.coveringExpanded && (
          <View style={styles.radioList}>
            <TouchableOpacity style={styles.radioListRow} onPress={() => { form.setCovering('Concrete'); form.setCoveringExpanded(false); }}>
              <View style={[styles.radioCircle, form.covering === 'Concrete' && styles.radioCircleActive]} />
              <Text style={styles.radioListLabel}>CONCRETE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.radioListRow} onPress={() => { form.setCovering('Gravel'); form.setCoveringExpanded(false); }}>
              <View style={[styles.radioCircle, form.covering === 'Gravel' && styles.radioCircleActive]} />
              <Text style={styles.radioListLabel}>GRAVEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.radioListRow} onPress={() => { form.setCovering('Soil'); form.setCoveringExpanded(false); }}>
              <View style={[styles.radioCircle, form.covering === 'Soil' && styles.radioCircleActive]} />
              <Text style={styles.radioListLabel}>SOIL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.radioListRow} onPress={() => { form.setCovering('Asphalt'); form.setCoveringExpanded(false); }}>
              <View style={[styles.radioCircle, form.covering === 'Asphalt' && styles.radioCircleActive]} />
              <Text style={styles.radioListLabel}>ASPHALT</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cause of Leak */}
        <TouchableOpacity 
          style={styles.collapseHeader} 
          onPress={() => form.setCauseExpanded(!form.causeExpanded)}
          activeOpacity={0.7}
        >
          <View style={styles.collapseHeaderLeft}>
            <Text style={styles.sectionLabel}>CAUSE OF LEAK <Text style={{ color: '#ef4444' }}>*</Text></Text>
            {form.causeOfLeak && !form.causeExpanded && (
              <Text style={styles.selectedValue}>{form.causeOfLeak === 'Others' ? form.causeOther || 'Others' : form.causeOfLeak}</Text>
            )}
          </View>
          <Ionicons 
            name={form.causeExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#6b7280" 
          />
        </TouchableOpacity>
        
        {form.causeExpanded && (
          <>
            <View style={styles.radioList}>
              <TouchableOpacity style={styles.radioListRow} onPress={() => { form.setCauseOfLeak('Exposed - PE'); form.setCauseExpanded(false); }}>
                <View style={[styles.radioCircle, form.causeOfLeak === 'Exposed - PE' && styles.radioCircleActive]} />
                <Text style={styles.radioListLabel}>Exposed - PE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.radioListRow} onPress={() => { form.setCauseOfLeak('Exposed - Supplement'); form.setCauseExpanded(false); }}>
                <View style={[styles.radioCircle, form.causeOfLeak === 'Exposed - Supplement' && styles.radioCircleActive]} />
                <Text style={styles.radioListLabel}>Exposed - Supplement</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.radioListRow} onPress={() => { form.setCauseOfLeak('Defective Stopcock'); form.setCauseExpanded(false); }}>
                <View style={[styles.radioCircle, form.causeOfLeak === 'Defective Stopcock' && styles.radioCircleActive]} />
                <Text style={styles.radioListLabel}>Defective Stopcock</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.radioListRow} onPress={() => form.setCauseOfLeak('Others')}>
                <View style={[styles.radioCircle, form.causeOfLeak === 'Others' && styles.radioCircleActive]} />
                <Text style={styles.radioListLabel}>Others</Text>
              </TouchableOpacity>
            </View>

            {form.causeOfLeak === 'Others' && (
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Please describe"
                  placeholderTextColor="#9aa5b1"
                  value={form.causeOther}
                  onChangeText={form.setCauseOther}
                />
              </View>
            )}
          </>
        )}

        {/* Asterra */}
        <Text style={styles.sectionLabel}>Asterra <Text style={{ color: '#ef4444' }}>*</Text></Text>
        <View style={styles.buttonGrid}>
          <TouchableOpacity
            style={[styles.choiceBtn, form.flagProjectLeak === 0 && styles.choiceBtnActive]}
            onPress={() => form.setFlagProjectLeak(0)}
          >
            <Text style={[styles.choiceBtnText, form.flagProjectLeak === 0 && styles.choiceBtnTextActive]}>Not under POI</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.choiceBtn, form.flagProjectLeak === 1 && styles.choiceBtnActive]}
            onPress={() => form.setFlagProjectLeak(1)}
          >
            <Text style={[styles.choiceBtnText, form.flagProjectLeak === 1 && styles.choiceBtnTextActive]}>Under POI</Text>
          </TouchableOpacity>
        </View>

        {/* Featured ID (shown only when Under POI is selected) */}
        {form.flagProjectLeak === 1 && (
          <>
            <Text style={styles.sectionLabel}>Featured ID</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="bookmark-outline" size={18} color="#9aa5b1" style={{ marginRight: 10 }} />
              <TextInput
                style={styles.input}
                placeholder="Enter Featured ID"
                placeholderTextColor="#9aa5b1"
                value={form.featuredId}
                onChangeText={form.setFeaturedId}
              />
            </View>
          </>
        )}


        {/* Contact Person */}
        <Text style={styles.sectionLabel}>Contact Person</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="person-outline" size={18} color="#9aa5b1" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#9aa5b1"
            value={form.contactName}
            onChangeText={form.setContactName}
          />
        </View>

        {/* Reported Landmark */}
        <Text style={styles.sectionLabel}>Reported Landmark <Text style={{ color: '#ef4444' }}>*</Text></Text>
        <View style={styles.inputWrap}>
          <Ionicons name="location-outline" size={18} color="#9aa5b1" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.input}
            placeholder="Describe nearby landmark (e.g., store, church)"
            placeholderTextColor="#9aa5b1"
            value={form.landmark}
            onChangeText={form.setLandmark}
          />
        </View>

        {/* Leak Photos */}
        <View style={styles.photoSection}>
          <Ionicons name="camera" size={18} color="#1e5a8e" />
          <Text style={styles.photoSectionText}>  Add photos to help identify the leak</Text>
        </View>
        <View style={styles.photoHeader}>
          <Text style={styles.photoLabel}>Leak Photos (2 only) <Text style={{ color: '#ef4444' }}>*</Text></Text>
          <Text style={styles.photoCount}>{form.leakPhotos.length}/2</Text>
        </View>
        
        {/* Display leak photos */}
        <View style={styles.photoGrid}>
          {form.leakPhotos.map((uri, index) => (
            <View key={index} style={styles.photoPreview}>
              <Image source={{ uri }} style={styles.photoImage} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => removeLeakPhoto(index)}>
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))}
          {form.leakPhotos.length < 2 && (
            <TouchableOpacity style={styles.photoBtn} onPress={pickLeakPhoto}>
              <Ionicons name="camera" size={28} color="#1e5a8e" />
              <Text style={styles.photoBtnLabel}>+</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Landmark Photo */}
        <View style={styles.photoHeader}>
          <Text style={styles.photoLabel}>Landmark Photo</Text>
          <Text style={styles.photoCount}>{form.landmarkPhoto ? '1' : '0'}/1</Text>
        </View>
        
        {/* Display landmark photo */}
        <View style={styles.photoGrid}>
          {form.landmarkPhoto ? (
            <View style={styles.photoPreview}>
              <Image source={{ uri: form.landmarkPhoto }} style={styles.photoImage} />
              <TouchableOpacity style={styles.photoRemove} onPress={removeLandmarkPhoto}>
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.photoBtn} onPress={pickLandmarkPhoto}>
              <Ionicons name="camera" size={28} color="#1e5a8e" />
              <Text style={styles.photoBtnLabel}>+</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Footer note */}
        <View style={styles.footerNote}>
          <Ionicons name="arrow-forward" size={14} color="#6b7280" />
          <Text style={styles.footerNoteText}>  Report will be sent to our team</Text>
        </View>

        {/* Buttons Row */}
        <View style={styles.buttonRow}>
          {/* Save Draft Button */}
          <TouchableOpacity 
            style={styles.saveDraftBtn} 
            onPress={handleSaveDraft}
          >
            <Ionicons name="save-outline" size={20} color="#3b82f6" />
            <Text style={styles.saveDraftBtnText}>Save Draft</Text>
          </TouchableOpacity>
          
          {/* Send Report Button */}
          <TouchableOpacity 
            style={[styles.sendBtn, !offlineStore.isOnline && styles.sendBtnOffline]} 
            onPress={handleSendReport} 
            disabled={form.submitting}
          >
            {form.submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                {!offlineStore.isOnline && <Ionicons name="cloud-offline" size={18} color="#fff" style={{ marginRight: 6 }} />}
                <Text style={styles.sendBtnText}>{offlineStore.isOnline ? 'Send Report' : 'Save Offline'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Preview Modal */}
      <Modal visible={showPreview} animationType="slide" transparent onRequestClose={() => setShowPreview(false)}>
        <View style={styles.previewOverlay}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Ionicons name="document-text" size={24} color="#1e5a8e" />
              <Text style={styles.previewTitle}>Review Your Report</Text>
              <TouchableOpacity onPress={() => setShowPreview(false)} style={styles.previewCloseBtn}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.previewScroll} showsVerticalScrollIndicator={false}>
              {/* Meter Info */}
              <View style={styles.previewSection}>
                <Text style={styles.previewSectionTitle}>Meter Information</Text>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Meter Number:</Text>
                  <Text style={styles.previewValue}>{meterData?.meterNumber || 'N/A'}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Address:</Text>
                  <Text style={styles.previewValue}>{meterData?.address || 'N/A'}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Coordinates:</Text>
                  <Text style={styles.previewValue}>
                    {coordinates?.latitude?.toFixed(6) || 'N/A'}, {coordinates?.longitude?.toFixed(6) || 'N/A'}
                  </Text>
                </View>
              </View>

              {/* Leak Details */}
              <View style={styles.previewSection}>
                <Text style={styles.previewSectionTitle}>Leak Details</Text>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Pressure:</Text>
                  <Text style={styles.previewValue}>{form.pressure || 'N/A'}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Leak Type:</Text>
                  <Text style={styles.previewValue}>{form.leakType || 'N/A'}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Location:</Text>
                  <Text style={styles.previewValue}>{form.location || 'N/A'}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Covering:</Text>
                  <Text style={styles.previewValue}>{form.covering || 'N/A'}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Cause of Leak:</Text>
                  <Text style={styles.previewValue}>
                    {form.causeOfLeak === 'Others' ? form.causeOther : form.causeOfLeak || 'N/A'}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Asterra:</Text>
                  <Text style={styles.previewValue}>{form.flagProjectLeak === 1 ? 'Under POI' : 'Not under POI'}</Text>
                </View>
                {form.flagProjectLeak === 1 && form.featuredId && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Featured ID:</Text>
                    <Text style={styles.previewValue}>{form.featuredId}</Text>
                  </View>
                )}
              </View>

              {/* Contact Info */}
              <View style={styles.previewSection}>
                <Text style={styles.previewSectionTitle}>Contact Information</Text>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Contact Person:</Text>
                  <Text style={styles.previewValue}>{form.contactName || 'N/A'}</Text>
                </View>
                {form.landmark && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Landmark:</Text>
                    <Text style={styles.previewValue}>{form.landmark}</Text>
                  </View>
                )}
              </View>

              {/* Photos */}
              <View style={styles.previewSection}>
                <Text style={styles.previewSectionTitle}>Photos</Text>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Leak Photos:</Text>
                  <Text style={styles.previewValue}>{form.leakPhotos.length} attached</Text>
                </View>
                {form.leakPhotos.length > 0 && (
                  <View style={styles.previewPhotoRow}>
                    {form.leakPhotos.map((uri, idx) => (
                      <Image key={idx} source={{ uri }} style={styles.previewPhoto} />
                    ))}
                  </View>
                )}
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Landmark Photo:</Text>
                  <Text style={styles.previewValue}>{form.landmarkPhoto ? '1 attached' : 'None'}</Text>
                </View>
                {form.landmarkPhoto && (
                  <View style={styles.previewPhotoRow}>
                    <Image source={{ uri: form.landmarkPhoto }} style={styles.previewPhoto} />
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.previewActions}>
              <TouchableOpacity 
                style={styles.previewCancelBtn} 
                onPress={() => setShowPreview(false)}
              >
                <Text style={styles.previewCancelText}>Edit Report</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.previewConfirmBtn} 
                onPress={confirmSendReport}
                disabled={form.submitting}
              >
                {form.submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.previewConfirmText}>Confirm & Send</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
});

// Wrapper to extract route params before passing to observer component
const LeakReportFormScreen = ({ navigation, route }) => {
  const { meterData, coordinates, fromNearest } = route?.params || {};
  return (
    <LeakReportFormScreenInner 
      navigation={navigation} 
      route={route}
      meterData={meterData}
      coordinates={coordinates}
      fromNearest={fromNearest}
    />
  );
};

export default LeakReportFormScreen;
