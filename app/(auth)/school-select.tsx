import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { parseSchoolLogin } from '@/shared/districts';
import * as DropdownMenu from 'zeego/dropdown-menu';
import { useState, useEffect } from 'react';
import { ChevronDownIcon, Icon } from '@/components/ui/icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { StateFlag } from '@/components/StateFlag';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { playHaptic } from '@/utils/haptics';
const states = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

interface District {
  id: string;
  district_app_name: string;
  district_baseurl: string;
  district_code: string;
  district_name: string;
  staff_login_url: string;
  student_login_url: string;
  parent_login_url: string;
  state_code: string;
}

export default function SchoolSelect() {
  const [selectedState, setSelectedState] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [districts, setDistricts] = useState<District[]>([]);
  const [manualURL, setManualURL] = useState('');
  const [searchError, setSearchError] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const headerHeight = 56;
  const topPadding = insets.top + headerHeight;

  const selectedStateName = selectedState
    ? states.find((state) => state.code === selectedState)?.name || 'Select a state'
    : 'Select a state';
  useEffect(() => {
    const controller = new AbortController();
    const fetchDistricts = async () => {
      if (!selectedState || searchQuery.length < 3) {
        setDistricts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setSearchError(false);
      try {
        const response = await expoFetch(
          `https://www.infinitecampus.com/api/district?state=${selectedState}&query=${encodeURIComponent(searchQuery)}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error('School search unavailable.');
        const result = (await response.json()) as District[];
        if (!controller.signal.aborted) setDistricts(result);
      } catch {
        if (!controller.signal.aborted) {
          setDistricts([]);
          setSearchError(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchDistricts, 300);
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchQuery, selectedState]);

  const handleDistrictSelect = (district: District) => {
    playHaptic('navigation');
    router.push({
      pathname: '/(auth)/auth-modal',
      params: {
        uri: district.student_login_url.replace('/campus/portal/', '/campus/portal/students/'),
        districtAppName: district.district_app_name,
      },
    });
  };

  return (
    <View className="flex-1 bg-neutral-900">
      <Stack.Screen options={{ title: 'Select School' }} />
      <View style={{ paddingTop: topPadding }} className="flex-1 p-4">
        <Text className="pb-4 text-left text-2xl font-bold text-white">
          Let&apos;s find your school:
        </Text>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={selectedStateName}
              className="mb-4 w-full flex-row items-center rounded-xl bg-white p-4"
              activeOpacity={0.8}>
              {selectedState ? (
                <StateFlag stateCode={selectedState} size={24} />
              ) : (
                <Icon as={ChevronDownIcon} size="md" color="black" className="mt-1" />
              )}
              <Text className="ml-2 text-left text-lg font-semibold text-slate-950">
                {selectedStateName}
              </Text>
            </TouchableOpacity>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Label>Select a state</DropdownMenu.Label>
            {states.map((state) => (
              <DropdownMenu.Item
                key={state.code}
                textValue={state.name}
                onSelect={() => {
                  playHaptic('selection');
                  setSelectedState(state.code);
                  setSearchQuery('');
                  setDistricts([]);
                }}>
                <DropdownMenu.ItemTitle>{state.name}</DropdownMenu.ItemTitle>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <View className="mb-4">
          <TextInput
            accessibilityLabel="School login link"
            value={manualURL}
            onChangeText={setManualURL}
            placeholder="Or paste your school’s full login link"
            placeholderTextColor="#a8a29e"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            className="rounded-xl border border-stone-600 p-4 text-base text-white"
          />
          {manualURL.trim() ? (
            <TouchableOpacity
              accessibilityRole="button"
              className="mt-2 rounded-xl bg-slate-100 p-4"
              onPress={() => {
                try {
                  router.push({
                    pathname: '/(auth)/auth-modal',
                    params: parseSchoolLogin(manualURL),
                  });
                } catch (error) {
                  Alert.alert(
                    'Check your school link',
                    error instanceof Error ? error.message : 'Invalid link.'
                  );
                }
              }}>
              <Text className="text-center text-base font-semibold text-slate-950">
                Open school login
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {searchError ? (
          <Text className="mb-3 text-stone-300">
            School search is unavailable. You can paste your school’s login link above.
          </Text>
        ) : null}
        {loading ? <ActivityIndicator color="#ffffff" /> : null}

        {selectedState && (
          <View className="mb-4">
            <TextInput
              className="rounded-xl bg-white p-4 text-lg text-slate-950"
              placeholder="Search for your school or district..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ minHeight: 56 }}
            />
            {searchQuery.length < 3 && (
              <Text className="mt-2 text-sm text-white">Type at least 3 characters to search</Text>
            )}
          </View>
        )}

        {!loading && districts.length > 0 && (
          <FlatList
            data={districts}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(index * 20).damping(15)} className="mb-3">
                <TouchableOpacity
                  onPress={() => handleDistrictSelect(item)}
                  className="flex-row items-center rounded-lg bg-slate-100 p-4"
                  activeOpacity={0.7}>
                  <Text className="flex-1 text-lg font-semibold text-slate-950">
                    {item.district_name}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}
            showsVerticalScrollIndicator={true}
          />
        )}

        {!loading && searchQuery.length >= 3 && districts.length === 0 && (
          <View className="py-4">
            <Text className="text-center text-white">
              No schools/school districts found. Try your district name instead?
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
