import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getSchoolErrorCopy } from '@/utils/school-error';

type QueryErrorStateProps = {
  /** A failed school request. Its status picks the title, message and actions. */
  error?: unknown;
  /** What failed to load, completing "your current …" (e.g. "grades"). */
  subject?: string;
  title?: string;
  message?: string;
  onRetry?: () => void | Promise<void>;
  /** A retry is in flight. */
  retrying?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void | Promise<void>;
  /** 'inline' renders a card inside a scrolling screen instead of filling it. */
  variant?: 'screen' | 'inline';
};

function signIn() {
  router.push('/(auth)/school-select');
}

export function QueryErrorState({
  error,
  subject = 'school data',
  title,
  message,
  onRetry,
  retrying = false,
  secondaryActionLabel,
  onSecondaryAction,
  variant = 'screen',
}: QueryErrorStateProps) {
  const copy = error ? getSchoolErrorCopy(error, subject) : null;
  const heading = title ?? copy?.title ?? 'Something went wrong';
  const body = message ?? copy?.message ?? 'We could not load this right now. Try again.';

  // An expired login can only be fixed by signing in; retrying stays available as a fallback.
  const primary = copy?.needsSignIn
    ? { label: 'Sign in', onPress: signIn }
    : onRetry
      ? { label: retrying ? 'Trying again…' : 'Try again', onPress: onRetry }
      : null;
  const secondary =
    secondaryActionLabel && onSecondaryAction
      ? { label: secondaryActionLabel, onPress: onSecondaryAction }
      : copy?.needsSignIn && onRetry
        ? { label: retrying ? 'Trying again…' : 'Try again', onPress: onRetry }
        : null;

  return (
    <View
      className={
        variant === 'inline'
          ? 'mb-4 items-center rounded-2xl border border-stone-700 px-5 py-8'
          : 'flex-1 items-center justify-center px-6 py-12'
      }>
      <Text
        className={`text-center font-bold text-white ${variant === 'inline' ? 'text-xl' : 'text-2xl'}`}>
        {heading}
      </Text>
      <Text className="mt-3 max-w-sm text-center text-base text-stone-400">{body}</Text>
      {primary ? (
        <Pressable
          accessibilityRole="button"
          disabled={retrying && !copy?.needsSignIn}
          onPress={() => {
            void primary.onPress();
          }}
          className={`mt-6 flex-row items-center rounded-full px-5 py-3 active:opacity-80 ${
            copy?.needsSignIn ? 'bg-white' : 'border border-stone-600'
          }`}>
          {retrying && !copy?.needsSignIn ? (
            <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
          ) : null}
          <Text
            className={`text-base font-semibold ${copy?.needsSignIn ? 'text-neutral-900' : 'text-white'}`}>
            {primary.label}
          </Text>
        </Pressable>
      ) : null}
      {secondary ? (
        <Pressable
          accessibilityRole="button"
          disabled={retrying}
          onPress={() => {
            void secondary.onPress();
          }}
          className="mt-4 px-3 py-2 active:opacity-80">
          <Text
            className={`text-base font-semibold ${
              secondaryActionLabel ? 'text-red-500' : 'text-stone-300'
            }`}>
            {secondary.label}
          </Text>
        </Pressable>
      ) : null}
      {copy ? <Text className="mt-4 text-xs text-stone-600">{copy.code}</Text> : null}
    </View>
  );
}
