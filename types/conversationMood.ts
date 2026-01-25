// types/conversationMood.ts
// 会話の感情状態を管理するための型定義
// 直近の会話から感情を推測し、AIの対応を調整する

/**
 * 会話の感情状態
 * 直近3ターンの会話から推測し、AIの反応を調整するために使用
 */
export type ConversationMood = 
  | 'tired'      // 疲労（忙しい、疲れた、眠い）
  | 'happy'      // 喜び（楽しい、嬉しい、良かった）
  | 'anxious'    // 不安（心配、どうしよう）
  | 'frustrated' // イライラ（むかつく、最悪）
  | 'calm'       // 穏やか（まあまあ、普通）
  | 'excited'    // ワクワク（楽しみ、やった）
  | 'sad'        // 悲しい（悲しい、辛い、泣きたい）
  | 'neutral';   // 不明/中立

/**
 * 感情推測用のキーワードマッピング
 * ユーザーの発言にこれらのキーワードが含まれていれば、その感情と推測
 */
export const MOOD_KEYWORDS: Record<ConversationMood, string[]> = {
  tired: ['疲れ', '眠い', 'しんどい', '忙し', '大変', 'きつい', 'だるい', 'へとへと', 'くたくた', 'ぐったり'],
  happy: ['嬉し', '楽し', '良かった', 'よかった', '最高', 'ありがと', 'ハッピー', '幸せ', 'うれし'],
  anxious: ['心配', '不安', 'どうしよう', '怖い', '緊張', 'ドキドキ', 'やばい', 'まずい'],
  frustrated: ['むかつ', 'イライラ', '最悪', 'ひどい', '腹立', 'ムカ', 'うざ', 'いや'],
  calm: ['まあまあ', '普通', 'ふつう', 'いつも通り', '特に', '変わらない'],
  excited: ['楽しみ', 'ワクワク', 'やった', 'すごい', 'テンション', '早く'],
  sad: ['悲し', '辛い', 'つらい', '泣', '寂し', 'さみし', '落ち込', 'へこ'],
  neutral: [],
};

/**
 * 感情に応じた対応ヒント
 * AIがユーザーの状態を把握するためのヒントとして使用
 * 毎ターン送信するのではなく、状態変化時に送信
 * 敬語統一・選択肢付き質問を意識
 */
export const MOOD_RESPONSE_HINTS: Record<ConversationMood, string> = {
  tired: '（ユーザーは疲れている様子です。無理に話を広げず、寄り添う姿勢で。「お疲れ様です」より「それは大変でしたね」の方が自然です。選択肢を出すなら「お仕事ですか？それともプライベートですか？」）',
  happy: '（ユーザーは嬉しそうです。一緒に喜んでください。「それは良かったですね！」「嬉しいですね！」。詳しく聞くなら「誰かと一緒でしたか？それとも一人でですか？」）',
  anxious: '（ユーザーは不安そうです。アドバイスせず、聞き役に徹してください。「そうですか...それは気になりますね」。質問は控えめに）',
  frustrated: '（ユーザーはイライラしています。愚痴を聞く姿勢で。「それは嫌でしたね」「大変でしたね」。原因を聞くなら「何があったんですか？」）',
  calm: '（穏やかな様子です。自然に話題を広げてください。「今日は何かありましたか？嬉しいことでも、大変だったことでも」）',
  excited: '（ワクワクしています。そのテンションに合わせて盛り上げてください。「いいですね！」「楽しみですね！」）',
  sad: '（悲しそうです。慰めず、ただ一緒にいる感じで。「そうですか...」「大変でしたね...」。質問は控えめに）',
  neutral: '',
};

/**
 * 感情に応じた相槌パターン
 * 軽い反応が必要な場面で使用
 * 敬語統一
 */
export const MOOD_REACTIONS: Record<ConversationMood, string[]> = {
  tired: ['そうですか...', 'なるほど...', 'それは大変でしたね...'],
  happy: ['いいですね！', 'おお！', '嬉しいですね！'],
  anxious: ['そうですか...', 'なるほど...', '気になりますね...'],
  frustrated: ['ああ...', 'それは...', '大変でしたね...'],
  calm: ['なるほど', 'そうですか', 'なるほどですね'],
  excited: ['おお！', 'いいですね！', '楽しみですね！'],
  sad: ['...そうですか', 'そうでしたか...', '...'],
  neutral: ['なるほど', 'そうですか', 'そうなんですね'],
};

/**
 * 直近の会話テキストから感情を推測
 * @param recentTexts 直近のユーザー発言（複数）
 * @returns 推測された感情状態
 */
export function inferMoodFromTexts(recentTexts: string[]): ConversationMood {
  const combinedText = recentTexts.join(' ').toLowerCase();
  
  // 優先度順にチェック（ネガティブな感情を優先）
  const priorityOrder: ConversationMood[] = [
    'sad', 'frustrated', 'anxious', 'tired', 
    'excited', 'happy', 'calm', 'neutral'
  ];
  
  for (const mood of priorityOrder) {
    const keywords = MOOD_KEYWORDS[mood];
    if (keywords.some(keyword => combinedText.includes(keyword))) {
      return mood;
    }
  }
  
  return 'neutral';
}
