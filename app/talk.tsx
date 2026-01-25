// app/talk.tsx
// 通話画面 - 「画面」ではなく「通話セッション」として設計
// 状態マシン（CallState）に基づくUI表示と割り込み対応

import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallSession } from '../hooks/useCallSession';
import { StorageService } from '../services/storage';
import { CallState } from '../types/callSession';

// Assets
const CHARACTER_DEFAULT = require('../assets/images/character_default.png');
const CHARACTER_SPEAKING = require('../assets/images/character_speaking.png');

export default function TalkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isOnboarding = params.mode === 'onboarding';

  // アニメーション
  const [waveAnim] = useState(new Animated.Value(1));
  const [pulseAnim] = useState(new Animated.Value(1));
  const waveAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // ジャーナル生成中フラグ
  const [isGenerating, setIsGenerating] = useState(false);

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

  // 波形アニメーション（AI発話中）
  useEffect(() => {
    if (isAiTalking) {
      // AIが話している時はピンク色のパルス
      if (waveAnimRef.current) {
        waveAnimRef.current.stop();
      }
      waveAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, {
            toValue: 1.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(waveAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      waveAnimRef.current.start();
    } else {
      if (waveAnimRef.current) {
        waveAnimRef.current.stop();
      }
      waveAnim.setValue(1);
    }
  }, [isAiTalking]);

  // パルスアニメーション（リスニング中/ユーザー発話中）
  useEffect(() => {
    if (isConnected && !isAiTalking) {
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
      }
      const scale = isUserTalking ? 1.4 : 1.2;
      const duration = isUserTalking ? 400 : 1000;
      
      pulseAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: scale,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: duration,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimRef.current.start();
    } else {
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
      }
      pulseAnim.setValue(1);
    }
  }, [isConnected, isAiTalking, isUserTalking]);

  // 通話終了処理
  const handleClose = async () => {
    console.log('TalkScreen: handleClose started, isGenerating:', isGenerating);
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
      await StorageService.saveUserSettings({ isOnboarded: true });
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
    
    try {
      console.log('TalkScreen: Calling endConversation...');
      const journal = await endConversation();
      console.log('TalkScreen: endConversation returned:', journal);
      
      // ローカルタイムゾーンで日付を取得
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      if (journal) {
        console.log('TalkScreen: Saving journal to storage...');
        await StorageService.saveJournalEntry({
          id: Date.now().toString(),
          date: today,
          title: journal.title || '今日の日記',
          summary: journal.summary || '（要約なし）',
          emotion: (journal.emotion as any) || 'neutral',
          createdAt: Date.now()
        });
        console.log('TalkScreen: Journal saved successfully:', journal.title);
      } else {
        // フォールバック
        console.log('TalkScreen: No journal returned, using fallback');
        await StorageService.saveJournalEntry({
          id: Date.now().toString(),
          date: today,
          title: '今日の日記',
          summary: 'AIと会話しました。',
          emotion: 'neutral',
          createdAt: Date.now()
        });
      }
    } catch (e) {
      console.error('TalkScreen: Failed to generate/save journal', e);
    } finally {
      console.log('TalkScreen: Navigating back to home...');
      setIsGenerating(false);
      
      // 少し待ってからナビゲーション（状態更新が完了するのを待つ）
      setTimeout(() => {
        try {
          router.back();
        } catch (navError) {
          console.error('TalkScreen: Navigation error', navError);
          // バックが失敗した場合はreplaceでホームに戻る
          try {
            router.replace('/');
          } catch (replaceError) {
            console.error('TalkScreen: Replace navigation also failed', replaceError);
          }
        }
      }, 100);
    }
  };

  // 状態に応じたステータステキスト
  const getStatusText = (): string => {
    switch (callState) {
      case CallState.CONNECTING:
        return 'Connecting...';
      case CallState.LISTENING:
        return 'LISTENING...';
      case CallState.USER_TALKING:
        return 'LISTENING...';
      case CallState.AI_THINKING:
        return 'THINKING...';
      case CallState.AI_TALKING:
        return 'AI SPEAKING...';
      case CallState.INTERRUPTED:
        return 'LISTENING...';
      default:
        return '';
    }
  };

  // 背景色（状態に応じて変化）
  const getBackgroundColor = (): string => {
    if (isUserTalking) return 'bg-green-400';
    if (isAiTalking) return 'bg-pink-400';
    return 'bg-indigo-400';
  };

  return (
    <View className="flex-1 bg-indigo-900">
      {/* Loading Overlay */}
      {isGenerating && (
        <View className="absolute z-50 w-full h-full bg-black/60 items-center justify-center">
          <View className="bg-white p-6 rounded-2xl items-center">
            <Text className="text-lg font-bold text-slate-800 mb-2">日記を書いています...</Text>
            <Text className="text-sm text-slate-500">今日の思い出をまとめています</Text>
          </View>
        </View>
      )}

      <LinearGradient
        colors={['#312e81', '#4338ca', '#6366f1']}
        className="absolute w-full h-full"
      />
      
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 pt-8 pb-4">
          <TouchableOpacity 
            onPress={handleClose} 
            disabled={isGenerating}
            className="w-12 h-12 items-center justify-center rounded-full bg-black/30"
          >
            <Text className="text-white text-2xl font-bold">{isOnboarding ? '✓' : '×'}</Text>
          </TouchableOpacity>
          <View className="px-3 py-1 rounded-full bg-white/10">
            <Text className="text-white font-medium text-xs">AI VOICE JOURNAL</Text>
          </View>
        </View>

        {/* Character Display */}
        <View className="flex-1 items-center justify-center -mt-20">
          {/* Wave Effect Background (AI Speaking) */}
          {isAiTalking && (
            <Animated.View 
              style={{ 
                transform: [{ scale: waveAnim }],
                opacity: 0.4
              }}
              className="absolute w-72 h-72 rounded-full blur-3xl bg-pink-400"
            />
          )}
          
          {/* Pulse Effect Background (Listening/User Talking) */}
          {(isConnected && !isAiTalking) && (
            <Animated.View 
              style={{ 
                transform: [{ scale: pulseAnim }],
                opacity: 0.3
              }}
              className={`absolute w-72 h-72 rounded-full blur-3xl ${isUserTalking ? 'bg-green-400' : 'bg-indigo-400'}`}
            />
          )}
          
          <Image 
            source={isAiTalking ? CHARACTER_SPEAKING : CHARACTER_DEFAULT}
            className="w-80 h-80"
            resizeMode="contain"
          />
        </View>

        {/* Status Indicator */}
        <View className="items-center mb-16 h-20">
          {errorMessage ? (
            <Text className="text-red-300 font-medium">{errorMessage}</Text>
          ) : (
            <>
              <Text className="text-white/80 font-medium tracking-widest text-sm mb-4">
                {getStatusText()}
              </Text>
              
              {/* Visual Waveform */}
              <View className="flex-row items-center space-x-1 h-8">
                {[...Array(5)].map((_, i) => (
                  <View 
                    key={i} 
                    className={`w-1 bg-white/80 rounded-full transition-all duration-300 ${
                      isAiTalking 
                        ? 'h-8 animate-bounce' 
                        : isUserTalking
                          ? 'h-6'
                          : 'h-2'
                    }`} 
                  />
                ))}
              </View>
            </>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}
