import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  USER_SETTINGS: 'user_settings',
  JOURNAL_ENTRIES: 'journal_entries',
};

export interface UserSettings {
  isOnboarded: boolean;
  userName?: string;
  lastTalkDate?: string;
  streakCount: number;
}

const DEFAULT_SETTINGS: UserSettings = {
  isOnboarded: false,
  streakCount: 0,
};

export interface JournalEntry {
  id: string;
  date: string; // ISO string 2026-01-01
  title: string;
  summary: string;
  emotion: 'happy' | 'sad' | 'excited' | 'calm' | 'tired' | 'neutral';
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
      // Add new entry to the beginning
      const updated = [entry, ...current];
      await AsyncStorage.setItem(KEYS.JOURNAL_ENTRIES, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save journal entry', e);
    }
  },

  async clearAll(): Promise<void> {
    try {
        await AsyncStorage.clear();
    } catch (e) {
        console.error('Failed to clear storage', e);
    }
  }
};
