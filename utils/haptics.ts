import { Platform } from 'react-native';

type HapticsModule = {
  impact: (
    type?: string,
    intensity?: number,
    options?: {
      enableVibrateFallback?: boolean;
      ignoreAndroidSystemSettings?: boolean;
    }
  ) => void;
  trigger: (
    type: string,
    options?: {
      enableVibrateFallback?: boolean;
      ignoreAndroidSystemSettings?: boolean;
    }
  ) => void;
};

const options = {
  enableVibrateFallback: false,
  ignoreAndroidSystemSettings: false,
} as const;

export type HapticIntent =
  | 'selection'
  | 'navigation'
  | 'toggle'
  | 'category'
  | 'success'
  | 'warning'
  | 'error';

let cachedModule: HapticsModule | null | undefined;

function getHapticsModule() {
  if (cachedModule !== undefined) {
    return cachedModule;
  }

  if (Platform.OS === 'web') {
    cachedModule = null;
    return cachedModule;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('react-native-haptic-feedback') as HapticsModule;
  } catch (error) {
    cachedModule = null;
    if (__DEV__) {
      console.warn('react-native-haptic-feedback is not available in this build', error);
    }
  }

  return cachedModule;
}

export function playHaptic(intent: HapticIntent = 'selection') {
  const haptics = getHapticsModule();
  if (!haptics) return;

  try {
    switch (intent) {
      case 'navigation':
        haptics.impact('impactLight', 0.45, options);
        return;
      case 'category':
        haptics.impact('impactMedium', 0.7, options);
        return;
      case 'toggle':
        haptics.trigger('selection', options);
        return;
      case 'success':
        haptics.trigger('notificationSuccess', options);
        return;
      case 'warning':
        haptics.trigger('notificationWarning', options);
        return;
      case 'error':
        haptics.trigger('notificationError', options);
        return;
      case 'selection':
      default:
        haptics.impact('impactLight', 0.3, options);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('Failed to trigger haptic feedback', error);
    }
  }
}
