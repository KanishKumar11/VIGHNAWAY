import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ScreenHeader, GUTTER } from '@/components/ui';
import { MapPicker } from '@/features/report/MapPicker';
import { spacing } from '@/theme';

// Non-zero insets: a notch, a gesture bar and landscape side cut-outs.
const INSETS = { top: 30, bottom: 22, left: 14, right: 18 };
jest.mock('react-native-safe-area-context', () => ({
  ...require('react-native-safe-area-context/jest/mock').default,
  useSafeAreaInsets: () => ({ top: 30, bottom: 22, left: 14, right: 18 }),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ dispatch: jest.fn() }),
}));

describe('safe areas (BUILD_PROMPT 8.1)', () => {
  it('ScreenHeader clears the status bar and the side cut-outs', async () => {
    await render(<ScreenHeader title="Settings" />);
    const flat = (n: { props: { style?: unknown } } | null | undefined) => StyleSheet.flatten(n?.props.style as never) as Record<string, number>;
    let node = screen.getByText('Settings').parent as { props: { style?: unknown }; parent: unknown } | null;
    let found: Record<string, number> | null = null;
    while (node && !found) {
      const s = flat(node);
      if (s && s.paddingTop !== undefined) found = s;
      node = node.parent as typeof node;
    }
    expect(found).toMatchObject({ paddingTop: INSETS.top + spacing.xs, paddingLeft: INSETS.left + GUTTER, paddingRight: INSETS.right + GUTTER });
  });

  it('the map picker modal pads its floating cards by the insets and sits in its own provider', async () => {
    await render(<MapPicker visible initial={null} onCancel={() => undefined} onConfirm={() => undefined} />);
    const top = StyleSheet.flatten(screen.getByTestId('map-picker-top').props.style);
    const bottom = StyleSheet.flatten(screen.getByTestId('map-picker-bottom').props.style);
    expect(top).toMatchObject({ paddingTop: INSETS.top + spacing.xs, paddingLeft: INSETS.left + GUTTER, paddingRight: INSETS.right + GUTTER });
    expect(bottom).toMatchObject({ paddingBottom: INSETS.bottom + spacing.sm, paddingLeft: INSETS.left + GUTTER });
  });
});
