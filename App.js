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

// --- Worker/volunteer app (default). Re-enable this line to restore it. ---
// import RootNavigator from './src/navigation/RootNavigator';
// --- TEMP: youth-portal preview. Swap back to RootNavigator when done. ---
import YouthNavigator from './src/navigation/YouthNavigator';
import { VolatileTranscriptProvider } from './src/context/VolatileTranscriptContext';
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
          <NavigationContainer theme={navTheme}>
            <StatusBar style="light" />
            {/* TEMP youth-portal preview — was <RootNavigator /> */}
            <YouthNavigator />
          </NavigationContainer>
        </VolatileTranscriptProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
