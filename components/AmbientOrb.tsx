// components/AmbientOrb.tsx
// リラクゼーションスタイルの抽象的オーブアニメーション
// AIとユーザーの状態を直感的に表現

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

type OrbState = 'connecting' | 'listening' | 'userTalking' | 'aiThinking' | 'aiTalking';

interface AmbientOrbProps {
  state: OrbState;
}

// 状態別のカラーパレット
const STATE_COLORS: Record<OrbState, { inner: string[]; outer: string }> = {
  // 接続中: グレー系（待機）
  connecting: {
    inner: ['#9ca3af', '#6b7280', '#4b5563'],
    outer: 'rgba(156, 163, 175, 0.3)',
  },
  // リスニング: 落ち着いた紫/インディゴ（待機・安定）
  listening: {
    inner: ['#a78bfa', '#8b5cf6', '#7c3aed'],
    outer: 'rgba(167, 139, 250, 0.3)',
  },
  // ユーザー発話中: グリーン系（自分が話している）
  userTalking: {
    inner: ['#4ade80', '#22c55e', '#16a34a'],
    outer: 'rgba(74, 222, 128, 0.4)',
  },
  // AI思考中: 紫/ピンク（処理中）
  aiThinking: {
    inner: ['#c084fc', '#a855f7', '#9333ea'],
    outer: 'rgba(192, 132, 252, 0.3)',
  },
  // AI発話中: 暖かいオレンジ/ピンク（AIが話している）
  aiTalking: {
    inner: ['#fb923c', '#f97316', '#ea580c'],
    outer: 'rgba(251, 146, 60, 0.4)',
  },
};

// 状態別のアニメーション設定
const STATE_ANIMATION: Record<OrbState, { scale: number; duration: number }> = {
  connecting: { scale: 1.05, duration: 2000 },
  listening: { scale: 1.1, duration: 3000 },
  userTalking: { scale: 1.25, duration: 500 },
  aiThinking: { scale: 1.15, duration: 800 },
  aiTalking: { scale: 1.3, duration: 600 },
};

export function AmbientOrb({ state }: AmbientOrbProps) {
  // メインオーブのアニメーション
  const [scaleAnim] = useState(new Animated.Value(1));
  const scaleAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  
  // 波紋アニメーション（AI発話中のみ）
  const [ripple1] = useState(new Animated.Value(0));
  const [ripple2] = useState(new Animated.Value(0));
  const [ripple3] = useState(new Animated.Value(0));
  const rippleAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const colors = STATE_COLORS[state];
  const animConfig = STATE_ANIMATION[state];

  // メインオーブのスケールアニメーション
  useEffect(() => {
    if (scaleAnimRef.current) {
      scaleAnimRef.current.stop();
    }

    scaleAnimRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: animConfig.scale,
          duration: animConfig.duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: animConfig.duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    scaleAnimRef.current.start();

    return () => {
      if (scaleAnimRef.current) {
        scaleAnimRef.current.stop();
      }
    };
  }, [state, animConfig.scale, animConfig.duration]);

  // 波紋アニメーション（AI発話中のみ）
  useEffect(() => {
    if (rippleAnimRef.current) {
      rippleAnimRef.current.stop();
    }
    
    // リセット
    ripple1.setValue(0);
    ripple2.setValue(0);
    ripple3.setValue(0);

    if (state === 'aiTalking') {
      const createRipple = (anim: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, {
              toValue: 1,
              duration: 2000,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ])
        );
      };

      rippleAnimRef.current = Animated.parallel([
        createRipple(ripple1, 0),
        createRipple(ripple2, 600),
        createRipple(ripple3, 1200),
      ]);
      rippleAnimRef.current.start();
    }

    return () => {
      if (rippleAnimRef.current) {
        rippleAnimRef.current.stop();
      }
    };
  }, [state]);

  // 波紋のスタイル
  const getRippleStyle = (anim: Animated.Value) => ({
    transform: [
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 2.5],
        }),
      },
    ],
    opacity: anim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.6, 0.3, 0],
    }),
  });

  return (
    <View className="items-center justify-center w-80 h-80">
      {/* 波紋エフェクト（AI発話中のみ） */}
      {state === 'aiTalking' && (
        <>
          <Animated.View
            style={[getRippleStyle(ripple1)]}
            className="absolute w-48 h-48 rounded-full"
          >
            <View
              className="w-full h-full rounded-full"
              style={{ backgroundColor: colors.outer }}
            />
          </Animated.View>
          <Animated.View
            style={[getRippleStyle(ripple2)]}
            className="absolute w-48 h-48 rounded-full"
          >
            <View
              className="w-full h-full rounded-full"
              style={{ backgroundColor: colors.outer }}
            />
          </Animated.View>
          <Animated.View
            style={[getRippleStyle(ripple3)]}
            className="absolute w-48 h-48 rounded-full"
          >
            <View
              className="w-full h-full rounded-full"
              style={{ backgroundColor: colors.outer }}
            />
          </Animated.View>
        </>
      )}

      {/* アウターグロー */}
      <Animated.View
        style={{
          transform: [{ scale: scaleAnim }],
        }}
        className="absolute w-56 h-56 rounded-full"
      >
        <View
          className="w-full h-full rounded-full"
          style={{
            backgroundColor: colors.outer,
            shadowColor: colors.inner[1],
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 40,
          }}
        />
      </Animated.View>

      {/* メインオーブ */}
      <Animated.View
        style={{
          transform: [{ scale: scaleAnim }],
        }}
        className="w-48 h-48 rounded-full overflow-hidden"
      >
        <LinearGradient
          colors={colors.inner as [string, string, ...string[]]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          className="w-full h-full"
          style={{
            shadowColor: colors.inner[0],
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 30,
          }}
        />
      </Animated.View>

      {/* インナーハイライト */}
      <Animated.View
        style={{
          transform: [{ scale: scaleAnim }],
        }}
        className="absolute w-20 h-20 rounded-full bg-white/20"
        pointerEvents="none"
      />
    </View>
  );
}
