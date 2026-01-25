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
  
  // デバッグ用カウンター
  private audioChunkCount: number = 0;

  constructor(config: GeminiLiveConfig) {
    super();
    this.config = config;
  }

  // 会話ログをリセット
  resetConversation() {
    this.conversationLogs = [];
    this.currentAiResponse = '';
    this.currentUserInput = '';  // ユーザー入力バッファもリセット
    this.isInterrupted = false;
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
      this.currentAiResponse = '';
    }
  }
  
  // ユーザーの現在の入力を確定して記録（バッファリング対応）
  private finalizeUserInput() {
    if (this.currentUserInput.trim()) {
      this.recordUserMessage(this.currentUserInput);
      console.log('Finalized user input:', this.currentUserInput.trim());
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

【感情への寄り添い方】
・疲れている様子 →「お疲れ様です。今日は何かあったんですか？」
・嬉しそう →「いいですね！詳しく聞かせてください」
・不安そう →「そうですか...。何か気になることがあるんですか？」
・イライラしている →「それは嫌でしたね。何があったんですか？」`;

    const setupMessage = {
      setup: {
        model: this.config.model || "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: ["AUDIO"],  // TEXT+AUDIOはサポート外、AUDIOのみ使用
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede"
              }
            }
          }
        },
        // ユーザー音声のテキスト化を有効化（日記生成用）
        inputAudioTranscription: {},
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
      console.log('WebSocket not ready, skipping audio chunk');
      return;
    }
    if (!this.setupComplete) {
      console.log('Setup not complete, skipping audio chunk');
      return;
    }

    // デバッグ: 音声データ送信ログ（最初の数回のみ）
    this.audioChunkCount++;
    if (this.audioChunkCount <= 5 || this.audioChunkCount % 50 === 0) {
      console.log(`Sending audio chunk #${this.audioChunkCount}, size: ${base64Audio.length}`);
    }

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
      console.log('WebSocket not ready, skipping text');
      return;
    }
    if (!this.setupComplete) {
      console.log('Setup not complete, skipping text');
      return;
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

    console.log('Sending text:', text);
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
    console.log('Interrupt requested (client-side only)');
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
      console.log(`Mood changed: ${this.currentMood} -> ${newMood}`);
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
    console.log('Sending light silence prompt:', prompt);
    this.silencePromptCount++;
    this.sendText(prompt, false);  // 履歴には記録しない
  }

  /**
   * 深い沈黙時の問いかけを送信（10秒以上）
   * 自然な問いかけをする
   */
  sendDeepSilencePrompt() {
    // 感情状態に応じたヒントを追加
    const moodHint = this.getMoodHint();
    const prompt = getDeepSilencePrompt();
    const fullPrompt = moodHint ? `${moodHint}\n${prompt}` : prompt;
    
    console.log('Sending deep silence prompt:', fullPrompt);
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
        console.log("Received unknown data type:", typeof data);
        return; 
      }
    } catch (e) {
      console.error("Failed to parse message", e);
      return;
    }

    console.log('Received message:', JSON.stringify(message).substring(0, 500));

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
        console.log('Gemini: Message received while interrupted, checking for turnComplete');
        if (message.serverContent.turnComplete) {
          // ターン完了で割り込みフラグをリセット
          console.log('Gemini: Resetting interrupt flag on turnComplete');
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
              // Audio data
              console.log('Received audio data, size:', part.inlineData.data.length);
              this.emit('audio', part.inlineData.data);
            }
            if (part.text) {
              console.log('Received text:', part.text);
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
          // バッファに蓄積（スペースで区切る）
          this.currentUserInput += (this.currentUserInput ? ' ' : '') + transcriptText;
          console.log('Input transcription (buffering):', transcriptText);
          this.emit('inputTranscript', transcriptText);
        }
      }
      
      if (message.serverContent.turnComplete) {
        console.log('Turn complete');
        // ユーザー入力とAI応答を確定
        this.finalizeUserInput();
        this.finalizeAiResponse();
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
