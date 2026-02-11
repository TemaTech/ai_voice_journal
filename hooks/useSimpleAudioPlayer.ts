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
  const lastPlaybackTimeRef = useRef<number>(Date.now()); // 再生終了時刻（エコーキャンセル用）
  const isAiPlayingRef = useRef<boolean>(false); // AI発話中フラグ（より厳密な管理用）
  
  // 割り込みフラグ（playAudioの即時ブロック用）
  // interruptAI()でtrueにし、次のターン開始時にfalseに戻す
  const isInterruptedRef = useRef<boolean>(false);
  
  // 停止処理中フラグ（stopPlayingの二重実行防止）
  const isStoppingRef = useRef<boolean>(false);

  
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
    if (pendingChunksRef.current > 0 || isAiPlayingRef.current) {
      return;
    }

    // 再生終了直後もVADをスキップ（残響・テイルエコー・レイテンシー対策）
    // 800ms -> 1500ms に延長してテイルエコーを確実に回避
    if (Date.now() - lastPlaybackTimeRef.current < 1500) {
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
      // 割り込み中は音声チャンクを処理しない
      // このフラグはinterruptAI()でtrue、interruptAI完了後にfalseにリセットされる
      if (isInterruptedRef.current) {
        return;
      }
      
      // ターン開始時（まだ再生中でない場合）、オーディオエンジンの状態をリセット
      // pendingChunksRef（Ref = 同期更新）のみで判定（React stateのisPlayingは非同期で古い値の場合がある）
      if (pendingChunksRef.current === 0) {
        try {
          // エンジンの再構成（fire-and-forget: awaitしない）
          // awaitすると最初のチャンクの再生が遅延し、音声途切れの原因になる
          ExpoPlayAudioStream.setSoundConfig({
            sampleRate: 24000 as any,
            playbackMode: 'voiceProcessing',
          }).catch((e: Error) => {
            if (!isInterruptedRef.current) {
              console.error('SimpleAudioPlayer: Engine config failed', e);
            }
          });
        } catch (e) {
          console.error('SimpleAudioPlayer: Engine reset failed', e);
        }
      }

      // 再度チェック（上記の非同期処理中に割り込みが入った可能性）
      if (isInterruptedRef.current) {
        return;
      }

      pendingChunksRef.current += 1;
      setIsPlaying(true);
      isAiPlayingRef.current = true; // AI発話開始

      
      // データ長チェック（空データやヘッダーのみのデータを弾く）
      if (!base64Audio || base64Audio.length < 100) {
        pendingChunksRef.current = Math.max(0, pendingChunksRef.current - 1);
         if (pendingChunksRef.current === 0) {
          setIsPlaying(false);
          lastPlaybackTimeRef.current = Date.now(); // 終了時刻更新
        }
        return;
      }

      // ネイティブのplaySoundを直接呼び出し
      await ExpoPlayAudioStream.playSound(
        base64Audio, 
        turnIdRef.current,
        'pcm_s16le' // Gemini APIは16bit PCMを返す
      );
      
      // 再生成功後もデクリメント
      pendingChunksRef.current = Math.max(0, pendingChunksRef.current - 1);
      if (pendingChunksRef.current === 0) {
        setIsPlaying(false);
        lastPlaybackTimeRef.current = Date.now(); // 終了時刻更新
      }
      
    } catch (error) {
      console.error('SimpleAudioPlayer: Failed to play audio', error);
      pendingChunksRef.current = Math.max(0, pendingChunksRef.current - 1);
      if (pendingChunksRef.current === 0) {
        setIsPlaying(false);
        lastPlaybackTimeRef.current = Date.now(); // 終了時刻更新
      }
    }
  }, []);

  // 再生停止 - ユーザー割り込み時などに使用
  const stopPlaying = useCallback(async () => {
    // 二重実行防止
    if (isStoppingRef.current) {
      return;
    }
    isStoppingRef.current = true;
    
    try {
      // まず状態をリセット（ネイティブ呼び出し前に行うことで、
      // 並行して走っているplayAudioが新たなチャンクを送らないようにする）
      pendingChunksRef.current = 0;
      setIsPlaying(false);
      isAiPlayingRef.current = false;

      // キューのクリアと停止は個別にtry-catchし、一方が失敗しても他方を実行
      try {
        await ExpoPlayAudioStream.clearSoundQueueByTurnId(turnIdRef.current);
      } catch (e) {
        console.error('SimpleAudioPlayer: Failed to clear queue', e);
      }
      
      try {
        await ExpoPlayAudioStream.stopSound();
      } catch (e) {
        console.error('SimpleAudioPlayer: Failed to stop sound', e);
      }

      console.log('SimpleAudioPlayer: Playback stopped (interrupt)');
    } catch (error) {
      console.error('SimpleAudioPlayer: Failed to stop playing', error);
    } finally {
      isStoppingRef.current = false;
    }
  }, []);

  // Mute State
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false); // Ref for access in callbacks

  // Mute toggle
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newVal = !prev;
      isMutedRef.current = newVal;
      return newVal;
    });
  }, []);

  // 録音開始
  const startRecording = useCallback(async () => {
    try {
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
            // ミュート中は処理をスキップ (Refを使用)
            if (isMutedRef.current) {
              return;
            }
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
  }, [onAudioData, sampleRate, processVAD]); // Removed isMuted from dependency array

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
    
    // 即座に割り込みフラグをセット（playAudioの新規チャンクを即時ブロック）
    // ネイティブ側のstopPlayingが完了する前でも、JS側で新しいチャンクの送信を防ぐ
    isInterruptedRef.current = true;
    
    await stopPlaying();
    
    // 新しいターンIDを生成
    turnIdRef.current = `turn-${Date.now()}`;
    
    // 割り込みフラグをリセット（次のターンの音声を受け入れる準備）
    // stopPlaying完了後にリセットすることで、割り込み中の音声チャンクを確実にブロック
    isInterruptedRef.current = false;
    
    // ネイティブ側の割り込みフラグも解除（次のplay()呼び出しが受け入れられるように）
    try {
      ExpoPlayAudioStream.resumeSound();
    } catch (e) {
      console.error('SimpleAudioPlayer: resumeSound failed', e);
    }
    
    console.log('SimpleAudioPlayer: Interrupt complete, ready for next turn');
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
        isAiPlayingRef.current = false; // ターン完了と共にAI発話フラグを解除
        lastPlaybackTimeRef.current = Date.now(); // 念のため時刻更新
      }
    }, 500);
  }, []);

  // 新しいターンを開始
  const startNewTurn = useCallback(() => {
    turnIdRef.current = `turn-${Date.now()}`;
    pendingChunksRef.current = 0;
    setIsPlaying(false);
    isAiPlayingRef.current = false;
    isInterruptedRef.current = false; // 割り込みフラグもリセット
  }, []);

  return {
    isRecording,
    isPlaying,
    isSpeaking,  // ユーザー発話中フラグ（新規追加）
    isMuted,     // ミュート状態
    toggleMute,  // ミュート切り替え
    startRecording,
    stopRecording,
    playAudio,
    stopPlaying,
    interruptAI,
    onTurnComplete,
    startNewTurn,
  };
};
