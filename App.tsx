import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold } from '@expo-google-fonts/tajawal';
import { I18nProvider } from './src/i18n';
import { AuthProvider } from './src/auth';
import { StoreProvider } from './src/store';
import Navigation from './src/Navigation';
import { ErrorBoundary } from './src/boot/ErrorBoundary';
import { Boot } from './src/boot/Boot';
import { OnboardingGate } from './src/onboarding/Onboarding';
import { NetFrame } from './src/net/OfflineBanner';
import { colors } from './src/theme';

export default function App() {
  const [loaded, fontError] = useFonts({ Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold });
  // A font that fails to load must not leave the app on a spinner forever: continue with system fonts.
  if (!loaded && !fontError) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><ActivityIndicator color={colors.red} /></View>;
  }
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <I18nProvider>
            <AuthProvider>
            <StoreProvider>
              <StatusBar style="light" />
              <Boot />
              <NetFrame>
                {/* Inner boundary: a screen crash keeps the connectivity strip and providers alive. */}
                <ErrorBoundary>
                  <OnboardingGate><Navigation /></OnboardingGate>
                </ErrorBoundary>
              </NetFrame>
            </StoreProvider>
            </AuthProvider>
          </I18nProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
