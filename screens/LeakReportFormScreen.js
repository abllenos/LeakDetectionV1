import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { useLeakReportStore } from '../stores/RootStore';

const LeakReportFormScreenInner = observer(({ meterData, coordinates, fromNearest, navigation }) => {
  const form = useLeakReportStore();

  const pickLeakPhoto = async () => {
    if (form.leakPhotos.length >= 2) {
      Alert.alert('Limit reached', 'You can only upload 2 leak photos.');
      return;
    }
    
    // Show options to choose camera or gallery
    Alert.alert(
      'Add Photo',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            // Request camera permissions
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
          }
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            // Request gallery permissions
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission required', 'Gallery permissions are needed to choose photos.');
              return;
            }
            
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: false,
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              form.addLeakPhoto(result.assets[0].uri);
            }
          }
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  const removeLeakPhoto = (index) => {
    form.removeLeakPhoto(index);
  };

  const pickLandmarkPhoto = async () => {
    // Show options to choose camera or gallery
    Alert.alert(
      'Add Landmark Photo',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            // Request camera permissions
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
          }
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            // Request gallery permissions
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission required', 'Gallery permissions are needed to choose photos.');
              return;
            }
            
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: false,
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              form.setLandmarkPhoto(result.assets[0].uri);
            }
          }
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  const removeLandmarkPhoto = () => {
    form.clearLandmarkPhoto();
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
    form.submitting = true;
    try {
      // Build Geom field for backend (comma-separated string)
      const Geom = coordinates && coordinates.longitude && coordinates.latitude
        ? `${coordinates.longitude}, ${coordinates.latitude}`
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
  coordinates,
  geom: Geom,
      };
      await submitLeakReport(payload);
      form.submitting = false;
      Alert.alert('Report sent', 'Your leak report has been submitted successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
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
    form.reset();
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
          <Text style={styles.coordsText}>
            Coordinates: {coordinates?.latitude ? coordinates.latitude.toFixed(6) : 'N/A'}, {coordinates?.longitude ? coordinates.longitude.toFixed(6) : 'N/A'}
          </Text>
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
        <Text style={styles.sectionLabel}>Leak Type</Text>
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
        <Text style={styles.sectionLabel}>Location</Text>
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

        {/* Flag Project Leak */}
        <Text style={styles.sectionLabel}>Flag Project Leak</Text>
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
        <Text style={styles.sectionLabel}>Reported Landmark</Text>
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
          <Text style={styles.photoLabel}>Leak Photos (2 only)</Text>
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

        {/* Send Report Button */}
        <TouchableOpacity style={styles.sendBtn} onPress={handleSendReport} disabled={form.submitting}>
          {form.submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendBtnText}>Send Report</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

    </SafeAreaView>
  );
});

// Wrapper to extract route params before passing to observer component
const LeakReportFormScreen = ({ navigation, route }) => {
  const { meterData, coordinates, fromNearest } = route?.params || {};
  return (
    <LeakReportFormScreenInner 
      navigation={navigation} 
      meterData={meterData}
      coordinates={coordinates}
      fromNearest={fromNearest}
    />
  );
};

export default LeakReportFormScreen;


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#334155' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  infoCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoHeaderText: { fontSize: 14, fontWeight: '600', color: '#10b981' },
  infoRow: { flexDirection: 'row', marginBottom: 8, gap: 12 },
  infoLabel: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#111', fontWeight: '600' },
  coordsText: { fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 16 },

  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fb',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  instructionText: { fontSize: 13, color: '#1e5a8e', fontWeight: '500' },

  sectionLabel: { fontSize: 14, color: '#6b7280', marginBottom: 10, fontWeight: '500' },

  buttonGrid: { flexDirection: 'row', marginBottom: 10, gap: 10 },
  choiceBtn: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  choiceBtnActive: {
    backgroundColor: '#1e5a8e',
    borderColor: '#1e5a8e',
  },
  choiceBtnText: { color: '#334155', fontWeight: '600' },
  choiceBtnTextActive: { color: '#fff' },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  input: { flex: 1, fontSize: 15, color: '#111' },

  photoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fb',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  photoSectionText: { fontSize: 13, color: '#1e5a8e', fontWeight: '500' },

  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  photoLabel: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  photoCount: { fontSize: 13, color: '#9aa5b1' },

  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  photoBtn: {
    backgroundColor: '#fff',
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtnLabel: { fontSize: 18, color: '#1e5a8e', fontWeight: '600', marginTop: 4 },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
  },

  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  footerNoteText: { fontSize: 12, color: '#6b7280' },

  sendBtn: {
    backgroundColor: '#1e5a8e',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  radioGroup: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  radioGroupSmall: { flexDirection: 'row', gap: 20, marginBottom: 12 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#1e5a8e',
    backgroundColor: '#fff',
  },
  radioCircleActive: { backgroundColor: '#1e5a8e' },
  radioLabel: { marginLeft: 6, fontSize: 14, color: '#334155', fontWeight: '600' },
  radioList: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, marginBottom: 12 },
  radioListRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  radioListLabel: { marginLeft: 10, fontSize: 14, color: '#334155' },
  
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  collapseHeaderLeft: {
    flex: 1,
  },
  selectedValue: {
    fontSize: 13,
    color: '#1e5a8e',
    fontWeight: '600',
    marginTop: 4,
  },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, maxHeight: '80%' },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: '#1e3a5f' },
  dmaItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  dmaText: { fontSize: 14, color: '#334155' },
  modalCancel: { alignItems: 'center', paddingVertical: 12 },
  modalCancelText: { color: '#1e5a8e', fontWeight: '700' },
})
