import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, LayoutAnimation, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JournalEditorModal } from '../../components/JournalEditorModal';
import { ZenHeading, ZenText } from '../../components/ui/Typography';
import { JournalEntry, StorageService } from '../../services/storage';

const EMOTION_COLORS: Record<string, string> = {
  happy: '#F59E0B',   // Amber
  sad: '#6366F1',     // Indigo
  excited: '#EC4899', // Pink
  calm: '#10B981',    // Emerald
  tired: '#64748B',   // Slate
  neutral: '#9CA3AF'  // Gray
};

const EMOTION_LABELS: Record<string, string> = {
  happy: 'JOYFUL',
  sad: 'SAD',
  excited: 'EXCITED',
  calm: 'CALM',
  tired: 'TIRED',
  neutral: 'NEUTRAL'
};

const EMOTION_ICONS: Record<string, string> = {
  happy: 'happy-outline',
  sad: 'sad-outline',
  excited: 'flash-outline',
  calm: 'leaf-outline',
  tired: 'bed-outline',
  neutral: 'person-outline'
};

export default function HistoryScreen() {
  const [sections, setSections] = useState<{ title: string; data: JournalEntry[] }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);

  const loadData = async () => {
    const allEntries = await StorageService.getJournalEntries();
    // Sort by createdAt descending (newest first)
    allEntries.sort((a, b) => b.createdAt - a.createdAt);

    const grouped: Record<string, JournalEntry[]> = {};
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();

    // Helper to format date key for checking equality
    const dateKey = (d: Date) => d.toDateString();

    allEntries.forEach(entry => {
      const date = new Date(entry.createdAt);
      const entryDateStr = dateKey(date);
      
      let title = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
      
      if (entryDateStr === todayStr) {
          title = '今日';
      } else if (entryDateStr === yesterdayStr) {
          title = '昨日';
      }

      if (!grouped[title]) grouped[title] = [];
      grouped[title].push(entry);
    });

    // Ensure order: Today, Yesterday, then sorted dates descending
    const result = [];
    if (grouped['今日']) result.push({ title: '今日', data: grouped['今日'] });
    if (grouped['昨日']) result.push({ title: '昨日', data: grouped['昨日'] });
    
    // Sort other keys descending by date
    Object.keys(grouped)
        .filter(key => key !== '今日' && key !== '昨日')
        .sort((a, b) => {
            // Parse "YYYY年MM月DD日" back to compare, or just rely on the fact that we processed sorted entries...
            // Wait, object keys iteration order is not guaranteed to be insertion order in all environments, though usually is for string keys.
            // Safer to sort.
            const parseDate = (s: string) => {
                const parts = s.match(/(\d+)年(\d+)月(\d+)日/);
                if (!parts) return 0;
                return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])).getTime();
            };
            return parseDate(b) - parseDate(a);
        })
        .forEach(key => result.push({ title: key, data: grouped[key] }));

    setSections(result);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--分 --秒';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分 ${s}秒`;
  };

  // Delete Action
  const handleDelete = (entry: JournalEntry) => {
    Alert.alert(
      "日記を削除",
      "本当に削除しますか？\n（復元できません）",
      [
        { text: "キャンセル", style: "cancel" },
        { 
          text: "削除する", 
          style: "destructive", 
          onPress: async () => {
             await StorageService.deleteJournalEntry(entry.id);
             loadData(); // Re-fetch
          }
        }
      ]
    );
  };

  // Save Edited Entry
  const handleSaveEdit = async (updatedEntry: JournalEntry) => {
    await StorageService.updateJournalEntry(updatedEntry);
    setEditingEntry(null);
    loadData();
  };

  return (
    <View className="flex-1 bg-zen-bg">
      <LinearGradient
        colors={['#F9FAFB', '#F3F4F6', '#EBEBF0']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      
      <SafeAreaView className="flex-1">
        <View className="px-6 py-4 flex-row items-center justify-between">
          <ZenHeading level={1} className="text-2xl text-slate-800">会話の履歴</ZenHeading>
        </View>

        {/* Categories (Visual only for now) */}
        <View className="px-6 flex-row gap-6 mb-4 border-b border-slate-200 pb-2">
            <TouchableOpacity><ZenText className="text-indigo-600 font-bold border-b-2 border-indigo-600 pb-1">すべて</ZenText></TouchableOpacity>
            <TouchableOpacity><ZenText className="text-slate-400 font-medium">ムード</ZenText></TouchableOpacity>
            <TouchableOpacity><ZenText className="text-slate-400 font-medium">お気に入り</ZenText></TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {sections.map((section) => (
            <View key={section.title} className="mb-6">
              <ZenHeading level={3} className="text-slate-500 font-bold mb-3 uppercase text-xs tracking-wider">
                {section.title}
              </ZenHeading>
              
              <View className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6">
                {section.data.map((entry) => {
                   const isExpanded = expandedId === entry.id;
                   const color = EMOTION_COLORS[entry.emotion] || '#9CA3AF';
                   
                   return (
                     <View key={entry.id} className="relative">
                        {/* Timeline Dot */}
                        <View className="absolute -left-[31px] top-6 bg-slate-100 p-1.5 rounded-full border border-slate-200">
                            <Ionicons name="mic" size={12} color="#64748B" />
                        </View>

                        {/* Time Label */}
                        <View className="mb-2">
                            <ZenText className="text-slate-400 text-xs font-bold font-mono">
                                {new Date(entry.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                            </ZenText>
                        </View>

                        <TouchableOpacity 
                          onPress={() => toggleExpand(entry.id)}
                          activeOpacity={0.9}
                          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 overflow-hidden"
                        >
                            <View className="flex-row justify-between items-start mb-2">
                                <View className="flex-row items-center gap-2">
                                    <Ionicons name={EMOTION_ICONS[entry.emotion] as any} size={20} color={color} />
                                    <ZenText className="text-xs font-bold tracking-widest" style={{ color }}>
                                        {EMOTION_LABELS[entry.emotion]}
                                    </ZenText>
                                </View>
                            </View>

                            <ZenText className="text-lg font-bold text-slate-800 mb-1">{entry.title}</ZenText>
                            


                            {/* Summary Content */}
                            <View>
                                <ZenText 
                                    className="text-slate-600 leading-relaxed italic"
                                    numberOfLines={isExpanded ? undefined : 2}
                                >
                                    {entry.summary}
                                </ZenText>
                            </View>

                            {/* Actions and Expand Button */}
                            <View className="flex-row justify-between items-center mt-4 pt-2">
                                {/* Expand Toggle */}
                                <View className="flex-row items-center bg-slate-50 px-3 py-1.5 rounded-lg">
                                    <ZenText className="text-slate-500 text-xs font-medium mr-1">
                                        {isExpanded ? '閉じる' : '詳細を見る'}
                                    </ZenText>
                                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color="#64748B" />
                                </View>

                                {/* Edit/Delete Actions (Only visible when expanded) */}
                                {isExpanded && (
                                    <View className="flex-row gap-3">
                                        <TouchableOpacity onPress={() => setEditingEntry(entry)} className="p-2 bg-slate-50 rounded-full">
                                            <Ionicons name="create-outline" size={18} color="#64748B" />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDelete(entry)} className="p-2 bg-red-50 rounded-full">
                                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                     </View>
                   );
                })}
              </View>
            </View>
          ))}
          
          {sections.length === 0 && (
              <View className="items-center justify-center py-20">
                  <Ionicons name="journal-outline" size={48} color="#CBD5E1" />
                  <ZenText className="text-slate-400 mt-4">まだ履歴がありません</ZenText>
              </View>
          )}

        </ScrollView>
      </SafeAreaView>

      {/* Edit Modal */}
      <JournalEditorModal 
        visible={editingEntry !== null}
        initialEntry={editingEntry}
        onSave={handleSaveEdit}
        onCancel={() => setEditingEntry(null)}
      />
    </View>
  );
}
