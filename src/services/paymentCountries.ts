// Bidou AI - Payment Countries & Supported Rails Configuration
import { PaymentRail, PaymentMethodCountry } from '../types';

export interface PaymentCountryInfo {
  code: PaymentMethodCountry;
  name: string;
  dialing_code: string;
  flag_emoji: string;
  supported_rails: PaymentRail[];
  min_digits: number;
  max_digits: number;
  placeholder: string;
}

export const SUPPORTED_PAYMENT_COUNTRIES: PaymentCountryInfo[] = [
  {
    code: 'CM',
    name: 'Cameroon',
    dialing_code: '+237',
    flag_emoji: '🇨🇲',
    supported_rails: ['mtn_momo', 'orange_money'],
    min_digits: 9,
    max_digits: 9,
    placeholder: '6XXXXXXXX',
  },
  {
    code: 'CI',
    name: "Côte d'Ivoire",
    dialing_code: '+225',
    flag_emoji: '🇨🇮',
    supported_rails: ['mtn_momo', 'orange_money'],
    min_digits: 8,
    max_digits: 10,
    placeholder: '07XXXXXXXX',
  },
  {
    code: 'SN',
    name: 'Senegal',
    dialing_code: '+221',
    flag_emoji: '🇸🇳',
    supported_rails: ['orange_money'],
    min_digits: 9,
    max_digits: 9,
    placeholder: '77XXXXXXX',
  },
  {
    code: 'BJ',
    name: 'Benin',
    dialing_code: '+229',
    flag_emoji: '🇧🇯',
    supported_rails: ['mtn_momo'],
    min_digits: 8,
    max_digits: 10,
    placeholder: '97XXXXXX',
  },
  {
    code: 'TG',
    name: 'Togo',
    dialing_code: '+228',
    flag_emoji: '🇹🇬',
    supported_rails: ['mtn_momo'],
    min_digits: 8,
    max_digits: 8,
    placeholder: '90XXXXXX',
  },
  {
    code: 'ML',
    name: 'Mali',
    dialing_code: '+223',
    flag_emoji: '🇲🇱',
    supported_rails: ['orange_money'],
    min_digits: 8,
    max_digits: 8,
    placeholder: '7XXXXXXX',
  },
  {
    code: 'BF',
    name: 'Burkina Faso',
    dialing_code: '+226',
    flag_emoji: '🇧🇫',
    supported_rails: ['orange_money'],
    min_digits: 8,
    max_digits: 8,
    placeholder: '70XXXXXX',
  },
  {
    code: 'GN',
    name: 'Guinea',
    dialing_code: '+224',
    flag_emoji: '🇬🇳',
    supported_rails: ['mtn_momo', 'orange_money'],
    min_digits: 9,
    max_digits: 9,
    placeholder: '62XXXXXXX',
  },
  {
    code: 'CG',
    name: 'Congo',
    dialing_code: '+242',
    flag_emoji: '🇨🇬',
    supported_rails: ['mtn_momo'],
    min_digits: 9,
    max_digits: 9,
    placeholder: '06XXXXXXX',
  },
  {
    code: 'CD',
    name: 'DR Congo',
    dialing_code: '+243',
    flag_emoji: '🇨🇩',
    supported_rails: ['orange_money'],
    min_digits: 9,
    max_digits: 9,
    placeholder: '81XXXXXXX',
  },
  {
    code: 'GA',
    name: 'Gabon',
    dialing_code: '+241',
    flag_emoji: '🇬🇦',
    supported_rails: ['orange_money'],
    min_digits: 8,
    max_digits: 8,
    placeholder: '07XXXXXX',
  },
];

export const getPaymentCountry = (code: PaymentMethodCountry): PaymentCountryInfo => {
  return (
    SUPPORTED_PAYMENT_COUNTRIES.find((c) => c.code === code) ||
    SUPPORTED_PAYMENT_COUNTRIES[0]
  );
};

export const normalizePhoneNumber = (rawPhone: string, dialingCode?: string): string => {
  let cleaned = rawPhone.replace(/\D/g, '');
  if (dialingCode) {
    const codeDigits = dialingCode.replace(/\D/g, '');
    if (cleaned.startsWith(codeDigits)) {
      cleaned = cleaned.slice(codeDigits.length);
    }
  }
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
};

export const formatDisplayPhoneNumber = (dialingCode: string, phone: string, masked: boolean = false): string => {
  if (!phone) return dialingCode;
  if (masked) {
    if (phone.length <= 4) return `${dialingCode} ••${phone}`;
    const lastTwo = phone.slice(-2);
    const firstDigit = phone.slice(0, 1);
    return `${dialingCode} ${firstDigit}•• •• •• ${lastTwo}`;
  }
  // Format into chunks of 2 or 3
  const chunks = phone.match(/.{1,2}/g)?.join(' ') || phone;
  return `${dialingCode} ${chunks}`;
};
