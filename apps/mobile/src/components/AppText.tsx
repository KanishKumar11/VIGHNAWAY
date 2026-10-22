import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { getLanguage } from '@/i18n/lang';
import { useSettings } from '@/stores/settings';
import { devanagariFamily, LARGER_TEXT, text, useTheme, type ThemeColors, type ThemeName } from '@/theme';

export type TextVariant = keyof typeof text;
export type TextTone =
  | 'ink'
  | 'muted'
  | 'subtle'
  | 'onShell'
  | 'onShellMuted'
  | 'warn'
  | 'corroborated'
  | 'danger'
  | 'positive'
  | 'live'
  | 'inverse'
  | 'accent'
  | 'recommended';

/** Every tone is an AA pair from tokens' contrastPairs on cards and on the page, in both themes. */
export function toneColor(tc: ThemeColors, _name: ThemeName, tone: TextTone): string {
  switch (tone) {
    case 'muted':
      return tc.inkMuted;
    case 'subtle':
      return tc.inkSubtle;
    case 'onShell':
      return tc.inkOnShell;
    case 'onShellMuted':
      return tc.inkOnShellMuted;
    case 'warn':
      return tc.warnInk;
    case 'corroborated':
      return tc.corroboratedInk;
    case 'danger':
      return tc.dangerInk;
    case 'positive':
      return tc.positiveInk;
    case 'live':
      return tc.liveInk;
    case 'inverse':
      return tc.panel;
    case 'accent':
      return tc.accentInk;
    case 'recommended':
      return tc.recommendedInk;
    default:
      return tc.ink;
  }
}

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

const DEVANAGARI = /[\u0900-\u097F]/;

/**
 * Text with a type token and a colour tone from the active theme. Scales with the system font
 * size, plus the in-app "Larger text" setting; Hindi and Marathi swap Manrope for Noto Sans
 * Devanagari at the same weight.
 */
export function AppText({ variant = 'body', tone = 'ink', style, ...rest }: AppTextProps) {
  const { colors, name } = useTheme();
  const larger = useSettings((s) => s.largerText);
  // Read on every render; the navigator remounts on a language change. A Devanagari string in the
  // English UI (the language names in Settings) gets the Devanagari face too.
  const devanagari = getLanguage() !== 'en' || (typeof rest.children === 'string' && DEVANAGARI.test(rest.children));
  const base: TextStyle = text[variant];
  if (!larger && !devanagari) return <Text {...rest} style={[base, { color: toneColor(colors, name, tone) }, style]} />;
  const flat = StyleSheet.flatten([base, { color: toneColor(colors, name, tone) }, style]) as TextStyle;
  const k = larger ? LARGER_TEXT : 1;
  return (
    <Text
      {...rest}
      style={{
        ...flat,
        fontFamily: devanagari ? devanagariFamily(flat.fontFamily) : flat.fontFamily,
        fontSize: flat.fontSize ? flat.fontSize * k : undefined,
        // Devanagari needs extra room above and below the line.
        lineHeight: flat.lineHeight ? flat.lineHeight * k * (devanagari ? 1.15 : 1) : undefined,
      }}
    />
  );
}
