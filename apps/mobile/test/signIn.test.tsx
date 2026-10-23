import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import SignIn from '../app/sign-in';
import { useAuth } from '@/stores/auth';
import { useSettings } from '@/stores/settings';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), back: jest.fn() },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native') as typeof import('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));

beforeEach(() => {
  mockReplace.mockClear();
  useAuth.getState().clearLocal();
  useSettings.setState({ signInSkipped: false, firstRunDone: true });
});

describe('launch sign-in screen', () => {
  it('shows the email step of the code sign-in, and a way to go on without an account', async () => {
    await render(<SignIn />);
    expect(screen.getByText('Sign in')).toBeTruthy();
    expect(screen.getByTestId('account-email')).toBeTruthy();
    expect(screen.getByTestId('account-send')).toBeTruthy();
    expect(screen.getByTestId('sign-in-skip')).toBeTruthy();
  });

  it('"Continue without an account" is remembered and opens the map', async () => {
    await render(<SignIn />);
    await fireEvent.press(screen.getByTestId('sign-in-skip'));
    expect(useSettings.getState().signInSkipped).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('a phone that is already signed in goes straight to the map', async () => {
    useAuth.getState().setSession({
      token: 'tok',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      user: { id: 'u1', email: 'asha@example.com', role: 'citizen', displayName: null },
    } as Parameters<ReturnType<typeof useAuth.getState>['setSession']>[0]);
    await render(<SignIn />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/');
  });

  it('signing out brings the sign-in screen back', async () => {
    useSettings.setState({ signInSkipped: true });
    await useAuth.getState().signOut();
    expect(useSettings.getState().signInSkipped).toBe(false);
  });

  it('the drawer sends a phone without an account (and no skip) to the sign-in screen', () => {
    const drawer = readFileSync(`${__dirname}/../app/(drawer)/_layout.tsx`, 'utf8');
    expect(drawer).toMatch(/!signedIn && !signInSkipped\) return <Redirect href="\/sign-in"/);
  });
});
