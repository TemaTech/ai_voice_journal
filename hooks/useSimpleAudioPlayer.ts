// hooks/useSimpleAudioPlayer.ts
// リアルタイム音声再生・録音フック
// VAD（Voice Activity Detection）統合、割り込み機能強化

import { AudioDataEvent, ExpoPlayAudioStream, RecordingConfig } from '@mykin-ai/expo-audio-stream';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const isNativeRecordingRef = useRef<boolean>(false); // ネイティブの録音状態を同期管理
  const isStartingRef = useRef<boolean>(false); // 開始処理中フラグ（連打防止）
  
  // 再生中チャンク数を追跡（isPlaying状態管理用）
  const pendingChunksRef = useRef<number>(0);
  const lastPlaybackTimeRef = useRef<number>(Date.now()); // 再生終了時刻（エコーキャンセル用）
  const isAiPlayingRef = useRef<boolean>(false); // AI発話中フラグ（より厳密な管理用）
  
  // 再生終了予定時刻（VADガード用） - バイト数から計算
  const estimatedPlaybackEndTimeRef = useRef<number>(0);
  
  // ターン初期化フラグ（setSoundConfig の多重呼び出し防止用）
  // ★ pendingChunksRef === 0 を初期化ゲートに使うと、複数の並行 playAudio 呼び出しが
  //   すべてゲートを通過してしまうレースコンディションが発生するため、独立したフラグを使用
  const turnInitializedRef = useRef<boolean>(false);
  
  // onTurnComplete のタイマーID（前のターンのタイマーが次のターン中に発火するのを防ぐ）
  const turnCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 割り込みフラグ（playAudioの即時ブロック用）
  // interruptAI()でtrueにし、次のターン開始時にfalseに戻す
  const isInterruptedRef = useRef<boolean>(false);
  
  // ネイティブSDK（ExpoPlayAudioStream）の競合防止用プロミス
  // setSoundConfig実行中にplaySoundが呼ばれるとネイティブ側でクラッシュするため、完了を待つ
  const engineConfigPromiseRef = useRef<Promise<void> | null>(null);
  
  // 停止処理中フラグ（stopPlayingの二重実行防止）
  const isStoppingRef = useRef<boolean>(false);

  
  // VAD用タイマー
  const speechStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasSpeakingRef = useRef<boolean>(false);
  
  // ★ 追加: ノイズゲート用状態
  // Geminiへの音声送信を制御するための変数群
  const isStreamingRef = useRef<boolean>(false); // ゲートが開いているか（Gemini送信中か）
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // ゲートを閉じるタイマー
  const audioBufferRef = useRef<string[]>([]); // ゲートが閉じる前の音声を貯めておくバッファ
  const PRE_RECORD_CHUNKS = 5; // 何チャンク前（約500ms分）から遡って送信するか
  const GATE_CLOSING_DELAY_MS = 1200; // 閾値を下回ってからゲートを閉じるまでの猶予（息継ぎ対策）
  // ゲイン調整: 小さすぎる音は切り捨て（0.010以下はノイズとみなす）
  const GATE_THRESHOLD = 0.010;
  
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
    // バイト数から計算した厳密な終了予定時刻 + マージン(500ms)でガード
    const now = Date.now();
    if (now < estimatedPlaybackEndTimeRef.current + 500) {
      return;
    }

    // フォールバック: 従来の時間ベースガード (念のため残すが、上記でほぼカバーされるはず)
    if (now - lastPlaybackTimeRef.current < 800) {
       return;
    }
    
    // ... (rest of processVAD)

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

  // マウント時のクリーンアップ（念のため前回の録音を停止）
  useEffect(() => {
    (async () => {
       try {
         await ExpoPlayAudioStream.stopMicrophone();
         console.log('SimpleAudioPlayer: Initial cleanup done');
       } catch(e) {/* ignore */}
    })();
    
    return () => {
      // アンマウント時も念のため
      ExpoPlayAudioStream.stopMicrophone().catch(() => {});
    };
  }, []);

  // AI音声再生（シンプルな即時再生）
  const playAudio = useCallback(async (base64Audio: string) => {
    try {
      // 割り込み中は音声チャンクを処理しない
      if (isInterruptedRef.current) {
        return;
      }
      
      // ターン開始時初期化（turnInitializedRef で多重実行を防止）
      // ★ setSoundConfig() は各ターンで1回だけ呼ぶ。
      //   interruptSound() 後にネイティブエンジンの設定がリセットされる可能性があるため、
      //   毎ターン再設定が必要。ただし、turnInitializedRef で保護することで
      //   複数の並行 playAudio 呼び出しによる多重呼び出し（レースコンディション）を防止。
      // ★ 追加: native側で setSoundConfig 中に playSound が並列実行されると
      //   AVAudioEngine がクラッシュ (EXC_BAD_ACCESS) するため、完了を Promise で待機する。
      if (!turnInitializedRef.current) {
        if (!engineConfigPromiseRef.current) {
          engineConfigPromiseRef.current = (async () => {
            // ★ 前のターンのonTurnCompleteタイマーをキャンセル
            if (turnCompleteTimerRef.current) {
              clearTimeout(turnCompleteTimerRef.current);
              turnCompleteTimerRef.current = null;
            }
            
            try {
              await ExpoPlayAudioStream.setSoundConfig({
                sampleRate: 24000 as any,
                playbackMode: 'conversation',
              });
            } catch (e) {
              console.error('SimpleAudioPlayer: Engine config failed', e);
            }
            // 推定終了時刻をリセット（現在時刻からスタート）
            estimatedPlaybackEndTimeRef.current = Date.now();
            console.log('SimpleAudioPlayer: New turn started, engine configured');
            
            // 設定が完了してからフラグを立てる
            turnInitializedRef.current = true;
          })();
        }
        // 並列で playAudio が呼ばれたチャンクは、最初の初期化処理が完了するまでここでブロックされる
        await engineConfigPromiseRef.current;
      }

      // 再度チェック
      if (isInterruptedRef.current) {
        return;
      }

      pendingChunksRef.current += 1;
      setIsPlaying(true);
      isAiPlayingRef.current = true; // AI発話開始

      // データ長チェック
      if (!base64Audio || base64Audio.length < 100) {
        pendingChunksRef.current = Math.max(0, pendingChunksRef.current - 1);
        if (pendingChunksRef.current === 0) {
          setIsPlaying(false);
          lastPlaybackTimeRef.current = Date.now();
        }
        return;
      }

      // 推定再生時間の更新
      const byteSize = base64Audio.length * 0.75;
      const durationMs = (byteSize / 32000) * 1000; // 16kHz換算（安全マージン）
      estimatedPlaybackEndTimeRef.current = Math.max(Date.now(), estimatedPlaybackEndTimeRef.current) + durationMs;

      // ネイティブのplaySoundを直接呼び出し
      await ExpoPlayAudioStream.playSound(
        base64Audio, 
        turnIdRef.current,
        'pcm_s16le' // Gemini APIは16bit PCMを返す
      );
      
      // 再生成功後にデクリメント
      pendingChunksRef.current = Math.max(0, pendingChunksRef.current - 1);
      if (pendingChunksRef.current === 0) {
        setIsPlaying(false);
        lastPlaybackTimeRef.current = Date.now();
      }
      
    } catch (error) {
      console.error('SimpleAudioPlayer: ★ playSound FAILED', error);
      pendingChunksRef.current = Math.max(0, pendingChunksRef.current - 1);
      if (pendingChunksRef.current === 0) {
        setIsPlaying(false);
        lastPlaybackTimeRef.current = Date.now();
      }
    }
  }, []);

  // 再生停止 - ユーザー割り込み時などに使用
  // ★ stopSound()ではなくinterruptSound()を使用する。
  //   stopSound()はネイティブプレイヤーを完全に破棄するため、
  //   以降のplaySound()呼び出しがサイレントに無視される。
  //   interruptSound()はプレイヤーを維持したまま再生を中断する。
  const stopPlaying = useCallback(async () => {
    // 二重実行防止
    if (isStoppingRef.current) {
      return;
    }
    isStoppingRef.current = true;
    
    try {
      // まず状態をリセット（並行するplayAudioの新規チャンクをブロック）
      pendingChunksRef.current = 0;
      setIsPlaying(false);
      isAiPlayingRef.current = false;

      // キューのクリアと割り込み停止は個別にtry-catchし、一方が失敗しても他方を実行
      try {
        await ExpoPlayAudioStream.clearSoundQueueByTurnId(turnIdRef.current);
      } catch (e) {
        console.error('SimpleAudioPlayer: Failed to clear queue', e);
      }
      
      try {
        // ★ interruptSound(): プレイヤーを維持したまま再生を中断
        await ExpoPlayAudioStream.interruptSound();
      } catch (e) {
        console.error('SimpleAudioPlayer: Failed to interrupt sound', e);
      }

      console.log('SimpleAudioPlayer: Playback interrupted (player preserved)');
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
    // 連打防止
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    // ネイティブ状態チェック：前の録音が残っていたら強制停止
    if (isNativeRecordingRef.current || isRecording) {
      console.warn('SimpleAudioPlayer: Previous recording detected, stopping first...');
      try {
        if (subscriptionRef.current) {
          subscriptionRef.current.remove();
          subscriptionRef.current = null;
        }
        await ExpoPlayAudioStream.stopMicrophone(); // awaitで完了を待つ
        isNativeRecordingRef.current = false;
        setIsRecording(false);
        // 念のため少し待機（ネイティブのリソース解放待ち）
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error('SimpleAudioPlayer: Failed to force stop previous recording', e);
      }
    }

    // try-catchの外で定義（リトライ時に参照可能にするため）
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
          
          // ★ 通知: ノイズゲートの強制クローズ（ミュート期間）は、自然なBarge-in（割り込み発話）や
          // 相槌を妨害するため撤去しました。AEC（エコーキャンセル）が有効になっているため問題ありません。
          
          // 現在のチャンクの音量を計算
          const currentLevel = calculateAudioLevel(event.data);
          
          if (currentLevel > GATE_THRESHOLD) {
            // --- 音量が閾値を超えた場合 ---
            
            // ゲートを開く（ストリーミング開始）
            if (!isStreamingRef.current) {
              console.log(`SimpleAudioPlayer: Noise gate opened (Level: ${currentLevel.toFixed(4)})`);
              isStreamingRef.current = true;
              
              // ゲートが開いた瞬間、バッファに貯めていた過去の音声を一気に送信（頭切れ防止）
              audioBufferRef.current.forEach(bufferedChunk => {
                onAudioData(bufferedChunk);
              });
            }
            
            // 現在のチャンクも送信
            onAudioData(event.data);
            
            // ゲートを閉じるタイマーをリセット（延長）
            if (streamingTimerRef.current) {
              clearTimeout(streamingTimerRef.current);
            }
            streamingTimerRef.current = setTimeout(() => {
              console.log('SimpleAudioPlayer: Noise gate closed (Silence timeout)');
              isStreamingRef.current = false;
              streamingTimerRef.current = null;
              audioBufferRef.current = []; // 閉じた後はバッファをクリア
            }, GATE_CLOSING_DELAY_MS);
            
          } else {
            // --- 音量が閾値を下回った場合（無音・ノイズ） ---
            
            if (isStreamingRef.current) {
              // ゲートが開いている間（息継ぎ中など）は、声がなくても送信し続ける
              onAudioData(event.data);
            } else {
              // ゲートが閉じている間は送信せず、過去の音声としてバッファに貯める
              audioBufferRef.current.push(event.data);
              // バッファが溢れたら古いものから捨てる
              if (audioBufferRef.current.length > PRE_RECORD_CHUNKS) {
                audioBufferRef.current.shift();
              }
              // ★ 修正: GeminiのVAD（無音検知）が働くように、
              // 無音（Base64のゼロ='A'の連続）のダミーデータを実際の長さ分だけ送信し続ける
              // ※ Base64のデコード仕様上、配列長がズレて PCM(16bit=2byteペア) が壊れるのを防ぐため、
              // 元の音声データが持つ「=」などのパディング文字を抽出し末尾に付与する。
              let padLen = 0;
              if (event.data.endsWith('==')) {
                padLen = 2;
              } else if (event.data.endsWith('=')) {
                padLen = 1;
              }
              const silenceData = 'A'.repeat(event.data.length - padLen) + '='.repeat(padLen);
              onAudioData(silenceData);
            }
          }
        }
      },
    };

    try {
      // 新しいターンIDを生成（新しい会話ターン開始）
      turnIdRef.current = `turn-${Date.now()}`;
      
      const result = await ExpoPlayAudioStream.startMicrophone(recordingConfig);

      if (result.subscription) {
        subscriptionRef.current = result.subscription;
      }
      isNativeRecordingRef.current = true; // 成功後にフラグセット
      setIsRecording(true);
      console.log('SimpleAudioPlayer: Microphone started');
      
    } catch (error: any) {
      // エラー時のリトライロジック
      if (error?.message?.includes('Recording is already in progress')) {
        console.warn('SimpleAudioPlayer: Recording already in progress error. Retrying with delay...');
        try {
          // 強制停止してリソース解放
          await ExpoPlayAudioStream.stopMicrophone();
          isNativeRecordingRef.current = false;
          setIsRecording(false);
          
          // 待機時間を延長 (1000ms)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          console.log('SimpleAudioPlayer: Retrying startMicrophone...');
          const result = await ExpoPlayAudioStream.startMicrophone(recordingConfig);
           if (result.subscription) {
            subscriptionRef.current = result.subscription;
          }
          isNativeRecordingRef.current = true;
          setIsRecording(true);
          console.log('SimpleAudioPlayer: Microphone restarted (Recovered)');
          return;
        } catch (retryError) {
           console.error('SimpleAudioPlayer: Retry failed', retryError);
           // リトライ失敗時はフラグを確実に落とす
           isNativeRecordingRef.current = false; 
           setIsRecording(false);
        }
      } else {
        console.error('SimpleAudioPlayer: Failed to start microphone', error);
      }
    } finally {
      isStartingRef.current = false;
    }
  }, [onAudioData, sampleRate, processVAD, isRecording]); // Removed isMuted from dependency array

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
      
      // ★ 追加: ノイズゲートのクリーンアップ
      if (streamingTimerRef.current) {
        clearTimeout(streamingTimerRef.current);
        streamingTimerRef.current = null;
      }
      isStreamingRef.current = false;
      audioBufferRef.current = [];
      
      await ExpoPlayAudioStream.stopMicrophone();
      isNativeRecordingRef.current = false; // フラグクリア
      setIsRecording(false);
      console.log('SimpleAudioPlayer: Microphone stopped');
    } catch (error) {
      console.error('SimpleAudioPlayer: Failed to stop microphone', error);
      // エラーでも状態はクリアしておく（不整合防止）
      isNativeRecordingRef.current = false;
      setIsRecording(false);
    }
  }, []);

  // ユーザーがAIに割り込んだ時（Barge-in）
  // AIの発話を中断し、新しいターンを開始
  const interruptAI = useCallback(async () => {
    console.log('SimpleAudioPlayer: ★ Interrupting AI (barge-in)');
    
    // 即座に割り込みフラグをセット（playAudioの新規チャンクを即時ブロック）
    isInterruptedRef.current = true;
    
    // interruptSound()でプレイヤーを維持したまま再生を中断
    await stopPlaying();
    
    // ★ 前のターンのonTurnCompleteタイマーをキャンセル
    if (turnCompleteTimerRef.current) {
      clearTimeout(turnCompleteTimerRef.current);
      turnCompleteTimerRef.current = null;
    }
    
    // 新しいターンIDを生成
    turnIdRef.current = `turn-${Date.now()}`;
    
    // ★ turnInitializedRef をリセット（次のターンの初期化を許可）
    turnInitializedRef.current = false;
    engineConfigPromiseRef.current = null;
    
    // 割り込みフラグをリセット（次のターンの音声を受け入れる準備）
    isInterruptedRef.current = false;
    
    // ネイティブ側の割り込みフラグも解除（次のplaySound()が受け入れられるように）
    try {
      ExpoPlayAudioStream.resumeSound();
    } catch (e) {
      console.error('SimpleAudioPlayer: resumeSound failed', e);
    }
    
    console.log('SimpleAudioPlayer: ★ Interrupt complete, player ready for next turn');
  }, [stopPlaying]);

  // AIのターンが完了した時
  // isPlayingの状態を適切に更新
  const onTurnComplete = useCallback(() => {
    // ターン完了 = AIの音声送信は終了。
    // ネイティブ側のキューにまだ音声が残っている可能性があるため、
    // 少し待ってから状態を更新する。
    // ★ 重要: isAiPlayingRef は条件に関わらず必ずリセットする。
    
    // ★ 前のタイマーがあればキャンセル（多重発火防止）
    if (turnCompleteTimerRef.current) {
      clearTimeout(turnCompleteTimerRef.current);
    }
    
    turnCompleteTimerRef.current = setTimeout(() => {
      pendingChunksRef.current = 0; // 強制リセット（不整合防止）
      setIsPlaying(false);
      isAiPlayingRef.current = false;
      lastPlaybackTimeRef.current = Date.now();
      // ★ turnInitializedRef をリセット（次のターンの初期化を許可）
      turnInitializedRef.current = false;
      engineConfigPromiseRef.current = null;
      turnCompleteTimerRef.current = null;
    }, 500);
  }, []);

  // 新しいターンを開始
  const startNewTurn = useCallback(() => {
    turnIdRef.current = `turn-${Date.now()}`;
    pendingChunksRef.current = 0;
    setIsPlaying(false);
    isAiPlayingRef.current = false;
    isInterruptedRef.current = false; // 割り込みフラグもリセット
    turnInitializedRef.current = false;
    engineConfigPromiseRef.current = null;
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
