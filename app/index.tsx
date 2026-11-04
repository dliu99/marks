import { Redirect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { QueryErrorState } from '@/components/QueryErrorState';
import { useAuth } from '@/utils/auth-context';
import { clearAuth, getDefaultHomePath } from '@/utils/storage';

export default function Index() {
  const { authStatus, refreshAuth, setAuthStatus } = useAuth();
  const queryClient = useQueryClient();

  const handleLogOut = async () => {
    await clearAuth();
    setAuthStatus('unauthenticated');
    queryClient.clear();
  };

  if (authStatus === 'error' || authStatus === 'expired') {
    return (
      <QueryErrorState
        title="An error occurred"
        message="Your old session could not be transferred. Try again, or sign in to your school."
        onRetry={async () => {
          await refreshAuth();
        }}
        secondaryActionLabel="Sign in again"
        onSecondaryAction={handleLogOut}
      />
    );
  }

  if (authStatus === 'authenticated') {
    return <Redirect href={getDefaultHomePath()} />;
  }

  return <Redirect href="/(auth)/onboarding" />;
}
