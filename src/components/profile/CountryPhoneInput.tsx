import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import {
  COUNTRY_DIAL_CODES,
  CountryDialCode,
  parsePhoneInput,
  getCountryByIso2,
  getCountryByDialCode,
  DEFAULT_COUNTRY,
} from '../../services/countryDialCodes';

export interface CountryPhoneValue {
  dialCode: string;
  iso2: string;
  nationalNumber: string;
}

export interface CountryPhoneInputProps {
  value: CountryPhoneValue;
  onChange: (next: CountryPhoneValue) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

export const CountryPhoneInput: React.FC<CountryPhoneInputProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = '677123456',
  id = 'country-phone-input',
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Derive current country object
  const currentCountry =
    getCountryByIso2(value.iso2) ||
    getCountryByDialCode(value.dialCode) ||
    DEFAULT_COUNTRY;

  // Handle clicking outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // focus search input
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  // Filter countries by name or dial code
  const filteredCountries = COUNTRY_DIAL_CODES.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.dialCode.includes(q) ||
      c.iso2.toLowerCase().includes(q)
    );
  });

  // Handle national number input with Gmail-style auto-routing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;

    // Check for auto-routing (e.g., user pasted "+221771234567" or typed "+237677123456")
    if (rawVal.startsWith('+') || rawVal.startsWith('00') || (rawVal.length > 5 && rawVal.startsWith('237'))) {
      const parsed = parsePhoneInput(rawVal, currentCountry);
      onChange({
        iso2: parsed.country.iso2,
        dialCode: parsed.country.dialCode,
        nationalNumber: parsed.nationalNumber.replace(/\D/g, ''),
      });
      return;
    }

    // Standard digit-only national number typing
    const cleanDigits = rawVal.replace(/\D/g, '');
    onChange({
      iso2: currentCountry.iso2,
      dialCode: currentCountry.dialCode,
      nationalNumber: cleanDigits,
    });
  };

  const handleSelectCountry = (country: CountryDialCode) => {
    onChange({
      iso2: country.iso2,
      dialCode: country.dialCode,
      nationalNumber: value.nationalNumber,
    });
    setDropdownOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="relative w-full flex items-stretch rounded-xl border border-black/15 dark:border-white/15 bg-black/5 dark:bg-white/5 focus-within:border-[#FF8800] focus-within:ring-1 focus-within:ring-[#FF8800] transition-all">
      {/* Country Picker Pill */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          id={`${id}-picker-btn`}
          disabled={disabled}
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="h-full flex items-center gap-1.5 px-3 py-2.5 rounded-l-xl hover:bg-black/5 dark:hover:bg-white/5 border-r border-black/10 dark:border-white/10 transition-colors cursor-pointer text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] select-none"
        >
          <span className="text-base leading-none">{currentCountry.flag}</span>
          <span className="font-mono font-bold text-[#FF8800]">{currentCountry.dialCode}</span>
          <ChevronDown size={13} className="text-[#6B6B75] dark:text-[#A0A0AA]" />
        </button>

        {/* Dropdown Popover */}
        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1.5 w-64 max-h-72 rounded-xl bg-white dark:bg-[#1C1C1F] border border-[#FF8800]/25 shadow-xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Search Box */}
            <div className="p-2 border-b border-black/10 dark:border-white/10 flex items-center gap-2">
              <Search size={14} className="text-[#6B6B75]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search country or code..."
                className="w-full text-xs bg-transparent text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 p-1">
              {filteredCountries.map((c) => {
                const isSelected = c.iso2 === currentCountry.iso2;
                return (
                  <button
                    key={c.iso2}
                    type="button"
                    onClick={() => handleSelectCountry(c)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                      isSelected
                        ? 'bg-[#FF8800]/15 text-[#FF8800] font-bold'
                        : 'hover:bg-black/5 dark:hover:bg-white/5 text-[#1A1A1E] dark:text-[#F5F5F7]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-sm">{c.flag}</span>
                      <span className="truncate">{c.name}</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] ml-2 shrink-0">
                      {c.dialCode}
                    </span>
                  </button>
                );
              })}
              {filteredCountries.length === 0 && (
                <div className="p-3 text-center text-xs text-[#6B6B75]">
                  No country found
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* National Number Input */}
      <input
        type="tel"
        id={id}
        disabled={disabled}
        required
        value={value.nationalNumber}
        onChange={handleInputChange}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-transparent text-sm sm:text-xs text-[#1A1A1E] dark:text-[#F5F5F7] font-mono focus:outline-none placeholder:text-[#6B6B75]/50"
      />
    </div>
  );
};
