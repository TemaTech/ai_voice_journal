import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZenHeading, ZenText } from '../../components/ui/Typography';
import { useTheme } from '../../hooks/useTheme';
import { getGeminiRestService } from '../../services/gemini-rest';
import { RecoveryService } from '../../services/recovery';
import { JournalEntry, StorageService, UserSettings } from '../../services/storage';
import { calculateStreak } from '../../utils/date';

// Helper to calculate streak


export default function HomeScreen() {
  const router = useRouter();
  const { isDark, activeColors } = useTheme();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [latestEntry, setLatestEntry] = useState<JournalEntry | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  
  // Animation for Streak
  const scale = useSharedValue(1);

  useFocusEffect(
    useCallback(() => {
        scale.value = withRepeat(
            withSequence(
                withTiming(1.2, { duration: 500, easing: Easing.inOut(Easing.ease) }),
                withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, [])
  );

  const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
  }));

  // Date Logic
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  const currentWeekday = today.getDay();

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const userSettings = await StorageService.getUserSettings();
    const journalEntries = await StorageService.getJournalEntries();
    setSettings(userSettings);
    setEntries(journalEntries);
    
    // Onboarding Check
    if (!userSettings.isOnboarded) {
      router.replace('/talk?mode=onboarding');
      return;
    }

    if (journalEntries.length > 0) {
      setLatestEntry(journalEntries[0]);
    }

    // Check for interrupted session
    const hasPending = await RecoveryService.hasPendingSession();
    if (hasPending) {
      Alert.alert(
        '中断された会話があります',
        '前回の会話ログを日記として保存しますか？',
        [
          {
            text: '破棄する',
            style: 'destructive',
            onPress: async () => {
              await RecoveryService.clear();
            }
          },
          {
            text: '保存する',
            onPress: async () => {
              try {
                const logs = await RecoveryService.getLogs();
                // ログをテキストに変換
                const history = logs.map(l => `${l.speaker === 'user' ? 'ユーザー' : 'AI'}: ${l.text}`).join('\n');
                
                // REST APIで生成
                const restService = getGeminiRestService();
                const journal = await restService.generateJournal(history).catch(() => ({
                   title: '復元された日記',
                   summary: '【API生成エラー】\n' + history,
                   emotion: 'neutral' as const
                }));

                const now = new Date();
                const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                
                await StorageService.saveJournalEntry({
                  id: Date.now().toString(),
                  date: today,
                  title: journal.title,
                  summary: journal.summary,
                  emotion: journal.emotion,
                  createdAt: Date.now()
                });
                
                await RecoveryService.clear();
                Alert.alert('完了', '日記を復元しました');
                loadData(); // Reload list
              } catch (e) {
                Alert.alert('エラー', '復元に失敗しました');
               console.error(e);
              }
            }
          }
        ]
      );
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }}>
       <Stack.Screen options={{ headerShown: false }} />
       {/* Background Gradient */}
       <LinearGradient
        colors={isDark ? ['#1C1C1E', '#2C2C2E', '#1C1C1E'] : ['#F9FAFB', '#F3F4F6', '#EBEBF0']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      
      {/* Top Decorative Circle (Subtle) */}
      <View className="absolute -top-32 -left-32 w-80 h-80 bg-indigo-100 rounded-full blur-3xl opacity-60" />

      <SafeAreaView className="flex-1">
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          
          {/* Header */}
          <View className="px-6 pt-6 pb-2 flex-row justify-between items-center">
             <View>
               <ZenText className="text-xs font-bold mb-1" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>おかえりなさい</ZenText>
               <ZenHeading level={1} className="text-2xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1E293B' }}>
                  {settings?.userName || 'ゲスト'} さん
               </ZenHeading>
             </View>
             {/* Streak Badge */}
             <View className="px-4 py-2 rounded-full border flex-row items-center gap-2 shadow-sm" style={{ 
                 backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                 borderColor: isDark ? '#334155' : '#E2E8F0'
             }}>
                <Animated.Text style={animatedStyle} className="text-lg">🔥</Animated.Text>
                <ZenText className="font-bold" style={{ color: isDark ? '#E2E8F0' : '#334155' }}>{calculateStreak(entries)}日連続</ZenText>
             </View>
          </View>

          {/* Progress Circle Section */}
          <View className="items-center justify-center my-8">
             <View className="w-48 h-48 rounded-full border-[12px] justify-center items-center relative shadow-inner" style={{
                 borderColor: isDark ? '#334155' : '#E2E8F0',
                 backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(255, 255, 255, 0.5)'
             }}>
                 {/* Progress Arc */}
                 {(() => {
                    const percentage = Math.min(100, Math.round((entries.filter(e => {
                        const d = new Date(e.date);
                        const now = new Date();
                        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
                      }).length / 1) * 100));
                                        if (percentage >= 100) {
                        return <View className="absolute inset-0 rounded-full border-[12px] opacity-100" style={{ borderColor: activeColors.primary, margin: -12 }} />;
                    } else if (percentage > 0) {
                        // For partial progress, keep the rotated semi-circle look but maybe adjust
                        // Since exact arc is hard without SVG, let's just stick to the visual the user saw but fix 100% case.
                        return (
                            <View className="absolute w-48 h-48 rounded-full border-[12px] border-t-transparent border-l-transparent rotate-45 opacity-100" style={{ borderColor: activeColors.primary }} />
                        );
                    }
                    return null;
                 })()}
                 
                 <View className="items-center">
                    <ZenHeading level={1} className="text-5xl font-bold mb-1" style={{ color: isDark ? '#FFFFFF' : '#1E293B' }}>
                      {Math.min(100, Math.round((entries.filter(e => {
                        const d = new Date(e.date);
                        const now = new Date();
                        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
                      }).length / 1) * 100))}%
                    </ZenHeading>
                    <ZenText className="text-sm font-medium" style={{ color: isDark ? '#94A3B8' : '#94A3B8' }}>今日の目標</ZenText>
                 </View>
             </View>
             <ZenText className="text-slate-500 mt-4 font-medium">10分中 6分 完了 (Coming Soon)</ZenText>
          </View>

          {/* MAIN ACTION: Talk to AI */}
          <View style={{ paddingHorizontal: 24, marginBottom: 40 }}>
               <TouchableOpacity 
                 activeOpacity={0.85} 
                 onPress={() => {
                   console.log('Talk Button pressed');
                   router.push('/talk');
                 }}
                 style={{
                   shadowColor: activeColors.primary,
                   shadowOffset: { width: 0, height: 8 },
                   shadowOpacity: 0.3,
                   shadowRadius: 16,
                   elevation: 8,
                 }}
               >
                  <LinearGradient
                     colors={[activeColors.primary, activeColors.dark]}
                     start={{ x: 0, y: 0 }}
                     end={{ x: 1, y: 1 }}
                     style={{
                       borderRadius: 9999,
                       paddingVertical: 18,
                       paddingHorizontal: 32,
                       flexDirection: 'row',
                       alignItems: 'center',
                       justifyContent: 'center',
                       gap: 12,
                     }}
                  >
                     <View style={{
                       backgroundColor: 'rgba(255,255,255,0.2)',
                       padding: 10,
                       borderRadius: 9999,
                     }}>
                        <Ionicons name="mic" size={24} color="white" />
                     </View>
                     <ZenText style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>AIと話す</ZenText>
                  </LinearGradient>
               </TouchableOpacity>
          </View>

          {/* Weekly Insights (Detailed) */}
          <View className="px-6 pb-4">
               <View className="flex-row items-center gap-2 mb-4">
                 <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }}>
                    <Ionicons name="analytics" size={14} color={activeColors.primary} />
                 </View>
                 <ZenHeading level={3} className="text-slate-700 text-lg font-bold">今週のインサイト</ZenHeading>
              </View>

              <View className="rounded-3xl p-5 border shadow-sm mb-4 relative overflow-hidden" style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: isDark ? '#334155' : '#EEF2FF',
              }}>
                <LinearGradient
                    colors={[activeColors.light + '20', 'transparent']} // 20 is hex opacity ~12%
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80 }}
                 />
                 
                 {entries.length > 0 ? (
                    (() => {
                        const now = new Date();
                        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
                        // Filter entries for this week
                        const weekEntries = entries.filter(e => new Date(e.date) >= startOfWeek);
                        const count = weekEntries.length;
                        
                        // Calculate Top Mood
                        const moodCounts: Record<string, number> = {};
                        weekEntries.forEach(e => {
                            moodCounts[e.emotion] = (moodCounts[e.emotion] || 0) + 1;
                        });
                        let topMood = 'neutral';
                        let maxMoodCount = 0;
                        Object.entries(moodCounts).forEach(([mood, c]) => {
                            if (c > maxMoodCount) {
                                maxMoodCount = c;
                                topMood = mood;
                            }
                        });

                        return (
                            <View>
                                <View className="flex-row justify-between items-start mb-4">
                                    <View>
                                        <ZenText className="text-xs font-bold mb-1" style={{ color: activeColors.primary }}>WEEKLY VIBE</ZenText>
                                        <ZenHeading level={2} className="text-2xl font-bold capitalize" style={{ color: isDark ? '#FFFFFF' : '#1E293B' }}>
                                            {count > 0 ? `${topMood}な1週間` : 'まだ記録がありません'}
                                        </ZenHeading>
                                    </View>
                                    <View className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                                        <ZenText className="text-xs font-bold" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>{count}回の会話</ZenText>
                                    </View>
                                </View>
                                
                                <ZenText className="text-sm leading-relaxed mb-4" style={{ color: isDark ? '#CBD5E1' : '#64748B' }}>
                                    {count === 0 ? '今週はまだAIと話していません。\n週末に向けて、少しお話しませんか？' : 
                                     topMood === 'happy' ? '素晴らしい1週間でしたね！ポジティブなエネルギーが溢れています。' :
                                     topMood === 'sad' ? '少し落ち込むことがあったようです。無理せずリラックスしてください。' :
                                     topMood === 'tired' ? 'お疲れのようですね。週末はゆっくり休みましょう。' :
                                     '落ち着いた1週間を過ごせているようです。この調子でいきましょう。'}
                                </ZenText>

                                <Link href="/(tabs)/calendar" asChild>
                                   <TouchableOpacity className="flex-row items-center">
                                        <ZenText className="font-bold text-sm mr-1" style={{ color: activeColors.primary }}>詳しく見る</ZenText>
                                        <Ionicons name="arrow-forward" size={14} color={activeColors.primary} />
                                   </TouchableOpacity>
                                </Link>
                            </View>
                        );
                    })()
                 ) : (
                    <View className="py-4 items-center">
                         <ZenText className="text-center mb-2" style={{ color: isDark ? '#94A3B8' : '#94A3B8' }}>今週のデータがありません</ZenText>
                         <ZenText className="text-xs text-center" style={{ color: isDark ? '#94A3B8' : '#94A3B8' }}>AIと話して、あなたの1週間を可視化しましょう。</ZenText>
                    </View>
                 )}
              </View>
          </View>

          {/* Weekly Goals */}
          <View className="px-6 pb-20">
              <View className="rounded-3xl p-5 border shadow-sm" style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: isDark ? '#334155' : '#EEF2FF'
              }}>
                 <View className="flex-row justify-between items-start mb-4">
                    <View>
                       <ZenHeading level={3} className="text-base font-bold" style={{ color: isDark ? '#FFFFFF' : '#334155' }}>今週の目標</ZenHeading>
                       <ZenText className="text-xs" style={{ color: isDark ? '#94A3B8' : '#94A3B8' }}>7日中 {
                         (() => {
                           const now = new Date();
                           const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
                           const count = new Set(entries.filter(e => new Date(e.date) >= startOfWeek).map(e => e.date)).size;
                           return count;
                         })()
                       }日 達成</ZenText>
                    </View>
                    <View className="flex-row gap-1">
                       {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => {
                          const now = new Date();
                          const dayOfWeek = now.getDay();
                          const entryDatesThisWeek = new Set(entries.filter(e => {
                             const entryDate = new Date(e.date);
                             const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
                             return entryDate >= startOfWeek;
                          }).map(e => e.date));

                          const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayOfWeek - i));
                          const checkDateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
                          const isTalked = entryDatesThisWeek.has(checkDateStr);
                          const isFuture = checkDate > now;

                          return (
                            <View key={day} className={`w-6 h-6 rounded-full items-center justify-center`} style={
                                isTalked 
                                 ? { backgroundColor: activeColors.primary } 
                                 : { backgroundColor: isFuture ? (isDark ? '#334155' : '#F1F5F9') : (isDark ? '#475569' : '#E2E8F0') }
                            }>
                               <ZenText className={`text-[10px] font-bold ${isTalked ? 'text-white' : ''}`} style={
                                   !isTalked ? { color: isDark ? '#94A3B8' : '#94A3B8' } : undefined
                               }>{day}</ZenText>
                            </View>
                          );
                       })}
                    </View>
                 </View>
                 
                 {/* Progress Bar */}
                 <View className="h-3 rounded-full overflow-hidden w-full" style={{ backgroundColor: isDark ? '#334155' : '#F1F5F9' }}>
                    <View className="h-full rounded-full" style={{ 
                        backgroundColor: activeColors.primary,
                        width: `${Math.min(100, (
                         (() => {
                           const now = new Date();
                           const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
                           const count = new Set(entries.filter(e => new Date(e.date) >= startOfWeek).map(e => e.date)).size;
                           return (count / 7) * 100;
                         })()
                    ))}%` }} />
                 </View>
              </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
