import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Dimensions, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EntryDetailModal } from '../../components/EntryDetailModal';
import { JournalEditorModal } from '../../components/JournalEditorModal';
import { ZenHeading, ZenText } from '../../components/ui/Typography';
import { useTheme } from '../../hooks/useTheme';
import { JournalEntry, StorageService } from '../../services/storage';

// Helper: Get days for the grid
function getDaysInMonth(year: number, month: number) {
  const date = new Date(year, month, 1);
  const days = [];
  
  // Pad empty days at start
  const firstDay = date.getDay();
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  
  // Fill days
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  
  return days;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const EMOTION_COLORS: Record<string, string> = {
    happy: '#F59E0B',   // Amber
    sad: '#6366F1',     // Indigo
    excited: '#EC4899', // Pink
    calm: '#10B981',    // Emerald
    tired: '#64748B',   // Slate
    neutral: '#9CA3AF'  // Gray
};

export default function InsightsScreen() {
    const { isDark, activeColors } = useTheme();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [entriesMap, setEntriesMap] = useState<Record<string, JournalEntry[]>>({});
    const [stats, setStats] = useState({
        totalTime: 0,
        topMood: 'neutral',
        streak: 0,
        monthlyVibe: 'No data yet'
    });
    const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null); // For Editing
    const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);   // For Reading
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    // Screen Width for Grid Calc
    const screenWidth = Dimensions.get('window').width;
    const cellWidth = (screenWidth - 60) / 7;

    // Load Data
    const loadData = async () => {
        const allEntries = await StorageService.getJournalEntries();

        // Filter by current displayed month for some stats, but overall stats might be global?
        // Let's make stats Monthly based on the selected month.
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        const monthEntries = allEntries.filter(e => {
            const d = new Date(e.createdAt);
            return d >= startOfMonth && d <= endOfMonth;
        });

        // 1. Map entries
        const map: Record<string, JournalEntry[]> = {};
        monthEntries.forEach(entry => {
            // Use local date string comparison
            const d = new Date(entry.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!map[key]) map[key] = [];
            map[key].push(entry);
        });
        setEntriesMap(map);

        // 2. Stats Calculation
        // Total Time
        const totalSeconds = monthEntries.reduce((acc, curr) => acc + (curr.duration || 0), 0);

        // Top Mood
        const moodCounts: Record<string, number> = {};
        monthEntries.forEach(e => {
            moodCounts[e.emotion] = (moodCounts[e.emotion] || 0) + 1;
        });
        let topMood = 'None';
        let maxCount = 0;
        Object.entries(moodCounts).forEach(([mood, count]) => {
            if (count > maxCount) {
                maxCount = count;
                topMood = mood;
            }
        });

        // Streak (Simplified: Consecutive days with entries ending today or yesterday)
        // Actually, user wants "streak" which usually means current active streak.
        // I'll implement a simple streak check from *latest entry* backwards.
        // If we want "Monthly Streak" maybe just "Days Active in Month"?
        // The reference image says "Monthly Insights". Let's do month stats.

        setStats({
            totalTime: totalSeconds,
            topMood: topMood,
            streak: 0, // Placeholder or we can calculate active streak globally
            monthlyVibe: topMood !== 'None' ? `Mostly ${topMood}` : 'No data'
        });
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [currentDate])
    );

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = getDaysInMonth(year, month);

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    const formatDateKey = (date: Date) => {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }}>
            <LinearGradient
                colors={isDark ? ['#1C1C1E', '#2C2C2E', '#1C1C1E'] : ['#F9FAFB', '#F3F4F6', '#EBEBF0']}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            />

            <SafeAreaView className="flex-1">
                <View className="px-6 pt-4 pb-2 flex-row items-center justify-between">
                    <TouchableOpacity onPress={() => { }} className="p-2">
                        <Ionicons name="chevron-back" size={24} color={isDark ? "#FFFFFF" : "#64748B"} />
                    </TouchableOpacity>
                    <ZenHeading level={2} className="text-xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1E293B' }}>
                        {year}年 {month + 1}月
                    </ZenHeading>
                    <TouchableOpacity onPress={() => { }} className="p-2">
                        <Ionicons name="ellipsis-horizontal" size={24} color={isDark ? "#FFFFFF" : "#64748B"} />
                    </TouchableOpacity>
                </View>

                <JournalEditorModal
                    visible={!!selectedEntry}
                    initialEntry={selectedEntry}
                    onSave={async (updatedEntry) => {
                        await StorageService.updateJournalEntry(updatedEntry);
                        setSelectedEntry(null);
                        loadData();
                    }}
                    onCancel={() => setSelectedEntry(null)}
                />

                <EntryDetailModal
                    visible={!!detailEntry}
                    entry={detailEntry}
                    onClose={() => setDetailEntry(null)}
                    isDark={isDark}
                />

                <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                    {/* Calendar Section */}
                    <View className="mt-4 px-4">
                        <View className="flex-row items-center justify-between px-4 mb-4">
                            <TouchableOpacity onPress={prevMonth}><Ionicons name="chevron-back" size={20} color={isDark ? "#94A3B8" : "#94A3B8"} /></TouchableOpacity>
                            <ZenText className="font-bold" style={{ color: isDark ? '#94A3B8' : '#94A3B8' }}>月間カレンダー</ZenText>
                            <TouchableOpacity onPress={nextMonth}><Ionicons name="chevron-forward" size={20} color={isDark ? "#94A3B8" : "#94A3B8"} /></TouchableOpacity>
                        </View>

                        <View className="flex-row justify-between mb-2 px-2">
                            {WEEKDAYS.map((day, i) => (
                                <View key={i} style={{ width: cellWidth }} className="items-center">
                                    <ZenText className="font-bold text-xs" style={{ color: isDark ? '#64748B' : '#64748B' }}>{day}</ZenText>
                                </View>
                            ))}
                        </View>

                        <View className="flex-row flex-wrap justify-between px-2">
                            {days.map((day, index) => {
                                if (!day) return <View key={`empty-${index}`} style={{ width: cellWidth, height: cellWidth }} />;

                                const dateKey = formatDateKey(day);
                                const hasEntry = entriesMap[dateKey]?.length > 0;
                                const emotion = hasEntry ? entriesMap[dateKey][0].emotion : null;
                                const color = emotion ? EMOTION_COLORS[emotion] : (isDark ? '#334155' : '#1F2937');

                                return (
                                    <TouchableOpacity
                                        key={dateKey}
                                        style={{ width: cellWidth, height: cellWidth }}
                                        onPress={() => {
                                            // Toggle selection
                                            if (selectedDate &&
                                                selectedDate.getDate() === day.getDate() &&
                                                selectedDate.getMonth() === day.getMonth()) {
                                                setSelectedDate(null);
                                            } else {
                                                setSelectedDate(day);
                                            }
                                        }}
                                        activeOpacity={0.7}
                                        className="items-center justify-center mb-2"
                                    >
                                        <View style={{
                                            width: cellWidth - 4,
                                            height: cellWidth - 4,
                                            borderRadius: 16,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderWidth: (selectedDate && selectedDate.getDate() === day.getDate() && selectedDate.getMonth() === day.getMonth()) ? 2 : 0,
                                            borderColor: activeColors.primary,
                                            backgroundColor: (selectedDate && selectedDate.getDate() === day.getDate() && selectedDate.getMonth() === day.getMonth()) ? (isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)') : 'transparent'
                                        }}>
                                            <ZenText style={{
                                                color: hasEntry ? (isDark ? '#818CF8' : '#4F46E5') : (isDark ? '#475569' : '#94A3B8'),
                                                fontWeight: hasEntry ? 'bold' : 'normal'
                                            }}>
                                                {day.getDate()}
                                            </ZenText>
                                            {hasEntry && (
                                                <View style={{ backgroundColor: color }} className="w-1.5 h-1.5 rounded-full mt-1" />
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* Legend */}
                    <View className="flex-row justify-center gap-4 mt-4 mb-8">
                        <View className="flex-row items-center gap-1"><View className="w-2 h-2 rounded-full bg-emerald-400" /><ZenText className="text-xs" style={{ color: isDark ? '#94A3B8' : '#94A3B8' }}>穏やか</ZenText></View>
                        <View className="flex-row items-center gap-1"><View className="w-2 h-2 rounded-full bg-amber-400" /><ZenText className="text-xs" style={{ color: isDark ? '#94A3B8' : '#94A3B8' }}>ハッピー</ZenText></View>
                        <View className="flex-row items-center gap-1"><View className="w-2 h-2 rounded-full bg-indigo-400" /><ZenText className="text-xs" style={{ color: isDark ? '#94A3B8' : '#94A3B8' }}>悲しい</ZenText></View>
                    </View>

                    {/* Conditional Content: Daily List OR Monthly Analysis */}
                    {selectedDate ? (
                        <View className="px-6 pb-20">
                            <View className="flex-row justify-between items-center mb-4">
                                <View>
                                    <ZenText className="text-xs font-bold mb-1" style={{ color: activeColors.primary }}>
                                        {selectedDate.getFullYear()}年 {selectedDate.getMonth() + 1}月
                                    </ZenText>
                                    <ZenHeading level={3} className="text-xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1E293B' }}>
                                        {selectedDate.getDate()}日の記録
                                    </ZenHeading>
                                </View>
                                <TouchableOpacity
                                    onPress={() => setSelectedDate(null)}
                                    className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full"
                                >
                                    <Ionicons name="close" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
                                </TouchableOpacity>
                            </View>

                            {/* Entries List */}
                            {(() => {
                                const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
                                const dayEntries = entriesMap[dateKey] || [];

                                if (dayEntries.length === 0) {
                                    return (
                                        <View className="py-8 items-center border-t border-slate-100 dark:border-slate-800">
                                            <Ionicons name="create-outline" size={48} color={isDark ? '#334155' : '#E2E8F0'} style={{ marginBottom: 12 }} />
                                            <ZenText style={{ color: isDark ? '#94A3B8' : '#64748B' }}>この日の記録はありません</ZenText>
                                        </View>
                                    );
                                }

                                return (
                                    <View className="gap-4">
                                        {dayEntries.map((entry) => {
                                            const emotionColor = EMOTION_COLORS[entry.emotion] || EMOTION_COLORS.neutral;
                                            return (
                                                <View key={entry.id} className="p-5 rounded-3xl border" style={{
                                                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                                                    borderColor: isDark ? '#334155' : '#F1F5F9'
                                                }}>
                                                    <View className="flex-row justify-between items-start mb-3">
                                                        <View className="flex-row items-center gap-2">
                                                            <View className="px-2 py-1 rounded-full flex-row items-center gap-1" style={{ backgroundColor: `${emotionColor}20` }}>
                                                                <ZenText className="text-xs font-bold capitalize" style={{ color: emotionColor }}>{entry.emotion}</ZenText>
                                                            </View>
                                                            <ZenText className="text-xs" style={{ color: isDark ? '#94A3B8' : '#94A3B8' }}>
                                                                {new Date(entry.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                                            </ZenText>
                                                        </View>
                                                    </View>

                                                    <ZenHeading level={4} className="text-lg font-bold mb-2" style={{ color: isDark ? '#F1F5F9' : '#1E293B' }}>
                                                        {entry.title}
                                                    </ZenHeading>

                                                    <ZenText className="text-sm leading-relaxed mb-4" numberOfLines={3} style={{ color: isDark ? '#CBD5E1' : '#64748B' }}>
                                                        {entry.summary}
                                                    </ZenText>

                                                    <View className="flex-row gap-3">
                                                        <TouchableOpacity
                                                            onPress={() => setDetailEntry(entry)}
                                                            className="flex-1 py-3 rounded-xl items-center justify-center border"
                                                            style={{ borderColor: activeColors.primary }}
                                                        >
                                                            <ZenText className="font-bold text-sm" style={{ color: activeColors.primary }}>全文を読む</ZenText>
                                                        </TouchableOpacity>

                                                        <TouchableOpacity
                                                            onPress={() => setSelectedEntry(entry)}
                                                            className="flex-1 py-3 rounded-xl items-center justify-center bg-slate-100 dark:bg-slate-800"
                                                        >
                                                            <ZenText className="font-bold text-sm" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>編集</ZenText>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                );
                            })()}
                        </View>
                    ) : (
                        /* Monthly Insights Section (Original) */
                        <View className="px-6 mt-4">
                            <ZenHeading level={3} className="text-lg font-bold mb-4" style={{ color: isDark ? '#E2E8F0' : '#334155' }}>今月の分析</ZenHeading>

                            <View className="flex-row gap-4 mb-4">
                                {/* Top Mood Card */}
                                <View className="flex-1 p-4 rounded-3xl border shadow-sm" style={{
                                    backgroundColor: isDark ? 'rgba(30,41,59,0.5)' : 'rgba(255,255,255,0.7)',
                                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)'
                                }}>
                                    <View className="flex-row items-center gap-2 mb-2">
                                        <View className="w-6 h-6 rounded-full bg-green-500/20 items-center justify-center">
                                            <Ionicons name="happy" size={14} color="#4ADE80" />
                                        </View>
                                        <ZenText className="text-xs text-center" style={{ color: isDark ? '#94A3B8' : '#94A3B8' }}>主な気分</ZenText>
                                    </View>
                                    <ZenText className="text-xl font-bold capitalize" style={{ color: isDark ? '#FFFFFF' : '#1E293B' }}>{stats.topMood}</ZenText>
                                </View>

                                {/* Talking Time Card */}
                                <View className="flex-1 p-4 rounded-3xl border shadow-sm" style={{
                                    backgroundColor: isDark ? 'rgba(30,41,59,0.5)' : 'rgba(255,255,255,0.7)',
                                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)'
                                }}>
                                    <View className="flex-row items-center gap-2 mb-2">
                                        <View className="w-6 h-6 rounded-full bg-blue-500/20 items-center justify-center">
                                            <Ionicons name="mic" size={14} color={activeColors.primary} />
                                        </View>
                                        <ZenText className="text-xs text-center" style={{ color: isDark ? '#94A3B8' : '#94A3B8' }}>総会話時間</ZenText>
                                    </View>
                                    <ZenText className="text-xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1E293B' }}>{Math.round(stats.totalTime / 60)} 分</ZenText>
                                </View>
                            </View>

                            {/* Monthly Vibe Card */}
                            <View className="p-5 rounded-3xl border shadow-sm mb-6 relative overflow-hidden" style={{
                                backgroundColor: isDark ? 'rgba(30,41,59,0.5)' : 'rgba(255,255,255,0.7)',
                                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)'
                            }}>
                                <LinearGradient
                                    colors={isDark ? ['rgba(99, 102, 241, 0.15)', 'transparent'] : ['rgba(99, 102, 241, 0.05)', 'transparent']}
                                    style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 100 }}
                                />
                                <View className="flex-row items-center gap-2 mb-2">
                                    <Ionicons name="sparkles" size={16} color={activeColors.primary} />
                                    <ZenText className="font-bold" style={{ color: isDark ? '#E2E8F0' : '#334155' }}>今月のバイブス</ZenText>
                                </View>
                                <ZenText className="text-sm leading-6" style={{ color: isDark ? '#CBD5E1' : '#64748B' }}>
                                    今月は {stats.topMood} な気分が多いようですね。
                                    {stats.topMood === 'happy' && '充実した日々を過ごせているようです！'}
                                    {stats.topMood === 'calm' && '穏やかな時間を大切にできています。'}
                                    {stats.topMood === 'sad' && '少し疲れが出ているかもしれません。無理せず休みましょう。'}
                                    {stats.topMood === 'excited' && 'エネルギッシュな活動が目立ちました！'}
                                </ZenText>

                                <TouchableOpacity className="mt-4 flex-row items-center">
                                    <ZenText className="font-bold mr-1" style={{ color: activeColors.primary }}>詳細を見る</ZenText>
                                    <Ionicons name="arrow-forward" size={16} color={activeColors.primary} />
                                </TouchableOpacity>
                            </View>

                        </View>
                    )}

                </ScrollView>
            </SafeAreaView>
        </View>
  );
}

