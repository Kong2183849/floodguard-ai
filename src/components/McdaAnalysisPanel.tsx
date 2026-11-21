import { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  History,
  Info,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
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
import {
  buildDeterministicMcdaExplanation,
  isStandaloneRuntime,
} from '../engine/mcdaExplanation';
import { useTranslation } from '../i18n';
import type {
  McdaCandidateSolution,
  McdaCriterionId,
  McdaGeminiExplanationResponse,
  McdaWeightPresetId,
} from '../types/city';

const WEIGHT_PRESETS: McdaWeightPresetId[] = [
  'balanced',
  'safety_first',
  'rapid_response',
  'low_disruption',
];

const COMPARE_COLORS = ['#22d3ee', '#10b981', '#f59e0b', '#a78bfa'];

export function McdaAnalysisPanel() {
  const {
    state,
    dssBundle,
    setSection,
    setSelectedDssProblem,
    setPreviewMcdaSolution,
    toggleCompareMcdaSolution,
    setMcdaCriterionWeight,
    toggleMcdaCriterionEnabled,
    applyMcdaWeightPreset,
    confirmAndApplyMcdaSolution,
    restoreScenarioSnapshot,
    openSolutionInWhatIf,
  } = useSimulation();
  const { t, language, formatNumber } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isTh = language === 'th';

  const [showMethodology, setShowMethodology] = useState(false);
  const [confirmingApplyId, setConfirmingApplyId] = useState<string | null>(null);
  const [justAppliedTitle, setJustAppliedTitle] = useState<string | null>(null);
  const [aiExplain, setAiExplain] = useState<McdaGeminiExplanationResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const previewSolution: McdaCandidateSolution | null = useMemo(
    () =>
      state.previewMcdaSolutionId
        ? dssBundle.candidates.find((c) => c.id === state.previewMcdaSolutionId) ?? null
        : null,
    [state.previewMcdaSolutionId, dssBundle.candidates]
  );

  // Reset confirmation dialog if user changes previewed solution or problem
  useEffect(() => {
    setConfirmingApplyId(null);
  }, [state.previewMcdaSolutionId, state.selectedDssProblemId]);

  // Comparison set: use user-selected compared IDs if >= 2 match current problem, else top 2 candidates
  const comparedSolutions = useMemo(() => {
    const matched = dssBundle.candidates.filter((c) =>
      state.comparedMcdaSolutionIds.includes(c.id)
    );
    if (matched.length >= 2) return matched.slice(0, 4);
    return dssBundle.candidates.slice(0, Math.min(3, dssBundle.candidates.length));
  }, [dssBundle.candidates, state.comparedMcdaSolutionIds]);

  const comparisonChartData = useMemo(() => {
    return dssBundle.criteria
      .filter((c) => c.enabled)
      .map((c) => {
        const row: Record<string, string | number> = {
          criterion: t(`mcda.criteria.${c.id}.short`),
        };
        comparedSolutions.forEach((sol, idx) => {
          row[`sol_${idx}`] = Number(sol.criterionScores[c.id].toFixed(1));
        });
        return row;
      });
  }, [dssBundle.criteria, comparedSolutions, t]);

  const handleExplainWithGemini = async () => {
    setAiLoading(true);
    const explainBundle = {
      selectedProblem: dssBundle.selectedProblem,
      criteria: dssBundle.criteria,
      recommendedSolution: dssBundle.recommendedSolution,
      feasibleCandidates: dssBundle.feasibleCandidates,
      infeasibleCandidates: dssBundle.infeasibleCandidates,
    };
    if (isStandaloneRuntime()) {
      setAiExplain(buildDeterministicMcdaExplanation(explainBundle, language));
      setAiLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/dss/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          bundle: explainBundle,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as McdaGeminiExplanationResponse;
        setAiExplain(data);
      } else {
        setAiExplain(buildDeterministicMcdaExplanation(explainBundle, language));
      }
    } catch {
      setAiExplain(buildDeterministicMcdaExplanation(explainBundle, language));
    } finally {
      setAiLoading(false);
    }
  };

  const handleConfirmExecute = (sol: McdaCandidateSolution) => {
    confirmAndApplyMcdaSolution(sol.id);
    setConfirmingApplyId(null);
    setJustAppliedTitle(isTh ? sol.titleTh : sol.title);
  };

  const latestPreMcdaSnapshot = useMemo(
    () =>
      [...state.scenarioHistory]
        .reverse()
        .find((s) => s.label.startsWith('Before MCDA:')),
    [state.scenarioHistory]
  );

  return (
    <div className="space-y-4" data-testid="module-mcda">
      {/* Header & Target Problem Scope */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/35 flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4 text-[#16A34A] dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {t('mcda.title')}
              </h3>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                {t('mcda.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSection('dss')}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-[#172033] dark:hover:text-white cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3 h-3 shrink-0" />
            <span>{t('mcda.backToDssBtn')}</span>
          </button>
        </div>

        {/* Target Problem Dropdown */}
        {dssBundle.problems.length > 0 && (
          <div className="space-y-1">
            <label
              htmlFor="mcda-problem-select"
              className="block text-[10px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400"
            >
              {t('mcda.targetProblemLabel')}
            </label>
            <select
              id="mcda-problem-select"
              value={dssBundle.selectedProblem?.id ?? ''}
              onChange={(e) => setSelectedDssProblem(e.target.value || null)}
              className="w-full rounded-lg bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700/80 px-2.5 py-1.5 text-xs text-[#172033] dark:text-slate-100 focus:outline-none focus:border-[#0891B2] dark:focus:border-cyan-500"
            >
              {dssBundle.problems.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.severity}] {isTh ? p.titleTh : p.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Applied Notification + Undo Shortcut */}
        {justAppliedTitle && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/40 px-3 py-2 flex items-center justify-between gap-2 text-xs text-[#16A34A] dark:text-emerald-200">
            <div className="flex items-center gap-1.5 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
              <span className="truncate">
                {t('mcda.appliedBanner', { title: justAppliedTitle })}
              </span>
            </div>
            {latestPreMcdaSnapshot && (
              <button
                type="button"
                onClick={() => {
                  restoreScenarioSnapshot(latestPreMcdaSnapshot.id);
                  setJustAppliedTitle(null);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 text-[#172033] dark:text-slate-200 hover:text-[#0891B2] dark:hover:text-white cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3 h-3 shrink-0" />
                <span>{t('mcda.revertBtn')}</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* Pre-Confirmation 3D Preview & Explicit User Confirmation Bar */}
      {previewSolution && (
        <section
          data-testid="mcda-preview-confirmation-bar"
          className={`rounded-xl p-3.5 border space-y-2.5 ${
            previewSolution.isFeasible
              ? 'bg-cyan-50 border-cyan-300 dark:bg-cyan-500/10 dark:border-cyan-500/45'
              : 'bg-rose-50 border-rose-300 dark:bg-rose-500/10 dark:border-rose-500/45'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#0891B2] dark:text-cyan-300 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>{t('mcda.previewActiveTag')}</span>
              </p>
              <p className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {isTh ? previewSolution.titleTh : previewSolution.title}
              </p>
              <p className="text-[11px] text-slate-700 dark:text-slate-300">
                {t('mcda.previewNotAppliedNote')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewMcdaSolution(null)}
              className="px-2 py-1 rounded text-[11px] font-medium bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-[#172033] dark:hover:text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              {t('mcda.clearPreviewBtn')}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(isTh
              ? previewSolution.predictedDeltasTh
              : previewSolution.predictedDeltas
            ).map((delta, i) => (
              <span
                key={i}
                className="text-[10px] font-mono-tabular px-2 py-0.5 rounded bg-white dark:bg-slate-900/90 border border-[#CBD5E1] dark:border-slate-700 text-[#172033] dark:text-slate-200"
              >
                {delta}
              </span>
            ))}
          </div>

          {previewSolution.isFeasible ? (
            confirmingApplyId === previewSolution.id ? (
              <div className="rounded-lg bg-white dark:bg-slate-950/90 border border-emerald-400 dark:border-emerald-500/50 p-2.5 space-y-2">
                <p className="text-[11px] text-[#16A34A] dark:text-emerald-200">
                  {t('mcda.confirmApplyPrompt')}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="mcda-confirm-apply-btn"
                    onClick={() => handleConfirmExecute(previewSolution)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#16A34A] text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 cursor-pointer whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('mcda.confirmAndApplyBtn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingApplyId(null)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#F1F5F9] dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-[#172033] dark:hover:text-white cursor-pointer whitespace-nowrap"
                  >
                    {t('mcda.cancelBtn')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                data-testid="mcda-prepare-apply-btn"
                onClick={() => setConfirmingApplyId(previewSolution.id)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#16A34A] text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 cursor-pointer whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{t('mcda.applyWithConfirmationBtn')}</span>
              </button>
            )
          ) : (
            <div className="rounded-lg bg-rose-100 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-500/40 px-2.5 py-2 text-[11px] text-[#DC2626] dark:text-rose-200 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-[#DC2626] dark:text-rose-400 shrink-0" />
              <span>{t('mcda.cannotApplyInfeasible')}</span>
            </div>
          )}
        </section>
      )}

      {/* Configurable Criteria & Weights */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-200 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <span>{t('mcda.weightsConfigTitle')}</span>
          </h4>
          <span
            data-testid="mcda-normalized-sum"
            className="text-[11px] font-mono-tabular px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/35 text-[#16A34A] dark:text-emerald-300 shrink-0 whitespace-nowrap"
          >
            Σ = {dssBundle.normalizedWeightsSumPct.toFixed(1)}%
          </span>
        </div>

        {/* Weight Profile Presets */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {WEIGHT_PRESETS.map((preset) => {
            const active = state.mcdaWeightPresetId === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => applyMcdaWeightPreset(preset)}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap truncate ${
                  active
                    ? 'bg-cyan-50 border-cyan-600/45 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-300'
                    : 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-700 hover:border-slate-300 dark:bg-slate-900/75 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {t(`mcda.presets.${preset}`)}
              </button>
            );
          })}
        </div>

        {/* Individual Criteria Sliders */}
        <div className="space-y-2">
          {dssBundle.criteria.map((c) => (
            <div
              key={c.id}
              className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/65 border border-[#E2E8F0] dark:border-slate-800/80 px-2.5 py-2 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-[#172033] dark:text-slate-200 cursor-pointer min-w-0">
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={() => toggleMcdaCriterionEnabled(c.id)}
                    className="accent-cyan-500 rounded cursor-pointer shrink-0"
                  />
                  <span className="truncate">{t(`mcda.criteria.${c.id}.label`)}</span>
                </label>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      c.direction === 'benefit'
                        ? 'bg-emerald-50 border-emerald-300 text-[#16A34A] dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300'
                        : 'bg-amber-50 border-amber-300 text-[#D97706] dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300'
                    }`}
                  >
                    {t(`mcda.direction.${c.direction}`)}
                  </span>
                  <span className="text-xs font-mono-tabular font-semibold text-[#0891B2] dark:text-cyan-300 w-12 text-right">
                    {c.normalizedWeightPct.toFixed(1)}%
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                disabled={!c.enabled}
                value={c.rawWeight}
                aria-label={t(`mcda.criteria.${c.id}.label`)}
                onChange={(e) =>
                  setMcdaCriterionWeight(c.id, Number(e.target.value))
                }
                className="w-full accent-cyan-500 cursor-pointer disabled:opacity-40"
              />
            </div>
          ))}
        </div>

        {/* Collapsible Methodology Explainer */}
        <button
          type="button"
          onClick={() => setShowMethodology((prev) => !prev)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-900/70 border border-[#E2E8F0] dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 hover:text-[#172033] dark:hover:text-white cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <span>{t('mcda.methodologyTitle')}</span>
          </span>
          {showMethodology ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          )}
        </button>

        {showMethodology && (
          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-950/75 border border-[#E2E8F0] dark:border-slate-800 p-2.5 text-[11px] text-slate-700 dark:text-slate-300 space-y-1.5 leading-relaxed">
            <p>{t('mcda.methodologyStep1')}</p>
            <p>{t('mcda.methodologyStep2')}</p>
            <p className="font-mono-tabular text-[10px] text-[#0891B2] dark:text-cyan-300">
              Score(a) = Σ [ w_norm(i) × s_norm(a, i) ], Σ w_norm(i) = 100%
            </p>
            <p className="text-[10px] text-[#D97706] dark:text-amber-300/90">
              {t('mcda.simulatedDisclaimer')}
            </p>
          </div>
        )}
      </section>

      {/* Recommended & Feasible Ranked Solutions */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-200 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400 shrink-0" />
            <span>{t('mcda.rankedSolutionsTitle')}</span>
          </h4>
          <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {formatNumber(dssBundle.feasibleCandidates.length)} {t('mcda.feasibleLabel')} ·{' '}
            {formatNumber(dssBundle.infeasibleCandidates.length)} {t('mcda.rejectedLabel')}
          </span>
        </div>

        {dssBundle.feasibleCandidates.length === 0 ? (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/40 p-3 text-xs text-[#DC2626] dark:text-rose-200">
            {t('mcda.noFeasibleSolutions')}
          </div>
        ) : (
          <div className="space-y-2.5">
            {dssBundle.feasibleCandidates.map((sol) => {
              const isPreviewing = state.previewMcdaSolutionId === sol.id;
              const isCompared = state.comparedMcdaSolutionIds.includes(sol.id);
              return (
                <div
                  key={sol.id}
                  data-testid={`mcda-candidate-${sol.id}`}
                  className={`rounded-xl p-3 border space-y-2.5 transition-colors ${
                    isPreviewing
                      ? 'bg-cyan-50 border-cyan-500/60 dark:bg-cyan-500/10 dark:border-cyan-500/50'
                      : sol.isRecommended
                        ? 'bg-emerald-50/70 border-emerald-400/60 dark:bg-emerald-500/5 dark:border-emerald-500/35'
                        : 'bg-[#F8FAFC] border-[#E2E8F0] dark:bg-slate-900/75 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono-tabular font-bold px-1.5 py-0.5 rounded bg-slate-200 text-[#172033] dark:bg-slate-800 dark:text-slate-200">
                          #{sol.rank}
                        </span>
                        {sol.isRecommended && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-[#16A34A] dark:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300">
                            {t('mcda.recommendedBadge')}
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 text-[#64748B] dark:bg-slate-800/80 dark:text-slate-400">
                          {t('mcda.estimatedTag')}
                        </span>
                      </div>
                      <h5 className="text-xs font-semibold text-[#172033] dark:text-slate-100 leading-snug pt-0.5">
                        {isTh ? sol.titleTh : sol.title}
                      </h5>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-mono-tabular font-bold text-[#16A34A] dark:text-emerald-300 leading-none">
                        {sol.weightedTotalScore.toFixed(1)}
                      </p>
                      <p className="text-[10px] text-[#64748B] dark:text-slate-400">/ 100</p>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                    {isTh ? sol.summaryTh : sol.summary}
                  </p>

                  {/* Compact Criterion Score Mini-Bars */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {dssBundle.criteria
                      .filter((c) => c.enabled)
                      .map((c) => {
                        const val = sol.criterionScores[c.id as McdaCriterionId];
                        return (
                          <div
                            key={c.id}
                            className="rounded bg-white dark:bg-slate-950/60 border border-[#E2E8F0] dark:border-slate-800/80 px-2 py-1 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-1 text-[10px]">
                              <span className="text-[#64748B] dark:text-slate-400 truncate">
                                {t(`mcda.criteria.${c.id}.short`)}
                              </span>
                              <span className="font-mono-tabular text-[#172033] dark:text-slate-200">
                                {val.toFixed(0)}
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-[#0891B2] dark:bg-cyan-400"
                                style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Pros / Cons / Remaining Risks */}
                  <div className="grid grid-cols-1 gap-1 text-[11px] bg-white dark:bg-slate-950/50 rounded-lg p-2 border border-[#E2E8F0] dark:border-slate-800/70">
                    <p className="text-[#16A34A] dark:text-emerald-300">
                      <span className="font-semibold">{t('mcda.prosLabel')}: </span>
                      {(isTh ? sol.advantagesTh : sol.advantages).join(' · ')}
                    </p>
                    <p className="text-[#D97706] dark:text-amber-300">
                      <span className="font-semibold">{t('mcda.consLabel')}: </span>
                      {(isTh ? sol.disadvantagesTh : sol.disadvantages).join(' · ')}
                    </p>
                    <p className="text-[#64748B] dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {t('mcda.remainingRiskLabel')}:{' '}
                      </span>
                      {(isTh ? sol.remainingRisksTh : sol.remainingRisks).join(' · ')}
                    </p>
                  </div>

                  {/* Actions: Preview in 3D (No Auto-Apply!) + Add to Compare */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid={`mcda-preview-btn-${sol.id}`}
                        onClick={() =>
                          setPreviewMcdaSolution(isPreviewing ? null : sol.id)
                        }
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                          isPreviewing
                            ? 'bg-[#0891B2] text-white border-[#0891B2] dark:bg-cyan-500 dark:text-slate-950 dark:border-cyan-400'
                            : 'bg-white border-[#CBD5E1] text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-800 dark:border-slate-700 dark:text-cyan-300 dark:hover:border-cyan-500/50'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isPreviewing
                            ? t('mcda.previewingActiveBtn')
                            : t('mcda.previewIn3dBtn')}
                        </span>
                      </button>

                      <button
                        type="button"
                        data-testid={`mcda-open-whatif-${sol.id}`}
                        onClick={() => openSolutionInWhatIf(sol.id, 'preview')}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 text-[#16A34A] dark:text-emerald-300 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 cursor-pointer whitespace-nowrap"
                      >
                        {t('whatif.openInWhatIfLink')} →
                      </button>
                    </div>

                    <label className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={isCompared}
                        onChange={() => toggleCompareMcdaSolution(sol.id)}
                        className="accent-cyan-500 rounded cursor-pointer"
                      />
                      <span>{t('mcda.compareToggle')}</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Hard Constraint Gate — Rejected / Infeasible Alternatives */}
      {dssBundle.infeasibleCandidates.length > 0 && (
        <section
          data-testid="mcda-infeasible-section"
          className="rounded-xl bg-white dark:bg-[#0b1220] border border-rose-300 dark:border-rose-500/35 shadow-2xs dark:shadow-none p-3.5 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-[#DC2626] dark:text-rose-300 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-[#DC2626] dark:text-rose-400 shrink-0" />
              <span>{t('mcda.rejectedByConstraintsTitle')}</span>
            </h4>
            <span className="text-[11px] font-mono-tabular text-[#DC2626] dark:text-rose-300">
              {formatNumber(dssBundle.infeasibleCandidates.length)}
            </span>
          </div>

          <div className="space-y-2">
            {dssBundle.infeasibleCandidates.map((sol) => {
              const isPreviewing = state.previewMcdaSolutionId === sol.id;
              return (
                <div
                  key={sol.id}
                  data-testid={`mcda-rejected-${sol.id}`}
                  className="rounded-lg bg-rose-50 dark:bg-rose-950/25 border border-rose-300 dark:border-rose-500/30 p-2.5 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <XCircle className="w-3.5 h-3.5 text-[#DC2626] dark:text-rose-400 mt-0.5 shrink-0" />
                      <p className="text-xs font-semibold text-rose-900 dark:text-rose-100 leading-snug">
                        {isTh ? sol.titleTh : sol.title}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-[#DC2626] dark:bg-rose-500/20 dark:border-rose-500/40 dark:text-rose-300 shrink-0 whitespace-nowrap">
                      {t('mcda.infeasibleBadge')}
                    </span>
                  </div>
                  <ul className="text-[11px] text-rose-800 dark:text-rose-200/90 space-y-0.5 pl-5 list-disc">
                    {(isTh ? sol.rejectionReasonsTh : sol.rejectionReasons).map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setPreviewMcdaSolution(isPreviewing ? null : sol.id)}
                    className="text-[11px] font-medium text-[#DC2626] hover:text-rose-800 dark:text-rose-300 dark:hover:text-rose-200 cursor-pointer"
                  >
                    {isPreviewing
                      ? t('mcda.clearPreviewBtn')
                      : t('mcda.previewViolationIn3dBtn')}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Interactive Side-by-Side Comparison Matrix + Score Chart */}
      {comparedSolutions.length >= 2 && (
        <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-200">
              {t('mcda.comparisonMatrixTitle')}
            </h4>
            <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
              {comparedSolutions.length} {t('mcda.optionsSelectedLabel')}
            </span>
          </div>

          {/* Grouped Bar Chart comparing Criterion Scores */}
          <div className="h-52 w-full rounded-lg bg-[#F8FAFC] dark:bg-slate-950/60 border border-[#E2E8F0] dark:border-slate-800/80 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={comparisonChartData}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#cbd5e1'} />
                <XAxis
                  dataKey="criterion"
                  tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 10 }}
                />
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
                {comparedSolutions.map((sol, idx) => (
                  <Bar
                    key={sol.id}
                    dataKey={`sol_${idx}`}
                    name={`#${sol.rank ?? 'X'} ${
                      (isTh ? sol.titleTh : sol.title).slice(0, 18)
                    }…`}
                    fill={COMPARE_COLORS[idx % COMPARE_COLORS.length]}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] dark:border-slate-800">
            <table className="w-full text-[11px] text-left">
              <thead className="bg-[#F8FAFC] dark:bg-slate-900/90 text-slate-700 dark:text-slate-300">
                <tr>
                  <th className="px-2.5 py-2 font-semibold">{t('mcda.criterionCol')}</th>
                  {comparedSolutions.map((sol) => (
                    <th key={sol.id} className="px-2.5 py-2 font-semibold text-right">
                      #{sol.rank ?? '—'} ({sol.weightedTotalScore.toFixed(1)})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800/80 bg-white dark:bg-slate-950/40">
                {dssBundle.criteria
                  .filter((c) => c.enabled)
                  .map((c) => (
                    <tr key={c.id}>
                      <td className="px-2.5 py-1.5 text-slate-700 dark:text-slate-300">
                        {t(`mcda.criteria.${c.id}.short`)} ({c.normalizedWeightPct.toFixed(0)}%)
                      </td>
                      {comparedSolutions.map((sol) => (
                        <td
                          key={sol.id}
                          className="px-2.5 py-1.5 text-right font-mono-tabular text-[#172033] dark:text-slate-200"
                        >
                          {sol.criterionScores[c.id].toFixed(0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                <tr className="bg-[#F8FAFC] dark:bg-slate-900/60 font-semibold">
                  <td className="px-2.5 py-1.5 text-[#16A34A] dark:text-emerald-300">
                    {t('mcda.totalWeightedCol')}
                  </td>
                  {comparedSolutions.map((sol) => (
                    <td
                      key={sol.id}
                      className="px-2.5 py-1.5 text-right font-mono-tabular text-[#16A34A] dark:text-emerald-300"
                    >
                      {sol.weightedTotalScore.toFixed(1)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Gemini AI Explanation Panel (Strictly Non-Scoring!) */}
      <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
              <span>{t('mcda.aiExplanationTitle')}</span>
            </h4>
            <p className="text-[10px] text-[#64748B] dark:text-slate-400">
              {t('mcda.aiNonScoringNotice')}
            </p>
          </div>
          <button
            type="button"
            data-testid="mcda-explain-ai-btn"
            onClick={handleExplainWithGemini}
            disabled={aiLoading}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-violet-50 border border-violet-300 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/20 dark:border-violet-500/45 dark:text-violet-200 dark:hover:bg-violet-500/30 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {aiLoading ? t('mcda.explainingBtn') : t('mcda.explainBtn')}
          </button>
        </div>

        {aiExplain && (
          <div className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/75 border border-[#E2E8F0] dark:border-slate-800 p-3 space-y-2 text-[11px] text-slate-700 dark:text-slate-200 leading-relaxed">
            <p className="font-medium text-[#172033] dark:text-slate-100">{aiExplain.executiveExplanation}</p>
            <p>
              <span className="font-semibold text-[#16A34A] dark:text-emerald-300">
                {t('mcda.rationaleLabel')}:{' '}
              </span>
              {aiExplain.recommendedRationale}
            </p>
            <p>
              <span className="font-semibold text-[#0891B2] dark:text-cyan-300">
                {t('mcda.tradeoffsLabel')}:{' '}
              </span>
              {aiExplain.tradeoffComparison}
            </p>
            <p>
              <span className="font-semibold text-[#DC2626] dark:text-rose-300">
                {t('mcda.constraintsNoteLabel')}:{' '}
              </span>
              {aiExplain.constraintNotes}
            </p>
            <p className="text-slate-700 dark:text-slate-300">{aiExplain.implementationGuidance}</p>
            <p className="text-[10px] text-[#64748B] dark:text-slate-500">
              {aiExplain.mode === 'gemini'
                ? `Gemini (${aiExplain.model})`
                : aiExplain.fallbackReason || t('dss.deterministicExplainTag')}
            </p>
          </div>
        )}
      </section>

      {/* Evaluation Audit Trail */}
      {state.mcdaAuditHistory.length > 0 && (
        <section className="rounded-xl bg-white dark:bg-[#0b1220] border border-[#E2E8F0] dark:border-slate-800/90 shadow-2xs dark:shadow-none p-3.5 space-y-2">
          <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-200 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-[#64748B] dark:text-slate-400 shrink-0" />
            <span>{t('mcda.auditTrailTitle')}</span>
          </h4>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {state.mcdaAuditHistory.slice(0, 6).map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg bg-[#F8FAFC] dark:bg-slate-900/65 border border-[#E2E8F0] dark:border-slate-800 px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[#172033] dark:text-slate-200 truncate">
                    {isTh ? entry.appliedTitleTh || entry.recommendedTitleTh : entry.appliedTitle || entry.recommendedTitle}
                  </p>
                  <p className="text-[10px] text-[#64748B] dark:text-slate-400 truncate">
                    {isTh ? entry.problemTitleTh : entry.problemTitle}
                  </p>
                </div>
                <span className="text-[10px] font-mono-tabular text-[#16A34A] dark:text-emerald-300 shrink-0 whitespace-nowrap">
                  T+{entry.simElapsedSeconds}s · {entry.recommendedScore?.toFixed(1) ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
