// services/gemini-rest.ts
// Gemini REST APIを使用したテキストベースの日記要約生成

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

interface JournalData {
  title: string;
  summary: string;
  emotion: 'happy' | 'sad' | 'excited' | 'calm' | 'tired' | 'neutral';
}

export class GeminiRestService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 会話履歴から日記を生成
   * @param conversationHistory ユーザーとAIの会話履歴（テキスト形式）
   */
  async generateJournal(conversationHistory: string): Promise<JournalData> {
    const prompt = `あなたは日記作成アシスタントです。以下はAIジャーナルアプリでユーザーとAIが行った会話の記録です。

【会話履歴】
${conversationHistory}

【タスク】
上記の会話を元に、**ユーザーの視点で**今日の日記を作成してください。

【重要なルール】
- 日記は**ユーザー自身が書いたような**一人称視点で作成してください
- 会話から抽出した具体的な出来事や感情を含めてください
- AIとの会話自体には言及しないでください（例：「AIに話した」は不可）
- 自然で親しみやすい文体を使用してください

【感情の判定基準】
- happy: 楽しい・嬉しい・良いことがあった
- sad: 悲しい・落ち込んでいる
- excited: ワクワク・興奮・意欲的
- calm: 穏やか・平和・リラックス
- tired: 疲れた・大変だった

【出力形式】
以下のJSON形式のみを返してください。他の説明は一切不要です。
{
  "title": "日記のタイトル（15文字以内、キャッチーで）",
  "summary": "日記の本文（100〜150文字、ユーザー視点で）",
  "emotion": "happy" | "sad" | "excited" | "calm" | "tired"
}`;


    try {
      console.log('GeminiRest: Calling API with conversation length:', conversationHistory.length);
      console.log('GeminiRest: Prompt first 300 chars:', prompt.substring(0, 300));
      
      const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
          }
        }),
      });

      console.log('GeminiRest: API response status:', response.status);
      
      if (!response.ok) {
        const error = await response.text();
        console.error('GeminiRest: API error response:', error);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('GeminiRest: API response data keys:', Object.keys(data));
      
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) {
        console.error('GeminiRest: No text in response, data:', JSON.stringify(data).substring(0, 500));
        throw new Error('No text response from API');
      }

      console.log('GeminiRest: Raw text response:', textResponse);

      // JSONを抽出してパース
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('GeminiRest: No JSON found in response:', textResponse);
        throw new Error('No JSON found in response');
      }

      const journal = JSON.parse(jsonMatch[0]);
      return {
        title: journal.title || '今日の日記',
        summary: journal.summary || '（要約なし）',
        emotion: journal.emotion || 'neutral',
      };
    } catch (error) {
      console.error('Failed to generate journal via REST API:', error);
      throw error;
    }
  }

  /**
   * 簡単なテスト用：会話なしでデフォルト日記を生成
   */
  async generateDefaultJournal(): Promise<JournalData> {
    return this.generateJournal('ユーザーが今日の話をしてくれましたが、具体的な内容は記録されていません。');
  }
}

// シングルトンインスタンス
let geminiRestInstance: GeminiRestService | null = null;

export const getGeminiRestService = (): GeminiRestService => {
  if (!geminiRestInstance) {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not set');
    }
    geminiRestInstance = new GeminiRestService(apiKey);
  }
  return geminiRestInstance;
};
