import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance, InteractionManager } from 'react-native';
import { StorageService } from '../services/storage';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  /** ユーザーが選択したテーマ設定 ('light' | 'dark' | 'system') */
  theme: Theme;
  /** テーマを変更する関数 */
  changeTheme: (theme: Theme) => Promise<void>;
  /** 現在ダークモードかどうか */
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { colorScheme } = useNativeWindColorScheme();
  const [themePreference, setThemePreference] = useState<Theme>('system');

  // アプリ起動時に保存されたテーマ設定を読み込む
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const settings = await StorageService.getUserSettings();
        const savedTheme = settings.theme || 'system';
        setThemePreference(savedTheme);
        // React NativeのAppearance APIを使用してシステムレベルでテーマを設定
        // NativeWindはこれを自動的に検知する
        if (savedTheme === 'system') {
          Appearance.setColorScheme(null); // システムのデフォルトに従う
        } else {
          Appearance.setColorScheme(savedTheme);
        }
      } catch (error) {
        console.error('テーマの読み込みに失敗:', error);
      }
    };
    loadTheme();
  }, []);

  const changeTheme = async (newTheme: Theme) => {
    try {
      // まずユーザー設定を保存
      setThemePreference(newTheme);
      await StorageService.saveUserSettings({ theme: newTheme });

      // InteractionManager で現在のインタラクションが完了してから
      // Appearance API でテーマを適用する（ナビゲーションコンテキストとの競合を回避）
      InteractionManager.runAfterInteractions(() => {
        if (newTheme === 'system') {
          Appearance.setColorScheme(null);
        } else {
          Appearance.setColorScheme(newTheme);
        }
      });
    } catch (error) {
      console.error('テーマの保存に失敗:', error);
    }
  };

  const isDark = colorScheme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme: themePreference, changeTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
};
