import { Text, TextProps } from 'react-native';

type ZenTextProps = TextProps & {
  className?: string;
  variant?: 'body' | 'caption' | 'label';
};

export function ZenText({ className, variant = 'body', style, ...props }: ZenTextProps) {
  const baseStyle = "font-zen text-text-primary dark:text-slate-100";
  const variants = {
    body: "text-base leading-relaxed",
    caption: "text-sm text-slate-500 dark:text-slate-400",
    label: "text-xs font-semibold tracking-wider text-slate-400 uppercase",
  };

  return (
    <Text 
      className={`${baseStyle} ${variants[variant]} ${className || ''}`} 
      style={style}
      {...props} 
    />
  );
}

type ZenHeadingProps = TextProps & {
  className?: string;
  level?: 1 | 2 | 3;
};

export function ZenHeading({ className, level = 1, style, ...props }: ZenHeadingProps) {
  const baseStyle = "font-zen font-bold text-text-primary dark:text-white";
  const sizes = {
    1: "text-3xl tracking-tight",
    2: "text-xl tracking-tight",
    3: "text-lg",
  };

  return (
    <Text 
      className={`${baseStyle} ${sizes[level]} ${className || ''}`} 
      style={style}
      {...props} 
    />
  );
}
