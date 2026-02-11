import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance, InteractionManager } from 'react-native';
import { StorageService } from '../services/storage';

type Theme = 'light' | 'dark' | 'system';
export type ThemeColor = 'indigo' | 'blue' | 'pink' | 'teal' | 'orange';

export const THEME_COLORS: Record<ThemeColor, { primary: string; light: string; dark: string }> = {
    indigo: { primary: '#6366F1', light: '#818CF8', dark: '#4F46E5' },
    blue:   { primary: '#3B82F6', light: '#60A5FA', dark: '#2563EB' },
    pink:   { primary: '#EC4899', light: '#F472B6', dark: '#DB2777' },
    teal:   { primary: '#14B8A6', light: '#2DD4BF', dark: '#0D9488' },
    orange: { primary: '#F97316', light: '#FB923C', dark: '#EA580C' },
};

interface ThemeContextType {
  /** ユーザーが選択したテーマ設定 ('light' | 'dark' | 'system') */
  theme: Theme;
  /** テーマを変更する関数 */
  changeTheme: (theme: Theme) => Promise<void>;
  /** 現在ダークモードかどうか */
  isDark: boolean;
  
  /** ユーザーが選択したテーマカラー */
  themeColor: ThemeColor;
  /** テーマカラーを変更する関数 */
  changeThemeColor: (color: ThemeColor) => Promise<void>;
  /** 現在のテーマカラーのカラーコード定義 */
  activeColors: { primary: string; light: string; dark: string };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { colorScheme } = useNativeWindColorScheme();
  const [themePreference, setThemePreference] = useState<Theme>('system');
  const [themeColor, setThemeColor] = useState<ThemeColor>('indigo');

  // アプリ起動時に保存されたテーマ設定を読み込む
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const settings = await StorageService.getUserSettings();
        const savedTheme = settings.theme || 'system';
        const savedColor = settings.themeColor || 'indigo';
        
        setThemePreference(savedTheme);
        setThemeColor(savedColor as ThemeColor);

        // React NativeのAppearance APIを使用してシステムレベルでテーマを設定
        if (savedTheme === 'system') {
          Appearance.setColorScheme(null);
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
      setThemePreference(newTheme);
      await StorageService.saveUserSettings({ theme: newTheme });

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

  const changeThemeColor = async (newColor: ThemeColor) => {
      try {
          setThemeColor(newColor);
          await StorageService.saveUserSettings({ themeColor: newColor });
      } catch (error) {
          console.error('テーマカラーの保存に失敗:', error);
      }
  };

  const isDark = colorScheme === 'dark';
  const activeColors = THEME_COLORS[themeColor];

  return (
    <ThemeContext.Provider value={{ 
        theme: themePreference, 
        changeTheme, 
        isDark,
        themeColor,
        changeThemeColor,
        activeColors
    }}>
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

