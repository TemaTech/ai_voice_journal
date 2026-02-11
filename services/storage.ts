import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateStreak } from '../utils/date';

const KEYS = {
  USER_SETTINGS: 'user_settings',
  JOURNAL_ENTRIES: 'journal_entries',
};

export interface UserSettings {
  isOnboarded: boolean;
  userName?: string;
  lastTalkDate?: string;
  streakCount: number;
  // Extended Profile
  interests?: string[];
  occupation?: string;
  goals?: string;
  bio?: string;
  // AI Voice Customization
  aiVoice?: string; // Voice name, e.g. "Aoede", "Charon"
  // Daily Reminder
  notificationEnabled: boolean;
  notificationTime: string; // "HH:mm"
  // Theme
  theme: 'system' | 'light' | 'dark';
}

const DEFAULT_SETTINGS: UserSettings = {
  isOnboarded: false,
  streakCount: 0,
  interests: [],
  occupation: '',
  goals: '',
  bio: '',
  aiVoice: 'Aoede', // Default female voice
  notificationEnabled: false,
  notificationTime: '21:00',
  theme: 'system',
};

export interface JournalEntry {
  id: string;
  date: string; // ISO string 2026-01-01
  title: string;
  summary: string;
  emotion: 'happy' | 'sad' | 'excited' | 'calm' | 'tired' | 'neutral';
  duration?: number; // Duration in seconds
  createdAt: number;
}

export const StorageService = {
  // User Settings
  async getUserSettings(): Promise<UserSettings> {
    try {
      const json = await AsyncStorage.getItem(KEYS.USER_SETTINGS);
      if (!json) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
    } catch (e) {
      console.error('Failed to load user settings', e);
      return DEFAULT_SETTINGS;
    }
  },

  async saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
    try {
      const current = await this.getUserSettings();
      const updated = { ...current, ...settings };
      await AsyncStorage.setItem(KEYS.USER_SETTINGS, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save user settings', e);
    }
  },

  // Journal Entries
  async getJournalEntries(): Promise<JournalEntry[]> {
    try {
      const json = await AsyncStorage.getItem(KEYS.JOURNAL_ENTRIES);
      if (!json) return [];
      return JSON.parse(json);
    } catch (e) {
      console.error('Failed to load journal entries', e);
      return [];
    }
  },

  async saveJournalEntry(entry: JournalEntry): Promise<void> {
    try {
      const current = await this.getJournalEntries();
      // Check if entry already exists (by ID) to avoid duplicates if calling save twice
      const exists = current.find(e => e.id === entry.id);
      let updated;
      if (exists) {
        updated = current.map(e => e.id === entry.id ? entry : e);
      } else {
        updated = [entry, ...current];
      }
      await AsyncStorage.setItem(KEYS.JOURNAL_ENTRIES, JSON.stringify(updated));

      // Update Streak
      const streak = calculateStreak(updated);
      await this.saveUserSettings({ streakCount: streak });
    } catch (e) {
      console.error('Failed to save journal entry', e);
    }
  },

  async updateJournalEntry(entry: JournalEntry): Promise<void> {
    try {
      const current = await this.getJournalEntries();
      const updated = current.map(e => e.id === entry.id ? entry : e);
      await AsyncStorage.setItem(KEYS.JOURNAL_ENTRIES, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to update journal entry', e);
    }
  },

  
  async deleteJournalEntry(id: string): Promise<void> {
    try {
      const current = await this.getJournalEntries();
      const updated = current.filter(e => e.id !== id);
      await AsyncStorage.setItem(KEYS.JOURNAL_ENTRIES, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to delete journal entry', e);
    }
  },

  async clearAll(): Promise<void> {
    try {
        await AsyncStorage.clear();
    } catch (e) {
        console.error('Failed to clear storage', e);
    }
  },

  // Export & Data Management
  async exportDataAsJson(): Promise<string> {
    try {
      const settings = await this.getUserSettings();
      const entries = await this.getJournalEntries();
      
      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings,
        entries
      };
      
      return JSON.stringify(exportData, null, 2);
    } catch (e) {
      console.error('Failed to export data', e);
      throw e;
    }
  },

  // Search
  async searchJournalEntries(query: string): Promise<JournalEntry[]> {
    try {
      const allEntries = await this.getJournalEntries();
      if (!query.trim()) return allEntries;

      const lowerQuery = query.toLowerCase();
      return allEntries.filter(entry => 
        entry.title.toLowerCase().includes(lowerQuery) ||
        entry.summary.toLowerCase().includes(lowerQuery) ||
        entry.emotion.toLowerCase().includes(lowerQuery)
      );
    } catch (e) {
      console.error('Failed to search entries', e);
      return [];
    }
  }
};
