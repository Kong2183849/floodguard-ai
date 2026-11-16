import { resolveScenarioInfo } from '../data/simulationPresets';
import type {
  AffectedAreaOption,
  ComputedRoute,
  FloodCauseId,
  ImpactRiskLevel,
  RoadGraph,
  RouteOptimizationMode,
  RouteOptimizationResult,
  SimulationSettings,
  SummaryMetrics,
  VehicleProfileId,
} from '../types/city';
import type { SupportedLanguage, TranslateFn } from './types';
import { formatDecimal, formatNumber } from './index';

export function localizeFloodCauseLabel(
  causeId: FloodCauseId,
  t: TranslateFn
): string {
  return t(`floodCauses.${causeId}.label`);
}

export function localizeFloodCauseDesc(
  causeId: FloodCauseId,
  t: TranslateFn
): string {
  return t(`floodCauses.${causeId}.desc`);
}

export function localizeScenarioInfo(
  settings: SimulationSettings,
  t: TranslateFn,
  language: SupportedLanguage
): {
  id: string;
  label: string;
  description: string;
  isCustom: boolean;
} {
  const resolved = resolveScenarioInfo(settings);
  if (resolved.isCustom) {
    return {
      id: 'custom',
      label: t('scenarios.custom.label', {
        severity: formatNumber(settings.floodSeverity, language),
      }),
      description: t('scenarios.custom.description', {
        severity: formatNumber(settings.floodSeverity, language),
        water: formatDecimal(settings.waterLevelMeters, language, 2),
        drainage: formatNumber(settings.drainageCapacityPct, language),
      }),
      isCustom: true,
    };
  }
  return {
    id: resolved.id,
    label: t(`scenarios.${resolved.id}.label`),
    description: t(`scenarios.${resolved.id}.description`),
    isCustom: false,
  };
}

export function localizePresetLabel(
  presetId: string,
  t: TranslateFn
): string {
  return t(`scenarios.${presetId}.label`);
}

export function localizePresetDescription(
  presetId: string,
  t: TranslateFn
): string {
  return t(`scenarios.${presetId}.description`);
}

export function localizeAffectedAreaLabel(
  area: Pick<AffectedAreaOption, 'id' | 'label'>,
  t: TranslateFn
): string {
  const key = `areas.${area.id}`;
  const translated = t(key);
  return translated === key ? area.label : translated;
}

export function localizeRiskLevel(
  risk: ImpactRiskLevel | 'Info',
  t: TranslateFn
): string {
  return t(`risk.${risk}`);
}

export function localizeSeverityStatus(
  status: SummaryMetrics['floodSeverityLabel'],
  t: TranslateFn
): string {
  return t(`severityStatus.${status}`);
}

export function localizeVehicleProfile(
  profile: VehicleProfileId,
  t: TranslateFn
): string {
  return profile === 'emergency'
    ? t('routing.emergencyVehicle')
    : t('routing.standardVehicle');
}

export function localizeRouteLabel(
  route: Pick<ComputedRoute, 'id' | 'label'>,
  t: TranslateFn,
  mode?: RouteOptimizationMode
): string {
  if (route.id === 'route-primary' && mode) {
    const modeKey = `routing.routeLabels.route-primary-${mode}`;
    const translatedMode = t(modeKey);
    if (translatedMode !== modeKey) return translatedMode;
  }
  const key = `routing.routeLabels.${route.id}`;
  const translated = t(key);
  return translated === key ? route.label : translated;
}

export function localizeRouteError(
  result: Pick<
    RouteOptimizationResult,
    'status' | 'origin' | 'destination' | 'maxSafeDepthMeters' | 'errorMessage'
  >,
  effectiveWaterMeters: number,
  t: TranslateFn,
  language: SupportedLanguage
): string | null {
  if (!result.errorMessage) return null;
  if (language === 'en') return result.errorMessage;

  const limit = formatDecimal(result.maxSafeDepthMeters, language, 2);
  const origin = result.origin?.label ?? '';
  const dest = result.destination?.label ?? '';
  const water = formatDecimal(effectiveWaterMeters, language, 2);

  if (result.errorMessage.includes('No drivable Chatuchak road segments')) {
    return t('routing.errors.noDrivable');
  }
  if (result.status === 'same_point') {
    return t('routing.errors.samePoint');
  }
  if (result.errorMessage.startsWith('Both "')) {
    return t('routing.errors.isolatedBoth', { origin, dest, limit });
  }
  if (result.errorMessage.startsWith('Origin "')) {
    return t('routing.errors.isolatedOrigin', { origin, limit });
  }
  if (result.errorMessage.startsWith('Destination "')) {
    return t('routing.errors.isolatedDest', { dest, limit });
  }
  if (result.status === 'unreachable') {
    return t('routing.errors.unreachable', { origin, dest, water, limit });
  }
  return result.errorMessage;
}

export function localizeFloodDataNotes(t: TranslateFn): string[] {
  return [
    t('dataNotes.canalVuln'),
    t('dataNotes.offsets'),
    t('dataNotes.facilitiesScope'),
  ];
}

export function localizeTopologyNotes(
  graph: RoadGraph | null,
  affectedRoadsCount: number,
  t: TranslateFn,
  language: SupportedLanguage
): string[] {
  if (!graph) {
    return [t('routing.topology.loading')];
  }
  return [
    t('routing.topology.extracted', {
      count: formatNumber(graph.stats.drivableFeatures, language),
    }),
    t('routing.topology.snapped', {
      scene: graph.snapToleranceScene,
      meters: graph.snapToleranceMeters,
      snapped: formatNumber(graph.stats.snappedDeadEnds, language),
      ratio: formatNumber(Math.round(graph.stats.giantComponentRatio * 100), language),
    }),
    t('routing.topology.sync', {
      affected: formatNumber(affectedRoadsCount, language),
    }),
  ];
}
