import { Pressable, Text, View } from 'react-native';

type QueryErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void | Promise<void>;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void | Promise<void>;
};

export function QueryErrorState({
  title = 'Something went wrong',
  message = 'We could not load this right now. Pull to refresh or try again.',
  onRetry,
  secondaryActionLabel,
  onSecondaryAction,
}: QueryErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <Text className="text-center text-2xl font-bold text-white">{title}</Text>
      <Text className="mt-3 max-w-sm text-center text-base text-stone-400">{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={() => {
            void onRetry();
          }}
          className="mt-6 rounded-full border border-stone-600 px-5 py-3 active:opacity-80">
          <Text className="text-base font-semibold text-white">Try again</Text>
        </Pressable>
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Pressable
          onPress={() => {
            void onSecondaryAction();
          }}
          className="mt-4 px-3 py-2 active:opacity-80">
          <Text className="text-base font-semibold text-red-500">{secondaryActionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
