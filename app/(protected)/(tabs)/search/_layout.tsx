import { Stack } from 'expo-router';
import { SearchProvider, useSearch } from './_context';

function SearchStack() {
  const { setQuery } = useSearch();

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Search Assignments',
          headerBackVisible: false,
          headerTitleStyle: { color: '#fff' },
          //headerShown: false,
          /*
          headerLeft: () => (
            <Pressable onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
          ),
          */
          headerStyle: { backgroundColor: 'transparent' },
          headerSearchBarOptions: {
            placement: 'automatic',
            placeholder: 'Find an assignment',
            onChangeText: (e) => setQuery(e.nativeEvent.text),
          },
        }}
      />
    </Stack>
  );
}

export default function SearchLayout() {
  return (
    <SearchProvider>
      <SearchStack />
    </SearchProvider>
  );
}
