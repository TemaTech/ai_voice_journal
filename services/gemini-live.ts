// services/gemini-live.ts
// Gemini Multimodal Live API WebSocket接続サービス
// 割り込み機能とリアルタイム音声ストリーミング対応

import { EventEmitter } from 'eventemitter3';
import { ConversationLog, getDeepSilencePrompt, getLightSilencePrompt } from '../types/callSession';
import { ConversationMood, inferMoodFromTexts, MOOD_RESPONSE_HINTS } from '../types/conversationMood';

const HOST = 'generativelanguage.googleapis.com';
const PATH = '/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

interface GeminiLiveConfig {
  apiKey: string;
  model?: string;
  voiceName?: string; // e.g. "Aoede", "Charon", "Kore", "Fenrir", "Puck"
}

// イベント型定義
interface GeminiLiveEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  audio: (base64Audio: string) => void;
  text: (text: string) => void;
  turnComplete: () => void;
  // 新規追加イベント
  interrupted: () => void;
  inputTranscript: (text: string) => void;  // ユーザー音声の認識結果
}

export class GeminiLiveService extends EventEmitter<GeminiLiveEvents> {
  private ws: WebSocket | null = null;
  private config: GeminiLiveConfig;
  private setupComplete: boolean = false;
  
  // 会話ログ（日記生成用）
  private conversationLogs: ConversationLog[] = [];
  
  // 現在のAI応答テキスト（ストリーミング中の蓄積用）
  private currentAiResponse: string = '';
  
  // 現在のユーザー入力テキスト（バッファリング用）
  private currentUserInput: string = '';
  
  // 割り込みフラグ
  private isInterrupted: boolean = false;
  
  // 現在の感情状態（直近の会話から推測）
  private currentMood: ConversationMood = 'neutral';
  
  // 沈黙カウンター（段階的対応用）
  private silencePromptCount: number = 0;
  
  // ターンカウンター（リマインダー送信用）
  private turnCount: number = 0;
  
  // デバッグ用カウンター
  private audioChunkCount: number = 0;
  
  // 応答途切れリカバリー用タイマー
  private incompleteResponseTimer: ReturnType<typeof setTimeout> | null = null;
  
  // リカバリー試行回数（無限ループ防止用）
  private recoveryAttemptCount: number = 0;
  private static readonly MAX_RECOVERY_ATTEMPTS = 2;

  constructor(config: GeminiLiveConfig) {
    super();
    this.config = config;
  }
  
  // 音声送信一時停止フラグ
  private isAudioSendingPaused: boolean = false;

  // 音声送信を一時停止（ターン切り替え時の残響対策）
  pauseAudioSending() {
    this.isAudioSendingPaused = true;
  }

  // 音声送信を再開
  resumeAudioSending() {
    this.isAudioSendingPaused = false;
  }

  // 会話ログをリセット
  resetConversation() {
    this.conversationLogs = [];
    this.currentAiResponse = '';
    this.currentUserInput = '';  // ユーザー入力バッファもリセット
    this.isInterrupted = false;
    this.turnCount = 0;
    this.recoveryAttemptCount = 0;
    
    if (this.incompleteResponseTimer) {
      clearTimeout(this.incompleteResponseTimer);
      this.incompleteResponseTimer = null;
    }
  }

  // 会話ログを取得（日記生成用）
  getConversationLogs(): ConversationLog[] {
    return [...this.conversationLogs];
  }

  // 会話履歴をテキスト形式で取得
  getConversationHistory(): string {
    return this.conversationLogs
      .map(entry => `${entry.speaker === 'user' ? 'ユーザー' : 'AI'}: ${entry.text}`)
      .join('\n');
  }

  // ユーザーからのメッセージを記録
  private recordUserMessage(text: string) {
    if (!text.trim()) return;
    this.conversationLogs.push({ 
      timestamp: Date.now(),
      speaker: 'user', 
      text: text.trim()
    });
  }

  // AIからのメッセージを記録
  private recordAiMessage(text: string) {
    if (!text.trim()) return;
    this.conversationLogs.push({ 
      timestamp: Date.now(),
      speaker: 'ai', 
      text: text.trim()
    });
  }

  // AIの現在の応答を確定して記録
  private finalizeAiResponse(wasInterruptedByUser: boolean = false) {
    if (this.currentAiResponse.trim()) {
      // 英語の短い応答（ハルシネーション）をフィルタリング
      // 日本語が含まれておらず、かつ短い場合は無視
      const isJapanese = /[亜-熙ぁ-んァ-ヶ]/.test(this.currentAiResponse);
      const isShortEnglish = !isJapanese && this.currentAiResponse.length < 20;
      
      if (!isShortEnglish) {
        this.recordAiMessage(this.currentAiResponse);
        console.log('[AI発話]', this.currentAiResponse.substring(0, 100) + (this.currentAiResponse.length > 100 ? '...' : ''));
        // ★ 途切れリカバリーは撤廃（Barge-inが有効になったため、ユーザーが自然に会話を進められる）
      } else {
        console.log('[AI発話(無視)]', this.currentAiResponse);
      }
      this.currentAiResponse = '';
    }
  }
  
  // ユーザーの現在の入力を確定して記録（バッファリング対応）
  private finalizeUserInput() {
    if (this.currentUserInput.trim()) {
      const cleanedInput = this.currentUserInput.trim().replace(/\s+/g, ''); // 日本語なのでスペースを完全除去
      
      // 非日本語ノイズのフィルタリング
      // 音声認識がノイズをタイ語、韓国語、英語などとして誤認識することがある
      // 日本語文字（漢字・ひらがな・カタカナ）が1つも含まれていない入力は無視する
      const containsJapanese = /[亜-熙ぁ-んァ-ヶー\u4E00-\u9FFF\u3400-\u4DBF]/.test(cleanedInput);

      if (containsJapanese) {
        this.recordUserMessage(cleanedInput);
        // まとめてログ出力
        console.log('[ユーザー発話]', cleanedInput);
        
        // ★ ユーザーが発話したら、リカバリカウンターをリセット
        // これにより次のAI応答が途切れた場合は再びリカバリが試行可能になる
        this.recoveryAttemptCount = 0;
      } else {
        console.log('[ユーザー発話(無視)]', cleanedInput);
      }
      this.currentUserInput = '';
    }
  }

  connect(systemInstructionText?: string, initialHistory: ConversationLog[] = []) {
    const url = `wss://${HOST}${PATH}?key=${this.config.apiKey}`;
    this.ws = new WebSocket(url);
    
    // React Native WebSocket requires binaryType to be set for proper blob handling
    this.ws.binaryType = 'blob';

    this.ws.onopen = () => {
      console.log('Gemini Live Connected');
      this.sendSetupMessage(systemInstructionText);

      // 履歴がある場合、接続直後に文脈として送信（コンテキスト復元）
      if (initialHistory.length > 0) {
        console.log(`Restoring context with ${initialHistory.length} logs...`);
        this.sendConversationContext(initialHistory);
      }
    };

    this.ws.onmessage = async (event) => {
      await this.handleMessage(event.data);
    };

    this.ws.onerror = (event) => {
      console.error('Gemini Live Error:', event);
      this.emit('error', new Error('WebSocket connection error'));
    };

    this.ws.onclose = (event) => {
      console.log('Gemini Live Closed, code:', event.code, 'reason:', event.reason);
      this.emit('disconnected');
    };
  }

  // 過去の会話ログを送信してコンテキストを復元
  private sendConversationContext(history: ConversationLog[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    // APIの形式に変換
    const turns = history.map(log => ({
      role: log.speaker === 'user' ? 'user' : 'model',
      parts: [{ text: log.text }]
    }));
    
    const message = {
      clientContent: {
        turns: turns,
        turnComplete: false // 履歴を流し込むだけなのでターンは終了させない
      }
    };
    
    console.log('Sending conversation context...');
    this.ws.send(JSON.stringify(message));
    
    // 内部ログを初期化（これで日記生成時にも過去のログが含まれる）
    this.conversationLogs = [...history];
  }

  private sendSetupMessage(instruction?: string) {
    if (!this.ws) return;
    
    // フォールバック用の最小指示（通常は ai-prompt.ts の generateSystemInstruction() が使われる）
    const defaultInstruction = `あなたは日記のための聞き上手なパートナーです。
相手の一日の出来事や気持ちを引き出してください。
★最重要：あなたの発話は必ず「質問」で終えてください。質問なしで終わる発話は禁止です。
丁寧語（です・ます）で話してください。「ユーザー」とは呼ばないでください。
事務的な応答（「承知しました」）、激励（「応援しています」）、締めくくり（「おやすみなさい」）は禁止です。
AI自身の状態（「私はいつも通りです」「元気です」など）については一切言及しないでください。あなたは聞き手です。
システム内部の事情（「内部プロトコルにより」「接続が切れたため」など）は絶対にユーザーに話さないでください。`;

    const setupMessage = {
      setup: {
        model: this.config.model || "models/gemini-3.1-flash-live-preview",
        historyConfig: {
          initialHistoryInClientContent: true  // 会話履歴の復元を許可
        },
        generationConfig: {
          responseModalities: ["AUDIO"],  
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.config.voiceName || "Aoede"
              }
            }
          },
          thinkingConfig: {
            thinkingBudget: 0
          }
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: {
          parts: [{ text: instruction || defaultInstruction }]
        }
      }
    };
    
    console.log('Sending setup message...');
    this.ws.send(JSON.stringify(setupMessage));
  }

  // 音声チャンクを送信
  sendAudioChunk(base64Audio: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;  // WebSocketが準備できていない場合は静かにスキップ
    }
    if (!this.setupComplete) {
      return;  // セットアップ完了前はスキップ
    }
    
    // 送信一時停止中はスキップ（残響対策）
    if (this.isAudioSendingPaused) {
      return;
    }

    this.audioChunkCount++;

    // Gemini 3.1 Live API 正式フォーマット
    const message = {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Audio
        }
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  // デバッグ用: 送信状態を取得
  isReady(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.setupComplete;
  }

  // テキストメッセージを送信
  sendText(text: string, recordInHistory: boolean = true) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;  // WebSocketが準備できていない
    }
    if (!this.setupComplete) {
      return;  // セットアップ完了前
    }

    // Gemini 3.1 では継続的なテキスト入力は realtimeInput を使用
    const message = {
      realtimeInput: {
        text: text
      }
    };

    this.ws.send(JSON.stringify(message));
    
    // 会話履歴に記録（システムプロンプト等は除外可能）
    if (recordInHistory && !text.startsWith('（')) {
      this.recordUserMessage(text);
    }
  }

  /**
   * 割り込み通知（クライアント側の状態管理用）
   * 注意: Gemini Live APIは音声ストリームから自動で割り込みを検出するため、
   * 特別なメッセージ送信は不要（かつサポートされていない）
   */
  sendInterrupt() {
    this.isInterrupted = true;
    this.emit('interrupted');
  }

  /**
   * 直近の会話から感情状態を推測
   */
  private inferMood(): ConversationMood {
    const recentUserTexts = this.conversationLogs
      .slice(-3)
      .filter(log => log.speaker === 'user')
      .map(log => log.text);
    
    const newMood = inferMoodFromTexts(recentUserTexts);
    
    if (newMood !== this.currentMood) {
      this.currentMood = newMood;
    }
    
    return newMood;
  }

  /**
   * 感情状態に応じたヒントを取得
   */
  getMoodHint(): string {
    const mood = this.inferMood();
    return MOOD_RESPONSE_HINTS[mood] || '';
  }

  /**
   * 軽い沈黙時の合いの手を送信（6〜8秒）
   * 質問ではなく、待っている姿勢を示す
   */
  sendLightSilencePrompt() {
    const prompt = getLightSilencePrompt();
    this.silencePromptCount++;
    // 会話継続のリマインダーを付加
    const fullPrompt = prompt + '\n（重要：会話を終わらせないでください。必ず次の質問をしてください）';
    this.sendText(fullPrompt, false);  // 履歴には記録しない
  }

  /**
   * 深い沈黙時の問いかけを送信（10秒以上）
   * 自然な問いかけをする
   */
  sendDeepSilencePrompt() {
    // 感情状態に応じたヒントを追加
    const moodHint = this.getMoodHint();
    const prompt = getDeepSilencePrompt();
    // 会話継続のリマインダーを付加
    const reminder = '\n（重要：会話を終わらせないでください。まとめたり、お疋いの言葉を言ったりしないでください。必ず次の質問をしてください）';
    const fullPrompt = moodHint ? `${moodHint}\n${prompt}${reminder}` : `${prompt}${reminder}`;
    
    this.silencePromptCount++;
    this.sendText(fullPrompt, false);  // 履歴には記録しない
  }

  /**
   * 無音時のAI問いかけを送信
   * @deprecated 代わりに sendLightSilencePrompt または sendDeepSilencePrompt を使用
   */
  sendSilencePrompt() {
    this.sendDeepSilencePrompt();
  }

  /**
   * 沈黙カウンターをリセット
   */
  resetSilenceCount() {
    this.silencePromptCount = 0;
  }


  private async handleMessage(data: any) {
    let message;
    try {
      if (typeof data === 'string') {
        message = JSON.parse(data);
      } else if (data instanceof Blob) {
        // Handle Blob data (React Native case)
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsText(data);
        });
        message = JSON.parse(text);
      } else {
        return;  // 不明なデータ型は無視
      }
    } catch (e) {
      console.error("Failed to parse message", e);
      return;
    }

    // Handle setup complete
    if (message.setupComplete) {
      console.log('Setup complete!');
      this.setupComplete = true;
      this.emit('connected');
      return;
    }

    // Handle server content
    if (message.serverContent) {
      // 割り込みがあった場合
      if (this.isInterrupted) {
        if (message.serverContent.turnComplete) {
          // ターン完了で割り込みフラグをリセット
          this.isInterrupted = false;
          this.emit('turnComplete');
        }
        return;
      }
      
      if (message.serverContent.modelTurn) {
        // AIが自発的に話し始めたら、待機中のリカバリ処理をキャンセル
        if (this.incompleteResponseTimer) {
          clearTimeout(this.incompleteResponseTimer);
          this.incompleteResponseTimer = null;
        }

        const parts = message.serverContent.modelTurn.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData) {
              // Audio data - ログなしで再生
              this.emit('audio', part.inlineData.data);
            }
            if (part.text) {
              // テキストを蓄積（turnCompleteで確定）
              this.currentAiResponse += part.text;
              this.emit('text', part.text);
            }
          }
        }
      }
      
      // ユーザー音声の認識結果（正しいフィールド名: inputTranscription）
      // 細切れで届くのでバッファに蓄積し、turnCompleteで確定する
      if (message.serverContent.inputTranscription) {
        const transcription = message.serverContent.inputTranscription;
        // textフィールドがある場合とない場合の両方に対応
        const transcriptText = typeof transcription === 'string' ? transcription : transcription.text || '';
        if (transcriptText) {
          // バッファに蓄積（日本語なのでスペースなしで連結）
          this.currentUserInput += transcriptText;
          this.emit('inputTranscript', transcriptText);
        }
      }
      
      // AI音声の認識結果（outputAudioTranscription有効時）
      if (message.serverContent.outputTranscription) {
        const transcription = message.serverContent.outputTranscription;
        const transcriptText = typeof transcription === 'string' ? transcription : transcription.text || '';
        if (transcriptText) {
          // AI応答バッファに蓄積
          this.currentAiResponse += transcriptText;
        }
      }
      
      if (message.serverContent.turnComplete) {
        // ターン内にユーザーの発話（またはノイズ）があったかどうかを判定
        const hasUserInputInTurn = this.currentUserInput.trim().length > 0;
        
        // ユーザー入力とAI応答を確定（ここでまとめてログ出力）
        this.finalizeUserInput();
        this.finalizeAiResponse(hasUserInputInTurn);
        this.turnCount++;
        
        // 5ターンごとに会話継続のリマインダーを送信
        // 長時間会話でシステム指示の効果が薄れるのを防止
        // ※ 送信タイミングを3秒後に遅延し、AIの前のターンの音声が完全に再生し終わってから送る
        //   （即座に送ると二重発話の原因になる）
        if (this.turnCount > 0 && this.turnCount % 10 === 0) {
          console.log(`CallSession: Sending continuation reminder (turn ${this.turnCount})`);
          setTimeout(() => {
            // 送信前にまだ接続中かチェック
            if (this.isReady()) {
              this.sendText(
                '（リマインダー：返答は2〜3文まで。共感1文 ＋ 質問1文が理想。長い返答は禁止。会話を終わらせず、必ず質問で終えること。）',
                false
              );
            }
          }, 3000);
        }
        
        this.emit('turnComplete');
      }
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setupComplete = false;
    this.isInterrupted = false;
    
    if (this.incompleteResponseTimer) {
      clearTimeout(this.incompleteResponseTimer);
      this.incompleteResponseTimer = null;
    }
  }
}
