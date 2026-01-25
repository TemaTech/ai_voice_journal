import { LinearGradient } from 'expo-linear-gradient';
import { Link, Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JournalEntry, StorageService, UserSettings } from '../services/storage';

// 時間帯に応じた挨拶を返す
const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'おはよう';
  if (hour < 18) return 'こんにちは';
  return 'こんばんは';
};

// 感情に応じたカラーを返す
const getEmotionColor = (emotion: string): string => {
  switch (emotion) {
    case 'happy': return '#FFB7C5';
    case 'excited': return '#FFD93D';
    case 'calm': return '#A8E6CF';
    case 'tired': return '#C4C4C4';
    case 'sad': return '#87CEEB';
    default: return '#D4B8E0';
  }
};

// 感情に応じたアイコンを返す
const getEmotionIcon = (emotion: string): string => {
  switch (emotion) {
    case 'happy': return '😊';
    case 'excited': return '🎉';
    case 'calm': return '😌';
    case 'tired': return '😴';
    case 'sad': return '😢';
    default: return '📝';
  }
};

// 曜日の日本語名
const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export default function HomeScreen() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showMonthCalendar, setShowMonthCalendar] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  // 今日の日付情報
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const currentWeekday = now.getDay();

  // 今週の日付を計算
  const getWeekDates = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - dayOfWeek + i);
      dates.push(date);
    }
    return dates;
  };
  const weekDates = getWeekDates();

  // 月カレンダー用の日数
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // データ読み込み
  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        try {
          const userSettings = await StorageService.getUserSettings();
          setSettings(userSettings);
          
          if (!userSettings.isOnboarded) {
            setNeedsOnboarding(true);
            setIsLoading(false);
            return;
          }
          
          const data = await StorageService.getJournalEntries();
          console.log("Loaded journal entries:", data.length);
          setEntries(data);
          setIsLoading(false);
        } catch (error) {
          console.error("Error loading data:", error);
          setIsLoading(false);
        }
      };
      loadData();
    }, [])
  );

  // 特定の日付のエントリを取得
  const getEntryForDate = (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return entries.find(e => e.date === dateStr);
  };

  const getEntryForDay = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return entries.find(e => e.date === dateStr);
  };

  // 最近のエントリを取得（最大5件）
  const recentEntries = entries.slice(0, 5);

  // ローディング
  if (isLoading) {
    return (
      <LinearGradient
        colors={['#F8F4FF', '#EDE7F6', '#E8DEF8']}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <ActivityIndicator size="large" color="#7C4DFF" />
      </LinearGradient>
    );
  }

  // オンボーディングへリダイレクト
  if (needsOnboarding) {
    return <Redirect href="/talk?mode=onboarding" />;
  }

  return (
    <LinearGradient
      colors={['#F8F4FF', '#EDE7F6', '#E8DEF8']}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* ヘッダー */}
          <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
              {currentMonth}月{currentDay}日（{WEEKDAY_NAMES[currentWeekday]}）
            </Text>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#333' }}>
              {getGreeting()}、{settings?.userName || 'ユーザー'}さん！
            </Text>
          </View>

          {/* マスコットキャラクター */}
          <View style={{ 
            alignItems: 'center', 
            paddingVertical: 16,
            marginHorizontal: 20,
            backgroundColor: 'rgba(255,255,255,0.6)',
            borderRadius: 20,
            marginBottom: 16
          }}>
            <View style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: '#FFE4B5',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 12,
            }}>
              <Text style={{ fontSize: 40 }}>🦊</Text>
            </View>
            <View style={{
              backgroundColor: '#fff',
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 16,
            }}>
              <Text style={{ fontSize: 14, color: '#555' }}>今日の気分はどう？</Text>
            </View>
          </View>

          {/* 週間/月間カレンダー */}
          <TouchableOpacity 
            onPress={() => setShowMonthCalendar(!showMonthCalendar)}
            activeOpacity={0.9}
            style={{
              marginHorizontal: 20,
              backgroundColor: 'rgba(255,255,255,0.8)',
              borderRadius: 16,
              padding: 16,
              marginBottom: 16
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#333' }}>
                  {showMonthCalendar ? `${currentYear}年${currentMonth}月` : '週間'}
                </Text>
                <Text style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                  {showMonthCalendar ? '▲ 週表示' : '▼ 月表示'}
                </Text>
              </View>
              {settings?.streakCount && settings.streakCount > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14 }}>🔥</Text>
                  <Text style={{ fontSize: 14, color: '#FF6B6B', fontWeight: '600', marginLeft: 4 }}>
                    {settings.streakCount}日連続
                  </Text>
                </View>
              ) : null}
            </View>

            {showMonthCalendar ? (
              // 月カレンダー
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 }}>
                  {WEEKDAY_NAMES.map((name, i) => (
                    <Text key={i} style={{ fontSize: 12, color: '#999', width: 32, textAlign: 'center' }}>{name}</Text>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {/* 空白セル */}
                  {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                    <View key={`empty-${i}`} style={{ width: '14.28%', height: 36 }} />
                  ))}
                  {/* 日付 */}
                  {monthDays.map((day) => {
                    const isToday = day === currentDay;
                    const entry = getEntryForDay(day);
                    return (
                      <View key={day} style={{ width: '14.28%', height: 36, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: isToday ? '#7C4DFF' : (entry ? getEmotionColor(entry.emotion) : 'transparent'),
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                          <Text style={{ fontSize: 12, color: isToday ? '#fff' : '#333' }}>{day}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              // 週カレンダー
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                {weekDates.map((date, index) => {
                  const isToday = date.getDate() === currentDay && 
                                  date.getMonth() === now.getMonth();
                  const entry = getEntryForDate(date);
                  return (
                    <View key={index} style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, color: isToday ? '#7C4DFF' : '#999', marginBottom: 6 }}>
                        {WEEKDAY_NAMES[date.getDay()]}
                      </Text>
                      <View style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: isToday ? '#7C4DFF' : (entry ? getEmotionColor(entry.emotion) : 'transparent'),
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderWidth: !isToday && !entry ? 1 : 0,
                        borderColor: '#ddd',
                      }}>
                        <Text style={{ fontSize: 14, fontWeight: isToday ? '600' : '400', color: isToday ? '#fff' : '#333' }}>
                          {date.getDate()}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </TouchableOpacity>

          {/* 最近の記録 */}
          <View style={{ paddingHorizontal: 20, marginBottom: 160 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 }}>
              最近の記録
            </Text>
            
            {recentEntries.length > 0 ? (
              recentEntries.map((entry) => (
                <TouchableOpacity 
                  key={entry.id} 
                  onPress={() => setSelectedEntry(entry)}
                  activeOpacity={0.7}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 16 }}>{getEmotionIcon(entry.emotion)}</Text>
                      <Text style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                        {entry.date.split('-').slice(1).join('/')}
                      </Text>
                    </View>
                    <View style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: getEmotionColor(entry.emotion),
                    }} />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 6 }}>
                    {entry.title}
                  </Text>
                  <Text style={{ fontSize: 14, color: '#666', lineHeight: 20 }} numberOfLines={2}>
                    {entry.summary}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#7C4DFF', marginTop: 8 }}>タップして詳細を見る</Text>
                </TouchableOpacity>
              ))
            ) : (
              <View style={{
                backgroundColor: 'rgba(255,255,255,0.6)',
                borderRadius: 16,
                padding: 32,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 14, color: '#999' }}>まだ日記がありません</Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* CTAボタン */}
        <View style={{
          position: 'absolute',
          bottom: 80,
          left: 20,
          right: 20,
        }}>
          <Link href="/talk" asChild>
            <TouchableOpacity>
              <LinearGradient
                colors={['#9C7CF4', '#7C4DFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  paddingVertical: 16,
                  borderRadius: 28,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#7C4DFF',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                }}
              >
                <Text style={{ fontSize: 16, marginRight: 8 }}>🎤</Text>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>日記を話す</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Link>
        </View>

        {/* ボトムタブナビ */}
        <View style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingVertical: 12,
          paddingBottom: 24,
          borderTopWidth: 1,
          borderTopColor: '#eee',
        }}>
          <TouchableOpacity style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20 }}>🏠</Text>
            <Text style={{ fontSize: 10, color: '#7C4DFF', marginTop: 2 }}>ホーム</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ alignItems: 'center', opacity: 0.5 }}>
            <Text style={{ fontSize: 20 }}>💬</Text>
            <Text style={{ fontSize: 10, color: '#999', marginTop: 2 }}>チャット</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ alignItems: 'center', opacity: 0.5 }}>
            <Text style={{ fontSize: 20 }}>📊</Text>
            <Text style={{ fontSize: 10, color: '#999', marginTop: 2 }}>分析</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ alignItems: 'center', opacity: 0.5 }}>
            <Text style={{ fontSize: 20 }}>⚙️</Text>
            <Text style={{ fontSize: 10, color: '#999', marginTop: 2 }}>設定</Text>
          </TouchableOpacity>
        </View>

        {/* 日記詳細モーダル */}
        <Modal
          visible={selectedEntry !== null}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setSelectedEntry(null)}
        >
          <Pressable 
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
            onPress={() => setSelectedEntry(null)}
          >
            <Pressable 
              style={{
                backgroundColor: '#fff',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 24,
                maxHeight: '80%',
              }}
              onPress={() => {}}
            >
              {selectedEntry && (
                <>
                  <View style={{ alignItems: 'center', marginBottom: 16 }}>
                    <View style={{ width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2 }} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 24 }}>{getEmotionIcon(selectedEntry.emotion)}</Text>
                    <View style={{ marginLeft: 12 }}>
                      <Text style={{ fontSize: 14, color: '#999' }}>{selectedEntry.date}</Text>
                      <Text style={{ fontSize: 12, color: getEmotionColor(selectedEntry.emotion), fontWeight: '600' }}>
                        {selectedEntry.emotion.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 16 }}>
                    {selectedEntry.title}
                  </Text>
                  <ScrollView style={{ maxHeight: 300 }}>
                    <Text style={{ fontSize: 16, color: '#555', lineHeight: 26 }}>
                      {selectedEntry.summary}
                    </Text>
                  </ScrollView>
                  <TouchableOpacity 
                    onPress={() => setSelectedEntry(null)}
                    style={{
                      backgroundColor: '#7C4DFF',
                      paddingVertical: 14,
                      borderRadius: 12,
                      alignItems: 'center',
                      marginTop: 20,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>閉じる</Text>
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}
