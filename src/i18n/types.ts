export type SupportedLanguage = 'en' | 'th';

export type TranslationParams = Record<string, string | number>;

export type TranslateFn = (key: string, params?: TranslationParams) => string;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const LANGUAGE_STORAGE_KEY = 'urbanguard.language';
