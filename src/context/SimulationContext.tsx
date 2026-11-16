import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import {
  INITIAL_AFFECTED_AREAS,
  PRESET_TRAFFIC_CONGESTION_PCT,
  SCENARIO_PRESETS,
  computeSimulatedMetrics,
  resolveScenarioInfo,
} from '../data/simulationPresets';
import { evaluateFloodImpact } from '../engine/floodImpact';
import {
  DEFAULT_RISK_WEIGHTS,
  DEFAULT_TRAFFIC_CONGESTION_PCT,
  DEFAULT_TRAFFIC_LIGHT_TIMING,
  buildPresetRoadIncidents,
  evaluateKeyEmergencyCorridorsCount,
  extractSelectableRoadLocations,
  optimizeEmergencyRoutes,
} from '../engine/routeOptimizer';
import { evaluateWaterNetworkSimulation } from '../engine/waterNetwork';
import { evaluatePowerNetworkSimulation } from '../engine/powerNetwork';
import { deriveMitigationInputs } from '../engine/simulationAnalytics';
import {
  DEFAULT_MCDA_CRITERIA,
  createCriteriaFromPreset,
  evaluateCentralizedDssAndMcda,
  normalizeMcdaCriteria,
} from '../engine/decisionSupport';
import {
  EMPTY_WHATIF_OVERRIDES,
  applySolutionPatchToSimulationState,
  describeSolutionParameters,
  extractBeforeAfterMetricsSnapshot,
  runWhatIfSimulationEvaluation,
} from '../engine/whatIfSimulation';
import type {
  AffectedAreaOption,
  AffectedObjectRecord,
  AppliedDssSolutionMeta,
  BeforeAfterMetricsSnapshot,
  BuildingInfo,
  CityImpactCatalog,
  CityStats,
  DssEvaluationBundle,
  ImpactAnalysisResult,
  LayerVisibility,
  LightingMode,
  McdaCandidateSolution,
  McdaCriterionConfig,
  McdaCriterionId,
  McdaEvaluationSnapshot,
  McdaWeightPresetId,
  MitigationSolutionId,
  NavSection,
  PlaceInfo,
  PowerNetworkGraph,
  PowerNetworkSimulationResult,
  PowerOutageScenarioType,
  RoadGraph,
  RoadIncidentKind,
  RoadInfo,
  RouteOptimizationMode,
  RouteOptimizationResult,
  RouteRiskWeights,
  RouteWaypoint,
  ScenarioId,
  ScenarioSnapshot,
  SelectableRoadLocation,
  SimulatedRoadIncident,
  SimulationSettings,
  SimulationSpeed,
  SummaryMetrics,
  TrafficLightTiming,
  TrafficSimulationStatus,
  VehicleProfileId,
  WaterDischargeStrategyId,
  WaterManagementSimulationResult,
  WaterNetworkGraph,
  WhatIfParameterOverrides,
  WhatIfSessionRecord,
  WhatIfSimulationPreview,
  WhatIfWorkflowStep,
} from '../types/city';

export interface SimulationState {
  activeSection: NavSection;
  settings: SimulationSettings;
  layers: LayerVisibility;
  lightingMode: LightingMode;
  affectedAreas: AffectedAreaOption[];
  cityStatus: 'loading' | 'ready' | 'error';
  cityError: string | null;
  cityStats: CityStats | null;
  impactCatalog: CityImpactCatalog | null;
  roadGraph: RoadGraph | null;
  waterNetwork: WaterNetworkGraph | null;
  waterInflowMultiplierPct: number;
  waterBlockedEdgeIds: string[];
  waterDischargeStrategyId: WaterDischargeStrategyId;
  powerNetwork: PowerNetworkGraph | null;
  powerOutageScenario: PowerOutageScenarioType;
  powerDemandMultiplierPct: number;
  powerFailedNodeIds: string[];
  powerFailedEdgeIds: string[];
  powerIsolatedIds: string[];
  powerActiveBackupEdgeIds: string[];
  powerRestoredAreaIds: string[];
  powerWeatherCouplingEnabled: boolean;
  waypoints: RouteWaypoint[];
  customWaypoints: RouteWaypoint[];
  routeOriginId: string;
  routeDestId: string;
  vehicleProfile: VehicleProfileId;
  routeMode: RouteOptimizationMode;
  riskWeights: RouteRiskWeights;
  trafficStatus: TrafficSimulationStatus;
  trafficCongestionPct: number;
  trafficLightTiming: TrafficLightTiming;
  roadIncidents: SimulatedRoadIncident[];
  selectedRouteIndex: number;
  selectedBuilding: BuildingInfo | null;
  selectedRoad: RoadInfo | null;
  selectedPlace: PlaceInfo | null;
  selectedImpactObject: AffectedObjectRecord | null;
  scenarioHistory: ScenarioSnapshot[];
  dssDetectionTimestamps: Record<string, number>;
  mcdaCriteria: McdaCriterionConfig[];
  mcdaWeightPresetId: McdaWeightPresetId | 'custom';
  selectedDssProblemId: string | null;
  previewMcdaSolutionId: string | null;
  comparedMcdaSolutionIds: string[];
  mcdaAuditHistory: McdaEvaluationSnapshot[];
  whatIfWorkflowStep: WhatIfWorkflowStep;
  whatIfSelectedSolutionId: string | null;
  whatIfParameterOverrides: WhatIfParameterOverrides;
  whatIfCommittedRecord: WhatIfSessionRecord | null;
  whatIfBaselineSnapshotId: string | null;
  focusPointTarget: { x: number; z: number; span?: number } | null;
  clearSelectionSignal: number;
  focusAreaSignal: number;
  resetFloodSignal: number;
  locateTargetSignal: number;
  focusRouteSignal: number;
  focusPointSignal: number;
  resetCount: number;
}

export const INITIAL_SIMULATION_SETTINGS: SimulationSettings = {
  disasterType: 'flood',
  scenarioId: 'monsoon',
  status: 'idle',
  floodSeverity: 38,
  waterLevelMeters: 0.45,
  rainfallMmHr: 82,
  drainageCapacityPct: 72,
  drainageBlockagePct: 18,
  canalWaterLevelPct: 38,
  lowLyingSensitivityPct: 100,
  simulationSpeed: 1,
  affectedAreaId: 'all-district',
  elapsedSeconds: 0,
  emergencyMode: false,
  floodAutoRise: false,
  floodOpacity: 0.85,
};

export const INITIAL_LAYER_VISIBILITY: LayerVisibility = {
  buildings: true,
  roads: true,
  water: true,
  parks: true,
  railways: true,
  traffic: true,
  trafficDensityOverlay: true,
  labels: true,
  floodOverlay: true,
  impactOverlay: true,
  routeOverlay: true,
  waterNetworkOverlay: true,
  powerNetworkOverlay: true,
  decisionPreviewOverlay: true,
};

const ACTIVE_SECTION_STORAGE_KEY = 'floodguard.nav.activeSection';

const VALID_NAV_SECTIONS: ReadonlySet<NavSection> = new Set<NavSection>([
  'overview',
  'simulation',
  'flood',
  'water',
  'power',
  'traffic',
  'routing',
  'analytics',
  'dss',
  'mcda',
  'whatif',
  'assistant',
]);

function readInitialActiveSection(): NavSection {
  if (typeof window === 'undefined') return 'overview';
  try {
    const raw = window.localStorage.getItem(ACTIVE_SECTION_STORAGE_KEY);
    if (raw && VALID_NAV_SECTIONS.has(raw as NavSection)) {
      return raw as NavSection;
    }
  } catch {
    // Ignore storage read errors
  }
  return 'overview';
}

export const INITIAL_STATE: SimulationState = {
  activeSection: 'overview',
  settings: INITIAL_SIMULATION_SETTINGS,
  layers: INITIAL_LAYER_VISIBILITY,
  lightingMode: 'tactical',
  affectedAreas: INITIAL_AFFECTED_AREAS,
  cityStatus: 'loading',
  cityError: null,
  cityStats: null,
  impactCatalog: null,
  roadGraph: null,
  waterNetwork: null,
  waterInflowMultiplierPct: 100,
  waterBlockedEdgeIds: [],
  waterDischargeStrategyId: 'none',
  powerNetwork: null,
  powerOutageScenario: 'none',
  powerDemandMultiplierPct: 100,
  powerFailedNodeIds: [],
  powerFailedEdgeIds: [],
  powerIsolatedIds: [],
  powerActiveBackupEdgeIds: [],
  powerRestoredAreaIds: [],
  powerWeatherCouplingEnabled: true,
  waypoints: [],
  customWaypoints: [],
  routeOriginId: 'lm-5',
  routeDestId: 'lm-4',
  vehicleProfile: 'emergency',
  routeMode: 'safest',
  riskWeights: { ...DEFAULT_RISK_WEIGHTS },
  trafficStatus: 'running',
  trafficCongestionPct: DEFAULT_TRAFFIC_CONGESTION_PCT,
  trafficLightTiming: { ...DEFAULT_TRAFFIC_LIGHT_TIMING },
  roadIncidents: [],
  selectedRouteIndex: 0,
  selectedBuilding: null,
  selectedRoad: null,
  selectedPlace: null,
  selectedImpactObject: null,
  scenarioHistory: [],
  dssDetectionTimestamps: {},
  mcdaCriteria: DEFAULT_MCDA_CRITERIA,
  mcdaWeightPresetId: 'balanced',
  selectedDssProblemId: null,
  previewMcdaSolutionId: null,
  comparedMcdaSolutionIds: [],
  mcdaAuditHistory: [],
  whatIfWorkflowStep: 'problem',
  whatIfSelectedSolutionId: null,
  whatIfParameterOverrides: { ...EMPTY_WHATIF_OVERRIDES },
  whatIfCommittedRecord: null,
  whatIfBaselineSnapshotId: null,
  focusPointTarget: null,
  clearSelectionSignal: 0,
  focusAreaSignal: 0,
  resetFloodSignal: 0,
  locateTargetSignal: 0,
  focusRouteSignal: 0,
  focusPointSignal: 0,
  resetCount: 0,
};

type Action =
  | { type: 'SET_SECTION'; section: NavSection }
  | { type: 'START_SIMULATION' }
  | { type: 'PAUSE_SIMULATION' }
  | { type: 'RESET_SIMULATION' }
  | { type: 'TICK_SIMULATION'; dtSeconds: number }
  | { type: 'SET_SEVERITY'; severity: number }
  | { type: 'SET_WATER_LEVEL'; meters: number }
  | { type: 'SET_SPEED'; speed: SimulationSpeed }
  | { type: 'SET_AFFECTED_AREA'; areaId: string }
  | { type: 'SELECT_PRESET'; presetId: ScenarioId }
  | { type: 'SET_FLOOD_AUTO_RISE'; enabled: boolean }
  | { type: 'SET_FLOOD_OPACITY'; opacity: number }
  | { type: 'RESET_FLOOD_LAYER' }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<SimulationSettings> }
  | { type: 'TOGGLE_LAYER'; key: keyof LayerVisibility }
  | { type: 'SET_LIGHTING'; mode: LightingMode }
  | { type: 'SET_CITY_LOADING' }
  | {
      type: 'SET_CITY_LOADED';
      stats: CityStats;
      areas: AffectedAreaOption[];
      catalog?: CityImpactCatalog;
      roadGraph?: RoadGraph;
      waypoints?: RouteWaypoint[];
      waterNetwork?: WaterNetworkGraph;
      powerNetwork?: PowerNetworkGraph;
    }
  | { type: 'SET_CITY_ERROR'; error: string }
  | { type: 'SET_WATER_INFLOW_MULTIPLIER'; pct: number }
  | { type: 'TOGGLE_WATER_BLOCKED_SEGMENT'; edgeId: string }
  | { type: 'SET_WATER_DISCHARGE_STRATEGY'; strategyId: WaterDischargeStrategyId }
  | { type: 'RESET_WATER_MANAGEMENT' }
  | { type: 'APPLY_POWER_OUTAGE_SCENARIO'; scenario: PowerOutageScenarioType }
  | { type: 'TOGGLE_POWER_FAULT'; id: string; targetKind: 'node' | 'edge' }
  | { type: 'SET_POWER_DEMAND_MULTIPLIER'; pct: number }
  | { type: 'TOGGLE_POWER_WEATHER_COUPLING'; enabled: boolean }
  | { type: 'ISOLATE_POWER_ELEMENT'; id: string }
  | { type: 'TOGGLE_POWER_BACKUP_PATH'; edgeId: string }
  | { type: 'RESTORE_POWER_SERVICE_AREA'; areaId: string }
  | { type: 'RESTORE_ALL_FEASIBLE_POWER'; weatherTrippedIds: string[] }
  | { type: 'RESET_POWER_MANAGEMENT' }
  | { type: 'SET_ROUTE_ORIGIN'; id: string }
  | { type: 'SET_ROUTE_DEST'; id: string }
  | { type: 'SWAP_ROUTE_ENDPOINTS' }
  | { type: 'SET_VEHICLE_PROFILE'; profile: VehicleProfileId }
  | { type: 'SET_ROUTE_MODE'; mode: RouteOptimizationMode }
  | { type: 'SET_RISK_WEIGHTS'; patch: Partial<RouteRiskWeights> }
  | { type: 'SET_TRAFFIC_STATUS'; status: TrafficSimulationStatus }
  | { type: 'RESET_TRAFFIC_SIMULATION' }
  | { type: 'SET_TRAFFIC_LIGHT_TIMING'; patch: Partial<TrafficLightTiming> }
  | { type: 'SET_TRAFFIC_CONGESTION'; pct: number }
  | { type: 'TOGGLE_ROAD_INCIDENT'; incidentId: string }
  | { type: 'REMOVE_ROAD_INCIDENT'; incidentId: string }
  | {
      type: 'ADD_TRAFFIC_INCIDENT';
      roadId: string;
      roadName: string;
      highway: string;
      kind: RoadIncidentKind;
      centerX: number;
      centerZ: number;
      volumeBoostPct?: number;
    }
  | {
      type: 'TOGGLE_CUSTOM_ROAD_INCIDENT';
      roadId: string;
      roadName: string;
      highway: string;
      kind: RoadIncidentKind;
      centerX: number;
      centerZ: number;
    }
  | { type: 'RESET_ROAD_CONDITIONS' }
  | { type: 'SELECT_ROUTE_INDEX'; index: number }
  | { type: 'SET_CUSTOM_WAYPOINT_ROLE'; role: 'origin' | 'destination'; waypoint: RouteWaypoint }
  | { type: 'FOCUS_ROUTE' }
  | { type: 'FOCUS_SCENE_POINT'; x: number; z: number; span?: number }
  | { type: 'SELECT_BUILDING'; building: BuildingInfo | null }
  | { type: 'SELECT_ROAD'; road: RoadInfo | null }
  | { type: 'SELECT_PLACE'; place: PlaceInfo }
  | { type: 'SELECT_IMPACT_OBJECT'; item: AffectedObjectRecord }
  | { type: 'CLEAR_SELECTION' }
  | {
      type: 'SAVE_SCENARIO_SNAPSHOT';
      label?: string;
      source?: ScenarioSnapshot['source'];
      solutionId?: MitigationSolutionId;
    }
  | { type: 'RESTORE_SCENARIO_SNAPSHOT'; snapshotId: string }
  | { type: 'DELETE_SCENARIO_SNAPSHOT'; snapshotId: string }
  | {
      type: 'APPLY_MITIGATION_SOLUTION';
      solutionId: MitigationSolutionId;
      label?: string;
    }
  | { type: 'RESET_TO_ORIGINAL_BASELINE' }
  | { type: 'SYNC_DSS_DETECTION_TIMESTAMPS'; problemIds: string[]; elapsedSeconds: number }
  | { type: 'SET_SELECTED_DSS_PROBLEM'; problemId: string | null }
  | { type: 'SET_PREVIEW_MCDA_SOLUTION'; solutionId: string | null }
  | { type: 'TOGGLE_COMPARE_MCDA_SOLUTION'; solutionId: string }
  | { type: 'SET_MCDA_CRITERION_WEIGHT'; id: McdaCriterionId; weight: number }
  | { type: 'TOGGLE_MCDA_CRITERION_ENABLED'; id: McdaCriterionId }
  | { type: 'APPLY_MCDA_WEIGHT_PRESET'; presetId: McdaWeightPresetId }
  | { type: 'RECORD_MCDA_AUDIT'; snapshot: McdaEvaluationSnapshot }
  | {
      type: 'CONFIRM_APPLY_MCDA_SOLUTION';
      solution: McdaCandidateSolution;
      auditSnapshot: McdaEvaluationSnapshot;
    }
  | { type: 'SET_WHATIF_STEP'; step: WhatIfWorkflowStep }
  | { type: 'SELECT_WHATIF_SOLUTION'; solutionId: string | null; jumpToStep?: WhatIfWorkflowStep }
  | { type: 'UPDATE_WHATIF_OVERRIDES'; patch: Partial<WhatIfParameterOverrides> }
  | { type: 'RESET_WHATIF_OVERRIDES' }
  | {
      type: 'COMMIT_WHATIF_SOLUTION';
      preview: WhatIfSimulationPreview;
      problemTitle: string;
      problemTitleTh: string;
      auditSnapshot: McdaEvaluationSnapshot;
    }
  | {
      type: 'SAVE_WHATIF_NAMED_SNAPSHOT';
      label: string;
      appliedDssSolution?: AppliedDssSolutionMeta;
    };

function createInitialBaselineSnapshot(
  roadIncidents: SimulatedRoadIncident[]
): ScenarioSnapshot {
  return {
    id: 'snapshot-initial',
    label: 'Initial Simulation Baseline',
    source: 'initial',
    createdAtIso: new Date().toISOString(),
    elapsedSeconds: 0,
    settings: { ...INITIAL_SIMULATION_SETTINGS },
    trafficCongestionPct: DEFAULT_TRAFFIC_CONGESTION_PCT,
    trafficLightTiming: { ...DEFAULT_TRAFFIC_LIGHT_TIMING },
    vehicleProfile: INITIAL_STATE.vehicleProfile,
    routeMode: INITIAL_STATE.routeMode,
    roadIncidents: roadIncidents.map((inc) => ({ ...inc })),
    affectedAreaId: INITIAL_SIMULATION_SETTINGS.affectedAreaId,
    waterInflowMultiplierPct: 100,
    waterBlockedEdgeIds: [],
    waterDischargeStrategyId: 'none',
    powerOutageScenario: 'none',
    powerDemandMultiplierPct: 100,
    powerFailedNodeIds: [],
    powerFailedEdgeIds: [],
    powerIsolatedIds: [],
    powerActiveBackupEdgeIds: [],
    powerRestoredAreaIds: [],
    powerWeatherCouplingEnabled: true,
  };
}

function buildSnapshotFromState(
  state: SimulationState,
  opts?: {
    label?: string;
    source?: ScenarioSnapshot['source'];
    solutionId?: MitigationSolutionId;
    appliedDssSolution?: AppliedDssSolutionMeta;
  }
): ScenarioSnapshot {
  const info = resolveScenarioInfo(state.settings);
  const defaultLabel = info.isCustom
    ? `Custom (${state.settings.floodSeverity}/100 · ${state.trafficCongestionPct}% cong)`
    : `${info.label} (${state.settings.floodSeverity}/100)`;
  return {
    id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: opts?.label?.trim() || defaultLabel,
    source: opts?.source ?? 'manual',
    solutionId: opts?.solutionId,
    appliedDssSolution: opts?.appliedDssSolution,
    createdAtIso: new Date().toISOString(),
    elapsedSeconds: Math.round(state.settings.elapsedSeconds),
    settings: { ...state.settings },
    trafficCongestionPct: state.trafficCongestionPct,
    trafficLightTiming: { ...state.trafficLightTiming },
    vehicleProfile: state.vehicleProfile,
    routeMode: state.routeMode,
    roadIncidents: state.roadIncidents.map((inc) => ({ ...inc })),
    affectedAreaId: state.settings.affectedAreaId,
    waterInflowMultiplierPct: state.waterInflowMultiplierPct,
    waterBlockedEdgeIds: [...state.waterBlockedEdgeIds],
    waterDischargeStrategyId: state.waterDischargeStrategyId,
    powerOutageScenario: state.powerOutageScenario,
    powerDemandMultiplierPct: state.powerDemandMultiplierPct,
    powerFailedNodeIds: [...state.powerFailedNodeIds],
    powerFailedEdgeIds: [...state.powerFailedEdgeIds],
    powerIsolatedIds: [...state.powerIsolatedIds],
    powerActiveBackupEdgeIds: [...state.powerActiveBackupEdgeIds],
    powerRestoredAreaIds: [...state.powerRestoredAreaIds],
    powerWeatherCouplingEnabled: state.powerWeatherCouplingEnabled,
  };
}

function buildIncidentDefaults(kind: RoadIncidentKind): {
  severity: 'minor' | 'major';
  blocksRoad: boolean;
  speedFactor: number;
} {
  switch (kind) {
    case 'closure':
      return { severity: 'major', blocksRoad: true, speedFactor: 0 };
    case 'accident':
      return { severity: 'major', blocksRoad: true, speedFactor: 0 };
    case 'construction':
      return { severity: 'minor', blocksRoad: false, speedFactor: 0.35 };
    case 'congestion':
      return { severity: 'minor', blocksRoad: false, speedFactor: 0.28 };
  }
}

function upsertCustomWaypoint(list: RouteWaypoint[], wp: RouteWaypoint): RouteWaypoint[] {
  const filtered = list.filter((x) => x.id !== wp.id);
  return [wp, ...filtered].slice(0, 6);
}

function matchScenarioId(settings: {
  floodSeverity: number;
  waterLevelMeters: number;
  rainfallMmHr: number;
  drainageCapacityPct: number;
  drainageBlockagePct: number;
  canalWaterLevelPct: number;
  lowLyingSensitivityPct: number;
}): ScenarioId {
  const found = SCENARIO_PRESETS.find(
    (p) =>
      p.floodSeverity === settings.floodSeverity &&
      Math.abs(p.waterLevelMeters - settings.waterLevelMeters) <= 0.01 &&
      p.rainfallMmHr === settings.rainfallMmHr &&
      p.drainageCapacityPct === settings.drainageCapacityPct &&
      p.drainageBlockagePct === settings.drainageBlockagePct &&
      p.canalWaterLevelPct === settings.canalWaterLevelPct &&
      p.lowLyingSensitivityPct === settings.lowLyingSensitivityPct
  );
  return found ? found.id : 'custom';
}

export function simulationReducer(state: SimulationState, action: Action): SimulationState {
  switch (action.type) {
    case 'SET_SECTION':
      return { ...state, activeSection: action.section };

    case 'START_SIMULATION':
      return {
        ...state,
        trafficStatus: 'running',
        settings: {
          ...state.settings,
          status: 'running',
        },
        layers: {
          ...state.layers,
          floodOverlay: true,
        },
      };

    case 'PAUSE_SIMULATION':
      return {
        ...state,
        trafficStatus: 'paused',
        settings: {
          ...state.settings,
          status: state.settings.status === 'running' ? 'paused' : state.settings.status,
        },
      };

    case 'RESET_SIMULATION': {
      const initialIncidents = buildPresetRoadIncidents(state.roadGraph, true);
      const initialSnap = createInitialBaselineSnapshot(initialIncidents);
      return {
        ...state,
        settings: {
          ...INITIAL_SIMULATION_SETTINGS,
        },
        layers: { ...INITIAL_LAYER_VISIBILITY },
        lightingMode: INITIAL_STATE.lightingMode,
        waterInflowMultiplierPct: 100,
        waterBlockedEdgeIds: [],
        waterDischargeStrategyId: 'none',
        powerOutageScenario: 'none',
        powerDemandMultiplierPct: 100,
        powerFailedNodeIds: [],
        powerFailedEdgeIds: [],
        powerIsolatedIds: [],
        powerActiveBackupEdgeIds: [],
        powerRestoredAreaIds: [],
        powerWeatherCouplingEnabled: true,
        customWaypoints: [],
        routeOriginId: INITIAL_STATE.routeOriginId,
        routeDestId: INITIAL_STATE.routeDestId,
        vehicleProfile: INITIAL_STATE.vehicleProfile,
        routeMode: INITIAL_STATE.routeMode,
        riskWeights: { ...DEFAULT_RISK_WEIGHTS },
        trafficStatus: 'running',
        trafficCongestionPct: DEFAULT_TRAFFIC_CONGESTION_PCT,
        trafficLightTiming: { ...DEFAULT_TRAFFIC_LIGHT_TIMING },
        roadIncidents: initialIncidents,
        scenarioHistory: [initialSnap],
        dssDetectionTimestamps: {},
        selectedDssProblemId: null,
        previewMcdaSolutionId: null,
        comparedMcdaSolutionIds: [],
        mcdaAuditHistory: [],
        whatIfWorkflowStep: 'problem',
        whatIfSelectedSolutionId: null,
        whatIfParameterOverrides: { ...EMPTY_WHATIF_OVERRIDES },
        whatIfCommittedRecord: null,
        whatIfBaselineSnapshotId: null,
        selectedRouteIndex: 0,
        selectedBuilding: null,
        selectedRoad: null,
        selectedPlace: null,
        selectedImpactObject: null,
        clearSelectionSignal: state.clearSelectionSignal + 1,
        focusAreaSignal: state.focusAreaSignal + 1,
        resetFloodSignal: state.resetFloodSignal + 1,
        resetCount: state.resetCount + 1,
      };
    }

    case 'TICK_SIMULATION': {
      if (state.settings.status !== 'running') return state;
      const dt = action.dtSeconds * state.settings.simulationSpeed;
      let nextSeverity = state.settings.floodSeverity;
      let nextWater = state.settings.waterLevelMeters;
      let nextRain = state.settings.rainfallMmHr;
      let nextEmergency = state.settings.emergencyMode;
      let nextScenarioId = state.settings.scenarioId;

      if (state.settings.floodAutoRise) {
        nextSeverity = Math.min(100, Number((nextSeverity + 1.8 * dt).toFixed(1)));
        nextWater = Math.min(2.5, Number((nextWater + 0.045 * dt).toFixed(2)));
        nextRain = Math.round(nextSeverity * 1.5);
        if (nextSeverity >= 65) nextEmergency = true;
        nextScenarioId = matchScenarioId({
          floodSeverity: Math.round(nextSeverity),
          waterLevelMeters: nextWater,
          rainfallMmHr: nextRain,
          drainageCapacityPct: state.settings.drainageCapacityPct,
          drainageBlockagePct: state.settings.drainageBlockagePct,
          canalWaterLevelPct: state.settings.canalWaterLevelPct,
          lowLyingSensitivityPct: state.settings.lowLyingSensitivityPct,
        });
      }

      return {
        ...state,
        settings: {
          ...state.settings,
          scenarioId: nextScenarioId,
          elapsedSeconds: state.settings.elapsedSeconds + dt,
          floodSeverity: Math.round(nextSeverity),
          waterLevelMeters: nextWater,
          rainfallMmHr: nextRain,
          emergencyMode: nextEmergency,
        },
      };
    }

    case 'SET_SEVERITY': {
      const clamped = Math.max(0, Math.min(100, Math.round(action.severity)));
      const mappedWater = Number(((clamped / 100) * 2.5).toFixed(2));
      const mappedRain = Math.round(clamped * 1.5);
      return {
        ...state,
        settings: {
          ...state.settings,
          scenarioId: matchScenarioId({
            floodSeverity: clamped,
            waterLevelMeters: mappedWater,
            rainfallMmHr: mappedRain,
            drainageCapacityPct: state.settings.drainageCapacityPct,
            drainageBlockagePct: state.settings.drainageBlockagePct,
            canalWaterLevelPct: state.settings.canalWaterLevelPct,
            lowLyingSensitivityPct: state.settings.lowLyingSensitivityPct,
          }),
          floodSeverity: clamped,
          waterLevelMeters: mappedWater,
          rainfallMmHr: mappedRain,
          emergencyMode: clamped >= 65,
        },
      };
    }

    case 'SET_WATER_LEVEL': {
      const meters = Number(Math.max(0, Math.min(2.5, action.meters)).toFixed(2));
      return {
        ...state,
        settings: {
          ...state.settings,
          scenarioId: matchScenarioId({
            floodSeverity: state.settings.floodSeverity,
            waterLevelMeters: meters,
            rainfallMmHr: state.settings.rainfallMmHr,
            drainageCapacityPct: state.settings.drainageCapacityPct,
            drainageBlockagePct: state.settings.drainageBlockagePct,
            canalWaterLevelPct: state.settings.canalWaterLevelPct,
            lowLyingSensitivityPct: state.settings.lowLyingSensitivityPct,
          }),
          waterLevelMeters: meters,
        },
      };
    }

    case 'SET_SPEED':
      return {
        ...state,
        settings: {
          ...state.settings,
          simulationSpeed: action.speed,
        },
      };

    case 'SET_AFFECTED_AREA':
      return {
        ...state,
        settings: {
          ...state.settings,
          affectedAreaId: action.areaId,
        },
        focusAreaSignal: state.focusAreaSignal + 1,
      };

    case 'SELECT_PRESET': {
      const preset = SCENARIO_PRESETS.find((p) => p.id === action.presetId);
      if (!preset) return state;
      const nextCongestion =
        PRESET_TRAFFIC_CONGESTION_PCT[preset.id] ?? state.trafficCongestionPct;
      const nextIncidents =
        preset.id === 'baseline'
          ? state.roadIncidents.map((inc) => ({ ...inc, active: false }))
          : preset.id === 'severe'
            ? state.roadIncidents.map((inc) => ({ ...inc, active: true }))
            : state.roadIncidents;

      return {
        ...state,
        trafficCongestionPct: nextCongestion,
        roadIncidents: nextIncidents,
        settings: {
          ...state.settings,
          scenarioId: preset.id,
          floodSeverity: preset.floodSeverity,
          rainfallMmHr: preset.rainfallMmHr,
          waterLevelMeters: preset.waterLevelMeters,
          drainageCapacityPct: preset.drainageCapacityPct,
          drainageBlockagePct: preset.drainageBlockagePct,
          canalWaterLevelPct: preset.canalWaterLevelPct,
          lowLyingSensitivityPct: preset.lowLyingSensitivityPct,
          emergencyMode: preset.emergencyMode,
        },
      };
    }

    case 'SET_FLOOD_AUTO_RISE':
      return {
        ...state,
        settings: {
          ...state.settings,
          floodAutoRise: action.enabled,
        },
      };

    case 'SET_FLOOD_OPACITY':
      return {
        ...state,
        settings: {
          ...state.settings,
          floodOpacity: Number(Math.max(0.25, Math.min(1, action.opacity)).toFixed(2)),
        },
      };

    case 'RESET_FLOOD_LAYER':
      return {
        ...state,
        settings: {
          ...state.settings,
          scenarioId: 'custom',
          floodSeverity: 0,
          waterLevelMeters: 0,
          rainfallMmHr: 0,
          emergencyMode: false,
          floodAutoRise: false,
        },
        resetFloodSignal: state.resetFloodSignal + 1,
      };

    case 'UPDATE_SETTINGS': {
      const merged = { ...state.settings, ...action.patch };
      if (action.patch.scenarioId === undefined) {
        merged.scenarioId = matchScenarioId({
          floodSeverity: merged.floodSeverity,
          waterLevelMeters: merged.waterLevelMeters,
          rainfallMmHr: merged.rainfallMmHr,
          drainageCapacityPct: merged.drainageCapacityPct,
          drainageBlockagePct: merged.drainageBlockagePct,
          canalWaterLevelPct: merged.canalWaterLevelPct,
          lowLyingSensitivityPct: merged.lowLyingSensitivityPct,
        });
      }
      return {
        ...state,
        settings: merged,
      };
    }

    case 'TOGGLE_LAYER':
      return {
        ...state,
        layers: {
          ...state.layers,
          [action.key]: !state.layers[action.key],
        },
      };

    case 'SET_LIGHTING':
      return { ...state, lightingMode: action.mode };

    case 'SET_CITY_LOADING':
      return { ...state, cityStatus: 'loading', cityError: null };

    case 'SET_CITY_LOADED': {
      const nextGraph = action.roadGraph ?? state.roadGraph;
      const nextIncidents =
        state.roadIncidents.length > 0
          ? state.roadIncidents
          : buildPresetRoadIncidents(nextGraph ?? null, state.settings.scenarioId !== 'baseline');
      const nextHistory =
        state.scenarioHistory.length > 0
          ? state.scenarioHistory
          : [createInitialBaselineSnapshot(nextIncidents)];
      return {
        ...state,
        cityStatus: 'ready',
        cityError: null,
        cityStats: action.stats,
        areas: action.areas.length ? action.areas : INITIAL_AFFECTED_AREAS,
        affectedAreas: action.areas.length ? action.areas : INITIAL_AFFECTED_AREAS,
        impactCatalog: action.catalog ?? state.impactCatalog,
        roadGraph: nextGraph,
        waterNetwork: action.waterNetwork ?? state.waterNetwork,
        powerNetwork: action.powerNetwork ?? state.powerNetwork,
        waypoints: action.waypoints ?? state.waypoints,
        roadIncidents: nextIncidents,
        scenarioHistory: nextHistory,
      } as SimulationState;
    }

    case 'SET_CITY_ERROR':
      return { ...state, cityStatus: 'error', cityError: action.error };

    case 'SET_WATER_INFLOW_MULTIPLIER':
      return {
        ...state,
        waterInflowMultiplierPct: Math.max(50, Math.min(200, Math.round(action.pct))),
      };

    case 'TOGGLE_WATER_BLOCKED_SEGMENT': {
      const exists = state.waterBlockedEdgeIds.includes(action.edgeId);
      return {
        ...state,
        waterBlockedEdgeIds: exists
          ? state.waterBlockedEdgeIds.filter((id) => id !== action.edgeId)
          : [...state.waterBlockedEdgeIds, action.edgeId],
        layers: { ...state.layers, waterNetworkOverlay: true },
      };
    }

    case 'SET_WATER_DISCHARGE_STRATEGY':
      return {
        ...state,
        waterDischargeStrategyId: action.strategyId,
        layers: { ...state.layers, waterNetworkOverlay: true },
      };

    case 'RESET_WATER_MANAGEMENT':
      return {
        ...state,
        waterInflowMultiplierPct: 100,
        waterBlockedEdgeIds: [],
        waterDischargeStrategyId: 'none',
      };

    case 'APPLY_POWER_OUTAGE_SCENARIO': {
      const layers = { ...state.layers, powerNetworkOverlay: true };
      if (action.scenario === 'none') {
        return {
          ...state,
          layers,
          powerOutageScenario: 'none',
          powerDemandMultiplierPct: 100,
          powerFailedNodeIds: [],
          powerFailedEdgeIds: [],
          powerIsolatedIds: [],
          powerActiveBackupEdgeIds: [],
          powerRestoredAreaIds: [],
        };
      }
      if (action.scenario === 'substation_failure') {
        return {
          ...state,
          layers,
          powerOutageScenario: 'substation_failure',
          powerDemandMultiplierPct: 105,
          powerFailedNodeIds: ['sub-bangsue'],
          powerFailedEdgeIds: [],
          powerIsolatedIds: [],
          powerActiveBackupEdgeIds: [],
          powerRestoredAreaIds: [],
        };
      }
      if (action.scenario === 'line_failure') {
        return {
          ...state,
          layers,
          powerOutageScenario: 'line_failure',
          powerDemandMultiplierPct: 105,
          powerFailedNodeIds: [],
          powerFailedEdgeIds: ['edge-sub-latphrao-tx-phahon'],
          powerIsolatedIds: [],
          powerActiveBackupEdgeIds: [],
          powerRestoredAreaIds: [],
        };
      }
      if (action.scenario === 'transformer_fault') {
        return {
          ...state,
          layers,
          powerOutageScenario: 'transformer_fault',
          powerDemandMultiplierPct: 105,
          powerFailedNodeIds: ['tx-khlongprem'],
          powerFailedEdgeIds: [],
          powerIsolatedIds: [],
          powerActiveBackupEdgeIds: [],
          powerRestoredAreaIds: [],
        };
      }
      if (action.scenario === 'excessive_demand') {
        return {
          ...state,
          layers,
          powerOutageScenario: 'excessive_demand',
          powerDemandMultiplierPct: 175,
          powerFailedNodeIds: [],
          powerFailedEdgeIds: [],
          powerIsolatedIds: [],
          powerActiveBackupEdgeIds: [],
          powerRestoredAreaIds: [],
        };
      }
      // weather_disruption: couple to Flood Simulation and raise flood stress if currently low
      const needsStormBump =
        state.settings.waterLevelMeters < 0.9 || state.settings.floodSeverity < 68;
      return {
        ...state,
        layers: { ...layers, floodOverlay: true },
        powerOutageScenario: 'weather_disruption',
        powerDemandMultiplierPct: 112,
        powerFailedNodeIds: [],
        powerFailedEdgeIds: [],
        powerIsolatedIds: [],
        powerActiveBackupEdgeIds: [],
        powerRestoredAreaIds: [],
        powerWeatherCouplingEnabled: true,
        settings: needsStormBump
          ? {
              ...state.settings,
              scenarioId: 'custom',
              floodSeverity: 74,
              waterLevelMeters: 1.05,
              rainfallMmHr: 128,
              emergencyMode: true,
            }
          : state.settings,
      };
    }

    case 'TOGGLE_POWER_FAULT': {
      if (action.targetKind === 'node') {
        const exists = state.powerFailedNodeIds.includes(action.id);
        return {
          ...state,
          powerOutageScenario: 'none',
          powerFailedNodeIds: exists
            ? state.powerFailedNodeIds.filter((id) => id !== action.id)
            : [...state.powerFailedNodeIds, action.id],
          powerRestoredAreaIds: [],
          layers: { ...state.layers, powerNetworkOverlay: true },
        };
      }
      const exists = state.powerFailedEdgeIds.includes(action.id);
      return {
        ...state,
        powerOutageScenario: 'none',
        powerFailedEdgeIds: exists
          ? state.powerFailedEdgeIds.filter((id) => id !== action.id)
          : [...state.powerFailedEdgeIds, action.id],
        powerRestoredAreaIds: [],
        layers: { ...state.layers, powerNetworkOverlay: true },
      };
    }

    case 'SET_POWER_DEMAND_MULTIPLIER':
      return {
        ...state,
        powerDemandMultiplierPct: Math.max(60, Math.min(220, Math.round(action.pct))),
        layers: { ...state.layers, powerNetworkOverlay: true },
      };

    case 'TOGGLE_POWER_WEATHER_COUPLING':
      return {
        ...state,
        powerWeatherCouplingEnabled: action.enabled,
      };

    case 'ISOLATE_POWER_ELEMENT': {
      const exists = state.powerIsolatedIds.includes(action.id);
      return {
        ...state,
        powerIsolatedIds: exists
          ? state.powerIsolatedIds.filter((id) => id !== action.id)
          : [...state.powerIsolatedIds, action.id],
        layers: { ...state.layers, powerNetworkOverlay: true },
      };
    }

    case 'TOGGLE_POWER_BACKUP_PATH': {
      const exists = state.powerActiveBackupEdgeIds.includes(action.edgeId);
      return {
        ...state,
        powerActiveBackupEdgeIds: exists
          ? state.powerActiveBackupEdgeIds.filter((id) => id !== action.edgeId)
          : [...state.powerActiveBackupEdgeIds, action.edgeId],
        layers: { ...state.layers, powerNetworkOverlay: true },
      };
    }

    case 'RESTORE_POWER_SERVICE_AREA': {
      const exists = state.powerRestoredAreaIds.includes(action.areaId);
      return {
        ...state,
        powerRestoredAreaIds: exists
          ? state.powerRestoredAreaIds.filter((id) => id !== action.areaId)
          : [...state.powerRestoredAreaIds, action.areaId],
        layers: { ...state.layers, powerNetworkOverlay: true },
      };
    }

    case 'RESTORE_ALL_FEASIBLE_POWER': {
      if (!state.powerNetwork) return state;
      const isolatedSet = new Set(state.powerIsolatedIds);
      for (const id of state.powerFailedNodeIds) isolatedSet.add(id);
      for (const id of state.powerFailedEdgeIds) isolatedSet.add(id);
      for (const id of action.weatherTrippedIds) isolatedSet.add(id);
      const nextIsolated = [...isolatedSet];

      // Evaluate with isolated faults to find feasible backup ties
      const evalIso = evaluatePowerNetworkSimulation({
        graph: state.powerNetwork,
        settings: state.settings,
        activeOutageScenario: state.powerOutageScenario,
        demandMultiplierPct: state.powerDemandMultiplierPct,
        failedNodeIds: state.powerFailedNodeIds,
        failedEdgeIds: state.powerFailedEdgeIds,
        isolatedIds: nextIsolated,
        activeBackupEdgeIds: state.powerActiveBackupEdgeIds,
        restoredAreaIds: state.powerRestoredAreaIds,
        weatherCouplingEnabled: state.powerWeatherCouplingEnabled,
      });

      const nextBackups = new Set(state.powerActiveBackupEdgeIds);
      const coveredAreas = new Set<string>();
      if (evalIso) {
        for (const opt of evalIso.backupOptions) {
          if (opt.isActive) {
            opt.restorableAreaIds.forEach((aid) => coveredAreas.add(aid));
          }
        }
        for (const opt of evalIso.backupOptions) {
          if (!opt.isFeasible || opt.wouldOverload) continue;
          const addsCoverage = opt.restorableAreaIds.some((aid) => !coveredAreas.has(aid));
          if (addsCoverage) {
            nextBackups.add(opt.edgeId);
            opt.restorableAreaIds.forEach((aid) => coveredAreas.add(aid));
          }
        }
      }

      const evalAfterBackup = evaluatePowerNetworkSimulation({
        graph: state.powerNetwork,
        settings: state.settings,
        activeOutageScenario: state.powerOutageScenario,
        demandMultiplierPct: state.powerDemandMultiplierPct,
        failedNodeIds: state.powerFailedNodeIds,
        failedEdgeIds: state.powerFailedEdgeIds,
        isolatedIds: nextIsolated,
        activeBackupEdgeIds: [...nextBackups],
        restoredAreaIds: state.powerRestoredAreaIds,
        weatherCouplingEnabled: state.powerWeatherCouplingEnabled,
      });

      const nextRestored = new Set(state.powerRestoredAreaIds);
      if (evalAfterBackup) {
        for (const sa of evalAfterBackup.serviceAreas) {
          if (sa.canRestoreNow) nextRestored.add(sa.node.id);
        }
      }

      return {
        ...state,
        powerIsolatedIds: nextIsolated,
        powerActiveBackupEdgeIds: [...nextBackups],
        powerRestoredAreaIds: [...nextRestored],
        layers: { ...state.layers, powerNetworkOverlay: true },
      };
    }

    case 'RESET_POWER_MANAGEMENT':
      return {
        ...state,
        powerOutageScenario: 'none',
        powerDemandMultiplierPct: 100,
        powerFailedNodeIds: [],
        powerFailedEdgeIds: [],
        powerIsolatedIds: [],
        powerActiveBackupEdgeIds: [],
        powerRestoredAreaIds: [],
        powerWeatherCouplingEnabled: true,
      };

    case 'SET_ROUTE_ORIGIN':
      return {
        ...state,
        routeOriginId: action.id,
        selectedRouteIndex: 0,
        layers: { ...state.layers, routeOverlay: true },
      };

    case 'SET_ROUTE_DEST':
      return {
        ...state,
        routeDestId: action.id,
        selectedRouteIndex: 0,
        layers: { ...state.layers, routeOverlay: true },
      };

    case 'SWAP_ROUTE_ENDPOINTS':
      return {
        ...state,
        routeOriginId: state.routeDestId,
        routeDestId: state.routeOriginId,
        selectedRouteIndex: 0,
      };

    case 'SET_VEHICLE_PROFILE':
      return {
        ...state,
        vehicleProfile: action.profile,
        selectedRouteIndex: 0,
      };

    case 'SET_ROUTE_MODE':
      return {
        ...state,
        routeMode: action.mode,
        selectedRouteIndex: 0,
        layers: { ...state.layers, routeOverlay: true },
      };

    case 'SET_RISK_WEIGHTS':
      return {
        ...state,
        riskWeights: {
          ...state.riskWeights,
          ...action.patch,
        },
        selectedRouteIndex: 0,
      };

    case 'SET_TRAFFIC_STATUS':
      return {
        ...state,
        trafficStatus: action.status,
      };

    case 'RESET_TRAFFIC_SIMULATION':
      return {
        ...state,
        trafficStatus: 'running',
        trafficCongestionPct: DEFAULT_TRAFFIC_CONGESTION_PCT,
        trafficLightTiming: { ...DEFAULT_TRAFFIC_LIGHT_TIMING },
        roadIncidents: buildPresetRoadIncidents(state.roadGraph, state.settings.scenarioId !== 'baseline'),
        selectedRouteIndex: 0,
      };

    case 'SET_TRAFFIC_LIGHT_TIMING': {
      const clampVal = (v: number | undefined, fallback: number, min: number, max: number) =>
        v === undefined ? fallback : Math.max(min, Math.min(max, Math.round(v)));
      return {
        ...state,
        trafficLightTiming: {
          greenSeconds: clampVal(action.patch.greenSeconds, state.trafficLightTiming.greenSeconds, 6, 45),
          yellowSeconds: clampVal(action.patch.yellowSeconds, state.trafficLightTiming.yellowSeconds, 2, 8),
          redSeconds: clampVal(action.patch.redSeconds, state.trafficLightTiming.redSeconds, 6, 45),
        },
        selectedRouteIndex: 0,
      };
    }

    case 'SET_TRAFFIC_CONGESTION':
      return {
        ...state,
        trafficCongestionPct: Math.max(0, Math.min(100, Math.round(action.pct))),
        selectedRouteIndex: 0,
      };

    case 'TOGGLE_ROAD_INCIDENT':
      return {
        ...state,
        roadIncidents: state.roadIncidents.map((inc) =>
          inc.id === action.incidentId ? { ...inc, active: !inc.active } : inc
        ),
        layers: { ...state.layers, routeOverlay: true },
      };

    case 'REMOVE_ROAD_INCIDENT':
      return {
        ...state,
        roadIncidents: state.roadIncidents.filter((inc) => inc.id !== action.incidentId),
      };

    case 'ADD_TRAFFIC_INCIDENT': {
      const defaults = buildIncidentDefaults(action.kind);
      const existing = state.roadIncidents.find(
        (inc) => inc.roadId === action.roadId && inc.kind === action.kind
      );
      const nextVolume =
        typeof action.volumeBoostPct === 'number' && action.volumeBoostPct > 0
          ? Math.min(100, Math.round(state.trafficCongestionPct + action.volumeBoostPct))
          : state.trafficCongestionPct;

      if (existing) {
        return {
          ...state,
          trafficCongestionPct: nextVolume,
          roadIncidents: state.roadIncidents.map((inc) =>
            inc.id === existing.id ? { ...inc, active: true } : inc
          ),
          layers: { ...state.layers, traffic: true, trafficDensityOverlay: true },
        };
      }

      const newIncident: SimulatedRoadIncident = {
        id: `user-${action.kind}-${action.roadId}-${Date.now().toString(36).slice(-4)}`,
        roadId: action.roadId,
        roadName: action.roadName,
        highway: action.highway,
        kind: action.kind,
        severity: defaults.severity,
        blocksRoad: defaults.blocksRoad,
        centerX: action.centerX,
        centerZ: action.centerZ,
        speedFactor: defaults.speedFactor,
        active: true,
        source: 'user',
      };
      return {
        ...state,
        trafficCongestionPct: nextVolume,
        roadIncidents: [newIncident, ...state.roadIncidents],
        layers: { ...state.layers, traffic: true, trafficDensityOverlay: true },
      };
    }

    case 'TOGGLE_CUSTOM_ROAD_INCIDENT': {
      const existing = state.roadIncidents.find(
        (inc) => inc.roadId === action.roadId && inc.kind === action.kind
      );
      if (existing) {
        if (existing.source === 'preset') {
          return {
            ...state,
            roadIncidents: state.roadIncidents.map((inc) =>
              inc.id === existing.id ? { ...inc, active: !inc.active } : inc
            ),
            layers: { ...state.layers, routeOverlay: true },
          };
        }
        return {
          ...state,
          roadIncidents: state.roadIncidents.filter((inc) => inc.id !== existing.id),
          layers: { ...state.layers, routeOverlay: true },
        };
      }

      const defaults = buildIncidentDefaults(action.kind);
      const newIncident: SimulatedRoadIncident = {
        id: `user-${action.kind}-${action.roadId}`,
        roadId: action.roadId,
        roadName: action.roadName,
        highway: action.highway,
        kind: action.kind,
        severity: defaults.severity,
        blocksRoad: defaults.blocksRoad,
        centerX: action.centerX,
        centerZ: action.centerZ,
        speedFactor: defaults.speedFactor,
        active: true,
        source: 'user',
      };
      return {
        ...state,
        roadIncidents: [newIncident, ...state.roadIncidents],
        layers: { ...state.layers, routeOverlay: true },
      };
    }

    case 'RESET_ROAD_CONDITIONS':
      return {
        ...state,
        routeMode: 'safest',
        riskWeights: { ...DEFAULT_RISK_WEIGHTS },
        trafficCongestionPct: DEFAULT_TRAFFIC_CONGESTION_PCT,
        trafficLightTiming: { ...DEFAULT_TRAFFIC_LIGHT_TIMING },
        roadIncidents: buildPresetRoadIncidents(state.roadGraph, true),
        selectedRouteIndex: 0,
      };

    case 'SELECT_ROUTE_INDEX':
      return {
        ...state,
        selectedRouteIndex: action.index,
        layers: { ...state.layers, routeOverlay: true },
      };

    case 'SET_CUSTOM_WAYPOINT_ROLE': {
      const nextCustom = upsertCustomWaypoint(state.customWaypoints, action.waypoint);
      return {
        ...state,
        customWaypoints: nextCustom,
        routeOriginId: action.role === 'origin' ? action.waypoint.id : state.routeOriginId,
        routeDestId: action.role === 'destination' ? action.waypoint.id : state.routeDestId,
        selectedRouteIndex: 0,
        layers: { ...state.layers, routeOverlay: true },
        activeSection: 'routing',
        focusRouteSignal: state.focusRouteSignal + 1,
      };
    }

    case 'FOCUS_ROUTE':
      return {
        ...state,
        layers: { ...state.layers, routeOverlay: true },
        focusRouteSignal: state.focusRouteSignal + 1,
      };

    case 'FOCUS_SCENE_POINT':
      return {
        ...state,
        focusPointTarget: { x: action.x, z: action.z, span: action.span },
        focusPointSignal: state.focusPointSignal + 1,
      };

    case 'SELECT_BUILDING':
      return {
        ...state,
        selectedBuilding: action.building,
        selectedRoad: action.building ? null : state.selectedRoad,
        selectedPlace: action.building ? null : state.selectedPlace,
        selectedImpactObject: null,
      };

    case 'SELECT_ROAD':
      return {
        ...state,
        selectedRoad: action.road,
        selectedBuilding: action.road ? null : state.selectedBuilding,
        selectedPlace: action.road ? null : state.selectedPlace,
        selectedImpactObject: null,
      };

    case 'SELECT_PLACE':
      return {
        ...state,
        selectedPlace: action.place,
        selectedBuilding: null,
        selectedRoad: null,
        selectedImpactObject: null,
      };

    case 'SELECT_IMPACT_OBJECT': {
      const item = action.item;
      return {
        ...state,
        selectedImpactObject: item,
        selectedBuilding: item.buildingInfo ?? null,
        selectedRoad: item.roadInfo ?? null,
        selectedPlace: null,
        locateTargetSignal: state.locateTargetSignal + 1,
      };
    }

    case 'CLEAR_SELECTION':
      return {
        ...state,
        selectedBuilding: null,
        selectedRoad: null,
        selectedPlace: null,
        selectedImpactObject: null,
        clearSelectionSignal: state.clearSelectionSignal + 1,
      };

    case 'SAVE_SCENARIO_SNAPSHOT': {
      const snap = buildSnapshotFromState(state, {
        label: action.label,
        source: action.source,
        solutionId: action.solutionId,
      });
      return {
        ...state,
        scenarioHistory: [...state.scenarioHistory, snap].slice(-20),
      };
    }

    case 'RESTORE_SCENARIO_SNAPSHOT': {
      const snap = state.scenarioHistory.find((s) => s.id === action.snapshotId);
      if (!snap) return state;
      const isRollingBackApplied =
        state.whatIfCommittedRecord !== null &&
        state.whatIfCommittedRecord.afterSnapshotId !== snap.id;
      return {
        ...state,
        settings: { ...snap.settings },
        trafficCongestionPct: snap.trafficCongestionPct,
        trafficLightTiming: snap.trafficLightTiming
          ? { ...snap.trafficLightTiming }
          : { ...DEFAULT_TRAFFIC_LIGHT_TIMING },
        vehicleProfile: snap.vehicleProfile,
        routeMode: snap.routeMode,
        roadIncidents: snap.roadIncidents.map((inc) => ({ ...inc })),
        waterInflowMultiplierPct: snap.waterInflowMultiplierPct ?? 100,
        waterBlockedEdgeIds: snap.waterBlockedEdgeIds ? [...snap.waterBlockedEdgeIds] : [],
        waterDischargeStrategyId: snap.waterDischargeStrategyId ?? 'none',
        powerOutageScenario: snap.powerOutageScenario ?? 'none',
        powerDemandMultiplierPct: snap.powerDemandMultiplierPct ?? 100,
        powerFailedNodeIds: snap.powerFailedNodeIds ? [...snap.powerFailedNodeIds] : [],
        powerFailedEdgeIds: snap.powerFailedEdgeIds ? [...snap.powerFailedEdgeIds] : [],
        powerIsolatedIds: snap.powerIsolatedIds ? [...snap.powerIsolatedIds] : [],
        powerActiveBackupEdgeIds: snap.powerActiveBackupEdgeIds
          ? [...snap.powerActiveBackupEdgeIds]
          : [],
        powerRestoredAreaIds: snap.powerRestoredAreaIds ? [...snap.powerRestoredAreaIds] : [],
        powerWeatherCouplingEnabled: snap.powerWeatherCouplingEnabled ?? true,
        selectedRouteIndex: 0,
        ...(isRollingBackApplied
          ? {
              whatIfCommittedRecord: null,
              whatIfBaselineSnapshotId: null,
              previewMcdaSolutionId: null,
              whatIfWorkflowStep:
                state.whatIfWorkflowStep === 'results' ? 'preview' : state.whatIfWorkflowStep,
            }
          : {}),
      };
    }

    case 'DELETE_SCENARIO_SNAPSHOT':
      return {
        ...state,
        scenarioHistory: state.scenarioHistory.filter(
          (s) => s.id === 'snapshot-initial' || s.id !== action.snapshotId
        ),
      };

    case 'APPLY_MITIGATION_SOLUTION': {
      const derived = deriveMitigationInputs(action.solutionId, {
        settings: state.settings,
        trafficCongestionPct: state.trafficCongestionPct,
        incidents: state.roadIncidents,
        vehicleProfile: state.vehicleProfile,
      });
      const clearWaterBlocks =
        action.solutionId === 'drainage_clearance' ||
        action.solutionId === 'integrated_response';
      const nextDischarge =
        action.solutionId === 'retention_canal' || action.solutionId === 'integrated_response'
          ? 'auto_balanced'
          : state.waterDischargeStrategyId;
      const nextState: SimulationState = {
        ...state,
        settings: derived.settings,
        trafficCongestionPct: derived.trafficCongestionPct,
        roadIncidents: derived.incidents,
        vehicleProfile: derived.vehicleProfile,
        waterBlockedEdgeIds: clearWaterBlocks ? [] : state.waterBlockedEdgeIds,
        waterDischargeStrategyId: nextDischarge,
        selectedRouteIndex: 0,
      };
      const snap = buildSnapshotFromState(nextState, {
        label: action.label,
        source: 'solution',
        solutionId: action.solutionId,
      });
      return {
        ...nextState,
        scenarioHistory: [...state.scenarioHistory, snap].slice(-20),
      };
    }

    case 'RESET_TO_ORIGINAL_BASELINE': {
      const initialSnap = state.scenarioHistory.find((s) => s.id === 'snapshot-initial');
      if (initialSnap) {
        return {
          ...state,
          settings: { ...initialSnap.settings },
          trafficCongestionPct: initialSnap.trafficCongestionPct,
          trafficLightTiming: initialSnap.trafficLightTiming
            ? { ...initialSnap.trafficLightTiming }
            : { ...DEFAULT_TRAFFIC_LIGHT_TIMING },
          vehicleProfile: initialSnap.vehicleProfile,
          routeMode: initialSnap.routeMode,
          roadIncidents: initialSnap.roadIncidents.map((inc) => ({ ...inc })),
          waterInflowMultiplierPct: initialSnap.waterInflowMultiplierPct ?? 100,
          waterBlockedEdgeIds: initialSnap.waterBlockedEdgeIds
            ? [...initialSnap.waterBlockedEdgeIds]
            : [],
          waterDischargeStrategyId: initialSnap.waterDischargeStrategyId ?? 'none',
          powerOutageScenario: initialSnap.powerOutageScenario ?? 'none',
          powerDemandMultiplierPct: initialSnap.powerDemandMultiplierPct ?? 100,
          powerFailedNodeIds: initialSnap.powerFailedNodeIds
            ? [...initialSnap.powerFailedNodeIds]
            : [],
          powerFailedEdgeIds: initialSnap.powerFailedEdgeIds
            ? [...initialSnap.powerFailedEdgeIds]
            : [],
          powerIsolatedIds: initialSnap.powerIsolatedIds
            ? [...initialSnap.powerIsolatedIds]
            : [],
          powerActiveBackupEdgeIds: initialSnap.powerActiveBackupEdgeIds
            ? [...initialSnap.powerActiveBackupEdgeIds]
            : [],
          powerRestoredAreaIds: initialSnap.powerRestoredAreaIds
            ? [...initialSnap.powerRestoredAreaIds]
            : [],
          powerWeatherCouplingEnabled: initialSnap.powerWeatherCouplingEnabled ?? true,
          selectedRouteIndex: 0,
          whatIfCommittedRecord: null,
          whatIfBaselineSnapshotId: null,
          previewMcdaSolutionId: null,
          whatIfWorkflowStep: 'problem',
        };
      }
      return {
        ...state,
        settings: { ...INITIAL_SIMULATION_SETTINGS },
        trafficCongestionPct: DEFAULT_TRAFFIC_CONGESTION_PCT,
        trafficLightTiming: { ...DEFAULT_TRAFFIC_LIGHT_TIMING },
        vehicleProfile: INITIAL_STATE.vehicleProfile,
        routeMode: INITIAL_STATE.routeMode,
        roadIncidents: buildPresetRoadIncidents(state.roadGraph, true),
        waterInflowMultiplierPct: 100,
        waterBlockedEdgeIds: [],
        waterDischargeStrategyId: 'none',
        powerOutageScenario: 'none',
        powerDemandMultiplierPct: 100,
        powerFailedNodeIds: [],
        powerFailedEdgeIds: [],
        powerIsolatedIds: [],
        powerActiveBackupEdgeIds: [],
        powerRestoredAreaIds: [],
        powerWeatherCouplingEnabled: true,
        selectedRouteIndex: 0,
        whatIfCommittedRecord: null,
        whatIfBaselineSnapshotId: null,
        previewMcdaSolutionId: null,
        whatIfWorkflowStep: 'problem',
      };
    }

    case 'SYNC_DSS_DETECTION_TIMESTAMPS': {
      const nextMap: Record<string, number> = {};
      let changed = false;
      const activeSet = new Set(action.problemIds);
      for (const pid of action.problemIds) {
        if (state.dssDetectionTimestamps[pid] !== undefined) {
          nextMap[pid] = state.dssDetectionTimestamps[pid];
        } else {
          nextMap[pid] = Math.round(action.elapsedSeconds);
          changed = true;
        }
      }
      for (const oldKey of Object.keys(state.dssDetectionTimestamps)) {
        if (!activeSet.has(oldKey)) {
          changed = true;
          break;
        }
      }
      return changed ? { ...state, dssDetectionTimestamps: nextMap } : state;
    }

    case 'SET_SELECTED_DSS_PROBLEM':
      return {
        ...state,
        selectedDssProblemId: action.problemId,
        previewMcdaSolutionId: null,
        whatIfSelectedSolutionId: null,
        whatIfParameterOverrides: { ...EMPTY_WHATIF_OVERRIDES },
      };

    case 'SET_PREVIEW_MCDA_SOLUTION':
      return {
        ...state,
        previewMcdaSolutionId: action.solutionId,
        layers: action.solutionId
          ? { ...state.layers, decisionPreviewOverlay: true }
          : state.layers,
      };

    case 'TOGGLE_COMPARE_MCDA_SOLUTION': {
      const exists = state.comparedMcdaSolutionIds.includes(action.solutionId);
      return {
        ...state,
        comparedMcdaSolutionIds: exists
          ? state.comparedMcdaSolutionIds.filter((id) => id !== action.solutionId)
          : [...state.comparedMcdaSolutionIds, action.solutionId].slice(-4),
      };
    }

    case 'SET_MCDA_CRITERION_WEIGHT': {
      const updated = state.mcdaCriteria.map((c) =>
        c.id === action.id
          ? { ...c, rawWeight: Math.max(0, Math.min(100, Math.round(action.weight))) }
          : c
      );
      return {
        ...state,
        mcdaCriteria: normalizeMcdaCriteria(updated),
        mcdaWeightPresetId: 'custom',
      };
    }

    case 'TOGGLE_MCDA_CRITERION_ENABLED': {
      const enabledCount = state.mcdaCriteria.filter((c) => c.enabled).length;
      const target = state.mcdaCriteria.find((c) => c.id === action.id);
      if (target?.enabled && enabledCount <= 1) return state;
      const updated = state.mcdaCriteria.map((c) =>
        c.id === action.id ? { ...c, enabled: !c.enabled } : c
      );
      return {
        ...state,
        mcdaCriteria: normalizeMcdaCriteria(updated),
        mcdaWeightPresetId: 'custom',
      };
    }

    case 'APPLY_MCDA_WEIGHT_PRESET':
      return {
        ...state,
        mcdaCriteria: createCriteriaFromPreset(action.presetId),
        mcdaWeightPresetId: action.presetId,
      };

    case 'RECORD_MCDA_AUDIT':
      return {
        ...state,
        mcdaAuditHistory: [action.snapshot, ...state.mcdaAuditHistory].slice(0, 20),
      };

    case 'CONFIRM_APPLY_MCDA_SOLUTION': {
      const sol = action.solution;
      if (!sol.isFeasible || sol.actionPatch.kind === 'noop_blocked') return state;

      // Save revert snapshot BEFORE applying confirmed solution
      const preSnap = buildSnapshotFromState(state, {
        label: `Before MCDA: ${sol.title.slice(0, 36)}`,
        source: 'solution',
      });

      const applied = applySolutionPatchToSimulationState(
        state,
        sol,
        EMPTY_WHATIF_OVERRIDES
      );

      return {
        ...state,
        settings: applied.settings,
        layers: applied.layers,
        waterBlockedEdgeIds: applied.waterBlockedEdgeIds,
        waterDischargeStrategyId: applied.waterDischargeStrategyId,
        powerDemandMultiplierPct: applied.powerDemandMultiplierPct,
        powerIsolatedIds: applied.powerIsolatedIds,
        powerActiveBackupEdgeIds: applied.powerActiveBackupEdgeIds,
        powerRestoredAreaIds: applied.powerRestoredAreaIds,
        trafficCongestionPct: applied.trafficCongestionPct,
        trafficLightTiming: applied.trafficLightTiming,
        vehicleProfile: applied.vehicleProfile,
        routeMode: applied.routeMode,
        roadIncidents: applied.roadIncidents,
        selectedRouteIndex: applied.selectedRouteIndex,
        scenarioHistory: [...state.scenarioHistory, preSnap].slice(-20),
        previewMcdaSolutionId: null,
        mcdaAuditHistory: [action.auditSnapshot, ...state.mcdaAuditHistory].slice(0, 20),
      };
    }

    case 'SET_WHATIF_STEP':
      return {
        ...state,
        whatIfWorkflowStep: action.step,
      };

    case 'SELECT_WHATIF_SOLUTION':
      return {
        ...state,
        whatIfSelectedSolutionId: action.solutionId,
        previewMcdaSolutionId: action.solutionId,
        whatIfParameterOverrides: { ...EMPTY_WHATIF_OVERRIDES },
        whatIfWorkflowStep: action.jumpToStep ?? state.whatIfWorkflowStep,
        layers: action.solutionId
          ? { ...state.layers, decisionPreviewOverlay: true }
          : state.layers,
      };

    case 'UPDATE_WHATIF_OVERRIDES':
      return {
        ...state,
        whatIfParameterOverrides: {
          ...state.whatIfParameterOverrides,
          ...action.patch,
        },
      };

    case 'RESET_WHATIF_OVERRIDES':
      return {
        ...state,
        whatIfParameterOverrides: { ...EMPTY_WHATIF_OVERRIDES },
      };

    case 'COMMIT_WHATIF_SOLUTION': {
      const { preview, problemTitle, problemTitleTh, auditSnapshot } = action;
      if (!preview.isValid) return state;

      const preSnap = buildSnapshotFromState(state, {
        label: `Before What-If: ${preview.solution.title.slice(0, 32)}`,
        source: 'solution',
      });

      const applied = applySolutionPatchToSimulationState(
        state,
        preview.solution,
        state.whatIfParameterOverrides
      );
      const paramDesc = describeSolutionParameters(
        applied,
        preview.solution,
        state.whatIfParameterOverrides
      );

      const postBaseState: SimulationState = {
        ...state,
        settings: applied.settings,
        layers: applied.layers,
        waterBlockedEdgeIds: applied.waterBlockedEdgeIds,
        waterDischargeStrategyId: applied.waterDischargeStrategyId,
        powerDemandMultiplierPct: applied.powerDemandMultiplierPct,
        powerIsolatedIds: applied.powerIsolatedIds,
        powerActiveBackupEdgeIds: applied.powerActiveBackupEdgeIds,
        powerRestoredAreaIds: applied.powerRestoredAreaIds,
        trafficCongestionPct: applied.trafficCongestionPct,
        trafficLightTiming: applied.trafficLightTiming,
        vehicleProfile: applied.vehicleProfile,
        routeMode: applied.routeMode,
        roadIncidents: applied.roadIncidents,
        selectedRouteIndex: applied.selectedRouteIndex,
      };

      const postSnap = buildSnapshotFromState(postBaseState, {
        label: `Applied: ${preview.solution.title.slice(0, 38)}`,
        source: 'solution',
        appliedDssSolution: {
          solutionId: preview.solution.id,
          problemId: preview.solution.problemId,
          title: preview.solution.title,
          titleTh: preview.solution.titleTh,
          parametersSummary: paramDesc.en,
          parametersSummaryTh: paramDesc.th,
        },
      });

      const sessionRecord: WhatIfSessionRecord = {
        id: `whatif-${Date.now().toString(36)}`,
        beforeSnapshotId: preSnap.id,
        afterSnapshotId: postSnap.id,
        problemId: preview.solution.problemId,
        problemTitle,
        problemTitleTh,
        solutionId: preview.solution.id,
        solutionTitle: preview.solution.title,
        solutionTitleTh: preview.solution.titleTh,
        parametersSummary: paramDesc.en,
        parametersSummaryTh: paramDesc.th,
        before: preview.before,
        after: preview.after,
        effectivenessPct: preview.effectivenessPct,
        appliedAtIso: new Date().toISOString(),
        appliedAtSimSeconds: Math.round(state.settings.elapsedSeconds),
      };

      return {
        ...postBaseState,
        scenarioHistory: [...state.scenarioHistory, preSnap, postSnap].slice(-20),
        previewMcdaSolutionId: null,
        whatIfCommittedRecord: sessionRecord,
        whatIfBaselineSnapshotId: preSnap.id,
        whatIfWorkflowStep: 'results',
        mcdaAuditHistory: [auditSnapshot, ...state.mcdaAuditHistory].slice(0, 20),
      };
    }

    case 'SAVE_WHATIF_NAMED_SNAPSHOT': {
      const snap = buildSnapshotFromState(state, {
        label: action.label,
        source: action.appliedDssSolution ? 'solution' : 'manual',
        appliedDssSolution: action.appliedDssSolution,
      });
      return {
        ...state,
        scenarioHistory: [...state.scenarioHistory, snap].slice(-20),
      };
    }

    default:
      return state;
  }
}

interface SimulationContextValue {
  state: SimulationState;
  activeArea: AffectedAreaOption;
  impactAnalysis: ImpactAnalysisResult;
  waterResult: WaterManagementSimulationResult;
  powerResult: PowerNetworkSimulationResult | null;
  allWaypoints: RouteWaypoint[];
  selectableRoadLocations: SelectableRoadLocation[];
  routeResult: RouteOptimizationResult;
  metrics: SummaryMetrics;
  dssBundle: DssEvaluationBundle;
  liveBeforeAfterMetrics: BeforeAfterMetricsSnapshot;
  whatIfPreview: WhatIfSimulationPreview | null;
  setSection: (section: NavSection) => void;
  startSimulation: () => void;
  pauseSimulation: () => void;
  resetSimulation: () => void;
  setSeverity: (severity: number) => void;
  setWaterLevel: (meters: number) => void;
  setSpeed: (speed: SimulationSpeed) => void;
  setAffectedArea: (areaId: string) => void;
  selectPreset: (presetId: ScenarioId) => void;
  setFloodAutoRise: (enabled: boolean) => void;
  setFloodOpacity: (opacity: number) => void;
  resetFloodLayer: () => void;
  updateSettings: (patch: Partial<SimulationSettings>) => void;
  toggleLayer: (key: keyof LayerVisibility) => void;
  setLightingMode: (mode: LightingMode) => void;
  setCityLoading: () => void;
  setCityLoaded: (
    stats: CityStats,
    areas: AffectedAreaOption[],
    catalog?: CityImpactCatalog,
    roadGraph?: RoadGraph,
    waypoints?: RouteWaypoint[],
    waterNetwork?: WaterNetworkGraph,
    powerNetwork?: PowerNetworkGraph
  ) => void;
  setCityError: (error: string) => void;
  setWaterInflowMultiplier: (pct: number) => void;
  toggleWaterBlockedSegment: (edgeId: string) => void;
  setWaterDischargeStrategy: (strategyId: WaterDischargeStrategyId) => void;
  resetWaterManagement: () => void;
  applyPowerOutageScenario: (scenario: PowerOutageScenarioType) => void;
  togglePowerFault: (id: string, targetKind: 'node' | 'edge') => void;
  setPowerDemandMultiplier: (pct: number) => void;
  togglePowerWeatherCoupling: (enabled: boolean) => void;
  isolatePowerElement: (id: string) => void;
  togglePowerBackupPath: (edgeId: string) => void;
  restorePowerServiceArea: (areaId: string) => void;
  restoreAllFeasiblePower: () => void;
  resetPowerManagement: () => void;
  setRouteOrigin: (id: string) => void;
  setRouteDestination: (id: string) => void;
  swapRouteEndpoints: () => void;
  setVehicleProfile: (profile: VehicleProfileId) => void;
  setRouteMode: (mode: RouteOptimizationMode) => void;
  setRiskWeights: (patch: Partial<RouteRiskWeights>) => void;
  setTrafficStatus: (status: TrafficSimulationStatus) => void;
  resetTrafficSimulation: () => void;
  setTrafficLightTiming: (patch: Partial<TrafficLightTiming>) => void;
  setTrafficCongestion: (pct: number) => void;
  toggleRoadIncident: (incidentId: string) => void;
  removeRoadIncident: (incidentId: string) => void;
  addTrafficIncident: (params: {
    roadId: string;
    roadName: string;
    highway: string;
    kind: RoadIncidentKind;
    centerX: number;
    centerZ: number;
    volumeBoostPct?: number;
  }) => void;
  toggleCustomRoadIncident: (params: {
    roadId: string;
    roadName: string;
    highway: string;
    kind: RoadIncidentKind;
    centerX: number;
    centerZ: number;
  }) => void;
  resetRoadConditions: () => void;
  selectRouteIndex: (index: number) => void;
  setCustomWaypointRole: (role: 'origin' | 'destination', waypoint: RouteWaypoint) => void;
  focusRoute: () => void;
  focusScenePoint: (x: number, z: number, span?: number) => void;
  selectBuilding: (building: BuildingInfo | null) => void;
  selectRoad: (road: RoadInfo | null) => void;
  selectPlace: (place: PlaceInfo) => void;
  selectImpactObject: (item: AffectedObjectRecord) => void;
  clearSelection: () => void;
  saveScenarioSnapshot: (
    label?: string,
    source?: ScenarioSnapshot['source'],
    solutionId?: MitigationSolutionId
  ) => void;
  restoreScenarioSnapshot: (snapshotId: string) => void;
  deleteScenarioSnapshot: (snapshotId: string) => void;
  applyMitigationSolution: (solutionId: MitigationSolutionId, label?: string) => void;
  resetToOriginalBaseline: () => void;
  setSelectedDssProblem: (problemId: string | null) => void;
  setPreviewMcdaSolution: (solutionId: string | null) => void;
  toggleCompareMcdaSolution: (solutionId: string) => void;
  setMcdaCriterionWeight: (id: McdaCriterionId, weight: number) => void;
  toggleMcdaCriterionEnabled: (id: McdaCriterionId) => void;
  applyMcdaWeightPreset: (presetId: McdaWeightPresetId) => void;
  confirmAndApplyMcdaSolution: (solutionId: string) => void;
  setWhatIfWorkflowStep: (step: WhatIfWorkflowStep) => void;
  selectWhatIfSolution: (solutionId: string | null, jumpToStep?: WhatIfWorkflowStep) => void;
  openSolutionInWhatIf: (solutionId?: string | null, step?: WhatIfWorkflowStep) => void;
  updateWhatIfOverrides: (patch: Partial<WhatIfParameterOverrides>) => void;
  resetWhatIfOverrides: () => void;
  commitWhatIfSolution: () => void;
  saveWhatIfNamedSnapshot: (label: string) => void;
  rollbackWhatIfBaseline: () => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    simulationReducer,
    INITIAL_STATE,
    (base) => ({
      ...base,
      activeSection: readInitialActiveSection(),
    })
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_SECTION_STORAGE_KEY, state.activeSection);
    } catch {
      // Ignore storage write errors
    }
  }, [state.activeSection]);

  // Advance simulation elapsed clock only when status === 'running'
  useEffect(() => {
    if (state.settings.status !== 'running') return;
    const interval = window.setInterval(() => {
      dispatch({ type: 'TICK_SIMULATION', dtSeconds: 1 });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [state.settings.status]);

  const activeArea = useMemo(
    () =>
      state.affectedAreas.find((a) => a.id === state.settings.affectedAreaId) ||
      state.affectedAreas[0],
    [state.affectedAreas, state.settings.affectedAreaId]
  );

  const impactAnalysis = useMemo(
    () =>
      evaluateFloodImpact(
        state.impactCatalog,
        state.settings,
        activeArea,
        state.affectedAreas
      ),
    [state.impactCatalog, state.settings, activeArea, state.affectedAreas]
  );

  const allWaypoints = useMemo(() => {
    const existingIds = new Set(state.waypoints.map((w) => w.id));
    const extras = state.customWaypoints.filter((w) => !existingIds.has(w.id));
    return [...extras, ...state.waypoints];
  }, [state.waypoints, state.customWaypoints]);

  const selectableRoadLocations = useMemo(
    () => extractSelectableRoadLocations(state.roadGraph),
    [state.roadGraph]
  );

  const routeResult = useMemo(() => {
    const origin =
      allWaypoints.find((w) => w.id === state.routeOriginId) ?? allWaypoints[0] ?? null;
    const destination =
      allWaypoints.find((w) => w.id === state.routeDestId) ??
      allWaypoints[Math.min(4, Math.max(0, allWaypoints.length - 1))] ??
      null;

    return optimizeEmergencyRoutes({
      graph: state.roadGraph,
      impactAnalysis,
      settings: state.settings,
      activeArea,
      origin,
      destination,
      vehicleProfile: state.vehicleProfile,
      routeMode: state.routeMode,
      riskWeights: state.riskWeights,
      trafficCongestionPct: state.trafficCongestionPct,
      trafficLightTiming: state.trafficLightTiming,
      incidents: state.roadIncidents,
    });
  }, [
    state.roadGraph,
    allWaypoints,
    state.routeOriginId,
    state.routeDestId,
    state.vehicleProfile,
    state.routeMode,
    state.riskWeights,
    state.trafficCongestionPct,
    state.trafficLightTiming,
    state.roadIncidents,
    impactAnalysis,
    state.settings,
    activeArea,
  ]);

  const realCorridorCounts = useMemo(
    () =>
      evaluateKeyEmergencyCorridorsCount(
        state.roadGraph,
        state.waypoints,
        impactAnalysis,
        state.settings,
        activeArea,
        state.roadIncidents,
        state.trafficCongestionPct,
        state.trafficLightTiming
      ),
    [
      state.roadGraph,
      state.waypoints,
      impactAnalysis,
      state.settings,
      activeArea,
      state.roadIncidents,
      state.trafficCongestionPct,
      state.trafficLightTiming,
    ]
  );

  const waterResult = useMemo(
    () =>
      evaluateWaterNetworkSimulation({
        graph: state.waterNetwork,
        settings: state.settings,
        inflowMultiplierPct: state.waterInflowMultiplierPct,
        blockedEdgeIds: state.waterBlockedEdgeIds,
        activeStrategyId: state.waterDischargeStrategyId,
      }),
    [
      state.waterNetwork,
      state.settings,
      state.waterInflowMultiplierPct,
      state.waterBlockedEdgeIds,
      state.waterDischargeStrategyId,
    ]
  );

  const powerResult = useMemo(
    () =>
      evaluatePowerNetworkSimulation({
        graph: state.powerNetwork,
        settings: state.settings,
        impactAnalysis,
        activeOutageScenario: state.powerOutageScenario,
        demandMultiplierPct: state.powerDemandMultiplierPct,
        failedNodeIds: state.powerFailedNodeIds,
        failedEdgeIds: state.powerFailedEdgeIds,
        isolatedIds: state.powerIsolatedIds,
        activeBackupEdgeIds: state.powerActiveBackupEdgeIds,
        restoredAreaIds: state.powerRestoredAreaIds,
        weatherCouplingEnabled: state.powerWeatherCouplingEnabled,
      }),
    [
      state.powerNetwork,
      state.settings,
      impactAnalysis,
      state.powerOutageScenario,
      state.powerDemandMultiplierPct,
      state.powerFailedNodeIds,
      state.powerFailedEdgeIds,
      state.powerIsolatedIds,
      state.powerActiveBackupEdgeIds,
      state.powerRestoredAreaIds,
      state.powerWeatherCouplingEnabled,
    ]
  );

  const metrics = useMemo(
    () =>
      computeSimulatedMetrics(
        state.settings,
        state.cityStats?.buildings ?? 6220,
        state.cityStats?.roads ?? 7514,
        state.impactCatalog ? impactAnalysis : undefined,
        realCorridorCounts
      ),
    [
      state.settings,
      state.cityStats,
      state.impactCatalog,
      impactAnalysis,
      realCorridorCounts,
    ]
  );

  const dssBundle = useMemo(
    () =>
      evaluateCentralizedDssAndMcda({
        settings: state.settings,
        activeArea,
        metrics: state.cityStatus === 'ready' ? metrics : null,
        impactAnalysis: state.cityStatus === 'ready' ? impactAnalysis : null,
        waterResult: state.waterNetwork ? waterResult : null,
        powerResult: state.powerNetwork ? powerResult : null,
        routeResult: state.roadGraph ? routeResult : null,
        trafficCongestionPct: state.trafficCongestionPct,
        trafficLightTiming: state.trafficLightTiming,
        roadIncidents: state.roadIncidents,
        detectionTimestamps: state.dssDetectionTimestamps,
        criteria: state.mcdaCriteria,
        selectedProblemId: state.selectedDssProblemId,
      }),
    [
      state.settings,
      activeArea,
      state.cityStatus,
      metrics,
      impactAnalysis,
      state.waterNetwork,
      waterResult,
      state.powerNetwork,
      powerResult,
      state.roadGraph,
      routeResult,
      state.trafficCongestionPct,
      state.trafficLightTiming,
      state.roadIncidents,
      state.dssDetectionTimestamps,
      state.mcdaCriteria,
      state.selectedDssProblemId,
    ]
  );

  useEffect(() => {
    const problemIds = dssBundle.problems.map((p) => p.id);
    dispatch({
      type: 'SYNC_DSS_DETECTION_TIMESTAMPS',
      problemIds,
      elapsedSeconds: state.settings.elapsedSeconds,
    });
  }, [dssBundle.problems, state.settings.elapsedSeconds]);

  const liveBeforeAfterMetrics = useMemo(
    () =>
      extractBeforeAfterMetricsSnapshot({
        settings: state.settings,
        metrics,
        impactAnalysis,
        waterResult,
        powerResult,
        routeResult,
        trafficCongestionPct: state.trafficCongestionPct,
        detectedProblemsCount: dssBundle.problems.length,
      }),
    [
      state.settings,
      metrics,
      impactAnalysis,
      waterResult,
      powerResult,
      routeResult,
      state.trafficCongestionPct,
      dssBundle.problems.length,
    ]
  );

  const activeWhatIfCandidate = useMemo(() => {
    const id = state.whatIfSelectedSolutionId ?? state.previewMcdaSolutionId;
    if (id) {
      const found = dssBundle.candidates.find((c) => c.id === id);
      if (found) return found;
    }
    return dssBundle.recommendedSolution ?? dssBundle.candidates[0] ?? null;
  }, [
    state.whatIfSelectedSolutionId,
    state.previewMcdaSolutionId,
    dssBundle.candidates,
    dssBundle.recommendedSolution,
  ]);

  const whatIfPreview = useMemo<WhatIfSimulationPreview | null>(() => {
    if (!activeWhatIfCandidate || state.cityStatus !== 'ready') return null;
    const origin =
      allWaypoints.find((w) => w.id === state.routeOriginId) ?? allWaypoints[0] ?? null;
    const destination =
      allWaypoints.find((w) => w.id === state.routeDestId) ??
      allWaypoints[Math.min(4, Math.max(0, allWaypoints.length - 1))] ??
      null;

    return runWhatIfSimulationEvaluation({
      baseState: state,
      activeArea,
      allAreas: state.affectedAreas,
      beforeSnapshot: liveBeforeAfterMetrics,
      baseWaterResult: waterResult,
      basePowerResult: powerResult,
      origin,
      destination,
      solution: activeWhatIfCandidate,
      overrides: state.whatIfParameterOverrides,
    });
  }, [
    activeWhatIfCandidate,
    state,
    allWaypoints,
    activeArea,
    liveBeforeAfterMetrics,
    waterResult,
    powerResult,
  ]);

  const setSection = useCallback(
    (section: NavSection) => dispatch({ type: 'SET_SECTION', section }),
    []
  );
  const startSimulation = useCallback(() => dispatch({ type: 'START_SIMULATION' }), []);
  const pauseSimulation = useCallback(() => dispatch({ type: 'PAUSE_SIMULATION' }), []);
  const resetSimulation = useCallback(() => dispatch({ type: 'RESET_SIMULATION' }), []);
  const setSeverity = useCallback(
    (severity: number) => dispatch({ type: 'SET_SEVERITY', severity }),
    []
  );
  const setWaterLevel = useCallback(
    (meters: number) => dispatch({ type: 'SET_WATER_LEVEL', meters }),
    []
  );
  const setSpeed = useCallback(
    (speed: SimulationSpeed) => dispatch({ type: 'SET_SPEED', speed }),
    []
  );
  const setAffectedArea = useCallback(
    (areaId: string) => dispatch({ type: 'SET_AFFECTED_AREA', areaId }),
    []
  );
  const selectPreset = useCallback(
    (presetId: ScenarioId) => dispatch({ type: 'SELECT_PRESET', presetId }),
    []
  );
  const setFloodAutoRise = useCallback(
    (enabled: boolean) => dispatch({ type: 'SET_FLOOD_AUTO_RISE', enabled }),
    []
  );
  const setFloodOpacity = useCallback(
    (opacity: number) => dispatch({ type: 'SET_FLOOD_OPACITY', opacity }),
    []
  );
  const resetFloodLayer = useCallback(() => dispatch({ type: 'RESET_FLOOD_LAYER' }), []);
  const updateSettings = useCallback(
    (patch: Partial<SimulationSettings>) => dispatch({ type: 'UPDATE_SETTINGS', patch }),
    []
  );
  const toggleLayer = useCallback(
    (key: keyof LayerVisibility) => dispatch({ type: 'TOGGLE_LAYER', key }),
    []
  );
  const setLightingMode = useCallback(
    (mode: LightingMode) => dispatch({ type: 'SET_LIGHTING', mode }),
    []
  );
  const setCityLoading = useCallback(() => dispatch({ type: 'SET_CITY_LOADING' }), []);
  const setCityLoaded = useCallback(
    (
      stats: CityStats,
      areas: AffectedAreaOption[],
      catalog?: CityImpactCatalog,
      roadGraph?: RoadGraph,
      waypoints?: RouteWaypoint[],
      waterNetwork?: WaterNetworkGraph,
      powerNetwork?: PowerNetworkGraph
    ) =>
      dispatch({
        type: 'SET_CITY_LOADED',
        stats,
        areas,
        catalog,
        roadGraph,
        waypoints,
        waterNetwork,
        powerNetwork,
      }),
    []
  );
  const setCityError = useCallback(
    (error: string) => dispatch({ type: 'SET_CITY_ERROR', error }),
    []
  );
  const setWaterInflowMultiplier = useCallback(
    (pct: number) => dispatch({ type: 'SET_WATER_INFLOW_MULTIPLIER', pct }),
    []
  );
  const toggleWaterBlockedSegment = useCallback(
    (edgeId: string) => dispatch({ type: 'TOGGLE_WATER_BLOCKED_SEGMENT', edgeId }),
    []
  );
  const setWaterDischargeStrategy = useCallback(
    (strategyId: WaterDischargeStrategyId) =>
      dispatch({ type: 'SET_WATER_DISCHARGE_STRATEGY', strategyId }),
    []
  );
  const resetWaterManagement = useCallback(
    () => dispatch({ type: 'RESET_WATER_MANAGEMENT' }),
    []
  );
  const applyPowerOutageScenario = useCallback(
    (scenario: PowerOutageScenarioType) =>
      dispatch({ type: 'APPLY_POWER_OUTAGE_SCENARIO', scenario }),
    []
  );
  const togglePowerFault = useCallback(
    (id: string, targetKind: 'node' | 'edge') =>
      dispatch({ type: 'TOGGLE_POWER_FAULT', id, targetKind }),
    []
  );
  const setPowerDemandMultiplier = useCallback(
    (pct: number) => dispatch({ type: 'SET_POWER_DEMAND_MULTIPLIER', pct }),
    []
  );
  const togglePowerWeatherCoupling = useCallback(
    (enabled: boolean) => dispatch({ type: 'TOGGLE_POWER_WEATHER_COUPLING', enabled }),
    []
  );
  const isolatePowerElement = useCallback(
    (id: string) => dispatch({ type: 'ISOLATE_POWER_ELEMENT', id }),
    []
  );
  const togglePowerBackupPath = useCallback(
    (edgeId: string) => dispatch({ type: 'TOGGLE_POWER_BACKUP_PATH', edgeId }),
    []
  );
  const restorePowerServiceArea = useCallback(
    (areaId: string) => dispatch({ type: 'RESTORE_POWER_SERVICE_AREA', areaId }),
    []
  );
  const restoreAllFeasiblePower = useCallback(
    () =>
      dispatch({
        type: 'RESTORE_ALL_FEASIBLE_POWER',
        weatherTrippedIds: powerResult?.weatherTrippedIds ?? [],
      }),
    [powerResult?.weatherTrippedIds]
  );
  const resetPowerManagement = useCallback(
    () => dispatch({ type: 'RESET_POWER_MANAGEMENT' }),
    []
  );
  const setRouteOrigin = useCallback(
    (id: string) => dispatch({ type: 'SET_ROUTE_ORIGIN', id }),
    []
  );
  const setRouteDestination = useCallback(
    (id: string) => dispatch({ type: 'SET_ROUTE_DEST', id }),
    []
  );
  const swapRouteEndpoints = useCallback(() => dispatch({ type: 'SWAP_ROUTE_ENDPOINTS' }), []);
  const setVehicleProfile = useCallback(
    (profile: VehicleProfileId) => dispatch({ type: 'SET_VEHICLE_PROFILE', profile }),
    []
  );
  const setRouteMode = useCallback(
    (mode: RouteOptimizationMode) => dispatch({ type: 'SET_ROUTE_MODE', mode }),
    []
  );
  const setRiskWeights = useCallback(
    (patch: Partial<RouteRiskWeights>) => dispatch({ type: 'SET_RISK_WEIGHTS', patch }),
    []
  );
  const setTrafficStatus = useCallback(
    (status: TrafficSimulationStatus) => dispatch({ type: 'SET_TRAFFIC_STATUS', status }),
    []
  );
  const resetTrafficSimulation = useCallback(
    () => dispatch({ type: 'RESET_TRAFFIC_SIMULATION' }),
    []
  );
  const setTrafficLightTiming = useCallback(
    (patch: Partial<TrafficLightTiming>) => dispatch({ type: 'SET_TRAFFIC_LIGHT_TIMING', patch }),
    []
  );
  const setTrafficCongestion = useCallback(
    (pct: number) => dispatch({ type: 'SET_TRAFFIC_CONGESTION', pct }),
    []
  );
  const toggleRoadIncident = useCallback(
    (incidentId: string) => dispatch({ type: 'TOGGLE_ROAD_INCIDENT', incidentId }),
    []
  );
  const removeRoadIncident = useCallback(
    (incidentId: string) => dispatch({ type: 'REMOVE_ROAD_INCIDENT', incidentId }),
    []
  );
  const addTrafficIncident = useCallback(
    (params: {
      roadId: string;
      roadName: string;
      highway: string;
      kind: RoadIncidentKind;
      centerX: number;
      centerZ: number;
      volumeBoostPct?: number;
    }) => dispatch({ type: 'ADD_TRAFFIC_INCIDENT', ...params }),
    []
  );
  const toggleCustomRoadIncident = useCallback(
    (params: {
      roadId: string;
      roadName: string;
      highway: string;
      kind: RoadIncidentKind;
      centerX: number;
      centerZ: number;
    }) => dispatch({ type: 'TOGGLE_CUSTOM_ROAD_INCIDENT', ...params }),
    []
  );
  const resetRoadConditions = useCallback(() => dispatch({ type: 'RESET_ROAD_CONDITIONS' }), []);
  const selectRouteIndex = useCallback(
    (index: number) => dispatch({ type: 'SELECT_ROUTE_INDEX', index }),
    []
  );
  const setCustomWaypointRole = useCallback(
    (role: 'origin' | 'destination', waypoint: RouteWaypoint) =>
      dispatch({ type: 'SET_CUSTOM_WAYPOINT_ROLE', role, waypoint }),
    []
  );
  const focusRoute = useCallback(() => dispatch({ type: 'FOCUS_ROUTE' }), []);
  const focusScenePoint = useCallback(
    (x: number, z: number, span?: number) => dispatch({ type: 'FOCUS_SCENE_POINT', x, z, span }),
    []
  );
  const selectBuilding = useCallback(
    (building: BuildingInfo | null) => dispatch({ type: 'SELECT_BUILDING', building }),
    []
  );
  const selectRoad = useCallback(
    (road: RoadInfo | null) => dispatch({ type: 'SELECT_ROAD', road }),
    []
  );
  const selectPlace = useCallback(
    (place: PlaceInfo) => dispatch({ type: 'SELECT_PLACE', place }),
    []
  );
  const selectImpactObject = useCallback(
    (item: AffectedObjectRecord) => dispatch({ type: 'SELECT_IMPACT_OBJECT', item }),
    []
  );
  const clearSelection = useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), []);
  const saveScenarioSnapshot = useCallback(
    (
      label?: string,
      source?: ScenarioSnapshot['source'],
      solutionId?: MitigationSolutionId
    ) => dispatch({ type: 'SAVE_SCENARIO_SNAPSHOT', label, source, solutionId }),
    []
  );
  const restoreScenarioSnapshot = useCallback(
    (snapshotId: string) =>
      dispatch({ type: 'RESTORE_SCENARIO_SNAPSHOT', snapshotId }),
    []
  );
  const deleteScenarioSnapshot = useCallback(
    (snapshotId: string) =>
      dispatch({ type: 'DELETE_SCENARIO_SNAPSHOT', snapshotId }),
    []
  );
  const applyMitigationSolution = useCallback(
    (solutionId: MitigationSolutionId, label?: string) =>
      dispatch({ type: 'APPLY_MITIGATION_SOLUTION', solutionId, label }),
    []
  );
  const resetToOriginalBaseline = useCallback(
    () => dispatch({ type: 'RESET_TO_ORIGINAL_BASELINE' }),
    []
  );

  const setSelectedDssProblem = useCallback(
    (problemId: string | null) =>
      dispatch({ type: 'SET_SELECTED_DSS_PROBLEM', problemId }),
    []
  );
  const setPreviewMcdaSolution = useCallback(
    (solutionId: string | null) =>
      dispatch({ type: 'SET_PREVIEW_MCDA_SOLUTION', solutionId }),
    []
  );
  const toggleCompareMcdaSolution = useCallback(
    (solutionId: string) =>
      dispatch({ type: 'TOGGLE_COMPARE_MCDA_SOLUTION', solutionId }),
    []
  );
  const setMcdaCriterionWeight = useCallback(
    (id: McdaCriterionId, weight: number) =>
      dispatch({ type: 'SET_MCDA_CRITERION_WEIGHT', id, weight }),
    []
  );
  const toggleMcdaCriterionEnabled = useCallback(
    (id: McdaCriterionId) =>
      dispatch({ type: 'TOGGLE_MCDA_CRITERION_ENABLED', id }),
    []
  );
  const applyMcdaWeightPreset = useCallback(
    (presetId: McdaWeightPresetId) =>
      dispatch({ type: 'APPLY_MCDA_WEIGHT_PRESET', presetId }),
    []
  );
  const confirmAndApplyMcdaSolution = useCallback(
    (solutionId: string) => {
      const solution = dssBundle.candidates.find((c) => c.id === solutionId);
      if (!solution || !solution.isFeasible) return;
      const weightsPct: Record<McdaCriterionId, number> = {
        safety: 0,
        effectiveness: 0,
        implementationTime: 0,
        remainingRisk: 0,
        operationalCost: 0,
        infrastructureImpact: 0,
        capacityHeadroom: 0,
      };
      for (const c of dssBundle.criteria) {
        weightsPct[c.id] = c.normalizedWeightPct;
      }
      const auditSnapshot: McdaEvaluationSnapshot = {
        id: `mcda-audit-${Date.now().toString(36)}`,
        evaluatedAtIso: new Date().toISOString(),
        simElapsedSeconds: Math.round(state.settings.elapsedSeconds),
        problemId: dssBundle.selectedProblem?.id ?? solution.problemId,
        problemTitle: dssBundle.selectedProblem?.title ?? 'City-Wide Optimization',
        problemTitleTh: dssBundle.selectedProblem?.titleTh ?? 'การวิเคราะห์ระดับเขตจตุจักร',
        totalCandidates: dssBundle.candidates.length,
        feasibleCount: dssBundle.feasibleCandidates.length,
        infeasibleCount: dssBundle.infeasibleCandidates.length,
        recommendedSolutionId: dssBundle.recommendedSolution?.id ?? null,
        recommendedTitle: dssBundle.recommendedSolution?.title ?? null,
        recommendedTitleTh: dssBundle.recommendedSolution?.titleTh ?? null,
        recommendedScore: dssBundle.recommendedSolution?.weightedTotalScore ?? null,
        appliedSolutionId: solution.id,
        appliedTitle: solution.title,
        appliedTitleTh: solution.titleTh,
        criteriaWeightsPct: weightsPct,
      };
      dispatch({
        type: 'CONFIRM_APPLY_MCDA_SOLUTION',
        solution,
        auditSnapshot,
      });
    },
    [dssBundle, state.settings.elapsedSeconds]
  );

  const setWhatIfWorkflowStep = useCallback(
    (step: WhatIfWorkflowStep) => dispatch({ type: 'SET_WHATIF_STEP', step }),
    []
  );
  const selectWhatIfSolution = useCallback(
    (solutionId: string | null, jumpToStep?: WhatIfWorkflowStep) =>
      dispatch({ type: 'SELECT_WHATIF_SOLUTION', solutionId, jumpToStep }),
    []
  );
  const openSolutionInWhatIf = useCallback(
    (solutionId?: string | null, step: WhatIfWorkflowStep = 'preview') => {
      if (solutionId !== undefined) {
        dispatch({ type: 'SELECT_WHATIF_SOLUTION', solutionId, jumpToStep: step });
      } else {
        dispatch({ type: 'SET_WHATIF_STEP', step });
      }
      dispatch({ type: 'SET_SECTION', section: 'whatif' });
    },
    []
  );
  const updateWhatIfOverrides = useCallback(
    (patch: Partial<WhatIfParameterOverrides>) =>
      dispatch({ type: 'UPDATE_WHATIF_OVERRIDES', patch }),
    []
  );
  const resetWhatIfOverrides = useCallback(
    () => dispatch({ type: 'RESET_WHATIF_OVERRIDES' }),
    []
  );
  const commitWhatIfSolution = useCallback(() => {
    if (!whatIfPreview || !whatIfPreview.isValid) return;
    const weightsPct: Record<McdaCriterionId, number> = {
      safety: 0,
      effectiveness: 0,
      implementationTime: 0,
      remainingRisk: 0,
      operationalCost: 0,
      infrastructureImpact: 0,
      capacityHeadroom: 0,
    };
    for (const c of dssBundle.criteria) {
      weightsPct[c.id] = c.normalizedWeightPct;
    }
    const auditSnapshot: McdaEvaluationSnapshot = {
      id: `whatif-audit-${Date.now().toString(36)}`,
      evaluatedAtIso: new Date().toISOString(),
      simElapsedSeconds: Math.round(state.settings.elapsedSeconds),
      problemId: dssBundle.selectedProblem?.id ?? whatIfPreview.solution.problemId,
      problemTitle: dssBundle.selectedProblem?.title ?? 'City-Wide Optimization',
      problemTitleTh: dssBundle.selectedProblem?.titleTh ?? 'การวิเคราะห์ระดับเขตจตุจักร',
      totalCandidates: dssBundle.candidates.length,
      feasibleCount: dssBundle.feasibleCandidates.length,
      infeasibleCount: dssBundle.infeasibleCandidates.length,
      recommendedSolutionId: dssBundle.recommendedSolution?.id ?? null,
      recommendedTitle: dssBundle.recommendedSolution?.title ?? null,
      recommendedTitleTh: dssBundle.recommendedSolution?.titleTh ?? null,
      recommendedScore: dssBundle.recommendedSolution?.weightedTotalScore ?? null,
      appliedSolutionId: whatIfPreview.solution.id,
      appliedTitle: whatIfPreview.solution.title,
      appliedTitleTh: whatIfPreview.solution.titleTh,
      criteriaWeightsPct: weightsPct,
    };
    dispatch({
      type: 'COMMIT_WHATIF_SOLUTION',
      preview: whatIfPreview,
      problemTitle: dssBundle.selectedProblem?.title ?? 'City-Wide Optimization',
      problemTitleTh: dssBundle.selectedProblem?.titleTh ?? 'การวิเคราะห์ระดับเขตจตุจักร',
      auditSnapshot,
    });
  }, [whatIfPreview, dssBundle, state.settings.elapsedSeconds]);

  const saveWhatIfNamedSnapshot = useCallback(
    (label: string) => {
      const rec = state.whatIfCommittedRecord;
      dispatch({
        type: 'SAVE_WHATIF_NAMED_SNAPSHOT',
        label,
        appliedDssSolution: rec
          ? {
              solutionId: rec.solutionId,
              problemId: rec.problemId,
              title: rec.solutionTitle,
              titleTh: rec.solutionTitleTh,
              parametersSummary: rec.parametersSummary,
              parametersSummaryTh: rec.parametersSummaryTh,
            }
          : undefined,
      });
    },
    [state.whatIfCommittedRecord]
  );

  const rollbackWhatIfBaseline = useCallback(() => {
    if (state.whatIfBaselineSnapshotId) {
      dispatch({
        type: 'RESTORE_SCENARIO_SNAPSHOT',
        snapshotId: state.whatIfBaselineSnapshotId,
      });
    } else {
      dispatch({ type: 'RESET_TO_ORIGINAL_BASELINE' });
    }
  }, [state.whatIfBaselineSnapshotId]);

  const value = useMemo<SimulationContextValue>(
    () => ({
      state,
      activeArea,
      impactAnalysis,
      waterResult,
      powerResult,
      allWaypoints,
      selectableRoadLocations,
      routeResult,
      metrics,
      dssBundle,
      liveBeforeAfterMetrics,
      whatIfPreview,
      setSection,
      startSimulation,
      pauseSimulation,
      resetSimulation,
      setSeverity,
      setWaterLevel,
      setSpeed,
      setAffectedArea,
      selectPreset,
      setFloodAutoRise,
      setFloodOpacity,
      resetFloodLayer,
      updateSettings,
      toggleLayer,
      setLightingMode,
      setCityLoading,
      setCityLoaded,
      setCityError,
      setWaterInflowMultiplier,
      toggleWaterBlockedSegment,
      setWaterDischargeStrategy,
      resetWaterManagement,
      applyPowerOutageScenario,
      togglePowerFault,
      setPowerDemandMultiplier,
      togglePowerWeatherCoupling,
      isolatePowerElement,
      togglePowerBackupPath,
      restorePowerServiceArea,
      restoreAllFeasiblePower,
      resetPowerManagement,
      setRouteOrigin,
      setRouteDestination,
      swapRouteEndpoints,
      setVehicleProfile,
      setRouteMode,
      setRiskWeights,
      setTrafficStatus,
      resetTrafficSimulation,
      setTrafficLightTiming,
      setTrafficCongestion,
      toggleRoadIncident,
      removeRoadIncident,
      addTrafficIncident,
      toggleCustomRoadIncident,
      resetRoadConditions,
      selectRouteIndex,
      setCustomWaypointRole,
      focusRoute,
      focusScenePoint,
      selectBuilding,
      selectRoad,
      selectPlace,
      selectImpactObject,
      clearSelection,
      saveScenarioSnapshot,
      restoreScenarioSnapshot,
      deleteScenarioSnapshot,
      applyMitigationSolution,
      resetToOriginalBaseline,
      setSelectedDssProblem,
      setPreviewMcdaSolution,
      toggleCompareMcdaSolution,
      setMcdaCriterionWeight,
      toggleMcdaCriterionEnabled,
      applyMcdaWeightPreset,
      confirmAndApplyMcdaSolution,
      setWhatIfWorkflowStep,
      selectWhatIfSolution,
      openSolutionInWhatIf,
      updateWhatIfOverrides,
      resetWhatIfOverrides,
      commitWhatIfSolution,
      saveWhatIfNamedSnapshot,
      rollbackWhatIfBaseline,
    }),
    [
      state,
      activeArea,
      impactAnalysis,
      waterResult,
      powerResult,
      allWaypoints,
      selectableRoadLocations,
      routeResult,
      metrics,
      dssBundle,
      liveBeforeAfterMetrics,
      whatIfPreview,
      setSection,
      startSimulation,
      pauseSimulation,
      resetSimulation,
      setSeverity,
      setWaterLevel,
      setSpeed,
      setAffectedArea,
      selectPreset,
      setFloodAutoRise,
      setFloodOpacity,
      resetFloodLayer,
      updateSettings,
      toggleLayer,
      setLightingMode,
      setCityLoading,
      setCityLoaded,
      setCityError,
      setWaterInflowMultiplier,
      toggleWaterBlockedSegment,
      setWaterDischargeStrategy,
      resetWaterManagement,
      applyPowerOutageScenario,
      togglePowerFault,
      setPowerDemandMultiplier,
      togglePowerWeatherCoupling,
      isolatePowerElement,
      togglePowerBackupPath,
      restorePowerServiceArea,
      restoreAllFeasiblePower,
      resetPowerManagement,
      setRouteOrigin,
      setRouteDestination,
      swapRouteEndpoints,
      setVehicleProfile,
      setRouteMode,
      setRiskWeights,
      setTrafficStatus,
      resetTrafficSimulation,
      setTrafficLightTiming,
      setTrafficCongestion,
      toggleRoadIncident,
      removeRoadIncident,
      addTrafficIncident,
      toggleCustomRoadIncident,
      resetRoadConditions,
      selectRouteIndex,
      setCustomWaypointRole,
      focusRoute,
      focusScenePoint,
      selectBuilding,
      selectRoad,
      selectPlace,
      selectImpactObject,
      clearSelection,
      saveScenarioSnapshot,
      restoreScenarioSnapshot,
      deleteScenarioSnapshot,
      applyMitigationSolution,
      resetToOriginalBaseline,
      setSelectedDssProblem,
      setPreviewMcdaSolution,
      toggleCompareMcdaSolution,
      setMcdaCriterionWeight,
      toggleMcdaCriterionEnabled,
      applyMcdaWeightPreset,
      confirmAndApplyMcdaSolution,
      setWhatIfWorkflowStep,
      selectWhatIfSolution,
      openSolutionInWhatIf,
      updateWhatIfOverrides,
      resetWhatIfOverrides,
      commitWhatIfSolution,
      saveWhatIfNamedSnapshot,
      rollbackWhatIfBaseline,
    ]
  );

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation(): SimulationContextValue {
  const ctx = useContext(SimulationContext);
  if (!ctx) {
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return ctx;
}
