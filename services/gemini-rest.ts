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
    const prompt = `あなたはユーザーの発言を忠実に記録する書記です。
以下の会話記録を元に、**事実に基づいた日記**を作成してください。

【会話履歴】
${conversationHistory}

【厳守ルール - 創作の禁止】
1. **ユーザーが発言した内容のみ**を記述してください。
   - 会話に含まれない感想、情景描写、哲学的考察などは一切追加しないでください。
   - ×「特になにもなかった。淡々と時間が過ぎていった。」（後者は創作なのでNG）
   - ○「今日は特になにもなかった。」（これだけで良い）

2. **長さの調整**:
   - 会話が短ければ、日記も短くて構いません。無理に文字数を稼がないでください。
   - 簡潔な事実の記録を優先してください。

3. **文体**:
   - 「だ・である」調で統一してください。
   - AIとしての返答や、AIの感想は含めないでください。

【出力形式】
以下のJSON形式のみを返してください。
{
  "title": "日記のタイトル（事実に基づく15文字以内）",
  "summary": "日記の本文（会話に出た事実のみ。余計な修飾語は削除）",
  "emotion": "happy" | "sad" | "excited" | "calm" | "tired" | "neutral"
}`;


    let lastError: any;
    
    // リトライロジック（最大3回）
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`GeminiRest: Generating journal (Attempt ${attempt}/3)...`);
        
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
              temperature: 0.3,
              maxOutputTokens: 500,
            }
          }),
        });

        console.log('GeminiRest: API response status:', response.status);
        
        if (!response.ok) {
           // 4xxエラーはリトライしない（クライアントエラーのため）
           if (response.status >= 400 && response.status < 500) {
             const errorText = await response.text();
             throw new Error(`API Client Error (${response.status}): ${errorText}`);
           }
           throw new Error(`API Server Error: ${response.status}`);
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textResponse) {
          throw new Error('No text response from API');
        }

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
        console.warn(`GeminiRest: Attempt ${attempt} failed:`, error);
        lastError = error;
        
        if (attempt < 3) {
          // 指数バックオフ (1s, 2s)
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`GeminiRest: Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error('GeminiRest: All attempts failed');
    throw lastError;
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
