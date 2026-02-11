import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConversationLog } from '../types/callSession';

const KEY_TEMP_LOGS = 'temp_conversation_logs';
const KEY_TEMP_SESSION_START = 'temp_session_start';

export const RecoveryService = {
  /**
   * 会話ログを追記保存する（既存のログに追加）
   * パフォーマンスを考慮し、頻繁に呼ばれることを想定
   */
  async appendLog(log: ConversationLog): Promise<void> {
    try {
      const current = await this.getLogs();
      const updated = [...current, log];
      await AsyncStorage.setItem(KEY_TEMP_LOGS, JSON.stringify(updated));
      
      // セッション開始時間がなければセット
      const startTime = await AsyncStorage.getItem(KEY_TEMP_SESSION_START);
      if (!startTime) {
        await AsyncStorage.setItem(KEY_TEMP_SESSION_START, Date.now().toString());
      }
    } catch (e) {
      console.warn('RecoveryService: Failed to append log', e);
    }
  },

  /**
   * 現在の一時保存ログを取得
   */
  async getLogs(): Promise<ConversationLog[]> {
    try {
      const json = await AsyncStorage.getItem(KEY_TEMP_LOGS);
      return json ? JSON.parse(json) : [];
    } catch (e) {
      console.warn('RecoveryService: Failed to get logs', e);
      return [];
    }
  },

  /**
   * これまでの全ログを上書き保存する（初期化や一括更新用）
   */
  async saveAllLogs(logs: ConversationLog[]): Promise<void> {
    try {
      await AsyncStorage.setItem(KEY_TEMP_LOGS, JSON.stringify(logs));
      const startTime = await AsyncStorage.getItem(KEY_TEMP_SESSION_START);
      if (!startTime) {
        await AsyncStorage.setItem(KEY_TEMP_SESSION_START, Date.now().toString());
      }
    } catch (e) {
      console.warn('RecoveryService: Failed to save all logs', e);
    }
  },

  /**
   * 一時保存データをクリア（正常終了時）
   */
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(KEY_TEMP_LOGS);
      await AsyncStorage.removeItem(KEY_TEMP_SESSION_START);
      console.log('RecoveryService: Cleared temporary logs');
    } catch (e) {
      console.warn('RecoveryService: Failed to clear logs', e);
    }
  },

  /**
   * クラッシュ等で残ったデータがあるか確認
   */
  async hasPendingSession(): Promise<boolean> {
    try {
      const logs = await this.getLogs();
      return logs.length > 0;
    } catch (e) {
      return false;
    }
  }
};
