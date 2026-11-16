import {
  Ban,
  Building2,
  Construction,
  Crosshair,
  Gauge,
  Landmark,
  MapPin,
  Route as RouteIcon,
  TrafficCone,
  Trees,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTranslation } from '../i18n';
import { localizeRiskLevel } from '../i18n/domainLabels';
import type { ImpactRiskLevel, RoadIncidentKind } from '../types/city';

const RISK_TEXT_STYLE: Record<ImpactRiskLevel, string> = {
  Low: 'text-[#D97706] dark:text-amber-300',
  Medium: 'text-orange-600 dark:text-orange-400',
  High: 'text-[#DC2626] dark:text-red-400',
  Critical: 'text-[#DC2626] dark:text-rose-400',
};

export function SelectedFeatureInspector() {
  const {
    state,
    impactAnalysis,
    allWaypoints,
    clearSelection,
    selectImpactObject,
    setCustomWaypointRole,
    toggleCustomRoadIncident,
  } = useSimulation();
  const { t, language, formatDecimal } = useTranslation();
  const unitM = language === 'th' ? 'ม.' : 'm';

  const {
    selectedBuilding,
    selectedRoad,
    selectedPlace,
    selectedImpactObject,
    impactCatalog,
    roadGraph,
    roadIncidents,
  } = state;

  if (!selectedBuilding && !selectedRoad && !selectedImpactObject && !selectedPlace) {
    return null;
  }

  const liveImpactMatch = selectedImpactObject
    ? impactAnalysis.items.find((x) => x.id === selectedImpactObject.id) ??
      selectedImpactObject
    : selectedBuilding
      ? impactAnalysis.items.find((x) => x.id === selectedBuilding.id) ?? null
      : selectedRoad
        ? impactAnalysis.items.find((x) => x.id === selectedRoad.id) ?? null
        : null;

  const assignWaypointFromSelection = (role: 'origin' | 'destination') => {
    if (selectedBuilding) {
      setCustomWaypointRole(role, {
        id: `custom-bldg-${selectedBuilding.id}`,
        label:
          selectedBuilding.name ||
          `${t('targetTypes.building')} (${selectedBuilding.id})`,
        category: selectedBuilding.amenity || selectedBuilding.category,
        source: 'custom_building',
        sceneX: selectedBuilding.sceneX,
        sceneZ: selectedBuilding.sceneZ,
        lon: selectedBuilding.lon,
        lat: selectedBuilding.lat,
      });
      return;
    }

    if (selectedRoad) {
      const roadEntry = impactCatalog?.roads.find((r) => r.id === selectedRoad.id);
      const edgeEntry = !roadEntry
        ? roadGraph?.edges.find((e) => e.roadId === selectedRoad.id)
        : null;
      const sx = roadEntry?.sceneX ?? edgeEntry?.midX ?? 0;
      const sz = roadEntry?.sceneZ ?? edgeEntry?.midZ ?? 0;
      setCustomWaypointRole(role, {
        id: `custom-road-${selectedRoad.id}`,
        label: selectedRoad.name || `${t('targetTypes.road')} (${selectedRoad.id})`,
        category: selectedRoad.highway || 'road',
        source: 'custom_road',
        sceneX: sx,
        sceneZ: sz,
      });
      return;
    }

    if (selectedImpactObject) {
      setCustomWaypointRole(role, {
        id: `custom-imp-${selectedImpactObject.id}`,
        label: selectedImpactObject.name,
        category: selectedImpactObject.subType,
        source:
          selectedImpactObject.targetType === 'road' ? 'custom_road' : 'custom_building',
        sceneX: selectedImpactObject.sceneX,
        sceneZ: selectedImpactObject.sceneZ,
      });
      return;
    }

    if (selectedPlace) {
      const existing = allWaypoints.find(
        (w) => w.label.toLowerCase() === selectedPlace.nameEn.toLowerCase()
      );
      if (existing) {
        setCustomWaypointRole(role, existing);
      }
    }
  };

  if (selectedBuilding) {
    return (
      <div
        data-testid="selected-feature-inspector"
        className="rounded-xl bg-white border border-[#0891B2]/35 dark:bg-[#0b1526] dark:border-cyan-500/35 p-3 space-y-2.5 shadow-xs dark:shadow-none"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <h3 className="text-xs font-semibold text-[#0891B2] dark:text-cyan-300 truncate">
              {selectedImpactObject?.targetType === 'facility'
                ? t('inspector.selectedFacility')
                : t('inspector.selectedBuilding')}
            </h3>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="text-[11px] text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-white cursor-pointer shrink-0"
          >
            {t('common.clear')}
          </button>
        </div>

        <p className="text-sm font-semibold text-[#172033] dark:text-slate-100 leading-snug">
          {selectedBuilding.name ?? t('common.nameNotRecordedOsm')}
        </p>

        <dl className="grid grid-cols-2 gap-y-1 text-xs">
          <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.osmId')}</dt>
          <dd className="text-right text-slate-700 dark:text-slate-300 font-mono-tabular truncate">
            {selectedBuilding.id}
          </dd>
          <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.buildingTag')}</dt>
          <dd className="text-right text-[#172033] dark:text-slate-200 capitalize">
            {selectedBuilding.type ?? t('common.notRecorded')}
          </dd>
          <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.levelsHeight')}</dt>
          <dd className="text-right text-[#172033] dark:text-slate-200 font-mono-tabular">
            {selectedBuilding.levels ?? '—'} ·{' '}
            {selectedBuilding.heightMeters != null
              ? `${selectedBuilding.heightMeters} ${unitM}`
              : t('common.notRecorded')}
          </dd>
          <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.impactRisk')}</dt>
          <dd
            className={`text-right font-semibold ${
              liveImpactMatch
                ? RISK_TEXT_STYLE[liveImpactMatch.riskLevel]
                : 'text-[#0891B2] dark:text-cyan-400'
            }`}
          >
            {liveImpactMatch
              ? t('inspector.depthValue', {
                  risk: localizeRiskLevel(liveImpactMatch.riskLevel, t),
                  depth: formatDecimal(liveImpactMatch.estimatedDepthMeters, 2),
                })
              : t('inspector.clear0m')}
          </dd>
        </dl>

        <div className="grid grid-cols-3 gap-1.5 pt-1">
          {liveImpactMatch && (
            <button
              type="button"
              onClick={() => selectImpactObject(liveImpactMatch)}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#0891B2]/12 border border-[#0891B2]/40 text-[#0891B2] hover:bg-[#0891B2]/20 dark:bg-cyan-500/15 dark:border-cyan-500/40 dark:text-cyan-300 dark:hover:bg-cyan-500/25 cursor-pointer whitespace-nowrap"
            >
              <Crosshair className="w-3 h-3 shrink-0" />
              <span className="truncate">{t('common.locate')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => assignWaypointFromSelection('origin')}
            className="py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700/80 dark:text-cyan-300 dark:hover:border-cyan-500/50 cursor-pointer whitespace-nowrap truncate"
          >
            {t('common.setOrigin')}
          </button>
          <button
            type="button"
            onClick={() => assignWaypointFromSelection('destination')}
            className="py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#16A34A] hover:border-[#16A34A] dark:bg-slate-900 dark:border-slate-700/80 dark:text-emerald-300 dark:hover:border-emerald-500/50 cursor-pointer whitespace-nowrap truncate"
          >
            {t('common.setDest')}
          </button>
        </div>
      </div>
    );
  }

  if (selectedRoad) {
    const roadEntry = impactCatalog?.roads.find((r) => r.id === selectedRoad.id);
    const edgeEntry = roadGraph?.edges.find((e) => e.roadId === selectedRoad.id);
    const centerX = roadEntry?.sceneX ?? edgeEntry?.midX ?? 0;
    const centerZ = roadEntry?.sceneZ ?? edgeEntry?.midZ ?? 0;
    const resolvedRoadName =
      selectedRoad.name || roadEntry?.name || edgeEntry?.roadName || `${t('targetTypes.road')} (${selectedRoad.id})`;
    const resolvedHighway = selectedRoad.highway || edgeEntry?.highway || 'road';

    const activeClosure = roadIncidents.some(
      (inc) => inc.roadId === selectedRoad.id && inc.kind === 'closure' && inc.active
    );
    const activeAccident = roadIncidents.some(
      (inc) => inc.roadId === selectedRoad.id && inc.kind === 'accident' && inc.active
    );
    const activeConstruction = roadIncidents.some(
      (inc) => inc.roadId === selectedRoad.id && inc.kind === 'construction' && inc.active
    );
    const activeCongestion = roadIncidents.some(
      (inc) => inc.roadId === selectedRoad.id && inc.kind === 'congestion' && inc.active
    );

    const handleToggleIncident = (kind: RoadIncidentKind) => {
      toggleCustomRoadIncident({
        roadId: selectedRoad.id,
        roadName: resolvedRoadName,
        highway: resolvedHighway,
        kind,
        centerX,
        centerZ,
      });
    };

    return (
      <div
        data-testid="selected-feature-inspector"
        className="rounded-xl bg-white border border-sky-500/40 dark:bg-[#0b1526] dark:border-sky-500/40 p-3 space-y-2.5 shadow-xs dark:shadow-none"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <RouteIcon className="w-4 h-4 text-[#0891B2] dark:text-sky-400 shrink-0" />
            <h3 className="text-xs font-semibold text-[#0891B2] dark:text-sky-300 truncate">
              {t('inspector.selectedRoad')}
            </h3>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="text-[11px] text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-white cursor-pointer shrink-0"
          >
            {t('common.clear')}
          </button>
        </div>

        <p className="text-sm font-semibold text-[#172033] dark:text-slate-100 leading-snug">
          {selectedRoad.name ?? t('common.nameNotRecordedOsm')}
        </p>

        <dl className="grid grid-cols-2 gap-y-1 text-xs">
          <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.osmId')}</dt>
          <dd className="text-right text-slate-700 dark:text-slate-300 font-mono-tabular truncate">
            {selectedRoad.id}
          </dd>
          <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.roadClass')}</dt>
          <dd className="text-right text-[#172033] dark:text-slate-200 capitalize">
            {selectedRoad.highway
              ? selectedRoad.highway.replace(/_/g, ' ')
              : t('common.notRecorded')}
          </dd>
          <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.lanesSpeed')}</dt>
          <dd className="text-right text-[#172033] dark:text-slate-200 font-mono-tabular">
            {selectedRoad.lanes ?? '—'} ·{' '}
            {selectedRoad.maxspeed ?? t('common.notRecorded')}
          </dd>
          <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.structure')}</dt>
          <dd className="text-right text-[#172033] dark:text-slate-200">
            {selectedRoad.isBridge
              ? t('inspector.bridgeViaduct')
              : selectedRoad.isTunnel
                ? t('inspector.tunnelPassage')
                : t('inspector.surfaceRoad')}
          </dd>
          <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.impactRisk')}</dt>
          <dd
            className={`text-right font-semibold ${
              activeClosure
                ? 'text-[#DC2626] dark:text-rose-400'
                : activeAccident
                  ? 'text-orange-600 dark:text-orange-400'
                  : activeConstruction
                    ? 'text-[#D97706] dark:text-amber-300'
                    : activeCongestion
                      ? 'text-[#DC2626] dark:text-red-400'
                      : liveImpactMatch
                        ? RISK_TEXT_STYLE[liveImpactMatch.riskLevel]
                        : 'text-[#0891B2] dark:text-cyan-400'
            }`}
          >
            {activeClosure
              ? t('inspector.closedSim')
              : activeAccident
                ? t('inspector.accidentSim')
                : activeConstruction
                  ? t('inspector.constructionSim')
                  : activeCongestion
                    ? t('inspector.congestionSim')
                    : liveImpactMatch
                      ? t('inspector.depthValue', {
                          risk: localizeRiskLevel(liveImpactMatch.riskLevel, t),
                          depth: formatDecimal(liveImpactMatch.estimatedDepthMeters, 2),
                        })
                      : selectedRoad.isBridge
                        ? t('inspector.elevatedClearSim')
                        : t('inspector.passableSim')}
          </dd>
        </dl>

        <div className="grid grid-cols-3 gap-1.5 pt-1">
          {liveImpactMatch && (
            <button
              type="button"
              onClick={() => selectImpactObject(liveImpactMatch)}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#0891B2]/12 border border-[#0891B2]/40 text-[#0891B2] hover:bg-[#0891B2]/20 dark:bg-cyan-500/15 dark:border-cyan-500/40 dark:text-cyan-300 dark:hover:bg-cyan-500/25 cursor-pointer whitespace-nowrap"
            >
              <Crosshair className="w-3 h-3 shrink-0" />
              <span className="truncate">{t('common.locate')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => assignWaypointFromSelection('origin')}
            className="py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700/80 dark:text-cyan-300 dark:hover:border-cyan-500/50 cursor-pointer whitespace-nowrap truncate"
          >
            {t('common.setOrigin')}
          </button>
          <button
            type="button"
            onClick={() => assignWaypointFromSelection('destination')}
            className="py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#16A34A] hover:border-[#16A34A] dark:bg-slate-900 dark:border-slate-700/80 dark:text-emerald-300 dark:hover:border-emerald-500/50 cursor-pointer whitespace-nowrap truncate"
          >
            {t('common.setDest')}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            data-testid="inspector-toggle-closure"
            onClick={() => handleToggleIncident('closure')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer whitespace-nowrap truncate ${
              activeClosure
                ? 'bg-rose-500/15 border-rose-500/50 text-[#DC2626] dark:bg-rose-500/20 dark:text-rose-200 hover:bg-rose-500/25'
                : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#DC2626] hover:border-rose-500/50 dark:bg-slate-900 dark:border-slate-700/80 dark:text-rose-300'
            }`}
          >
            <Ban className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {activeClosure ? t('inspector.reopenRoad') : t('inspector.closeRoad')}
            </span>
          </button>
          <button
            type="button"
            data-testid="inspector-toggle-accident"
            onClick={() => handleToggleIncident('accident')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer whitespace-nowrap truncate ${
              activeAccident
                ? 'bg-orange-500/15 border-orange-500/50 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200 hover:bg-orange-500/25'
                : 'bg-[#F8FAFC] border-[#E2E8F0] text-orange-700 hover:border-orange-500/50 dark:bg-slate-900 dark:border-slate-700/80 dark:text-orange-300'
            }`}
          >
            <TrafficCone className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {activeAccident ? t('inspector.clearAccident') : t('inspector.flagAccident')}
            </span>
          </button>
          <button
            type="button"
            data-testid="inspector-toggle-construction"
            onClick={() => handleToggleIncident('construction')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer whitespace-nowrap truncate ${
              activeConstruction
                ? 'bg-amber-500/15 border-amber-500/50 text-[#D97706] dark:bg-amber-500/20 dark:text-amber-200 hover:bg-amber-500/25'
                : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#D97706] hover:border-amber-500/50 dark:bg-slate-900 dark:border-slate-700/80 dark:text-amber-300'
            }`}
          >
            <Construction className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {activeConstruction
                ? t('inspector.clearConstruction')
                : t('inspector.flagConstruction')}
            </span>
          </button>
          <button
            type="button"
            data-testid="inspector-toggle-congestion"
            onClick={() => handleToggleIncident('congestion')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-medium border cursor-pointer whitespace-nowrap truncate ${
              activeCongestion
                ? 'bg-red-500/15 border-red-500/50 text-[#DC2626] dark:bg-red-500/20 dark:text-red-200 hover:bg-red-500/25'
                : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#DC2626] hover:border-red-500/50 dark:bg-slate-900 dark:border-slate-700/80 dark:text-red-300'
            }`}
          >
            <Gauge className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {activeCongestion
                ? t('inspector.clearCongestion')
                : t('inspector.flagCongestion')}
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (selectedImpactObject) {
    return (
      <div
        data-testid="selected-feature-inspector"
        className="rounded-xl bg-white border border-[#0891B2]/35 dark:bg-[#0b1526] dark:border-cyan-500/35 p-3 space-y-2.5 shadow-xs dark:shadow-none"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {selectedImpactObject.targetType === 'park' ? (
              <Trees className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
            ) : (
              <Landmark className="w-4 h-4 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            )}
            <h3 className="text-xs font-semibold text-[#0891B2] dark:text-cyan-300 truncate">
              {t('inspector.selectedObject', {
                type: t(`targetTypes.${selectedImpactObject.targetType}`),
                dataset: selectedImpactObject.sourceDataset,
              })}
            </h3>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="text-[11px] text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-white cursor-pointer shrink-0"
          >
            {t('common.clear')}
          </button>
        </div>

        <p className="text-sm font-semibold text-[#172033] dark:text-slate-100 leading-snug">
          {selectedImpactObject.name}
        </p>

        <dl className="grid grid-cols-2 gap-y-1 text-xs">
          <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.classification')}</dt>
          <dd className="text-right text-[#172033] dark:text-slate-200 capitalize">
            {selectedImpactObject.subType}
          </dd>
          {selectedImpactObject.facilityMeta?.network && (
            <>
              <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.transitNetwork')}</dt>
              <dd className="text-right text-[#172033] dark:text-slate-200">
                {selectedImpactObject.facilityMeta.network}
              </dd>
            </>
          )}
          <dt className="text-[#64748B] dark:text-slate-400">{t('inspector.impactRisk')}</dt>
          <dd
            className={`text-right font-semibold ${
              liveImpactMatch
                ? RISK_TEXT_STYLE[liveImpactMatch.riskLevel]
                : 'text-[#0891B2] dark:text-cyan-400'
            }`}
          >
            {liveImpactMatch
              ? t('inspector.depthValue', {
                  risk: localizeRiskLevel(liveImpactMatch.riskLevel, t),
                  depth: formatDecimal(liveImpactMatch.estimatedDepthMeters, 2),
                })
              : t('inspector.clearAtCurrentLevel')}
          </dd>
        </dl>

        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => selectImpactObject(liveImpactMatch ?? selectedImpactObject)}
            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#0891B2]/12 border border-[#0891B2]/40 text-[#0891B2] hover:bg-[#0891B2]/20 dark:bg-cyan-500/15 dark:border-cyan-500/40 dark:text-cyan-300 dark:hover:bg-cyan-500/25 cursor-pointer whitespace-nowrap"
          >
            <Crosshair className="w-3 h-3 shrink-0" />
            <span className="truncate">{t('common.recenter')}</span>
          </button>
          <button
            type="button"
            onClick={() => assignWaypointFromSelection('origin')}
            className="py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700/80 dark:text-cyan-300 dark:hover:border-cyan-500/50 cursor-pointer whitespace-nowrap truncate"
          >
            {t('common.setOrigin')}
          </button>
          <button
            type="button"
            onClick={() => assignWaypointFromSelection('destination')}
            className="py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#16A34A] hover:border-[#16A34A] dark:bg-slate-900 dark:border-slate-700/80 dark:text-emerald-300 dark:hover:border-emerald-500/50 cursor-pointer whitespace-nowrap truncate"
          >
            {t('common.setDest')}
          </button>
        </div>
      </div>
    );
  }

  const primaryPlaceName =
    language === 'th' ? selectedPlace!.name : selectedPlace!.nameEn;
  const secondaryPlaceName =
    language === 'th' ? selectedPlace!.nameEn : selectedPlace!.name;

  return (
    <div
      data-testid="selected-feature-inspector"
      className="rounded-xl bg-white border border-[#0891B2]/35 dark:bg-[#0b1526] dark:border-cyan-500/35 p-3 space-y-2 shadow-xs dark:shadow-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 text-[#0891B2] dark:text-cyan-400 shrink-0" />
          <h3 className="text-xs font-semibold text-[#0891B2] dark:text-cyan-300 truncate">
            {t('inspector.landmarkTitle')}
          </h3>
        </div>
        <button
          type="button"
          onClick={clearSelection}
          className="text-[11px] text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-white cursor-pointer shrink-0"
        >
          {t('common.clear')}
        </button>
      </div>
      <p className="text-sm font-semibold text-[#172033] dark:text-slate-100">{primaryPlaceName}</p>
      <p className="text-xs text-[#64748B] dark:text-slate-400">
        {secondaryPlaceName} · {selectedPlace!.category} (
        {selectedPlace!.latitude.toFixed(4)}, {selectedPlace!.longitude.toFixed(4)})
      </p>
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        <button
          type="button"
          onClick={() => assignWaypointFromSelection('origin')}
          className="py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700/80 dark:text-cyan-300 dark:hover:border-cyan-500/50 cursor-pointer whitespace-nowrap truncate"
        >
          {t('common.setAsOrigin')}
        </button>
        <button
          type="button"
          onClick={() => assignWaypointFromSelection('destination')}
          className="py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#16A34A] hover:border-[#16A34A] dark:bg-slate-900 dark:border-slate-700/80 dark:text-emerald-300 dark:hover:border-emerald-500/50 cursor-pointer whitespace-nowrap truncate"
        >
          {t('common.setAsDest')}
        </button>
      </div>
    </div>
  );
}
