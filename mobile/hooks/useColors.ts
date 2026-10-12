import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';
import { useApp } from '@/context/AppContext';

/** Returns the selected palette, defaulting to light unless system mode is chosen. */
export function useColors() {
  const scheme = useColorScheme();
  const { settings } = useApp();
  const useDark = settings?.themeMode === 'system'
    ? scheme === 'dark'
    : settings?.themeMode
      ? settings.themeMode === 'dark'
      : typeof settings?.darkMode === 'boolean'
        ? settings.darkMode
        : false;
  const palette = useDark ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
