import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
    Easing,
    Extrapolation,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming
} from 'react-native-reanimated';

type VisualizerState = 'connecting' | 'listening' | 'userTalking' | 'aiThinking' | 'aiTalking';

interface VoiceVisualizerProps {
  state: VisualizerState;
}

// State Configuration
const STATE_CONFIG: Record<VisualizerState, { colors: string[]; scale: number; speed: number }> = {
  connecting: {
    colors: ['#64748b', '#475569', '#334155'], // Slate (Waiting)
    scale: 0.9,
    speed: 2000,
  },
  listening: {
    colors: ['#a78bfa', '#8b5cf6', '#7c3aed'], // Violet (Active Listening)
    scale: 1.0,
    speed: 3000, // Slow breathing
  },
  userTalking: {
    colors: ['#34d399', '#10b981', '#059669'], // Emerald (User Input)
    scale: 1.2,
    speed: 800, // Faster pulse
  },
  aiThinking: {
    colors: ['#e879f9', '#d946ef', '#c026d3'], // Fuchsia (Processing)
    scale: 1.1,
    speed: 1000,
  },
  aiTalking: {
    colors: ['#f472b6', '#ec4899', '#db2777'], // Pink (Output)
    scale: 1.15, // Reduced from 1.3
    speed: 1200, // Slower (Reserved)
  },
};

export function VoiceVisualizer({ state }: VoiceVisualizerProps) {
  const config = STATE_CONFIG[state];
  
  // Shared Values
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.8);
  const glowScale = useSharedValue(1);

  // Effect: Handle State Changes
  useEffect(() => {
    // Reset animations when state changes
    scale.value = withRepeat(
      withSequence(
        withTiming(config.scale, { duration: config.speed / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: config.speed / 2, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: config.speed, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: config.speed, easing: Easing.out(Easing.ease) })
      ),
      -1,
      true
    );
  }, [state]);

  // Animated Styles
  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: interpolate(glowScale.value, [1, 1.5], [0.6, 0], Extrapolation.CLAMP),
  }));

  return (
    <View className="items-center justify-center w-80 h-80">
      {/* Outer Glow / Ripple */}
      <Animated.View 
        className="absolute w-48 h-48 rounded-full bg-white/10"
        style={glowStyle}
      />
      
      {/* Main Orb */}
      <Animated.View 
        className="w-48 h-48 rounded-full overflow-hidden shadow-2xl shadow-indigo-500/50"
        style={orbStyle}
      >
        <LinearGradient
          colors={config.colors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="flex-1 items-center justify-center"
        >
            {/* Inner Highlight for 3D effect */}
            <View className="absolute top-4 left-4 w-16 h-16 bg-white/20 rounded-full blur-xl" />
        </LinearGradient>
      </Animated.View>
      
      {/* Glass Overlay for Texture (Fallback) */}
      <Animated.View 
        className="absolute w-48 h-48 rounded-full overflow-hidden opacity-30 bg-white/40"
        style={orbStyle}
      />
    </View>
  );
}
