import { AccountScreen } from '@/features/account/AccountScreen';
import { usePausePlanning } from '@/hooks/usePausePlanning';

export default function Account() {
  usePausePlanning();
  return <AccountScreen />;
}
