import React, { useEffect, useRef, useState } from 'react';
import { Coins } from 'lucide-react';

interface AnimatedBalanceProps {
  value: number;
  paidBalance?: number;
  promoBalance?: number;
  className?: string;
  showIcon?: boolean;
  prefix?: string;
  suffix?: string;
}

export const AnimatedBalance: React.FC<AnimatedBalanceProps> = ({
  value,
  paidBalance,
  promoBalance,
  className = '',
  showIcon = true,
  prefix = '',
  suffix = '',
}) => {
  const prevValueRef = useRef(value);
  const [isDeltaPositive, setIsDeltaPositive] = useState<boolean | null>(null);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      setIsDeltaPositive(value > prevValueRef.current);
      prevValueRef.current = value;

      const timer = setTimeout(() => {
        setIsDeltaPositive(null);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [value]);

  const hasBreakdown = paidBalance !== undefined || (promoBalance !== undefined && promoBalance > 0);
  const paidVal = paidBalance ?? Math.max(0, Math.round(value) - Math.round(promoBalance ?? 0));
  const promoVal = Math.round(promoBalance ?? 0);
  const titleText = hasBreakdown
    ? promoVal > 0
      ? `Paid: ${paidVal.toLocaleString()} credits • Free bonus: ${promoVal.toLocaleString()} credits (for fast image models)`
      : `Paid: ${paidVal.toLocaleString()} credits`
    : undefined;

  return (
    <div
      id="animated-credit-balance"
      title={titleText}
      className={`inline-flex items-center gap-1.5 font-bold transition-colors duration-300 ${
        isDeltaPositive === true
          ? 'text-emerald-400'
          : isDeltaPositive === false
          ? 'text-amber-400'
          : 'text-amber-400'
      } ${className}`}
    >
      {showIcon && (
        <Coins
          className={`w-4 h-4 transition-transform duration-300 ${
            isDeltaPositive !== null ? 'scale-125' : 'scale-100'
          }`}
        />
      )}
      <span>{prefix}</span>
      <span>{Math.round(value).toLocaleString()}</span>
      {suffix && <span>{suffix}</span>}
    </div>
  );
};
