import { makeObservable, observable, action, runInAction, computed } from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFTS_KEY = 'leak_report_drafts';

class DraftsStore {
  drafts = [];
  loading = false;
  currentDraftId = null; // Track which draft is being edited

  constructor() {
    makeObservable(this, {
      drafts: observable,
      loading: observable,
      currentDraftId: observable,
      draftCount: computed,
      loadDrafts: action.bound,
      saveDraft: action.bound,
      updateDraft: action.bound,
      deleteDraft: action.bound,
      clearAllDrafts: action.bound,
      setCurrentDraftId: action.bound,
    });
    
    // Load drafts on initialization
    this.loadDrafts();
  }

  get draftCount() {
    return this.drafts.length;
  }

  async loadDrafts() {
    this.loading = true;
    try {
      const stored = await AsyncStorage.getItem(DRAFTS_KEY);
      runInAction(() => {
        this.drafts = stored ? JSON.parse(stored) : [];
        this.loading = false;
      });
      console.log(`[DraftsStore] Loaded ${this.drafts.length} drafts`);
    } catch (error) {
      console.error('[DraftsStore] Error loading drafts:', error);
      runInAction(() => {
        this.drafts = [];
        this.loading = false;
      });
    }
  }

  async saveDraft(draftData) {
    try {
      const draft = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...draftData,
      };
      
      runInAction(() => {
        this.drafts = [draft, ...this.drafts];
      });
      
      await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(this.drafts));
      console.log(`[DraftsStore] Draft saved with id: ${draft.id}`);
      return draft.id;
    } catch (error) {
      console.error('[DraftsStore] Error saving draft:', error);
      throw error;
    }
  }

  async updateDraft(draftId, draftData) {
    try {
      const index = this.drafts.findIndex(d => d.id === draftId);
      if (index === -1) {
        // If not found, save as new
        return this.saveDraft(draftData);
      }
      
      const updatedDraft = {
        ...this.drafts[index],
        ...draftData,
        updatedAt: new Date().toISOString(),
      };
      
      runInAction(() => {
        this.drafts[index] = updatedDraft;
        this.drafts = [...this.drafts]; // Trigger reactivity
      });
      
      await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(this.drafts));
      console.log(`[DraftsStore] Draft updated: ${draftId}`);
      return draftId;
    } catch (error) {
      console.error('[DraftsStore] Error updating draft:', error);
      throw error;
    }
  }

  async deleteDraft(draftId) {
    try {
      runInAction(() => {
        this.drafts = this.drafts.filter(d => d.id !== draftId);
      });
      
      await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(this.drafts));
      console.log(`[DraftsStore] Draft deleted: ${draftId}`);
      
      // Clear current draft id if it matches
      if (this.currentDraftId === draftId) {
        this.currentDraftId = null;
      }
    } catch (error) {
      console.error('[DraftsStore] Error deleting draft:', error);
      throw error;
    }
  }

  async clearAllDrafts() {
    try {
      runInAction(() => {
        this.drafts = [];
        this.currentDraftId = null;
      });
      
      await AsyncStorage.removeItem(DRAFTS_KEY);
      console.log('[DraftsStore] All drafts cleared');
    } catch (error) {
      console.error('[DraftsStore] Error clearing drafts:', error);
      throw error;
    }
  }

  setCurrentDraftId(id) {
    this.currentDraftId = id;
  }

  getDraftById(draftId) {
    return this.drafts.find(d => d.id === draftId) || null;
  }
}

export default DraftsStore;
