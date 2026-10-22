import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Android Back closes the topmost layer we own (sheet modal, expanded sheet) before the screen.
 * The handler returns true only when it closed something.
 */
export function useBackToClose(active: boolean, close: () => void): void {
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [active, close]);
}
