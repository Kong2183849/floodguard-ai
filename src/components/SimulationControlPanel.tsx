import {
  CheckCircle2,
  CloudRain,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  TrendingUp,
  Waves,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { SCENARIO_PRESETS } from '../data/simulationPresets';
import { useTranslation } from '../i18n';
import {
  localizeAffectedAreaLabel,
  localizeFloodCauseLabel,
  localizePresetDescription,
  localizePresetLabel,
} from '../i18n/domainLabels';
import type { SimulationSpeed } from '../types/city';

const SPEED_OPTIONS: SimulationSpeed[] = [0.5, 1, 2, 4];

function formatElapsed(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `T+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function SimulationControlPanel() {
  const {
    state,
    activeArea,
    impactAnalysis,
    metrics,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    resetFloodLayer,
    setSeverity,
    setWaterLevel,
    setSpeed,
    setAffectedArea,
    setFloodOpacity,
    selectPreset,
    setFloodAutoRise,
    updateSettings,
    toggleLayer,
  } = useSimulation();
  const { t, language, formatNumber, formatDecimal } = useTranslation();
  const unitM = language === 'th' ? 'ม.' : 'm';

  const { settings, layers, affectedAreas } = state;
  const effectiveDrainagePct = impactAnalysis.accumulation.effectiveDrainagePct;
  const majorCauseId = impactAnalysis.accumulation.majorCauseId;

  const statusBadgeStyle =
    settings.status === 'running'
      ? 'bg-cyan-50 border-cyan-300 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/40 dark:text-cyan-300'
      : settings.status === 'paused'
        ? 'bg-amber-50 border-amber-300 text-[#D97706] dark:bg-orange-500/15 dark:border-orange-500/40 dark:text-orange-300'
        : 'bg-slate-100 border-[#E2E8F0] text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300';

  const statusText =
    settings.status === 'running'
      ? t('status.running')
      : settings.status === 'paused'
        ? t('status.paused')
        : t('status.idle');

  return (
    <section
      aria-label={t('simulation.sectionAria')}
      className="space-y-4"
    >
      {/* Status Indicator + Start / Pause / Reset Playback Bar */}
      <div className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            data-testid="scenario-status-indicator"
            className={`px-2.5 py-1 rounded-md border text-[11px] font-medium inline-flex items-center gap-2 ${statusBadgeStyle}`}
          >
            <span>{t('simulation.statusPrefix', { status: statusText })}</span>
            <span className="opacity-50" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-tabular">
              {formatElapsed(settings.elapsedSeconds)}
            </span>
            <span className="opacity-50" aria-hidden="true">
              ·
            </span>
            <span>{t('common.simulated')}</span>
          </div>

          <span className="text-[11px] text-[#64748B] dark:text-slate-400">
            {t('simulation.updatesImmediately')}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={startSimulation}
            disabled={settings.status === 'running'}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              settings.status === 'running'
                ? 'bg-cyan-100 text-[#0891B2]/70 dark:bg-cyan-500/30 dark:text-cyan-200/70 cursor-not-allowed'
                : 'bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer'
            }`}
          >
            <Play className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('common.start')}</span>
          </button>

          <button
            type="button"
            onClick={pauseSimulation}
            disabled={settings.status !== 'running'}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
              settings.status !== 'running'
                ? 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-400 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-500 cursor-not-allowed'
                : 'bg-amber-50 border-amber-300 text-[#D97706] hover:bg-amber-100 dark:bg-orange-500/15 dark:border-orange-500/45 dark:text-orange-300 dark:hover:bg-orange-500/25 cursor-pointer'
            }`}
          >
            <Pause className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('common.pause')}</span>
          </button>

          <button
            type="button"
            onClick={resetSimulation}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-200 dark:hover:text-white dark:hover:border-slate-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('common.reset')}</span>
          </button>
        </div>
      </div>

      {/* Primary Flood Parameters (Severity, Water Level, Drainage, Speed) */}
      <div className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3.5">
        <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-200">
          {t('simulation.controlsTitle')}
        </h3>

        {/* Flood Severity Slider 0-100 */}
        <label className="space-y-1.5 block">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t('simulation.floodSeverityLabel')}
            </span>
            <span
              data-testid="severity-value"
              className={`font-mono-tabular font-semibold ${
                settings.floodSeverity >= 75
                  ? 'text-[#DC2626] dark:text-red-400'
                  : settings.floodSeverity >= 45
                    ? 'text-[#D97706] dark:text-orange-400'
                    : 'text-[#0891B2] dark:text-cyan-400'
              }`}
            >
              {formatNumber(settings.floodSeverity)} / 100
            </span>
          </div>
          <input
            type="range"
            aria-label={t('simulation.floodSeverityAria')}
            min={0}
            max={100}
            step={1}
            value={settings.floodSeverity}
            onChange={(e) => setSeverity(Number(e.target.value))}
            className="w-full ug-slider cursor-pointer"
          />
        </label>

        {/* Water Level Slider */}
        <label className="space-y-1.5 block">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t('simulation.waterLevelLabel')}
            </span>
            <span
              data-testid="water-level-value"
              className="font-mono-tabular text-sky-700 dark:text-sky-400 font-semibold"
            >
              {t('simulation.waterLevelValue', {
                configured: formatDecimal(settings.waterLevelMeters, 2),
                effective: formatDecimal(metrics.floodLevelMeters, 2),
              })}
            </span>
          </div>
          <input
            type="range"
            aria-label={t('simulation.waterLevelAria')}
            min={0}
            max={2.5}
            step={0.05}
            value={settings.waterLevelMeters}
            onChange={(e) => setWaterLevel(Number(e.target.value))}
            className="w-full ug-slider cursor-pointer"
          />
        </label>

        {/* Drainage System Design Capacity */}
        <label className="space-y-1.5 block">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t('simulation.drainageLabel')}
            </span>
            <span className="font-mono-tabular text-[#172033] dark:text-slate-200 font-semibold">
              {formatNumber(settings.drainageCapacityPct)}%{' '}
              <span className="text-[#64748B] dark:text-slate-400 font-normal">
                ({t('simulation.effectiveShort', { pct: formatNumber(effectiveDrainagePct) })})
              </span>
            </span>
          </div>
          <input
            type="range"
            aria-label={t('simulation.drainageAria')}
            min={20}
            max={100}
            step={2}
            value={settings.drainageCapacityPct}
            onChange={(e) =>
              updateSettings({ drainageCapacityPct: Number(e.target.value) })
            }
            className="w-full ug-slider cursor-pointer"
          />
        </label>

        {/* Simulation Speed */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t('simulation.speedLabel')}
            </span>
            <span
              data-testid="speed-value"
              className="font-mono-tabular text-[#0891B2] dark:text-cyan-300 font-semibold"
            >
              {settings.simulationSpeed}×
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0] dark:bg-slate-900 dark:border-slate-800">
            {SPEED_OPTIONS.map((spd) => {
              const active = settings.simulationSpeed === spd;
              return (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setSpeed(spd)}
                  className={`py-1.5 rounded-md text-xs font-mono-tabular font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-cyan-50 text-[#0891B2] border border-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/40'
                      : 'text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-white border border-transparent'
                  }`}
                >
                  {spd}×
                </button>
              );
            })}
          </div>
        </div>

        {/* Layer & Mode Toggles + Opacity */}
        <div className="pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80 space-y-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => toggleLayer('floodOverlay')}
              aria-pressed={layers.floodOverlay}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                layers.floodOverlay
                  ? 'bg-cyan-50 border-cyan-300 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/40 dark:text-cyan-300'
                  : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Waves className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('simulation.floodLayerToggle')}</span>
            </button>

            <button
              type="button"
              onClick={() => setFloodAutoRise(!settings.floodAutoRise)}
              aria-pressed={settings.floodAutoRise}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                settings.floodAutoRise
                  ? 'bg-sky-50 border-sky-300 text-sky-700 dark:bg-sky-500/20 dark:border-sky-400/50 dark:text-sky-300'
                  : 'bg-[#F8FAFC] border-[#CBD5E1] text-slate-700 hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('simulation.gradualRiseToggle')}</span>
            </button>

            <button
              type="button"
              onClick={() => updateSettings({ emergencyMode: !settings.emergencyMode })}
              aria-pressed={settings.emergencyMode}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                settings.emergencyMode
                  ? 'bg-rose-50 border-rose-300 text-[#DC2626] dark:bg-red-500/15 dark:border-red-500/45 dark:text-red-300'
                  : 'bg-[#F8FAFC] border-[#CBD5E1] text-slate-700 hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('simulation.emergencyToggle')}</span>
            </button>

            <button
              type="button"
              onClick={resetFloodLayer}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[#F8FAFC] border border-[#CBD5E1] text-slate-700 hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-white cursor-pointer whitespace-nowrap"
              title={t('simulation.drainFloodTitle')}
            >
              <span className="truncate">{t('simulation.drainFlood0m')}</span>
            </button>
          </div>

          <label className="space-y-1 block">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#64748B] dark:text-slate-400">
                {t('simulation.translucency3d')}
              </span>
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
        </div>
      </div>

      {/* Flood Cause Controls (Simulated Drivers) */}
      <div
        data-testid="flood-cause-controls"
        className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-200 flex items-center gap-1.5">
            <CloudRain className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <span>{t('simulation.causesTitle')}</span>
          </h3>
          <span
            data-testid="effective-drainage-value"
            className={`text-[11px] font-mono-tabular font-semibold ${
              effectiveDrainagePct <= 40
                ? 'text-[#DC2626] dark:text-red-400'
                : effectiveDrainagePct <= 65
                  ? 'text-[#D97706] dark:text-orange-400'
                  : 'text-[#16A34A] dark:text-emerald-400'
            }`}
          >
            {t('simulation.effectiveDrainageBadge', {
              pct: formatNumber(effectiveDrainagePct),
            })}
          </span>
        </div>

        {/* Rainfall Intensity */}
        <label className="space-y-1 block">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t('simulation.rainfallLabel')}
            </span>
            <span
              data-testid="rainfall-value"
              className="font-mono-tabular text-sky-700 dark:text-sky-300 font-semibold"
            >
              {formatNumber(settings.rainfallMmHr)} {t('simulation.mmHrUnit')}
            </span>
          </div>
          <input
            type="range"
            aria-label={t('simulation.rainfallAria')}
            min={0}
            max={180}
            step={2}
            value={settings.rainfallMmHr}
            onChange={(e) =>
              updateSettings({ rainfallMmHr: Number(e.target.value) })
            }
            className="w-full ug-slider cursor-pointer"
          />
        </label>

        {/* Blocked Drainage Pipes */}
        <label className="space-y-1 block">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t('simulation.blockageLabel')}
            </span>
            <span
              data-testid="blockage-value"
              className={`font-mono-tabular font-semibold ${
                settings.drainageBlockagePct >= 60
                  ? 'text-[#DC2626] dark:text-red-400'
                  : settings.drainageBlockagePct >= 30
                    ? 'text-[#D97706] dark:text-orange-400'
                    : 'text-[#172033] dark:text-slate-200'
              }`}
            >
              {formatNumber(settings.drainageBlockagePct)}%
            </span>
          </div>
          <input
            type="range"
            aria-label={t('simulation.blockageAria')}
            min={0}
            max={95}
            step={1}
            value={settings.drainageBlockagePct}
            onChange={(e) =>
              updateSettings({ drainageBlockagePct: Number(e.target.value) })
            }
            className="w-full ug-slider cursor-pointer"
          />
        </label>

        {/* High Canal Water Levels */}
        <label className="space-y-1 block">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t('simulation.canalLevelLabel')}
            </span>
            <span
              data-testid="canal-level-value"
              className={`font-mono-tabular font-semibold ${
                settings.canalWaterLevelPct >= 75
                  ? 'text-[#D97706] dark:text-orange-400'
                  : 'text-[#0891B2] dark:text-cyan-300'
              }`}
            >
              {formatNumber(settings.canalWaterLevelPct)}%
            </span>
          </div>
          <input
            type="range"
            aria-label={t('simulation.canalLevelAria')}
            min={0}
            max={100}
            step={2}
            value={settings.canalWaterLevelPct}
            onChange={(e) =>
              updateSettings({ canalWaterLevelPct: Number(e.target.value) })
            }
            className="w-full ug-slider cursor-pointer"
          />
        </label>

        {/* Low-Lying Accumulation Sensitivity */}
        <label className="space-y-1 block">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t('simulation.lowLyingLabel')}
            </span>
            <span
              data-testid="low-lying-value"
              className="font-mono-tabular text-[#D97706] dark:text-amber-300 font-semibold"
            >
              {formatNumber(settings.lowLyingSensitivityPct)}%
            </span>
          </div>
          <input
            type="range"
            aria-label={t('simulation.lowLyingAria')}
            min={50}
            max={150}
            step={5}
            value={settings.lowLyingSensitivityPct}
            onChange={(e) =>
              updateSettings({ lowLyingSensitivityPct: Number(e.target.value) })
            }
            className="w-full ug-slider cursor-pointer"
          />
        </label>

        <div className="pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
          <span className="text-[#64748B] dark:text-slate-400">
            {t('simulation.majorCauseLabel')}
          </span>
          <span
            data-testid="simulation-major-cause"
            className="font-medium text-[#0891B2] dark:text-cyan-300 truncate"
          >
            {majorCauseId
              ? localizeFloodCauseLabel(majorCauseId, t)
              : t('flood.noActiveCause')}
          </span>
        </div>
      </div>

      {/* Affected Area Selector (Chatuchak GeoJSON) */}
      <div className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2">
        <label
          htmlFor="affected-area-select"
          className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <span>{t('simulation.affectedAreaLabel')}</span>
          </span>
          <span className="text-[10px] text-[#64748B] dark:text-slate-500 font-mono-tabular">
            {activeArea.sourceDataset}
          </span>
        </label>
        <select
          id="affected-area-select"
          value={settings.affectedAreaId}
          onChange={(e) => setAffectedArea(e.target.value)}
          className="w-full rounded-lg bg-white border border-[#CBD5E1] px-3 py-2 text-xs text-[#172033] dark:bg-slate-900 dark:border-slate-700/90 dark:text-slate-100 focus:outline-none focus:border-[#0891B2] dark:focus:border-cyan-500 cursor-pointer"
        >
          {affectedAreas.map((area) => (
            <option key={area.id} value={area.id}>
              {t('simulation.affectedAreaOption', {
                label: localizeAffectedAreaLabel(area, t),
                count: formatNumber(area.featureCount),
                unit:
                  area.featureCount === 1
                    ? t('common.feature')
                    : t('common.features'),
              })}
            </option>
          ))}
        </select>
      </div>

      {/* What-If Scenario Presets */}
      <div className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2">
        <span className="text-xs font-semibold text-[#172033] dark:text-slate-200 block">
          {t('simulation.presetsTitle')}
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SCENARIO_PRESETS.map((preset) => {
            const active = settings.scenarioId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectPreset(preset.id)}
                aria-pressed={active}
                className={`text-left rounded-lg p-2.5 border transition-colors cursor-pointer space-y-1 ${
                  active
                    ? 'bg-cyan-50 border-cyan-300 dark:bg-cyan-500/12 dark:border-cyan-500/45'
                    : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-slate-300 dark:bg-slate-900/70 dark:border-slate-800 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-[#172033] dark:text-slate-100 truncate">
                    {localizePresetLabel(preset.id, t)}
                  </span>
                  {active && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-[#64748B] dark:text-slate-400 leading-snug line-clamp-2">
                  {localizePresetDescription(preset.id, t)}
                </p>
                <div className="text-[10px] font-mono-tabular text-[#0891B2] dark:text-cyan-300">
                  {formatNumber(preset.floodSeverity)}/100 ·{' '}
                  {formatDecimal(preset.waterLevelMeters, 2)} {unitM} ·{' '}
                  {formatNumber(preset.rainfallMmHr)} {t('simulation.mmHrUnit')} ·{' '}
                  {formatNumber(preset.drainageBlockagePct)}% {t('simulation.blockedShort')}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
