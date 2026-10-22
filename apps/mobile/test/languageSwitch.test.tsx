import { act, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { memo } from 'react';
import { Text } from 'react-native';
import { t } from '@/i18n/en';
import { useLanguage } from '@/i18n/useLanguage';
import { useSettings } from '@/stores/settings';

/** Changing language must redraw in place: rebuilding the navigator rebuilds the map behind Settings, which is what made it slow. */

const Memoised = memo(function Memoised() {
  useLanguage();
  return <Text testID="word">{t('drawerSettings')}</Text>;
});

beforeEach(() => useSettings.getState().setLanguage('en'));
afterAll(() => useSettings.getState().setLanguage('en'));

describe('language switch', () => {
  it('redraws a memoised component without it being remounted', async () => {
    await render(<Memoised />);
    const before = screen.getByTestId('word').props.children;
    await act(async () => useSettings.getState().setLanguage('hi'));
    expect(screen.getByTestId('word').props.children).not.toBe(before);
  });

  it('does not key the root navigator by language, and freezes drawer screens behind the one in front', () => {
    const root = readFileSync(`${__dirname}/../app/_layout.tsx`, 'utf8');
    expect(root).not.toMatch(/<Stack[^>]*key=/);
    const drawer = readFileSync(`${__dirname}/../app/(drawer)/_layout.tsx`, 'utf8');
    expect(drawer).toMatch(/freezeOnBlur:\s*true/);
  });
});
