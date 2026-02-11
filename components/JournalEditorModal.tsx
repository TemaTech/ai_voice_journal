import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { JournalEntry } from '../services/storage';

interface JournalEditorModalProps {
  visible: boolean;
  initialEntry: JournalEntry | null;
  onSave: (entry: JournalEntry) => void;
  onCancel: () => void;
}

export function JournalEditorModal({ visible, initialEntry, onSave, onCancel }: JournalEditorModalProps) {
  const [entry, setEntry] = useState<JournalEntry | null>(initialEntry);

  useEffect(() => {
    setEntry(initialEntry);
  }, [initialEntry]);

  if (!entry) return null;

  const handleSave = () => {
    if (entry) {
      onSave(entry);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-black/50 justify-end"
      >
        <View className="bg-white dark:bg-slate-900 rounded-t-3xl h-[90%]">
          {/* Header - Gradient Background */}
          <LinearGradient
            colors={['#4f46e5', '#7c3aed', '#a855f7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-t-3xl px-6 pt-8 pb-10"
          >
            {/* Drag Handle */}
            <View className="items-center mb-6">
              <View className="w-12 h-1 bg-white/30 rounded-full" />
            </View>
            
            {/* Main Header */}
            <View className="items-center mb-4">
              <View className="w-16 h-16 bg-white/20 rounded-2xl items-center justify-center mb-4">
                <Text className="text-4xl">📖</Text>
              </View>
              <Text className="text-white text-2xl font-bold mb-2">日記の編集</Text>
              <Text className="text-white/60 text-sm text-center">
                {new Date(entry.createdAt).toLocaleDateString('ja-JP', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  weekday: 'long'
                })}
              </Text>
            </View>
          </LinearGradient>
          
          {/* Content */}
          <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
            {/* Title Input */}
            <View className="mb-6">
              <View className="flex-row items-center mb-2">
                <Text className="text-indigo-600 dark:text-indigo-400 mr-2">✏️</Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">タイトル</Text>
              </View>
              <TextInput
                value={entry.title}
                onChangeText={(text) => setEntry(prev => prev ? {...prev, title: text} : null)}
                className="text-xl font-bold text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700"
                placeholder="タイトルを入力"
                placeholderTextColor="#94a3b8"
              />
            </View>
            
            {/* Body Input */}
            <View className="mb-6">
              <View className="flex-row items-center mb-2">
                <Text className="text-indigo-600 dark:text-indigo-400 mr-2">📝</Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">本文</Text>
              </View>
              <TextInput
                value={entry.summary}
                onChangeText={(text) => setEntry(prev => prev ? {...prev, summary: text} : null)}
                className="text-base text-slate-700 dark:text-slate-200 leading-7 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-4 min-h-[180px] border border-slate-200 dark:border-slate-700"
                multiline
                textAlignVertical="top"
                placeholder="今日あったことを書こう..."
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* Emotion Selection */}
            <View className="mb-8">
              <View className="flex-row items-center mb-3">
                <Text className="text-indigo-600 dark:text-indigo-400 mr-2">💭</Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">今日の気分</Text>
              </View>
              <View className="flex-row flex-wrap">
                {[
                  { value: 'happy', label: '😊 嬉しい' },
                  { value: 'sad', label: '😢 悲しい' },
                  { value: 'excited', label: '🎉 わくわく' },
                  { value: 'calm', label: '😌 穏やか' },
                  { value: 'tired', label: '😴 疲れた' },
                ].map((emotion) => (
                  <TouchableOpacity
                    key={emotion.value}
                    onPress={() => setEntry(prev => prev ? {...prev, emotion: emotion.value as any} : null)}
                    className={`px-4 py-2 rounded-full border mr-2 mb-2 ${
                      entry.emotion === emotion.value 
                        ? 'bg-indigo-600 border-indigo-600' 
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Text className={`text-sm ${
                      entry.emotion === emotion.value ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}>
                      {emotion.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer Buttons */}
          <View className="px-6 pb-8 pt-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
            {/* Save Button */}
            <TouchableOpacity 
              onPress={handleSave}
              className="bg-indigo-600 rounded-2xl py-4 mb-3 shadow-lg shadow-indigo-300"
            >
              <Text className="text-white font-bold text-center text-lg">💾 保存する</Text>
            </TouchableOpacity>
            
            {/* Cancel Button */}
            <TouchableOpacity 
              onPress={onCancel}
              className="bg-slate-100 dark:bg-slate-800 rounded-2xl py-4"
            >
              <Text className="text-slate-500 dark:text-slate-400 font-medium text-center">キャンセル</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
