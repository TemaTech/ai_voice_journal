// Buffer polyfill for React Native
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

// Reanimated警告を無効化（デバッグ中のログを見やすくするため）
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
configureReanimatedLogger({
  level: ReanimatedLogLevel.error,
  strict: false,
});

import { Stack } from "expo-router";
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '../context/ThemeContext';
import "../global.css";

function RootLayoutContent() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="talk" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}
