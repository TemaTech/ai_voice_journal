// services/conversation-recorder.ts
// 会話ログを蓄積し、終了時に日記を生成する
// 音声ベースではなくテキストベースで記録

import { ConversationLog } from '../types/callSession';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

interface JournalData {
  title: string;
  summary: string;
  emotion: 'happy' | 'sad' | 'excited' | 'calm' | 'tired' | 'neutral';
}

export class ConversationRecorder {
  private apiKey: string;
  private logs: ConversationLog[] = [];
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // 会話をリセット
  reset() {
    this.logs = [];
    console.log('ConversationRecorder: Reset');
  }

  // 会話ログを追加
  addLog(log: ConversationLog) {
    this.logs.push(log);
  }

  // 会話ログを取得
  getLogs(): ConversationLog[] {
    return [...this.logs];
  }

  // 会話履歴をテキスト形式で取得
  getConversationText(): string {
    return this.logs
      .map(log => `${log.speaker === 'user' ? 'ユーザー' : 'AI'}: ${log.text}`)
      .join('\n');
  }

  // 会話が十分にあるかチェック
  hasEnoughContent(): boolean {
    return this.logs.length >= 2;
  }

  // 会話終了時に日記を生成（テキストベース）
  async generateJournal(): Promise<JournalData> {
    console.log('ConversationRecorder: Generating journal from text logs');
    console.log('Log count:', this.logs.length);

    // 会話が少なすぎる場合はフォールバック
    if (!this.hasEnoughContent()) {
      console.log('ConversationRecorder: Not enough conversation, using fallback');
      return {
        title: '今日の日記',
        summary: 'AIと短い会話をしました。',
        emotion: 'neutral',
      };
    }

    try {
      const conversationText = this.getConversationText();
      console.log('ConversationRecorder: Conversation text:', conversationText.substring(0, 200));

      // Gemini REST API にテキストリクエスト
      const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `以下は今日のAIアシスタントとユーザーの会話です。

${conversationText}

この会話を元に、ユーザーの今日の日記を作成してください。
ユーザーの視点で、今日あった出来事や気持ちをまとめてください。

以下のJSON形式のみを返してください：
{
  "title": "日記のタイトル（15文字以内）",
  "summary": "日記の本文（ユーザー視点での100文字程度の要約）",
  "emotion": "happy" | "sad" | "excited" | "calm" | "tired"
}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
          }
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Gemini API error:', error);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) {
        throw new Error('No text response from API');
      }

      console.log('ConversationRecorder: Received response:', textResponse.substring(0, 200));

      // JSONを抽出してパース
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const journal = JSON.parse(jsonMatch[0]);
      return {
        title: journal.title || '今日の日記',
        summary: journal.summary || '（要約なし）',
        emotion: journal.emotion || 'neutral',
      };
    } catch (error) {
      console.error('ConversationRecorder: Failed to generate journal', error);
      return {
        title: '今日の日記',
        summary: 'AIと会話しました。（日記生成に失敗しました）',
        emotion: 'neutral',
      };
    }
  }
}

// シングルトンインスタンス
let recorderInstance: ConversationRecorder | null = null;

export const getConversationRecorder = (): ConversationRecorder => {
  if (!recorderInstance) {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not set');
    }
    recorderInstance = new ConversationRecorder(apiKey);
  }
  return recorderInstance;
};
