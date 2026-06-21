/**
 * App.js — UniGarden prototype entry point.
 *
 * Provider stack (outer -> inner):
 *   GestureHandlerRootView  → required for react-native-gesture-handler
 *   SafeAreaProvider        → notch-aware insets for modern smartphones
 *   VolatileTranscriptProvider → volatile PDPA-compliant transcript engine
 *   NavigationContainer     → React Navigation root
 */

import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';

// Worker / volunteer app (default boot target — the synced 3D village + portal).
import RootNavigator from './src/navigation/RootNavigator';
// Youth-portal preview: swap <RootNavigator /> for <YouthNavigator /> below.
import YouthNavigator from './src/navigation/YouthNavigator';
import { VolatileTranscriptProvider } from './src/context/VolatileTranscriptContext';
import { YouthSessionProvider } from './src/context/YouthSessionContext';
import { palette } from './src/theme/theme';

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: palette.forestNight },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <VolatileTranscriptProvider>
          <YouthSessionProvider>
            <NavigationContainer theme={navTheme}>
              <StatusBar style="light" />
              {/* Worker/volunteer side. For youth preview use: <YouthNavigator /> */}
              <YouthNavigator />
            </NavigationContainer>
          </YouthSessionProvider>
        </VolatileTranscriptProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
