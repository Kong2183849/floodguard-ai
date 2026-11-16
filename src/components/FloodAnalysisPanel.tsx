import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Crosshair,
  Droplets,
  Eye,
  EyeOff,
  Gauge,
  Info,
  Landmark,
  MapPin,
  Search,
  Sliders,
  TrafficCone,
  Trees,
  Waves,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTranslation } from '../i18n';
import {
  localizeAffectedAreaLabel,
  localizeFloodCauseDesc,
  localizeFloodCauseLabel,
  localizeFloodDataNotes,
  localizeRiskLevel,
} from '../i18n/domainLabels';
import type {
  AffectedObjectRecord,
  ImpactRiskLevel,
  ImpactTargetType,
} from '../types/city';

const RISK_BADGE_CLASSES: Record<ImpactRiskLevel, string> = {
  Low: 'bg-amber-50 text-[#D97706] border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/35',
  Medium: 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/35',
  High: 'bg-red-50 text-[#DC2626] border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/35',
  Critical: 'bg-rose-50 text-[#DC2626] border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/45',
};

const CAUSE_BAR_COLORS: Record<ImpactRiskLevel, string> = {
  Low: 'bg-sky-500 dark:bg-sky-400',
  Medium: 'bg-amber-500 dark:bg-amber-400',
  High: 'bg-orange-500',
  Critical: 'bg-rose-500',
};

export function FloodAnalysisPanel() {
  const {
    state,
    activeArea,
    impactAnalysis,
    metrics,
    setSection,
    setAffectedArea,
    selectImpactObject,
    toggleLayer,
  } = useSimulation();
  const {
    settings,
    layers,
    cityStatus,
    cityError,
    selectedImpactObject,
    affectedAreas,
  } = state;

  const { t, formatNumber, formatDecimal } = useTranslation();

  const [targetFilter, setTargetFilter] = useState<'all' | ImpactTargetType>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | ImpactRiskLevel>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRulesNote, setShowRulesNote] = useState(false);

  const metersUnit = t('common.metersUnit');
  const km2Unit = t('common.km2Unit');
  const m3Unit = t('common.m3Unit');
  const localizedDataNotes = localizeFloodDataNotes(t);
  const localizedAreaLabel = localizeAffectedAreaLabel(activeArea, t);
  const { accumulation } = impactAnalysis;

  const filteredImpactItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return impactAnalysis.items.filter((item) => {
      if (targetFilter !== 'all' && item.targetType !== targetFilter) return false;
      if (riskFilter !== 'all' && item.riskLevel !== riskFilter) return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.subType.toLowerCase().includes(q) &&
        !item.id.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [impactAnalysis.items, targetFilter, riskFilter, searchQuery]);

  const handleLocate = (item: AffectedObjectRecord) => {
    selectImpactObject(item);
  };

  const handleFocusHotspotZone = (areaId: string) => {
    setAffectedArea(areaId);
  };

  const formatVolume = (volM3: number): string => {
    if (volM3 >= 1_000_000) {
      return `${formatDecimal(volM3 / 1_000_000, 2)}M ${m3Unit}`;
    }
    if (volM3 >= 1_000) {
      return `${formatDecimal(volM3 / 1_000, 1)}k ${m3Unit}`;
    }
    return `${formatNumber(volM3)} ${m3Unit}`;
  };

  return (
    <div className="space-y-3" data-testid="module-flood">
      {/* Top Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[#64748B] dark:text-slate-400">
          {localizedAreaLabel} · {t('flood.selectHint')}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggleLayer('impactOverlay')}
            aria-pressed={layers.impactOverlay}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
              layers.impactOverlay
                ? 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-500/15 dark:border-orange-500/40 dark:text-orange-300'
                : 'bg-white border-[#CBD5E1] text-[#64748B] hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {layers.impactOverlay ? (
              <Eye className="w-3.5 h-3.5" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
            <span>{t('flood.impact3d')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRulesNote((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-white border border-[#CBD5E1] text-slate-700 hover:text-[#172033] dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-white cursor-pointer whitespace-nowrap"
            title={t('flood.rulesTitleTooltip')}
          >
            <Info className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400" />
            <span>{t('flood.rules')}</span>
          </button>
        </div>
      </div>

      {/* Flood Analysis KPI Grid (Water Level, Area, Volume, Drainage, Major Cause) */}
      <div
        data-testid="flood-analysis-kpis"
        className="grid grid-cols-2 gap-2"
      >
        <div className="rounded-lg bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none px-3 py-2.5 space-y-0.5">
          <div className="flex items-center justify-between gap-1 text-[11px] text-[#64748B] dark:text-slate-400">
            <span>{t('flood.kpiWaterLevel')}</span>
            <Waves className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
          </div>
          <div
            data-testid="flood-kpi-water-level"
            className="text-base font-bold font-mono-tabular text-[#0891B2] dark:text-cyan-300"
          >
            {formatDecimal(metrics.floodLevelMeters, 2)} {metersUnit}
          </div>
          <div className="text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {t('flood.kpiPeakMean', {
              peak: formatDecimal(accumulation.peakDepthMeters, 2),
              mean: formatDecimal(accumulation.meanDepthMeters, 2),
              unit: metersUnit,
            })}
          </div>
        </div>

        <div className="rounded-lg bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none px-3 py-2.5 space-y-0.5">
          <div className="flex items-center justify-between gap-1 text-[11px] text-[#64748B] dark:text-slate-400">
            <span>{t('flood.kpiFloodedArea')}</span>
            <Droplets className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          </div>
          <div
            data-testid="flood-kpi-area"
            className="text-base font-bold font-mono-tabular text-sky-700 dark:text-sky-300"
          >
            {formatDecimal(accumulation.floodedAreaKm2, 2)} {km2Unit}{' '}
            <span className="text-xs font-normal text-[#64748B] dark:text-slate-400">
              ({formatDecimal(accumulation.floodedAreaPct, 1)}%)
            </span>
          </div>
          <div className="text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {t('flood.kpiHighAccumVolume', {
              highKm2: formatDecimal(accumulation.highAccumulationAreaKm2, 2),
              vol: formatVolume(accumulation.estimatedVolumeM3),
            })}
          </div>
        </div>

        <div className="rounded-lg bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none px-3 py-2.5 space-y-0.5">
          <div className="flex items-center justify-between gap-1 text-[11px] text-[#64748B] dark:text-slate-400">
            <span>{t('flood.kpiDrainageEff')}</span>
            <Gauge className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400 shrink-0" />
          </div>
          <div
            data-testid="flood-kpi-drainage"
            className={`text-base font-bold font-mono-tabular ${
              accumulation.effectiveDrainagePct <= 40
                ? 'text-[#DC2626] dark:text-red-400'
                : accumulation.effectiveDrainagePct <= 65
                  ? 'text-[#D97706] dark:text-orange-300'
                  : 'text-[#16A34A] dark:text-emerald-300'
            }`}
          >
            {formatNumber(accumulation.effectiveDrainagePct)}%
          </div>
          <div className="text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {t('flood.kpiDrainageBreakdown', {
              cap: formatNumber(settings.drainageCapacityPct),
              block: formatNumber(settings.drainageBlockagePct),
            })}
          </div>
        </div>

        <div className="rounded-lg bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none px-3 py-2.5 space-y-0.5">
          <div className="flex items-center justify-between gap-1 text-[11px] text-[#64748B] dark:text-slate-400">
            <span>{t('flood.kpiMajorCause')}</span>
            <Sliders className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400 shrink-0" />
          </div>
          <div
            data-testid="flood-kpi-major-cause"
            className="text-xs font-semibold text-[#D97706] dark:text-amber-300 leading-tight pt-0.5 truncate"
            title={
              accumulation.majorCauseId
                ? localizeFloodCauseLabel(accumulation.majorCauseId, t)
                : t('flood.noActiveCause')
            }
          >
            {accumulation.majorCauseId
              ? localizeFloodCauseLabel(accumulation.majorCauseId, t)
              : t('flood.noActiveCause')}
          </div>
          <div className="text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {t('flood.kpiRainCanal', {
              rain: formatNumber(settings.rainfallMmHr),
              canal: formatNumber(settings.canalWaterLevelPct),
            })}
          </div>
        </div>
      </div>

      {/* Flood Cause Attribution & Water Accumulation Factors */}
      <section
        data-testid="flood-cause-breakdown"
        className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3 space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
              {t('flood.causesHeading')}
            </h3>
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('flood.causesSubheading')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSection('simulation')}
            className="text-[11px] font-medium text-[#0891B2] hover:text-[#0e7490] dark:text-cyan-400 dark:hover:text-cyan-300 cursor-pointer whitespace-nowrap shrink-0"
          >
            {t('flood.tuneCauses')}
          </button>
        </div>

        <div className="space-y-2">
          {accumulation.causes.map((cause) => (
            <div key={cause.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-[#172033] dark:text-slate-200 truncate">
                  {localizeFloodCauseLabel(cause.id, t)}
                </span>
                <span className="font-mono-tabular text-slate-700 dark:text-slate-300 shrink-0">
                  {formatNumber(cause.contributionPct)}%{' '}
                  <span className="text-[#64748B] dark:text-slate-500">
                    · {localizeRiskLevel(cause.severity, t)}
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-sm bg-slate-200 dark:bg-slate-900 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${CAUSE_BAR_COLORS[cause.severity]}`}
                  style={{ width: `${Math.min(100, Math.max(2, cause.contributionPct))}%` }}
                />
              </div>
              <p className="text-[10px] text-[#64748B] dark:text-slate-400 leading-snug">
                {localizeFloodCauseDesc(cause.id, t)}
              </p>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-[#64748B] dark:text-slate-400 pt-1.5 border-t border-[#E2E8F0] dark:border-slate-800/80 leading-snug">
          {t('flood.simulatedModelHonesty')}
        </p>
      </section>

      {/* High Water Accumulation Sub-Zones (Chatuchak GeoJSON) */}
      {accumulation.hotspots.length > 0 && (
        <section
          data-testid="flood-accumulation-hotspots"
          className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {t('flood.hotspotsHeading')}
              </h3>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                {t('flood.hotspotsSubheading')}
              </p>
            </div>
            {settings.affectedAreaId !== 'all-district' && (
              <button
                type="button"
                onClick={() => setAffectedArea('all-district')}
                className="text-[11px] text-[#0891B2] hover:text-[#0e7490] dark:text-cyan-400 dark:hover:text-cyan-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                {t('flood.allDistrictBtn')}
              </button>
            )}
          </div>

          <div className="divide-y divide-[#E2E8F0] dark:divide-slate-800/70 rounded-lg border border-[#E2E8F0] dark:border-slate-800/80 bg-[#F8FAFC] dark:bg-slate-900/50 overflow-hidden">
            {accumulation.hotspots.slice(0, 5).map((zone) => {
              const areaRef = affectedAreas.find((a) => a.id === zone.areaId);
              const zoneLabel = areaRef
                ? localizeAffectedAreaLabel(areaRef, t)
                : zone.label;
              const isFocused = settings.affectedAreaId === zone.areaId;
              return (
                <button
                  key={zone.areaId}
                  type="button"
                  onClick={() => handleFocusHotspotZone(zone.areaId)}
                  className={`w-full text-left px-2.5 py-2 transition-colors cursor-pointer space-y-1 ${
                    isFocused
                      ? 'bg-cyan-50 dark:bg-cyan-500/12'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-[#172033] dark:text-slate-100 flex items-center gap-1.5 truncate">
                      <MapPin className="w-3 h-3 text-[#0891B2] dark:text-cyan-400 shrink-0" />
                      <span className="truncate">{zoneLabel}</span>
                    </span>
                    <span className="font-mono-tabular text-[11px] font-semibold text-sky-700 dark:text-sky-300 shrink-0">
                      {formatDecimal(zone.peakDepthMeters, 2)} {metersUnit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-[#64748B] dark:text-slate-400">
                    <span className="truncate">
                      {localizeFloodCauseLabel(zone.primaryCauseId, t)}
                    </span>
                    <span className="font-mono-tabular shrink-0">
                      {formatDecimal(zone.floodedSharePct, 0)}% {t('flood.floodedShort')} ·{' '}
                      {formatNumber(zone.affectedObjectsCount)} {t('flood.objShort')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Category Impact Counters (2x2 for 35% Panel) */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white dark:bg-slate-900/80 border border-[#E2E8F0] dark:border-slate-800 shadow-2xs dark:shadow-none px-3 py-2 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#64748B] dark:text-slate-400 block">
              {t('flood.affectedRoads')}
            </span>
            <span
              data-testid="impact-roads-count"
              className="text-base font-bold font-mono-tabular text-[#172033] dark:text-slate-100"
            >
              {formatNumber(impactAnalysis.affectedRoadsCount)}
            </span>
            <span className="text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400 ml-1">
              / {formatNumber(impactAnalysis.totalRoadsCount)}
            </span>
          </div>
          <TrafficCone className="w-4 h-4 text-[#D97706] dark:text-orange-400 shrink-0" />
        </div>

        <div className="rounded-lg bg-white dark:bg-slate-900/80 border border-[#E2E8F0] dark:border-slate-800 shadow-2xs dark:shadow-none px-3 py-2 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#64748B] dark:text-slate-400 block">
              {t('flood.affectedBuildings')}
            </span>
            <span
              data-testid="impact-buildings-count"
              className="text-base font-bold font-mono-tabular text-[#172033] dark:text-slate-100"
            >
              {formatNumber(impactAnalysis.affectedBuildingsCount)}
            </span>
            <span className="text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400 ml-1">
              / {formatNumber(impactAnalysis.totalBuildingsCount)}
            </span>
          </div>
          <Building2 className="w-4 h-4 text-[#D97706] dark:text-amber-400 shrink-0" />
        </div>

        <div className="rounded-lg bg-white dark:bg-slate-900/80 border border-[#E2E8F0] dark:border-slate-800 shadow-2xs dark:shadow-none px-3 py-2 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#64748B] dark:text-slate-400 block">
              {t('flood.stationsFacilities')}
            </span>
            <span
              data-testid="impact-facilities-count"
              className="text-base font-bold font-mono-tabular text-[#172033] dark:text-slate-100"
            >
              {formatNumber(impactAnalysis.affectedFacilitiesCount)}
            </span>
            <span className="text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400 ml-1">
              / {formatNumber(impactAnalysis.totalFacilitiesCount)}
            </span>
          </div>
          <Landmark className="w-4 h-4 text-[#0891B2] dark:text-cyan-400 shrink-0" />
        </div>

        <div className="rounded-lg bg-white dark:bg-slate-900/80 border border-[#E2E8F0] dark:border-slate-800 shadow-2xs dark:shadow-none px-3 py-2 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#64748B] dark:text-slate-400 block">
              {t('flood.parksBasins')}
            </span>
            <span
              data-testid="impact-parks-count"
              className="text-base font-bold font-mono-tabular text-[#172033] dark:text-slate-100"
            >
              {formatNumber(impactAnalysis.affectedParksCount)}
            </span>
            <span className="text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400 ml-1">
              / {formatNumber(impactAnalysis.totalParksCount)}
            </span>
          </div>
          <Trees className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
        </div>
      </div>

      {/* Filter & Risk Controls */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              [
                'all',
                t('flood.filterCount', {
                  label: t('common.all'),
                  count: formatNumber(impactAnalysis.items.length),
                }),
              ],
              [
                'road',
                t('flood.filterCount', {
                  label: t('targetTypes.roads'),
                  count: formatNumber(impactAnalysis.affectedRoadsCount),
                }),
              ],
              [
                'building',
                t('flood.filterCount', {
                  label: t('targetTypes.buildings'),
                  count: formatNumber(impactAnalysis.affectedBuildingsCount),
                }),
              ],
              [
                'facility',
                t('flood.filterCount', {
                  label: t('targetTypes.facilities'),
                  count: formatNumber(impactAnalysis.affectedFacilitiesCount),
                }),
              ],
              [
                'park',
                t('flood.filterCount', {
                  label: t('targetTypes.parks'),
                  count: formatNumber(impactAnalysis.affectedParksCount),
                }),
              ],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTargetFilter(key)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                targetFilter === key
                  ? 'bg-cyan-50 border-cyan-300 text-[#0891B2] dark:bg-cyan-500/20 dark:border-cyan-500/45 dark:text-cyan-300'
                  : 'bg-white border-[#CBD5E1] text-slate-700 hover:text-[#172033] dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            {(['Critical', 'High', 'Medium', 'Low'] as ImpactRiskLevel[]).map((rk) => {
              const active = riskFilter === rk;
              const riskText = localizeRiskLevel(rk, t);
              return (
                <button
                  key={rk}
                  type="button"
                  onClick={() => setRiskFilter(active ? 'all' : rk)}
                  className={`px-2 py-0.5 rounded border font-mono-tabular cursor-pointer transition-opacity whitespace-nowrap ${
                    RISK_BADGE_CLASSES[rk]
                  } ${riskFilter !== 'all' && !active ? 'opacity-45' : ''}`}
                  title={t('flood.riskFilterTitle', { risk: riskText })}
                >
                  {riskText}: {formatNumber(impactAnalysis.byRisk[rk])}
                </button>
              );
            })}
          </div>

          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('flood.searchPlaceholder')}
              className="w-full pl-7 pr-2.5 py-1 rounded-md bg-white border border-[#CBD5E1] text-xs text-[#172033] placeholder:text-slate-400 dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-100 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#0891B2] dark:focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {showRulesNote && (
        <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/90 border border-[#CBD5E1] dark:border-slate-700/80 p-3 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
          <p className="font-semibold text-[#172033] dark:text-slate-100">
            {t('flood.rulesHeading')}
          </p>
          {localizedDataNotes.map((note) => (
            <p key={note} className="text-[#64748B] dark:text-slate-400">
              • {note}
            </p>
          ))}
          <p className="text-[#64748B] dark:text-slate-400">• {t('flood.thresholdNote')}</p>
        </div>
      )}

      {/* Interactive Affected Geographic Objects List */}
      {cityStatus === 'error' ? (
        <div className="rounded-lg bg-rose-50 border border-rose-300 text-[#DC2626] dark:bg-red-950/35 dark:border-red-500/45 dark:text-red-200 px-4 py-5 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#DC2626] dark:text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-[#DC2626] dark:text-red-300">
              {t('flood.datasetUnavailable')}
            </p>
            <p className="text-slate-700 dark:text-slate-300">
              {cityError || t('flood.datasetFailed')}
            </p>
          </div>
        </div>
      ) : filteredImpactItems.length === 0 ? (
        <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] dark:bg-slate-900/60 dark:border-slate-800 px-4 py-6 text-center text-xs dark:text-slate-400">
          {impactAnalysis.items.length === 0
            ? t('flood.noFeaturesIntersect', {
                depth: formatDecimal(metrics.floodLevelMeters, 2),
                severity: formatNumber(settings.floodSeverity),
              })
            : t('flood.noFilterMatch')}
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto rounded-lg border border-[#E2E8F0] dark:border-slate-800/80 bg-white dark:bg-transparent">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[#F8FAFC] dark:bg-[#08101e] z-10">
              <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                <th className="py-2 px-2.5 font-medium">{t('flood.colObject')}</th>
                <th className="py-2 px-1.5 font-medium text-right">{t('flood.colDepth')}</th>
                <th className="py-2 px-1.5 font-medium">{t('flood.colRisk')}</th>
                <th className="py-2 px-2.5 font-medium text-right">{t('flood.col3d')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800/70">
              {filteredImpactItems.slice(0, 100).map((item) => {
                const isSelected = selectedImpactObject?.id === item.id;
                return (
                  <tr
                    key={`${item.targetType}-${item.id}`}
                    onClick={() => handleLocate(item)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-cyan-50 dark:bg-cyan-500/12'
                        : 'hover:bg-[#F8FAFC] dark:hover:bg-slate-900/70'
                    }`}
                  >
                    <td className="py-2 px-2.5 max-w-[190px]">
                      <div className="font-medium text-[#172033] dark:text-slate-100 truncate">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-[#64748B] dark:text-slate-400 truncate">
                        {t(`targetTypes.${item.targetType}`)} · {item.subType}
                      </div>
                    </td>
                    <td className="py-2 px-1.5 text-right font-mono-tabular text-[#172033] dark:text-slate-200 whitespace-nowrap">
                      {formatDecimal(item.estimatedDepthMeters, 2)} {metersUnit}
                    </td>
                    <td className="py-2 px-1.5">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ${
                          RISK_BADGE_CLASSES[item.riskLevel]
                        }`}
                      >
                        {localizeRiskLevel(item.riskLevel, t)}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLocate(item);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#F8FAFC] border border-[#CBD5E1] text-[11px] font-medium text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700 dark:text-cyan-300 dark:hover:border-cyan-400 cursor-pointer whitespace-nowrap"
                      >
                        <Crosshair className="w-3 h-3" />
                        <span>{t('common.locate')}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredImpactItems.length > 100 && (
            <div className="px-3 py-1.5 text-[11px] text-[#64748B] dark:text-slate-400 bg-[#F8FAFC] dark:bg-slate-900/80 border-t border-[#E2E8F0] dark:border-slate-800">
              {t('flood.showingTop100', {
                total: formatNumber(filteredImpactItems.length),
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
