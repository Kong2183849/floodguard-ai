import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
  EyeOff,
  Gauge,
  Info,
  Navigation,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  TrafficCone,
  Trash2,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTranslation } from '../i18n';
import {
  localizeRouteError,
  localizeRouteLabel,
  localizeTopologyNotes,
} from '../i18n/domainLabels';
import type {
  BlockedRoadHighlight,
  ComputedRoute,
  RouteOptimizationMode,
  RouteRiskWeights,
  SimulatedRoadIncident,
} from '../types/city';

const RISK_WEIGHT_KEYS: Array<{
  key: keyof RouteRiskWeights;
  labelKey: string;
  accentClass: string;
}> = [
  { key: 'floodRisk', labelKey: 'routing.weightFlood', accentClass: 'accent-cyan-500' },
  {
    key: 'congestionRisk',
    labelKey: 'routing.weightCongestion',
    accentClass: 'accent-amber-500',
  },
  {
    key: 'accidentRisk',
    labelKey: 'routing.weightAccident',
    accentClass: 'accent-orange-500',
  },
  {
    key: 'roadAccessibility',
    labelKey: 'routing.weightAccessibility',
    accentClass: 'accent-emerald-500',
  },
];

function riskScoreColor(score: number): string {
  if (score >= 65) return 'text-[#DC2626] dark:text-rose-400';
  if (score >= 40) return 'text-orange-700 dark:text-orange-400';
  if (score >= 18) return 'text-[#D97706] dark:text-amber-300';
  return 'text-[#16A34A] dark:text-emerald-400';
}

export function RouteOptimizationPanel() {
  const {
    state,
    impactAnalysis,
    allWaypoints,
    routeResult,
    metrics,
    selectImpactObject,
    toggleLayer,
    setRouteOrigin,
    setRouteDestination,
    swapRouteEndpoints,
    setVehicleProfile,
    setRouteMode,
    setRiskWeights,
    setTrafficCongestion,
    toggleRoadIncident,
    removeRoadIncident,
    resetRoadConditions,
    selectRouteIndex,
    focusRoute,
  } = useSimulation();

  const {
    layers,
    cityStatus,
    cityError,
    impactCatalog,
    roadGraph,
    routeOriginId,
    routeDestId,
    vehicleProfile,
    routeMode,
    riskWeights,
    trafficCongestionPct,
    roadIncidents,
    selectedRouteIndex,
  } = state;

  const { t, language, formatNumber, formatDecimal } = useTranslation();

  const [showRouteRules, setShowRouteRules] = useState(false);
  const [showRiskWeights, setShowRiskWeights] = useState(routeMode === 'safest');

  const metersUnit = t('common.metersUnit');
  const kmUnit = t('common.kmUnit');
  const minUnit = t('routing.minUnit');
  const kmhUnit = t('routing.kmhUnit');

  const localizedRouteErr = localizeRouteError(
    routeResult,
    metrics.floodLevelMeters,
    t,
    language
  );
  const localizedTopologyNotes = localizeTopologyNotes(
    roadGraph,
    impactAnalysis.affectedRoadsCount,
    t,
    language
  );

  const locateRoadById = (
    roadId: string,
    fallback: {
      name: string;
      highway: string;
      centerX: number;
      centerZ: number;
      depthMeters?: number;
      riskLevel?: BlockedRoadHighlight['riskLevel'];
    }
  ) => {
    const matched = impactAnalysis.items.find(
      (item) => item.targetType === 'road' && item.id === roadId
    );
    if (matched) {
      selectImpactObject(matched);
      return;
    }
    const catalogRoad = impactCatalog?.roads.find((r) => r.id === roadId);
    if (catalogRoad) {
      selectImpactObject({
        id: catalogRoad.id,
        name: catalogRoad.name || fallback.name,
        hasRecordedName: Boolean(catalogRoad.name),
        targetType: 'road',
        subType: catalogRoad.subType,
        sourceDataset: 'roads.geojson',
        riskLevel: fallback.riskLevel ?? 'High',
        estimatedDepthMeters: fallback.depthMeters ?? 0,
        vulnerability: catalogRoad.vulnerability,
        sceneX: catalogRoad.sceneX,
        sceneZ: catalogRoad.sceneZ,
        boundsMin: catalogRoad.boundsMin,
        boundsMax: catalogRoad.boundsMax,
        isBridge: catalogRoad.isBridge,
        isTunnel: catalogRoad.isTunnel,
        isElevatedTransit: false,
        roadInfo: catalogRoad.roadInfo,
      });
      return;
    }
    selectImpactObject({
      id: roadId,
      name: fallback.name,
      hasRecordedName: true,
      targetType: 'road',
      subType: fallback.highway,
      sourceDataset: 'roads.geojson',
      riskLevel: fallback.riskLevel ?? 'High',
      estimatedDepthMeters: fallback.depthMeters ?? 0,
      vulnerability: 0.5,
      sceneX: fallback.centerX,
      sceneZ: fallback.centerZ,
      boundsMin: [fallback.centerX - 18, 0, fallback.centerZ - 18],
      boundsMax: [fallback.centerX + 18, 4, fallback.centerZ + 18],
      isBridge: false,
      isTunnel: false,
      isElevatedTransit: false,
    });
  };

  const handleCalculateAndVisualizeRoute = () => {
    if (!layers.routeOverlay) {
      toggleLayer('routeOverlay');
    }
    selectRouteIndex(0);
    focusRoute();
  };

  const originalRoute = routeResult.originalRoute;
  const primaryRoute = routeResult.routes[0] ?? null;

  const routesDiffersFromOriginal = (route: ComputedRoute | null): boolean => {
    if (!originalRoute || !route) return false;
    if (originalRoute.edgeIds.length !== route.edgeIds.length) return true;
    return originalRoute.edgeIds.some((eid, i) => eid !== route.edgeIds[i]);
  };

  const renderDeltaBadge = (route: ComputedRoute) => {
    if (!originalRoute) return null;
    if (!originalRoute.isPassable) {
      return (
        <span className="text-[10px] font-medium text-[#16A34A] dark:text-emerald-300">
          {t('routing.bypassesBlocked', {
            count: formatNumber(originalRoute.blockedSegmentsOnRouteCount),
          })}
        </span>
      );
    }
    if (!routesDiffersFromOriginal(route)) {
      return <span className="text-[10px] text-[#64748B] dark:text-slate-400">{t('routing.sameAsBaseline')}</span>;
    }
    const timeDiff = route.estimatedSimMinutes - originalRoute.estimatedSimMinutes;
    const riskDiff = route.riskScore - originalRoute.riskScore;
    const parts: string[] = [];
    if (Math.abs(riskDiff) >= 2) {
      parts.push(
        `${riskDiff < 0 ? '' : '+'}${formatNumber(riskDiff)} ${t('routing.riskShort')}`
      );
    }
    if (Math.abs(timeDiff) >= 0.2) {
      parts.push(
        `${timeDiff < 0 ? '' : '+'}${formatDecimal(timeDiff, 1)} ${minUnit}`
      );
    }
    if (parts.length === 0) return null;
    return (
      <span className="text-[10px] font-mono-tabular text-[#0891B2] dark:text-cyan-300">
        {t('routing.vsBaselinePrefix', { delta: parts.join(' · ') })}
      </span>
    );
  };

  const congestedPct =
    routeResult.totalGraphEdges > 0
      ? Math.round((routeResult.congestedEdgeCount / routeResult.totalGraphEdges) * 100)
      : 0;

  return (
    <div className="space-y-3" data-testid="module-routing">
      {/* 1. Origin, Swap, Destination, Vehicle Clearance & Route Mode */}
      <div className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2.5">
        <div className="flex items-end gap-2">
          <label className="text-xs space-y-1 flex-1 min-w-0">
            <span className="text-[#64748B] dark:text-slate-400 block">{t('routing.originLabel')}</span>
            <select
              aria-label={t('routing.originAria')}
              value={routeOriginId}
              onChange={(e) => setRouteOrigin(e.target.value)}
              className="w-full rounded-lg bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 px-2.5 py-2 text-xs text-[#172033] dark:text-slate-100 focus:outline-none focus:border-[#0891B2] dark:focus:border-cyan-500"
            >
              {allWaypoints.map((wp) => (
                <option key={wp.id} value={wp.id}>
                  {wp.label} ({wp.category})
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={swapRouteEndpoints}
            title={t('routing.swapTitle')}
            aria-label={t('routing.swapTitle')}
            className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:text-[#0891B2] dark:hover:text-cyan-300 hover:border-cyan-600/40 dark:hover:border-cyan-500/40 cursor-pointer shrink-0"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
        </div>

        <label className="text-xs space-y-1 block">
          <span className="text-[#64748B] dark:text-slate-400 block">{t('routing.destLabel')}</span>
          <select
            aria-label={t('routing.destAria')}
            value={routeDestId}
            onChange={(e) => setRouteDestination(e.target.value)}
            className="w-full rounded-lg bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 px-2.5 py-2 text-xs text-[#172033] dark:text-slate-100 focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-500"
          >
            {allWaypoints.map((wp) => (
              <option key={wp.id} value={wp.id}>
                {wp.label} ({wp.category})
              </option>
            ))}
          </select>
        </label>

        {/* Vehicle Clearance */}
        <div className="text-xs space-y-1">
          <span className="text-[#64748B] dark:text-slate-400 block">{t('routing.vehicleClearance')}</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setVehicleProfile('emergency')}
              className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium cursor-pointer whitespace-nowrap truncate ${
                vehicleProfile === 'emergency'
                  ? 'bg-cyan-50 border-cyan-600/45 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-300'
                  : 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'
              }`}
            >
              {t('routing.emergencyVehicle')}
            </button>
            <button
              type="button"
              onClick={() => setVehicleProfile('standard')}
              className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium cursor-pointer whitespace-nowrap truncate ${
                vehicleProfile === 'standard'
                  ? 'bg-cyan-50 border-cyan-600/45 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-300'
                  : 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'
              }`}
            >
              {t('routing.standardVehicle')}
            </button>
          </div>
        </div>

        {/* Route Optimization Mode Selector (Deterministic A*) */}
        <div className="text-xs space-y-1">
          <span className="text-[#64748B] dark:text-slate-400 block">{t('routing.modeLabel')}</span>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t('routing.modeLabel')}>
            {(['safest', 'fastest', 'shortest'] as RouteOptimizationMode[]).map((mode) => {
              const active = routeMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  data-testid={`route-mode-${mode}`}
                  onClick={() => {
                    setRouteMode(mode);
                    if (mode === 'safest') setShowRiskWeights(true);
                  }}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold cursor-pointer whitespace-nowrap truncate transition-colors ${
                    active
                      ? 'bg-emerald-50 border-emerald-600/50 text-[#16A34A] dark:bg-emerald-500/18 dark:border-emerald-500/55 dark:text-emerald-300'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-700 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {t(`routing.modes.${mode}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Calculate & Focus + 3D Overlay Toggle */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleCalculateAndVisualizeRoute}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('routing.calculateBtn')}</span>
          </button>

          <button
            type="button"
            onClick={() => toggleLayer('routeOverlay')}
            aria-pressed={layers.routeOverlay}
            className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              layers.routeOverlay
                ? 'bg-emerald-50 border-emerald-600/40 text-[#16A34A] dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-300'
                : 'bg-white border-[#CBD5E1] text-[#64748B] hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-400 dark:hover:text-white'
            }`}
            title={t('routing.toggle3dTitle')}
          >
            {layers.routeOverlay ? (
              <Eye className="w-3.5 h-3.5" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
            <span>{t('flood.col3d')}</span>
          </button>
        </div>
      </div>

      {/* 2. Multi-Factor Dynamic Road Conditions & Configurable Risk Weights */}
      <div className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Gauge className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400 shrink-0" />
            <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 truncate">
              {t('routing.conditionsTitle')}
            </h3>
          </div>
          <button
            type="button"
            onClick={resetRoadConditions}
            className="inline-flex items-center gap-1 text-[11px] text-[#64748B] dark:text-slate-400 hover:text-[#0891B2] dark:hover:text-cyan-300 cursor-pointer shrink-0 whitespace-nowrap"
            title={t('routing.resetConditionsTitle')}
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t('common.reset')}</span>
          </button>
        </div>

        {/* Simulated Traffic Congestion Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="text-slate-700 dark:text-slate-300">{t('routing.congestionLabel')}</span>
            <span
              data-testid="routing-congestion-value"
              className="font-mono-tabular font-semibold text-[#D97706] dark:text-amber-300 shrink-0"
            >
              {formatNumber(trafficCongestionPct)}% · {formatDecimal(routeResult.avgNetworkSpeedKmh, 1)}{' '}
              {kmhUnit}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={2}
            value={trafficCongestionPct}
            onChange={(e) => setTrafficCongestion(Number(e.target.value))}
            aria-label={t('routing.congestionAria')}
            className="w-full accent-amber-500 cursor-pointer"
          />
          <div className="flex items-center justify-between text-[10px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
            <span>
              {t('routing.congestedSegmentsStat', {
                count: formatNumber(routeResult.congestedEdgeCount),
                pct: formatNumber(congestedPct),
              })}
            </span>
            <span>{t('routing.simModelTag')}</span>
          </div>
        </div>

        {/* Simulated Accidents & Road Closures List */}
        <div className="space-y-1.5 pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
              {t('routing.incidentsHeading')}
            </span>
            <span className="text-[10px] text-[#64748B] dark:text-slate-400 truncate">
              {t('routing.clickRoadHint')}
            </span>
          </div>

          {roadIncidents.length === 0 ? (
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('routing.noIncidents')}</p>
          ) : (
            <div className="space-y-1.5">
              {roadIncidents.map((inc: SimulatedRoadIncident) => {
                const isClosure = inc.kind === 'closure';
                return (
                  <div
                    key={inc.id}
                    data-testid={`incident-row-${inc.id}`}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 border text-[11px] transition-colors ${
                      inc.active
                        ? isClosure
                          ? 'bg-rose-50 border-rose-300 text-[#172033] dark:bg-rose-950/30 dark:border-rose-500/45 dark:text-slate-100'
                          : 'bg-orange-50 border-orange-300 text-[#172033] dark:bg-orange-950/30 dark:border-orange-500/45 dark:text-slate-100'
                        : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B] dark:bg-slate-900/55 dark:border-slate-800 dark:text-slate-400'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRoadIncident(inc.id)}
                      aria-pressed={inc.active}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      {isClosure ? (
                        <Ban
                          className={`w-3.5 h-3.5 shrink-0 ${
                            inc.active ? 'text-[#DC2626] dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                      ) : (
                        <TrafficCone
                          className={`w-3.5 h-3.5 shrink-0 ${
                            inc.active ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium truncate">{inc.roadName}</span>
                          <span
                            className={`text-[10px] font-semibold shrink-0 ${
                              !inc.active
                                ? 'text-slate-400 dark:text-slate-500'
                                : isClosure
                                  ? 'text-[#DC2626] dark:text-rose-300'
                                  : 'text-orange-700 dark:text-orange-300'
                            }`}
                          >
                            ·{' '}
                            {isClosure
                              ? t('routing.incidentClosure')
                              : inc.kind === 'construction'
                                ? t('traffic.incidentKinds.construction')
                                : inc.kind === 'congestion'
                                  ? t('traffic.incidentKinds.congestion')
                                  : inc.blocksRoad
                                    ? t('routing.incidentMajorAccident')
                                    : t('routing.incidentMinorAccident')}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#64748B] dark:text-slate-400 block truncate">
                          {inc.highway.replace(/_/g, ' ')} ·{' '}
                          {inc.active
                            ? inc.blocksRoad
                              ? t('routing.statusBlocked')
                              : t('routing.statusSlowdown')
                            : t('routing.statusCleared')}
                        </span>
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          locateRoadById(inc.roadId, {
                            name: inc.roadName,
                            highway: inc.highway,
                            centerX: inc.centerX,
                            centerZ: inc.centerZ,
                            riskLevel: inc.blocksRoad ? 'Critical' : 'High',
                          })
                        }
                        className="p-1 rounded bg-white dark:bg-slate-900/90 border border-[#CBD5E1] dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:text-[#0891B2] dark:hover:text-cyan-300 cursor-pointer"
                        title={t('routing.locateIncidentTitle')}
                        aria-label={t('routing.locateIncidentTitle')}
                      >
                        <Crosshair className="w-3 h-3" />
                      </button>

                      {inc.source === 'user' && (
                        <button
                          type="button"
                          onClick={() => removeRoadIncident(inc.id)}
                          className="p-1 rounded bg-white dark:bg-slate-900/90 border border-[#CBD5E1] dark:border-slate-700/80 text-[#64748B] dark:text-slate-400 hover:text-[#DC2626] dark:hover:text-rose-300 cursor-pointer"
                          title={t('routing.removeIncidentTitle')}
                          aria-label={t('routing.removeIncidentTitle')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Collapsible Risk Weights for Safest Mode */}
        <div className="pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80 space-y-2">
          <button
            type="button"
            onClick={() => setShowRiskWeights((v) => !v)}
            aria-expanded={showRiskWeights}
            className="w-full flex items-center justify-between text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-[#172033] dark:hover:text-white cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
              <span>{t('routing.riskWeightsTitle')}</span>
              {routeMode !== 'safest' && (
                <span className="text-[10px] text-[#64748B] dark:text-slate-400">
                  ({t('routing.safestOnlyHint')})
                </span>
              )}
            </span>
            {showRiskWeights ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#64748B] dark:text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[#64748B] dark:text-slate-400 shrink-0" />
            )}
          </button>

          {showRiskWeights && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1">
              {RISK_WEIGHT_KEYS.map(({ key, labelKey, accentClass }) => (
                <label key={key} className="space-y-1 text-[11px] block">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-slate-700 dark:text-slate-300 truncate">{t(labelKey)}</span>
                    <span className="font-mono-tabular text-[#172033] dark:text-slate-200 shrink-0">
                      {formatNumber(riskWeights[key])}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={riskWeights[key]}
                    onChange={(e) => setRiskWeights({ [key]: Number(e.target.value) })}
                    className={`w-full ${accentClass} cursor-pointer`}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Network Passability Strip + 3D Color Key */}
      <div className="rounded-lg bg-white dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800 shadow-2xs dark:shadow-none px-3 py-2 space-y-2 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-slate-700 dark:text-slate-300 font-mono-tabular">
            <span>
              {t('routing.passableLabel')}{' '}
              <strong
                data-testid="route-passable-pct"
                className={
                  routeResult.passableNetworkPct < 55
                    ? 'text-[#DC2626] dark:text-red-400'
                    : routeResult.passableNetworkPct < 90
                      ? 'text-orange-700 dark:text-orange-400'
                      : 'text-[#16A34A] dark:text-emerald-400'
                }
              >
                {formatNumber(routeResult.passableNetworkPct)}%
              </strong>
            </span>
            <span>
              {t('routing.blockedLabel')}{' '}
              <strong
                data-testid="route-blocked-count"
                className={
                  routeResult.blockedRoads.length > 0 ? 'text-[#DC2626] dark:text-rose-400' : 'text-[#172033] dark:text-slate-200'
                }
              >
                {formatNumber(routeResult.blockedRoads.length)}
              </strong>
            </span>
            <span>
              {t('routing.incidentsShortLabel')}{' '}
              <strong className="text-orange-700 dark:text-orange-300">
                {formatNumber(
                  routeResult.activeAccidentsCount + routeResult.closedRoadsCount
                )}
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowRouteRules((v) => !v)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#F8FAFC] dark:bg-slate-800/80 border border-[#CBD5E1] dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-[#172033] dark:hover:text-white cursor-pointer whitespace-nowrap"
          >
            <Info className="w-3 h-3 text-[#0891B2] dark:text-cyan-400" />
            <span>{t('routing.aStarRulesBtn')}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#64748B] dark:text-slate-400 border-t border-[#E2E8F0] dark:border-slate-800/80 pt-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-purple-600 dark:border-purple-400 inline-block" />
            <span>{t('routing.legendOriginal')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-xs bg-emerald-500 dark:bg-emerald-400 inline-block" />
            <span>{t('routing.legendRecommended')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-xs bg-amber-500 dark:bg-amber-400 inline-block" />
            <span>{t('routing.legendAlternative')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
            <span>{t('routing.legendBlockedIncident')}</span>
          </span>
        </div>
      </div>

      {showRouteRules && (
        <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/90 border border-[#CBD5E1] dark:border-slate-700/80 p-3 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
          <p className="font-semibold text-[#172033] dark:text-slate-100">{t('routing.aStarRulesHeading')}</p>
          {localizedTopologyNotes.map((note) => (
            <p key={note} className="text-[#64748B] dark:text-slate-400">
              • {note}
            </p>
          ))}
          {roadGraph && (
            <p className="text-[#64748B] dark:text-slate-400">
              •{' '}
              {t('routing.graphTopologyNote', {
                nodes: formatNumber(roadGraph.stats.compressedNodeCount),
                edges: formatNumber(roadGraph.stats.edgeCount),
              })}
            </p>
          )}
          <p className="text-[#64748B] dark:text-slate-400">
            •{' '}
            {t('routing.edgeWeightNote', {
              limit: formatDecimal(routeResult.maxSafeDepthMeters, 2),
            })}
          </p>
        </div>
      )}

      {/* 4. Route Comparison Results (Original Baseline + Recommended + Alternatives) */}
      {cityStatus === 'error' ? (
        <div
          data-testid="route-dataset-error"
          className="rounded-lg bg-rose-50 dark:bg-red-950/35 border border-rose-300 dark:border-red-500/45 p-3.5 flex items-start gap-2.5"
        >
          <ShieldAlert className="w-4 h-4 text-[#DC2626] dark:text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#DC2626] dark:text-red-300">
              {t('routing.unableBuildGraph')}
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-300">{cityError || t('routing.geojsonFailed')}</p>
          </div>
        </div>
      ) : routeResult.status === 'loading' ? (
        <div className="rounded-lg bg-white dark:bg-slate-900/60 border border-[#E2E8F0] dark:border-slate-800 px-4 py-5 text-center text-xs text-[#64748B] dark:text-slate-400">
          {t('routing.buildingGraph')}
        </div>
      ) : routeResult.status === 'unreachable' || routeResult.status === 'same_point' ? (
        <div
          data-testid="route-error-state"
          className="rounded-lg bg-rose-50 dark:bg-red-950/35 border border-rose-300 dark:border-red-500/45 p-3.5 space-y-2.5"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-[#DC2626] dark:text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#DC2626] dark:text-red-300">
                {routeResult.status === 'same_point'
                  ? t('routing.selectDistinctTitle')
                  : t('routing.noPassableTitle')}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300">{localizedRouteErr}</p>
            </div>
          </div>
          {routeResult.status === 'unreachable' && vehicleProfile === 'standard' && (
            <button
              type="button"
              onClick={() => setVehicleProfile('emergency')}
              className="w-full px-3 py-1.5 rounded-md bg-cyan-50 border border-cyan-600/45 text-[#0891B2] hover:bg-cyan-100 dark:bg-cyan-500/20 dark:border-cyan-500/45 dark:text-cyan-200 dark:hover:bg-cyan-500/30 text-xs font-medium cursor-pointer"
            >
              {t('routing.switchToEmergency')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Original Baseline Route Comparison Card */}
          {originalRoute && (
            <button
              type="button"
              data-testid="route-card-original"
              onClick={() => {
                if (!layers.routeOverlay) toggleLayer('routeOverlay');
                selectRouteIndex(-1);
                focusRoute();
              }}
              className={`w-full text-left rounded-lg p-3 border transition-colors cursor-pointer space-y-2 ${
                selectedRouteIndex === -1
                  ? 'bg-purple-50 border-purple-500/60 dark:bg-purple-500/14 dark:border-purple-400/60'
                  : 'bg-white border-[#E2E8F0] hover:border-purple-400/60 dark:bg-slate-900/65 dark:border-slate-800 dark:hover:border-purple-500/45 shadow-2xs dark:shadow-none'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-200">
                  <span className="w-3 h-0.5 border-t-2 border-dashed border-purple-600 dark:border-purple-400 inline-block shrink-0" />
                  <span>{localizeRouteLabel(originalRoute, t, routeMode)}</span>
                </span>
                <span
                  className={`text-[10px] font-semibold shrink-0 ${
                    originalRoute.isPassable ? 'text-slate-700 dark:text-slate-300' : 'text-[#DC2626] dark:text-rose-400'
                  }`}
                >
                  {originalRoute.isPassable
                    ? t('routing.baselinePassable')
                    : t('routing.baselineDisrupted', {
                        count: formatNumber(originalRoute.blockedSegmentsOnRouteCount),
                      })}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-[11px] font-mono-tabular">
                <div>
                  <span className="text-[#64748B] dark:text-slate-400 block text-[10px]">
                    {t('routing.colDistance')}
                  </span>
                  <span className="text-[#172033] dark:text-slate-100 font-semibold">
                    {formatDecimal(originalRoute.distanceMeters / 1000, 2)} {kmUnit}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748B] dark:text-slate-400 block text-[10px]">
                    {t('routing.colSimTime')}
                  </span>
                  <span className="text-[#172033] dark:text-slate-200 font-semibold">
                    {originalRoute.isPassable
                      ? `${formatDecimal(originalRoute.estimatedSimMinutes, 1)} ${minUnit}`
                      : t('routing.blockedShortVal')}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748B] dark:text-slate-400 block text-[10px]">
                    {t('routing.colAffectedSegs')}
                  </span>
                  <span
                    className={`font-semibold ${
                      originalRoute.affectedSegmentsCount > 0
                        ? 'text-orange-700 dark:text-orange-300'
                        : 'text-[#172033] dark:text-slate-200'
                    }`}
                  >
                    {formatNumber(originalRoute.affectedSegmentsCount)}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748B] dark:text-slate-400 block text-[10px]">
                    {t('routing.colRiskScore')}
                  </span>
                  <span className={`font-semibold ${riskScoreColor(originalRoute.riskScore)}`}>
                    {formatNumber(originalRoute.riskScore)}/100
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-[10px] text-[#64748B] dark:text-slate-400">
                <span className="truncate">
                  {originalRoute.roadNames.length > 0
                    ? t('routing.viaPrefix', {
                        roads: originalRoute.roadNames.slice(0, 3).join(' · '),
                      })
                    : t('routing.viaCollectorStreets')}
                </span>
                {primaryRoute && !originalRoute.isPassable && (
                  <span className="text-purple-700 dark:text-purple-300 shrink-0">{t('routing.reroutedNote')}</span>
                )}
              </div>
            </button>
          )}

          {/* Recommended & Alternative Routes */}
          {routeResult.routes.map((route, idx) => {
            const active =
              selectedRouteIndex >= 0 &&
              (selectedRouteIndex < routeResult.routes.length ? selectedRouteIndex : 0) ===
                idx;
            const isPrimary = idx === 0;
            return (
              <button
                key={route.id}
                type="button"
                data-testid={`route-card-${idx}`}
                onClick={() => {
                  if (!layers.routeOverlay) toggleLayer('routeOverlay');
                  selectRouteIndex(idx);
                  focusRoute();
                }}
                className={`w-full text-left rounded-lg p-3 border transition-colors cursor-pointer space-y-2 ${
                  active
                    ? isPrimary
                      ? 'bg-emerald-50 border-emerald-500/60 dark:bg-emerald-500/12 dark:border-emerald-500/50'
                      : idx === 1
                        ? 'bg-amber-50 border-amber-500/60 dark:bg-amber-500/12 dark:border-amber-500/50'
                        : 'bg-sky-50 border-sky-500/60 dark:bg-sky-500/12 dark:border-sky-500/50'
                    : 'bg-white border-[#E2E8F0] hover:border-slate-300 dark:bg-slate-900/75 dark:border-slate-800 dark:hover:border-slate-700 shadow-2xs dark:shadow-none'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#172033] dark:text-slate-100">
                    <Navigation
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isPrimary
                          ? 'text-[#16A34A] dark:text-emerald-400'
                          : idx === 1
                            ? 'text-[#D97706] dark:text-amber-400'
                            : 'text-sky-600 dark:text-sky-400'
                      }`}
                    />
                    <span>{localizeRouteLabel(route, t, routeMode)}</span>
                  </span>
                  <span
                    className={`text-[10px] font-semibold shrink-0 ${
                      route.maxWaterDepthMeters >= 0.35
                        ? 'text-orange-700 dark:text-orange-300'
                        : route.maxWaterDepthMeters >= 0.04
                          ? 'text-[#D97706] dark:text-amber-300'
                          : 'text-[#16A34A] dark:text-emerald-300'
                    }`}
                  >
                    {route.maxWaterDepthMeters >= 0.04
                      ? t('routing.maxDepth', {
                          depth: formatDecimal(route.maxWaterDepthMeters, 2),
                        })
                      : t('routing.dryCorridor')}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-[11px] font-mono-tabular">
                  <div>
                    <span className="text-[#64748B] dark:text-slate-400 block text-[10px]">
                      {t('routing.colDistance')}
                    </span>
                    <span className="text-[#172033] dark:text-slate-100 font-semibold">
                      {formatDecimal(route.distanceMeters / 1000, 2)} {kmUnit}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] dark:text-slate-400 block text-[10px]">
                      {t('routing.colSimTime')}
                    </span>
                    <span className="text-[#0891B2] dark:text-cyan-300 font-semibold">
                      {formatDecimal(route.estimatedSimMinutes, 1)} {minUnit}
                    </span>
                    {route.congestionDelayMinutes >= 0.2 && (
                      <span className="block text-[9px] text-[#D97706] dark:text-amber-300/90">
                        +{formatDecimal(route.congestionDelayMinutes, 1)} {t('routing.delaySuffix')}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[#64748B] dark:text-slate-400 block text-[10px]">
                      {t('routing.colAffectedSegs')}
                    </span>
                    <span
                      className={`font-semibold ${
                        route.affectedSegmentsCount > 0 ? 'text-[#D97706] dark:text-amber-300' : 'text-[#16A34A] dark:text-emerald-300'
                      }`}
                    >
                      {formatNumber(route.affectedSegmentsCount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] dark:text-slate-400 block text-[10px]">
                      {t('routing.colRiskScore')}
                    </span>
                    <span className={`font-semibold ${riskScoreColor(route.riskScore)}`}>
                      {formatNumber(route.riskScore)}/100
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#64748B] dark:text-slate-400">
                  <span className="truncate flex-1 min-w-0">
                    {route.roadNames.length > 0
                      ? t('routing.viaPrefix', {
                          roads: route.roadNames.slice(0, 3).join(' · '),
                        })
                      : t('routing.viaCollectorStreets')}
                  </span>
                  <span className="font-mono-tabular shrink-0 text-slate-700 dark:text-slate-300">
                    {formatDecimal(route.avgSpeedKmh, 0)} {kmhUnit}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#E2E8F0] dark:border-slate-800/70">
                  <span className="text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400">
                    {t('routing.segmentBreakdown', {
                      flooded: formatNumber(route.floodedSegmentsCount),
                      congested: formatNumber(route.congestedSegmentsCount),
                      accidents: formatNumber(route.accidentNearSegmentsCount),
                    })}
                  </span>
                  {renderDeltaBadge(route)}
                </div>
              </button>
            );
          })}

          {routeResult.routes.length === 1 && (
            <div
              data-testid="no-alternative-route-notice"
              className="rounded-lg p-3 border border-orange-300 dark:border-orange-500/35 bg-orange-50 dark:bg-orange-950/20 space-y-1"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{t('routing.noAltTitle')}</span>
              </span>
              <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                {t('routing.noAltDesc', {
                  limit: formatDecimal(routeResult.maxSafeDepthMeters, 2),
                })}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 5. Blocked, Closed & Accident Segments Summary (Clickable to locate in 3D) */}
      {routeResult.blockedRoads.length > 0 && (
        <div className="rounded-lg bg-white dark:bg-slate-900/65 border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] gap-2">
            <span className="font-semibold text-[#DC2626] dark:text-rose-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626] dark:text-rose-400 shrink-0" />
              <span>
                {t('routing.blockedSegmentsTitle', {
                  limit: formatDecimal(routeResult.maxSafeDepthMeters, 2),
                })}
              </span>
            </span>
            <span className="text-[#64748B] dark:text-slate-400 shrink-0">{t('routing.clickLocate3d')}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {routeResult.blockedRoads.slice(0, 10).map((br) => {
              const reasonLabel =
                br.reason === 'closure'
                  ? t('routing.reasonClosed')
                  : br.reason === 'accident'
                    ? t('routing.reasonAccident')
                    : `${formatDecimal(br.depthMeters, 2)} ${metersUnit}`;
              return (
                <button
                  key={`${br.roadId}-${br.reason}`}
                  type="button"
                  onClick={() =>
                    locateRoadById(br.roadId, {
                      name: br.name,
                      highway: br.highway,
                      centerX: br.centerX,
                      centerZ: br.centerZ,
                      depthMeters: br.depthMeters,
                      riskLevel: br.riskLevel,
                    })
                  }
                  className={`px-2 py-0.5 rounded border font-mono-tabular truncate max-w-[215px] cursor-pointer ${
                    br.reason === 'accident'
                      ? 'bg-orange-50 border-orange-300 text-orange-900 hover:border-orange-500 dark:bg-orange-950/40 dark:border-orange-500/35 dark:text-orange-100 dark:hover:border-orange-400'
                      : 'bg-rose-50 border-rose-300 text-rose-900 hover:border-rose-500 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-slate-200 dark:hover:border-rose-400'
                  }`}
                  title={t('routing.locateBlockedTitle', {
                    name: br.name,
                    highway: br.highway,
                    depth: formatDecimal(br.depthMeters, 2),
                  })}
                >
                  {br.name} · {reasonLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
