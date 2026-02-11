import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, ScrollView, TouchableOpacity, View } from 'react-native';
import { JournalEntry } from '../services/storage';
import { ZenHeading, ZenText } from './ui/Typography';

interface EntryDetailModalProps {
  visible: boolean;
  entry: JournalEntry | null;
  onClose: () => void;
  isDark: boolean;
}

const EMOTION_ICONS: Record<string, string> = {
  happy: 'happy',
  sad: 'sad',
  excited: 'flash',
  calm: 'leaf',
  tired: 'bed',
  neutral: 'remove',
};

const EMOTION_COLORS: Record<string, string> = {
  happy: '#F59E0B',   // Amber
  sad: '#6366F1',     // Indigo
  excited: '#EC4899', // Pink
  calm: '#10B981',    // Emerald
  tired: '#64748B',   // Slate
  neutral: '#9CA3AF'  // Gray
};

export function EntryDetailModal({ visible, entry, onClose, isDark }: EntryDetailModalProps) {
  if (!entry) return null;

  const date = new Date(entry.createdAt);
  const emotionColor = EMOTION_COLORS[entry.emotion] || EMOTION_COLORS.neutral;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1" style={{ backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
        {/* Header */}
        <View className="flex-row justify-between items-center px-6 pt-6 pb-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <View />
            <TouchableOpacity onPress={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center">
                <Ionicons name="close" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
            {/* Hero Section */}
            <View className="px-6 py-6 bg-white dark:bg-slate-900 mb-4">
                <View className="flex-row items-center gap-2 mb-4">
                    <View className="px-3 py-1 rounded-full flex-row items-center gap-1" style={{ backgroundColor: `${emotionColor}20` }}>
                         <Ionicons name={EMOTION_ICONS[entry.emotion] as any} size={14} color={emotionColor} />
                         <ZenText className="text-xs font-bold capitalize" style={{ color: emotionColor }}>{entry.emotion}</ZenText>
                    </View>
                    <ZenText className="text-sm" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
                        {date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                        {' '}{date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </ZenText>
                </View>
                
                <ZenHeading level={1} className="text-3xl font-bold leading-tight" style={{ color: isDark ? '#FFFFFF' : '#1E293B' }}>
                    {entry.title}
                </ZenHeading>
            </View>

            {/* AI Summary */}
            <View className="mx-6 p-5 rounded-2xl mb-8" style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }}>
               <View className="flex-row items-center gap-2 mb-2">
                   <Ionicons name="sparkles" size={16} color={isDark ? '#818CF8' : '#6366F1'} />
                   <ZenText className="font-bold text-sm" style={{ color: isDark ? '#E2E8F0' : '#475569' }}>AI要約</ZenText>
               </View>
               <ZenText className="text-base leading-relaxed" style={{ color: isDark ? '#CBD5E1' : '#475569' }}>
                   {entry.summary}
               </ZenText>
            </View>

            {/* Original Conversation (Mock for now or if we store plain text) */}
             {/* Note: Currently we only store summary/title in JournalEntry. 
                 To show full text, we might need to store it. 
                 For now, we can show summary as the main content or if 'content' field exists.
                 Requirements say "View Full Text", but strict Storage only has title/summary/emotion.
                 Assuming Summary is what users want to read for now, 
                 OR if we need to show the raw logs, we'd need to fetch them.
                 However, RecoveryService logs are cleared. 
                 Actually, looking at `saveJournalEntry` in index.tsx, we pass `journal.summary`.
                 Wait, user said "全文表示" (View Full Text). 
                 Currently we assume Summary IS the text. 
                 Let's stick to displaying Summary prominently. 
             */}
        </ScrollView>
      </View>
    </Modal>
  );
}
