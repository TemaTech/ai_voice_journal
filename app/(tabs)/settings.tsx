import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { File, Paths } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BentoCard } from '../../components/ui/BentoCard';
import { ZenHeading, ZenText } from '../../components/ui/Typography';
import { THEME_COLORS, ThemeColor } from '../../context/ThemeContext';
import { useTheme } from '../../hooks/useTheme';
import { NotificationService } from '../../services/notification';
import { StorageService, UserSettings } from '../../services/storage';

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, changeTheme, isDark, changeThemeColor, activeColors } = useTheme();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // 設定を読み込む（useEffectを使用してナビゲーションコンテキストへの依存を回避）
  useEffect(() => {
    StorageService.getUserSettings().then(setSettings);
  }, []);

  // Toggle Notification
  const toggleNotification = async (value: boolean) => {
    if (value) {
      // Enable
      const granted = await NotificationService.registerForPushNotificationsAsync();
      if (!granted) {
        Alert.alert('通知の許可が必要です', '設定アプリから通知を許可してください。');
        return;
      }
      
      const time = settings?.notificationTime || '21:00';
      const [hour, minute] = time.split(':').map(Number);
      await NotificationService.scheduleDailyReminder(hour, minute);
    } else {
      // Disable
      await NotificationService.cancelAllNotifications();
    }
    
    await StorageService.saveUserSettings({ notificationEnabled: value });
    const newSettings = await StorageService.getUserSettings();
    setSettings(newSettings);
  };

  // Change Time
  const handleTimeChange = async (event: any, selectedDate?: Date) => {
     setShowTimePicker(false);
     if (selectedDate) {
         const hour = selectedDate.getHours();
         const minute = selectedDate.getMinutes();
         const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
         
         await StorageService.saveUserSettings({ notificationTime: timeStr });
         
         // Reschedule if enabled
         if (settings?.notificationEnabled) {
            await NotificationService.scheduleDailyReminder(hour, minute);
         }
         
         const newSettings = await StorageService.getUserSettings();
         setSettings(newSettings);
     }
  };

  const handleExportData = async () => {
      console.log('Export started');
      try {
          // 共有機能の利用可否を確認
          const isSharingAvailable = await Sharing.isAvailableAsync();
          console.log('Sharing available:', isSharingAvailable);
          
          if (!isSharingAvailable) {
              Alert.alert("エラー", "このデバイスでは共有機能が利用できません");
              return;
          }

          const json = await StorageService.exportDataAsJson();
          console.log('JSON generated, length:', json.length);
          
          const now = new Date();
          const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const fileName = `journal_backup_${timestamp}.json`;

          // expo-file-system v19 新API: File / Paths クラスを使用
          const file = new File(Paths.cache, fileName);
          file.write(json);
          console.log('File written to:', file.uri);

          await Sharing.shareAsync(file.uri, {
              mimeType: 'application/json',
              dialogTitle: 'バックアップ・エクスポート',
              UTI: 'public.json',
          });
          console.log('Share dialog opened');
      } catch (e) {
          Alert.alert("エラー", `エクスポートに失敗しました: ${e}`);
          console.error('Export error:', e);
      }
  };

  const handleClearData = () => {
     Alert.alert(
        "⚠️ データの全削除",
        "すべての記録と設定を削除します。\nこの操作は取り消せません。\n本当によろしいですか？",
        [
           { text: "キャンセル", style: "cancel" },
           {
              text: "削除へ進む",
              style: "destructive",
              onPress: () => {
                 Alert.alert(
                    "最終確認",
                    "本当に削除してよろしいですか？\n失われたデータは復元できません。",
                    [
                        { text: "やめる", style: "cancel" },
                        { 
                            text: "完全に削除する", 
                            style: "destructive",
                            onPress: async () => {
                                await StorageService.clearAll();
                                Alert.alert("削除完了", "すべてのデータが削除されました。");
                                StorageService.getUserSettings().then(setSettings);
                            }
                        }
                    ]
                 );
              }
           }
        ]
     );
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }}>
       <LinearGradient
        colors={isDark ? ['#1C1C1E', '#2C2C2E', '#1C1C1E'] : ['#F9FAFB', '#F3F4F6', '#F9FAFB']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      
      <SafeAreaView className="flex-1">
         {/* Title Header (No Back Button) */}
         <View className="px-6 py-4" style={{ borderBottomWidth: 1, borderBottomColor: isDark ? '#3A3A3C' : '#FFFFFF' }}>
            <ZenHeading level={1} style={{ color: isDark ? '#FFFFFF' : undefined }} className="text-text-primary text-3xl">設定</ZenHeading>
         </View>

         <ScrollView className="px-5 flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
            
            {/* Profile Section */}
            <View className="items-center mb-8 mt-4">
               <View className="w-24 h-24 bg-gradient-to-br from-liquid-primary to-liquid-accent rounded-full items-center justify-center mb-3 border-4 border-white" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 }}>
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
                      <View key={i} className="px-3 py-1 rounded-full border" style={{ backgroundColor: isDark ? 'rgba(79, 70, 229, 0.2)' : '#EEF2FF', borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : '#E0E7FF' }}>
                        <ZenText className="text-xs" style={{ color: isDark ? '#A5B4FC' : '#6366F1' }}>#{tag}</ZenText>
                      </View>
                   ))}
                   {settings.interests.length > 3 && (
                      <ZenText className="text-slate-400 text-xs py-1">+{settings.interests.length - 3}</ZenText>
                   )}
                 </View>
               )}

               <TouchableOpacity 
                 onPress={() => router.push('/profile/edit')}
                 className="px-6 py-2 rounded-full flex-row items-center gap-2"
                 style={{ backgroundColor: isDark ? 'rgba(50,50,55,0.8)' : 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: isDark ? '#4A4A4E' : '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}
               >
                 <Ionicons name="settings-outline" size={14} color={isDark ? '#94A3B8' : '#64748b'} />
                 <ZenText className="text-xs font-bold" style={{ color: isDark ? '#CBD5E1' : '#475569' }}>プロフィール編集</ZenText>
               </TouchableOpacity>
            </View>

            <View className="gap-4">
               {/* Appearance */}
               <BentoCard style={{ backgroundColor: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)', height: 'auto', padding: 16 }}>
                  <ZenHeading level={3} className="mb-4 text-xs font-bold uppercase tracking-widest" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>外観設定</ZenHeading>
                  
                  <View className="flex-row p-1 rounded-lg mb-4" style={{ backgroundColor: isDark ? '#334155' : '#F1F5F9' }}>
                     {(['light', 'dark', 'system'] as const).map((t) => {
                        const isActive = theme === t;
                        return (
                           <TouchableOpacity 
                              key={t}
                              onPress={() => changeTheme(t)}
                              className="flex-1 py-1.5 rounded-md items-center"
                              style={isActive ? {
                                backgroundColor: isDark ? '#475569' : '#FFFFFF',
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: 0.05,
                                shadowRadius: 2,
                                elevation: 1,
                              } : undefined}
                           >
                              <ZenText className="text-xs font-bold" style={{ color: isActive ? (isDark ? '#FFFFFF' : '#1E293B') : (isDark ? '#CBD5E1' : '#64748B') }}>
                                 {t === 'light' ? 'ライト' : t === 'dark' ? 'ダーク' : '自動'}
                              </ZenText>
                           </TouchableOpacity>
                        );
                     })}
                  </View>

                   <View className="flex-row justify-between items-center py-2">
                     <ZenText>テーマカラー</ZenText>
                     <View className="flex-row gap-3">
                        {(Object.keys(THEME_COLORS) as ThemeColor[]).map((color) => {
                            const colorDef = THEME_COLORS[color];
                            const isActive = settings?.themeColor === color;
                            return (
                                <TouchableOpacity 
                                    key={color} 
                                    onPress={async () => {
                                        await changeThemeColor(color);
                                        // Update local settings state to reflect change immediately in UI if needed, 
                                        // though context should handle app-wide changes. 
                                        // settings state here is for initial load, so we might want to update it.
                                        const newSettings = await StorageService.getUserSettings();
                                        setSettings(newSettings);
                                    }}
                                    style={{
                                        width: 24, 
                                        height: 24, 
                                        borderRadius: 12, 
                                        backgroundColor: colorDef.primary,
                                        borderWidth: 2,
                                        borderColor: isActive ? (isDark ? '#FFFFFF' : '#1E293B') : 'transparent',
                                        shadowColor: '#000',
                                        shadowOffset: { width: 0, height: 1 },
                                        shadowOpacity: 0.2,
                                        shadowRadius: 2,
                                        elevation: 2
                                    }}
                                />
                            );
                        })}
                     </View>
                  </View>
               </BentoCard>

               {/* Notifications */}
               <BentoCard style={{ backgroundColor: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)', height: 'auto', padding: 16 }}>
                  <ZenHeading level={3} className="mb-4 text-xs font-bold uppercase tracking-widest" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>通知設定</ZenHeading>
                   <View className="flex-row justify-between items-center py-2" style={{ borderBottomWidth: 1, borderBottomColor: isDark ? '#334155' : '#F1F5F9' }}>
                     <ZenText>デイリーリマインダー</ZenText>
                     <Switch 
                        value={settings?.notificationEnabled ?? false} 
                        onValueChange={toggleNotification}
                        trackColor={{ false: "#767577", true: activeColors.light }}
                     />
                  </View>
                  <View className="flex-row justify-between items-center py-2">
                     <ZenText className="text-slate-500 text-sm">通知時間</ZenText>
                     <TouchableOpacity onPress={() => setShowTimePicker(true)}>
                        <ZenText className="font-bold px-3 py-1 rounded-lg overflow-hidden" style={{ backgroundColor: isDark ? `${activeColors.primary}33` : `${activeColors.light}33`, color: activeColors.primary }}>
                            {settings?.notificationTime || '21:00'}
                        </ZenText>
                     </TouchableOpacity>
                  </View>
                  
                  {showTimePicker && (
                    <DateTimePicker
                        value={(() => {
                            const [h, m] = (settings?.notificationTime || '21:00').split(':').map(Number);
                            const d = new Date();
                            d.setHours(h);
                            d.setMinutes(m);
                            return d;
                        })()}
                        mode="time"
                        is24Hour={true}
                        display="default"
                        onChange={handleTimeChange}
                    />
                  )}
               </BentoCard>

               {/* AI Voice Selection */}
               <BentoCard style={{ backgroundColor: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)', height: 'auto', padding: 16 }}>
                  <ZenHeading level={3} className="mb-4 text-xs font-bold uppercase tracking-widest" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>AIの声</ZenHeading>
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
                          className="px-4 py-2 rounded-full border"
                          style={{ 
                            backgroundColor: isSelected ? activeColors.primary : (isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF'),
                            borderColor: isSelected ? activeColors.primary : (isDark ? '#334155' : '#E2E8F0')
                          }}
                        >
                          <ZenText className="text-sm font-bold" style={{ color: isSelected ? '#FFFFFF' : (isDark ? '#CBD5E1' : '#475569') }}>{label}</ZenText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <ZenText className="text-slate-400 text-xs mt-3">次回の会話から反映されます</ZenText>
               </BentoCard>

               {/* Data Management */}
                <BentoCard style={{ backgroundColor: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)', height: 'auto', padding: 16 }}>
                  <ZenHeading level={3} className="mb-4 text-xs font-bold uppercase tracking-widest" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>データとプライバシー</ZenHeading>
                   <TouchableOpacity onPress={handleClearData} className="py-3">
                     <ZenText className="text-red-500 font-semibold">全データを削除</ZenText>
                  </TouchableOpacity>
                   <TouchableOpacity onPress={handleExportData} className="py-3" style={{ borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#F1F5F9' }}>
                     <ZenText style={{ color: isDark ? '#94A3B8' : '#475569' }}>記録のエクスポート (JSON)</ZenText>
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
