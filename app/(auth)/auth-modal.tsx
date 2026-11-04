import React, { useRef } from 'react';
import { View, Alert, Platform } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import CookieManager from '@preeternal/react-native-cookie-manager';
import DeviceInfo from 'react-native-device-info';
import { getDefaultHomePath } from '../../utils/storage';
import { finishCampusLogin } from '@/utils/campus-auth';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/utils/auth-context';
import { playHaptic } from '@/utils/haptics';

function getCampusDeviceType() {
  return Platform.OS === 'android' ? 'Android' : 'iOS';
}

function getCampusUserAgent(model: string, systemVersion: string) {
  if (Platform.OS === 'android') {
    return `Mozilla/5.0 (Linux; Android ${systemVersion}; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36`;
  }

  return `Mozilla/5.0 (iPhone; CPU iPhone OS ${systemVersion.replace(/\./g, '_')} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148`;
}

export default function AuthModal() {
  const { setAuthStatus } = useAuth();
  const queryClient = useQueryClient();
  const webViewRef = useRef<WebView>(null);
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const bootstrapAttempted = useRef(false);
  const authInProgress = useRef(false);
  const { districtAppName } = useLocalSearchParams<{ districtAppName: string }>();
  const districtURL = new URL(uri).hostname;
  const deviceID = useRef(DeviceInfo.getUniqueIdSync()).current;
  const deviceType = getCampusDeviceType();

  const performAuth = async (url: string) => {
    if (authInProgress.current) return;
    authInProgress.current = true;

    try {
      const cookies = await CookieManager.get(url, true);
      const cookieHeader = Object.entries(cookies)
        .map(([name, c]) => `${name}=${c.value}`)
        .join(';');

      const host = new URL(url).hostname;

      await finishCampusLogin({
        cookie:
          cookieHeader +
          (districtAppName && !/(?:^|;)\s*appName=/.test(cookieHeader)
            ? `;appName=${districtAppName}`
            : ''),
        deviceType,
        deviceModel: DeviceInfo.getModel(),
        systemVersion: DeviceInfo.getSystemVersion(),
        deviceId: deviceID,
        baseURL: `${host}/campus`,
      });
      queryClient.clear();
      setAuthStatus('authenticated');
      playHaptic('success');
      router.replace(getDefaultHomePath());
    } catch (error) {
      playHaptic('error');
      Alert.alert(
        'Unable to sign in',
        error instanceof Error ? error.message : 'Please try again.'
      );
      authInProgress.current = false;
    }
  };

  const isSchoolHome = (url: string) => {
    try {
      const target = new URL(url);
      return (
        target.protocol === 'https:' &&
        target.hostname === districtURL &&
        target.pathname.startsWith('/campus/') &&
        (target.pathname.includes('nav-wrapper') || target.pathname.includes('home'))
      );
    } catch {
      return false;
    }
  };

  const handleShouldStartLoad = (request: { url: string }) => {
    if (isSchoolHome(request.url)) {
      performAuth(request.url);
    }
    return true;
  };

  const handleNavigationStateChange = (navState: { url: string }) => {
    if (isSchoolHome(navState.url)) {
      performAuth(navState.url);
    }
  };

  const handleError = (error: any) => {
    console.error('WebView error:', error);
    playHaptic('error');
    Alert.alert('Error', 'Failed to load login page. Please check your connection.');
  };

  const handleLoadEnd = async () => {
    if (!bootstrapAttempted.current && webViewRef.current) {
      await CookieManager.set(uri, {
        name: 'campus_hybrid_app',
        value: 'student',
        domain: new URL(uri).hostname,
        path: '/',
        expires: (Date.now() + 1000 * 60 * 60 * 24 * 30).toString(),
        secure: true,
        httpOnly: true,
      });
      bootstrapAttempted.current = true;

      // not sure if the following is necessary, but it works now so I'm leaving it
      //const deviceID = uuidv4();
      const model = DeviceInfo.getModel();
      const systemVersion = DeviceInfo.getSystemVersion();
      const userAgent = getCampusUserAgent(model, systemVersion);

      const script = `
        (function() {
            const formData = new URLSearchParams({
              'appName': ${JSON.stringify(districtAppName)},
              'deviceID': ${JSON.stringify(deviceID)},
              'deviceModel': ${JSON.stringify(model)},
              'deviceType': ${JSON.stringify(deviceType)},
              'systemVersion': ${JSON.stringify(systemVersion)},
              'appType': 'student',
              'appVersion': '1.11.4',
              'bootstrapped': '1',
              'registrationToken': 'null'
            });

            const xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://${districtURL}/campus/mobile/hybridAppUtil.jsp', true);
            xhr.setRequestHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
            xhr.setRequestHeader('Accept-Language', 'en-US,en;q=0.9');
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.setRequestHeader('User-Agent', ${JSON.stringify(userAgent)});
            xhr.send(formData.toString());
        })();
        true;
      `;

      webViewRef.current.injectJavaScript(script);
    }
  };

  return (
    <View className="flex-1 bg-neutral-900">
      <Stack.Screen
        options={{
          title: 'Sign in to Infinite Campus',
          headerStyle: { backgroundColor: '#171717' },
          headerTintColor: '#ffffff',
          headerShadowVisible: false,
          contentStyle: { backgroundColor: '#171717' },
        }}
      />
      <WebView
        ref={webViewRef}
        source={{ uri: uri }}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowsBackForwardNavigationGestures={true}
        style={{ backgroundColor: '#171717' }}
      />
    </View>
  );
}
