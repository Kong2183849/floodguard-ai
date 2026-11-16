import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Car,
  Construction,
  Crosshair,
  Eye,
  EyeOff,
  Gauge,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Route as RouteIcon,
  ShieldAlert,
  Timer,
  TrafficCone,
  Trash2,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTranslation } from '../i18n';
import type { RoadIncidentKind, SimulatedRoadIncident } from '../types/city';

type IncidentCreatorOption = RoadIncidentKind | 'volume';

export function TrafficManagementPanel() {
  const {
    state,
    routeResult,
    selectableRoadLocations,
    setSection,
    toggleLayer,
    setTrafficStatus,
    resetTrafficSimulation,
    setTrafficCongestion,
    setTrafficLightTiming,
    addTrafficIncident,
    toggleRoadIncident,
    removeRoadIncident,
    focusScenePoint,
  } = useSimulation();
  const { t, formatNumber, formatDecimal } = useTranslation();

  const {
    trafficStatus,
    trafficCongestionPct,
    trafficLightTiming,
    roadIncidents,
    layers,
    cityStats,
  } = state;

  const [selectedRoadId, setSelectedRoadId] = useState<string>('');
  const [incidentOption, setIncidentOption] = useState<IncidentCreatorOption>('congestion');

  const resolvedSelectedLocation = useMemo(() => {
    if (!selectableRoadLocations.length) return null;
    return (
      selectableRoadLocations.find((loc) => loc.roadId === selectedRoadId) ??
      selectableRoadLocations[0]
    );
  }, [selectableRoadLocations, selectedRoadId]);

  const summary = routeResult.trafficSummary;
  const totalSegments = Math.max(1, summary.totalSegmentsCount);
  const affectedSegmentsCount =
    summary.moderateSegmentsCount +
    summary.severeSegmentsCount +
    summary.blockedSegmentsCount;

  const normalPct = (summary.normalSegmentsCount / totalSegments) * 100;
  const moderatePct = (summary.moderateSegmentsCount / totalSegments) * 100;
  const severePct = (summary.severeSegmentsCount / totalSegments) * 100;
  const blockedPct = (summary.blockedSegmentsCount / totalSegments) * 100;

  const severityColor =
    summary.congestionSeverity === 'Severe'
      ? 'text-[#DC2626] dark:text-red-400'
      : summary.congestionSeverity === 'Moderate'
        ? 'text-[#D97706] dark:text-amber-300'
        : 'text-[#16A34A] dark:text-emerald-400';

  const handleTriggerIncident = () => {
    if (!resolvedSelectedLocation) return;
    if (incidentOption === 'volume') {
      addTrafficIncident({
        roadId: resolvedSelectedLocation.roadId,
        roadName: resolvedSelectedLocation.roadName,
        highway: resolvedSelectedLocation.highway,
        kind: 'congestion',
        centerX: resolvedSelectedLocation.centerX,
        centerZ: resolvedSelectedLocation.centerZ,
        volumeBoostPct: 20,
      });
    } else {
      addTrafficIncident({
        roadId: resolvedSelectedLocation.roadId,
        roadName: resolvedSelectedLocation.roadName,
        highway: resolvedSelectedLocation.highway,
        kind: incidentOption,
        centerX: resolvedSelectedLocation.centerX,
        centerZ: resolvedSelectedLocation.centerZ,
      });
    }
    focusScenePoint(
      resolvedSelectedLocation.centerX,
      resolvedSelectedLocation.centerZ,
      130
    );
  };

  const getIncidentTitle = (inc: SimulatedRoadIncident) => {
    if (inc.labelKey) return t(inc.labelKey);
    const kindLabel = t(`traffic.incidentKinds.${inc.kind}`);
    return `${kindLabel}: ${inc.roadName}`;
  };

  const getIncidentAccent = (inc: SimulatedRoadIncident) => {
    if (!inc.active) return 'text-[#64748B] dark:text-slate-400';
    if (inc.kind === 'closure') return 'text-[#DC2626] dark:text-rose-400';
    if (inc.kind === 'accident') return 'text-orange-600 dark:text-orange-400';
    if (inc.kind === 'construction') return 'text-[#D97706] dark:text-amber-300';
    return 'text-[#DC2626] dark:text-red-400';
  };

  const primaryCorridor = routeResult.routes[0] ?? null;
  const minUnit = t('routing.minUnit');
  const kmhUnit = t('routing.kmhUnit');
  const secUnit = t('traffic.secShort');

  return (
    <div className="space-y-4" data-testid="module-traffic">
      {/* 1. Playback, Status & 3D Density Layer Control */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
              <span className="truncate">{t('traffic.systemTitle')}</span>
            </h3>
            <p className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">
              {t('traffic.systemSubtitle', {
                signals: formatNumber(cityStats?.trafficLights ?? 0),
                vehicles: formatNumber(summary.activeVehiclesCount),
              })}
            </p>
          </div>
          <span
            data-testid="traffic-sim-status"
            className={`text-xs font-semibold shrink-0 whitespace-nowrap ${
              trafficStatus === 'running'
                ? 'text-[#16A34A] dark:text-emerald-400'
                : 'text-[#D97706] dark:text-amber-300'
            }`}
          >
            {t(`status.${trafficStatus}`)} · {t('common.simulated')}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {trafficStatus === 'running' ? (
            <button
              type="button"
              data-testid="traffic-pause-btn"
              onClick={() => setTrafficStatus('paused')}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium bg-amber-50 border border-amber-300 text-[#D97706] hover:bg-amber-100 dark:bg-orange-500/15 dark:border-orange-500/45 dark:text-orange-300 dark:hover:bg-orange-500/25 cursor-pointer whitespace-nowrap"
            >
              <Pause className="w-3.5 h-3.5 shrink-0" />
              <span>{t('common.pause')}</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="traffic-start-btn"
              onClick={() => setTrafficStatus('running')}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 shrink-0" />
              <span>{t('common.start')}</span>
            </button>
          )}

          <button
            type="button"
            data-testid="traffic-reset-btn"
            onClick={resetTrafficSimulation}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-200 dark:hover:text-white cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>{t('common.reset')}</span>
          </button>

          <button
            type="button"
            data-testid="traffic-density-layer-toggle"
            onClick={() => toggleLayer('trafficDensityOverlay')}
            aria-pressed={layers.trafficDensityOverlay}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
              layers.trafficDensityOverlay
                ? 'bg-emerald-50 border-emerald-300 text-[#16A34A] dark:bg-emerald-500/15 dark:border-emerald-500/45 dark:text-emerald-300'
                : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {layers.trafficDensityOverlay ? (
              <Eye className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate">{t('traffic.densityMapBtn')}</span>
          </button>
        </div>
      </section>

      {/* 2. Live Traffic Analysis KPIs (Explicitly Simulated) */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <span>{t('traffic.analysisTitle')}</span>
          </h3>
          <span className="text-[11px] text-[#64748B] dark:text-slate-400 whitespace-nowrap">
            {t('common.simulated')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('traffic.kpiDensity')}</p>
            <div className="flex items-baseline justify-between gap-2">
              <span
                data-testid="traffic-kpi-density"
                className="text-base font-semibold font-mono-tabular text-[#172033] dark:text-slate-100"
              >
                {formatNumber(summary.densityPct)}%
              </span>
              <span
                data-testid="traffic-kpi-severity"
                className={`text-[11px] font-semibold ${severityColor}`}
              >
                {t(`traffic.severityLevels.${summary.congestionSeverity}`)}
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('traffic.kpiAvgSpeed')}</p>
            <div className="flex items-baseline justify-between gap-2">
              <span
                data-testid="traffic-kpi-speed"
                className="text-base font-semibold font-mono-tabular text-[#0891B2] dark:text-cyan-300"
              >
                {formatDecimal(summary.avgSpeedKmh, 1)} {kmhUnit}
              </span>
              <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
                {formatNumber(summary.activeVehiclesCount)} {t('traffic.vehShort')}
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('traffic.kpiTravelTime')}</p>
            <div className="flex items-baseline justify-between gap-2">
              <span
                data-testid="traffic-kpi-travel-time"
                className="text-base font-semibold font-mono-tabular text-[#172033] dark:text-slate-100"
              >
                {formatDecimal(
                  primaryCorridor?.estimatedSimMinutes ?? summary.avgTravelTimeMin,
                  1
                )}{' '}
                {minUnit}
              </span>
              <span className="text-[11px] font-mono-tabular text-[#D97706] dark:text-amber-300">
                +{formatDecimal(summary.signalDelayPerIntersectionSec, 1)}
                {secUnit} {t('traffic.signalShort')}
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800/90 p-2.5 space-y-0.5">
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('traffic.kpiAffectedSegments')}
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <span
                data-testid="traffic-kpi-affected"
                className="text-base font-semibold font-mono-tabular text-[#D97706] dark:text-orange-300"
              >
                {formatNumber(affectedSegmentsCount)}
              </span>
              <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
                / {formatNumber(summary.totalSegmentsCount)}
              </span>
            </div>
          </div>
        </div>

        {/* Road Segment Density Distribution Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t('traffic.segmentDistribution')}
            </span>
            <span className="text-[#64748B] dark:text-slate-400 font-mono-tabular">
              {t('overview.passablePct', {
                pct: formatNumber(routeResult.passableNetworkPct),
              })}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-sm overflow-hidden bg-slate-200 dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-800 flex">
            {normalPct > 0 && (
              <div
                style={{ width: `${normalPct}%` }}
                className="bg-emerald-500 transition-all"
                title={t('traffic.tierNormal')}
              />
            )}
            {moderatePct > 0 && (
              <div
                style={{ width: `${moderatePct}%` }}
                className="bg-amber-500 transition-all"
                title={t('traffic.tierModerate')}
              />
            )}
            {severePct > 0 && (
              <div
                style={{ width: `${severePct}%` }}
                className="bg-red-500 transition-all"
                title={t('traffic.tierSevere')}
              />
            )}
            {blockedPct > 0 && (
              <div
                style={{ width: `${blockedPct}%` }}
                className="bg-rose-600 transition-all"
                title={t('traffic.tierBlocked')}
              />
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 shrink-0" />
              <span className="truncate">{t('traffic.tierNormal')}</span>
              <span className="font-mono-tabular text-[#64748B] dark:text-slate-400 ml-auto">
                {formatNumber(summary.normalSegmentsCount)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 shrink-0" />
              <span className="truncate">{t('traffic.tierModerate')}</span>
              <span className="font-mono-tabular text-[#64748B] dark:text-slate-400 ml-auto">
                {formatNumber(summary.moderateSegmentsCount)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-xs bg-red-500 shrink-0" />
              <span className="truncate">{t('traffic.tierSevere')}</span>
              <span className="font-mono-tabular text-[#64748B] dark:text-slate-400 ml-auto">
                {formatNumber(summary.severeSegmentsCount)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-600 shrink-0" />
              <span className="truncate">{t('traffic.tierBlocked')}</span>
              <span className="font-mono-tabular text-[#64748B] dark:text-slate-400 ml-auto">
                {formatNumber(summary.blockedSegmentsCount)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Traffic Volume & Traffic Light Signal Timing */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3.5">
        {/* Traffic Volume */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#172033] dark:text-slate-100">
              {t('traffic.volumeTitle')}
            </span>
            <span className="font-mono-tabular text-[#0891B2] dark:text-cyan-300 font-semibold">
              {formatNumber(trafficCongestionPct)}%
            </span>
          </div>
          <input
            type="range"
            data-testid="traffic-volume-slider"
            aria-label={t('traffic.volumeAria')}
            min={0}
            max={100}
            step={2}
            value={trafficCongestionPct}
            onChange={(e) => setTrafficCongestion(Number(e.target.value))}
            className="w-full ug-slider cursor-pointer"
          />
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { key: 'free', pct: 18 },
              { key: 'moderate', pct: 46 },
              { key: 'peak', pct: 72 },
              { key: 'heavy', pct: 90 },
            ].map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setTrafficCongestion(preset.pct)}
                className={`py-1 px-1.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap truncate ${
                  Math.abs(trafficCongestionPct - preset.pct) <= 4
                    ? 'bg-cyan-50 border-cyan-300 text-[#0891B2] dark:bg-cyan-500/20 dark:border-cyan-500/45 dark:text-cyan-300'
                    : 'bg-[#F8FAFC] border-[#CBD5E1] text-slate-700 hover:border-slate-400 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {t(`traffic.volumePresets.${preset.key}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Traffic Light Timing */}
        <div className="pt-3 border-t border-[#E2E8F0] dark:border-slate-800/80 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400 shrink-0" />
              <span>{t('traffic.signalTimingTitle')}</span>
            </h4>
            <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400 whitespace-nowrap">
              {t('traffic.cycleSummary', {
                cycle: formatNumber(summary.signalCycleSeconds),
                delay: formatDecimal(summary.signalDelayPerIntersectionSec, 1),
              })}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[
              { key: 'balanced', g: 12, y: 3, r: 12 },
              { key: 'greenWave', g: 22, y: 3, r: 8 },
              { key: 'bottleneck', g: 8, y: 3, r: 22 },
            ].map((sp) => {
              const active =
                trafficLightTiming.greenSeconds === sp.g &&
                trafficLightTiming.yellowSeconds === sp.y &&
                trafficLightTiming.redSeconds === sp.r;
              return (
                <button
                  key={sp.key}
                  type="button"
                  data-testid={`signal-preset-${sp.key}`}
                  onClick={() =>
                    setTrafficLightTiming({
                      greenSeconds: sp.g,
                      yellowSeconds: sp.y,
                      redSeconds: sp.r,
                    })
                  }
                  className={`py-1.5 px-2 rounded-md text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap truncate ${
                    active
                      ? 'bg-amber-50 border-amber-300 text-[#D97706] dark:bg-amber-500/20 dark:border-amber-500/45 dark:text-amber-200'
                      : 'bg-[#F8FAFC] border-[#CBD5E1] text-slate-700 hover:border-slate-400 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {t(`traffic.signalPresets.${sp.key}`)}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <label className="block space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#16A34A] dark:text-emerald-400 font-medium">
                  {t('traffic.greenPhase')}
                </span>
                <span className="font-mono-tabular text-[#172033] dark:text-slate-200">
                  {formatNumber(trafficLightTiming.greenSeconds)}
                  {secUnit}
                </span>
              </div>
              <input
                type="range"
                data-testid="signal-green-slider"
                aria-label={t('traffic.greenPhase')}
                min={6}
                max={45}
                step={1}
                value={trafficLightTiming.greenSeconds}
                onChange={(e) =>
                  setTrafficLightTiming({ greenSeconds: Number(e.target.value) })
                }
                className="w-full ug-slider cursor-pointer"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#D97706] dark:text-amber-300 font-medium">
                  {t('traffic.yellowPhase')}
                </span>
                <span className="font-mono-tabular text-[#172033] dark:text-slate-200">
                  {formatNumber(trafficLightTiming.yellowSeconds)}
                  {secUnit}
                </span>
              </div>
              <input
                type="range"
                data-testid="signal-yellow-slider"
                aria-label={t('traffic.yellowPhase')}
                min={2}
                max={8}
                step={1}
                value={trafficLightTiming.yellowSeconds}
                onChange={(e) =>
                  setTrafficLightTiming({ yellowSeconds: Number(e.target.value) })
                }
                className="w-full ug-slider cursor-pointer"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#DC2626] dark:text-rose-400 font-medium">
                  {t('traffic.redPhase')}
                </span>
                <span className="font-mono-tabular text-[#172033] dark:text-slate-200">
                  {formatNumber(trafficLightTiming.redSeconds)}
                  {secUnit}
                </span>
              </div>
              <input
                type="range"
                data-testid="signal-red-slider"
                aria-label={t('traffic.redPhase')}
                min={6}
                max={45}
                step={1}
                value={trafficLightTiming.redSeconds}
                onChange={(e) =>
                  setTrafficLightTiming({ redSeconds: Number(e.target.value) })
                }
                className="w-full ug-slider cursor-pointer"
              />
            </label>
          </div>
        </div>
      </section>

      {/* 4. Traffic Incident Simulator & Road Closure Controls */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
            <Construction className="w-3.5 h-3.5 text-[#D97706] dark:text-orange-400 shrink-0" />
            <span>{t('traffic.incidentSimulatorTitle')}</span>
          </h3>
          <span className="text-[11px] text-[#64748B] dark:text-slate-400">
            {t('routing.clickRoadHint')}
          </span>
        </div>

        {/* Location Picker */}
        <div className="space-y-1.5">
          <label
            htmlFor="traffic-location-select"
            className="block text-[11px] text-[#64748B] dark:text-slate-400"
          >
            {t('traffic.selectLocationLabel')}
          </label>
          <div className="flex items-center gap-1.5">
            <select
              id="traffic-location-select"
              data-testid="traffic-incident-location"
              value={resolvedSelectedLocation?.roadId ?? ''}
              onChange={(e) => setSelectedRoadId(e.target.value)}
              className="flex-1 min-w-0 rounded-lg bg-white border border-[#CBD5E1] px-2.5 py-1.5 text-xs text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-100 focus:outline-none focus:border-[#0891B2] dark:focus:border-cyan-500"
            >
              {selectableRoadLocations.map((loc) => (
                <option key={loc.roadId} value={loc.roadId}>
                  {loc.roadName} ({loc.highway})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                resolvedSelectedLocation &&
                focusScenePoint(
                  resolvedSelectedLocation.centerX,
                  resolvedSelectedLocation.centerZ,
                  125
                )
              }
              disabled={!resolvedSelectedLocation}
              title={t('traffic.locateSelectedRoadTitle')}
              className="p-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700/80 dark:text-cyan-300 dark:hover:border-cyan-500/50 cursor-pointer disabled:opacity-50"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 5 Incident Type Options */}
        <div className="space-y-1.5">
          <span className="block text-[11px] text-[#64748B] dark:text-slate-400">
            {t('traffic.incidentTypeLabel')}
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {(
              [
                'congestion',
                'accident',
                'closure',
                'construction',
                'volume',
              ] as IncidentCreatorOption[]
            ).map((opt) => (
              <button
                key={opt}
                type="button"
                data-testid={`incident-kind-${opt}`}
                onClick={() => setIncidentOption(opt)}
                className={`py-1.5 px-2 rounded-md text-[11px] font-medium border text-left transition-colors cursor-pointer truncate ${
                  incidentOption === opt
                    ? 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-500/20 dark:border-orange-500/50 dark:text-orange-200'
                    : 'bg-[#F8FAFC] border-[#CBD5E1] text-slate-700 hover:border-slate-400 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {t(`traffic.incidentOptions.${opt}`)}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          data-testid="trigger-traffic-incident-btn"
          onClick={handleTriggerIncident}
          disabled={!resolvedSelectedLocation}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-[#D97706] text-white hover:bg-amber-700 dark:bg-orange-500 dark:text-slate-950 dark:hover:bg-orange-400 disabled:opacity-50 cursor-pointer transition-colors"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>{t('traffic.triggerIncidentBtn')}</span>
        </button>

        {/* Active & Preset Incidents List */}
        <div className="pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-[#172033] dark:text-slate-200 flex items-center gap-1.5">
              <TrafficCone className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400" />
              <span>{t('traffic.activeIncidentsListTitle')}</span>
            </span>
            <span className="font-mono-tabular text-[#64748B] dark:text-slate-400">
              {formatNumber(roadIncidents.filter((x) => x.active).length)} /{' '}
              {formatNumber(roadIncidents.length)} {t('common.active')}
            </span>
          </div>

          <div className="divide-y divide-[#E2E8F0] dark:divide-slate-800/80 rounded-lg bg-[#F8FAFC] dark:bg-slate-900/60 border border-[#E2E8F0] dark:border-slate-800 overflow-hidden">
            {roadIncidents.map((inc) => (
              <div
                key={inc.id}
                data-testid={`traffic-incident-row-${inc.id}`}
                className="px-2.5 py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {inc.kind === 'closure' ? (
                      <ShieldAlert className={`w-3.5 h-3.5 shrink-0 ${getIncidentAccent(inc)}`} />
                    ) : inc.kind === 'construction' ? (
                      <Construction className={`w-3.5 h-3.5 shrink-0 ${getIncidentAccent(inc)}`} />
                    ) : (
                      <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${getIncidentAccent(inc)}`} />
                    )}
                    <span className="text-xs font-medium text-[#172033] dark:text-slate-100 truncate">
                      {getIncidentTitle(inc)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">
                    {inc.roadName} · {inc.highway} ·{' '}
                    <span className={inc.active ? getIncidentAccent(inc) : 'text-slate-500'}>
                      {!inc.active
                        ? t('routing.statusCleared')
                        : inc.blocksRoad
                          ? t('routing.statusBlocked')
                          : t('routing.statusSlowdown')}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => focusScenePoint(inc.centerX, inc.centerZ, 120)}
                    title={t('routing.locateIncidentTitle')}
                    className="p-1.5 rounded-md bg-white border border-[#CBD5E1] text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-950/70 dark:border-slate-800 dark:text-cyan-300 dark:hover:border-cyan-500/50 cursor-pointer"
                  >
                    <Crosshair className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleRoadIncident(inc.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer whitespace-nowrap ${
                      inc.active
                        ? 'bg-emerald-50 border-emerald-300 text-[#16A34A] hover:bg-emerald-100 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/25'
                        : 'bg-amber-50 border-amber-300 text-[#D97706] hover:bg-amber-100 dark:bg-orange-500/15 dark:border-orange-500/40 dark:text-orange-300 dark:hover:bg-orange-500/25'
                    }`}
                  >
                    {inc.active
                      ? inc.blocksRoad
                        ? t('inspector.reopenRoad')
                        : t('common.clear')
                      : inc.blocksRoad
                        ? t('inspector.closeRoad')
                        : t('common.active')}
                  </button>
                  {inc.source === 'user' && (
                    <button
                      type="button"
                      onClick={() => removeRoadIncident(inc.id)}
                      title={t('routing.removeIncidentTitle')}
                      className="p-1.5 rounded-md bg-white border border-[#CBD5E1] text-[#DC2626] hover:border-rose-400 dark:bg-slate-950/70 dark:border-slate-800 dark:text-rose-300 dark:hover:border-rose-500/50 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Cross-Module Integration Links */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSection('routing')}
          className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium bg-[#F8FAFC] border border-[#CBD5E1] text-[#16A34A] hover:border-emerald-400 dark:bg-slate-900 dark:border-slate-800 dark:text-emerald-300 dark:hover:border-emerald-500/45 cursor-pointer whitespace-nowrap"
        >
          <RouteIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{t('traffic.inspectRoutingBtn')}</span>
        </button>
        <button
          type="button"
          onClick={() => setSection('assistant')}
          className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium bg-[#F8FAFC] border border-[#CBD5E1] text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-800 dark:text-cyan-300 dark:hover:border-cyan-500/45 cursor-pointer whitespace-nowrap"
        >
          <Bot className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{t('traffic.askAiTrafficBtn')}</span>
        </button>
      </section>
    </div>
  );
}
