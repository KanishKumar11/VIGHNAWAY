import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import { phoneThemes as themes, type ThemeName } from '@vighnaway/tokens';

/** Navigation theme for each colour theme: page background, card headers, text and borders. */
export function navThemeFor(name: ThemeName): Theme {
  const tc = themes[name];
  const base = name === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: name === 'dark',
    colors: {
      ...base.colors,
      primary: tc.accent,
      background: tc.shell,
      card: tc.panel,
      text: tc.ink,
      border: tc.panelLine,
      notification: tc.danger,
    },
  };
}
