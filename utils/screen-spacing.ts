import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@/hooks/use-header-height';

const ANDROID_NATIVE_TAB_BAR_HEIGHT = 80;

export function useBottomContentPadding(
  padding = 24,
  options: { includesNativeTabBar?: boolean } = {}
) {
  const insets = useSafeAreaInsets();
  const androidTabPadding =
    Platform.OS === 'android' && options.includesNativeTabBar ? ANDROID_NATIVE_TAB_BAR_HEIGHT : 0;

  return padding + Math.max(insets.bottom, androidTabPadding);
}

export function useTransparentHeaderContentPadding(
  padding = 16,
  options: { safeAreaTopApplied?: boolean } = {}
) {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const safeAreaTopApplied = options.safeAreaTopApplied ?? true;

  if (Platform.OS === 'ios') {
    return padding;
  }

  return (safeAreaTopApplied ? Math.max(headerHeight - insets.top, 0) : headerHeight) + padding;
}

export function useTransparentHeaderScrollPadding(padding = 16) {
  const headerHeight = useHeaderHeight();

  return headerHeight + padding;
}
