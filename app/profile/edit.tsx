import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BentoCard } from '../../components/ui/BentoCard';
import { ZenHeading, ZenText } from '../../components/ui/Typography';
import { StorageService } from '../../services/storage';

export default function ProfileEditScreen() {
  const router = useRouter();
  
  const [userName, setUserName] = useState('');
  const [occupation, setOccupation] = useState('');
  const [goals, setGoals] = useState('');
  const [bio, setBio] = useState('');
  const [interestsInput, setInterestsInput] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await StorageService.getUserSettings();
    setUserName(settings.userName || '');
    setOccupation(settings.occupation || '');
    setGoals(settings.goals || '');
    setBio(settings.bio || '');
    setInterestsInput((settings.interests || []).join(', '));
  };

  const handleSave = async () => {
    const interests = interestsInput
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    await StorageService.saveUserSettings({
      userName,
      occupation,
      goals,
      bio,
      interests,
    });
    router.back();
  };

  return (
    <View className="flex-1 bg-zen-bg">
      <LinearGradient
        colors={['#F9FAFB', '#F3F4F6', '#F9FAFB']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-6 py-4 flex-row items-center justify-between border-b border-white">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center bg-white rounded-full shadow-sm">
             <Ionicons name="close" size={24} color="#64748b" />
          </TouchableOpacity>
          <ZenHeading level={2} className="text-lg text-slate-700">プロファイル編集</ZenHeading>
          <View className="w-10" />
        </View>

        <KeyboardAvoidingView 
           behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
           className="flex-1"
        >
          <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>
            <View className="gap-6">
              
              {/* Basic Info */}
              <BentoCard className="bg-white/80 p-5">
                 <ZenHeading level={3} className="text-slate-500 mb-4 text-xs font-bold uppercase tracking-widest">基本情報</ZenHeading>
                 
                 <View className="mb-4">
                    <ZenText className="text-slate-600 mb-2 font-bold">お名前（呼び名）</ZenText>
                    <TextInput 
                       value={userName}
                       onChangeText={setUserName}
                       placeholder="AIが呼ぶ名前を入力"
                       className="bg-slate-50 p-4 rounded-xl text-slate-800 text-base border border-slate-200"
                    />
                 </View>

                 <View>
                    <ZenText className="text-slate-600 mb-2 font-bold">職業・立場</ZenText>
                    <TextInput 
                       value={occupation}
                       onChangeText={setOccupation}
                       placeholder="例：デザイナー、学生、主婦..."
                       className="bg-slate-50 p-4 rounded-xl text-slate-800 text-base border border-slate-200"
                    />
                 </View>
              </BentoCard>

              {/* Context Info */}
              <BentoCard className="bg-white/80 p-5">
                 <ZenHeading level={3} className="text-slate-500 mb-4 text-xs font-bold uppercase tracking-widest">AIへのコンテキスト</ZenHeading>
                 
                 <View className="mb-4">
                    <ZenText className="text-slate-600 mb-2 font-bold">興味・関心（カンマ区切り）</ZenText>
                    <TextInput 
                       value={interestsInput}
                       onChangeText={setInterestsInput}
                       placeholder="例：旅行, カフェ巡り, 読書"
                       className="bg-slate-50 p-4 rounded-xl text-slate-800 text-base border border-slate-200"
                    />
                 </View>

                 <View className="mb-4">
                    <ZenText className="text-slate-600 mb-2 font-bold">今の目標・やりたいこと</ZenText>
                    <TextInput 
                       value={goals}
                       onChangeText={setGoals}
                       multiline
                       numberOfLines={3}
                       placeholder="例：もっとポジティブになりたい、英語を勉強したい"
                       className="bg-slate-50 p-4 rounded-xl text-slate-800 text-base border border-slate-200 h-24"
                       style={{ textAlignVertical: 'top' }}
                    />
                 </View>

                 <View>
                    <ZenText className="text-slate-600 mb-2 font-bold">その他・バイオグラフィー</ZenText>
                    <TextInput 
                       value={bio}
                       onChangeText={setBio}
                       multiline
                       numberOfLines={3}
                       placeholder="AIに知っておいてほしいこと..."
                       className="bg-slate-50 p-4 rounded-xl text-slate-800 text-base border border-slate-200 h-24"
                       style={{ textAlignVertical: 'top' }}
                    />
                 </View>
              </BentoCard>

              {/* Save Button */}
              <TouchableOpacity 
                onPress={handleSave}
                className="bg-indigo-600 rounded-2xl py-4 shadow-lg shadow-indigo-200 mt-4 active:scale-95"
              >
                 <ZenText className="text-white text-center font-bold text-lg">保存する</ZenText>
              </TouchableOpacity>

            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
