import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFTS_KEY = 'leak_report_drafts';
const CURRENT_FORM_KEY = 'current_leak_form_data';
const FORM_ACTIVE_KEY = 'leak_form_active'; // Track if user is actively in form

/**
 * Mark form as active (user is in LeakReportFormScreen)
 */
export const setFormActive = async (isActive) => {
  try {
    if (isActive) {
      await AsyncStorage.setItem(FORM_ACTIVE_KEY, 'true');
      console.log('[DraftService] Form marked as ACTIVE');
    } else {
      await AsyncStorage.removeItem(FORM_ACTIVE_KEY);
      console.log('[DraftService] Form marked as INACTIVE');
    }
  } catch (error) {
    console.error('[DraftService] Error setting form active state:', error);
  }
};

/**
 * Check if form is currently active
 */
export const isFormActive = async () => {
  try {
    const active = await AsyncStorage.getItem(FORM_ACTIVE_KEY);
    return active === 'true';
  } catch (error) {
    return false;
  }
};

/**
 * Save current form data for auto-recovery
 * Called periodically while user is filling the form
 */
export const saveCurrentFormData = async (formData) => {
  try {
    // Only save if form is marked as active
    const active = await isFormActive();
    if (!active) {
      console.log('[DraftService] Form not active, skipping auto-save');
      return;
    }
    
    await AsyncStorage.setItem(CURRENT_FORM_KEY, JSON.stringify({
      ...formData,
      savedAt: new Date().toISOString(),
    }));
    console.log('[DraftService] Current form data auto-saved');
  } catch (error) {
    console.error('[DraftService] Error saving current form:', error);
  }
};

/**
 * Get current form data (for recovery after crash/logout)
 */
export const getCurrentFormData = async () => {
  try {
    const data = await AsyncStorage.getItem(CURRENT_FORM_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('[DraftService] Error getting current form:', error);
    return null;
  }
};

/**
 * Clear current form data (after successful submit or manual clear)
 */
export const clearCurrentFormData = async () => {
  try {
    await AsyncStorage.removeItem(CURRENT_FORM_KEY);
    console.log('[DraftService] Current form data cleared');
  } catch (error) {
    console.error('[DraftService] Error clearing current form:', error);
  }
};

/**
 * Save form data as a draft (when offline or auto-logout)
 */
export const saveToDrafts = async (formData, options = {}) => {
  try {
    const { autoSaved = false, offlineSaved = false } = options;
    
    // Get existing drafts
    const existingDrafts = await AsyncStorage.getItem(DRAFTS_KEY);
    const drafts = existingDrafts ? JSON.parse(existingDrafts) : [];
    
    // Create new draft
    const draft = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      autoSaved,
      offlineSaved,
      ...formData,
    };
    
    // Add to beginning of array
    drafts.unshift(draft);
    
    // Save back
    await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    
    // Clear current form data since it's now in drafts
    await clearCurrentFormData();
    
    console.log(`[DraftService] Draft saved with id: ${draft.id}, autoSaved: ${autoSaved}, offlineSaved: ${offlineSaved}`);
    return draft.id;
  } catch (error) {
    console.error('[DraftService] Error saving draft:', error);
    throw error;
  }
};

/**
 * Called before auto-logout to save any in-progress form
 */
export const saveFormBeforeLogout = async () => {
  try {
    // Check if user was actively in the form
    const formActive = await isFormActive();
    const currentForm = await getCurrentFormData();
    
    if (formActive && currentForm && hasFormData(currentForm)) {
      console.log('[DraftService] 📝 User was in form during logout - saving to drafts...');
      await saveToDrafts(currentForm, { autoSaved: true });
      // Clear the active flag
      await setFormActive(false);
      return true;
    }
    
    console.log('[DraftService] No active form data to save before logout');
    return false;
  } catch (error) {
    console.error('[DraftService] Error saving form before logout:', error);
    return false;
  }
};

/**
 * Check if form has any meaningful data worth saving
 */
const hasFormData = (formData) => {
  // Check if any important fields have data
  return (
    formData.meterData ||
    formData.leakType ||
    formData.location ||
    formData.landmark ||
    (formData.leakPhotos && formData.leakPhotos.length > 0) ||
    formData.landmarkPhoto ||
    formData.leakLatitude ||
    formData.leakLongitude
  );
};

export default {
  saveCurrentFormData,
  getCurrentFormData,
  clearCurrentFormData,
  saveToDrafts,
  saveFormBeforeLogout,
  setFormActive,
  isFormActive,
};
