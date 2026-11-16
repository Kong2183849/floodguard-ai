import { Columns2, Globe, Moon, RotateCcw, ShieldAlert, Sun } from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../i18n';
import { localizeScenarioInfo } from '../i18n/domainLabels';

interface TopNavbarProps {
  leftWidthPct: number;
  onResetSplit: () => void;
}

function formatElapsed(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `T+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function TopNavbar({ leftWidthPct, onResetSplit }: TopNavbarProps) {
  const { state, resetSimulation } = useSimulation();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { settings, cityStatus, cityError } = state;

  const activeScenario = localizeScenarioInfo(settings, t, language);

  const statusColor =
    settings.status === 'running'
      ? 'text-[#0891B2] dark:text-cyan-400'
      : settings.status === 'paused'
        ? 'text-[#D97706] dark:text-orange-400'
        : 'text-[#64748B] dark:text-slate-300';

  const statusLabel =
    settings.status === 'running'
      ? t('status.running')
      : settings.status === 'paused'
        ? t('status.paused')
        : t('status.idle');

  const splitModified = Math.abs(leftWidthPct - 70) >= 1;

  return (
    <header
      data-testid="top-navbar"
      className="h-14 shrink-0 bg-white border-b border-[#E2E8F0] dark:bg-[#080f1c] dark:border-slate-800/90 px-3 sm:px-4 lg:px-5 flex items-center justify-between gap-2 lg:gap-3.5 z-30"
    >
      {/* Left Zone: Brand Wordmark + District Context */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#0891B2]/12 border border-[#0891B2]/35 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/40 dark:text-cyan-400 flex items-center justify-center">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <span className="text-sm sm:text-base font-bold tracking-tight text-[#172033] dark:text-slate-50">
            FloodGuard AI
          </span>
        </div>

        <span className="hidden md:inline text-slate-300 dark:text-slate-600" aria-hidden="true">
          /
        </span>
        <span className="hidden md:inline text-xs font-medium text-[#64748B] dark:text-slate-400 truncate">
          {t('header.districtSubtitle')}
        </span>
      </div>

      {/* Right Zone: Live Simulation Status, System State, Theme & Language Switchers, Reset */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <div
          className="hidden xl:flex items-center gap-2 text-xs whitespace-nowrap"
          data-testid="top-simulation-status"
        >
          <span className="text-[#64748B] dark:text-slate-400">{t('header.simulationLabel')}</span>
          <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
          <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-[#172033] dark:text-slate-200 font-medium">
            {activeScenario.label}
          </span>
          <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-700 dark:text-slate-300 font-mono-tabular">
            {formatElapsed(settings.elapsedSeconds)} ({settings.simulationSpeed}×)
          </span>
        </div>

        <div className="hidden xl:block h-4 w-px bg-[#E2E8F0] dark:bg-slate-800" aria-hidden="true" />

        <div className="hidden 2xl:flex items-center gap-1.5 text-xs whitespace-nowrap">
          <span className="text-[#64748B] dark:text-slate-400">{t('header.systemLabel')}</span>
          <span
            className={`font-medium ${
              cityStatus === 'error'
                ? 'text-[#DC2626] dark:text-red-400'
                : cityStatus === 'loading'
                  ? 'text-[#D97706] dark:text-amber-400'
                  : 'text-[#0891B2] dark:text-sky-400'
            }`}
            title={cityError || undefined}
          >
            {cityStatus === 'loading'
              ? t('header.loading3d')
              : cityStatus === 'error'
                ? t('header.modelLoadError')
                : t('header.chatuchakReady')}
          </span>
        </div>

        {/* Light / Dark Theme Switcher */}
        <div
          role="group"
          aria-label={t('header.switchThemeAria')}
          data-testid="theme-switcher"
          className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[#F4F7FB] border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-700/80 shrink-0"
        >
          <button
            type="button"
            data-testid="theme-switch-dark"
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
            title={t('header.themeDark')}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              theme === 'dark'
                ? 'bg-cyan-500/20 border border-cyan-500/45 text-cyan-300 font-semibold'
                : 'border border-transparent text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Moon className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">{t('header.themeDark')}</span>
          </button>
          <button
            type="button"
            data-testid="theme-switch-light"
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
            title={t('header.themeLight')}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              theme === 'light'
                ? 'bg-white border border-[#0891B2]/50 text-[#0891B2] font-semibold shadow-xs'
                : 'border border-transparent text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Sun className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">{t('header.themeLight')}</span>
          </button>
        </div>

        {/* Compact Language Switcher */}
        <div
          role="group"
          aria-label={t('header.switchLanguageAria')}
          data-testid="language-switcher"
          className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[#F4F7FB] border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-700/80 shrink-0"
        >
          <Globe className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 ml-1.5 mr-0.5 hidden sm:block shrink-0" />
          <button
            type="button"
            data-testid="lang-switch-en"
            aria-pressed={language === 'en'}
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              language === 'en'
                ? 'bg-white border border-[#0891B2]/50 text-[#0891B2] font-semibold shadow-xs dark:bg-cyan-500/20 dark:border-cyan-500/45 dark:text-cyan-300 dark:shadow-none'
                : 'border border-transparent text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <span className="sm:hidden">{t('header.langEnShort')}</span>
            <span className="hidden sm:inline">
              {t('header.langEnShort')} | {t('header.langEnFull')}
            </span>
          </button>
          <button
            type="button"
            data-testid="lang-switch-th"
            aria-pressed={language === 'th'}
            onClick={() => setLanguage('th')}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              language === 'th'
                ? 'bg-white border border-[#0891B2]/50 text-[#0891B2] font-semibold shadow-xs dark:bg-cyan-500/20 dark:border-cyan-500/45 dark:text-cyan-300 dark:shadow-none'
                : 'border border-transparent text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <span className="sm:hidden">{t('header.langThShort')}</span>
            <span className="hidden sm:inline">
              {t('header.langThShort')} | {t('header.langThFull')}
            </span>
          </button>
        </div>

        {splitModified && (
          <button
            type="button"
            onClick={onResetSplit}
            title={t('header.restoreSplitTitle')}
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#172033] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-white dark:hover:border-cyan-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Columns2 className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400" />
            <span className="font-mono-tabular">
              {Math.round(leftWidthPct)}/{Math.round(100 - leftWidthPct)}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={resetSimulation}
          title={t('header.resetAllTitle')}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#172033] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-200 dark:hover:text-white dark:hover:border-cyan-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400" />
          <span className="hidden sm:inline">{t('header.resetAll')}</span>
        </button>
      </div>
    </header>
  );
}
