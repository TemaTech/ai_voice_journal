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
import "../global.css";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="talk" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
