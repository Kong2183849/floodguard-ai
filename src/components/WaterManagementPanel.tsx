import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Crosshair,
  Droplets,
  Eye,
  EyeOff,
  Gauge,
  GitFork,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Waves,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTranslation } from '../i18n';
import type {
  ScenarioId,
  WaterDischargeStrategyId,
  WaterInfraOrigin,
  WaterRiskLevel,
} from '../types/city';

const WATER_RISK_TEXT: Record<WaterRiskLevel, string> = {
  Nominal: 'text-[#16A34A] dark:text-emerald-400',
  Moderate: 'text-[#D97706] dark:text-amber-300',
  High: 'text-orange-600 dark:text-orange-400',
  Overflow: 'text-[#DC2626] dark:text-rose-400',
};

const WATER_RISK_BAR: Record<WaterRiskLevel, string> = {
  Nominal: 'bg-cyan-500',
  Moderate: 'bg-amber-400',
  High: 'bg-orange-500',
  Overflow: 'bg-rose-500',
};

const QUICK_SCENARIOS: Array<{
  id: Exclude<ScenarioId, 'custom'>;
  labelKey: string;
}> = [
  { id: 'baseline', labelKey: 'water.scenarios.baseline' },
  { id: 'monsoon', labelKey: 'water.scenarios.monsoon' },
  { id: 'blocked_drainage', labelKey: 'water.scenarios.blockedDrainage' },
  { id: 'khlong_overflow', labelKey: 'water.scenarios.khlongOverflow' },
  { id: 'severe', labelKey: 'water.scenarios.severe' },
];

export function WaterManagementPanel() {
  const {
    state,
    waterResult,
    updateSettings,
    selectPreset,
    toggleLayer,
    setWaterInflowMultiplier,
    toggleWaterBlockedSegment,
    setWaterDischargeStrategy,
    resetWaterManagement,
    focusScenePoint,
    setSection,
  } = useSimulation();
  const { t, language, formatNumber, formatDecimal } = useTranslation();

  const {
    settings,
    layers,
    waterNetwork,
    waterInflowMultiplierPct,
    waterDischargeStrategyId,
  } = state;

  const isTh = language === 'th';
  const m3Unit = t('common.m3Unit');
  const mUnit = t('common.metersUnit');
  const minUnit = t('common.minutesShort');

  const formatOrigin = (origin: WaterInfraOrigin) => {
    if (origin === 'geojson_water') return t('water.origin.geojsonWater');
    if (origin === 'geojson_park_basin') return t('water.origin.geojsonParkBasin');
    return t('water.origin.simulated');
  };

  const handleFocusNode = (sceneX: number, sceneZ: number, span = 125) => {
    if (!layers.waterNetworkOverlay) {
      toggleLayer('waterNetworkOverlay');
    }
    focusScenePoint(sceneX, sceneZ, span);
  };

  if (!waterResult || !waterNetwork) {
    return (
      <div className="space-y-4" data-testid="module-water">
        <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-4 space-y-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <Droplets className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <span>{t('water.systemTitle')}</span>
          </h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400">{t('water.loadingNetwork')}</p>
        </section>
      </div>
    );
  }

  const { massBalance } = waterResult;
  const effectiveDrainagePct = Math.round(
    settings.drainageCapacityPct * (1 - settings.drainageBlockagePct / 100)
  );

  return (
    <div className="space-y-4" data-testid="module-water">
      {/* 1. System Header, Infrastructure Origin Summary & Mass-Balance Conservation */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
              <span className="truncate">{t('water.systemTitle')}</span>
            </h3>
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('water.infraCountsSummary', {
                canals: formatNumber(waterNetwork.geoWaterCount),
                basins: formatNumber(waterNetwork.geoParkBasinCount),
                simulated: formatNumber(waterNetwork.simulatedInfraCount),
              })}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="water-layer-toggle"
              onClick={() => toggleLayer('waterNetworkOverlay')}
              aria-pressed={layers.waterNetworkOverlay}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                layers.waterNetworkOverlay
                  ? 'bg-cyan-50 border-cyan-300 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-300'
                  : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {layers.waterNetworkOverlay ? (
                <Eye className="w-3 h-3 shrink-0" />
              ) : (
                <EyeOff className="w-3 h-3 shrink-0" />
              )}
              <span>{t('water.layer3dBtn')}</span>
            </button>

            <button
              type="button"
              data-testid="water-reset-btn"
              onClick={resetWaterManagement}
              title={t('water.resetBtnTitle')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-200 dark:hover:text-white cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3 shrink-0" />
              <span>{t('common.reset')}</span>
            </button>
          </div>
        </div>

        {/* Mass-Balance KPIs */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('water.kpiInflow')}</p>
            <p className="text-sm font-semibold font-mono-tabular text-[#0891B2] dark:text-cyan-300">
              {formatNumber(massBalance.totalInflowM3)} {m3Unit}
            </p>
            <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
              {t('water.inflowFactorLabel', { pct: formatNumber(waterInflowMultiplierPct) })}
            </p>
          </div>

          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('water.kpiStorageLoad')}
            </p>
            <p className="text-sm font-semibold font-mono-tabular text-[#172033] dark:text-slate-100">
              {formatDecimal(massBalance.overallStorageUtilizationPct, 1)}%
            </p>
            <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular truncate">
              {formatNumber(massBalance.totalCurrentStorageM3)} / {formatNumber(massBalance.totalMaxCapacityM3)} {m3Unit}
            </p>
          </div>

          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('water.kpiOutflow')}</p>
            <p className="text-sm font-semibold font-mono-tabular text-[#16A34A] dark:text-emerald-300">
              {formatNumber(massBalance.totalOutflowM3)} {m3Unit}
            </p>
            <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
              {t('water.availableHeadroomShort', {
                vol: formatNumber(massBalance.totalRemainingCapacityM3),
                unit: m3Unit,
              })}
            </p>
          </div>

          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('water.kpiOverflowAccum')}
            </p>
            <p
              className={`text-sm font-semibold font-mono-tabular ${
                massBalance.totalAccumulatedOverflowM3 > 500
                  ? 'text-[#DC2626] dark:text-rose-400'
                  : massBalance.totalAccumulatedOverflowM3 > 0
                    ? 'text-[#D97706] dark:text-amber-300'
                    : 'text-[#16A34A] dark:text-emerald-400'
              }`}
            >
              {formatNumber(massBalance.totalAccumulatedOverflowM3)} {m3Unit}
            </p>
            <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
              {t('water.blockedBottleneckCounts', {
                blocked: formatNumber(waterResult.blockedEdgesCount),
                bottleneck: formatNumber(waterResult.bottleneckEdgesCount),
              })}
            </p>
          </div>
        </div>

        {/* Mass-Balance Check & Simplified Model Disclaimer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80 text-[11px]">
          <span
            className={`inline-flex items-center gap-1 font-medium ${
              massBalance.isMassConserved
                ? 'text-[#16A34A] dark:text-emerald-400'
                : 'text-[#D97706] dark:text-amber-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>
              {t('water.massBalanceVerified', {
                err: formatDecimal(massBalance.conservationErrorM3, 2),
                unit: m3Unit,
              })}
            </span>
          </span>
          <span className="text-[#64748B] dark:text-slate-400 font-mono-tabular">
            {t('water.effectiveDrainageShort', { pct: formatNumber(effectiveDrainagePct) })}
          </span>
        </div>

        <p className="text-[10px] leading-relaxed text-[#64748B] dark:text-slate-400">
          {t('water.simplifiedDisclaimer')}
        </p>
      </section>

      {/* 2. Scenario & Inflow Controls (Shared with Flood Simulation) */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <span>{t('water.scenarioControlsTitle')}</span>
          </h3>
          <span className="text-[10px] text-[#64748B] dark:text-slate-400 whitespace-nowrap">
            {t('water.syncedWithFlood')}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_SCENARIOS.map((sc) => {
            const active = settings.scenarioId === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                data-testid={`water-preset-${sc.id}`}
                onClick={() => selectPreset(sc.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-cyan-50 border-cyan-300 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-300'
                    : 'bg-[#F8FAFC] border-[#CBD5E1] text-slate-700 hover:text-[#172033] hover:border-slate-400 dark:bg-slate-900/75 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white dark:hover:border-slate-700'
                }`}
              >
                {t(sc.labelKey)}
              </button>
            );
          })}
        </div>

        <div className="space-y-2.5 pt-1">
          {/* Inflow Multiplier */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="water-inflow-slider" className="text-slate-700 dark:text-slate-300">
                {t('water.inflowMultiplierLabel')}
              </label>
              <span className="font-mono-tabular text-[#0891B2] dark:text-cyan-300 font-medium">
                {formatNumber(waterInflowMultiplierPct)}%
              </span>
            </div>
            <input
              id="water-inflow-slider"
              data-testid="water-inflow-slider"
              type="range"
              min={50}
              max={200}
              step={5}
              value={waterInflowMultiplierPct}
              onChange={(e) => setWaterInflowMultiplier(Number(e.target.value))}
              className="w-full ug-slider cursor-pointer"
            />
          </div>

          {/* Rainfall Intensity */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="water-rainfall-slider" className="text-slate-700 dark:text-slate-300">
                {t('simulation.rainfallLabel')}
              </label>
              <span className="font-mono-tabular text-[#172033] dark:text-slate-200">
                {formatNumber(settings.rainfallMmHr)} {t('simulation.mmHrUnit')}
              </span>
            </div>
            <input
              id="water-rainfall-slider"
              type="range"
              min={0}
              max={200}
              step={5}
              value={settings.rainfallMmHr}
              onChange={(e) => updateSettings({ rainfallMmHr: Number(e.target.value) })}
              className="w-full ug-slider cursor-pointer"
            />
          </div>

          {/* Drainage Capacity */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="water-capacity-slider" className="text-slate-700 dark:text-slate-300">
                {t('simulation.drainageLabel')}
              </label>
              <span className="font-mono-tabular text-[#172033] dark:text-slate-200">
                {formatNumber(settings.drainageCapacityPct)}%
              </span>
            </div>
            <input
              id="water-capacity-slider"
              type="range"
              min={20}
              max={100}
              step={2}
              value={settings.drainageCapacityPct}
              onChange={(e) =>
                updateSettings({ drainageCapacityPct: Number(e.target.value) })
              }
              className="w-full ug-slider cursor-pointer"
            />
          </div>

          {/* Pipe Blockage */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="water-blockage-slider" className="text-slate-700 dark:text-slate-300">
                {t('simulation.blockageLabel')}
              </label>
              <span className="font-mono-tabular text-[#D97706] dark:text-orange-300">
                {formatNumber(settings.drainageBlockagePct)}%
              </span>
            </div>
            <input
              id="water-blockage-slider"
              type="range"
              min={0}
              max={95}
              step={5}
              value={settings.drainageBlockagePct}
              onChange={(e) =>
                updateSettings({ drainageBlockagePct: Number(e.target.value) })
              }
              className="w-full accent-[#D97706] dark:accent-orange-400 cursor-pointer"
            />
          </div>

          {/* Canal Stage Level */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="water-canal-slider" className="text-slate-700 dark:text-slate-300">
                {t('simulation.canalLevelLabel')}
              </label>
              <span className="font-mono-tabular text-[#0891B2] dark:text-cyan-200">
                {formatNumber(settings.canalWaterLevelPct)}%
              </span>
            </div>
            <input
              id="water-canal-slider"
              type="range"
              min={10}
              max={100}
              step={5}
              value={settings.canalWaterLevelPct}
              onChange={(e) =>
                updateSettings({ canalWaterLevelPct: Number(e.target.value) })
              }
              className="w-full ug-slider cursor-pointer"
            />
          </div>
        </div>
      </section>

      {/* 3. Canal & Reservoir Monitoring */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <span>{t('water.storageMonitoringTitle')}</span>
          </h3>
          <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {t('water.availableReceivingCount', {
              avail: formatNumber(waterResult.availableReceivingNodesCount),
              total: formatNumber(waterResult.storageNodes.length),
            })}
          </span>
        </div>

        <div className="divide-y divide-[#E2E8F0] dark:divide-slate-800/80 rounded-lg bg-[#F8FAFC] dark:bg-slate-900/60 border border-[#E2E8F0] dark:border-slate-800 overflow-hidden">
          {waterResult.storageNodes.map((ns) => {
            const name = isTh ? ns.node.nameTh : ns.node.name;
            const riskLabel = t(`water.riskLevels.${ns.overflowRisk}`);
            const barWidthPct = Math.min(100, Math.max(2, ns.utilizationPct));
            return (
              <div
                key={ns.node.id}
                data-testid={`water-storage-${ns.node.id}`}
                className="p-2.5 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#172033] dark:text-slate-100 truncate">
                      {name}
                    </p>
                    <p className="text-[10px] text-[#64748B] dark:text-slate-400">
                      {formatOrigin(ns.node.origin)} · {t(`water.nodeKinds.${ns.node.kind}`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[11px] font-semibold ${WATER_RISK_TEXT[ns.overflowRisk]}`}>
                      {riskLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleFocusNode(ns.node.sceneX, ns.node.sceneZ, 130)}
                      title={t('water.locateIn3d')}
                      aria-label={`${t('water.locateIn3d')}: ${name}`}
                      className="p-1 rounded-md bg-white border border-[#CBD5E1] text-slate-600 hover:text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-800/80 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-cyan-300 dark:hover:border-cyan-500/40 cursor-pointer"
                    >
                      <Crosshair className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Utilization bar */}
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${WATER_RISK_BAR[ns.overflowRisk]}`}
                    style={{ width: `${barWidthPct}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
                  <span>
                    {t('water.volumeLabel')}:{' '}
                    <strong className="text-[#172033] dark:text-slate-200 font-medium">
                      {formatNumber(Math.round(ns.currentVolumeM3))} / {formatNumber(ns.maxCapacityM3)} {m3Unit}
                    </strong>
                  </span>
                  <span className="text-right">
                    {t('water.remainingLabel')}:{' '}
                    <strong className="text-[#0891B2] dark:text-cyan-300 font-medium">
                      {formatNumber(Math.round(ns.remainingCapacityM3))} {m3Unit}
                    </strong>
                  </span>
                  <span>
                    {t('water.waterLevelLabel')}:{' '}
                    <strong className="text-[#172033] dark:text-slate-200 font-medium">
                      {formatDecimal(ns.waterLevelMeters, 2)} / {formatDecimal(ns.maxLevelMeters, 2)} {mUnit}
                    </strong>
                  </span>
                  <span className="text-right">
                    {t('water.utilizationLabel')}:{' '}
                    <strong className="text-[#172033] dark:text-slate-100 font-medium">
                      {formatDecimal(ns.utilizationPct, 1)}%
                    </strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Water Accumulation Hotspots */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] dark:text-orange-400 shrink-0" />
            <span>{t('water.hotspotsTitle')}</span>
          </h3>
          <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {formatNumber(waterResult.accumulationHotspots.length)} {t('water.locationsSuffix')}
          </span>
        </div>

        {waterResult.accumulationHotspots.length === 0 ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-[#16A34A] dark:bg-slate-900/60 dark:border-slate-800 px-3 py-2.5 text-xs dark:text-emerald-300">
            {t('water.noHotspots')}
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] dark:divide-slate-800/80 rounded-lg bg-[#F8FAFC] dark:bg-slate-900/60 border border-[#E2E8F0] dark:border-slate-800 overflow-hidden">
            {waterResult.accumulationHotspots.map((hs) => {
              const name = isTh ? hs.nameTh : hs.name;
              const reason = isTh ? hs.reasonTh : hs.reason;
              return (
                <div key={hs.nodeId} className="p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#172033] dark:text-slate-100 truncate">
                        {name}
                      </p>
                      <p className="text-[10px] text-[#64748B] dark:text-slate-400">
                        {formatOrigin(hs.origin)} · {t(`water.nodeKinds.${hs.kind}`)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-mono-tabular font-semibold text-[#DC2626] dark:text-rose-400">
                        +{formatNumber(hs.accumulatedVolumeM3)} {m3Unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleFocusNode(hs.sceneX, hs.sceneZ, 120)}
                        title={t('water.locateIn3d')}
                        className="p-1 rounded-md bg-white border border-[#CBD5E1] text-slate-600 hover:text-[#0891B2] dark:bg-slate-800/80 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-cyan-300 cursor-pointer"
                      >
                        <Crosshair className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                    {reason}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Drainage Network Segments & Blockage Simulator */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <GitFork className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <span>{t('water.segmentsTitle')}</span>
          </h3>
          <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {formatNumber(waterResult.edges.length)} {t('water.segmentsSuffix')}
          </span>
        </div>

        <div className="divide-y divide-[#E2E8F0] dark:divide-slate-800/80 rounded-lg bg-[#F8FAFC] dark:bg-slate-900/60 border border-[#E2E8F0] dark:border-slate-800 max-h-72 overflow-y-auto">
          {waterResult.edges.map((es) => {
            const name = isTh ? es.edge.nameTh : es.edge.name;
            const statusColor =
              es.status === 'blocked'
                ? 'text-[#DC2626] dark:text-rose-400'
                : es.status === 'bottleneck'
                  ? 'text-[#D97706] dark:text-amber-300'
                  : 'text-[#16A34A] dark:text-emerald-400';

            return (
              <div
                key={es.edge.id}
                data-testid={`water-edge-${es.edge.id}`}
                className="p-2.5 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#172033] dark:text-slate-100 truncate">
                      {name}
                    </p>
                    <p className="text-[10px] text-[#64748B] dark:text-slate-400">
                      {formatOrigin(es.edge.origin)} · {t(`water.segmentKinds.${es.edge.kind}`)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      data-testid={`water-block-toggle-${es.edge.id}`}
                      onClick={() => toggleWaterBlockedSegment(es.edge.id)}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                        es.isManuallyBlocked
                          ? 'bg-rose-50 border-rose-300 text-[#DC2626] hover:bg-rose-100 dark:bg-rose-500/20 dark:border-rose-500/45 dark:text-rose-300 dark:hover:bg-rose-500/30'
                          : 'bg-white border-[#CBD5E1] text-slate-700 hover:text-[#172033] dark:bg-slate-800/90 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white'
                      }`}
                    >
                      {es.isManuallyBlocked ? t('water.unblockBtn') : t('water.blockBtn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFocusNode(es.midX, es.midZ, 110)}
                      title={t('water.locateIn3d')}
                      className="p-1 rounded-md bg-white border border-[#CBD5E1] text-slate-600 hover:text-[#0891B2] dark:bg-slate-800/80 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-cyan-300 cursor-pointer"
                    >
                      <Crosshair className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono-tabular">
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatDecimal(es.flowRateM3s, 2)} / {formatDecimal(es.effectiveCapacityM3s, 2)} {t('water.m3sUnit')} ·{' '}
                    {formatDecimal(es.utilizationPct, 0)}%
                  </span>
                  <span className={`font-semibold ${statusColor}`}>
                    {t(`water.edgeStatus.${es.status}`)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. Water Discharge Strategy Optimization */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400 shrink-0" />
            <span>{t('water.dischargeTitle')}</span>
          </h3>
          <span className="text-[10px] text-[#64748B] dark:text-slate-400 whitespace-nowrap">
            {t('water.capacityConstrainedTag')}
          </span>
        </div>

        {/* Baseline (No Diversion) button */}
        <button
          type="button"
          data-testid="water-strategy-none"
          onClick={() => setWaterDischargeStrategy('none')}
          className={`w-full text-left rounded-lg border px-3 py-2 transition-colors cursor-pointer ${
            waterDischargeStrategyId === 'none'
              ? 'bg-cyan-50 border-cyan-300 text-[#172033] dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-200'
              : 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-700 hover:border-slate-300 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium">
            <span>{t('water.strategyInfo.none.label')}</span>
            {waterDischargeStrategyId === 'none' && (
              <span className="text-[10px] font-semibold text-[#0891B2] dark:text-cyan-300">
                {t('common.active')}
              </span>
            )}
          </div>
          <p className="text-[10px] text-[#64748B] dark:text-slate-400 mt-0.5">
            {t('water.strategyInfo.none.desc')}
          </p>
        </button>

        <div className="space-y-2">
          {waterResult.strategies.map((strat) => {
            const isActive = waterResult.activeStrategyId === strat.id;
            const sourceName = isTh ? strat.sourceNodeNameTh : strat.sourceNodeName;
            const targetName = isTh ? strat.targetNodeNameTh : strat.targetNodeName;
            const infeasibleReason = isTh
              ? strat.infeasibleReasonTh
              : strat.infeasibleReason;
            const stratTitle = t(`water.strategyInfo.${strat.id}.label`);
            const stratDesc = t(`water.strategyInfo.${strat.id}.desc`);

            return (
              <div
                key={strat.id}
                data-testid={`water-strategy-${strat.id}`}
                className={`rounded-lg border p-3 space-y-2 ${
                  !strat.isFeasible
                    ? 'bg-rose-50/70 border-rose-200 dark:bg-slate-900/40 dark:border-rose-500/30 opacity-85'
                    : isActive
                      ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/45'
                      : strat.recommended
                        ? 'bg-cyan-50 border-cyan-300 dark:bg-cyan-500/10 dark:border-cyan-500/35'
                        : 'bg-[#F8FAFC] border-[#E2E8F0] dark:bg-slate-900/60 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                      {stratTitle}
                    </p>
                    <p className="text-[10px] text-[#64748B] dark:text-slate-400">{stratDesc}</p>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1 flex-wrap pt-0.5">
                      <span className="truncate">{sourceName}</span>
                      <ArrowRight className="w-3 h-3 text-[#0891B2] dark:text-cyan-400 shrink-0" />
                      <span className="truncate font-medium text-[#0891B2] dark:text-cyan-200">
                        {targetName}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {!strat.isFeasible ? (
                      <span className="text-[10px] font-semibold text-[#DC2626] dark:text-rose-400 whitespace-nowrap">
                        {t('water.insufficientCapacityLabel')}
                      </span>
                    ) : isActive ? (
                      <span className="text-[10px] font-semibold text-[#16A34A] dark:text-emerald-300 whitespace-nowrap">
                        {t('common.active')}
                      </span>
                    ) : strat.recommended ? (
                      <span className="text-[10px] font-semibold text-[#0891B2] dark:text-cyan-300 whitespace-nowrap">
                        {t('water.recommendedLabel')}
                      </span>
                    ) : null}

                    <button
                      type="button"
                      data-testid={`water-strategy-apply-${strat.id}`}
                      disabled={!strat.isFeasible}
                      onClick={() =>
                        setWaterDischargeStrategy(strat.id as WaterDischargeStrategyId)
                      }
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap ${
                        !strat.isFeasible
                          ? 'bg-slate-100 border-[#E2E8F0] text-slate-400 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-500 cursor-not-allowed'
                          : isActive
                            ? 'bg-[#16A34A] text-white border-[#16A34A] dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-400 cursor-pointer'
                            : 'bg-cyan-50 border-cyan-300 text-[#0891B2] hover:bg-cyan-100 dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-200 dark:hover:bg-cyan-500/25 cursor-pointer'
                      }`}
                    >
                      {isActive ? t('common.active') : t('common.apply')}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400 pt-1.5 border-t border-[#E2E8F0] dark:border-slate-800/70">
                  <span>
                    {t('water.dischargeVolLabel')}:{' '}
                    <strong className="text-[#172033] dark:text-slate-200 font-medium">
                      {formatNumber(strat.volumeToDischargeM3)} {m3Unit}
                    </strong>
                  </span>
                  <span className="text-right">
                    {t('water.receivingCapLabel')}:{' '}
                    <strong
                      className={`font-medium ${
                        strat.isFeasible
                          ? 'text-[#0891B2] dark:text-cyan-300'
                          : 'text-[#DC2626] dark:text-rose-400'
                      }`}
                    >
                      {formatNumber(strat.receivingAvailableCapacityM3)} {m3Unit}
                    </strong>
                  </span>
                  <span>
                    {t('water.levelChangeLabel')}:{' '}
                    <strong className="text-[#172033] dark:text-slate-200 font-medium">
                      {formatDecimal(strat.sourceLevelChangeMeters, 2)} / +
                      {formatDecimal(strat.targetLevelChangeMeters, 2)} {mUnit}
                    </strong>
                  </span>
                  <span className="text-right">
                    {t('water.estTimeLabel')}:{' '}
                    <strong className="text-[#172033] dark:text-slate-200 font-medium">
                      {formatNumber(strat.estimatedDischargeMinutes)} {minUnit}
                    </strong>
                  </span>
                  <span>
                    {t('water.postRiskLabel')}:{' '}
                    <strong className={`font-medium ${WATER_RISK_TEXT[strat.postDischargeOverflowRisk]}`}>
                      {t(`water.riskLevels.${strat.postDischargeOverflowRisk}`)} (
                      {formatDecimal(strat.postDischargeTargetUtilizationPct, 1)}%)
                    </strong>
                  </span>
                </div>

                {!strat.isFeasible && infeasibleReason && (
                  <p className="text-[11px] text-[#DC2626] dark:text-rose-300/90 leading-snug">
                    {infeasibleReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 7. Cross-Module Links */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSection('flood')}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium bg-white border border-[#CBD5E1] text-[#172033] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200 dark:hover:border-cyan-500/40 cursor-pointer whitespace-nowrap"
        >
          <Waves className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
          <span className="truncate">{t('water.inspectFloodBtn')}</span>
        </button>

        <button
          type="button"
          onClick={() => setSection('assistant')}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium bg-cyan-50 border border-cyan-300 text-[#0891B2] hover:bg-cyan-100 dark:bg-cyan-500/15 dark:border-cyan-500/40 dark:text-cyan-200 dark:hover:bg-cyan-500/25 cursor-pointer whitespace-nowrap"
        >
          <Bot className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-300 shrink-0" />
          <span className="truncate">{t('water.askAiWaterBtn')}</span>
        </button>
      </div>
    </div>
  );
}
