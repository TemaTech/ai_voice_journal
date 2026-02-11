import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BentoCard } from '../../components/ui/BentoCard';
import { ZenHeading, ZenText } from '../../components/ui/Typography';
import { StorageService, UserSettings } from '../../services/storage';

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  
  useFocusEffect(
    useCallback(() => {
       StorageService.getUserSettings().then(setSettings);
    }, [])
  );

  const handleClearData = () => {
     Alert.alert(
        "データの削除",
        "すべての記録を削除しますか？この操作は取り消せません。",
        [
           { text: "キャンセル", style: "cancel" },
           {
              text: "削除する",
              style: "destructive",
              onPress: async () => {
                 await StorageService.clearAll();
                 Alert.alert("完了", "すべてのデータが削除されました。");
                 // Reload or navigate somewhere safe? 
                 // For now, reload settings
                 StorageService.getUserSettings().then(setSettings);
              }
           }
        ]
     )
  };

  return (
    <View className="flex-1 bg-zen-bg">
       <LinearGradient
        colors={['#F9FAFB', '#F3F4F6', '#F9FAFB']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      
      <SafeAreaView className="flex-1">
         {/* Title Header (No Back Button) */}
         <View className="px-6 py-4 border-b border-white">
            <ZenHeading level={1} className="text-text-primary text-3xl">設定</ZenHeading>
         </View>

         <ScrollView className="px-5 flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
            
            {/* Profile Section */}
            <View className="items-center mb-8 mt-4">
               <View className="w-24 h-24 bg-gradient-to-br from-liquid-primary to-liquid-accent rounded-full items-center justify-center mb-3 shadow-lg border-4 border-white">
                  <ZenText className="text-4xl">😎</ZenText>
               </View>
               <ZenHeading level={2} className="text-text-primary text-xl mb-1">{settings?.userName || 'ゲスト'}</ZenHeading>
               {settings?.occupation ? (
                 <ZenText className="text-slate-500 text-sm mb-2">{settings.occupation}</ZenText>
               ) : null}
               
               {/* Interests Tags */}
               {settings?.interests && settings.interests.length > 0 && (
                 <View className="flex-row gap-2 flex-wrap justify-center mb-4 px-10">
                   {settings.interests.slice(0, 3).map((tag, i) => (
                      <View key={i} className="bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                        <ZenText className="text-indigo-500 text-xs">#{tag}</ZenText>
                      </View>
                   ))}
                   {settings.interests.length > 3 && (
                      <ZenText className="text-slate-400 text-xs py-1">+{settings.interests.length - 3}</ZenText>
                   )}
                 </View>
               )}

               <TouchableOpacity 
                 onPress={() => router.push('/profile/edit')}
                 className="bg-white/80 px-6 py-2 rounded-full border border-slate-200 shadow-sm flex-row items-center gap-2"
               >
                 <Ionicons name="settings-outline" size={14} color="#64748b" />
                 <ZenText className="text-slate-600 text-xs font-bold">プロフィール編集</ZenText>
               </TouchableOpacity>
            </View>

            <View className="gap-4">
               {/* Appearance */}
               <BentoCard className="bg-white/60 h-auto p-4">
                  <ZenHeading level={3} className="text-slate-500 mb-4 text-xs font-bold uppercase tracking-widest">外観設定</ZenHeading>
                  <View className="flex-row justify-between items-center py-2 border-b border-slate-100">
                     <ZenText>ダークモード</ZenText>
                     <Switch value={false} />
                  </View>
                   <View className="flex-row justify-between items-center py-2">
                     <ZenText>テーマカラー</ZenText>
                     <View className="flex-row gap-2">
                        <View className="w-6 h-6 rounded-full bg-indigo-500 border-2 border-white shadow-sm" />
                        <View className="w-6 h-6 rounded-full bg-pink-400" />
                        <View className="w-6 h-6 rounded-full bg-teal-400" />
                     </View>
                  </View>
               </BentoCard>

               {/* Notifications */}
               <BentoCard className="bg-white/60 h-auto p-4">
                  <ZenHeading level={3} className="text-slate-500 mb-4 text-xs font-bold uppercase tracking-widest">通知設定</ZenHeading>
                   <View className="flex-row justify-between items-center py-2 border-b border-slate-100">
                     <ZenText>デイリーリマインダー</ZenText>
                     <Switch value={true} trackColor={{ false: "#767577", true: "#9D7BFF" }}/>
                  </View>
                  <View className="flex-row justify-between items-center py-2">
                     <ZenText className="text-slate-500 text-sm">通知時間</ZenText>
                     <ZenText className="text-liquid-primary font-bold bg-indigo-50 px-3 py-1 rounded-lg overflow-hidden">20:00</ZenText>
                  </View>
               </BentoCard>

               {/* AI Voice Selection */}
               <BentoCard className="bg-white/60 h-auto p-4">
                  <ZenHeading level={3} className="text-slate-500 mb-4 text-xs font-bold uppercase tracking-widest">AIの声</ZenHeading>
                  <View className="flex-row flex-wrap gap-2">
                    {[
                      { voice: 'Aoede', label: '女性（高め）' },
                      { voice: 'Kore', label: '女性（落ち着き）' },
                      { voice: 'Charon', label: '男性（低め）' },
                      { voice: 'Fenrir', label: '男性（力強い）' },
                      { voice: 'Puck', label: '男性（軽快）' },
                    ].map(({ voice, label }) => {
                      const isSelected = (settings?.aiVoice || 'Aoede') === voice;
                      return (
                        <TouchableOpacity
                          key={voice}
                          onPress={async () => {
                            await StorageService.saveUserSettings({ aiVoice: voice });
                            StorageService.getUserSettings().then(setSettings);
                          }}
                          className={`px-4 py-2 rounded-full border ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-slate-200'}`}
                        >
                          <ZenText className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-600'}`}>{label}</ZenText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <ZenText className="text-slate-400 text-xs mt-3">次回の会話から反映されます</ZenText>
               </BentoCard>

               {/* Data Management */}
                <BentoCard className="bg-white/60 h-auto p-4">
                  <ZenHeading level={3} className="text-slate-500 mb-4 text-xs font-bold uppercase tracking-widest">データとプライバシー</ZenHeading>
                  <TouchableOpacity onPress={handleClearData} className="py-3">
                     <ZenText className="text-red-500 font-semibold">全データを削除</ZenText>
                  </TouchableOpacity>
                   <TouchableOpacity className="py-3 border-t border-slate-100">
                     <ZenText className="text-slate-600">記録のエクスポート (JSON)</ZenText>
                  </TouchableOpacity>
               </BentoCard>

                <View className="items-center mt-6">
                   <ZenText className="text-slate-400 text-xs">Version 1.0.0 (Phase 1)</ZenText>
                </View>
            </View>
         </ScrollView>
      </SafeAreaView>
    </View>
  );
}
