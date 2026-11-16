import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Layers, Moon, RotateCcw, Sun } from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTheme } from '../context/ThemeContext';
import {
  initChatuchakScene,
  type ChatuchakSceneController,
} from '../engine/chatuchakScene';
import { useTranslation } from '../i18n';
import type {
  CameraPreset,
  LayerVisibility,
} from '../types/city';
import { FloodLegend } from './FloodLegend';

const CAMERA_PRESET_KEYS: Array<{ id: CameraPreset; labelKey: string }> = [
  { id: 'overview', labelKey: 'viewport.presets.overview' },
  { id: 'chatuchakPark', labelKey: 'viewport.presets.chatuchakPark' },
  { id: 'latPhrao', labelKey: 'viewport.presets.latPhrao' },
  { id: 'krungThepAphiwat', labelKey: 'viewport.presets.krungThepAphiwat' },
  { id: 'followCar', labelKey: 'viewport.presets.followCar' },
];

const LAYER_KEYS: Array<[keyof LayerVisibility, string]> = [
  ['buildings', 'viewport.layerNames.buildings'],
  ['roads', 'viewport.layerNames.roads'],
  ['water', 'viewport.layerNames.water'],
  ['parks', 'viewport.layerNames.parks'],
  ['railways', 'viewport.layerNames.railways'],
  ['traffic', 'viewport.layerNames.traffic'],
  ['trafficDensityOverlay', 'viewport.layerNames.trafficDensityOverlay'],
  ['labels', 'viewport.layerNames.labels'],
  ['floodOverlay', 'viewport.layerNames.floodOverlay'],
  ['impactOverlay', 'viewport.layerNames.impactOverlay'],
  ['routeOverlay', 'viewport.layerNames.routeOverlay'],
  ['waterNetworkOverlay', 'viewport.layerNames.waterNetworkOverlay'],
  ['powerNetworkOverlay', 'viewport.layerNames.powerNetworkOverlay'],
  ['decisionPreviewOverlay', 'viewport.layerNames.decisionPreviewOverlay'],
];

export function CityViewport() {
  const {
    state,
    activeArea,
    impactAnalysis,
    waterResult,
    powerResult,
    routeResult,
    metrics,
    dssBundle,
    setCityLoading,
    setCityLoaded,
    setCityError,
    selectBuilding,
    selectRoad,
    selectPlace,
    toggleLayer,
    setLightingMode,
  } = useSimulation();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const {
    layers,
    lightingMode,
    settings,
    cityStatus,
    cityError,
    selectedImpactObject,
    selectedRouteIndex,
    trafficStatus,
    trafficCongestionPct,
    trafficLightTiming,
    focusPointTarget,
    clearSelectionSignal,
    focusAreaSignal,
    resetFloodSignal,
    locateTargetSignal,
    focusRouteSignal,
    focusPointSignal,
    resetCount,
    previewMcdaSolutionId,
  } = state;

  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ChatuchakSceneController | null>(null);
  const lastFocusSignalRef = useRef(0);
  const lastResetFloodSignalRef = useRef(0);
  const lastLocateSignalRef = useRef(0);
  const lastFocusRouteSignalRef = useRef(0);
  const lastFocusPointSignalRef = useRef(0);
  const lastPreviewSolRef = useRef<string | null>(null);

  const callbacksRef = useRef({
    setCityLoading,
    setCityLoaded,
    setCityError,
    selectBuilding,
    selectRoad,
    selectPlace,
  });
  callbacksRef.current = {
    setCityLoading,
    setCityLoaded,
    setCityError,
    selectBuilding,
    selectRoad,
    selectPlace,
  };

  const [activePreset, setActivePreset] = useState<CameraPreset>('overview');
  const [layersMenuOpen, setLayersMenuOpen] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [mountKey, setMountKey] = useState(0);

  const mountScene = useCallback(() => {
    const container = mountRef.current;
    if (!container) return undefined;

    callbacksRef.current.setCityLoading();
    const controller = initChatuchakScene(container, {
      onLoaded: (stats, areas, catalog, roadGraph, waypoints, waterNetwork, powerNetwork) =>
        callbacksRef.current.setCityLoaded(
          stats,
          areas,
          catalog,
          roadGraph,
          waypoints,
          waterNetwork,
          powerNetwork
        ),
      onError: (msg) => callbacksRef.current.setCityError(msg),
      onContextLost: (lost) => setContextLost(lost),
      onSelectBuilding: (b) => callbacksRef.current.selectBuilding(b),
      onSelectRoad: (r) => callbacksRef.current.selectRoad(r),
      onSelectPlace: (p) => callbacksRef.current.selectPlace(p),
    });

    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    return mountScene();
  }, [mountScene, mountKey]);

  useEffect(() => {
    controllerRef.current?.setLayerVisibility(layers);
  }, [layers]);

  useEffect(() => {
    const shouldFocus = focusAreaSignal !== lastFocusSignalRef.current;
    lastFocusSignalRef.current = focusAreaSignal;
    const instantReset = resetFloodSignal !== lastResetFloodSignalRef.current;
    lastResetFloodSignalRef.current = resetFloodSignal;

    controllerRef.current?.setSimulationState({
      waterLevelMeters: metrics.floodLevelMeters,
      floodSeverity: settings.floodSeverity,
      rainfallMmHr: settings.rainfallMmHr,
      drainageCapacityPct: settings.drainageCapacityPct,
      drainageBlockagePct: settings.drainageBlockagePct,
      canalWaterLevelPct: settings.canalWaterLevelPct,
      lowLyingSensitivityPct: settings.lowLyingSensitivityPct,
      floodOpacity: settings.floodOpacity,
      isRunning: settings.status === 'running',
      isPaused: settings.status === 'paused',
      simulationSpeed: settings.simulationSpeed,
      affectedArea: activeArea,
      analysis: impactAnalysis,
      focusOnArea: shouldFocus,
      instantReset,
    });
  }, [
    metrics.floodLevelMeters,
    settings.floodSeverity,
    settings.rainfallMmHr,
    settings.drainageCapacityPct,
    settings.drainageBlockagePct,
    settings.canalWaterLevelPct,
    settings.lowLyingSensitivityPct,
    settings.floodOpacity,
    settings.status,
    settings.simulationSpeed,
    activeArea,
    impactAnalysis,
    focusAreaSignal,
    resetFloodSignal,
  ]);

  useEffect(() => {
    if (locateTargetSignal > lastLocateSignalRef.current && selectedImpactObject) {
      lastLocateSignalRef.current = locateTargetSignal;
      controllerRef.current?.focusAffectedObject(selectedImpactObject);
    }
  }, [locateTargetSignal, selectedImpactObject]);

  useEffect(() => {
    if (cityStatus !== 'ready') return;
    controllerRef.current?.setRouteOverlay(routeResult, selectedRouteIndex);
  }, [cityStatus, routeResult, selectedRouteIndex]);

  useEffect(() => {
    if (cityStatus !== 'ready') return;
    controllerRef.current?.setWaterNetworkState(waterResult);
  }, [cityStatus, waterResult]);

  useEffect(() => {
    if (cityStatus !== 'ready') return;
    controllerRef.current?.setPowerNetworkState(powerResult);
  }, [cityStatus, powerResult]);

  useEffect(() => {
    if (cityStatus !== 'ready') return;
    const previewSol = previewMcdaSolutionId
      ? dssBundle.candidates.find((c) => c.id === previewMcdaSolutionId) ?? null
      : null;
    controllerRef.current?.setDecisionPreviewState({
      bundle: dssBundle,
      selectedProblem: dssBundle.selectedProblem,
      previewSolution: previewSol,
    });
    if (previewSol && lastPreviewSolRef.current !== previewSol.id) {
      lastPreviewSolRef.current = previewSol.id;
      controllerRef.current?.focusScenePoint(
        previewSol.previewVisual.centerX,
        previewSol.previewVisual.centerZ,
        previewSol.previewVisual.span
      );
    } else if (!previewSol) {
      lastPreviewSolRef.current = null;
    }
  }, [cityStatus, dssBundle, previewMcdaSolutionId]);

  useEffect(() => {
    if (cityStatus !== 'ready') return;
    controllerRef.current?.setTrafficState({
      isTrafficRunning: trafficStatus === 'running',
      trafficVolumePct: trafficCongestionPct,
      timing: trafficLightTiming,
      densitySegments: routeResult.trafficDensitySegments,
      blockedRoads: routeResult.blockedRoads,
      showDensityOverlay: layers.trafficDensityOverlay,
    });
  }, [
    cityStatus,
    trafficStatus,
    trafficCongestionPct,
    trafficLightTiming,
    routeResult.trafficDensitySegments,
    routeResult.blockedRoads,
    layers.trafficDensityOverlay,
  ]);

  useEffect(() => {
    if (focusRouteSignal > lastFocusRouteSignalRef.current && cityStatus === 'ready') {
      lastFocusRouteSignalRef.current = focusRouteSignal;
      controllerRef.current?.focusRoute(routeResult, selectedRouteIndex);
    }
  }, [focusRouteSignal, cityStatus, routeResult, selectedRouteIndex]);

  useEffect(() => {
    if (
      focusPointSignal > lastFocusPointSignalRef.current &&
      focusPointTarget &&
      cityStatus === 'ready'
    ) {
      lastFocusPointSignalRef.current = focusPointSignal;
      controllerRef.current?.focusScenePoint(
        focusPointTarget.x,
        focusPointTarget.z,
        focusPointTarget.span
      );
    }
  }, [focusPointSignal, focusPointTarget, cityStatus]);

  useEffect(() => {
    const nextMode = theme === 'light' ? 'daylight' : 'tactical';
    setLightingMode(nextMode);
  }, [theme, resetCount, setLightingMode]);

  useEffect(() => {
    controllerRef.current?.setLightingMode(lightingMode);
  }, [lightingMode, cityStatus]);

  useEffect(() => {
    if (clearSelectionSignal > 0) {
      controllerRef.current?.clearSelection();
    }
  }, [clearSelectionSignal]);

  useEffect(() => {
    if (resetCount > 0) {
      setActivePreset('overview');
      setLayersMenuOpen(false);
    }
  }, [resetCount]);

  const handlePresetClick = (preset: CameraPreset) => {
    setActivePreset(preset);
    controllerRef.current?.setCameraPreset(preset);
  };

  return (
    <div
      data-testid="permanent-3d-city-viewport"
      className="relative w-full h-full min-h-[240px] overflow-hidden rounded-xl border border-[#E2E8F0] dark:border-slate-800/80 bg-[#dceaf5] dark:bg-[#08111f]"
    >
      {/* Isolated Permanent Three.js Canvas Mount */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        aria-label={t('viewport.canvasAria')}
      />

      {/* Top Viewport Toolbar (solid surface, no backdrop-blur over WebGL) */}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-10">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 p-1 rounded-lg bg-white/95 border border-[#E2E8F0] shadow-sm dark:shadow-none dark:bg-[#0b1220]/95 dark:border-slate-800/90 max-w-full">
          <span className="px-2 py-1 text-[11px] font-medium text-[#64748B] dark:text-slate-400 flex items-center gap-1.5 whitespace-nowrap">
            <Camera className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <span className="hidden sm:inline">{t('viewport.viewLabel')}</span>
          </span>
          {CAMERA_PRESET_KEYS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetClick(preset.id)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activePreset === preset.id
                  ? 'bg-[#0891B2]/12 text-[#0891B2] border border-[#0891B2]/45 font-semibold dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/40'
                  : 'text-[#172033] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/70 border border-transparent'
              }`}
            >
              {t(preset.labelKey)}
            </button>
          ))}
        </div>

        {/* Lighting & Layer Controls */}
        <div className="pointer-events-auto relative flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setLightingMode(lightingMode === 'tactical' ? 'daylight' : 'tactical')
            }
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/95 border border-[#E2E8F0] text-[#172033] hover:border-[#0891B2] shadow-sm dark:shadow-none dark:bg-[#0b1220]/95 dark:border-slate-800/90 dark:text-slate-200 dark:hover:text-white dark:hover:border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            {lightingMode === 'tactical' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400 shrink-0" />
                <span>{t('viewport.daylight')}</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
                <span>{t('viewport.tactical')}</span>
              </>
            )}
          </button>

          <button
            type="button"
            data-testid="layers-toggle-btn"
            onClick={() => setLayersMenuOpen((prev) => !prev)}
            aria-expanded={layersMenuOpen}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shadow-sm dark:shadow-none ${
              layersMenuOpen
                ? 'bg-white border-[#0891B2] text-[#0891B2] dark:bg-cyan-500/20 dark:border-cyan-500/40 dark:text-cyan-300'
                : 'bg-white/95 border-[#E2E8F0] text-[#172033] hover:border-[#0891B2] dark:bg-[#0b1220]/95 dark:border-slate-800/90 dark:text-slate-200 dark:hover:text-white dark:hover:border-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>{t('viewport.layers')}</span>
          </button>

          {layersMenuOpen && (
            <div
              data-testid="layers-menu-popover"
              className="absolute right-0 top-10 w-60 rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-700/90 p-2.5 shadow-xl z-20 space-y-1"
            >
              <p className="px-2 py-1 text-[11px] font-semibold text-[#64748B] dark:text-slate-400 uppercase tracking-wider">
                {t('viewport.layersHeading')}
              </p>
              {LAYER_KEYS.map(([key, labelKey]) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs text-[#172033] hover:bg-[#F4F7FB] dark:text-slate-200 dark:hover:bg-slate-800/70 cursor-pointer"
                >
                  <span className="truncate">{t(labelKey)}</span>
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => toggleLayer(key)}
                    className="accent-[#0891B2] dark:accent-cyan-500 rounded cursor-pointer shrink-0"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom-Left Interaction Hint */}
      <div className="absolute bottom-3 left-3 pointer-events-none z-10 hidden sm:block">
        <div className="px-3 py-1.5 rounded-lg bg-white/95 border border-[#E2E8F0] text-[11px] text-[#64748B] shadow-sm dark:shadow-none dark:bg-[#0b1220]/90 dark:border-slate-800/80 dark:text-slate-400">
          {t('viewport.interactionHint')}
        </div>
      </div>

      {/* Bottom-Right Flood Legend & Layer Controls */}
      <FloodLegend />

      {/* WebGL Context Lost Banner */}
      {contextLost && (
        <div className="absolute inset-0 bg-[#F4F7FB]/95 dark:bg-[#08111f]/95 flex flex-col items-center justify-center gap-3 z-30 p-6 text-center">
          <p className="text-sm font-semibold text-[#D97706] dark:text-orange-400">
            {t('viewport.webglLostTitle')}
          </p>
          <p className="text-xs text-[#64748B] dark:text-slate-400 max-w-md">
            {t('viewport.webglLostDesc')}
          </p>
          <button
            type="button"
            onClick={() => {
              setContextLost(false);
              setMountKey((k) => k + 1);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('viewport.reload3d')}</span>
          </button>
        </div>
      )}

      {/* Loading / Error State Overlay */}
      {cityStatus === 'loading' && (
        <div className="absolute inset-0 bg-[#F4F7FB]/95 dark:bg-[#08111f]/95 flex flex-col items-center justify-center gap-3 z-20 p-6 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#0891B2]/30 border-t-[#0891B2] dark:border-cyan-500/30 dark:border-t-cyan-400 animate-spin" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#172033] dark:text-slate-100">
              {t('viewport.loadingTitle')}
            </p>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              {t('viewport.loadingDesc')}
            </p>
          </div>
        </div>
      )}

      {cityStatus === 'error' && (
        <div className="absolute inset-0 bg-[#F4F7FB]/95 dark:bg-[#08111f]/95 flex flex-col items-center justify-center gap-3 z-20 p-6 text-center">
          <p className="text-sm font-semibold text-[#DC2626] dark:text-red-400">
            {t('viewport.errorTitle')}
          </p>
          <p className="text-xs text-[#64748B] dark:text-slate-400 max-w-md">{cityError}</p>
          <button
            type="button"
            onClick={() => setMountKey((k) => k + 1)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('viewport.retryLoad')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
