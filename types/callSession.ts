// types/callSession.ts
// 通話状態マシンの型定義

/**
 * 通話の状態を表すenum
 * ChatGPT音声モードのようなスムーズな会話を実現するための状態管理
 */
export enum CallState {
  /** WebSocket接続中 */
  CONNECTING = 'CONNECTING',
  /** ユーザー発話待ち（AI沈黙中） */
  LISTENING = 'LISTENING',
  /** ユーザー発話中 */
  USER_TALKING = 'USER_TALKING',
  /** AI応答生成中 */
  AI_THINKING = 'AI_THINKING',
  /** AI発話中 */
  AI_TALKING = 'AI_TALKING',
  /** ユーザー割り込み発生（AIを中断中） */
  INTERRUPTED = 'INTERRUPTED',
  /** 通話終了 */
  ENDED = 'ENDED',
}

/**
 * 会話ログの1エントリ
 * 日記生成のために蓄積する
 */
export interface ConversationLog {
  /** タイムスタンプ（Unix milliseconds） */
  timestamp: number;
  /** 発話者 */
  speaker: 'user' | 'ai';
  /** 発話内容（テキスト） */
  text: string;
}

/**
 * 通話セッションの設定
 */
export interface CallSessionConfig {
  /** システムインストラクション（AIのキャラクター設定） */
  systemInstruction?: string;
  /** 無音後のAI問いかけまでの秒数（デフォルト: 3秒） */
  silenceTimeoutMs?: number;
  /** 会話ログが追加された時のコールバック */
  onConversationLog?: (log: ConversationLog) => void;
  /** 状態変更時のコールバック */
  onStateChange?: (state: CallState, prevState: CallState) => void;
  /** エラー発生時のコールバック */
  onError?: (error: Error) => void;
}

/**
 * 通話セッションの状態
 */
export interface CallSessionState {
  /** 現在の通話状態 */
  callState: CallState;
  /** 接続済みかどうか */
  isConnected: boolean;
  /** ユーザーが発話中かどうか */
  isUserTalking: boolean;
  /** AIが発話中かどうか */
  isAiTalking: boolean;
  /** エラーメッセージ */
  errorMessage: string | null;
  /** 会話ログ */
  conversationLogs: ConversationLog[];
}

/**
 * 軽い合いの手プロンプト（15秒の沈黙時）
 * 質問ではなく、待っている・聞いている姿勢を示す
 * 敬語統一
 */
export const LIGHT_SILENCE_PROMPTS = [
  '（軽く相槌を打って：「うんうん」「なるほど」など短く一言だけ）',
  '（待っている様子で：少し間を置いてから「...そうですか」と短く）',
  '（考えている様子を見せて：「うーん...」と軽く）',
  '（相手の話を受けて：「えー...」と短く）',
];

/**
 * 深い沈黙時のプロンプト（30秒の沈黙時）
 * 自然な問いかけで会話を再開する
 * 敬語統一・選択肢付き質問を意識
 */
export const DEEP_SILENCE_PROMPTS = [
  '（自然に問いかけて：「今、何か考えていましたか？」）',
  '（優しく：「話しにくいことがあれば、無理しなくて大丈夫ですよ」）',
  '（選択肢を出して：「他に何かありましたか？嬉しいことでも、大変だったことでも」）',
  '（軽く：「えー...お疲れですか？それとも考え中ですか？」）',
  '（さりげなく：「そういえば今日は、忙しかったですか？」）',
];

/**
 * 旧APIとの互換性のため維持（廃止予定）
 * @deprecated 代わりに getLightSilencePrompt または getDeepSilencePrompt を使用
 */
export const SILENCE_PROMPTS = DEEP_SILENCE_PROMPTS;

/**
 * 軽い合いの手をランダムに取得（6〜8秒沈黙時用）
 */
export const getLightSilencePrompt = (): string => {
  const index = Math.floor(Math.random() * LIGHT_SILENCE_PROMPTS.length);
  return LIGHT_SILENCE_PROMPTS[index];
};

/**
 * 深い沈黙時のプロンプトをランダムに取得（10秒以上沈黙時用）
 */
export const getDeepSilencePrompt = (): string => {
  const index = Math.floor(Math.random() * DEEP_SILENCE_PROMPTS.length);
  return DEEP_SILENCE_PROMPTS[index];
};

/**
 * ランダムな無音プロンプトを取得
 * @deprecated 代わりに getLightSilencePrompt または getDeepSilencePrompt を使用
 */
export const getRandomSilencePrompt = (): string => {
  return getDeepSilencePrompt();
};
