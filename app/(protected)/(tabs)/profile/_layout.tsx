import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: '#fff',
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Profile',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="about"
        options={{
          headerTransparent: true,
          title: '📈',
          headerShown: true,
          headerStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="preferences"
        options={{
          headerTransparent: true,
          title: 'Preferences',
          headerShown: true,
          headerStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="reorder-courses"
        options={{
          headerTransparent: true,
          title: 'Reorder Courses',
          headerShown: true,
          headerStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="select-term"
        options={{
          headerTransparent: true,
          title: 'Select Term',
          headerShown: true,
          headerStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="responsive-schedule"
        options={{
          headerTransparent: true,
          title: 'Responsive Schedule',
          headerShown: true,
          headerStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}
