import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import { useEffect, useState } from 'react';

export const useAudioSession = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const setupSession = async () => {
      try {
        // 1. マイク権限の要求
        const perm = await ExpoPlayAudioStream.requestPermissionsAsync();
        if (perm.status !== 'granted') {
          console.error('AudioSession: Microphone permission denied');
          return;
        }

        // 2. セッション設定 (VoiceProcessing for AEC & Full Duplex)
        // This is crucial for echo cancellation and allowing recording while playing.
        await ExpoPlayAudioStream.setSoundConfig({
          sampleRate: 24000 as any,
          playbackMode: 'voiceProcessing',
        });

        console.log('AudioSession: Setup complete (voiceProcessing mode)');
        setIsReady(true);
      } catch (error) {
        console.error('AudioSession: Setup failed', error);
      }
    };

    setupSession();

    // Cleanup usually not needed for session itself as it persists, 
    // but we might want to reset on unmount if needed. 
    // For now, keep it simple.
  }, []);

  return { isReady };
};
