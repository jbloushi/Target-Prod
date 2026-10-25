import React, { useState, useRef, useEffect, useMemo } from 'react';
import { countries, ARABIC_COUNTRY_NAMES, filterCountries } from '../../utils/countries';

/**
 * SearchablePhoneDialSelector
 * Allows users to click and type country name, ISO code, or dial code (e.g. "kuwait", "kw", "+965", "egypt", "+20")
 * to quickly select the phone country prefix.
 */
export const SearchablePhoneDialSelector = ({
  value = '+965',
  countryCode = '',
  onChange,
  disabled = false,
  isRTL = false,
  variant = 'wizard', // 'wizard' | 'daisy'
  className = ''
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedCountry = useMemo(() => {
    const cleanVal = String(value || '').trim();
    if (cleanVal) {
      if (countryCode) {
        const byCodeAndDial = countries.find(
          c => c.code === String(countryCode).toUpperCase() && c.dialCode === cleanVal
        );
        if (byCodeAndDial) return byCodeAndDial;
      }
      const byExactDial = countries.find(c => c.dialCode === cleanVal);
      if (byExactDial) return byExactDial;
      const cleanDigits = cleanVal.replace(/\D/g, '');
      if (cleanDigits) {
        const byDigits = countries.find(c => c.dialCode.replace(/\D/g, '') === cleanDigits);
        if (byDigits) return byDigits;
      }
    }
    if (countryCode) {
      const byCodeOnly = countries.find(c => c.code === String(countryCode).toUpperCase());
      if (byCodeOnly) return byCodeOnly;
    }
    return countries.find(c => c.code === 'KW') || countries[0];
  }, [value, countryCode]);

  const filtered = useMemo(() => filterCountries(query), [query]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (country) => {
    if (!country) return;
    if (onChange) {
      onChange(country.dialCode, country);
    }
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIdx]) {
        handleSelect(filtered[highlightIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const buttonClasses = variant === 'daisy'
    ? 'btn btn-sm btn-outline border-base-300 bg-base-100 hover:bg-base-200/60 hover:border-primary/60 text-xs font-mono font-bold px-2.5 shrink-0 flex items-center gap-1 min-w-[96px] justify-between'
    : 'text-[11px] font-bold text-[#0050d4] bg-[#f0f4f8] hover:bg-[#e3eaf4] border border-transparent focus:border-[#0050d4] rounded-lg px-2 py-1 outline-none cursor-pointer shrink-0 flex items-center gap-1 min-w-[92px] justify-between transition-colors';

  return (
    <div ref={containerRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={handleKeyDown}
        title={isRTL ? 'اختر مفتاح الدولة أو ابحث بالكتابة' : 'Click & type to search country dial code'}
        className={buttonClasses}
      >
        <span className="flex items-center gap-1 truncate">
          <span>{selectedCountry?.flag || '🌐'}</span>
          <span className="font-mono">{selectedCountry?.dialCode || value || '+965'}</span>
        </span>
        <span className="material-symbols-outlined text-[14px] opacity-70">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1.5 w-72 bg-white border border-[#e2e8f0] rounded-xl shadow-xl overflow-hidden animate-in fade-in duration-100"
          style={{ [isRTL ? 'right' : 'left']: 0 }}
        >
          <div className="p-2 border-b border-[#f0f4f8] bg-[#f8fafc] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-[#0050d4]">search</span>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRTL ? 'ابحث باسم الدولة أو المفتاح (+965, KW)...' : 'Type country, code or +dial...'}
              className="w-full text-xs font-semibold bg-transparent outline-none text-[#1a1f23] placeholder:text-[#8c9196]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-[#8c9196] hover:text-[#1a1f23] text-xs px-1"
              >
                ✕
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-[#f8fafc]">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-[#8c9196]">
                {isRTL ? 'لا توجد دولة مطابقة للبحث' : 'No matching country found'}
              </div>
            ) : (
              filtered.map((c, idx) => {
                const isSelected = c.code === selectedCountry?.code && c.dialCode === selectedCountry?.dialCode;
                const isHighlighted = idx === highlightIdx;
                const arName = ARABIC_COUNTRY_NAMES[c.code];
                return (
                  <button
                    key={`${c.code}-${c.dialCode}`}
                    type="button"
                    onClick={() => handleSelect(c)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={`w-full px-3 py-2 text-start text-xs flex items-center justify-between gap-2 transition-colors ${
                      isHighlighted
                        ? 'bg-[#ebf0fc] text-[#0050d4]'
                        : isSelected
                        ? 'bg-[#f5f8ff] text-[#0050d4] font-bold'
                        : 'text-[#1a1f23] hover:bg-[#f8fafc]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{c.flag}</span>
                      <div className="truncate">
                        <span className="font-semibold">{isRTL && arName ? arName : c.name}</span>
                        <span className="text-[10px] text-[#8c9196] ms-1">({c.code})</span>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-[11px] text-[#0050d4] bg-[#f0f4f8] px-1.5 py-0.5 rounded shrink-0">
                      {c.dialCode}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * SearchableCountrySelect
 * Searchable combobox for selecting a Country by typing its English name, Arabic name, ISO code, or dial code.
 * Supports valueMode="code" (e.g. 'KW') or valueMode="name" (e.g. 'Kuwait').
 */
export const SearchableCountrySelect = ({
  value = 'KW',
  valueMode = 'code', // 'code' | 'name'
  onChange,
  disabled = false,
  error = false,
  isRTL = false,
  variant = 'wizard', // 'wizard' | 'daisy'
  className = ''
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedCountry = useMemo(() => {
    const valStr = String(value || '').trim();
    if (!valStr) return countries.find(c => c.code === 'KW') || countries[0];
    return (
      countries.find(c => c.code.toLowerCase() === valStr.toLowerCase()) ||
      countries.find(c => c.name.toLowerCase() === valStr.toLowerCase()) ||
      countries.find(c => c.code === 'KW') ||
      countries[0]
    );
  }, [value]);

  const filtered = useMemo(() => filterCountries(query), [query]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (country) => {
    if (!country) return;
    if (onChange) {
      const nextVal = valueMode === 'name' ? country.name : country.code;
      onChange(nextVal, country);
    }
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIdx]) {
        handleSelect(filtered[highlightIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const arSelectedName = selectedCountry ? ARABIC_COUNTRY_NAMES[selectedCountry.code] : '';
  const displayLabel = selectedCountry
    ? `${selectedCountry.flag} ${isRTL && arSelectedName ? arSelectedName : selectedCountry.name} (${selectedCountry.code})`
    : value;

  const triggerClasses = variant === 'daisy'
    ? `btn btn-sm w-full justify-between font-medium text-sm bg-base-100 hover:bg-base-100 border ${
        error ? 'border-error text-error' : 'border-base-300 focus:border-primary'
      }`
    : `w-full p-2 border-[1.5px] rounded-xl text-xs font-semibold outline-none bg-white cursor-pointer flex items-center justify-between gap-2 transition-all ${
        error ? 'border-red-400 bg-red-50/20' : open ? 'border-[#0050d4]' : 'border-[#e9edf2] hover:border-[#c7d7fa]'
      }`;

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={handleKeyDown}
        className={triggerClasses}
      >
        <span className="truncate text-start">{displayLabel}</span>
        <span className="material-symbols-outlined text-[16px] text-[#8c9196] shrink-0">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[250px] bg-white border border-[#e2e8f0] rounded-xl shadow-xl overflow-hidden animate-in fade-in duration-100">
          <div className="p-2 border-b border-[#f0f4f8] bg-[#f8fafc] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-[#0050d4]">search</span>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRTL ? 'اكتب اسم الدولة أو الرمز للبحث...' : 'Type country name, code or +dial...'}
              className="w-full text-xs font-semibold bg-transparent outline-none text-[#1a1f23] placeholder:text-[#8c9196]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-[#8c9196] hover:text-[#1a1f23] text-xs px-1"
              >
                ✕
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-[#f8fafc]">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-[#8c9196]">
                {isRTL ? 'لا توجد دولة مطابقة للبحث' : 'No matching country found'}
              </div>
            ) : (
              filtered.map((c, idx) => {
                const isSelected = c.code === selectedCountry?.code;
                const isHighlighted = idx === highlightIdx;
                const arName = ARABIC_COUNTRY_NAMES[c.code];
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleSelect(c)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={`w-full px-3 py-2 text-start text-xs flex items-center justify-between gap-2 transition-colors ${
                      isHighlighted
                        ? 'bg-[#ebf0fc] text-[#0050d4]'
                        : isSelected
                        ? 'bg-[#f5f8ff] text-[#0050d4] font-bold'
                        : 'text-[#1a1f23] hover:bg-[#f8fafc]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{c.flag}</span>
                      <span className="truncate font-semibold">{isRTL && arName ? arName : c.name}</span>
                      <span className="text-[10px] text-[#8c9196] shrink-0">({c.code})</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#575c60] shrink-0">
                      {c.dialCode}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableCountrySelect;
