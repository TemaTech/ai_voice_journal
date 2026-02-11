// app/talk.tsx
// 通話画面 - 「画面」ではなく「通話セッション」として設計
// 状態マシン（CallState）に基づくUI表示と割り込み対応

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JournalEditorModal } from '../components/JournalEditorModal';
import { VoiceVisualizer } from '../components/ui/VoiceVisualizer';
import { useCallSession } from '../hooks/useCallSession';
import { NotificationService } from '../services/notification';
import { JournalEntry, StorageService } from '../services/storage';
import { CallState } from '../types/callSession';

export default function TalkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isOnboarding = params.mode === 'onboarding';

  // ジャーナル生成中フラグ
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('日記を書いています...');
  
  // 編集用ステート
  const [editingJournal, setEditingJournal] = useState<JournalEntry | null>(null);

  // 通話時間ステート
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // 通話セッション（中核フック）
  const systemInstruction = isOnboarding 
    ? `あなたは新しい友達になるAIジャーナルです。
初めてお会いするので、自然に挨拶してください。

【話し方のルール】
・親しみやすく、でも押しつけがましくなく
・必ず「です」「ます」調の敬語で話してください
・最初は「こんにちは！私はあなたの日記のお手伝いをするAIです。お名前を教えていただけますか？」のようにシンプルに
・1文を短く
・質問は1つずつ
・相手のペースに合わせる

お名前を聞いたら、「いいお名前ですね」と軽く反応して、普通の会話を続けてください。
その後は「今日はどんな1日でしたか？良いことがありましたか？それとも大変でしたか？」のように選択肢を出して聞いてください。`
    : undefined;

  const {
    callState,
    isConnected,
    isAiTalking,
    isUserTalking,
    isMuted,
    toggleMute,
    errorMessage,
    connect,
    disconnect,
    endConversation,
  } = useCallSession({
    systemInstruction,
    onStateChange: (newState, prevState) => {
      console.log(`TalkScreen: State ${prevState} -> ${newState}`);
    },
    onError: (error) => {
      console.error('TalkScreen: Error', error);
    },
  });

  // セッション開始
  const connectRef = useRef(connect);
  const disconnectRef = useRef(disconnect);
  connectRef.current = connect;
  disconnectRef.current = disconnect;
  
  useEffect(() => {
    // 画面表示時に接続開始
    console.log('TalkScreen: Mount effect');
    const timer = setTimeout(() => {
      console.log('TalkScreen: Calling connect()');
      connectRef.current();
    }, 500);

    return () => {
      console.log('TalkScreen: Unmount, disconnecting...');
      clearTimeout(timer);
      disconnectRef.current();
    };
  }, []);

  // タイマー処理
  useEffect(() => {
    let interval: number;
    if (isConnected) {
      interval = window.setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [isConnected]);

  // 時間フォーマット関数 (MM:SS)
  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // キャンセル処理（会話を破棄して終了）
  const handleCancel = () => {
    console.log('TalkScreen: Cancelling conversation');
    disconnect();
    router.back();
  };

  // 完了処理（会話終了・日記生成）
  const handleFinish = async () => {
    console.log('TalkScreen: handleFinish started, isGenerating:', isGenerating);
    if (isGenerating) return;

    if (isOnboarding) {
      // オンボーディング完了
      console.log('TalkScreen: Onboarding completion flow');
      const today = new Date().toISOString().split('T')[0];
      await StorageService.saveJournalEntry({
        id: Date.now().toString(),
        date: today,
        title: 'はじめましての日記',
        summary: 'AIジャーナルと初めて出会った。これから毎日の記録をつけていくのが楽しみだ。',
        emotion: 'happy',
        createdAt: Date.now()
      });

      // 通知許可の確認
      const granted = await NotificationService.registerForPushNotificationsAsync();
      
      const settingsUpdate = {
        isOnboarded: true,
        notificationEnabled: granted,
        notificationTime: '21:00'
      };

      if (granted) {
         await NotificationService.scheduleDailyReminder(21, 0);
      }

      await StorageService.saveUserSettings(settingsUpdate);
      
      disconnect();
      try {
        router.replace('/');
      } catch (navError) {
        console.error('TalkScreen: Navigation error (onboarding)', navError);
      }
      return;
    }

    // 日記生成
    console.log('TalkScreen: Starting journal generation');
    setIsGenerating(true);
    setLoadingMessage('今日の思い出を振り返っています...');
    
    // 演出用タイマー（UX向上のため、段階的にメッセージを変える）
    const msgTimer1 = setTimeout(() => setLoadingMessage('会話の要点をまとめています...'), 1500);
    const msgTimer2 = setTimeout(() => setLoadingMessage('素敵なタイトルを考えています...'), 3500);
    const msgTimer3 = setTimeout(() => setLoadingMessage('日記帳に書き込んでいます...'), 5500);
    
    try {
      console.log('TalkScreen: Calling endConversation...');
      const journal = await endConversation();
      console.log('TalkScreen: endConversation returned:', journal);
      
      // ローカルタイムゾーンで日付を取得
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      const newEntry: JournalEntry = {
        id: Date.now().toString(),
        date: today,
        title: journal?.title || '今日の日記',
        summary: journal?.summary || '（会話の内容から日記を生成できませんでした）',
        emotion: (journal?.emotion as any) || 'neutral',
        createdAt: Date.now()
      };

      // 生成完了 -> 編集モーダルを表示
      clearTimeout(msgTimer1);
      clearTimeout(msgTimer2);
      clearTimeout(msgTimer3);
      setIsGenerating(false);
      setEditingJournal(newEntry);
      
    } catch (e) {
      console.error('TalkScreen: Failed to generate journal', e);
      clearTimeout(msgTimer1);
      clearTimeout(msgTimer2);
      clearTimeout(msgTimer3);
      setIsGenerating(false);
      // エラー時は強制的にホームに戻るか、エラーダイアログを出すべきだが、
      // ここではとりあえずホームに戻す（既存動作維持）
      router.back();
    }
  };

  // 編集後の保存処理
  const handleSaveJournal = async (entry?: JournalEntry) => {
    const journalToSave = entry || editingJournal;
    if (!journalToSave) return;
    
    try {
      await StorageService.saveJournalEntry(journalToSave);
      console.log('TalkScreen: Journal saved successfully');
      setEditingJournal(null);
      router.back();
    } catch (e) {
      console.error('TalkScreen: Failed to save journal', e);
    }
  };

  return (
    <View className="flex-1 bg-indigo-900">
      {/* Loading Overlay */}
      {isGenerating && (
        <View className="absolute z-50 w-full h-full bg-black/60 items-center justify-center">
          <View className="bg-white p-6 rounded-2xl items-center shadow-2xl w-64">
             <View className="mb-4">
                <Text className="text-4xl">✨</Text>
             </View>
            <Text className="text-lg font-bold text-slate-800 mb-2 text-center">AIが執筆中</Text>
            <Text className="text-sm text-slate-500 text-center leading-5">{loadingMessage}</Text>
          </View>
        </View>
      )}

      <LinearGradient
        colors={['#1e1b4b', '#312e81', '#4c1d95']} // Deep Midnight Blue -> Indigo -> Deep Purple
        className="absolute w-full h-full"
      />
      
      <SafeAreaView className="flex-1 relative" edges={['bottom']}>
        {/* Top Controls */}
        <View 
          className="w-full flex-row items-center justify-between px-6 z-40"
          style={{ paddingTop: 60 }} // Manual padding for Status Bar / Dynamic Island
        >
           {/* Cancel Button (Top Left) */}
           <TouchableOpacity 
             onPress={handleCancel}
             disabled={isGenerating}
             className="w-10 h-10 rounded-full bg-white/10 items-center justify-center backdrop-blur-md active:bg-white/20"
           >
             <Ionicons name="close" size={24} color="white" />
           </TouchableOpacity>

           {/* Timer Section (Top Center) */}
           <View className="items-center">
             <Text className="text-blue-400 font-bold text-[10px] tracking-widest uppercase mb-1">LIVE SESSION</Text>
             <Text className="text-white text-2xl font-semibold tracking-wider font-mono">
               {formatTime(elapsedSeconds)}
             </Text>
           </View>
           
           {/* Spacer to balance layout */}
           <View className="w-10" />
        </View>

        {/* Main Content: Visualizer */}
        <View className="flex-1 items-center justify-center mb-20">
          <VoiceVisualizer 
            state={
              callState === CallState.CONNECTING ? 'connecting' :
              callState === CallState.AI_THINKING ? 'aiThinking' :
              isAiTalking ? 'aiTalking' :
              isUserTalking ? 'userTalking' :
              'listening'
            }
          />
          
          {/* Status Text (Below Visualizer) */}
          <View className="mt-12 items-center">
             <Text className="text-white/90 text-xl font-medium text-center leading-8 shadow-sm">
               {isAiTalking ? '話しています...' :
                isUserTalking ? '聞いています...' :
                callState === CallState.CONNECTING ? '接続中...' :
                callState === CallState.AI_THINKING ? '考え中...' :
                isMuted ? 'マイクオフ' :
                'お話しください'}
             </Text>
             {!isAiTalking && !isUserTalking && !isMuted && (
                <Text className="text-white/40 text-sm mt-2 font-light">
                   いつでも話しかけてください
                </Text>
             )}
          </View>
        </View>

        {/* Bottom Control Bar */}
        <View className="absolute bottom-12 w-full flex-row items-center justify-between px-8">
           {/* Mute Button (Bottom Left) */}
           <TouchableOpacity 
             onPress={toggleMute}
             className={`w-14 h-14 rounded-full items-center justify-center backdrop-blur-md transition-all ${
               isMuted ? 'bg-white text-indigo-900' : 'bg-white/10 text-white'
             }`}
           >
             <Ionicons 
               name={isMuted ? "mic-off" : "mic"} 
               size={24} 
               color={isMuted ? "#312e81" : "white"} 
             />
           </TouchableOpacity>

           {/* Finish Button (Bottom Right/Center) */}
           <TouchableOpacity 
             onPress={handleFinish} 
             disabled={isGenerating}
             className="flex-1 ml-6 h-14 bg-blue-500 rounded-full flex-row items-center justify-center shadow-lg shadow-blue-900/40 active:bg-blue-600"
           >
             <Text className="text-white font-bold text-lg">会話を終了</Text>
           </TouchableOpacity>
        </View>

        {/* Error Message Toast */}
        {errorMessage && (
          <View className="absolute top-32 w-full items-center px-6">
            <View className="px-4 py-3 rounded-xl bg-red-500/90 backdrop-blur-md shadow-lg">
              <Text className="text-white font-medium text-center">{errorMessage}</Text>
            </View>
          </View>
        )}

      </SafeAreaView>

      {/* Edit Journal Modal */}
      <JournalEditorModal 
         visible={editingJournal !== null}
         initialEntry={editingJournal}
         onSave={(updatedEntry) => {
           setEditingJournal(updatedEntry);
           handleSaveJournal(updatedEntry);
         }}
         onCancel={() => {
           setEditingJournal(null);
           router.back();
         }}
      />
    </View>
  );
}
