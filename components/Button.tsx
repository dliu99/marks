import { forwardRef } from 'react';
import { TouchableOpacity, TouchableOpacityProps, View } from 'react-native';
import { HapticIntent, playHaptic } from '@/utils/haptics';

type ButtonProps = {
  title: string;
  haptic?: HapticIntent | 'none';
} & TouchableOpacityProps;

export const Button = forwardRef<View, ButtonProps>(
  ({ title, haptic = 'selection', onPress, ...touchableProps }, ref) => {
    return (
      <TouchableOpacity
        ref={ref}
        onPress={(event) => {
          if (haptic !== 'none') {
            playHaptic(haptic);
          }
          onPress?.(event);
        }}
        {...touchableProps}
        className={`${styles.button} ${touchableProps.className}`}></TouchableOpacity>
    );
  }
);

Button.displayName = 'Button';

const styles = {
  button: 'rounded-xl p-4',
  //buttonText: 'text-slate-950 text-lg font-semibold text-center',
};
