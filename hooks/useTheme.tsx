import { useThemeContext } from '../context/ThemeContext';

export const useTheme = () => {
  const { theme, changeTheme, isDark } = useThemeContext();

  return {
    theme,
    changeTheme,
    isDark,
  };
};
