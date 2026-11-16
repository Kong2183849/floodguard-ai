import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
  TrendingUp,
  Waves,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTranslation } from '../i18n';

export function FloodLegend() {
  const {
    state,
    metrics,
    toggleLayer,
    setFloodAutoRise,
    setFloodOpacity,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    resetFloodLayer,
  } = useSimulation();
  const { t, formatNumber } = useTranslation();

  const { settings, layers } = state;
  const [expanded, setExpanded] = useState(true);

  const depth = metrics.floodLevelMeters;
  const tierInfo =
    !layers.floodOverlay
      ? { label: t('legend.tierHidden'), color: 'text-[#64748B] dark:text-slate-400' }
      : depth <= 0.02
        ? { label: t('legend.tierDry'), color: 'text-slate-600 dark:text-slate-300' }
        : depth < 0.35
          ? { label: t('legend.tierLow'), color: 'text-sky-700 dark:text-sky-300' }
          : depth < 0.75
            ? { label: t('legend.tierMedium'), color: 'text-blue-700 dark:text-blue-300' }
            : depth < 1.25
              ? { label: t('legend.tierHigh'), color: 'text-[#D97706] dark:text-amber-300' }
              : { label: t('legend.tierCritical'), color: 'text-[#DC2626] dark:text-rose-400' };

  return (
    <aside
      data-testid="flood-legend"
      aria-label={t('legend.asideAria')}
      className="absolute bottom-3 right-3 z-10 w-64 sm:w-72 max-w-[calc(100%-1.5rem)] rounded-xl bg-white/95 border border-[#E2E8F0] dark:bg-[#0b1220]/95 dark:border-slate-800/90 text-xs shadow-lg"
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-[#E2E8F0] dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 font-semibold text-[#172033] hover:text-[#0891B2] dark:text-slate-100 dark:hover:text-cyan-300 transition-colors cursor-pointer min-w-0"
        >
          <Waves className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
          <span className="truncate">{t('legend.title')}</span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#64748B] dark:text-slate-400 shrink-0" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-[#64748B] dark:text-slate-400 shrink-0" />
          )}
        </button>

        <span
          data-testid="flood-legend-tier"
          className={`text-[11px] font-medium whitespace-nowrap ${tierInfo.color}`}
        >
          {tierInfo.label}
        </span>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {/* Severity & Waterway Swatches */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3.5 h-3 rounded-sm border border-sky-500/60 shrink-0"
                  style={{ backgroundColor: 'rgba(56, 189, 248, 0.55)' }}
                  aria-hidden="true"
                />
                <span className="text-[#172033] dark:text-slate-200 font-medium">{t('risk.Low')}</span>
                <span className="text-[#64748B] dark:text-slate-400 truncate">{t('legend.lowDesc')}</span>
              </div>
              <span className="font-mono-tabular text-[11px] text-[#64748B] dark:text-slate-400 shrink-0">
                {t('legend.lowRange')}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3.5 h-3 rounded-sm border border-sky-600/60 shrink-0"
                  style={{ backgroundColor: 'rgba(2, 132, 199, 0.72)' }}
                  aria-hidden="true"
                />
                <span className="text-[#172033] dark:text-slate-200 font-medium">{t('risk.Medium')}</span>
                <span className="text-[#64748B] dark:text-slate-400 truncate">{t('legend.mediumDesc')}</span>
              </div>
              <span className="font-mono-tabular text-[11px] text-[#64748B] dark:text-slate-400 shrink-0">
                {t('legend.mediumRange')}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3.5 h-3 rounded-sm border border-amber-500/70 shrink-0"
                  style={{ backgroundColor: 'rgba(245, 158, 11, 0.78)' }}
                  aria-hidden="true"
                />
                <span className="text-[#172033] dark:text-slate-200 font-medium">{t('risk.High')}</span>
                <span className="text-[#64748B] dark:text-slate-400 truncate">{t('legend.highDesc')}</span>
              </div>
              <span className="font-mono-tabular text-[11px] text-[#64748B] dark:text-slate-400 shrink-0">
                {t('legend.highRange')}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3.5 h-3 rounded-sm border border-rose-500/75 shrink-0"
                  style={{ backgroundColor: 'rgba(225, 29, 72, 0.85)' }}
                  aria-hidden="true"
                />
                <span className="text-[#172033] dark:text-slate-200 font-medium">{t('risk.Critical')}</span>
                <span className="text-[#64748B] dark:text-slate-400 truncate">{t('legend.criticalDesc')}</span>
              </div>
              <span className="font-mono-tabular text-[11px] text-[#64748B] dark:text-slate-400 shrink-0">
                {t('legend.criticalRange')}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E2E8F0] dark:border-slate-800/70">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3.5 h-3 rounded-sm border border-teal-500/50 shrink-0"
                  style={{ backgroundColor: '#0f766e' }}
                  aria-hidden="true"
                />
                <span className="text-[#172033] dark:text-slate-200 font-medium">
                  {t('legend.originalKhlongs')}
                </span>
              </div>
              <span className="text-[10px] text-[#64748B] dark:text-slate-400 shrink-0">
                {t('legend.permanentCanals')}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E2E8F0] dark:border-slate-800/70">
              <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium shrink-0">
                {t('legend.risk3dLabel')}
              </span>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-700 dark:text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-[#fbbf24]" aria-hidden="true" />
                  {t('risk.LowShort')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-[#f97316]" aria-hidden="true" />
                  {t('risk.MediumShort')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-[#ef4444]" aria-hidden="true" />
                  {t('risk.HighShort')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-[#e11d48]" aria-hidden="true" />
                  {t('risk.CriticalShort')}
                </span>
              </div>
            </div>

            {layers.traffic && layers.trafficDensityOverlay && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E2E8F0] dark:border-slate-800/70">
                <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium shrink-0">
                  {t('legend.trafficDensityLabel')}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-700 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-emerald-500" aria-hidden="true" />
                    {t('legend.trafficNormalShort')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-amber-500" aria-hidden="true" />
                    {t('legend.trafficModerateShort')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-red-500" aria-hidden="true" />
                    {t('legend.trafficSevereShort')}
                  </span>
                </div>
              </div>
            )}

            {layers.waterNetworkOverlay && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E2E8F0] dark:border-slate-800/70">
                <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium shrink-0">
                  {t('legend.waterNetworkLabel')}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-700 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-cyan-500 dark:bg-cyan-400" aria-hidden="true" />
                    {t('legend.waterFlowShort')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-amber-500 dark:bg-amber-400" aria-hidden="true" />
                    {t('legend.waterBottleneckShort')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-red-500" aria-hidden="true" />
                    {t('legend.waterBlockedShort')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-rose-500" aria-hidden="true" />
                    {t('legend.waterOverflowShort')}
                  </span>
                </div>
              </div>
            )}

            {layers.powerNetworkOverlay && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E2E8F0] dark:border-slate-800/70">
                <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium shrink-0">
                  {t('legend.powerNetworkLabel')}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-700 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-amber-400 dark:bg-yellow-400" aria-hidden="true" />
                    {t('legend.powerEnergizedShort')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-emerald-500 dark:bg-emerald-400" aria-hidden="true" />
                    {t('legend.powerRestoredShort')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-orange-500" aria-hidden="true" />
                    {t('legend.powerOverloadShort')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-rose-500" aria-hidden="true" />
                    {t('legend.powerOutageShort')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Independent Flood Layer Controls */}
          <div className="pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80 space-y-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => toggleLayer('floodOverlay')}
                aria-pressed={layers.floodOverlay}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                  layers.floodOverlay
                    ? 'bg-[#0891B2]/12 border-[#0891B2]/45 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/40 dark:text-cyan-300'
                    : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B] hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {layers.floodOverlay ? (
                  <Eye className="w-3 h-3 shrink-0" />
                ) : (
                  <EyeOff className="w-3 h-3 shrink-0" />
                )}
                <span className="truncate">
                  {layers.floodOverlay
                    ? t('legend.floodVisible')
                    : t('legend.floodHidden')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFloodAutoRise(!settings.floodAutoRise)}
                aria-pressed={settings.floodAutoRise}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                  settings.floodAutoRise
                    ? 'bg-sky-500/12 border-sky-500/45 text-sky-700 dark:bg-sky-500/20 dark:border-sky-400/50 dark:text-sky-300'
                    : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <TrendingUp className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {settings.floodAutoRise
                    ? t('legend.autoRiseOn')
                    : t('legend.autoRiseOff')}
                </span>
              </button>
            </div>

            <label className="block space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#64748B] dark:text-slate-400">{t('legend.waterTranslucency')}</span>
                <span className="font-mono-tabular text-[#172033] dark:text-slate-200">
                  {formatNumber(Math.round(settings.floodOpacity * 100))}%
                </span>
              </div>
              <input
                type="range"
                aria-label={t('legend.opacityAria')}
                min={0.25}
                max={1}
                step={0.05}
                value={settings.floodOpacity}
                onChange={(e) => setFloodOpacity(Number(e.target.value))}
                className="w-full ug-slider cursor-pointer"
              />
            </label>

            <div className="grid grid-cols-3 gap-1.5">
              {settings.status === 'running' ? (
                <button
                  type="button"
                  onClick={pauseSimulation}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] font-medium bg-amber-500/15 border border-amber-500/45 text-[#D97706] hover:bg-amber-500/25 dark:bg-orange-500/15 dark:border-orange-500/45 dark:text-orange-300 dark:hover:bg-orange-500/25 cursor-pointer whitespace-nowrap"
                >
                  <Pause className="w-3 h-3 shrink-0" />
                  <span className="truncate">{t('common.pause')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startSimulation}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] font-semibold bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    {settings.status === 'paused'
                      ? t('common.resume')
                      : t('common.start')}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={resetSimulation}
                className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#172033] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-200 dark:hover:text-white cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3 shrink-0" />
                <span className="truncate">{t('common.reset')}</span>
              </button>

              <button
                type="button"
                onClick={resetFloodLayer}
                className="py-1.5 px-2 rounded-md text-[11px] font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-white cursor-pointer whitespace-nowrap truncate"
                title={t('legend.clear0mTitle')}
              >
                {t('legend.clear0m')}
              </button>
            </div>
          </div>

          <p className="text-[10px] leading-snug text-[#64748B] dark:text-slate-400">
            {t('legend.footnote')}
          </p>
        </div>
      )}
    </aside>
  );
}
