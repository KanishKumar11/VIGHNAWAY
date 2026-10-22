import { render, screen } from '@testing-library/react-native';
import { RelayScreen } from '@/features/relay/RelayScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), dismiss: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ dispatch: jest.fn() }),
}));

it('debug', () => {
  let r: unknown;
  try {
    r = render(<RelayScreen />);
  } catch (e) {
    throw new Error('RENDER THREW: ' + String((e as Error)?.stack ?? e).slice(0, 1500));
  }
  expect(r).toBeTruthy();
  expect(screen.getByTestId('relay-empty')).toBeTruthy();
});
