// hooks/useSimpleAudioPlayer.ts
// リアルタイム音声再生・録音フック
// VAD（Voice Activity Detection）統合、割り込み機能強化

import { AudioDataEvent, ExpoPlayAudioStream, RecordingConfig } from '@mykin-ai/expo-audio-stream';
import { useCallback, useRef, useState } from 'react';

interface UseSimpleAudioPlayerOptions {
  onAudioData: (base64Audio: string) => void;
  sampleRate?: number;
  // VADコールバック（音声活動検出）
  onSpeechStart?: () => void;   // ユーザー発話開始
  onSpeechEnd?: () => void;     // ユーザー発話終了
  onSilence?: () => void;       // 無音検出（タイムアウト用）
  // 設定
  speechThreshold?: number;     // 発話検出の音量閾値（0-1、デフォルト0.02）
  silenceThreshold?: number;    // 無音とみなす音量閾値（0-1、デフォルト0.01）
  speechDebounceMs?: number;    // 発話開始のデバウンス時間（ms）
  silenceDebounceMs?: number;   // 発話終了のデバウンス時間（ms）
}

export const useSimpleAudioPlayer = (options: UseSimpleAudioPlayerOptions) => {
  const { 
    onAudioData, 
    sampleRate = 16000,
    onSpeechStart,
    onSpeechEnd,
    onSilence,
    speechThreshold = 0.02,
    silenceThreshold = 0.01,
    speechDebounceMs = 100,
    silenceDebounceMs = 300,
  } = options;
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);  // ユーザー発話中フラグ
  
  // ターンID管理 - AIの発話単位でグループ化
  const turnIdRef = useRef<string>(`turn-${Date.now()}`);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  
  // 再生中チャンク数を追跡（isPlaying状態管理用）
  const pendingChunksRef = useRef<number>(0);
  
  // VAD用タイマー
  const speechStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasSpeakingRef = useRef<boolean>(false);
  
  // 音量計算ヘルパー（Base64 PCM 16bit -> RMS音量）
  const calculateAudioLevel = useCallback((base64Data: string): number => {
    try {
      // Base64デコード
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      
      // 16bit PCMとしてパース
      const samples = new Int16Array(bytes.buffer);
      if (samples.length === 0) return 0;
      
      // RMS（Root Mean Square）計算
      let sumSquares = 0;
      for (let i = 0; i < samples.length; i++) {
        const normalized = samples[i] / 32768;  // -1.0 to 1.0
        sumSquares += normalized * normalized;
      }
      
      return Math.sqrt(sumSquares / samples.length);
    } catch (e) {
      return 0;
    }
  }, []);

  // VAD処理
  const processVAD = useCallback((base64Audio: string) => {
    // AI発話中はVADをスキップ（エコーバック誤検出防止）
    if (pendingChunksRef.current > 0) {
      return;
    }
    
    const level = calculateAudioLevel(base64Audio);
    const isSpeakingNow = level > speechThreshold;
    const isSilentNow = level < silenceThreshold;
    
    if (isSpeakingNow && !wasSpeakingRef.current) {
      // 発話開始検出（デバウンス）
      if (speechEndTimerRef.current) {
        clearTimeout(speechEndTimerRef.current);
        speechEndTimerRef.current = null;
      }
      
      if (!speechStartTimerRef.current) {
        speechStartTimerRef.current = setTimeout(() => {
          wasSpeakingRef.current = true;
          setIsSpeaking(true);
          onSpeechStart?.();
          speechStartTimerRef.current = null;
        }, speechDebounceMs);
      }
    } else if (isSilentNow && wasSpeakingRef.current) {
      // 発話終了検出（デバウンス）
      if (speechStartTimerRef.current) {
        clearTimeout(speechStartTimerRef.current);
        speechStartTimerRef.current = null;
      }
      
      if (!speechEndTimerRef.current) {
        speechEndTimerRef.current = setTimeout(() => {
          wasSpeakingRef.current = false;
          setIsSpeaking(false);
          onSpeechEnd?.();
          speechEndTimerRef.current = null;
        }, silenceDebounceMs);
      }
    }
  }, [calculateAudioLevel, speechThreshold, silenceThreshold, speechDebounceMs, silenceDebounceMs, onSpeechStart, onSpeechEnd]);

  // AI音声再生（シンプルな即時再生）
  const playAudio = useCallback(async (base64Audio: string) => {
    try {
      pendingChunksRef.current += 1;
      setIsPlaying(true);
      
      // ネイティブのplaySoundを直接呼び出し
      await ExpoPlayAudioStream.playSound(
        base64Audio, 
        turnIdRef.current,
        'pcm_s16le' // Gemini APIは16bit PCMを返す
      );
      
    } catch (error) {
      console.error('SimpleAudioPlayer: Failed to play audio', error);
      pendingChunksRef.current = Math.max(0, pendingChunksRef.current - 1);
      if (pendingChunksRef.current === 0) {
        setIsPlaying(false);
      }
    }
  }, []);

  // 再生停止 - ユーザー割り込み時などに使用
  const stopPlaying = useCallback(async () => {
    try {
      // 現在のターンのキューをクリア
      await ExpoPlayAudioStream.clearSoundQueueByTurnId(turnIdRef.current);
      await ExpoPlayAudioStream.stopSound();
      pendingChunksRef.current = 0;
      setIsPlaying(false);
      console.log('SimpleAudioPlayer: Playback stopped (interrupt)');
    } catch (error) {
      console.error('SimpleAudioPlayer: Failed to stop playing', error);
    }
  }, []);

  // 録音開始
  const startRecording = useCallback(async () => {
    try {
      console.log('SimpleAudioPlayer: Starting microphone');
      
      // 新しいターンIDを生成（新しい会話ターン開始）
      turnIdRef.current = `turn-${Date.now()}`;
      
      const recordingConfig: RecordingConfig = {
        sampleRate: sampleRate as 16000 | 44100 | 48000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 100, // 100msごとにコールバック
        enableProcessing: true, // AEC有効
        onAudioStream: async (event: AudioDataEvent) => {
          if (event.data && typeof event.data === 'string' && event.data.length > 0) {
            // VAD処理
            processVAD(event.data);
            // Geminiへ送信
            onAudioData(event.data);
          }
        },
      };

      const result = await ExpoPlayAudioStream.startMicrophone(recordingConfig);

      if (result.subscription) {
        subscriptionRef.current = result.subscription;
      }
      setIsRecording(true);
      console.log('SimpleAudioPlayer: Microphone started');
      
    } catch (error) {
      console.error('SimpleAudioPlayer: Failed to start microphone', error);
    }
  }, [onAudioData, sampleRate, processVAD]);

  // 録音停止
  const stopRecording = useCallback(async () => {
    try {
      // VADタイマーをクリア
      if (speechStartTimerRef.current) {
        clearTimeout(speechStartTimerRef.current);
        speechStartTimerRef.current = null;
      }
      if (speechEndTimerRef.current) {
        clearTimeout(speechEndTimerRef.current);
        speechEndTimerRef.current = null;
      }
      wasSpeakingRef.current = false;
      setIsSpeaking(false);
      
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      await ExpoPlayAudioStream.stopMicrophone();
      setIsRecording(false);
      console.log('SimpleAudioPlayer: Microphone stopped');
    } catch (error) {
      console.error('SimpleAudioPlayer: Failed to stop microphone', error);
    }
  }, []);

  // ユーザーがAIに割り込んだ時（Barge-in）
  // AIの発話を中断し、新しいターンを開始
  const interruptAI = useCallback(async () => {
    console.log('SimpleAudioPlayer: Interrupting AI');
    await stopPlaying();
    // 新しいターンIDを生成
    turnIdRef.current = `turn-${Date.now()}`;
  }, [stopPlaying]);

  // AIのターンが完了した時
  // isPlayingの状態を適切に更新
  const onTurnComplete = useCallback(() => {
    // ターン完了時点で保留中のチャンクがなければ再生終了
    // 実際にはネイティブ側のキューが空になった時点で終了するので
    // 少し待ってから状態を更新
    setTimeout(() => {
      if (pendingChunksRef.current === 0) {
        setIsPlaying(false);
      }
    }, 500);
  }, []);

  // 新しいターンを開始
  const startNewTurn = useCallback(() => {
    turnIdRef.current = `turn-${Date.now()}`;
    pendingChunksRef.current = 0;
    setIsPlaying(false);
  }, []);

  return {
    isRecording,
    isPlaying,
    isSpeaking,  // ユーザー発話中フラグ（新規追加）
    startRecording,
    stopRecording,
    playAudio,
    stopPlaying,
    interruptAI,
    onTurnComplete,
    startNewTurn,
  };
};
