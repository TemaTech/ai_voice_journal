import { useColorScheme } from 'nativewind';
import { View, ViewProps, ViewStyle } from 'react-native';

type GlassViewProps = ViewProps & {
  className?: string;
  intensity?: number; // fallback opacity for now: 0-100 map to 0.-1.
};

export function GlassView({ className, intensity = 50, style, children, ...props }: GlassViewProps) {
  //将来的にはExpo BlurViewを使うが、まずは非依存のStyleで実装
  // Premium Cleanな「すりガラス」風スタイル
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  // className または style に backgroundColor が含まれているかチェック
  const hasCustomBg = className?.includes('bg-') || 
    (style && typeof style === 'object' && 'backgroundColor' in (style as ViewStyle));

  // デフォルトの背景色（dark: variant の代わりにインラインで適用）
  const defaultBgStyle = hasCustomBg ? {} : {
    backgroundColor: isDark ? 'rgba(39, 39, 42, 0.9)' : 'rgba(255, 255, 255, 0.85)',
  };
  
  return (
    <View
      className={`border border-glass-border rounded-3xl overflow-hidden ${className || ''}`}
      style={[
        defaultBgStyle,
        {
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: 4,
          },
          shadowOpacity: 0.05,
          shadowRadius: 12,
          elevation: 4,
        },
        style
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

