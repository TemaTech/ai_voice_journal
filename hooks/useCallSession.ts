// hooks/useCallSession.ts
// 通話セッション全体を管理する中核フック
// 状態マシン、割り込み、無音タイムアウトを一元管理

import { useCallback, useEffect, useRef, useState } from 'react';
import { GeminiLiveService } from '../services/gemini-live';
import { getGeminiRestService } from '../services/gemini-rest';
import { RecoveryService } from '../services/recovery';
import { StorageService } from '../services/storage';
import { CallSessionConfig, CallSessionState, CallState, ConversationLog } from '../types/callSession';
import { generateSystemInstruction } from '../utils/ai-prompt';
import { useAudioSession } from './useAudioSession';
import { useSimpleAudioPlayer } from './useSimpleAudioPlayer';

const LIGHT_SILENCE_TIMEOUT_MS = 15000;  // 15秒で軽い合いの手（ユーザーが考える時間を確保）
const DEEP_SILENCE_TIMEOUT_MS = 30000;   // 30秒で問いかけ

interface UseCallSessionReturn extends CallSessionState {
  // アクション
  connect: () => void;
  disconnect: () => void;
  endConversation: () => Promise<{title: string; summary: string; emotion: string} | null>;
  // ミュート
  isMuted: boolean;
  toggleMute: () => void;
}

export const useCallSession = (config: CallSessionConfig = {}): UseCallSessionReturn => {
  const {
    systemInstruction,
    onConversationLog,
    onStateChange,
    onError,
  } = config;

  // 通話状態
  const [callState, setCallState] = useState<CallState>(CallState.ENDED);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conversationLogs, setConversationLogs] = useState<ConversationLog[]>([]);
  
  // 接続待機フラグ（isAudioReadyがtrueになったら接続する）
  const [pendingConnect, setPendingConnect] = useState(false);
  
  // Refs（クロージャ問題を回避するためにRefを使用）
  const geminiServiceRef = useRef<GeminiLiveService | null>(null);
  const lightSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deepSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callStateRef = useRef<CallState>(CallState.ENDED);
  const isTurnCompletingRef = useRef<boolean>(false); // ターン完了処理中フラグ（競合回避用）
  const isInterruptingRef = useRef<boolean>(false); // 割り込み処理中フラグ（二重割り込み防止）

  const systemInstructionRef = useRef(systemInstruction);
  systemInstructionRef.current = systemInstruction;
  
  // Audio Session（権限・設定）
  const { isReady: isAudioReady } = useAudioSession();
  
  // 状態変更（Refも同時に更新）
  const updateCallState = useCallback((newState: CallState) => {
    const prevState = callStateRef.current;
    if (prevState !== newState) {
      console.log(`CallSession: State change ${prevState} -> ${newState}`);
      callStateRef.current = newState;
      setCallState(newState);
      onStateChange?.(newState, prevState);
    }
  }, [onStateChange]);

  // 無音タイマーをリセット
  const resetSilenceTimer = useCallback(() => {
    if (lightSilenceTimerRef.current) {
      clearTimeout(lightSilenceTimerRef.current);
      lightSilenceTimerRef.current = null;
    }
    if (deepSilenceTimerRef.current) {
      clearTimeout(deepSilenceTimerRef.current);
      deepSilenceTimerRef.current = null;
    }
  }, []);

  // 無音タイマーを開始（2段階対応）
  const startSilenceTimer = useCallback(() => {
    resetSilenceTimer();
    
    // 軽い合いの手
    lightSilenceTimerRef.current = setTimeout(() => {
      console.log('CallSession: Light silence timeout - sending light prompt');
      if (geminiServiceRef.current?.isReady()) {
        geminiServiceRef.current.sendLightSilencePrompt();
        updateCallState(CallState.AI_THINKING);
      }
    }, LIGHT_SILENCE_TIMEOUT_MS);
    
    // 深い問いかけ
    deepSilenceTimerRef.current = setTimeout(() => {
      console.log('CallSession: Deep silence timeout - sending deep prompt');
      if (geminiServiceRef.current?.isReady()) {
        geminiServiceRef.current.sendDeepSilencePrompt();
        updateCallState(CallState.AI_THINKING);
      }
    }, DEEP_SILENCE_TIMEOUT_MS);
  }, [resetSilenceTimer, updateCallState]);

  // Audio Player（コールバックはシンプルにしてRef経由でアクセス）
  const audioPlayerRef = useRef<ReturnType<typeof useSimpleAudioPlayer> | null>(null);
  
  const audioPlayer = useSimpleAudioPlayer({
    onAudioData: (base64Audio: string) => {
      geminiServiceRef.current?.sendAudioChunk(base64Audio);
    },
    sampleRate: 16000,
    onSpeechStart: () => {
      console.log('CallSession: User speech started');
      resetSilenceTimer();
      
      const currentState = callStateRef.current;
      // AI発話中なら割り込み処理
      if (currentState === CallState.AI_TALKING) {
        // 二重割り込み防止
        if (isInterruptingRef.current) {
          console.log('CallSession: Already interrupting, skip');
          return;
        }
        isInterruptingRef.current = true;
        
        // Turn complete処理中の場合もリセット
        // （Turn completeと割り込みが重なると、isTurnCompletingRefが
        //  1.2秒間trueのまま残り、新しいaudioイベントをブロックしてしまう）
        isTurnCompletingRef.current = false;
        
        console.log('CallSession: Interrupting AI');
        geminiServiceRef.current?.sendInterrupt();
        updateCallState(CallState.INTERRUPTED);
        
        // interruptAI()をtry-catchでラップし、失敗してもアプリがクラッシュしないようにする
        // 非同期処理完了後に状態を遷移することで、ネイティブ側の処理と状態の整合性を保つ
        (async () => {
          try {
            await audioPlayerRef.current?.interruptAI();
          } catch (e) {
            console.error('CallSession: interruptAI failed', e);
          } finally {
            isInterruptingRef.current = false;
            // 割り込み完了後にUSER_TALKINGへ遷移
            // （ENDEDに変わっていないことを確認）
            const stateAfterInterrupt = callStateRef.current;
            if (stateAfterInterrupt !== CallState.ENDED) {
              updateCallState(CallState.USER_TALKING);
            }
          }
        })();
      } else {
        updateCallState(CallState.USER_TALKING);
      }
    },
    onSpeechEnd: () => {
      console.log('CallSession: User speech ended');
      updateCallState(CallState.LISTENING);
      startSilenceTimer();
    },
    // VAD設定（誤検出を減らすため閾値を高めに設定）
    speechThreshold: 0.08,    // 0.05 → 0.08 発話検出閾値をさらに上げる
    silenceThreshold: 0.02,   // 無音閾値は維持
    speechDebounceMs: 300,    // 200 → 300 発話開始までの待機時間をさらに延長
    silenceDebounceMs: 500,   // 発話終了判定は維持
  });
  
  // audioPlayerをRefに保存（循環参照回避用）
  audioPlayerRef.current = audioPlayer;

  // 実際の接続処理
  const doConnect = useCallback(async () => {
    if (!isAudioReady) {
      console.log('CallSession: Audio not ready, setting pendingConnect');
      setPendingConnect(true);
      return;
    }
    
    if (geminiServiceRef.current?.isReady()) {
      console.log('CallSession: Already connected');
      return;
    }

    console.log('CallSession: Connecting...');
    updateCallState(CallState.CONNECTING);
    setErrorMessage(null);
    setPendingConnect(false);

    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
    if (!apiKey) {
      console.error('CallSession: API key not configured');
      setErrorMessage('API key not configured');
      onError?.(new Error('API key not configured'));
      return;
    }

    // Load user settings to get voice preference
    const userSettings = await StorageService.getUserSettings();
    const voiceName = userSettings.aiVoice || 'Aoede';
    console.log('CallSession: Using voice:', voiceName);

    const service = new GeminiLiveService({ apiKey, voiceName });
    geminiServiceRef.current = service;

    // イベントリスナー設定
    service.on('connected', () => {
      console.log('CallSession: Connected to Gemini, starting recording...');
      updateCallState(CallState.LISTENING);
      
      // 録音開始
      audioPlayerRef.current?.startRecording();
      
      // 最初のAI挨拶をトリガー（話しやすいきっかけを作る）
      setTimeout(() => {
        console.log('CallSession: Sending initial greeting...');
        // 選択肢を出して話しやすくする（敬語統一）
        service.sendText('こんにちは！今日はどんな1日でしたか？良いことがありましたか？それとも大変でしたか？', false);
        updateCallState(CallState.AI_THINKING);
      }, 1000);
    });

    service.on('disconnected', () => {
      console.log('CallSession: Disconnected');
      updateCallState(CallState.ENDED);
      audioPlayerRef.current?.stopRecording();
      resetSilenceTimer();
    });

    service.on('error', (error) => {
      console.error('CallSession: Error', error);
      setErrorMessage('接続エラーが発生しました');
      onError?.(error);
    });

    service.on('audio', (base64Audio) => {
      // ターン完了処理中は新しい音声イベントを無視（前のターンの残りとみなす）
      if (isTurnCompletingRef.current) {
        return;
      }
      
      // 割り込み処理中も新しい音声イベントを無視
      // （ネイティブのstopPlaying完了前に到着した残りチャンクをブロック）
      if (isInterruptingRef.current) {
        return;
      }
      
      // AI音声を受信 -> 再生
      updateCallState(CallState.AI_TALKING);
      resetSilenceTimer();
      audioPlayerRef.current?.playAudio(base64Audio);
    });

// ... (remove the import)

// ...

    service.on('text', (text) => {
      // AIテキスト受信（ストリーミング断片。確定ログはgemini-live.tsで出力）
      const log: ConversationLog = {
        timestamp: Date.now(),
        speaker: 'ai',
        text,
      };
      setConversationLogs(prev => [...prev, log]);
      RecoveryService.appendLog(log);
    });

    service.on('inputTranscript', (text) => {
      // ユーザー音声の認識結果
      console.log('CallSession: User said:', text);

      const log: ConversationLog = {
        timestamp: Date.now(),
        speaker: 'user',
        text,
      };
      setConversationLogs(prev => [...prev, log]);
      onConversationLog?.(log);
      RecoveryService.appendLog(log);
    });

    service.on('turnComplete', () => {
      console.log('CallSession: Turn complete');
      isTurnCompletingRef.current = true;
      
      // 音声送信を一時停止（残響が次のターンとして誤認識されるのを防ぐ）
      geminiServiceRef.current?.pauseAudioSending();
      
      audioPlayerRef.current?.onTurnComplete();
      
      // 沈黙カウンターをリセット
      geminiServiceRef.current?.resetSilenceCount();
      
      // AI発話完了 -> LISTENINGへ（500ms -> 200msに短縮して応答性を向上）
      setTimeout(() => {
        const currentState = callStateRef.current;
        if (currentState !== CallState.ENDED && currentState !== CallState.USER_TALKING) {
          updateCallState(CallState.LISTENING);
          startSilenceTimer();
        }
        
        // 状態遷移完了後にフラグ解除と音声送信再開（少しバッファを持たせる）
        setTimeout(() => {
          isTurnCompletingRef.current = false;
          geminiServiceRef.current?.resumeAudioSending();
        }, 1000); // 1秒間は残響による誤検知を完全にブロック
        
      }, 200);
    });

    service.on('interrupted', () => {
      console.log('CallSession: AI interrupted');
    });

    // 接続開始
    console.log('CallSession: Starting WebSocket connection...');
    
    let instructionToUse = systemInstructionRef.current;
    
    // プロンプトが明示的に指定されていない場合（オンボーディング以外）、動的に生成する
    if (!instructionToUse) {
      console.log('CallSession: Generating personalized system instruction...');
      try {
        instructionToUse = await generateSystemInstruction();
        console.log('CallSession: Instruction generated, length:', instructionToUse?.length);
      } catch (e) {
        console.error('CallSession: Failed to generate instruction', e);
      }
    }
    
    service.connect(instructionToUse);

  }, [isAudioReady, updateCallState, resetSilenceTimer, startSilenceTimer, onError, onConversationLog]);

  // isAudioReadyがtrueになったらpendingConnectを実行
  useEffect(() => {
    if (isAudioReady && pendingConnect) {
      console.log('CallSession: Audio ready, executing pending connect');
      doConnect();
    }
  }, [isAudioReady, pendingConnect, doConnect]);

  // 公開用connect関数
  const connect = useCallback(() => {
    doConnect();
  }, [doConnect]);

  // 切断
  const disconnect = useCallback(() => {
    console.log('CallSession: Disconnecting...');
    setPendingConnect(false);
    resetSilenceTimer();
    audioPlayerRef.current?.stopRecording();
    audioPlayerRef.current?.stopPlaying();
    geminiServiceRef.current?.disconnect();
    geminiServiceRef.current = null;
    updateCallState(CallState.ENDED);
  }, [resetSilenceTimer, updateCallState]);

  // 会話終了・日記生成
  const endConversation = useCallback(async (): Promise<{title: string; summary: string; emotion: string} | null> => {
    console.log('CallSession: Ending conversation...');
    
    // 録音停止
    audioPlayerRef.current?.stopRecording();
    
    // 会話ログを取得（WebSocket切断前に）
    const conversationHistory = geminiServiceRef.current?.getConversationHistory() || '';
    console.log('CallSession: Conversation history length:', conversationHistory.length);
    console.log('CallSession: Conversation history preview:', conversationHistory.substring(0, 200));
    
    // WebSocket切断
    disconnect();
    
    // 会話が十分にある場合のみREST APIで日記生成
    if (conversationHistory.length < 30) {
      console.log('CallSession: Not enough conversation to generate journal');
      return null;
    }
    
    try {
      console.log('CallSession: Generating journal via REST API...');
      const restService = getGeminiRestService();
      const journal = await restService.generateJournal(conversationHistory);
      console.log('CallSession: Journal generated:', journal);
      
      // 正常に日記生成（またはフォールバック）できたので、一時保存ログを消す
      RecoveryService.clear();
      
      return journal;
    } catch (error) {
      console.error('CallSession: Failed to generate journal via REST API', error);
      // エラー時はフォールバックとして会話ログをそのまま保存する
      const fallbackJournal = {
        title: '日記生成エラー (自動保存)',
        summary: '【AIによる生成に失敗しました。会話ログを保存します】\n\n' + conversationHistory,
        emotion: 'neutral' as const
      };
      
      // フォールバックでも一応保存できているのでクリアする（次回起動時に復元と競合しないように）
      RecoveryService.clear();
      
      return fallbackJournal;
    }
  }, [disconnect]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      resetSilenceTimer();
      geminiServiceRef.current?.disconnect();
    };
  }, [resetSilenceTimer]);

  return {
    // State
    callState,
    isConnected: callState !== CallState.ENDED && callState !== CallState.CONNECTING,
    isUserTalking: callState === CallState.USER_TALKING,
    isAiTalking: callState === CallState.AI_TALKING,
    errorMessage,
    conversationLogs,
    // Actions
    connect,
    disconnect,
    endConversation,
    // Mute
    isMuted: audioPlayer.isMuted,
    toggleMute: audioPlayer.toggleMute,
  };
};
