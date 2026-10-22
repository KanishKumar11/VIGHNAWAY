import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DrawerContent } from '@/components/DrawerContent';
import { spacing } from '@/theme';

// A notch or a tall status bar: the drawer's first card must start below it (BUILD_PROMPT 8.1).
jest.mock('react-native-safe-area-context', () => ({
  ...require('react-native-safe-area-context/jest/mock').default,
  useSafeAreaInsets: () => ({ top: 30, bottom: 22, left: 14, right: 18 }),
}));
jest.mock('expo-router/drawer', () => {
  const { ScrollView } = require('react-native');
  return { DrawerContentScrollView: ({ children, contentContainerStyle }: { children: React.ReactNode; contentContainerStyle: unknown }) => <ScrollView testID="drawer-scroll" contentContainerStyle={contentContainerStyle}>{children}</ScrollView> };
});

describe('drawer content', () => {
  it('pads its scroller by the status bar height so the brand card does not sit under the clock', async () => {
    const props = { state: { routes: [{ name: 'index' }], index: 0 }, navigation: { navigate: jest.fn() } } as unknown as ComponentProps<typeof DrawerContent>;
    await render(<DrawerContent {...props} />);
    const style = StyleSheet.flatten(screen.getByTestId('drawer-scroll').props.contentContainerStyle);
    expect(style.paddingTop).toBe(30 + spacing.sm);
    expect(style.paddingLeft).toBe(14 + spacing.md);
  });
});
