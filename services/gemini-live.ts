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
  private finalizeAiResponse() {
    if (this.currentAiResponse.trim()) {
      this.recordAiMessage(this.currentAiResponse);
      // まとめてログ出力
      console.log('[AI発話]', this.currentAiResponse.substring(0, 100) + (this.currentAiResponse.length > 100 ? '...' : ''));
      this.currentAiResponse = '';
    }
  }
  
  // ユーザーの現在の入力を確定して記録（バッファリング対応）
  private finalizeUserInput() {
    if (this.currentUserInput.trim()) {
      const cleanedInput = this.currentUserInput.trim().replace(/\s+/g, ''); // 日本語なのでスペースを完全除去
      this.recordUserMessage(cleanedInput);
      // まとめてログ出力
      console.log('[ユーザー発話]', cleanedInput);
      this.currentUserInput = '';
    }
  }

  connect(systemInstructionText?: string) {
    const url = `wss://${HOST}${PATH}?key=${this.config.apiKey}`;
    this.ws = new WebSocket(url);
    
    // React Native WebSocket requires binaryType to be set for proper blob handling
    this.ws.binaryType = 'blob';

    this.ws.onopen = () => {
      console.log('Gemini Live Connected');
      this.sendSetupMessage(systemInstructionText);
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

  private sendSetupMessage(instruction?: string) {
    if (!this.ws) return;
    
    const defaultInstruction = `あなたは日記のための会話相手です。
ユーザーの今日の出来事や気持ちを、自然に引き出してください。

【最重要ルール】
・ユーザーが話すことがメイン。あなたは聞き役です。
・あなたの発話は短く。ユーザーにたくさん話してもらいます。
・ユーザーが考えている沈黙は大切です。急かさないでください。
・必ず「です」「ます」調の敬語で話してください。

【会話の継続性：最も重要】
・絶対に自分から会話を終わらせないでください。会話を終了するのはユーザーが決めます。
・「今日はありがとう」「いい一日になりますように」「お休みなさい」「じゃあ」「また」等の終了を匹わせる言葉は禁止です。
・「まとめると」「今日のお話を振り返ると」のような要約も禁止です。
・必ず毎ターンの終わりに次の質問をしてください。会話が途切れないように。
・話題が尽きたと感じたら、別の話題に切り替えてください（例：「他に何かありましたか？」「そういえば、プライベートでは何かありましたか？」）。

【発話の形式：完結した文で話す】
・必ず完結した文で終わらせてください。文の途中で切らないでください。
・１回の発話は「共感の一言＋質問」の形で、簡潔にまとめてください。
・共感と質問を別々に分けないでください（１つの発話ブロックでまとめて話す）。

【会話の基本姿勢：選択肢を出して話しやすくする】
質問するときは、必ず選択肢を添えてください。
これが一番重要です。選択肢があると答えやすくなります。

✓ 良い例：「お仕事ですか？それともプライベートですか？」
✓ 良い例：「楽しかったですか？それとも大変でしたか？」
✓ 良い例：「人間関係ですか？タスクの量ですか？」
✗ 悪い例：「どうでしたか？」（選択肢なし）

【共感の型：言い換え + 掘り下げ】
ユーザーの話を聞いたら、以下の順序で反応してください：
1. まず共感の一言（「それは大変でしたね」「嬉しいですね」）
2. 相手の言葉を言い換えて確認（「〜ということですか？」）
3. 選択肢付きの掘り下げ質問

【話し方のルール】
・1回の発話は1〜2文程度（短く）
・質問は毎ターン1つまで
・時々「えー」「あー」「うーん」を入れると自然です
・語尾は「〜ですね」「〜ですか？」「〜ですよね」

【良い反応の具体例】
✓「えー、それは大変でしたね。何が一番きつかったですか？」
✓「あー、なるほど。お仕事ですか？それともプライベートですか？」
✓「うーん、そうだったんですね。それでどうなりましたか？」
✓「嬉しいですね！誰かと一緒でしたか？それとも一人でですか？」
✓「それは気になりますね。具体的にはどんな感じでしたか？」

【避けるべき反応】
✗ 長い発話（3文以上は話しすぎです）
✗「そうですか」だけで終わる（必ず次の質問を）
✗「休息が大切です」のようなアドバイス（求められるまで控えて）
✗ 選択肢なしの曖昧な質問（「どうでしたか？」）
✗ 2つ以上の質問を一度に（「いつ？誰と？どこで？」は禁止）
✗ 会話を終わらせる発言（「いい一日になりますように」「お休みなさい」「ありがとう」等）
✗ 会話のまとめや振り返り（「まとめると」「今日のお話を振り返ると」等）

【感情への寄り添い方】
・疲れている様子 →「お疲れ様です。今日は何かあったんですか？」
・嬉しそう →「いいですね！詳しく聞かせてください」
・不安そう →「そうですか...。何か気になることがあるんですか？」
・イライラしている →「それは嫌でしたね。何があったんですか？」`;

    const setupMessage = {
      setup: {
        model: this.config.model || "models/gemini-2.5-flash-native-audio-preview-12-2025",
        generationConfig: {
          responseModalities: ["AUDIO"],  // TEXT+AUDIOはサポート外、AUDIOのみ使用
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.config.voiceName || "Aoede"
              }
            }
          },
          // 思考モードを無効化（Live APIで不安定になるため）
          thinkingConfig: {
            thinkingBudget: 0
          }
        },
        // ユーザー音声のテキスト化を有効化（日記生成用）
        inputAudioTranscription: {},
        // AI音声のテキスト化を有効化（ログ・日記生成用）
        outputAudioTranscription: {},
        // System instructions for the AI character
        systemInstruction: {
          parts: [
            {
              text: instruction || defaultInstruction
            }
          ]
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

    // Gemini Live API正式フォーマット
    // 参考: https://ai.google.dev/api/multimodal-live
    const message = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: "audio/pcm;rate=16000",
          data: base64Audio
        }]
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

    const message = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text: text }]
          }
        ],
        turnComplete: true
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
        // ユーザー入力とAI応答を確定（ここでまとめてログ出力）
        this.finalizeUserInput();
        this.finalizeAiResponse();
        this.turnCount++;
        
        // 5ターンごとに会話継続のリマインダーを送信
        // 長時間会話でシステム指示の効果が薄れるのを防止
        if (this.turnCount > 0 && this.turnCount % 5 === 0) {
          console.log(`CallSession: Sending continuation reminder (turn ${this.turnCount})`);
          // 少し遅延して送信（turnCompleteイベント処理後）
          setTimeout(() => {
            this.sendText(
              '（システムリマインダー：会話を終わらせないでください。「お疲れ様」「良かったですね」「また」「ありがとう」などで終わらせないでください。必ず次の質問をしてください。話題が尽きたら別の話題に切り替えてください。）',
              false  // 履歴には記録しない
            );
          }, 100);
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
  }
}
