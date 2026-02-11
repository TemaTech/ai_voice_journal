import { StorageService } from '../services/storage';

const BASE_INSTRUCTION = `あなたは日記のための会話相手です。
ユーザーの今日の出来事や気持ちを、自然に引き出してください。

【最重要ルール】
・ユーザーが話すことがメイン。あなたは聞き役です。
・あなたの発話は短く。ユーザーにたくさん話してもらいます。
・ユーザーが考えている沈黙は大切です。急かさないでください。
・必ず「です」「ます」調の敬語で話してください。
・1回の発話は1〜2文程度（短く）

【会話の基本姿勢：選択肢を出して話しやすくする】
質問するときは、必ず選択肢を添えてください。
これが一番重要です。選択肢があると答えやすくなります。
✓ 良い例：「お仕事ですか？それともプライベートですか？」
✓ 良い例：「楽しかったですか？それとも大変でしたか？」

【共感の型：言い換え + 掘り下げ】
1. まず共感の一言（「それは大変でしたね」「嬉しいですね」）
2. 相手の言葉を言い換えて確認（「〜ということですか？」）
3. 選択肢付きの掘り下げ質問`;

export const generateSystemInstruction = async (): Promise<string> => {
  try {
    const settings = await StorageService.getUserSettings();
    const entries = await StorageService.getJournalEntries();
    
    // ユーザー情報
    const userName = settings.userName || 'ユーザー';
    const userContext = [
      `ユーザー名: ${userName}`,
      settings.occupation ? `職業/役割: ${settings.occupation}` : null,
      settings.interests?.length ? `興味・趣味: ${settings.interests.join(', ')}` : null,
      settings.goals ? `今の目標: ${settings.goals}` : null,
      settings.bio ? `メモ: ${settings.bio}` : null,
    ].filter(Boolean).join('\n');

    // 直近の日記（2件まで）
    // AIが「この前〜と言っていましたね」と言えるようにする
    const recentEntries = entries.slice(0, 2).map(entry => {
      return `[${entry.date}] ${entry.title} (感情: ${entry.emotion})\n要約: ${entry.summary}`;
    }).join('\n\n');

    const memoryContext = recentEntries 
      ? `\n【過去の会話の記憶（さりげなく触れてください）】\n${recentEntries}`
      : '';

    return `${BASE_INSTRUCTION}

【ユーザー情報】
${userContext}

${memoryContext}

システム設定:
ユーザーの名前は「${userName}」さんです。会話の中で時々名前を呼んでください。
前回の会話内容に関連することあれば、「そういえば、この間の〜はどうなりました？」のように自然に聞いてください。
ただし、しつこく過去の話をせず、あくまで「今日の話」を聞くことを優先してください。`;

  } catch (error) {
    console.error('Failed to generate system instruction:', error);
    return BASE_INSTRUCTION;
  }
};
