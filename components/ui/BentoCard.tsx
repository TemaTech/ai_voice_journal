import { ViewStyle } from 'react-native';
import { GlassView } from './GlassView';

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  size?: 'small' | 'medium' | 'large' | 'tall';
  style?: ViewStyle;
  onPress?: () => void;
}

export function BentoCard({ children, className, size = 'medium', style, onPress }: BentoCardProps) {
  // Gridのサイズ定義 (Flex basisなどで調整想定だが、ここでは汎用コンテナとして)
  const sizeClasses = {
    small: "aspect-square flex-1",   // 1x1
    medium: "aspect-[2/1] flex-[2]", // 2x1
    large: "aspect-[2/2] flex-[2]",  // 2x2
    tall: "aspect-[1/2] flex-1",     // 1x2
  };

  // 実際にはGridレイアウト側でwidth制御することが多いが、
  // ここではスタイル適用のみ行う
  
  return (
    <GlassView 
      className={`p-5 justify-between ${className || ''}`} 
      style={style}
    >
      {children}
    </GlassView>
  );
}
