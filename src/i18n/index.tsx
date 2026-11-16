import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import enLocale from './locales/en.json';
import thLocale from './locales/th.json';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  type SupportedLanguage,
  type TranslateFn,
  type TranslationParams,
} from './types';

export type { SupportedLanguage, TranslateFn, TranslationParams } from './types';
export { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY } from './types';

type LocaleTree = Record<string, unknown>;

const LOCALES: Record<SupportedLanguage, LocaleTree> = {
  en: enLocale as LocaleTree,
  th: thLocale as LocaleTree,
};

export function validateLanguage(raw: unknown): SupportedLanguage {
  if (raw === 'th') return 'th';
  return DEFAULT_LANGUAGE;
}

export function readStoredLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return validateLanguage(raw);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function writeStoredLanguage(lang: SupportedLanguage): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, validateLanguage(lang));
  } catch {
    // Ignore storage quota / private browsing errors
  }
}

function resolveNestedKey(tree: LocaleTree, key: string): string | null {
  const parts = key.split('.');
  let current: unknown = tree;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : null;
}

export function translate(
  language: SupportedLanguage,
  key: string,
  params?: TranslationParams
): string {
  const safeLang = validateLanguage(language);
  const template =
    resolveNestedKey(LOCALES[safeLang], key) ??
    resolveNestedKey(LOCALES[DEFAULT_LANGUAGE], key) ??
    key;

  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token: string) => {
    if (token in params) {
      return String(params[token]);
    }
    return match;
  });
}

export function getLocaleTag(language: SupportedLanguage): string {
  return language === 'th' ? 'th-TH' : 'en-US';
}

export function formatNumber(
  value: number,
  language: SupportedLanguage,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(getLocaleTag(language), options).format(value);
}

export function formatDecimal(
  value: number,
  language: SupportedLanguage,
  digits = 2
): string {
  return new Intl.NumberFormat(getLocaleTag(language), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDateTime(
  value: Date | number,
  language: SupportedLanguage,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof value === 'number' ? new Date(value) : value;
  return new Intl.DateTimeFormat(getLocaleTag(language), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options,
  }).format(date);
}

export interface LanguageContextValue {
  language: SupportedLanguage;
  localeTag: string;
  setLanguage: (lang: SupportedLanguage) => void;
  toggleLanguage: () => void;
  t: TranslateFn;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDecimal: (value: number, digits?: number) => string;
  formatDateTime: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() =>
    readStoredLanguage()
  );

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
      document.title = translate(language, 'meta.pageTitle');
    }
    writeStoredLanguage(language);
  }, [language]);

  const setLanguage = useCallback((next: SupportedLanguage) => {
    const safe = validateLanguage(next);
    setLanguageState(safe);
    writeStoredLanguage(safe);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: SupportedLanguage = prev === 'en' ? 'th' : 'en';
      writeStoredLanguage(next);
      return next;
    });
  }, []);

  const t = useCallback<TranslateFn>(
    (key, params) => translate(language, key, params),
    [language]
  );

  const boundFormatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumber(value, language, options),
    [language]
  );

  const boundFormatDecimal = useCallback(
    (value: number, digits = 2) => formatDecimal(value, language, digits),
    [language]
  );

  const boundFormatDateTime = useCallback(
    (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      formatDateTime(value, language, options),
    [language]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      localeTag: getLocaleTag(language),
      setLanguage,
      toggleLanguage,
      t,
      formatNumber: boundFormatNumber,
      formatDecimal: boundFormatDecimal,
      formatDateTime: boundFormatDateTime,
    }),
    [
      language,
      setLanguage,
      toggleLanguage,
      t,
      boundFormatNumber,
      boundFormatDecimal,
      boundFormatDateTime,
    ]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}

export function useTranslation() {
  const { t, language, localeTag, formatNumber: fn, formatDecimal: fd, formatDateTime: fdt } =
    useLanguage();
  return {
    t,
    language,
    localeTag,
    formatNumber: fn,
    formatDecimal: fd,
    formatDateTime: fdt,
  };
}
