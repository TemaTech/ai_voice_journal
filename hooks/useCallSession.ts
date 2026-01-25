// hooks/useCallSession.ts
// 通話セッション全体を管理する中核フック
// 状態マシン、割り込み、無音タイムアウトを一元管理

import { useCallback, useEffect, useRef, useState } from 'react';
import { GeminiLiveService } from '../services/gemini-live';
import { getGeminiRestService } from '../services/gemini-rest';
import { CallSessionConfig, CallSessionState, CallState, ConversationLog } from '../types/callSession';
import { useAudioSession } from './useAudioSession';
import { useSimpleAudioPlayer } from './useSimpleAudioPlayer';

const LIGHT_SILENCE_TIMEOUT_MS = 15000;  // 15秒で軽い合いの手（ユーザーが考える時間を確保）
const DEEP_SILENCE_TIMEOUT_MS = 30000;   // 30秒で問いかけ

interface UseCallSessionReturn extends CallSessionState {
  // アクション
  connect: () => void;
  disconnect: () => void;
  endConversation: () => Promise<{title: string; summary: string; emotion: string} | null>;
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
    console.log(`CallSession: Starting silence timers (light: ${LIGHT_SILENCE_TIMEOUT_MS/1000}s, deep: ${DEEP_SILENCE_TIMEOUT_MS/1000}s)`);
    
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
        console.log('CallSession: Interrupting AI');
        geminiServiceRef.current?.sendInterrupt();
        audioPlayerRef.current?.interruptAI();
        updateCallState(CallState.INTERRUPTED);
        setTimeout(() => {
          updateCallState(CallState.USER_TALKING);
        }, 100);
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
  const doConnect = useCallback(() => {
    console.log('CallSession: doConnect called, isAudioReady:', isAudioReady);
    
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

    const service = new GeminiLiveService({ apiKey });
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
      // AI音声を受信 -> 再生
      console.log('CallSession: Received AI audio');
      updateCallState(CallState.AI_TALKING);
      resetSilenceTimer();
      audioPlayerRef.current?.playAudio(base64Audio);
    });

    service.on('text', (text) => {
      // AIテキスト受信（表示用・要約用）
      console.log('CallSession: AI says:', text);
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
    });

    service.on('turnComplete', () => {
      console.log('CallSession: Turn complete');
      audioPlayerRef.current?.onTurnComplete();
      
      // 沈黙カウンターをリセット
      geminiServiceRef.current?.resetSilenceCount();
      
      // AI発話完了 -> LISTENINGへ
      setTimeout(() => {
        const currentState = callStateRef.current;
        if (currentState !== CallState.ENDED && currentState !== CallState.USER_TALKING) {
          updateCallState(CallState.LISTENING);
          startSilenceTimer();
        }
      }, 500);
    });

    service.on('interrupted', () => {
      console.log('CallSession: AI interrupted');
    });

    // 接続開始
    console.log('CallSession: Starting WebSocket connection...');
    service.connect(systemInstructionRef.current);

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
      return journal;
    } catch (error) {
      console.error('CallSession: Failed to generate journal via REST API', error);
      return null;
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
  };
};
