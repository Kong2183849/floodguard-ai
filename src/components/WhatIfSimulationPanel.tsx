import { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Crosshair,
  Eye,
  FlaskConical,
  History,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSimulation } from '../context/SimulationContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../i18n';
import type {
  BeforeAfterMetricsSnapshot,
  DssProblemRecord,
  McdaCandidateSolution,
  WhatIfWorkflowStep,
} from '../types/city';

const WORKFLOW_STEPS: Array<{ id: WhatIfWorkflowStep; num: number; labelKey: string }> = [
  { id: 'problem', num: 1, labelKey: 'whatif.steps.problem' },
  { id: 'solutions', num: 2, labelKey: 'whatif.steps.solutions' },
  { id: 'compare', num: 3, labelKey: 'whatif.steps.compare' },
  { id: 'preview', num: 4, labelKey: 'whatif.steps.preview' },
  { id: 'apply', num: 5, labelKey: 'whatif.steps.apply' },
  { id: 'results', num: 6, labelKey: 'whatif.steps.results' },
];

const COMPARE_BAR_COLORS = ['#22d3ee', '#10b981', '#f59e0b'];

function formatDeltaBadge(
  beforeVal: number | null,
  afterVal: number | null,
  decimals: number,
  lowerIsBetter: boolean,
  unit: string
): { text: string; toneClass: string } {
  if (beforeVal === null || afterVal === null) {
    if (beforeVal === null && afterVal !== null) {
      return { text: `+Restored`, toneClass: 'text-[#16A34A] dark:text-emerald-300' };
    }
    if (beforeVal !== null && afterVal === null) {
      return { text: `Blocked`, toneClass: 'text-[#DC2626] dark:text-rose-300' };
    }
    return { text: '—', toneClass: 'text-[#64748B] dark:text-slate-400' };
  }
  const diff = Number((afterVal - beforeVal).toFixed(decimals));
  if (Math.abs(diff) < Math.pow(10, -decimals) * 0.5) {
    return { text: `0${unit}`, toneClass: 'text-[#64748B] dark:text-slate-400' };
  }
  const sign = diff > 0 ? '+' : '';
  const improved = lowerIsBetter ? diff < 0 : diff > 0;
  return {
    text: `${sign}${diff.toFixed(decimals)}${unit}`,
    toneClass: improved
      ? 'text-[#16A34A] dark:text-emerald-300'
      : 'text-[#DC2626] dark:text-rose-300',
  };
}

export function WhatIfSimulationPanel() {
  const {
    state,
    dssBundle,
    waterResult,
    liveBeforeAfterMetrics,
    whatIfPreview,
    setSection,
    setSelectedDssProblem,
    setWhatIfWorkflowStep,
    selectWhatIfSolution,
    setPreviewMcdaSolution,
    updateWhatIfOverrides,
    resetWhatIfOverrides,
    commitWhatIfSolution,
    saveWhatIfNamedSnapshot,
    rollbackWhatIfBaseline,
    restoreScenarioSnapshot,
    resetToOriginalBaseline,
    focusScenePoint,
  } = useSimulation();
  const { t, language, formatNumber, formatDecimal } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isTh = language === 'th';

  const [snapshotNameInput, setSnapshotNameInput] = useState('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const activeStep = state.whatIfWorkflowStep;
  const selectedProblem: DssProblemRecord | null = dssBundle.selectedProblem;
  const committedRecord = state.whatIfCommittedRecord;
  const overrides = state.whatIfParameterOverrides;

  const selectedSolution: McdaCandidateSolution | null = whatIfPreview?.solution ?? null;

  const handleFocusProblem = (prob: DssProblemRecord) => {
    if (prob.targetRef?.sceneX !== undefined && prob.targetRef.sceneZ !== undefined) {
      focusScenePoint(
        prob.targetRef.sceneX,
        prob.targetRef.sceneZ,
        prob.targetRef.span ?? 170
      );
    }
  };

  // Top 3 candidates for Step 3 comparison chart
  const topComparisonCandidates = useMemo(
    () => dssBundle.candidates.slice(0, Math.min(3, dssBundle.candidates.length)),
    [dssBundle.candidates]
  );

  const comparisonChartData = useMemo(
    () =>
      dssBundle.criteria
        .filter((c) => c.enabled)
        .map((c) => {
          const row: Record<string, string | number> = {
            criterion: t(`mcda.criteria.${c.id}.short`),
          };
          topComparisonCandidates.forEach((sol, idx) => {
            row[`sol_${idx}`] = Number(sol.criterionScores[c.id].toFixed(1));
          });
          return row;
        }),
    [dssBundle.criteria, topComparisonCandidates, t]
  );

  // Active Before/After metrics for Step 6 Results (either committed session record or live preview fallback)
  const resultsComparison: {
    before: BeforeAfterMetricsSnapshot;
    after: BeforeAfterMetricsSnapshot;
    effectivenessPct: number;
    solutionTitle: string;
    parametersSummary: string;
    isCommitted: boolean;
  } | null = useMemo(() => {
    if (committedRecord) {
      return {
        before: committedRecord.before,
        after: liveBeforeAfterMetrics,
        effectivenessPct: committedRecord.effectivenessPct,
        solutionTitle: isTh
          ? committedRecord.solutionTitleTh
          : committedRecord.solutionTitle,
        parametersSummary: isTh
          ? committedRecord.parametersSummaryTh
          : committedRecord.parametersSummary,
        isCommitted: true,
      };
    }
    if (whatIfPreview) {
      return {
        before: whatIfPreview.before,
        after: whatIfPreview.after,
        effectivenessPct: whatIfPreview.effectivenessPct,
        solutionTitle: isTh ? whatIfPreview.solution.titleTh : whatIfPreview.solution.title,
        parametersSummary: isTh
          ? whatIfPreview.parametersSummaryTh
          : whatIfPreview.parametersSummary,
        isCommitted: false,
      };
    }
    return null;
  }, [committedRecord, liveBeforeAfterMetrics, whatIfPreview, isTh]);

  const beforeAfterChartData = useMemo(() => {
    if (!resultsComparison) return [];
    const { before, after } = resultsComparison;
    return [
      {
        metric: t('whatif.chart.severity'),
        before: before.floodSeverityScore,
        after: after.floodSeverityScore,
      },
      {
        metric: t('whatif.chart.floodPct'),
        before: before.floodedAreaPct,
        after: after.floodedAreaPct,
      },
      {
        metric: t('whatif.chart.storagePct'),
        before: before.reservoirUtilizationPct,
        after: after.reservoirUtilizationPct,
      },
      {
        metric: t('whatif.chart.congestionPct'),
        before: before.trafficCongestionPct,
        after: after.trafficCongestionPct,
      },
    ];
  }, [resultsComparison, t]);

  const handleSaveSnapshot = () => {
    const fallbackName = resultsComparison
      ? `What-If: ${resultsComparison.solutionTitle.slice(0, 32)}`
      : `Scenario T+${Math.round(state.settings.elapsedSeconds)}s`;
    const finalName = snapshotNameInput.trim() || fallbackName;
    saveWhatIfNamedSnapshot(finalName);
    setSnapshotNameInput('');
    setSavedNotice(finalName);
    window.setTimeout(() => setSavedNotice(null), 3500);
  };

  const toggleSandboxRoadAction = (roadId: string, currentlyActive: boolean) => {
    if (currentlyActive) {
      // Road is currently blocked/incident -> queue reopen in sandbox
      const exists = overrides.reopenIncidentRoadIds.includes(roadId);
      updateWhatIfOverrides({
        reopenIncidentRoadIds: exists
          ? overrides.reopenIncidentRoadIds.filter((id) => id !== roadId)
          : [...overrides.reopenIncidentRoadIds, roadId],
        closeIncidentRoadIds: overrides.closeIncidentRoadIds.filter((id) => id !== roadId),
      });
    } else {
      // Road is open -> queue closure in sandbox
      const exists = overrides.closeIncidentRoadIds.includes(roadId);
      updateWhatIfOverrides({
        closeIncidentRoadIds: exists
          ? overrides.closeIncidentRoadIds.filter((id) => id !== roadId)
          : [...overrides.closeIncidentRoadIds, roadId],
        reopenIncidentRoadIds: overrides.reopenIncidentRoadIds.filter((id) => id !== roadId),
      });
    }
  };

  const isPreviewingIn3d =
    Boolean(selectedSolution) && state.previewMcdaSolutionId === selectedSolution?.id;

  return (
    <div className="space-y-4" data-testid="module-whatif">
      {/* Header & 6-Stage Interactive Workflow Stepper */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-500/15 border border-cyan-300 dark:border-cyan-500/35 flex items-center justify-center shrink-0">
              <FlaskConical className="w-4 h-4 text-[#0891B2] dark:text-cyan-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">{t('whatif.title')}</h3>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('whatif.subtitle')}</p>
            </div>
          </div>
          <span className="text-[11px] font-mono-tabular text-[#0891B2] dark:text-cyan-300 shrink-0 whitespace-nowrap">
            {dssBundle.problems.length} {t('dss.activeLabel')} ·{' '}
            {state.scenarioHistory.length} {t('whatif.snapshotsLabel')}
          </span>
        </div>

        {/* Interactive Stepper */}
        <div
          className="grid grid-cols-3 sm:grid-cols-6 gap-1"
          role="tablist"
          aria-label={t('whatif.workflowAria')}
        >
          {WORKFLOW_STEPS.map((step) => {
            const active = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`whatif-step-${step.id}`}
                onClick={() => setWhatIfWorkflowStep(step.id)}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap truncate ${
                  active
                    ? 'bg-cyan-50 border-cyan-600/50 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/50 dark:text-cyan-300'
                    : 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-700 hover:border-slate-300 dark:bg-slate-900/75 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span className="font-mono-tabular mr-1">{step.num}.</span>
                <span>{t(step.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* STEP 1: SELECT A PROBLEM */}
      {activeStep === 'problem' && (
        <section
          data-testid="whatif-panel-problem"
          className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {t('whatif.step1Title')}
              </h4>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('whatif.step1Desc')}</p>
            </div>
            <button
              type="button"
              onClick={() => setSection('dss')}
              className="text-[11px] text-[#0891B2] hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200 cursor-pointer whitespace-nowrap shrink-0"
            >
              {t('whatif.openDssLink')} →
            </button>
          </div>

          {dssBundle.problems.length === 0 ? (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#16A34A] dark:text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
                <span>{t('whatif.noProblemsState')}</span>
              </div>
              <button
                type="button"
                onClick={() => setWhatIfWorkflowStep('solutions')}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 text-[#172033] dark:text-slate-200 hover:text-[#0891B2] dark:hover:text-white cursor-pointer whitespace-nowrap"
              >
                {t('whatif.explorePreventiveBtn')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {dssBundle.problems.map((prob) => {
                const isSelected = selectedProblem?.id === prob.id;
                const sevClass =
                  prob.severity === 'Critical'
                    ? 'text-[#DC2626] dark:text-rose-400'
                    : prob.severity === 'High'
                      ? 'text-orange-700 dark:text-orange-400'
                      : prob.severity === 'Medium'
                        ? 'text-[#D97706] dark:text-amber-300'
                        : 'text-[#0891B2] dark:text-cyan-300';
                return (
                  <div
                    key={prob.id}
                    className={`rounded-lg p-2.5 border transition-colors space-y-1.5 ${
                      isSelected
                        ? 'bg-cyan-50 border-cyan-500/55 dark:bg-cyan-500/10 dark:border-cyan-500/45'
                        : 'bg-[#F8FAFC] border-[#E2E8F0] dark:bg-slate-900/70 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        data-testid={`whatif-problem-${prob.id}`}
                        onClick={() => {
                          setSelectedDssProblem(prob.id);
                          handleFocusProblem(prob);
                        }}
                        className="text-left min-w-0 flex-1 cursor-pointer space-y-0.5"
                      >
                        <p className="text-xs font-semibold text-[#172033] dark:text-slate-100 leading-snug">
                          {isTh ? prob.titleTh : prob.title}
                        </p>
                        <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                          {isTh ? prob.categoryTh : prob.category} ·{' '}
                          {isTh ? prob.locationTh : prob.location}
                        </p>
                      </button>
                      <span className={`text-[11px] font-semibold shrink-0 ${sevClass}`}>
                        {t(`risk.${prob.severity}`)} · T+{prob.detectedAtSimSeconds}s
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleFocusProblem(prob)}
                        className="flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300 hover:text-[#0891B2] dark:hover:text-cyan-300 cursor-pointer whitespace-nowrap"
                      >
                        <Crosshair className="w-3 h-3 shrink-0" />
                        <span>{t('dss.focus3dBtn')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDssProblem(prob.id);
                          setWhatIfWorkflowStep('solutions');
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer whitespace-nowrap"
                      >
                        <span>{t('whatif.reviewSolutionsBtn')}</span>
                        <ArrowRight className="w-3 h-3 shrink-0" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* STEP 2: REVIEW SOLUTIONS */}
      {activeStep === 'solutions' && (
        <section
          data-testid="whatif-panel-solutions"
          className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {t('whatif.step2Title')}
              </h4>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">
                {selectedProblem
                  ? isTh
                    ? selectedProblem.titleTh
                    : selectedProblem.title
                  : t('whatif.cityWideScope')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSection('mcda')}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 text-[#0891B2] dark:text-cyan-300 hover:border-cyan-600/40 dark:hover:border-cyan-500/40 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Scale className="w-3 h-3 shrink-0" />
              <span>{t('whatif.tuneWeightsBtn')}</span>
            </button>
          </div>

          <div className="space-y-2">
            {dssBundle.candidates.map((sol) => {
              const isSelected = selectedSolution?.id === sol.id;
              return (
                <div
                  key={sol.id}
                  data-testid={`whatif-candidate-${sol.id}`}
                  className={`rounded-lg p-3 border space-y-2 ${
                    !sol.isFeasible
                      ? 'bg-rose-50 border-rose-300 dark:bg-rose-950/20 dark:border-rose-500/35'
                      : isSelected
                        ? 'bg-cyan-50 border-cyan-500/60 dark:bg-cyan-500/10 dark:border-cyan-500/50'
                        : 'bg-[#F8FAFC] border-[#E2E8F0] dark:bg-slate-900/75 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
                        {sol.isFeasible
                          ? `#${sol.rank} · ${
                              sol.isRecommended
                                ? t('mcda.recommendedBadge')
                                : t('mcda.feasibleLabel')
                            }`
                          : t('mcda.infeasibleBadge')}
                      </p>
                      <h5 className="text-xs font-semibold text-[#172033] dark:text-slate-100 leading-snug">
                        {isTh ? sol.titleTh : sol.title}
                      </h5>
                    </div>
                    <span
                      className={`text-sm font-mono-tabular font-bold shrink-0 ${
                        sol.isFeasible ? 'text-[#16A34A] dark:text-emerald-300' : 'text-[#DC2626] dark:text-rose-400'
                      }`}
                    >
                      {sol.weightedTotalScore.toFixed(1)}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                    {isTh ? sol.summaryTh : sol.summary}
                  </p>

                  {!sol.isFeasible && (
                    <div className="flex items-start gap-1.5 text-[11px] text-[#DC2626] dark:text-rose-200 bg-rose-100 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/30 rounded px-2 py-1.5">
                      <XCircle className="w-3.5 h-3.5 text-[#DC2626] dark:text-rose-400 mt-0.5 shrink-0" />
                      <span>
                        {(isTh ? sol.rejectionReasonsTh : sol.rejectionReasons).join(' · ')}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400 truncate">
                      {(isTh ? sol.predictedDeltasTh : sol.predictedDeltas).join(' · ')}
                    </span>
                    <button
                      type="button"
                      data-testid={`whatif-select-sol-${sol.id}`}
                      onClick={() => selectWhatIfSolution(sol.id, 'preview')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                        sol.isFeasible
                          ? 'bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400'
                          : 'bg-rose-100 border border-rose-300 text-[#DC2626] hover:bg-rose-200 dark:bg-slate-800 dark:border-rose-500/40 dark:text-rose-200 dark:hover:bg-rose-950/50'
                      }`}
                    >
                      <span>
                        {sol.isFeasible
                          ? t('whatif.sandboxPreviewBtn')
                          : t('whatif.inspectBlockedBtn')}
                      </span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* STEP 3: COMPARE ALTERNATIVES */}
      {activeStep === 'compare' && (
        <section
          data-testid="whatif-panel-compare"
          className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {t('whatif.step3Title')}
              </h4>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('whatif.step3Desc')}</p>
            </div>
            <button
              type="button"
              onClick={() => setWhatIfWorkflowStep('preview')}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer whitespace-nowrap shrink-0"
            >
              {t('whatif.goToPreviewBtn')} →
            </button>
          </div>

          {topComparisonCandidates.length > 0 && (
            <>
              <div className="h-48 w-full rounded-lg bg-[#F8FAFC] dark:bg-slate-950/60 border border-[#E2E8F0] dark:border-slate-800 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={comparisonChartData}
                    margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#cbd5e1'} />
                    <XAxis dataKey="criterion" tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#0b1220' : '#ffffff',
                        borderColor: isDark ? '#334155' : '#cbd5e1',
                        borderRadius: '8px',
                        fontSize: '11px',
                        color: isDark ? '#f8fafc' : '#172033',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', color: isDark ? '#cbd5e1' : '#334155' }} />
                    {topComparisonCandidates.map((sol, idx) => (
                      <Bar
                        key={sol.id}
                        dataKey={`sol_${idx}`}
                        name={`#${sol.rank ?? 'X'} ${(isTh ? sol.titleTh : sol.title).slice(0, 18)}…`}
                        fill={COMPARE_BAR_COLORS[idx % COMPARE_BAR_COLORS.length]}
                        radius={[3, 3, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] dark:border-slate-800">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-[#F8FAFC] dark:bg-slate-900/90 text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="px-2.5 py-2 font-semibold">{t('whatif.optionCol')}</th>
                      <th className="px-2 py-2 font-semibold text-right">
                        {t('mcda.totalWeightedCol')}
                      </th>
                      <th className="px-2 py-2 font-semibold text-right">
                        {t('whatif.estTimeCol')}
                      </th>
                      <th className="px-2 py-2 font-semibold text-right">
                        {t('whatif.actionCol')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800/80 bg-white dark:bg-slate-950/40">
                    {dssBundle.candidates.map((sol) => (
                      <tr key={sol.id} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-900/50">
                        <td className="px-2.5 py-2 text-[#172033] dark:text-slate-200 max-w-[170px] truncate">
                          #{sol.rank ?? 'X'} {isTh ? sol.titleTh : sol.title}
                        </td>
                        <td
                          className={`px-2 py-2 text-right font-mono-tabular font-semibold ${
                            sol.isFeasible ? 'text-[#16A34A] dark:text-emerald-300' : 'text-[#DC2626] dark:text-rose-400'
                          }`}
                        >
                          {sol.weightedTotalScore.toFixed(1)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                          {sol.rawMetrics.implementationMinutes} {t('common.minutesShort')}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => selectWhatIfSolution(sol.id, 'preview')}
                            className="text-[#0891B2] hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200 font-medium cursor-pointer whitespace-nowrap"
                          >
                            {t('whatif.testBtn')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* STEP 4: PREVIEW IN SEPARATE WHAT-IF SANDBOX */}
      {activeStep === 'preview' && (
        <section
          data-testid="whatif-panel-preview"
          className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#0891B2] dark:text-cyan-300">
                {t('whatif.sandboxBadge')}
              </p>
              <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-100 leading-snug">
                {selectedSolution
                  ? isTh
                    ? selectedSolution.titleTh
                    : selectedSolution.title
                  : t('whatif.noSolutionSelected')}
              </h4>
            </div>
            {selectedSolution && (
              <button
                type="button"
                data-testid="whatif-toggle-3d-preview"
                onClick={() =>
                  setPreviewMcdaSolution(isPreviewingIn3d ? null : selectedSolution.id)
                }
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border cursor-pointer whitespace-nowrap shrink-0 ${
                  isPreviewingIn3d
                    ? 'bg-[#0891B2] text-white border-[#0891B2] dark:bg-cyan-500 dark:text-slate-950 dark:border-cyan-400'
                    : 'bg-white dark:bg-slate-900 border-[#CBD5E1] dark:border-slate-700 text-[#0891B2] dark:text-cyan-300 hover:border-cyan-600/40 dark:hover:border-cyan-500/40'
                }`}
              >
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isPreviewingIn3d ? t('mcda.previewingActiveBtn') : t('mcda.previewIn3dBtn')}
                </span>
              </button>
            )}
          </div>

          {!whatIfPreview ? (
            <p className="text-xs text-[#64748B] dark:text-slate-400">{t('whatif.selectFromStep2Note')}</p>
          ) : (
            <>
              {/* Constraint Gate Status Banner */}
              {!whatIfPreview.isValid ? (
                <div
                  data-testid="whatif-constraint-blocked"
                  className="rounded-lg bg-rose-50 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-500/45 p-2.5 flex items-start gap-2 text-xs text-[#DC2626] dark:text-rose-200"
                >
                  <AlertOctagon className="w-4 h-4 text-[#DC2626] dark:text-rose-400 mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[#DC2626] dark:text-rose-200">
                      {t('whatif.constraintViolationTitle')}
                    </p>
                    <p className="text-[11px] text-rose-800 dark:text-rose-200/90">
                      {isTh ? whatIfPreview.blockedReasonTh : whatIfPreview.blockedReason}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/35 px-3 py-2 flex items-center justify-between gap-2 text-xs text-[#16A34A] dark:text-emerald-200">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
                    <span>{t('whatif.sandboxValidBanner')}</span>
                  </span>
                  <span className="font-mono-tabular font-bold text-[#16A34A] dark:text-emerald-300 shrink-0">
                    {whatIfPreview.effectivenessPct > 0 ? '+' : ''}
                    {whatIfPreview.effectivenessPct.toFixed(1)}% {t('whatif.effShort')}
                  </span>
                </div>
              )}

              {/* Interactive Sandbox Parameter Overrides (Zero live mutation!) */}
              <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/65 border border-[#E2E8F0] dark:border-slate-800 p-2.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#172033] dark:text-slate-200 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
                    <span>{t('whatif.sandboxParamsTitle')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={resetWhatIfOverrides}
                    className="text-[11px] text-[#64748B] dark:text-slate-400 hover:text-[#172033] dark:hover:text-white cursor-pointer whitespace-nowrap"
                  >
                    {t('whatif.resetTweaksBtn')}
                  </button>
                </div>

                {/* Water & Flood Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>{t('whatif.paramDrainageCap')}</span>
                      <span className="font-mono-tabular text-[#0891B2] dark:text-cyan-300">
                        {overrides.drainageCapacityPctOverride ??
                          state.settings.drainageCapacityPct}
                        %
                      </span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={2}
                      value={
                        overrides.drainageCapacityPctOverride ??
                        state.settings.drainageCapacityPct
                      }
                      onChange={(e) =>
                        updateWhatIfOverrides({
                          drainageCapacityPctOverride: Number(e.target.value),
                        })
                      }
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </label>

                  <label className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>{t('whatif.paramGreenSignal')}</span>
                      <span className="font-mono-tabular text-[#0891B2] dark:text-cyan-300">
                        {overrides.greenSecondsOverride ??
                          state.trafficLightTiming.greenSeconds}
                        s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={40}
                      step={1}
                      value={
                        overrides.greenSecondsOverride ??
                        state.trafficLightTiming.greenSeconds
                      }
                      onChange={(e) =>
                        updateWhatIfOverrides({
                          greenSecondsOverride: Number(e.target.value),
                        })
                      }
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Feasible Water Discharge Target Selector */}
                <div className="space-y-1">
                  <label
                    htmlFor="whatif-water-strategy"
                    className="block text-[11px] text-slate-700 dark:text-slate-300"
                  >
                    {t('whatif.paramWaterDischarge')}
                  </label>
                  <select
                    id="whatif-water-strategy"
                    value={overrides.waterStrategyOverrideId ?? ''}
                    onChange={(e) =>
                      updateWhatIfOverrides({
                        waterStrategyOverrideId: (e.target.value ||
                          null) as typeof overrides.waterStrategyOverrideId,
                      })
                    }
                    className="w-full rounded-md bg-white dark:bg-slate-950 border border-[#CBD5E1] dark:border-slate-700/80 px-2 py-1.5 text-[11px] text-[#172033] dark:text-slate-100 focus:outline-none focus:border-[#0891B2] dark:focus:border-cyan-500"
                  >
                    <option value="">{t('whatif.useSolutionDefault')}</option>
                    <option value="none">{t('whatif.noDiversion')}</option>
                    {waterResult.strategies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {isTh ? s.targetNodeNameTh : s.targetNodeName} (
                        {Math.round(s.receivingAvailableCapacityM3).toLocaleString()} m³{' '}
                        {s.isFeasible ? '✓' : '✗'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Road Close / Reopen Toggles */}
                {state.roadIncidents.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-700 dark:text-slate-300">
                      {t('whatif.paramRoadToggles')}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {state.roadIncidents.slice(0, 4).map((inc) => {
                        const queuedReopen = overrides.reopenIncidentRoadIds.includes(
                          inc.roadId
                        );
                        const queuedClose = overrides.closeIncidentRoadIds.includes(
                          inc.roadId
                        );
                        const projectedActive = queuedReopen
                          ? false
                          : queuedClose
                            ? true
                            : inc.active;
                        return (
                          <button
                            key={inc.id}
                            type="button"
                            onClick={() => toggleSandboxRoadAction(inc.roadId, inc.active)}
                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-[11px] cursor-pointer ${
                              projectedActive
                                ? 'bg-amber-50 border-amber-300 text-[#D97706] dark:bg-amber-500/10 dark:border-amber-500/35 dark:text-amber-200'
                                : 'bg-emerald-50 border-emerald-300 text-[#16A34A] dark:bg-emerald-500/10 dark:border-emerald-500/35 dark:text-emerald-200'
                            }`}
                          >
                            <span className="truncate">{inc.roadName}</span>
                            <span className="font-mono-tabular shrink-0">
                              {projectedActive
                                ? t('whatif.roadClosedTag')
                                : t('whatif.roadOpenTag')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Projected Sandbox Before vs After Preview Grid */}
              <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] dark:border-slate-800">
                <table className="w-full text-[11px]">
                  <thead className="bg-[#F8FAFC] dark:bg-slate-900/90 text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="px-2.5 py-2 text-left font-semibold">
                        {t('whatif.metricCol')}
                      </th>
                      <th className="px-2 py-2 text-right font-semibold">
                        {t('whatif.beforeCol')}
                      </th>
                      <th className="px-2 py-2 text-right font-semibold">
                        {t('whatif.projectedCol')}
                      </th>
                      <th className="px-2 py-2 text-right font-semibold">
                        {t('whatif.deltaCol')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800/80 bg-white dark:bg-slate-950/40 font-mono-tabular">
                    {[
                      {
                        label: t('whatif.metrics.severity'),
                        b: `${whatIfPreview.before.floodSeverityScore}/100`,
                        a: `${whatIfPreview.after.floodSeverityScore}/100`,
                        delta: formatDeltaBadge(
                          whatIfPreview.before.floodSeverityScore,
                          whatIfPreview.after.floodSeverityScore,
                          0,
                          true,
                          ''
                        ),
                      },
                      {
                        label: t('whatif.metrics.affectedRoads'),
                        b: formatNumber(whatIfPreview.before.affectedRoadsCount),
                        a: formatNumber(whatIfPreview.after.affectedRoadsCount),
                        delta: formatDeltaBadge(
                          whatIfPreview.before.affectedRoadsCount,
                          whatIfPreview.after.affectedRoadsCount,
                          0,
                          true,
                          ''
                        ),
                      },
                      {
                        label: t('whatif.metrics.floodedArea'),
                        b: `${whatIfPreview.before.floodedAreaKm2.toFixed(2)} ${t('common.km2Unit')}`,
                        a: `${whatIfPreview.after.floodedAreaKm2.toFixed(2)} ${t('common.km2Unit')}`,
                        delta: formatDeltaBadge(
                          whatIfPreview.before.floodedAreaKm2,
                          whatIfPreview.after.floodedAreaKm2,
                          2,
                          true,
                          ''
                        ),
                      },
                      {
                        label: t('whatif.metrics.waterLevel'),
                        b: `${whatIfPreview.before.waterLevelMeters.toFixed(2)} ${t('common.metersUnit')}`,
                        a: `${whatIfPreview.after.waterLevelMeters.toFixed(2)} ${t('common.metersUnit')}`,
                        delta: formatDeltaBadge(
                          whatIfPreview.before.waterLevelMeters,
                          whatIfPreview.after.waterLevelMeters,
                          2,
                          true,
                          'm'
                        ),
                      },
                      {
                        label: t('whatif.metrics.reservoirUtil'),
                        b: `${whatIfPreview.before.reservoirUtilizationPct.toFixed(1)}%`,
                        a: `${whatIfPreview.after.reservoirUtilizationPct.toFixed(1)}%`,
                        delta: formatDeltaBadge(
                          whatIfPreview.before.reservoirUtilizationPct,
                          whatIfPreview.after.reservoirUtilizationPct,
                          1,
                          true,
                          '%'
                        ),
                      },
                      {
                        label: t('whatif.metrics.trafficCongestion'),
                        b: `${whatIfPreview.before.trafficCongestionPct}%`,
                        a: `${whatIfPreview.after.trafficCongestionPct}%`,
                        delta: formatDeltaBadge(
                          whatIfPreview.before.trafficCongestionPct,
                          whatIfPreview.after.trafficCongestionPct,
                          0,
                          true,
                          '%'
                        ),
                      },
                      {
                        label: t('whatif.metrics.travelTime'),
                        b:
                          whatIfPreview.before.estimatedTravelTimeMin !== null
                            ? `${whatIfPreview.before.estimatedTravelTimeMin.toFixed(1)} ${t('common.minutesShort')}`
                            : '—',
                        a:
                          whatIfPreview.after.estimatedTravelTimeMin !== null
                            ? `${whatIfPreview.after.estimatedTravelTimeMin.toFixed(1)} ${t('common.minutesShort')}`
                            : '—',
                        delta: formatDeltaBadge(
                          whatIfPreview.before.estimatedTravelTimeMin,
                          whatIfPreview.after.estimatedTravelTimeMin,
                          1,
                          true,
                          'm'
                        ),
                      },
                      {
                        label: t('whatif.metrics.powerOutages'),
                        b: `${whatIfPreview.before.powerOutageAreasCount} (${whatIfPreview.before.unservedLoadMw.toFixed(1)} MW)`,
                        a: `${whatIfPreview.after.powerOutageAreasCount} (${whatIfPreview.after.unservedLoadMw.toFixed(1)} MW)`,
                        delta: formatDeltaBadge(
                          whatIfPreview.before.powerOutageAreasCount,
                          whatIfPreview.after.powerOutageAreasCount,
                          0,
                          true,
                          ''
                        ),
                      },
                    ].map((row) => (
                      <tr key={row.label}>
                        <td className="px-2.5 py-1.5 text-slate-700 dark:text-slate-300 font-sans">
                          {row.label}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#64748B] dark:text-slate-400">{row.b}</td>
                        <td className="px-2 py-1.5 text-right text-[#172033] dark:text-slate-100">{row.a}</td>
                        <td className={`px-2 py-1.5 text-right ${row.delta.toneClass}`}>
                          {row.delta.text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setWhatIfWorkflowStep('solutions')}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-[#172033] dark:hover:text-white cursor-pointer whitespace-nowrap"
                >
                  {t('whatif.backBtn')}
                </button>
                <button
                  type="button"
                  data-testid="whatif-proceed-apply-btn"
                  disabled={!whatIfPreview.isValid}
                  onClick={() => setWhatIfWorkflowStep('apply')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#16A34A] text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 cursor-pointer whitespace-nowrap disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 disabled:cursor-not-allowed"
                >
                  <span>{t('whatif.proceedToConfirmBtn')}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* STEP 5: EXPLICIT USER CONFIRMATION & APPLY */}
      {activeStep === 'apply' && (
        <section
          data-testid="whatif-panel-apply"
          className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3"
        >
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/35 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-[#16A34A] dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {t('whatif.step5Title')}
              </h4>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">{t('whatif.step5Desc')}</p>
            </div>
          </div>

          {!whatIfPreview ? (
            <p className="text-xs text-[#64748B] dark:text-slate-400">{t('whatif.selectFromStep2Note')}</p>
          ) : (
            <>
              <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800 p-3 space-y-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#64748B] dark:text-slate-400">{t('whatif.selectedSolutionLabel')}</span>
                  <span className="font-semibold text-[#172033] dark:text-slate-100 text-right">
                    {isTh ? whatIfPreview.solution.titleTh : whatIfPreview.solution.title}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#64748B] dark:text-slate-400">{t('whatif.parametersLabel')}</span>
                  <span className="font-mono-tabular text-[#0891B2] dark:text-cyan-300 text-right">
                    {isTh
                      ? whatIfPreview.parametersSummaryTh
                      : whatIfPreview.parametersSummary}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#64748B] dark:text-slate-400">{t('whatif.modulesUpdatedLabel')}</span>
                  <span className="font-mono-tabular text-[#16A34A] dark:text-emerald-300 text-right">
                    {whatIfPreview.simulatedModulesAffected.map((m) => t(`nav.${m}`)).join(' · ')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#64748B] dark:text-slate-400">{t('whatif.projectedEffLabel')}</span>
                  <span className="font-mono-tabular font-bold text-[#16A34A] dark:text-emerald-300">
                    {whatIfPreview.effectivenessPct > 0 ? '+' : ''}
                    {whatIfPreview.effectivenessPct.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Mandatory Real-World Non-Control Disclaimer */}
              <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/35 p-2.5 flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-[#D97706] dark:text-amber-400 mt-0.5 shrink-0" />
                <span>{t('whatif.realWorldDisclaimer')}</span>
              </div>

              {!whatIfPreview.isValid && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-500/45 p-2.5 text-[11px] text-[#DC2626] dark:text-rose-200 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#DC2626] dark:text-rose-400 mt-0.5 shrink-0" />
                  <span>
                    {isTh ? whatIfPreview.blockedReasonTh : whatIfPreview.blockedReason}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setWhatIfWorkflowStep('preview')}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-[#172033] dark:hover:text-white cursor-pointer whitespace-nowrap"
                >
                  {t('whatif.backToPreviewBtn')}
                </button>
                <button
                  type="button"
                  data-testid="whatif-confirm-commit-btn"
                  disabled={!whatIfPreview.isValid}
                  onClick={commitWhatIfSolution}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#16A34A] text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 cursor-pointer whitespace-nowrap disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{t('whatif.confirmCommitBtn')}</span>
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* STEP 6: RESULTS, 9-METRIC BEFORE/AFTER DASHBOARD, SAVE & ROLLBACK */}
      {activeStep === 'results' && (
        <div data-testid="whatif-panel-results" className="space-y-3.5">
          <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#16A34A] dark:text-emerald-300">
                  {resultsComparison?.isCommitted
                    ? t('whatif.liveAppliedTag')
                    : t('whatif.previewOnlyTag')}
                </p>
                <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-100 leading-snug">
                  {resultsComparison?.solutionTitle ?? t('whatif.noAppliedYet')}
                </h4>
                {resultsComparison && (
                  <p className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
                    {resultsComparison.parametersSummary}
                  </p>
                )}
              </div>
              {resultsComparison && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-[#64748B] dark:text-slate-400">
                    {t('whatif.metrics.effectiveness')}
                  </p>
                  <p
                    data-testid="whatif-effectiveness-score"
                    className={`text-base font-mono-tabular font-bold leading-tight ${
                      resultsComparison.effectivenessPct >= 0
                        ? 'text-[#16A34A] dark:text-emerald-300'
                        : 'text-[#DC2626] dark:text-rose-400'
                    }`}
                  >
                    {resultsComparison.effectivenessPct > 0 ? '+' : ''}
                    {resultsComparison.effectivenessPct.toFixed(1)}%
                  </p>
                </div>
              )}
            </div>

            {resultsComparison && (
              <>
                {/* 9-Metric Before-and-After Comparison Table */}
                <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] dark:border-slate-800">
                  <table className="w-full text-[11px]">
                    <thead className="bg-[#F8FAFC] dark:bg-slate-900/90 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="px-2.5 py-2 text-left font-semibold">
                          {t('whatif.metricCol')}
                        </th>
                        <th className="px-2 py-2 text-right font-semibold">
                          {t('whatif.beforeCol')}
                        </th>
                        <th className="px-2 py-2 text-right font-semibold">
                          {t('whatif.afterCol')}
                        </th>
                        <th className="px-2 py-2 text-right font-semibold">
                          {t('whatif.deltaCol')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800/80 bg-white dark:bg-slate-950/40 font-mono-tabular">
                      {[
                        {
                          key: 'severity',
                          label: t('whatif.metrics.severity'),
                          b: `${resultsComparison.before.floodSeverityScore}/100 (${t(`severityStatus.${resultsComparison.before.floodSeverityLabel}`)})`,
                          a: `${resultsComparison.after.floodSeverityScore}/100 (${t(`severityStatus.${resultsComparison.after.floodSeverityLabel}`)})`,
                          delta: formatDeltaBadge(
                            resultsComparison.before.floodSeverityScore,
                            resultsComparison.after.floodSeverityScore,
                            0,
                            true,
                            ''
                          ),
                        },
                        {
                          key: 'roads',
                          label: t('whatif.metrics.affectedRoads'),
                          b: `${formatNumber(resultsComparison.before.affectedRoadsCount)} (${resultsComparison.before.affectedRoadsPct}%)`,
                          a: `${formatNumber(resultsComparison.after.affectedRoadsCount)} (${resultsComparison.after.affectedRoadsPct}%)`,
                          delta: formatDeltaBadge(
                            resultsComparison.before.affectedRoadsCount,
                            resultsComparison.after.affectedRoadsCount,
                            0,
                            true,
                            ''
                          ),
                        },
                        {
                          key: 'floodArea',
                          label: t('whatif.metrics.floodedArea'),
                          b: `${formatDecimal(resultsComparison.before.floodedAreaKm2, 2)} ${t('common.km2Unit')} (${resultsComparison.before.floodedAreaPct}%)`,
                          a: `${formatDecimal(resultsComparison.after.floodedAreaKm2, 2)} ${t('common.km2Unit')} (${resultsComparison.after.floodedAreaPct}%)`,
                          delta: formatDeltaBadge(
                            resultsComparison.before.floodedAreaKm2,
                            resultsComparison.after.floodedAreaKm2,
                            2,
                            true,
                            ''
                          ),
                        },
                        {
                          key: 'waterLevel',
                          label: t('whatif.metrics.waterLevel'),
                          b: `${formatDecimal(resultsComparison.before.waterLevelMeters, 2)} ${t('common.metersUnit')}`,
                          a: `${formatDecimal(resultsComparison.after.waterLevelMeters, 2)} ${t('common.metersUnit')}`,
                          delta: formatDeltaBadge(
                            resultsComparison.before.waterLevelMeters,
                            resultsComparison.after.waterLevelMeters,
                            2,
                            true,
                            'm'
                          ),
                        },
                        {
                          key: 'reservoirUtil',
                          label: t('whatif.metrics.reservoirUtil'),
                          b: `${resultsComparison.before.reservoirUtilizationPct.toFixed(1)}%`,
                          a: `${resultsComparison.after.reservoirUtilizationPct.toFixed(1)}%`,
                          delta: formatDeltaBadge(
                            resultsComparison.before.reservoirUtilizationPct,
                            resultsComparison.after.reservoirUtilizationPct,
                            1,
                            true,
                            '%'
                          ),
                        },
                        {
                          key: 'congestion',
                          label: t('whatif.metrics.trafficCongestion'),
                          b: `${resultsComparison.before.trafficCongestionPct}% · ${resultsComparison.before.avgNetworkSpeedKmh} km/h`,
                          a: `${resultsComparison.after.trafficCongestionPct}% · ${resultsComparison.after.avgNetworkSpeedKmh} km/h`,
                          delta: formatDeltaBadge(
                            resultsComparison.before.trafficCongestionPct,
                            resultsComparison.after.trafficCongestionPct,
                            0,
                            true,
                            '%'
                          ),
                        },
                        {
                          key: 'travelTime',
                          label: t('whatif.metrics.travelTime'),
                          b:
                            resultsComparison.before.estimatedTravelTimeMin !== null
                              ? `${resultsComparison.before.estimatedTravelTimeMin.toFixed(1)} ${t('common.minutesShort')}`
                              : '—',
                          a:
                            resultsComparison.after.estimatedTravelTimeMin !== null
                              ? `${resultsComparison.after.estimatedTravelTimeMin.toFixed(1)} ${t('common.minutesShort')}`
                              : '—',
                          delta: formatDeltaBadge(
                            resultsComparison.before.estimatedTravelTimeMin,
                            resultsComparison.after.estimatedTravelTimeMin,
                            1,
                            true,
                            'm'
                          ),
                        },
                        {
                          key: 'powerOutages',
                          label: t('whatif.metrics.powerOutages'),
                          b: `${resultsComparison.before.powerOutageAreasCount}/${resultsComparison.before.totalPowerAreasCount} (${resultsComparison.before.unservedLoadMw.toFixed(1)} MW)`,
                          a: `${resultsComparison.after.powerOutageAreasCount}/${resultsComparison.after.totalPowerAreasCount} (${resultsComparison.after.unservedLoadMw.toFixed(1)} MW)`,
                          delta: formatDeltaBadge(
                            resultsComparison.before.powerOutageAreasCount,
                            resultsComparison.after.powerOutageAreasCount,
                            0,
                            true,
                            ''
                          ),
                        },
                        {
                          key: 'effectiveness',
                          label: t('whatif.metrics.effectiveness'),
                          b: '0.0%',
                          a: `${resultsComparison.effectivenessPct > 0 ? '+' : ''}${resultsComparison.effectivenessPct.toFixed(1)}%`,
                          delta: {
                            text:
                              resultsComparison.effectivenessPct >= 0
                                ? t('whatif.improvedTag')
                                : t('whatif.degradedTag'),
                            toneClass:
                              resultsComparison.effectivenessPct >= 0
                                ? 'text-[#16A34A] dark:text-emerald-300'
                                : 'text-[#DC2626] dark:text-rose-300',
                          },
                        },
                      ].map((row) => (
                        <tr key={row.key}>
                          <td className="px-2.5 py-2 text-slate-700 dark:text-slate-300 font-sans">
                            {row.label}
                          </td>
                          <td className="px-2 py-2 text-right text-[#64748B] dark:text-slate-400">{row.b}</td>
                          <td className="px-2 py-2 text-right text-[#172033] dark:text-slate-100">{row.a}</td>
                          <td className={`px-2 py-2 text-right ${row.delta.toneClass}`}>
                            <span className="inline-flex items-center gap-0.5 justify-end">
                              {row.delta.toneClass.includes('emerald') ? (
                                <TrendingDown className="w-3 h-3 shrink-0" />
                              ) : row.delta.toneClass.includes('rose') ? (
                                <TrendingUp className="w-3 h-3 shrink-0" />
                              ) : null}
                              <span>{row.delta.text}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Visual Before vs After Recharts Comparison */}
                <div className="h-44 w-full rounded-lg bg-[#F8FAFC] dark:bg-slate-950/60 border border-[#E2E8F0] dark:border-slate-800 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={beforeAfterChartData}
                      margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#cbd5e1'} />
                      <XAxis dataKey="metric" tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? '#0b1220' : '#ffffff',
                          borderColor: isDark ? '#334155' : '#cbd5e1',
                          borderRadius: '8px',
                          fontSize: '11px',
                          color: isDark ? '#f8fafc' : '#172033',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '10px', color: isDark ? '#cbd5e1' : '#334155' }} />
                      <Bar
                        dataKey="before"
                        name={t('whatif.beforeCol')}
                        fill={isDark ? '#64748b' : '#94a3b8'}
                        radius={[3, 3, 0, 0]}
                      />
                      <Bar
                        dataKey="after"
                        name={t('whatif.afterCol')}
                        fill="#10b981"
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </section>

          {/* Step 8: Save Scenario Snapshot & Rollback Controls */}
          <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
            <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-200 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
              <span>{t('whatif.saveRollbackTitle')}</span>
            </h4>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={snapshotNameInput}
                onChange={(e) => setSnapshotNameInput(e.target.value)}
                placeholder={t('whatif.snapshotInputPlaceholder')}
                className="flex-1 min-w-0 rounded-lg bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700/80 px-2.5 py-1.5 text-xs text-[#172033] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#0891B2] dark:focus:border-cyan-500"
              />
              <button
                type="button"
                data-testid="whatif-save-snapshot-btn"
                onClick={handleSaveSnapshot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer whitespace-nowrap shrink-0"
              >
                <BookmarkPlus className="w-3.5 h-3.5 shrink-0" />
                <span>{t('whatif.saveScenarioBtn')}</span>
              </button>
            </div>

            {savedNotice && (
              <p className="text-[11px] text-[#16A34A] dark:text-emerald-300">
                {t('whatif.savedSnapshotBanner', { name: savedNotice })}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="whatif-rollback-preapply-btn"
                onClick={rollbackWhatIfBaseline}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 text-[#172033] dark:text-slate-200 hover:border-amber-500/60 hover:text-[#D97706] dark:hover:text-amber-200 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>{t('whatif.rollbackPreApplyBtn')}</span>
              </button>

              <button
                type="button"
                data-testid="whatif-reset-initial-btn"
                onClick={resetToOriginalBaseline}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-rose-500/60 hover:text-[#DC2626] dark:hover:text-rose-200 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>{t('whatif.resetInitialBtn')}</span>
              </button>
            </div>

            {/* Scenario Snapshots History List */}
            {state.scenarioHistory.length > 0 && (
              <div className="space-y-1.5 pt-1 max-h-48 overflow-y-auto">
                {[...state.scenarioHistory].reverse().map((snap) => (
                  <div
                    key={snap.id}
                    className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/65 border border-[#E2E8F0] dark:border-slate-800 px-2.5 py-2 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#172033] dark:text-slate-200 truncate">{snap.label}</p>
                      <p className="text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400 truncate">
                        T+{snap.elapsedSeconds}s · {snap.settings.floodSeverity}/100 ·{' '}
                        {snap.trafficCongestionPct}% cong
                        {snap.appliedDssSolution
                          ? ` · ${snap.appliedDssSolution.solutionId}`
                          : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreScenarioSnapshot(snap.id)}
                      className="px-2 py-1 rounded text-[11px] font-medium bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 text-[#0891B2] dark:text-cyan-300 hover:text-[#172033] dark:hover:text-white cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {t('whatif.restoreBtn')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
