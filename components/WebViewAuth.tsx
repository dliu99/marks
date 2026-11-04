import React, { useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import CookieManager from '@preeternal/react-native-cookie-manager';

interface WebViewAuthProps {
  url: string;
  onAuthSuccess: (cookies: any) => void;
  onAuthFailure: (error: string) => void;
  successUrl?: string;
  failureUrl?: string;
}

export default function WebViewAuth({
  url,
  onAuthSuccess,
  onAuthFailure,
  successUrl,
  failureUrl,
}: WebViewAuthProps) {
  const webViewRef = useRef<WebView>(null);

  const handleNavigationStateChange = async (navState: any) => {
    // Check if we reached success URL
    if (successUrl && navState.url.includes(successUrl)) {
      try {
        const cookies = await CookieManager.get(url, true);
        onAuthSuccess(cookies);
      } catch (error) {
        console.error('Error getting cookies:', error);
        onAuthFailure('Failed to retrieve cookies');
      }
    } else if (failureUrl && navState.url.includes(failureUrl)) {
      onAuthFailure('Authentication failed');
    }
  };

  const handleError = (error: any) => {
    console.error('WebView error:', error);
    onAuthFailure('WebView error occurred');
  };

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        onNavigationStateChange={handleNavigationStateChange}
        onError={handleError}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
      />
    </View>
  );
}
