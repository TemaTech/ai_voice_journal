import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import { Audio as ExpoAudio } from 'expo-av';
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

        // 2. expo-avによるオーディオモード設定（スピーカー出力を強制するため）
        // allowsRecordingIOS: true にすると通常はレシーバー（耳元）になるが、
        // これを適切に設定することでスピーカーから出ることを期待する。
        // ※iOSでは VoiceProcessing モードだと強制的にレシーバーになる場合があるが、
        // expo-avの設定で改善するか試みる。
        await ExpoAudio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          // interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        // 3. セッション設定 (VoiceProcessing for AEC & Full Duplex)
        // AEC（エコーキャンセル）のために必要
        await ExpoPlayAudioStream.setSoundConfig({
          sampleRate: 24000 as any,
          playbackMode: 'voiceProcessing',
        });

        console.log('AudioSession: Setup complete (voiceProcessing mode + expo-av config)');
        setIsReady(true);
      } catch (error) {
        console.error('AudioSession: Setup failed', error);
      }
    };

    setupSession();
  }, []);

  return { isReady };
};
