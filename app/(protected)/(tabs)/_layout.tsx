import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform } from 'react-native';

export const unstable_settings = {
  initialRouteName: 'dashboard',
};

const androidTabBarAppearance =
  Platform.OS === 'android'
    ? {
        backgroundColor: '#171717',
        iconColor: {
          default: '#737373',
          selected: '#fafafa',
        },
        indicatorColor: '#303030',
        labelVisibilityMode: 'unlabeled' as const,
        //rippleColor: '#404040',
      }
    : {};

export default function TabsLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <NativeTabs
        tintColor="#fafafa"
        iconColor={{ default: '#737373', selected: '#fafafa' }}
        {...androidTabBarAppearance}>
        <NativeTabs.Trigger name="dashboard">
          <Label hidden>Dashboard</Label>
          <Icon sf="house" androidSrc={<VectorIcon family={Ionicons} name="home" />} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="grades">
          <Label hidden>Grades</Label>
          <Icon sf="chart.bar" androidSrc={<VectorIcon family={Ionicons} name="bar-chart" />} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <Label hidden>Profile</Label>
          <Icon
            sf="person.crop.circle"
            androidSrc={<VectorIcon family={Ionicons} name="person-circle" />}
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="search" role="search">
          <Label hidden>Search</Label>
          <Icon sf="magnifyingglass" androidSrc={<VectorIcon family={Ionicons} name="search" />} />
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
