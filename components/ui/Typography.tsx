import { useColorScheme } from 'nativewind';
import { Text, TextProps } from 'react-native';

type ZenTextProps = TextProps & {
  className?: string;
  variant?: 'body' | 'caption' | 'label';
};

export function ZenText({ className, variant = 'body', style, ...props }: ZenTextProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const baseStyle = "font-zen text-text-primary";
  const variants = {
    body: "text-base leading-relaxed",
    caption: "text-sm",
    label: "text-xs font-semibold tracking-wider uppercase",
  };

  // ダークモード用のテキスト色をインラインスタイルで適用
  const darkTextColor = variant === 'caption' || variant === 'label'
    ? (isDark ? '#94A3B8' : undefined) // slate-400
    : (isDark ? '#F1F5F9' : undefined); // slate-100

  return (
    <Text 
      className={`${baseStyle} ${variants[variant]} ${className || ''}`} 
      style={[darkTextColor ? { color: darkTextColor } : undefined, style]}
      {...props} 
    />
  );
}

type ZenHeadingProps = TextProps & {
  className?: string;
  level?: 1 | 2 | 3;
};

export function ZenHeading({ className, level = 1, style, ...props }: ZenHeadingProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const baseStyle = "font-zen font-bold text-text-primary";
  const sizes = {
    1: "text-3xl tracking-tight",
    2: "text-xl tracking-tight",
    3: "text-lg",
  };

  return (
    <Text 
      className={`${baseStyle} ${sizes[level]} ${className || ''}`} 
      style={[isDark ? { color: '#FFFFFF' } : undefined, style]}
      {...props} 
    />
  );
}

