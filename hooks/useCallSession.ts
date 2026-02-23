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

// 挨拶のバリエーション定義
const GREETINGS = {
  morning: [ // 5:00 - 10:59
    'おはようございます。よく眠れましたか？',
    'おはようございます。今日の予定は何かありますか？',
    'おはようございます。朝の気分はいかがですか？',
    'おはようございます。素敵な1日の始まりですね。',
  ],
  daytime: [ // 11:00 - 17:59
    'こんにちは。調子はいかがですか？',
    'こんにちは。午後の気分はどうですか？',
    'こんにちは。ここまでどんな1日でしたか？',
    'こんにちは。何か良いことはありましたか？',
  ],
  evening: [ // 18:00 - 22:59
    'お疲れ様です。今日はどんな1日でしたか？',
    'こんばんは。今日一日を振り返ってみませんか？',
    'こんばんは。何か印象に残った出来事はありましたか？',
    'お疲れ様です。少しゆっくりお話しましょうか。',
  ],
  night: [ // 23:00 - 4:59
    'こんな時間にこんばんは。眠れませんか？',
    '静かな夜ですね。何か考え事ですか？',
    'こんばんは。今日の日記をつけて休みましょうか。',
    '夜遅くにお疲れ様です。どんなことを考えていましたか？',
  ],
  generic: [ // 時間帯問わず混ぜる
    'こんにちは。今、どんなことを考えていますか？',
    'お話相手になりますよ。何でも話してください。',
    'こんにちは。今の気持ちを教えていただけますか？',
  ]
};

const getInitialGreeting = (): string => {
  const hour = new Date().getHours();
  let candidates: string[] = [...GREETINGS.generic];

  if (hour >= 5 && hour < 11) {
    candidates = [...candidates, ...GREETINGS.morning];
  } else if (hour >= 11 && hour < 18) {
    candidates = [...candidates, ...GREETINGS.daytime];
  } else if (hour >= 18 && hour < 23) {
    candidates = [...candidates, ...GREETINGS.evening];
  } else {
    candidates = [...candidates, ...GREETINGS.night];
  }

  // ランダムに選択
  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex];
};

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

  // 会話ログのRef（doConnect内での参照用）
  const conversationLogsRef = useRef<ConversationLog[]>([]);
  
  // ログ更新時にRefも更新
  useEffect(() => {
    conversationLogsRef.current = conversationLogs;
  }, [conversationLogs]);

  const callStateRef = useRef<CallState>(CallState.ENDED);
  const isTurnCompletingRef = useRef<boolean>(false); // ターン完了処理中フラグ（競合回避用）
  const isInterruptingRef = useRef<boolean>(false); // 割り込み処理中フラグ（二重割り込み防止）

  const systemInstructionRef = useRef(systemInstruction);
  systemInstructionRef.current = systemInstruction;
  
  // Audio Session（権限・設定）
  const { isReady: isAudioReady } = useAudioSession();
  
  const isUserDisconnectingRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const MAX_RETRIES = 100; // 10分制限・長時間会話対策として、リトライ上限を実質撤廃

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
      // AIが既に話している場合はスキップ（二重発話防止）
      const currentState = callStateRef.current;
      if (currentState === CallState.AI_TALKING || currentState === CallState.AI_THINKING) {
        console.log('CallSession: Light silence skipped (AI is talking/thinking)');
        return;
      }
      console.log('CallSession: Light silence timeout - sending light prompt');
      if (geminiServiceRef.current?.isReady()) {
        geminiServiceRef.current.sendLightSilencePrompt();
        updateCallState(CallState.AI_THINKING);
      }
    }, LIGHT_SILENCE_TIMEOUT_MS);
    
    // 深い問いかけ
    deepSilenceTimerRef.current = setTimeout(() => {
      // AIが既に話している場合はスキップ（二重発話防止）
      const currentState = callStateRef.current;
      if (currentState === CallState.AI_TALKING || currentState === CallState.AI_THINKING) {
        console.log('CallSession: Deep silence skipped (AI is talking/thinking)');
        return;
      }
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
        isTurnCompletingRef.current = false;
        
        console.log('CallSession: Interrupting AI');
        geminiServiceRef.current?.sendInterrupt();
        
        // ★ 割り込み時に音声送信を即座に一時停止
        // マイクの残響/ノイズがGeminiに送信され、
        // 誤った「承知しました」応答の原因になるのを防ぐ
        geminiServiceRef.current?.pauseAudioSending();
        
        updateCallState(CallState.INTERRUPTED);
        
        (async () => {
          try {
            await audioPlayerRef.current?.interruptAI();
          } catch (e) {
            console.error('CallSession: interruptAI failed', e);
          } finally {
            isInterruptingRef.current = false;
            const stateAfterInterrupt = callStateRef.current;
            if (stateAfterInterrupt !== CallState.ENDED) {
              updateCallState(CallState.USER_TALKING);
            }
            
            // ★ 500ms後に音声送信を再開
            // 割り込み直後のマイク残響が落ち着いてからユーザー音声を送信
            setTimeout(() => {
              geminiServiceRef.current?.resumeAudioSending();
            }, 500);
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
    // VAD設定（誤検出を減らすため閾値をさらに高めに設定）
    speechThreshold: 0.2,     // 0.08 → 0.2 誤検出防止のため大幅に上げる
    silenceThreshold: 0.02,   // 無音閾値は維持
    speechDebounceMs: 400,    // 300 → 400 ノイズによる誤反応を防ぐ
    silenceDebounceMs: 500,   // 発話終了判定は維持
  });
  
  // audioPlayerをRefに保存（循環参照回避用）
  audioPlayerRef.current = audioPlayer;

  // 実際の接続処理
  const doConnect = useCallback(async (isRetry = false) => {
    if (!isAudioReady) {
      console.log('CallSession: Audio not ready, setting pendingConnect');
      setPendingConnect(true);
      return;
    }
    
    if (geminiServiceRef.current?.isReady() && !isRetry) {
      console.log('CallSession: Already connected');
      return;
    }

    console.log(`CallSession: Connecting... (Retry: ${retryCountRef.current})`);
    if (!isRetry) {
        updateCallState(CallState.CONNECTING);
        setErrorMessage(null);
        setPendingConnect(false);
        isUserDisconnectingRef.current = false; // 接続開始時にフラグをリセット
    }

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
      retryCountRef.current = 0; // 接続成功でリセット
      
      // 録音開始
      audioPlayerRef.current?.startRecording();
      
      // 最初のAI挨拶をトリガー（リトライ時は挨拶しない）
      if (!isRetry) {
        setTimeout(() => {
          console.log('CallSession: Sending initial greeting...');
          // 短い挨拶でユーザーに話しやすい気持ちにさせる
          // 注: ここで普通の挨拶を送ると、AIが「ユーザーからの問いかけ」と解釈して「私は元気ですよ」などと返してしまうため、
          // 明確に「指示」として送信する。
          const greeting = getInitialGreeting();
          console.log('CallSession: Selected greeting:', greeting);
          service.sendText(`（指示：ユーザーに対し「${greeting}」と話しかけてください。あなた自身の状態（「私はいつも通りです」など）については一切言及しないでください）`, false);
          updateCallState(CallState.AI_THINKING);
        }, 1000);
      }
    });

    service.on('disconnected', () => {
      console.log('CallSession: Disconnected event received');
      
      // ユーザーによる切断でなければ再接続を試みる
      if (!isUserDisconnectingRef.current) {
          if (retryCountRef.current < MAX_RETRIES) {
              console.log(`CallSession: Unexpected disconnect. Retrying... (${retryCountRef.current + 1}/${MAX_RETRIES})`);
              retryCountRef.current += 1;
              setTimeout(() => {
                  doConnect(true);
              }, 2000);
              return;
          } else {
              console.error('CallSession: Max retries reached. Giving up.');
              setErrorMessage('接続が切れました。もう一度お試しください。');
          }
      }

      console.log('CallSession: Handling disconnect cleanup');
      updateCallState(CallState.ENDED);
      audioPlayerRef.current?.stopRecording();
      resetSilenceTimer();
    });

    service.on('error', (error) => {
      console.error('CallSession: Error event received', error);
      
      // エラー時も再接続試行
      if (!isUserDisconnectingRef.current && retryCountRef.current < MAX_RETRIES) {
          console.log(`CallSession: Error occurred. Retrying... (${retryCountRef.current + 1}/${MAX_RETRIES})`);
          retryCountRef.current += 1;
          setTimeout(() => {
              doConnect(true);
          }, 2000);
          return;
      }

      setErrorMessage('接続エラーが発生しました');
      onError?.(error);
    });

    service.on('audio', (base64Audio) => {
      // ターン完了処理中であっても、サーバーから送られてくるAIの音声データは正当なものとして再生を許可する
      // （リカバリ発話などがこのタイミングで届く可能性があるため）
      // if (isTurnCompletingRef.current) {
      //   return;
      // }
      
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
      
      // ★ 音声送信の一時停止は行わない。
      // Gemini APIはクライアント側の無音を「ユーザーの発話終了」と解釈するため、
      // pauseAudioSending() でマイク入力を止めると、予期しないturnCompleteの連鎖を
      // 引き起こすリスクがある。エコー防止はVADガード（推定再生時間ベース）で対応。
      
      audioPlayerRef.current?.onTurnComplete();
      
      // 沈黙カウンターをリセット
      geminiServiceRef.current?.resetSilenceCount();
      
      // AI音声の再生完了を待ってからLISTENINGへ遷移し沈黙タイマーを開始
      setTimeout(() => {
        isTurnCompletingRef.current = false;
        
        const currentState = callStateRef.current;
        if (currentState !== CallState.ENDED && currentState !== CallState.USER_TALKING) {
          updateCallState(CallState.LISTENING);
          startSilenceTimer();
        }
      }, 800); // 音声再生完了を待つ
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

    
    // 再接続時（または初回接続時も）、これまでの会話履歴を渡してコンテキストを復元
    // ※ 必要に応じて直近N件に絞るなどの調整も可能だが、
    // Gemini 1.5 Pro/Flashはコンテキストウィンドウが広いので全件渡しても基本OK。
    // 日記生成に十分な情報を持たせるため、全件渡す。
    const history = conversationLogsRef.current;
    if (history.length > 0) {
      console.log(`CallSession: Connecting with context (${history.length} logs)`);
    }
    
    service.connect(instructionToUse, history);

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
    isUserDisconnectingRef.current = true; // ユーザーによる明示的な切断
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
