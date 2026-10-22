import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';

/** Status bar icons follow the theme: light icons on dark surfaces, dark icons on light ones. */
export function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}
