import { useThemeContext } from '../context/ThemeContext';

export const useTheme = () => {
  const { 
    theme, 
    changeTheme, 
    isDark,
    themeColor,
    changeThemeColor,
    activeColors
  } = useThemeContext();

  return {
    theme,
    changeTheme,
    isDark,
    themeColor,
    changeThemeColor,
    activeColors
  };
};

