import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZenHeading, ZenText } from '../../components/ui/Typography';
import { getGeminiRestService } from '../../services/gemini-rest';
import { RecoveryService } from '../../services/recovery';
import { JournalEntry, StorageService, UserSettings } from '../../services/storage';

// Helper to calculate streak
const calculateStreak = (entries: JournalEntry[]): number => {
  if (entries.length === 0) return 0;

  // Get unique dates sorted descending
  const uniqueDates = Array.from(new Set(entries.map(e => e.date))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  
  if (uniqueDates.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // Check if the most recent entry is today or yesterday
  const lastEntryDate = new Date(uniqueDates[0]);
  const diffTime = Math.abs(today.getTime() - lastEntryDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  
  // If last entry is older than yesterday (> 1 day gap), streak is 0 (unless it's today, diff is 0 or 1 depending on time, but simplified check: strictly date usage)
  // Let's use simple string logic for robust dates
  
  let currentDate = new Date();
  let checkStr = todayStr;
  
  // If today has no entry, check check yesterday first to see if streak is alive
  if (uniqueDates[0] !== checkStr) {
     const yesterday = new Date();
     yesterday.setDate(yesterday.getDate() - 1);
     const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
     
     if (uniqueDates[0] !== yesterdayStr) {
         return 0; // Streak broken
     }
     checkStr = yesterdayStr;
  }

  // Count backwards
  for (const dateStr of uniqueDates) {
      if (dateStr === checkStr) {
          streak++;
          // Move checkStr back one day
          const d = new Date(checkStr);
          d.setDate(d.getDate() - 1);
          checkStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } else {
          break;
      }
  }

  return streak;
};

export default function HomeScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [latestEntry, setLatestEntry] = useState<JournalEntry | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);

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
    <View className="flex-1 bg-zen-bg">
       <Stack.Screen options={{ headerShown: false }} />
       {/* Background Gradient */}
       <LinearGradient
        colors={['#F9FAFB', '#F3F4F6', '#EBEBF0']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      
      {/* Top Decorative Circle (Subtle) */}
      <View className="absolute -top-32 -left-32 w-80 h-80 bg-indigo-100 rounded-full blur-3xl opacity-60" />

      <SafeAreaView className="flex-1">
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          
          {/* Header */}
          <View className="px-6 pt-6 pb-2 flex-row justify-between items-center">
             <View>
               <ZenText className="text-slate-500 text-xs font-bold mb-1">おかえりなさい</ZenText>
               <ZenHeading level={1} className="text-slate-800 text-2xl font-bold">
                  {settings?.userName || 'ゲスト'} さん
               </ZenHeading>
             </View>
             {/* Streak Badge */}
             <View className="bg-white px-4 py-2 rounded-full border border-slate-200 flex-row items-center gap-2 shadow-sm">
                <ZenText className="text-orange-500 text-lg">🔥</ZenText>
                <ZenText className="text-slate-700 font-bold">{calculateStreak(entries)}日連続</ZenText>
             </View>
          </View>

          {/* Progress Circle Section */}
          <View className="items-center justify-center my-8">
             <View className="w-48 h-48 rounded-full border-[12px] border-slate-200 justify-center items-center relative shadow-inner bg-white/50">
                 {/* Progress Arc */}
                 {(() => {
                    const percentage = Math.min(100, Math.round((entries.filter(e => {
                        const d = new Date(e.date);
                        const now = new Date();
                        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
                      }).length / 1) * 100));
                    
                    if (percentage >= 100) {
                        return <View className="absolute inset-0 rounded-full border-[12px] border-blue-500 opacity-100" style={{ margin: -12 }} />;
                    } else if (percentage > 0) {
                        // For partial progress, keep the rotated semi-circle look but maybe adjust
                        // Since exact arc is hard without SVG, let's just stick to the visual the user saw but fix 100% case.
                        return (
                            <View className="absolute w-48 h-48 rounded-full border-[12px] border-blue-500 border-t-transparent border-l-transparent rotate-45 opacity-100" />
                        );
                    }
                    return null;
                 })()}
                 
                 <View className="items-center">
                    <ZenHeading level={1} className="text-slate-800 text-5xl font-bold mb-1">
                      {Math.min(100, Math.round((entries.filter(e => {
                        const d = new Date(e.date);
                        const now = new Date();
                        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
                      }).length / 1) * 100))}%
                    </ZenHeading>
                    <ZenText className="text-slate-400 text-sm font-medium">今日の目標</ZenText>
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
                   shadowColor: '#8B5CF6',
                   shadowOffset: { width: 0, height: 8 },
                   shadowOpacity: 0.3,
                   shadowRadius: 16,
                   elevation: 8,
                 }}
               >
                  <LinearGradient
                     colors={['#8B5CF6', '#7C3AED']}
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

          {/* Highlight & Recap Section */}
          <View className="px-6 pb-20">
             <View className="flex-row items-center gap-2 mb-4">
                <View className="bg-indigo-100 rounded-full w-6 h-6 items-center justify-center">
                   <Ionicons name="sparkles" size={14} color="#6366F1" />
                </View>
                <ZenHeading level={3} className="text-slate-700 text-lg font-bold">会話のハイライト</ZenHeading>
             </View>

             {/* Dynamic Highlight Card */}
             <View className="bg-white rounded-3xl p-5 border border-indigo-50 shadow-sm mb-4">
                {entries.length > 0 ? (
                  (() => {
                    // Pick a random entry or the latest one for now
                    const highlightEntry = entries.length > 0 ? entries[Math.floor(Math.random() * entries.length)] : null;
                    if (!highlightEntry) return null;

                    return (
                        <>
                           <View className="flex-row items-center gap-2 mb-2">
                              <View className="bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                                <ZenText className="text-indigo-500 text-[10px] font-bold">
                                    {new Date(highlightEntry.date).toLocaleDateString('ja-JP')} の記録
                                </ZenText>
                              </View>
                           </View>
                           <ZenHeading level={3} className="text-slate-800 text-lg font-bold mb-2">
                             {highlightEntry.title}
                           </ZenHeading>
                           <ZenText className="text-slate-500 text-sm leading-relaxed mb-4" numberOfLines={3}>
                             {highlightEntry.summary}
                           </ZenText>
                           
                           <Link href="/(tabs)/history" asChild>
                               <TouchableOpacity className="self-start">
                                    <ZenText className="text-indigo-500 font-bold text-sm">振り返る →</ZenText>
                               </TouchableOpacity>
                           </Link>
                        </>
                    );
                  })()
                ) : (
                    <View className="py-4 items-center">
                        <ZenText className="text-slate-400 text-center">まだ会話の記録がありません。</ZenText>
                        <ZenText className="text-slate-400 text-xs text-center mt-1">AIと話して思い出を作りましょう。</ZenText>
                    </View>
                )}
             </View>

             {/* Weekly Goals (Simplified matches light theme) */}
             <View className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                <View className="flex-row justify-between items-start mb-4">
                   <View>
                      <ZenHeading level={3} className="text-slate-700 text-base font-bold">今週の目標</ZenHeading>
                      <ZenText className="text-slate-400 text-xs">7日中 {
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
                         const isTalked = entryDatesThisWeek.has(`${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`);
                         const isFuture = checkDate > now;

                         return (
                           <View key={day} className={`w-6 h-6 rounded-full items-center justify-center ${isTalked ? 'bg-indigo-500' : (isFuture ? 'bg-slate-100' : 'bg-slate-200')}`}>
                              <ZenText className={`text-[10px] font-bold ${isTalked ? 'text-white' : 'text-slate-400'}`}>{day}</ZenText>
                           </View>
                         );
                      })}
                   </View>
                </View>
                
                {/* Progress Bar */}
                <View className="h-3 bg-slate-100 rounded-full overflow-hidden w-full">
                   <View className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (
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
