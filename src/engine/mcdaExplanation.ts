import type { SupportedLanguage } from '../i18n/types';
import type { McdaGeminiExplanationResponse } from '../types/city';

export interface McdaExplanationBundleInput {
  selectedProblem?: {
    id?: string;
    domain?: string;
    title?: string;
    titleTh?: string;
    location?: string;
    locationTh?: string;
    severity?: string;
  } | null;
  criteria?: Array<{
    id: string;
    direction: string;
    normalizedWeightPct: number;
    enabled: boolean;
  }>;
  recommendedSolution?: {
    id: string;
    title: string;
    titleTh: string;
    weightedTotalScore: number;
    criterionScores: Record<string, number>;
    advantages?: string[];
    advantagesTh?: string[];
    remainingRisks?: string[];
    remainingRisksTh?: string[];
  } | null;
  feasibleCandidates?: Array<{
    id: string;
    rank: number | null;
    title: string;
    titleTh: string;
    weightedTotalScore: number;
    criterionScores: Record<string, number>;
  }>;
  infeasibleCandidates?: Array<{
    id: string;
    title: string;
    titleTh: string;
    rejectionReasons: string[];
    rejectionReasonsTh: string[];
  }>;
}

export function isStandaloneRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as { __FLOODGUARD_STANDALONE__?: boolean };
  return window.location.protocol === 'file:' || Boolean(win.__FLOODGUARD_STANDALONE__);
}

export function buildDeterministicMcdaExplanation(
  bundle: McdaExplanationBundleInput,
  language: SupportedLanguage,
  offlineReason?: string
): McdaGeminiExplanationResponse {
  const isTh = language === 'th';
  const prob = bundle.selectedProblem;
  const rec = bundle.recommendedSolution;
  const feasible = bundle.feasibleCandidates ?? [];
  const infeasible = bundle.infeasibleCandidates ?? [];
  const runnerUp = feasible.length > 1 ? feasible[1] : null;
  const activeWeights = (bundle.criteria ?? [])
    .filter((c) => c.enabled && c.normalizedWeightPct > 0)
    .sort((a, b) => b.normalizedWeightPct - a.normalizedWeightPct)
    .slice(0, 3)
    .map((c) => `${c.id} (${c.normalizedWeightPct.toFixed(0)}%)`)
    .join(', ');

  const defaultReason = isTh
    ? 'โหมดไฟล์ HTML ออฟไลน์แบบสแตนด์อโลน: กำลังแสดงคำอธิบายเชิงกำหนดจากคะแนน MCDA จริง (การเชื่อมต่อ Gemini API สดต้องใช้เซิร์ฟเวอร์และ API key)'
    : 'Standalone offline HTML mode: serving deterministic explanation grounded strictly in calculated MCDA scores (live Gemini API requires a backend server and API key).';

  if (!rec) {
    return {
      executiveExplanation: isTh
        ? 'ไม่พบทางเลือกที่ผ่านเกณฑ์ข้อจำกัดเชิงปฏิบัติการทั้งหมดภายใต้สถานการณ์ปัจจุบัน'
        : 'No candidate solution satisfied all hard operational constraints under current simulation conditions.',
      recommendedRationale: isTh
        ? 'ระบบ MCDA ระงับการแนะนำทางเลือกอัตโนมัติเนื่องจากทุกทางเลือกไม่ผ่านเงื่อนไขความจุหรือการเข้าถึง'
        : 'The deterministic MCDA constraint gate withheld a #1 recommendation because no candidate cleared all feasibility checks.',
      tradeoffComparison: isTh
        ? `ตรวจสอบพบทางเลือกไม่ผ่านเกณฑ์ ${infeasible.length} รายการ`
        : `${infeasible.length} candidate(s) were rejected by hard constraints.`,
      constraintNotes:
        infeasible
          .slice(0, 2)
          .map(
            (x) =>
              `${isTh ? x.titleTh : x.title}: ${(isTh ? x.rejectionReasonsTh : x.rejectionReasons)[0] ?? ''}`
          )
          .join(' | ') ||
        (isTh ? 'โปรดปรับเงื่อนไขเบื้องต้น' : 'Adjust upstream drainage or isolation preconditions first.'),
      aiCausalHypotheses: isTh
        ? ['ภาวะวิกฤตซ้อนทับทำให้เกณฑ์รับน้ำหรือสายทางหลักถูกปิดกั้นทั้งหมดในขณะนี้']
        : ['Compound stress may have saturated all receiving basins or blocked primary corridors simultaneously.'],
      implementationGuidance: isTh
        ? 'ให้ลดความรุนแรงต้นทางหรือแยกจุดขัดข้องก่อนคำนวณ MCDA ใหม่อีกครั้ง'
        : 'Clear blocking incidents or isolate upstream faults before re-running MCDA ranking.',
      mode: 'fallback',
      model: 'deterministic-mcda-explainer',
      fallbackReason: offlineReason ?? defaultReason,
    };
  }

  const recTitle = isTh ? rec.titleTh : rec.title;
  const runnerTitle = runnerUp ? (isTh ? runnerUp.titleTh : runnerUp.title) : '';
  const probTitle = prob
    ? isTh
      ? prob.titleTh || prob.title || 'ภาพรวมทั้งเขต'
      : prob.title || 'District Overview'
    : isTh
      ? 'ภาพรวมทั้งเขต'
      : 'District Overview';

  return {
    executiveExplanation: isTh
      ? `สำหรับปัญหา "${probTitle}" แบบจำลองถ่วงน้ำหนัก MCDA จัดอันดับ #1 ให้ "${recTitle}" ด้วยคะแนนรวม ${rec.weightedTotalScore.toFixed(1)}/100 (น้ำหนักหลัก: ${activeWeights}) ทั้งนี้ตัวเลขทั้งหมดเป็นค่าประมาณการจำลอง`
      : `For "${probTitle}", deterministic weighted MCDA ranked "${recTitle}" #1 at ${rec.weightedTotalScore.toFixed(1)}/100 (top weights: ${activeWeights}). All impact deltas remain simulated estimates.`,
    recommendedRationale: isTh
      ? `ผ่านเงื่อนไขข้อจำกัดทั้งหมดและทำคะแนนโดดเด่นด้านความปลอดภัย (${rec.criterionScores.safety?.toFixed(0) ?? 0}/100) และประสิทธิผล (${rec.criterionScores.effectiveness?.toFixed(0) ?? 0}/100)`
      : `Passed all hard constraint gates while scoring ${rec.criterionScores.safety?.toFixed(0) ?? 0}/100 on safety and ${rec.criterionScores.effectiveness?.toFixed(0) ?? 0}/100 on effectiveness.`,
    tradeoffComparison: runnerUp
      ? isTh
        ? `นำหน้าอันดับ 2 "${runnerTitle}" (${runnerUp.weightedTotalScore.toFixed(1)}/100) อยู่ ${(rec.weightedTotalScore - runnerUp.weightedTotalScore).toFixed(1)} คะแนน`
        : `Outscores #2 "${runnerTitle}" (${runnerUp.weightedTotalScore.toFixed(1)}/100) by ${(rec.weightedTotalScore - runnerUp.weightedTotalScore).toFixed(1)} weighted points.`
      : isTh
        ? 'เป็นทางเลือกที่ผ่านเกณฑ์ความเหมาะสมเพียงรายการเดียวในชุดนี้'
        : 'Only feasible option clearing all operational constraints in this evaluation.',
    constraintNotes:
      infeasible.length > 0
        ? infeasible
            .slice(0, 2)
            .map(
              (item) =>
                `${isTh ? item.titleTh : item.title} (${isTh ? 'ไม่ผ่านเกณฑ์' : 'Rejected'}: ${(isTh ? item.rejectionReasonsTh : item.rejectionReasons)[0] ?? ''})`
            )
            .join('; ')
        : isTh
          ? 'ทางเลือกทั้งหมดในชุดนี้ผ่านการตรวจสอบความจุคลอง ถนนปิดกั้น และกำลังสำรองไฟฟ้าแล้ว'
          : 'All evaluated options passed receiving capacity, blocked-road, and power isolation checks.',
    aiCausalHypotheses: isTh
      ? [
          'สมมติฐานเชิงระบบ: ปัญหาหลักอาจเกิดจากผลกระทบร่วมกันระหว่างน้ำท่วมผิวถนน การจราจรสะสม และความเสี่ยงอุปกรณ์ไฟฟ้าในโซนลุ่มต่ำ (ไม่มีข้อมูลเซนเซอร์ SCADA สด)',
        ]
      : [
          'System Hypothesis: Cross-module stress likely stems from compounding runoff accumulation, bottlenecked arterials, and flood-exposed distribution feeders (no live field SCADA telemetry).',
        ],
    implementationGuidance: isTh
      ? 'ตรวจสอบตัวอย่างผลลัพธ์บนเมือง 3 มิติทางด้านซ้ายก่อน แล้วจึงกดยืนยันการใช้แผนในขั้นตอน Confirm & Apply'
      : 'Preview projected impacts on the 3D Chatuchak viewport first, then confirm explicitly before applying to the simulation.',
    mode: 'fallback',
    model: 'deterministic-mcda-explainer',
    fallbackReason: offlineReason ?? defaultReason,
  };
}
