import { View, ViewProps } from 'react-native';

type GlassViewProps = ViewProps & {
  className?: string;
  intensity?: number; // fallback opacity for now: 0-100 map to 0.-1.
};

export function GlassView({ className, intensity = 50, style, children, ...props }: GlassViewProps) {
  //将来的にはExpo BlurViewを使うが、まずは非依存のStyleで実装
  // Premium Cleanな「すりガラス」風スタイル
  
  return (
    <View
      className={`border border-glass-border rounded-3xl backdrop-blur-xl overflow-hidden ${className?.includes('bg-') ? '' : 'bg-white/85 dark:bg-zinc-800/90'} ${className || ''}`}
      style={[
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
