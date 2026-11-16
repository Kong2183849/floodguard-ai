import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Cpu,
  Crosshair,
  Droplets,
  Layers,
  MapPin,
  Route,
  Scale,
  Sparkles,
  TrafficCone,
  Waves,
  Zap,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTranslation } from '../i18n';
import type {
  DssProblemRecord,
  McdaGeminiExplanationResponse,
  ProblemDomainId,
  ProblemSeverity,
} from '../types/city';

const DOMAIN_ICONS: Record<ProblemDomainId, typeof Activity> = {
  traffic: TrafficCone,
  flood: Waves,
  water: Droplets,
  power: Zap,
  routing: Route,
  analytics: Activity,
};

const SEVERITY_BADGE_CLASSES: Record<ProblemSeverity, string> = {
  Critical: 'bg-rose-500/15 text-[#DC2626] dark:text-rose-300 border-rose-500/40',
  High: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40',
  Medium: 'bg-amber-500/15 text-[#D97706] dark:text-amber-300 border-amber-500/40',
  Low: 'bg-[#0891B2]/12 text-[#0891B2] dark:bg-cyan-500/15 dark:text-cyan-300 border-[#0891B2]/40 dark:border-cyan-500/40',
  Info: 'bg-slate-200/70 text-slate-700 border-slate-300 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600/40',
};

function formatSimTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `T+${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function DecisionSupportPanel() {
  const {
    state,
    dssBundle,
    setSection,
    setSelectedDssProblem,
    setPreviewMcdaSolution,
    openSolutionInWhatIf,
    focusScenePoint,
  } = useSimulation();
  const { t, language, formatNumber } = useTranslation();
  const isTh = language === 'th';

  const [aiExplain, setAiExplain] = useState<McdaGeminiExplanationResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const selectedProblem: DssProblemRecord | null = dssBundle.selectedProblem;

  const handleFocusProblem = (prob: DssProblemRecord) => {
    if (
      prob.targetRef?.sceneX !== undefined &&
      prob.targetRef.sceneZ !== undefined
    ) {
      focusScenePoint(
        prob.targetRef.sceneX,
        prob.targetRef.sceneZ,
        prob.targetRef.span ?? 160
      );
    }
  };

  const handleRequestAiCauseAnalysis = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/dss/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          bundle: dssBundle,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as McdaGeminiExplanationResponse;
        setAiExplain(data);
      }
    } catch {
      // Keep UI resilient even if network request fails
    } finally {
      setAiLoading(false);
    }
  };

  const workflowSteps = [
    { step: 1, key: 'dss.steps.collect', done: dssBundle.modules.some((m) => m.availability === 'available') },
    { step: 2, key: 'dss.steps.detect', done: true },
    { step: 3, key: 'dss.steps.classify', done: dssBundle.problems.length > 0 },
    { step: 4, key: 'dss.steps.rootCause', done: Boolean(selectedProblem) },
    { step: 5, key: 'dss.steps.impact', done: Boolean(selectedProblem) },
    { step: 6, key: 'dss.steps.solutions', done: dssBundle.candidates.length > 0 },
    { step: 7, key: 'dss.steps.mcda', done: dssBundle.feasibleCandidates.length > 0 },
    { step: 8, key: 'dss.steps.present', done: Boolean(dssBundle.recommendedSolution) },
  ];

  return (
    <div className="space-y-4" data-testid="module-dss">
      {/* Header Card */}
      <section className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 p-3.5 space-y-2.5 shadow-2xs dark:shadow-none">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#0891B2]/12 border border-[#0891B2]/35 dark:bg-cyan-500/15 dark:border-cyan-500/35 flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4 text-[#0891B2] dark:text-cyan-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {t('dss.title')}
              </h3>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                {t('dss.subtitle')}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono-tabular px-2 py-0.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-[#0891B2] dark:bg-slate-900 dark:border-slate-700/80 dark:text-cyan-300 shrink-0 whitespace-nowrap">
            {formatSimTime(dssBundle.collectedAtSimSeconds)}
          </span>
        </div>

        {/* 8-Step DSS Workflow Strip */}
        <div className="grid grid-cols-2 gap-1.5 pt-1" data-testid="dss-workflow-steps">
          {workflowSteps.map((ws) => (
            <div
              key={ws.step}
              data-testid={`dss-step-${ws.step}`}
              className={`rounded-lg px-2.5 py-1.5 border text-[11px] flex items-center gap-1.5 ${
                ws.done
                  ? 'bg-[#0891B2]/10 border-[#0891B2]/35 text-[#0891B2] dark:bg-cyan-500/10 dark:border-cyan-500/30 dark:text-cyan-200'
                  : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B] dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-400'
              }`}
            >
              <span className="font-mono-tabular font-semibold shrink-0">
                {ws.step}.
              </span>
              <span className="truncate font-medium">{t(ws.key)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Step 1: Connected 6-Module Data Collection Grid */}
      <section className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 p-3.5 space-y-2.5 shadow-2xs dark:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-200 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <span>{t('dss.connectedModulesTitle')}</span>
          </h4>
          <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {dssBundle.modules.filter((m) => m.availability === 'available').length}/6 {t('dss.onlineLabel')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {dssBundle.modules.map((mod) => {
            const Icon = DOMAIN_ICONS[mod.domain];
            const isUnavailable = mod.availability === 'unavailable';
            const hasProblems = mod.problemCount > 0;
            return (
              <div
                key={mod.domain}
                className={`rounded-lg p-2.5 border space-y-1 ${
                  isUnavailable
                    ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B] dark:bg-slate-900/40 dark:border-slate-800/80 dark:text-slate-400'
                    : hasProblems
                      ? 'bg-amber-50/80 border-amber-300/70 dark:bg-amber-500/5 dark:border-amber-500/30'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] dark:bg-slate-900/70 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
                    <span className="text-[11px] font-semibold text-[#172033] dark:text-slate-200 truncate">
                      {t(`nav.${mod.domain}`)}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-mono-tabular px-1.5 py-0.5 rounded border shrink-0 whitespace-nowrap ${
                      isUnavailable
                        ? 'bg-slate-200/70 border-slate-300 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                        : hasProblems
                          ? 'bg-amber-500/15 border-amber-500/40 text-[#D97706] dark:text-amber-300'
                          : 'bg-emerald-500/15 border-emerald-500/40 text-[#16A34A] dark:text-emerald-300'
                    }`}
                  >
                    {isUnavailable
                      ? t('dss.unavailableBadge')
                      : hasProblems
                        ? t('dss.problemCountBadge', { count: formatNumber(mod.problemCount) })
                        : t('dss.nominalBadge')}
                  </span>
                </div>
                <p className="text-[11px] text-[#64748B] dark:text-slate-400 leading-snug">
                  {isTh ? mod.summaryTh : mod.summary}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Step 2 & 3: Detected & Classified Problems Queue */}
      <section className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 p-3.5 space-y-2.5 shadow-2xs dark:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-200 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400 shrink-0" />
            <span>{t('dss.detectedProblemsTitle')}</span>
          </h4>
          <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {formatNumber(dssBundle.problems.length)} {t('dss.activeLabel')}
          </span>
        </div>

        {dssBundle.problems.length === 0 ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-[#16A34A] dark:bg-emerald-500/10 dark:border-emerald-500/30 p-3 text-xs dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
            <span>{t('dss.noProblemsDetected')}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {dssBundle.problems.map((prob) => {
              const Icon = DOMAIN_ICONS[prob.domain];
              const isSelected = selectedProblem?.id === prob.id;
              return (
                <button
                  key={prob.id}
                  type="button"
                  data-testid={`dss-problem-${prob.id}`}
                  onClick={() => {
                    setSelectedDssProblem(prob.id);
                    handleFocusProblem(prob);
                  }}
                  className={`w-full text-left rounded-lg p-2.5 border transition-colors cursor-pointer space-y-1.5 ${
                    isSelected
                      ? 'bg-[#0891B2]/10 border-[#0891B2]/50 dark:bg-cyan-500/10 dark:border-cyan-500/45'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#0891B2]/45 dark:bg-slate-900/70 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#172033] dark:text-slate-100 leading-snug">
                          {isTh ? prob.titleTh : prob.title}
                        </p>
                        <p className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">
                          {isTh ? prob.categoryTh : prob.category}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 whitespace-nowrap ${SEVERITY_BADGE_CLASSES[prob.severity]}`}
                    >
                      {prob.severity}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#64748B] dark:text-slate-400">
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                      <span className="truncate">{isTh ? prob.locationTh : prob.location}</span>
                    </span>
                    <span className="font-mono-tabular text-[#0891B2] dark:text-cyan-300 shrink-0">
                      {formatSimTime(prob.detectedAtSimSeconds)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Steps 4 & 5: Root Cause (Rule vs AI) + 5-Category Infrastructure Impact */}
      {selectedProblem && (
        <section className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 p-3.5 space-y-3 shadow-2xs dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-100 truncate">
              {isTh ? selectedProblem.titleTh : selectedProblem.title}
            </h4>
            <button
              type="button"
              onClick={() => handleFocusProblem(selectedProblem)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700 dark:text-cyan-300 dark:hover:border-cyan-500/50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Crosshair className="w-3 h-3" />
              <span>{t('dss.focus3dBtn')}</span>
            </button>
          </div>

          {/* Step 4: Rule-Based Root Causes vs AI Hypotheses */}
          <div className="space-y-2">
            <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-slate-900/75 dark:border-slate-800 p-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-[#0891B2] dark:text-cyan-300 uppercase tracking-wider">
                {t('dss.ruleBasedCausesTitle')}
              </p>
              <ul className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300 list-disc pl-4">
                {selectedProblem.rootCausesRuleBased.map((rc) => (
                  <li key={rc.id}>{isTh ? rc.textTh : rc.text}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-slate-900/75 dark:border-slate-800 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span>{t('dss.aiReasoningTitle')}</span>
                </p>
                <button
                  type="button"
                  onClick={handleRequestAiCauseAnalysis}
                  disabled={aiLoading}
                  className="px-2 py-1 rounded text-[10px] font-medium bg-violet-500/15 border border-violet-500/40 text-violet-700 dark:text-violet-200 hover:bg-violet-500/25 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {aiLoading ? t('dss.analyzingBtn') : t('dss.runAiReasonBtn')}
                </button>
              </div>
              {aiExplain ? (
                <div className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                  {aiExplain.aiCausalHypotheses.map((h, i) => (
                    <p key={i}>{h}</p>
                  ))}
                  <p className="text-[10px] text-[#64748B] dark:text-slate-500">
                    {aiExplain.mode === 'gemini' ? `Gemini (${aiExplain.model})` : t('dss.deterministicExplainTag')}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                  {t('dss.aiReasoningPrompt')}
                </p>
              )}
            </div>
          </div>

          {/* Step 5: 5-Category Infrastructure Impact */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-[#64748B] dark:text-slate-300 uppercase tracking-wider">
              {t('dss.impactBreakdownTitle')}
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {(
                [
                  ['roads', Route, t('dss.infra.roads'), selectedProblem.impactBreakdown.roads],
                  ['buildings', Building2, t('dss.infra.buildings'), selectedProblem.impactBreakdown.buildings],
                  ['facilities', Layers, t('dss.infra.facilities'), selectedProblem.impactBreakdown.facilities],
                  ['waterInfra', Droplets, t('dss.infra.water'), selectedProblem.impactBreakdown.waterInfra],
                  ['electricalInfra', Zap, t('dss.infra.electrical'), selectedProblem.impactBreakdown.electricalInfra],
                ] as const
              ).map(([key, Icon, label, cat]) => (
                <div
                  key={key}
                  className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-slate-900/65 dark:border-slate-800 px-2.5 py-2 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#172033] dark:text-slate-200">
                      <Icon className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
                      <span>{label}</span>
                    </div>
                    <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                      {isTh ? cat.summaryTh : cat.summary}
                    </p>
                    {cat.items.length > 0 && (
                      <p className="text-[10px] text-[#64748B] dark:text-slate-500 truncate">
                        {(isTh ? cat.itemsTh : cat.items).join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-mono-tabular font-semibold text-[#172033] dark:text-slate-200 shrink-0">
                    {formatNumber(cat.count)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Steps 6, 7 & 8: Generated Candidate Solutions -> Open MCDA Evaluation */}
      <section className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 p-3.5 space-y-2.5 shadow-2xs dark:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400 shrink-0" />
              <span>{t('dss.candidateSummaryTitle')}</span>
            </h4>
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('dss.candidateSummaryDesc', {
                feasible: formatNumber(dssBundle.feasibleCandidates.length),
                rejected: formatNumber(dssBundle.infeasibleCandidates.length),
              })}
            </p>
          </div>
          <button
            type="button"
            data-testid="dss-open-mcda-btn"
            onClick={() => setSection('mcda')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>{t('dss.evaluateInMcdaBtn')}</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        {dssBundle.recommendedSolution && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/35 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#16A34A] dark:text-emerald-300">
                {t('dss.topMcdaRecommendedLabel')}
              </span>
              <span className="text-xs font-mono-tabular font-bold text-[#16A34A] dark:text-emerald-300">
                {dssBundle.recommendedSolution.weightedTotalScore.toFixed(1)} / 100
              </span>
            </div>
            <p className="text-xs font-semibold text-[#172033] dark:text-slate-100">
              {isTh ? dssBundle.recommendedSolution.titleTh : dssBundle.recommendedSolution.title}
            </p>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  const recId = dssBundle.recommendedSolution?.id ?? null;
                  setPreviewMcdaSolution(
                    state.previewMcdaSolutionId === recId ? null : recId
                  );
                }}
                className="px-2 py-1 rounded text-[11px] font-medium bg-white border border-emerald-500/50 text-[#16A34A] hover:bg-emerald-50 dark:bg-slate-900 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/15 cursor-pointer whitespace-nowrap"
              >
                {state.previewMcdaSolutionId === dssBundle.recommendedSolution.id
                  ? t('mcda.clearPreviewBtn')
                  : t('mcda.previewIn3dBtn')}
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    openSolutionInWhatIf(dssBundle.recommendedSolution?.id ?? null, 'preview')
                  }
                  className="text-[11px] font-medium text-[#16A34A] hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200 cursor-pointer whitespace-nowrap"
                >
                  {t('whatif.openInWhatIfLink')} →
                </button>
                <button
                  type="button"
                  onClick={() => setSection('mcda')}
                  className="text-[11px] font-medium text-[#0891B2] hover:text-[#0e7490] dark:text-cyan-300 dark:hover:text-cyan-200 cursor-pointer whitespace-nowrap"
                >
                  {t('dss.inspectWeightsMatrixLink')} →
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
