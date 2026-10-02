import React from 'react';

export interface GradientBorderProps {
  mode?: 'always' | 'hover' | 'focus';
  radius?: number;        // px, default 24
  thickness?: number;     // px, default 1.5
  speed?: number;         // seconds, default 4
  glow?: boolean;         // adds shadow-[#F86A00]/15 when lit
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const GradientBorder: React.FC<GradientBorderProps> = ({
  mode = 'hover',
  radius = 24,
  thickness = 1.5,
  speed = 4,
  glow = false,
  className = '',
  style,
  children,
}) => {
  const dynamicStyles: React.CSSProperties = {
    '--gb-radius': `${radius}px`,
    '--gb-thickness': `${thickness}px`,
    '--gb-speed': `${speed}s`,
    ...style,
  } as React.CSSProperties;

  return (
    <div
      className={`bidou-gradient-border ${className}`}
      data-mode={mode}
      data-glow={glow ? 'true' : undefined}
      style={dynamicStyles}
    >
      {children}
    </div>
  );
};
