export type NavSection =
  | 'overview'
  | 'simulation'
  | 'flood'
  | 'water'
  | 'power'
  | 'traffic'
  | 'routing'
  | 'dss'
  | 'mcda'
  | 'whatif'
  | 'assistant'
  | 'analytics';

export type DisasterTypeId = 'flood';

export type SimulationStatus = 'idle' | 'running' | 'paused';

export type SimulationSpeed = 0.5 | 1 | 2 | 4;

export type ScenarioId =
  | 'baseline'
  | 'monsoon'
  | 'blocked_drainage'
  | 'khlong_overflow'
  | 'low_lying_ponding'
  | 'severe'
  | 'custom';

export type CameraPreset =
  | 'overview'
  | 'chatuchakPark'
  | 'latPhrao'
  | 'krungThepAphiwat'
  | 'followCar';

export type LightingMode = 'tactical' | 'daylight';

export interface BuildingInfo {
  id: string;
  name: string | null;
  type: string | null;
  category: 'residential' | 'commercial' | 'public' | 'industrial' | 'general';
  levels: string | null;
  heightMeters: number | null;
  amenity: string | null;
  lon: number;
  lat: number;
  sceneX: number;
  sceneZ: number;
}

export interface RoadInfo {
  id: string;
  name: string | null;
  highway: string | null;
  lanes: string | null;
  maxspeed: string | null;
  oneway: string | null;
  surface: string | null;
  isBridge: boolean;
  isTunnel: boolean;
}

export interface PlaceInfo {
  name: string;
  nameEn: string;
  category: string;
  longitude: number;
  latitude: number;
}

export interface AffectedAreaOption {
  id: string;
  label: string;
  sourceDataset: 'boundary.geojson' | 'water.geojson' | 'roads.geojson' | 'parks.geojson';
  featureCount: number;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    centerX: number;
    centerZ: number;
  };
  /** Relative footprint ratio vs entire district (0.05 to 1.0) for simulated scope */
  areaShare: number;
}

export interface CityStats {
  buildings: number;
  roads: number;
  water: number;
  parks: number;
  railways: number;
  stations: number;
  trafficLights: number;
  districtPopulation: number;
  districtName: string;
}

export interface LayerVisibility {
  buildings: boolean;
  roads: boolean;
  water: boolean;
  parks: boolean;
  railways: boolean;
  traffic: boolean;
  trafficDensityOverlay: boolean;
  labels: boolean;
  floodOverlay: boolean;
  impactOverlay: boolean;
  routeOverlay: boolean;
  waterNetworkOverlay: boolean;
  powerNetworkOverlay: boolean;
  decisionPreviewOverlay: boolean;
}

export type FloodCauseId =
  | 'heavy_rainfall'
  | 'blocked_pipes'
  | 'insufficient_capacity'
  | 'high_canal_level'
  | 'low_lying_accumulation';

export interface FloodCauseContribution {
  id: FloodCauseId;
  intensityPct: number;
  contributionPct: number;
  severity: ImpactRiskLevel;
}

export interface WaterAccumulationZone {
  areaId: string;
  label: string;
  sourceDataset: AffectedAreaOption['sourceDataset'];
  peakDepthMeters: number;
  meanDepthMeters: number;
  floodedAreaKm2: number;
  totalAreaKm2: number;
  floodedSharePct: number;
  highAccumulationPct: number;
  severity: ImpactRiskLevel | 'Nominal';
  primaryCauseId: FloodCauseId;
  affectedObjectsCount: number;
}

export interface WaterAccumulationSummary {
  floodedAreaKm2: number;
  totalTargetAreaKm2: number;
  floodedAreaPct: number;
  highAccumulationAreaKm2: number;
  estimatedVolumeM3: number;
  peakDepthMeters: number;
  meanDepthMeters: number;
  effectiveDrainagePct: number;
  majorCauseId: FloodCauseId | null;
  causes: FloodCauseContribution[];
  hotspots: WaterAccumulationZone[];
  isSimulatedVulnerabilityModel: true;
}

export interface SimulationSettings {
  disasterType: DisasterTypeId;
  scenarioId: ScenarioId;
  status: SimulationStatus;
  floodSeverity: number; // 0 - 100
  waterLevelMeters: number; // 0.0 - 2.5
  rainfallMmHr: number; // 0 - 180
  drainageCapacityPct: number; // 20 - 100
  drainageBlockagePct: number; // 0 - 95
  canalWaterLevelPct: number; // 0 - 100
  lowLyingSensitivityPct: number; // 50 - 150
  simulationSpeed: SimulationSpeed;
  affectedAreaId: string;
  elapsedSeconds: number;
  emergencyMode: boolean;
  floodAutoRise: boolean;
  floodOpacity: number; // 0.25 - 1.0
}

export interface SummaryMetrics {
  floodLevelMeters: number;
  floodSeverityLabel: 'Nominal' | 'Elevated' | 'Warning' | 'Critical';
  affectedRoadsCount: number;
  totalRoadsCount: number;
  affectedBuildingsCount: number;
  totalBuildingsCount: number;
  affectedFacilitiesCount: number;
  totalFacilitiesCount: number;
  affectedParksCount: number;
  totalParksCount: number;
  safeRoutesCount: number;
  totalCorridorsCount: number;
  floodedAreaKm2: number;
  floodedAreaPct: number;
  effectiveDrainagePct: number;
  majorCauseId: FloodCauseId | null;
}

export interface FloodZoneSample {
  id: string;
  zoneName: string;
  corridor: string;
  simulatedDepthMeters: number;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Severe';
  roadStatus: 'Passable' | 'Caution' | 'Impassable';
  drainageNote: string;
}

export interface CorridorRouteSample {
  id: string;
  name: string;
  origin: string;
  destination: string;
  baselineDistanceKm: number;
  baselineEtaMin: number;
  detourDistanceKm: number;
  detourEtaMin: number;
  status: 'Clear' | 'Rerouted' | 'Blocked';
  via: string;
}

export type ImpactRiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export type ImpactTargetType = 'road' | 'building' | 'facility' | 'park';

export interface ImpactCatalogEntry {
  id: string;
  name: string | null;
  targetType: ImpactTargetType;
  subType: string;
  sourceDataset: 'roads.geojson' | 'buildings.geojson' | 'stations.geojson' | 'parks.geojson';
  sceneX: number;
  sceneZ: number;
  samplePoints: Array<[number, number]>;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
  vulnerability: number;
  isBridge: boolean;
  isTunnel: boolean;
  isElevatedTransit: boolean;
  roadInfo?: RoadInfo;
  buildingInfo?: BuildingInfo;
  facilityMeta?: {
    kind: 'transit_station' | 'civic_facility';
    network?: string | null;
    amenity?: string | null;
    stationType?: string | null;
    lon?: number;
    lat?: number;
  };
  parkMeta?: {
    leisure: string | null;
    lon?: number;
    lat?: number;
  };
}

export interface FloodGridSample {
  x: number;
  z: number;
  vulnerability: number;
  cellAreaKm2: number;
}

export interface CityImpactCatalog {
  roads: ImpactCatalogEntry[];
  buildings: ImpactCatalogEntry[];
  facilities: ImpactCatalogEntry[];
  parks: ImpactCatalogEntry[];
  areaGrid: FloodGridSample[];
  totalDistrictAreaKm2: number;
  waterPointsCount: number;
  parkPointsCount: number;
}

export interface AffectedObjectRecord {
  id: string;
  name: string;
  hasRecordedName: boolean;
  targetType: ImpactTargetType;
  subType: string;
  sourceDataset: 'roads.geojson' | 'buildings.geojson' | 'stations.geojson' | 'parks.geojson';
  riskLevel: ImpactRiskLevel;
  estimatedDepthMeters: number;
  vulnerability: number;
  sceneX: number;
  sceneZ: number;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
  isBridge: boolean;
  isTunnel: boolean;
  isElevatedTransit: boolean;
  roadInfo?: RoadInfo;
  buildingInfo?: BuildingInfo;
  facilityMeta?: ImpactCatalogEntry['facilityMeta'];
  parkMeta?: ImpactCatalogEntry['parkMeta'];
}

export interface ImpactAnalysisResult {
  effectiveWaterMeters: number;
  affectedRoadsCount: number;
  totalRoadsCount: number;
  affectedBuildingsCount: number;
  totalBuildingsCount: number;
  affectedFacilitiesCount: number;
  totalFacilitiesCount: number;
  affectedParksCount: number;
  totalParksCount: number;
  byRisk: Record<ImpactRiskLevel, number>;
  roadsByRisk: Record<ImpactRiskLevel, number>;
  buildingsByRisk: Record<ImpactRiskLevel, number>;
  facilitiesByRisk: Record<ImpactRiskLevel, number>;
  parksByRisk: Record<ImpactRiskLevel, number>;
  items: AffectedObjectRecord[];
  accumulation: WaterAccumulationSummary;
  dataNotes: string[];
}

export type VehicleProfileId = 'emergency' | 'standard';

export type RouteWaypointSource =
  | 'landmark'
  | 'station'
  | 'facility'
  | 'custom_building'
  | 'custom_road';

export interface RouteWaypoint {
  id: string;
  label: string;
  category: string;
  source: RouteWaypointSource;
  sceneX: number;
  sceneZ: number;
  lon?: number;
  lat?: number;
}

export interface RoadGraphNode {
  id: number;
  x: number;
  z: number;
  edges: number[];
}

export interface RoadGraphEdge {
  id: number;
  roadId: string;
  roadName: string | null;
  highway: string;
  from: number;
  to: number;
  lengthMeters: number;
  polyline: Array<[number, number]>;
  midX: number;
  midZ: number;
  vulnerability: number;
  isBridge: boolean;
  isTunnel: boolean;
}

export interface RoadGraphStats {
  rawFeatures: number;
  drivableFeatures: number;
  rawNodeCount: number;
  compressedNodeCount: number;
  edgeCount: number;
  snappedDeadEnds: number;
  giantComponentRatio: number;
}

export interface RoadGraph {
  nodes: RoadGraphNode[];
  edges: RoadGraphEdge[];
  stats: RoadGraphStats;
  snapToleranceScene: number;
  snapToleranceMeters: number;
  metersPerSceneUnit: number;
}

export type RouteOptimizationMode = 'safest' | 'fastest' | 'shortest';

export interface RouteRiskWeights {
  floodRisk: number;         // 0 - 100
  congestionRisk: number;    // 0 - 100
  accidentRisk: number;      // 0 - 100
  roadAccessibility: number; // 0 - 100
}

export type RoadIncidentKind = 'accident' | 'closure' | 'construction' | 'congestion';
export type RoadIncidentSeverity = 'minor' | 'major';

export type TrafficSimulationStatus = 'idle' | 'running' | 'paused';

export interface TrafficLightTiming {
  greenSeconds: number;
  yellowSeconds: number;
  redSeconds: number;
}

export type TrafficDensityTier = 'normal' | 'moderate' | 'severe';

export interface TrafficDensityVisualSegment {
  polyline: Array<[number, number]>;
  tier: TrafficDensityTier;
  blocked: boolean;
  highway: string;
}

export interface TrafficEdgeDensitySummary {
  normalSegmentsCount: number;
  moderateSegmentsCount: number;
  severeSegmentsCount: number;
  blockedSegmentsCount: number;
  totalSegmentsCount: number;
  densityPct: number;
  congestionSeverity: 'Nominal' | 'Moderate' | 'Severe';
  avgSpeedKmh: number;
  avgTravelTimeMin: number;
  signalCycleSeconds: number;
  signalDelayPerIntersectionSec: number;
  activeVehiclesCount: number;
  constructionCount: number;
  congestionZoneCount: number;
}

export interface SelectableRoadLocation {
  roadId: string;
  roadName: string;
  highway: string;
  centerX: number;
  centerZ: number;
  lengthMeters: number;
}

export interface SimulatedRoadIncident {
  id: string;
  roadId: string;
  roadName: string;
  highway: string;
  kind: RoadIncidentKind;
  severity: RoadIncidentSeverity;
  blocksRoad: boolean;
  centerX: number;
  centerZ: number;
  speedFactor: number;
  active: boolean;
  source: 'preset' | 'user';
  labelKey?: string;
}

export interface ComputedRoute {
  id: string;
  rank: number;
  role: 'original' | 'recommended' | 'alternative';
  label: string;
  distanceMeters: number;
  weightedCost: number;
  estimatedSimMinutes: number;
  congestionDelayMinutes: number;
  avgSpeedKmh: number;
  cautionMeters: number;
  maxWaterDepthMeters: number;
  bridgeSegmentsUsed: number;
  affectedSegmentsCount: number;
  floodedSegmentsCount: number;
  congestedSegmentsCount: number;
  accidentNearSegmentsCount: number;
  blockedSegmentsOnRouteCount: number;
  riskScore: number;
  isPassable: boolean;
  roadNames: string[];
  polyline: Array<[number, number]>;
  edgeIds: number[];
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    centerX: number;
    centerZ: number;
  };
}

export interface BlockedRoadHighlight {
  roadId: string;
  name: string;
  highway: string;
  centerX: number;
  centerZ: number;
  depthMeters: number;
  riskLevel: ImpactRiskLevel;
  reason: 'flood' | 'closure' | 'accident';
  polyline?: Array<[number, number]>;
}

export interface RouteOptimizationResult {
  status: 'ready' | 'unreachable' | 'same_point' | 'loading';
  origin: RouteWaypoint | null;
  destination: RouteWaypoint | null;
  vehicleProfile: VehicleProfileId;
  routeMode: RouteOptimizationMode;
  riskWeights: RouteRiskWeights;
  maxSafeDepthMeters: number;
  trafficCongestionPct: number;
  trafficLightTiming: TrafficLightTiming;
  avgNetworkSpeedKmh: number;
  congestedEdgeCount: number;
  activeAccidentsCount: number;
  closedRoadsCount: number;
  originalRoute: ComputedRoute | null;
  routes: ComputedRoute[];
  blockedRoads: BlockedRoadHighlight[];
  activeIncidents: SimulatedRoadIncident[];
  blockedEdgeCount: number;
  totalGraphEdges: number;
  passableNetworkPct: number;
  trafficSummary: TrafficEdgeDensitySummary;
  trafficDensitySegments: TrafficDensityVisualSegment[];
  errorMessage: string | null;
  topologyNotes: string[];
}

export type ProblemDomainId =
  | 'traffic'
  | 'flood'
  | 'water'
  | 'power'
  | 'routing'
  | 'analytics';

export type ProblemSeverity = 'Low' | 'Medium' | 'High' | 'Critical' | 'Info';

export interface ProblemTargetRef {
  kind: 'object' | 'area' | 'route' | 'point';
  id: string;
  label: string;
  targetType?: ImpactTargetType;
  routeIndex?: number;
  sceneX?: number;
  sceneZ?: number;
  span?: number;
}

export interface ProblemRecommendationOption {
  action: string;
  advantages: string;
  disadvantages: string;
  risks: string;
}

export interface DetectedSimulationProblem {
  id: string;
  domain: ProblemDomainId;
  problemType: string;
  severity: ProblemSeverity;
  title: string;
  location: string;
  targetRef: ProblemTargetRef | null;
  knownConditions: string[];
  aiHypotheses: string[];
  affectedInfrastructure: string[];
  relatedDomains: ProblemDomainId[];
  recommendedActions: ProblemRecommendationOption[];
  supportingData: string[];
}

export interface DomainTelemetryStatus {
  domain: ProblemDomainId;
  label: string;
  dataSource: 'simulated' | 'geojson_derived' | 'partial_risk_inference' | 'unavailable';
  statusLabel: string;
  problemCount: number;
  summary: string;
}

export interface StructuredProblemAnalysis {
  executiveSummary: string;
  moduleCoverage: DomainTelemetryStatus[];
  problems: DetectedSimulationProblem[];
  dataBoundaries: string[];
}

export type MitigationSolutionId =
  | 'drainage_clearance'
  | 'retention_canal'
  | 'traffic_corridor'
  | 'integrated_response';

export type WaterNodeKind =
  | 'collection_point'
  | 'drainage_channel'
  | 'canal'
  | 'reservoir'
  | 'storage_facility'
  | 'outfall';

export type WaterInfraOrigin = 'geojson_water' | 'geojson_park_basin' | 'simulated';

export type WaterSegmentKind =
  | 'drainage_pipe'
  | 'drainage_channel'
  | 'canal_link'
  | 'diversion_link';

export type WaterRiskLevel = 'Nominal' | 'Moderate' | 'High' | 'Overflow';

export type WaterDischargeStrategyId =
  | 'none'
  | 'auto_balanced'
  | 'divert_to_park_reservoirs'
  | 'divert_to_water_bank'
  | 'divert_to_khlong_prem'
  | 'divert_to_khlong_bang_sue';

export interface WaterNetworkNode {
  id: string;
  name: string;
  nameTh: string;
  kind: WaterNodeKind;
  origin: WaterInfraOrigin;
  sourceFeatureName: string | null;
  sceneX: number;
  sceneZ: number;
  isStorage: boolean;
  maxCapacityM3: number;
  maxLevelMeters: number;
  baseLevelMeters: number;
  baseInflowM3s: number;
  elevationTier: 'low' | 'mid' | 'high';
}

export interface WaterNetworkNodeState {
  node: WaterNetworkNode;
  initialStoredM3: number;
  currentVolumeM3: number;
  maxCapacityM3: number;
  remainingCapacityM3: number;
  waterLevelMeters: number;
  maxLevelMeters: number;
  utilizationPct: number;
  inflowM3s: number;
  outflowM3s: number;
  overflowAccumulationM3: number;
  overflowRisk: WaterRiskLevel;
  isOverflowWarning: boolean;
  bottleneckReason: string | null;
  bottleneckReasonTh: string | null;
}

export interface WaterNetworkEdge {
  id: string;
  name: string;
  nameTh: string;
  kind: WaterSegmentKind;
  origin: WaterInfraOrigin;
  sourceFeatureName: string | null;
  fromId: string;
  toId: string;
  polyline: Array<[number, number]>;
  lengthMeters: number;
  designCapacityM3s: number;
  diameterMeters: number;
}

export interface WaterNetworkEdgeState {
  edge: WaterNetworkEdge;
  isManuallyBlocked: boolean;
  blockagePct: number;
  effectiveCapacityM3s: number;
  flowRateM3s: number;
  utilizationPct: number;
  status: 'normal' | 'bottleneck' | 'blocked';
  headOverflowM3: number;
  midX: number;
  midZ: number;
}

export interface WaterDischargeStrategyEvaluation {
  id: Exclude<WaterDischargeStrategyId, 'none'>;
  targetNodeId: string;
  targetNodeName: string;
  targetNodeNameTh: string;
  sourceNodeId: string;
  sourceNodeName: string;
  sourceNodeNameTh: string;
  requestedDiversionM3: number;
  volumeToDischargeM3: number;
  receivingCurrentVolumeM3: number;
  receivingMaxCapacityM3: number;
  receivingAvailableCapacityM3: number;
  sourceLevelChangeMeters: number;
  targetLevelChangeMeters: number;
  postDischargeTargetUtilizationPct: number;
  postDischargeOverflowRisk: WaterRiskLevel;
  estimatedDischargeMinutes: number;
  isFeasible: boolean;
  recommended: boolean;
  infeasibleReason?: string;
  infeasibleReasonTh?: string;
}

export interface WaterMassBalanceSummary {
  windowSeconds: number;
  totalInflowM3: number;
  totalOutflowM3: number;
  totalInitialStorageM3: number;
  totalCurrentStorageM3: number;
  deltaStoredM3: number;
  totalAccumulatedOverflowM3: number;
  totalMaxCapacityM3: number;
  totalRemainingCapacityM3: number;
  overallStorageUtilizationPct: number;
  conservationErrorM3: number;
  isMassConserved: boolean;
}

export interface WaterAccumulationHotspot {
  nodeId: string;
  name: string;
  nameTh: string;
  kind: WaterNodeKind;
  origin: WaterInfraOrigin;
  sceneX: number;
  sceneZ: number;
  accumulatedVolumeM3: number;
  waterLevelMeters: number;
  utilizationPct: number;
  reason: string;
  reasonTh: string;
}

export interface WaterNetworkGraph {
  nodes: WaterNetworkNode[];
  edges: WaterNetworkEdge[];
  geoWaterCount: number;
  geoParkBasinCount: number;
  simulatedInfraCount: number;
}

export interface WaterManagementSimulationResult {
  nodes: WaterNetworkNodeState[];
  edges: WaterNetworkEdgeState[];
  storageNodes: WaterNetworkNodeState[];
  massBalance: WaterMassBalanceSummary;
  accumulationHotspots: WaterAccumulationHotspot[];
  blockedEdgesCount: number;
  bottleneckEdgesCount: number;
  overflowNodesCount: number;
  availableReceivingNodesCount: number;
  strategies: WaterDischargeStrategyEvaluation[];
  recommendedStrategyId: WaterDischargeStrategyId | null;
  activeStrategyId: WaterDischargeStrategyId;
  activeStrategyApplied: WaterDischargeStrategyEvaluation | null;
  inflowMultiplierPct: number;
  isSimplifiedMassBalanceModel: true;
}

export type PowerNodeKind = 'substation' | 'transformer' | 'service_area';

export type PowerEdgeKind = 'primary_feeder' | 'distribution_line' | 'backup_tie';

export type PowerOutageScenarioType =
  | 'none'
  | 'substation_failure'
  | 'line_failure'
  | 'transformer_fault'
  | 'excessive_demand'
  | 'weather_disruption';

export type PowerServiceStatus =
  | 'energized'
  | 'backup_restored'
  | 'degraded'
  | 'outage'
  | 'isolated';

export type PowerSeverity = 'Nominal' | 'Moderate' | 'High' | 'Critical';

export interface PowerNetworkNode {
  id: string;
  name: string;
  nameTh: string;
  kind: PowerNodeKind;
  isSimulated: true;
  anchorNote: string;
  anchorNoteTh: string;
  sceneX: number;
  sceneZ: number;
  radiusScene: number;
  ratedCapacityMw: number;
  baseDemandMw: number;
  buildingCount: number;
  floodVulnerabilityTier: 'low' | 'medium' | 'high';
}

export interface PowerNetworkEdge {
  id: string;
  name: string;
  nameTh: string;
  kind: PowerEdgeKind;
  isSimulated: true;
  fromId: string;
  toId: string;
  polyline: Array<[number, number]>;
  lengthMeters: number;
  ratedCapacityMw: number;
  isBackupPath: boolean;
  floodExposureTier: 'low' | 'medium' | 'high';
}

export interface PowerNetworkGraph {
  nodes: PowerNetworkNode[];
  edges: PowerNetworkEdge[];
  totalBuildingCount: number;
}

export interface PowerNodeState {
  node: PowerNetworkNode;
  status: PowerServiceStatus;
  effectiveDemandMw: number;
  servedMw: number;
  unservedMw: number;
  availableSupplyMw: number;
  utilizationPct: number;
  isManuallyFailed: boolean;
  isWeatherTripped: boolean;
  isIsolated: boolean;
  isOverloaded: boolean;
  fedBySubstationId: string | null;
  fedViaBackup: boolean;
  canRestoreNow: boolean;
  restoreBlockedReason: string | null;
  restoreBlockedReasonTh: string | null;
}

export interface PowerEdgeState {
  edge: PowerNetworkEdge;
  status: 'energized' | 'backup_active' | 'standby' | 'failed' | 'isolated' | 'overloaded';
  flowMw: number;
  utilizationPct: number;
  isManuallyFailed: boolean;
  isWeatherTripped: boolean;
  isIsolated: boolean;
  isBackupActive: boolean;
  midX: number;
  midZ: number;
}

export interface PowerBackupOption {
  edgeId: string;
  name: string;
  nameTh: string;
  fromId: string;
  toId: string;
  sourceSubstationName: string;
  sourceSubstationNameTh: string;
  targetName: string;
  targetNameTh: string;
  tieCapacityMw: number;
  sourceSpareMw: number;
  requiredLoadMw: number;
  isActive: boolean;
  isFeasible: boolean;
  wouldOverload: boolean;
  needsFaultIsolation: boolean;
  restorableAreaIds: string[];
  restorableAreaNames: string[];
  restorableAreaNamesTh: string[];
  reasonUnavailable?: string;
  reasonUnavailableTh?: string;
}

export interface PowerOutageLocation {
  id: string;
  name: string;
  nameTh: string;
  kind: 'substation' | 'transformer' | 'line' | 'service_area';
  sceneX: number;
  sceneZ: number;
  severity: PowerSeverity;
  affectedBuildings: number;
  unservedMw: number;
  reason: string;
  reasonTh: string;
}

export interface PowerCauseSummary {
  simulatedCauses: Array<{
    id: string;
    label: string;
    labelTh: string;
    detail: string;
    detailTh: string;
  }>;
  aiHypotheses: Array<{
    id: string;
    label: string;
    labelTh: string;
  }>;
}

export interface PowerNetworkSimulationResult {
  nodes: PowerNodeState[];
  edges: PowerEdgeState[];
  substations: PowerNodeState[];
  transformers: PowerNodeState[];
  serviceAreas: PowerNodeState[];
  totalDemandMw: number;
  availableSupplyMw: number;
  servedLoadMw: number;
  unservedLoadMw: number;
  reserveMarginPct: number;
  affectedAreasCount: number;
  totalAreasCount: number;
  affectedBuildingsCount: number;
  totalBuildingsCount: number;
  restoredAreasCount: number;
  outageSeverity: PowerSeverity;
  networkStatus: 'Normal' | 'Stressed' | 'Partial Outage' | 'Major Outage' | 'Restoring';
  restorationProgressPct: number;
  demandMultiplierPct: number;
  weatherCouplingEnabled: boolean;
  activeOutageScenario: PowerOutageScenarioType;
  failedNodeIds: string[];
  failedEdgeIds: string[];
  weatherTrippedIds: string[];
  isolatedIds: string[];
  activeBackupEdgeIds: string[];
  restoredAreaIds: string[];
  backupOptions: PowerBackupOption[];
  outageLocations: PowerOutageLocation[];
  causes: PowerCauseSummary;
  isSimplifiedPowerModel: true;
}

export interface AppliedDssSolutionMeta {
  solutionId: string;
  problemId: string;
  title: string;
  titleTh: string;
  parametersSummary: string;
  parametersSummaryTh: string;
}

export interface ScenarioSnapshot {
  id: string;
  label: string;
  source: 'initial' | 'preset' | 'solution' | 'manual';
  solutionId?: MitigationSolutionId;
  appliedDssSolution?: AppliedDssSolutionMeta;
  createdAtIso: string;
  elapsedSeconds: number;
  settings: SimulationSettings;
  trafficCongestionPct: number;
  trafficLightTiming?: TrafficLightTiming;
  vehicleProfile: VehicleProfileId;
  routeMode: RouteOptimizationMode;
  roadIncidents: SimulatedRoadIncident[];
  affectedAreaId: string;
  waterInflowMultiplierPct?: number;
  waterBlockedEdgeIds?: string[];
  waterDischargeStrategyId?: WaterDischargeStrategyId;
  powerOutageScenario?: PowerOutageScenarioType;
  powerDemandMultiplierPct?: number;
  powerFailedNodeIds?: string[];
  powerFailedEdgeIds?: string[];
  powerIsolatedIds?: string[];
  powerActiveBackupEdgeIds?: string[];
  powerRestoredAreaIds?: string[];
  powerWeatherCouplingEnabled?: boolean;
}

export type DssModuleAvailability = 'available' | 'partial' | 'unavailable';

export interface DssModuleTelemetryRecord {
  domain: ProblemDomainId;
  availability: DssModuleAvailability;
  problemCount: number;
  summary: string;
  summaryTh: string;
}

export interface DssImpactCategory {
  count: number;
  items: string[];
  itemsTh: string[];
  summary: string;
  summaryTh: string;
}

export interface DssInfrastructureImpact {
  roads: DssImpactCategory;
  buildings: DssImpactCategory;
  facilities: DssImpactCategory;
  waterInfra: DssImpactCategory;
  electricalInfra: DssImpactCategory;
}

export interface DssCauseEntry {
  id: string;
  text: string;
  textTh: string;
}

export interface DssProblemRecord {
  id: string;
  domain: ProblemDomainId;
  category: string;
  categoryTh: string;
  title: string;
  titleTh: string;
  location: string;
  locationTh: string;
  severity: ProblemSeverity;
  detectedAtSimSeconds: number;
  affectedInfrastructure: string[];
  affectedInfrastructureTh: string[];
  rootCausesRuleBased: DssCauseEntry[];
  impactBreakdown: DssInfrastructureImpact;
  targetRef: ProblemTargetRef | null;
  supportingData: string[];
  supportingDataTh: string[];
}

export type McdaCriterionId =
  | 'safety'
  | 'effectiveness'
  | 'implementationTime'
  | 'remainingRisk'
  | 'operationalCost'
  | 'infrastructureImpact'
  | 'capacityHeadroom';

export type McdaCriterionDirection = 'benefit' | 'cost';

export type McdaWeightPresetId =
  | 'balanced'
  | 'safety_first'
  | 'rapid_response'
  | 'low_disruption';

export interface McdaCriterionConfig {
  id: McdaCriterionId;
  direction: McdaCriterionDirection;
  rawWeight: number;
  normalizedWeightPct: number;
  enabled: boolean;
}

export interface McdaConstraintCheck {
  id: string;
  label: string;
  labelTh: string;
  passed: boolean;
  detail: string;
  detailTh: string;
}

export interface McdaCandidateRawMetrics {
  safetyGainPct: number;
  effectivenessPct: number;
  implementationMinutes: number;
  remainingRiskPct: number;
  operationalCostIndex: number;
  infraSideEffectIndex: number;
  capacityHeadroomPct: number;
}

export type McdaActionPatch =
  | {
      kind: 'traffic_signal_green_wave';
      timing: TrafficLightTiming;
      congestionDeltaPct: number;
    }
  | {
      kind: 'traffic_close_and_reroute';
      targetIncidentRoadId?: string;
      routeMode: RouteOptimizationMode;
      congestionDeltaPct: number;
    }
  | {
      kind: 'traffic_clear_incidents_and_balance';
      timing: TrafficLightTiming;
      routeMode: RouteOptimizationMode;
    }
  | {
      kind: 'flood_drainage_upgrade';
      drainageCapacityPct: number;
      drainageBlockagePct: number;
      clearBlockedWaterEdges: boolean;
    }
  | {
      kind: 'water_discharge_strategy';
      strategyId: WaterDischargeStrategyId;
      clearBlockedWaterEdges: boolean;
      drainageBlockagePct?: number;
    }
  | {
      kind: 'power_isolate_only';
      isolateIds: string[];
    }
  | {
      kind: 'power_backup_restore';
      isolateIds: string[];
      backupEdgeIds: string[];
      restoreAreaIds: string[];
    }
  | {
      kind: 'power_load_shed_and_restore';
      demandMultiplierPct: number;
      isolateIds: string[];
      backupEdgeIds: string[];
      restoreAreaIds: string[];
    }
  | {
      kind: 'route_switch_safest';
      routeMode: RouteOptimizationMode;
      selectedRouteIndex: number;
      vehicleProfile?: VehicleProfileId;
    }
  | {
      kind: 'integrated_city_stabilization';
      drainageCapacityPct: number;
      drainageBlockagePct: number;
      clearBlockedWaterEdges: boolean;
      waterStrategyId: WaterDischargeStrategyId;
      powerIsolateIds: string[];
      powerBackupEdgeIds: string[];
      powerRestoreAreaIds: string[];
      trafficTiming: TrafficLightTiming;
      congestionReductionPct: number;
      routeMode: RouteOptimizationMode;
    }
  | {
      kind: 'noop_blocked';
    };

export interface DecisionPreviewVisual {
  centerX: number;
  centerZ: number;
  span: number;
  accentKind: 'traffic' | 'flood' | 'water' | 'power' | 'routing' | 'integrated';
  isFeasible: boolean;
  targetLines: Array<Array<[number, number]>>;
  highlightPoints: Array<{
    x: number;
    z: number;
    kind: 'problem' | 'solution' | 'blocked';
  }>;
}

export interface McdaCandidateSolution {
  id: string;
  problemId: string;
  domain: ProblemDomainId;
  title: string;
  titleTh: string;
  summary: string;
  summaryTh: string;
  isSimulatedEstimate: true;
  constraints: McdaConstraintCheck[];
  isFeasible: boolean;
  rejectionReasons: string[];
  rejectionReasonsTh: string[];
  rawMetrics: McdaCandidateRawMetrics;
  criterionScores: Record<McdaCriterionId, number>;
  criterionContributions: Record<McdaCriterionId, number>;
  weightedTotalScore: number;
  rank: number | null;
  isRecommended: boolean;
  advantages: string[];
  advantagesTh: string[];
  disadvantages: string[];
  disadvantagesTh: string[];
  remainingRisks: string[];
  remainingRisksTh: string[];
  predictedDeltas: string[];
  predictedDeltasTh: string[];
  previewVisual: DecisionPreviewVisual;
  actionPatch: McdaActionPatch;
}

export interface McdaEvaluationSnapshot {
  id: string;
  evaluatedAtIso: string;
  simElapsedSeconds: number;
  problemId: string;
  problemTitle: string;
  problemTitleTh: string;
  totalCandidates: number;
  feasibleCount: number;
  infeasibleCount: number;
  recommendedSolutionId: string | null;
  recommendedTitle: string | null;
  recommendedTitleTh: string | null;
  recommendedScore: number | null;
  appliedSolutionId?: string;
  appliedTitle?: string;
  appliedTitleTh?: string;
  criteriaWeightsPct: Record<McdaCriterionId, number>;
}

export interface DssEvaluationBundle {
  collectedAtSimSeconds: number;
  modules: DssModuleTelemetryRecord[];
  problems: DssProblemRecord[];
  selectedProblem: DssProblemRecord | null;
  candidates: McdaCandidateSolution[];
  feasibleCandidates: McdaCandidateSolution[];
  infeasibleCandidates: McdaCandidateSolution[];
  recommendedSolution: McdaCandidateSolution | null;
  criteria: McdaCriterionConfig[];
  normalizedWeightsSumPct: number;
}

export interface McdaGeminiExplanationResponse {
  executiveExplanation: string;
  recommendedRationale: string;
  tradeoffComparison: string;
  constraintNotes: string;
  aiCausalHypotheses: string[];
  implementationGuidance: string;
  mode: 'gemini' | 'fallback';
  model: string;
  fallbackReason?: string | null;
}

export type WhatIfWorkflowStep =
  | 'problem'
  | 'solutions'
  | 'compare'
  | 'preview'
  | 'apply'
  | 'results';

export interface WhatIfParameterOverrides {
  reopenIncidentRoadIds: string[];
  closeIncidentRoadIds: string[];
  greenSecondsOverride: number | null;
  drainageCapacityPctOverride: number | null;
  drainageBlockagePctOverride: number | null;
  clearBlockedWaterEdgesOverride: boolean | null;
  waterStrategyOverrideId: WaterDischargeStrategyId | null;
  powerDemandMultiplierOverride: number | null;
}

export interface BeforeAfterMetricsSnapshot {
  floodSeverityScore: number;
  floodSeverityLabel: SummaryMetrics['floodSeverityLabel'];
  detectedProblemsCount: number;
  affectedRoadsCount: number;
  affectedRoadsPct: number;
  floodedAreaKm2: number;
  floodedAreaPct: number;
  waterLevelMeters: number;
  reservoirUtilizationPct: number;
  reservoirRemainingM3: number;
  trafficCongestionPct: number;
  avgNetworkSpeedKmh: number;
  estimatedTravelTimeMin: number | null;
  passableNetworkPct: number;
  powerOutageAreasCount: number;
  totalPowerAreasCount: number;
  unservedLoadMw: number;
  effectiveDrainagePct: number;
}

export interface WhatIfSimulationPreview {
  solution: McdaCandidateSolution;
  before: BeforeAfterMetricsSnapshot;
  after: BeforeAfterMetricsSnapshot;
  effectivenessPct: number;
  constraintChecks: McdaConstraintCheck[];
  isValid: boolean;
  blockedReason?: string;
  blockedReasonTh?: string;
  parametersSummary: string;
  parametersSummaryTh: string;
  simulatedModulesAffected: ProblemDomainId[];
}

export interface WhatIfSessionRecord {
  id: string;
  beforeSnapshotId: string;
  afterSnapshotId?: string;
  problemId: string;
  problemTitle: string;
  problemTitleTh: string;
  solutionId: string;
  solutionTitle: string;
  solutionTitleTh: string;
  parametersSummary: string;
  parametersSummaryTh: string;
  before: BeforeAfterMetricsSnapshot;
  after: BeforeAfterMetricsSnapshot;
  effectivenessPct: number;
  appliedAtIso: string;
  appliedAtSimSeconds: number;
}

