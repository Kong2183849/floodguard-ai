import { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudLightning,
  Crosshair,
  Eye,
  EyeOff,
  GitBranch,
  Power,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Unplug,
  Zap,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTranslation } from '../i18n';
import type {
  PowerOutageScenarioType,
  PowerServiceStatus,
  PowerSeverity,
} from '../types/city';

const OUTAGE_SCENARIOS: Array<{
  id: PowerOutageScenarioType;
  labelKey: string;
}> = [
  { id: 'none', labelKey: 'power.scenarios.none' },
  { id: 'substation_failure', labelKey: 'power.scenarios.substation_failure' },
  { id: 'line_failure', labelKey: 'power.scenarios.line_failure' },
  { id: 'transformer_fault', labelKey: 'power.scenarios.transformer_fault' },
  { id: 'excessive_demand', labelKey: 'power.scenarios.excessive_demand' },
  { id: 'weather_disruption', labelKey: 'power.scenarios.weather_disruption' },
];

const SEVERITY_TEXT: Record<PowerSeverity, string> = {
  Nominal: 'text-[#16A34A] dark:text-emerald-400',
  Moderate: 'text-[#D97706] dark:text-amber-300',
  High: 'text-orange-600 dark:text-orange-400',
  Critical: 'text-[#DC2626] dark:text-rose-400',
};

const SERVICE_STATUS_BADGE: Record<PowerServiceStatus, string> = {
  energized: 'bg-cyan-50 border-cyan-300 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/35 dark:text-cyan-300',
  backup_restored: 'bg-emerald-50 border-emerald-300 text-[#16A34A] dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-300',
  degraded: 'bg-amber-50 border-amber-300 text-[#D97706] dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-300',
  outage: 'bg-rose-50 border-rose-300 text-[#DC2626] dark:bg-rose-500/15 dark:border-rose-500/40 dark:text-rose-300',
  isolated: 'bg-slate-100 border-[#CBD5E1] text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300',
};

export function PowerManagementPanel() {
  const {
    state,
    powerResult,
    toggleLayer,
    applyPowerOutageScenario,
    togglePowerFault,
    setPowerDemandMultiplier,
    togglePowerWeatherCoupling,
    isolatePowerElement,
    togglePowerBackupPath,
    restorePowerServiceArea,
    restoreAllFeasiblePower,
    resetPowerManagement,
    focusScenePoint,
    setSection,
  } = useSimulation();
  const { t, language, formatNumber, formatDecimal } = useTranslation();

  const [equipmentExpanded, setEquipmentExpanded] = useState(false);

  const isTh = language === 'th';
  const { layers, powerNetwork } = state;

  const handleLocate = (sceneX: number, sceneZ: number, span = 125) => {
    if (!layers.powerNetworkOverlay) {
      toggleLayer('powerNetworkOverlay');
    }
    focusScenePoint(sceneX, sceneZ, span);
  };

  if (!powerResult || !powerNetwork) {
    return (
      <div className="space-y-4" data-testid="module-power">
        <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-4 space-y-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[#D97706] dark:text-yellow-400 shrink-0" />
            <span>{t('power.systemTitle')}</span>
          </h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400">{t('power.loadingNetwork')}</p>
        </section>
      </div>
    );
  }

  const mwUnit = t('power.mwUnit');
  const faultedNodes = powerResult.nodes.filter(
    (ns) => ns.isManuallyFailed || ns.isWeatherTripped
  );
  const faultedEdges = powerResult.edges.filter(
    (es) => es.isManuallyFailed || es.isWeatherTripped
  );
  const hasAnyFaultOrOutage =
    faultedNodes.length > 0 ||
    faultedEdges.length > 0 ||
    powerResult.affectedAreasCount > 0 ||
    powerResult.restoredAreasCount > 0;

  return (
    <div className="space-y-4" data-testid="module-power">
      {/* 1. System Header & Power Dashboard KPIs */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#D97706] dark:text-yellow-400 shrink-0" />
              <span className="truncate">{t('power.systemTitle')}</span>
            </h3>
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('power.infraCountsSummary', {
                subs: formatNumber(powerResult.substations.length),
                tx: formatNumber(powerResult.transformers.length),
                areas: formatNumber(powerResult.serviceAreas.length),
                buildings: formatNumber(powerResult.totalBuildingsCount),
              })}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="power-layer-toggle"
              onClick={() => toggleLayer('powerNetworkOverlay')}
              aria-pressed={layers.powerNetworkOverlay}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                layers.powerNetworkOverlay
                  ? 'bg-cyan-50 border-cyan-300 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-300'
                  : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {layers.powerNetworkOverlay ? (
                <Eye className="w-3 h-3 shrink-0" />
              ) : (
                <EyeOff className="w-3 h-3 shrink-0" />
              )}
              <span>{t('power.layer3dBtn')}</span>
            </button>

            <button
              type="button"
              data-testid="power-reset-btn"
              onClick={resetPowerManagement}
              title={t('power.resetBtnTitle')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-200 dark:hover:text-white cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3 shrink-0" />
              <span>{t('common.reset')}</span>
            </button>
          </div>
        </div>

        {/* Simulated Disclaimer */}
        <p className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/80 px-2.5 py-1.5 text-[11px] text-[#64748B] dark:text-slate-400 leading-relaxed">
          {t('power.disclaimer')}
        </p>

        {/* Dashboard KPI Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('power.kpiTotalDemand')}</p>
            <p
              data-testid="power-total-demand"
              className="text-sm font-semibold font-mono-tabular text-[#D97706] dark:text-yellow-300"
            >
              {formatDecimal(powerResult.totalDemandMw, 1)} {mwUnit}
            </p>
            <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
              {t('power.demandFactorShort', {
                pct: formatNumber(powerResult.demandMultiplierPct),
              })}
            </p>
          </div>

          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('power.kpiAvailableSupply')}</p>
            <p
              data-testid="power-available-supply"
              className="text-sm font-semibold font-mono-tabular text-[#0891B2] dark:text-cyan-300"
            >
              {formatDecimal(powerResult.availableSupplyMw, 1)} {mwUnit}
            </p>
            <p
              className={`text-[10px] font-mono-tabular ${
                powerResult.reserveMarginPct < 0
                  ? 'text-[#DC2626] dark:text-rose-400'
                  : powerResult.reserveMarginPct < 12
                    ? 'text-[#D97706] dark:text-amber-300'
                    : 'text-[#16A34A] dark:text-emerald-400'
              }`}
            >
              {t('power.reserveMarginShort', {
                pct: formatDecimal(powerResult.reserveMarginPct, 1),
              })}
            </p>
          </div>

          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('power.kpiAffectedAreas')}</p>
            <p
              data-testid="power-affected-areas"
              className={`text-sm font-semibold font-mono-tabular ${
                powerResult.affectedAreasCount > 0
                  ? 'text-[#DC2626] dark:text-rose-300'
                  : 'text-[#16A34A] dark:text-emerald-400'
              }`}
            >
              {formatNumber(powerResult.affectedAreasCount)} /{' '}
              {formatNumber(powerResult.totalAreasCount)}
            </p>
            <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
              {t('power.affectedBuildingsShort', {
                count: formatNumber(powerResult.affectedBuildingsCount),
              })}
            </p>
          </div>

          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('power.kpiNetworkStatus')}</p>
            <p
              data-testid="power-network-status"
              className={`text-sm font-semibold ${SEVERITY_TEXT[powerResult.outageSeverity]}`}
            >
              {t(`power.networkStatus.${powerResult.networkStatus}`)}
            </p>
            <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
              {t('power.unservedLoadShort', {
                mw: formatDecimal(powerResult.unservedLoadMw, 1),
              })}
            </p>
          </div>
        </div>

        {/* Restoration Progress Bar */}
        <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t('power.restorationStatusTitle')}
            </span>
            <span
              data-testid="power-restoration-pct"
              className="font-mono-tabular font-semibold text-[#16A34A] dark:text-emerald-300"
            >
              {formatNumber(powerResult.restorationProgressPct)}% ·{' '}
              {t('power.restoredAreasCount', {
                count: formatNumber(powerResult.restoredAreasCount),
              })}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                powerResult.restorationProgressPct >= 100
                  ? 'bg-emerald-500'
                  : powerResult.restorationProgressPct >= 50
                    ? 'bg-cyan-500 dark:bg-cyan-400'
                    : 'bg-amber-500 dark:bg-amber-400'
              }`}
              style={{ width: `${powerResult.restorationProgressPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* 2. Outage Scenario Simulator & Demand / Weather Coupling */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400 shrink-0" />
            <span>{t('power.scenariosTitle')}</span>
          </h3>
          <span className="text-[10px] text-[#64748B] dark:text-slate-400">{t('common.simulated')}</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {OUTAGE_SCENARIOS.map((sc) => {
            const active = powerResult.activeOutageScenario === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                data-testid={`power-scenario-${sc.id}`}
                onClick={() => applyPowerOutageScenario(sc.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border text-left transition-colors cursor-pointer truncate ${
                  active
                    ? 'bg-amber-50 border-amber-300 text-[#D97706] dark:bg-amber-500/15 dark:border-amber-500/45 dark:text-amber-200'
                    : 'bg-[#F8FAFC] border-[#CBD5E1] text-slate-700 hover:border-slate-400 hover:text-[#172033] dark:bg-slate-900/75 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white'
                }`}
              >
                {t(sc.labelKey)}
              </button>
            );
          })}
        </div>

        {/* Demand Multiplier Slider */}
        <label className="block space-y-1 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700 dark:text-slate-300">{t('power.demandMultiplierLabel')}</span>
            <span className="font-mono-tabular font-semibold text-[#D97706] dark:text-yellow-300">
              {formatNumber(powerResult.demandMultiplierPct)}% (
              {formatDecimal(powerResult.totalDemandMw, 1)} {mwUnit})
            </span>
          </div>
          <input
            type="range"
            aria-label={t('power.demandMultiplierAria')}
            min={60}
            max={220}
            step={5}
            value={powerResult.demandMultiplierPct}
            onChange={(e) => setPowerDemandMultiplier(Number(e.target.value))}
            className="w-full ug-slider cursor-pointer"
          />
        </label>

        {/* Weather-Flood Grid Coupling Toggle */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E2E8F0] dark:border-slate-800/80">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#172033] dark:text-slate-200 flex items-center gap-1.5">
              <CloudLightning className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
              <span className="truncate">{t('power.weatherCouplingTitle')}</span>
            </p>
            <p className="text-[10px] text-[#64748B] dark:text-slate-400">
              {t('power.weatherCouplingDesc')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={powerResult.weatherCouplingEnabled}
            onClick={() => togglePowerWeatherCoupling(!powerResult.weatherCouplingEnabled)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              powerResult.weatherCouplingEnabled
                ? 'bg-sky-50 border-sky-300 text-sky-700 dark:bg-sky-500/20 dark:border-sky-400/50 dark:text-sky-200'
                : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400'
            }`}
          >
            {powerResult.weatherCouplingEnabled ? t('common.active') : t('power.offLabel')}
          </button>
        </div>
      </section>

      {/* 3. Outage Detection & Possible Cause Analysis */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-[#DC2626] dark:text-rose-400 shrink-0" />
            <span>{t('power.outageDetectionTitle')}</span>
          </h3>
          <span className={`text-[11px] font-semibold ${SEVERITY_TEXT[powerResult.outageSeverity]}`}>
            {t(`power.severity.${powerResult.outageSeverity}`)}
          </span>
        </div>

        {powerResult.outageLocations.length === 0 ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-[#16A34A] dark:bg-emerald-950/20 dark:border-emerald-500/30 px-3 py-2 text-xs dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
            <span>{t('power.noOutagesDetected')}</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {powerResult.outageLocations.slice(0, 6).map((loc) => (
              <div
                key={loc.id}
                className="rounded-lg bg-rose-50/70 dark:bg-slate-900/75 border border-rose-300 dark:border-rose-500/25 px-2.5 py-2 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#172033] dark:text-slate-100 truncate">
                      {isTh ? loc.nameTh : loc.name}
                    </p>
                    <p className="text-[10px] text-[#DC2626] dark:text-rose-300">
                      {isTh ? loc.reasonTh : loc.reason}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLocate(loc.sceneX, loc.sceneZ, 120)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-white border border-[#CBD5E1] text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-800 dark:border-slate-700 dark:text-cyan-300 dark:hover:border-cyan-500/50 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>{t('common.locate')}</span>
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
                  <span>
                    {t('power.outageImpactRow', {
                      mw: formatDecimal(loc.unservedMw, 1),
                      buildings: formatNumber(loc.affectedBuildings),
                    })}
                  </span>
                  <span className={SEVERITY_TEXT[loc.severity]}>
                    {t(`power.severity.${loc.severity}`)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Clear Separation: Simulated Causes vs AI Hypotheses */}
        <div className="pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80 space-y-2">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-[#172033] dark:text-slate-200">
              {t('power.simulatedCausesHeading')}
            </p>
            {powerResult.causes.simulatedCauses.length === 0 ? (
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                {t('power.noSimulatedFaults')}
              </p>
            ) : (
              powerResult.causes.simulatedCauses.map((c) => (
                <div
                  key={c.id}
                  className="rounded-md bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800 px-2.5 py-1.5 text-[11px] space-y-0.5"
                >
                  <p className="font-medium text-[#D97706] dark:text-amber-300">
                    {isTh ? c.labelTh : c.label}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300">
                    {isTh ? c.detailTh : c.detail}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-[#0891B2] dark:text-cyan-300">
              {t('power.aiHypothesesHeading')}
            </p>
            {powerResult.causes.aiHypotheses.map((h) => (
              <p
                key={h.id}
                className="rounded-md bg-cyan-50/70 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-500/25 px-2.5 py-1.5 text-[11px] text-slate-700 dark:text-slate-300"
              >
                {isTh ? h.labelTh : h.label}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Power Restoration Simulation Workflow */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400 shrink-0" />
            <span>{t('power.restorationWorkflowTitle')}</span>
          </h3>
          {hasAnyFaultOrOutage && (
            <button
              type="button"
              data-testid="power-auto-restore-btn"
              onClick={restoreAllFeasiblePower}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#16A34A] text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 cursor-pointer whitespace-nowrap"
            >
              {t('power.autoRestoreBtn')}
            </button>
          )}
        </div>

        {/* Step 1: Isolate Failed Segments / Equipment */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            {t('power.step1IsolateTitle')}
          </p>
          {faultedNodes.length === 0 && faultedEdges.length === 0 ? (
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('power.step1NoneFailed')}
            </p>
          ) : (
            <div className="space-y-1.5">
              {faultedNodes.map((ns) => (
                <div
                  key={ns.node.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-80 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[#172033] dark:text-slate-100 truncate">
                      {isTh ? ns.node.nameTh : ns.node.name}
                    </p>
                    <p className="text-[10px] text-[#64748B] dark:text-slate-400">
                      {ns.isIsolated
                        ? t('power.statusIsolated')
                        : ns.isWeatherTripped
                          ? t('power.weatherTripTag')
                          : t('power.manualFaultTag')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      data-testid={`power-isolate-${ns.node.id}`}
                      onClick={() => isolatePowerElement(ns.node.id)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border cursor-pointer whitespace-nowrap ${
                        ns.isIsolated
                          ? 'bg-cyan-50 border-cyan-300 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-300'
                          : 'bg-amber-50 border-amber-300 text-[#D97706] hover:bg-amber-100 dark:bg-amber-500/15 dark:border-amber-500/45 dark:text-amber-200 dark:hover:bg-amber-500/25'
                      }`}
                    >
                      <Unplug className="w-3 h-3" />
                      <span>{ns.isIsolated ? t('power.isolatedBtn') : t('power.isolateBtn')}</span>
                    </button>
                    {ns.isManuallyFailed && (
                      <button
                        type="button"
                        onClick={() => togglePowerFault(ns.node.id, 'node')}
                        className="px-2 py-1 rounded text-[10px] bg-white border border-[#CBD5E1] text-slate-700 hover:text-[#172033] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white cursor-pointer whitespace-nowrap"
                      >
                        {t('power.repairBtn')}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {faultedEdges.map((es) => (
                <div
                  key={es.edge.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[#172033] dark:text-slate-100 truncate">
                      {isTh ? es.edge.nameTh : es.edge.name}
                    </p>
                    <p className="text-[10px] text-[#64748B] dark:text-slate-400">
                      {es.isIsolated
                        ? t('power.statusIsolated')
                        : es.isWeatherTripped
                          ? t('power.weatherTripTag')
                          : t('power.manualFaultTag')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      data-testid={`power-isolate-${es.edge.id}`}
                      onClick={() => isolatePowerElement(es.edge.id)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border cursor-pointer whitespace-nowrap ${
                        es.isIsolated
                          ? 'bg-cyan-50 border-cyan-300 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-300'
                          : 'bg-amber-50 border-amber-300 text-[#D97706] hover:bg-amber-100 dark:bg-amber-500/15 dark:border-amber-500/45 dark:text-amber-200 dark:hover:bg-amber-500/25'
                      }`}
                    >
                      <Unplug className="w-3 h-3" />
                      <span>{es.isIsolated ? t('power.isolatedBtn') : t('power.isolateBtn')}</span>
                    </button>
                    {es.isManuallyFailed && (
                      <button
                        type="button"
                        onClick={() => togglePowerFault(es.edge.id, 'edge')}
                        className="px-2 py-1 rounded text-[10px] bg-white border border-[#CBD5E1] text-slate-700 hover:text-[#172033] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white cursor-pointer whitespace-nowrap"
                      >
                        {t('power.repairBtn')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 2: Switch Alternative Distribution Paths */}
        <div className="space-y-1.5 pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80">
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            {t('power.step2BackupTitle')}
          </p>
          <div className="space-y-1.5">
            {powerResult.backupOptions
              .filter((opt) => opt.isActive || opt.restorableAreaIds.length > 0)
              .map((opt) => (
                <div
                  key={opt.edgeId}
                  className={`rounded-lg border px-2.5 py-2 space-y-1 ${
                    opt.isActive
                      ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/25 dark:border-emerald-500/40'
                      : opt.isFeasible
                        ? 'bg-[#F8FAFC] border-cyan-300 dark:bg-slate-900/75 dark:border-cyan-500/30'
                        : 'bg-[#F8FAFC] border-[#E2E8F0] dark:bg-slate-900/50 dark:border-slate-800 opacity-85'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-[#172033] dark:text-slate-100 truncate">
                        {isTh ? opt.nameTh : opt.name}
                      </p>
                      <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
                        {t('power.backupCapacityMeta', {
                          spare: formatDecimal(opt.sourceSpareMw, 1),
                          req: formatDecimal(opt.requiredLoadMw, 1),
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid={`power-backup-${opt.edgeId}`}
                      disabled={!opt.isActive && !opt.isFeasible}
                      onClick={() => togglePowerBackupPath(opt.edgeId)}
                      className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                        opt.isActive
                          ? 'bg-[#16A34A] text-white border-[#16A34A] dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-400 cursor-pointer'
                          : opt.isFeasible
                            ? 'bg-cyan-50 border-cyan-300 text-[#0891B2] hover:bg-cyan-100 dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-200 dark:hover:bg-cyan-500/25 cursor-pointer'
                            : 'bg-slate-100 border-[#CBD5E1] text-slate-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {opt.isActive ? t('power.backupActiveBtn') : t('power.backupSwitchBtn')}
                    </button>
                  </div>
                  {!opt.isActive && opt.reasonUnavailable && (
                    <p className="text-[10px] text-[#D97706] dark:text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{isTh ? opt.reasonUnavailableTh : opt.reasonUnavailable}</span>
                    </p>
                  )}
                </div>
              ))}
            {powerResult.backupOptions.every(
              (opt) => !opt.isActive && opt.restorableAreaIds.length === 0
            ) && (
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                {t('power.step2AllPrimaryFed')}
              </p>
            )}
          </div>
        </div>

        {/* Step 3: Connected Service Areas & Area Restoration */}
        <div className="space-y-1.5 pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80">
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            {t('power.step3ServiceAreasTitle')}
          </p>
          <div className="space-y-1.5">
            {powerResult.serviceAreas.map((sa) => (
              <div
                key={sa.node.id}
                className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800 px-2.5 py-2 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#172033] dark:text-slate-100 truncate">
                      {isTh ? sa.node.nameTh : sa.node.name}
                    </p>
                    <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
                      {formatNumber(sa.node.buildingCount)} {t('power.buildingsUnit')} ·{' '}
                      {formatDecimal(sa.servedMw, 1)} / {formatDecimal(sa.effectiveDemandMw, 1)}{' '}
                      {mwUnit}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap ${
                        SERVICE_STATUS_BADGE[sa.status]
                      }`}
                    >
                      {t(`power.serviceStatus.${sa.status}`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleLocate(sa.node.sceneX, sa.node.sceneZ, 150)}
                      className="p-1 rounded bg-white border border-[#CBD5E1] text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-800 dark:border-slate-700 dark:text-cyan-300 dark:hover:border-cyan-500/45 cursor-pointer"
                      title={t('common.locate')}
                    >
                      <Crosshair className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {sa.status === 'outage' && (
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    {sa.canRestoreNow ? (
                      <>
                        <span className="text-[10px] text-[#16A34A] dark:text-emerald-300">
                          {t('power.readyToRestoreLabel')}
                        </span>
                        <button
                          type="button"
                          data-testid={`power-restore-${sa.node.id}`}
                          onClick={() => restorePowerServiceArea(sa.node.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold bg-[#16A34A] text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 cursor-pointer whitespace-nowrap"
                        >
                          <Power className="w-3 h-3" />
                          <span>{t('power.restoreAreaBtn')}</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] text-[#64748B] dark:text-slate-400">
                        {isTh ? sa.restoreBlockedReasonTh : sa.restoreBlockedReason}
                      </span>
                    )}
                  </div>
                )}

                {sa.status === 'backup_restored' && (
                  <div className="flex items-center justify-between gap-2 text-[10px] text-[#16A34A] dark:text-emerald-300 pt-0.5">
                    <span>{t('power.fedViaBackupNote')}</span>
                    <button
                      type="button"
                      onClick={() => restorePowerServiceArea(sa.node.id)}
                      className="text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-slate-200 underline cursor-pointer"
                    >
                      {t('power.disconnectBtn')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Collapsible Network Equipment Fault Simulator (Substations, Transformers, Lines) */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2.5">
        <button
          type="button"
          onClick={() => setEquipmentExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
        >
          <span className="text-xs font-semibold text-[#172033] dark:text-slate-100">
            {t('power.equipmentInspectorTitle')}
          </span>
          {equipmentExpanded ? (
            <ChevronUp className="w-4 h-4 text-[#64748B] dark:text-slate-400 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#64748B] dark:text-slate-400 shrink-0" />
          )}
        </button>

        {equipmentExpanded && (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
              {t('power.substationsAndTransformersLabel')}
            </p>
            {[...powerResult.substations, ...powerResult.transformers].map((ns) => (
              <div
                key={ns.node.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800 px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-[#172033] dark:text-slate-100 truncate">
                    {isTh ? ns.node.nameTh : ns.node.name}
                  </p>
                  <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
                    {formatDecimal(ns.servedMw, 1)} / {formatDecimal(ns.node.ratedCapacityMw, 0)}{' '}
                    {mwUnit} ({formatNumber(ns.utilizationPct)}%)
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleLocate(ns.node.sceneX, ns.node.sceneZ, 110)}
                    className="p-1 rounded bg-white border border-[#CBD5E1] text-[#0891B2] dark:bg-slate-800 dark:border-slate-700 dark:text-cyan-300 cursor-pointer"
                    title={t('common.locate')}
                  >
                    <Crosshair className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePowerFault(ns.node.id, 'node')}
                    className={`px-2 py-1 rounded text-[10px] font-medium border cursor-pointer whitespace-nowrap ${
                      ns.isManuallyFailed
                        ? 'bg-rose-50 border-rose-300 text-[#DC2626] dark:bg-rose-500/20 dark:border-rose-500/45 dark:text-rose-200'
                        : 'bg-white border-[#CBD5E1] text-slate-700 hover:text-[#172033] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {ns.isManuallyFailed ? t('power.repairBtn') : t('power.injectFaultBtn')}
                  </button>
                </div>
              </div>
            ))}

            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400 pt-1">
              {t('power.distributionLinesLabel')}
            </p>
            {powerResult.edges
              .filter((es) => !es.edge.isBackupPath)
              .map((es) => (
                <div
                  key={es.edge.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[#172033] dark:text-slate-100 truncate">
                      {isTh ? es.edge.nameTh : es.edge.name}
                    </p>
                    <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
                      {formatDecimal(es.flowMw, 1)} / {formatDecimal(es.edge.ratedCapacityMw, 0)}{' '}
                      {mwUnit}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleLocate(es.midX, es.midZ, 120)}
                      className="p-1 rounded bg-white border border-[#CBD5E1] text-[#0891B2] dark:bg-slate-800 dark:border-slate-700 dark:text-cyan-300 cursor-pointer"
                      title={t('common.locate')}
                    >
                      <Crosshair className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePowerFault(es.edge.id, 'edge')}
                      className={`px-2 py-1 rounded text-[10px] font-medium border cursor-pointer whitespace-nowrap ${
                        es.isManuallyFailed
                          ? 'bg-rose-50 border-rose-300 text-[#DC2626] dark:bg-rose-500/20 dark:border-rose-500/45 dark:text-rose-200'
                          : 'bg-white border-[#CBD5E1] text-slate-700 hover:text-[#172033] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white'
                      }`}
                    >
                      {es.isManuallyFailed ? t('power.repairBtn') : t('power.injectFaultBtn')}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* 6. Cross-Module Action Footer */}
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => setSection('assistant')}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer whitespace-nowrap"
        >
          <Bot className="w-3.5 h-3.5 shrink-0" />
          <span>{t('power.askAiPowerBtn')}</span>
        </button>
      </div>
    </div>
  );
}
