'use client';

import React, { useRef } from 'react';

interface PinBoxInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  idPrefix?: string;
}

export function PinBoxInput({
  value,
  onChange,
  length = 6,
  autoFocus = false,
  disabled = false,
  idPrefix = 'pin-box',
}: PinBoxInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, idx) => value[idx] || '');

  const handleDigitChange = (idx: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) {
      const next = digits.map((d, i) => (i === idx ? '' : d)).join('');
      onChange(next);
      return;
    }

    if (cleaned.length > 1) {
      const nextArr = [...digits];
      for (let i = 0; i < cleaned.length && idx + i < length; i++) {
        nextArr[idx + i] = cleaned[i];
      }
      onChange(nextArr.join(''));
      const focusIdx = Math.min(idx + cleaned.length, length - 1);
      inputRefs.current[focusIdx]?.focus();
      return;
    }

    const nextArr = [...digits];
    nextArr[idx] = cleaned[0];
    onChange(nextArr.join(''));

    if (idx < length - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const nextArr = [...digits];
        nextArr[idx] = '';
        onChange(nextArr.join(''));
      } else if (idx > 0) {
        const nextArr = [...digits];
        nextArr[idx - 1] = '';
        onChange(nextArr.join(''));
        inputRefs.current[idx - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted) {
      e.preventDefault();
      onChange(pasted);
      const focusIdx = Math.min(pasted.length, length - 1);
      inputRefs.current[focusIdx]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-2.5" role="group" aria-label="6-digit Security PIN">
      {digits.map((digit, idx) => (
        <input
          key={idx}
          id={`${idPrefix}-${idx}`}
          ref={(el) => {
            inputRefs.current[idx] = el;
          }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && idx === 0}
          onChange={(e) => handleDigitChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          placeholder="•"
          className="w-11 h-12 sm:w-12 sm:h-12 text-center font-mono text-lg font-bold rounded-xl bg-[#F4F8FD] border border-[#CBD5E1] text-[#13345D] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#15427B] focus:ring-2 focus:ring-[#15427B]/15 transition-all"
        />
      ))}
    </div>
  );
}
