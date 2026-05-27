'use client';

import { useRef, useState, type KeyboardEvent } from 'react';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  max?: number;
}

export default function HashtagPills({ value, onChange, disabled, max = 10 }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const clean = raw.trim().replace(/^#+/, '').toLowerCase();
    if (!clean) return;
    if (value.includes(clean)) {
      setDraft('');
      return;
    }
    if (value.length >= max) return;
    onChange([...value, clean]);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      }
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={
        'flex flex-wrap items-center gap-1.5 rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 ' +
        (disabled ? 'opacity-60' : 'cursor-text focus-within:border-zinc-500')
      }
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          #{tag}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((t) => t !== tag));
              }}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
              aria-label={`Remove #${tag}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[#\s,]/g, ''))}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder={value.length === 0 ? 'typescript, nextjs, …' : ''}
        disabled={disabled || value.length >= max}
        className="min-w-[80px] flex-1 bg-transparent outline-none placeholder:text-zinc-400 disabled:opacity-50"
      />
    </div>
  );
}
