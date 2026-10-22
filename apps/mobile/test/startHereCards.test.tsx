import { fireEvent, render, screen } from '@testing-library/react-native';
import { StartHereCard, WhereToCard } from '@/features/navigate/SheetParts';
import { t } from '@/i18n/en';

const noop = () => {};

describe('Where to? card', () => {
  it('names the start, offers search and the recent places', async () => {
    const onSearch = jest.fn();
    const onPick = jest.fn();
    await render(<WhereToCard origin="My location" recents={[{ id: 'a', name: 'Ambala' }, { id: 'b', name: 'Amritsar' }]} onSearch={onSearch} onPick={onPick} />);
    expect(screen.getByText(t('whereToTitle'))).toBeTruthy();
    expect(screen.getByText(t('whereToFrom', { place: 'My location' }))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('where-to-search'));
    expect(onSearch).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('where-to-recent-b'));
    expect(onPick).toHaveBeenCalledWith('b');
  });

  it('shows no recent row when there are none', async () => {
    await render(<WhereToCard origin="My location" recents={[]} onSearch={noop} onPick={noop} />);
    expect(screen.queryByTestId('where-to-recent-a')).toBeNull();
  });
});

describe('Start-from-here card', () => {
  const show = async (status: 'locating' | 'needs_permission' | 'denied' | 'outside' | 'unavailable', fns = {}) =>
    render(<StartHereCard status={status} onAllow={noop} onSettings={noop} onRetry={noop} onSearch={noop} {...fns} />);

  it('says it is locating, with no buttons', async () => {
    await show('locating');
    expect(screen.getByTestId('start-here-locating')).toBeTruthy();
    expect(screen.queryByTestId('start-here-search')).toBeNull();
  });

  it('asks for permission with an Allow button that is pressed, not at launch', async () => {
    const onAllow = jest.fn();
    await show('needs_permission', { onAllow });
    await fireEvent.press(screen.getByTestId('start-here-allow'));
    expect(onAllow).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('start-here-search')).toBeTruthy();
  });

  it('points to settings when location was refused', async () => {
    const onSettings = jest.fn();
    await show('denied', { onSettings });
    await fireEvent.press(screen.getByTestId('start-here-settings'));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('offers a retry when location cannot be read', async () => {
    const onRetry = jest.fn();
    await show('unavailable', { onRetry });
    await fireEvent.press(screen.getByTestId('start-here-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('tells the traveller there is no road map here, and still lets them search', async () => {
    const onSearch = jest.fn();
    await show('outside', { onSearch });
    expect(screen.getByText(t('hereOutsideTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('start-here-search'));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('start-here-allow')).toBeNull();
  });
});
