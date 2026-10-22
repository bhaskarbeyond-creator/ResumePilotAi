import React, { useState, useEffect, useRef, useId } from 'react';
import { Sparkles, Clock, Compass, Loader2 } from 'lucide-react';
import {
  getLocalSuggestions,
  getAiSuggestions,
  saveRecentSelection,
  type AutocompleteSuggestion,
} from '@/lib/autocomplete-service';

export interface AutocompleteInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onSelect'> {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  suggestionType: string;
  context?: Record<string, unknown>;
  label?: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
  icon?: React.ReactNode;
}

export function AutocompleteInput({
  value,
  onChange,
  onSelect,
  suggestionType,
  context,
  label,
  error,
  helperText,
  containerClassName = '',
  className = '',
  placeholder,
  disabled = false,
  required = false,
  id: externalId,
  icon,
  ...rest
}: AutocompleteInputProps) {
  const generatedId = useId();
  const inputId = externalId || generatedId;

  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchronous local suggestions update on value change
  useEffect(() => {
    if (!isOpen) return;

    // Instant local matches
    const local = getLocalSuggestions(suggestionType, value, 8);
    setSuggestions(local);

    // Debounced AI enrichment
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (value.trim().length >= 2) {
      debounceTimerRef.current = setTimeout(async () => {
        setIsLoadingAi(true);
        try {
          const ai = await getAiSuggestions(suggestionType, value, context);
          if (ai.length > 0) {
            setSuggestions((prev) => {
              const seen = new Set(prev.map((s) => s.text.toLowerCase()));
              const combined = [...prev];
              for (const item of ai) {
                if (!seen.has(item.text.toLowerCase())) {
                  combined.push(item);
                  seen.add(item.text.toLowerCase());
                }
              }
              return combined.slice(0, 10);
            });
          }
        } finally {
          setIsLoadingAi(false);
        }
      }, 400);
    } else {
      setIsLoadingAi(false);
    }

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [value, isOpen, suggestionType, context]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFocus = () => {
    const local = getLocalSuggestions(suggestionType, value, 8);
    setSuggestions(local);
    setIsOpen(local.length > 0);
  };

  const handleSelect = (itemText: string) => {
    onChange(itemText);
    saveRecentSelection(suggestionType, itemText);
    onSelect?.(itemText);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
        return;
      }
      rest.onKeyDown?.(e);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex].text);
      } else {
        rest.onKeyDown?.(e);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    } else {
      rest.onKeyDown?.(e);
    }
  };

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <label htmlFor={inputId} className="flex items-center gap-1 text-xs font-semibold text-ink">
          {icon}
          <span>{label}</span>
          {required && <span className="text-error-500">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          {...rest}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          className={`flex h-9 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-muted transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${error ? 'border-error-500' : 'hover:border-neutral-400'} ${className}`}
        />

        {isLoadingAi && (
          <div className="absolute right-3 flex items-center text-brand-600 animate-spin pointer-events-none" title="AI suggestions loading">
            <Loader2 className="size-3.5" />
          </div>
        )}
      </div>

      {helperText && !error && (
        <p className="text-[11px] text-ink-muted">{helperText}</p>
      )}
      {error && (
        <p className="text-[11px] font-medium text-error-600">{error}</p>
      )}

      {/* Autocomplete Dropdown List */}
      {isOpen && suggestions.length > 0 && !disabled && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-xl border border-border/80 bg-surface/98 backdrop-blur-md p-1 shadow-lg animate-in fade-in zoom-in-95 duration-150"
        >
          {suggestions.map((item, index) => {
            const isHighlighted = index === highlightedIndex;
            return (
              <button
                key={`${item.text}-${index}`}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => handleSelect(item.text)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                  isHighlighted ? 'bg-brand-50 text-brand-900 font-semibold' : 'text-ink hover:bg-neutral-100'
                }`}
              >
                <span className="truncate pr-2">{item.text}</span>
                <span className="shrink-0 flex items-center gap-1 text-[10px] opacity-70">
                  {item.source === 'ai' && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                      <Sparkles className="size-2.5 text-purple-600" />
                      AI
                    </span>
                  )}
                  {item.source === 'recent' && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                      <Clock className="size-2.5" />
                      Recent
                    </span>
                  )}
                  {item.source === 'directory' && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                      <Compass className="size-2.5" />
                      Suggested
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
