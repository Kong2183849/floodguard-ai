import { useMemo } from 'react';
import {
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Route,
  Sliders,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTranslation } from '../i18n';
import {
  localizeAffectedAreaLabel,
  localizeRiskLevel,
  localizeRouteError,
  localizeScenarioInfo,
} from '../i18n/domainLabels';
import { AiAssistantPanel } from './AiAssistantPanel';
import { AnalyticsDashboardPanel } from './AnalyticsDashboardPanel';
import { FloodAnalysisPanel } from './FloodAnalysisPanel';
import { RouteOptimizationPanel } from './RouteOptimizationPanel';
import { SimulationControlPanel } from './SimulationControlPanel';
import { SummaryCards } from './SummaryCards';
import { TrafficManagementPanel } from './TrafficManagementPanel';
import { WaterManagementPanel } from './WaterManagementPanel';
import { PowerManagementPanel } from './PowerManagementPanel';
import { DecisionSupportPanel } from './DecisionSupportPanel';
import { McdaAnalysisPanel } from './McdaAnalysisPanel';
import { WhatIfSimulationPanel } from './WhatIfSimulationPanel';
import type { AffectedObjectRecord, ImpactRiskLevel } from '../types/city';

const RISK_TEXT_CLASSES: Record<ImpactRiskLevel, string> = {
  Low: 'text-[#D97706] dark:text-amber-300',
  Medium: 'text-orange-600 dark:text-orange-400',
  High: 'text-[#DC2626] dark:text-red-400',
  Critical: 'text-[#DC2626] dark:text-rose-400',
};

export function WorkspaceViews() {
  const {
    state,
    activeArea,
    impactAnalysis,
    routeResult,
    metrics,
    setSection,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    selectImpactObject,
    toggleLayer,
    selectRouteIndex,
    focusRoute,
  } = useSimulation();
  const { activeSection, settings, layers, cityStats } = state;

  const { t, language, formatNumber, formatDecimal } = useTranslation();

  const activeScenario = localizeScenarioInfo(settings, t, language);
  const localizedAreaLabel = localizeAffectedAreaLabel(activeArea, t);

  const corridorWatchItems = useMemo(
    () =>
      impactAnalysis.items
        .filter((item) => item.targetType === 'road' || item.targetType === 'facility')
        .slice(0, 6),
    [impactAnalysis.items]
  );

  const handleLocate = (item: AffectedObjectRecord) => {
    selectImpactObject(item);
  };

  const handleCalculateAndVisualizeRoute = () => {
    if (!layers.routeOverlay) {
      toggleLayer('routeOverlay');
    }
    selectRouteIndex(0);
    focusRoute();
  };

  const metersUnit = t('common.metersUnit');
  const kmUnit = t('common.kmUnit');

  /* 1. OVERVIEW MODULE */
  if (activeSection === 'overview') {
    const statusLabel = t(`status.${settings.status}`);
    const primaryRoute = routeResult.routes[0] ?? null;
    const localizedError = localizeRouteError(
      routeResult,
      metrics.floodLevelMeters,
      t,
      language
    );

    return (
      <div className="space-y-4" data-testid="module-overview">
        <SummaryCards metrics={metrics} />

        {/* Simulation Status + Quick Playback */}
        <section className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 p-3.5 space-y-3 shadow-2xs dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {t('overview.simStatusScenario')}
              </h3>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                {activeScenario.label} · {localizedAreaLabel}
              </p>
            </div>
            <span
              data-testid="overview-sim-status"
              className={`text-xs font-semibold ${
                settings.status === 'running'
                  ? 'text-[#0891B2] dark:text-cyan-400'
                  : settings.status === 'paused'
                    ? 'text-[#D97706] dark:text-orange-400'
                    : 'text-[#64748B] dark:text-slate-300'
              }`}
            >
              {statusLabel} · {formatNumber(settings.simulationSpeed)}×
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={startSimulation}
              disabled={settings.status === 'running'}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                settings.status === 'running'
                  ? 'bg-[#0891B2]/20 text-[#0891B2]/70 dark:bg-cyan-500/30 dark:text-cyan-200/70 cursor-not-allowed'
                  : 'bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer'
              }`}
            >
              <Play className="w-3.5 h-3.5 shrink-0" />
              <span>{t('common.start')}</span>
            </button>

            <button
              type="button"
              onClick={pauseSimulation}
              disabled={settings.status !== 'running'}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                settings.status !== 'running'
                  ? 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-400 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-amber-500/15 border-amber-500/45 text-[#D97706] hover:bg-amber-500/25 dark:bg-orange-500/15 dark:border-orange-500/45 dark:text-orange-300 dark:hover:bg-orange-500/25 cursor-pointer'
              }`}
            >
              <Pause className="w-3.5 h-3.5 shrink-0" />
              <span>{t('common.pause')}</span>
            </button>

            <button
              type="button"
              onClick={resetSimulation}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#172033] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-200 dark:hover:text-white cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>{t('common.reset')}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSection('simulation')}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#172033] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200 dark:hover:border-cyan-500/40 cursor-pointer whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
              <span className="truncate">{t('overview.tuneSimulation')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSection('routing')}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#172033] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200 dark:hover:border-cyan-500/40 cursor-pointer whitespace-nowrap"
            >
              <Route className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400 shrink-0" />
              <span className="truncate">{t('overview.emergencyRoutes')}</span>
            </button>
          </div>
        </section>

        {/* Active Emergency Corridor Snapshot */}
        <section className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 p-3.5 space-y-2 shadow-2xs dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
              {t('overview.activeEmergencyCorridor')}
            </h3>
            <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400 shrink-0">
              {t('overview.passablePct', {
                pct: formatNumber(routeResult.passableNetworkPct),
              })}
            </span>
          </div>
          {routeResult.status === 'ready' && primaryRoute ? (
            <button
              type="button"
              onClick={handleCalculateAndVisualizeRoute}
              className="w-full text-left rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100/70 dark:bg-emerald-500/10 dark:border-emerald-500/35 dark:hover:bg-emerald-500/15 px-3 py-2.5 transition-colors cursor-pointer space-y-1"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#16A34A] dark:text-emerald-300">
                <span className="truncate">
                  {routeResult.origin?.label} → {routeResult.destination?.label}
                </span>
                <span className="font-mono-tabular shrink-0">
                  {formatDecimal(primaryRoute.distanceMeters / 1000, 2)} {kmUnit}
                </span>
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-300">
                {t(
                  routeResult.routes.length === 1
                    ? 'overview.routeBrief'
                    : 'overview.routeBriefPlural',
                  {
                    minutes: formatDecimal(primaryRoute.estimatedSimMinutes, 1),
                    count: formatNumber(routeResult.routes.length),
                  }
                )}
              </p>
            </button>
          ) : (
            <div className="rounded-lg bg-rose-50 border border-rose-200 text-[#DC2626] dark:bg-rose-950/30 dark:border-rose-500/35 px-3 py-2 text-xs dark:text-rose-200">
              {localizedError || t('overview.evaluatingTopology')}
            </div>
          )}
        </section>

        {/* Live Corridor & Facility Flood Watch */}
        <section className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 p-3.5 space-y-2.5 shadow-2xs dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
              {t('overview.corridorFloodWatch')}
            </h3>
            <button
              type="button"
              onClick={() => setSection('flood')}
              className="text-[11px] text-[#0891B2] hover:text-[#0e7490] dark:text-cyan-400 dark:hover:text-cyan-300 cursor-pointer whitespace-nowrap"
            >
              {t('overview.fullReport')}
            </button>
          </div>

          {corridorWatchItems.length === 0 ? (
            <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-slate-900/60 dark:border-slate-800 px-3 py-2.5 text-xs text-[#64748B] dark:text-slate-400">
              {t('overview.allMonitoredClear', { area: localizedAreaLabel })}
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-slate-800/80 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-slate-900/60 dark:border-slate-800 overflow-hidden">
              {corridorWatchItems.map((item) => (
                <button
                  key={`${item.targetType}-${item.id}`}
                  type="button"
                  onClick={() => handleLocate(item)}
                  className="w-full text-left px-3 py-2 space-y-0.5 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#172033] dark:text-slate-100 truncate">
                      {item.name}
                    </span>
                    <span
                      className={`text-[11px] font-semibold shrink-0 ${
                        RISK_TEXT_CLASSES[item.riskLevel]
                      }`}
                    >
                      {localizeRiskLevel(item.riskLevel, t)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#64748B] dark:text-slate-400">
                    <span className="truncate">
                      {t(`targetTypes.${item.targetType}`)} · {item.subType}
                    </span>
                    <span className="font-mono-tabular text-slate-700 dark:text-slate-300 shrink-0">
                      {formatDecimal(item.estimatedDepthMeters, 2)} {metersUnit}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Chatuchak Base GeoJSON Reference */}
        <section className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 p-3.5 space-y-2 shadow-2xs dark:shadow-none">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#172033] dark:text-slate-200">{t('overview.chatuchak3dEnv')}</span>
            <span className="text-[11px] text-[#0891B2] dark:text-cyan-400">{t('overview.realOsmGeojson')}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#64748B] dark:text-slate-400">
            <span>{t('overview.buildingsLabel')}</span>
            <span className="text-right font-mono-tabular text-[#172033] dark:text-slate-200">
              {cityStats ? formatNumber(cityStats.buildings) : '—'}
            </span>
            <span>{t('overview.roadFeaturesLabel')}</span>
            <span className="text-right font-mono-tabular text-[#172033] dark:text-slate-200">
              {cityStats ? formatNumber(cityStats.roads) : '—'}
            </span>
            <span>{t('overview.transitStationsLabel')}</span>
            <span className="text-right font-mono-tabular text-[#172033] dark:text-slate-200">
              {cityStats ? formatNumber(cityStats.stations) : '—'}
            </span>
            <span>{t('overview.districtPopulationLabel')}</span>
            <span className="text-right font-mono-tabular text-[#172033] dark:text-slate-200">
              {cityStats ? formatNumber(cityStats.districtPopulation) : '—'}
            </span>
          </div>
        </section>
      </div>
    );
  }

  /* 2. SIMULATION MODULE */
  if (activeSection === 'simulation') {
    return <SimulationControlPanel />;
  }

  /* 3. FLOOD IMPACT ANALYSIS MODULE */
  if (activeSection === 'flood') {
    return <FloodAnalysisPanel />;
  }

  /* 4. WATER MANAGEMENT MODULE */
  if (activeSection === 'water') {
    return <WaterManagementPanel />;
  }

  /* 5. POWER MANAGEMENT MODULE */
  if (activeSection === 'power') {
    return <PowerManagementPanel />;
  }

  /* 6. TRAFFIC MANAGEMENT MODULE */
  if (activeSection === 'traffic') {
    return <TrafficManagementPanel />;
  }

  /* 5. ROUTE OPTIMIZATION MODULE */
  if (activeSection === 'routing') {
    return <RouteOptimizationPanel />;
  }

  /* 7. CENTRALIZED AI DECISION SUPPORT SYSTEM */
  if (activeSection === 'dss') {
    return <DecisionSupportPanel />;
  }

  /* 8. MULTI-CRITERIA DECISION ANALYSIS (MCDA) */
  if (activeSection === 'mcda') {
    return <McdaAnalysisPanel />;
  }

  /* 9. SOLUTION IMPLEMENTATION & WHAT-IF SIMULATION */
  if (activeSection === 'whatif') {
    return <WhatIfSimulationPanel />;
  }

  /* 10. AI ASSISTANT MODULE */
  if (activeSection === 'assistant') {
    return (
      <div className="h-full" data-testid="module-assistant">
        <AiAssistantPanel />
      </div>
    );
  }

  /* 6. ANALYTICS MODULE */
  return (
    <div data-testid="module-analytics">
      <AnalyticsDashboardPanel />
    </div>
  );
}
