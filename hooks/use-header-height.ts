import { use } from 'react';
import { Platform } from 'react-native';
import {
  HeaderShownContext,
  useHeaderHeight as useReactNavigationHeaderHeight,
} from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ANDROID_DEFAULT_HEADER_HEIGHT = 56;

export function useHeaderHeight() {
  const { top } = useSafeAreaInsets();
  const headerHeight = useReactNavigationHeaderHeight();

  if (Platform.OS === 'android') {
    const parentHeaderShown = use(HeaderShownContext);

    return parentHeaderShown ? ANDROID_DEFAULT_HEADER_HEIGHT + top : 0;
  }

  return headerHeight;
}
