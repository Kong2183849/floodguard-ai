import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  detectSimulationProblems,
  generateStructuredFallbackAnalysis,
  mergeGeminiEnrichmentsWithSnapshot,
  type AssistantSimulationSnapshot,
  type RawGeminiEnrichmentResponse,
} from './src/engine/assistantContext.ts';
import type { SupportedLanguage } from './src/i18n/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-4-hydrogen';

const SYSTEM_INSTRUCTION = `You are the FloodGuard AI Problem Analyzer for Chatuchak District (Bangkok).
Review the deterministic 6-module scan (Traffic, Flood, Water, Power, Routing, Analytics) and SIMULATION_CONTEXT.

RULES:
1. Rely ONLY on verified names, counts, depths, water volumes, storage capacities, power MW/loads, congestion levels, incidents, and deterministic A* routes in SIMULATION_CONTEXT and DETECTED_PROBLEMS. Never invent roads, buildings, stations, accidents, power outages, or independently calculate/invent routes — only explain precomputed A* routes, capacity-feasible water discharge strategies (isFeasible === true), and feasible power backup restoration paths.
2. Distinguish known/simulated conditions from AI causal hypotheses (e.g., canal back-pressure, blocked-pipe accumulation, street-level electrical exposure, or cascading feeder load). When explaining water or power, clearly state what is simulated (simplified mass-balance / simplified distribution graph without live utility SCADA), never claim real-world electrical grid accuracy, explain causes, affected areas/buildings/MW, and best feasible restoration/discharge strategies.
3. Return valid JSON matching this exact shape (keep each field to 1 short sentence <= 18 words):
{
  "executiveSummary": "2 short sentences grounded in SIMULATION_CONTEXT",
  "answerSummary": "Concise markdown answer (under 160 words) citing verified metrics, capacity checks, and data limits",
  "enrichments": [
    {
      "domain": "traffic|flood|water|power|routing|analytics",
      "targetEntityName": "Exact entity, water node/hotspot, route, or zone name from SIMULATION_CONTEXT",
      "rootCauseHypothesis": "Concise AI causal hypothesis noting missing live feeds if applicable",
      "action": "1 prioritized response action (strictly capacity-feasible for water discharge)",
      "advantages": "Key advantage",
      "disadvantages": "Tradeoff or cost",
      "risks": "Operational or simplified-model limitation risk"
    }
  ]
}
Include 1 enrichment per domain listed in DETECTED_PROBLEMS (or [] if DETECTED_PROBLEMS is empty).`;

function buildSystemInstruction(language: SupportedLanguage): string {
  const langDirective =
    language === 'th'
      ? '4. OUTPUT LANGUAGE: Respond strictly in natural, concise, professional THAI for all narrative fields ("executiveSummary", "answerSummary", "rootCauseHypothesis", "action", "advantages", "disadvantages", "risks"). Keep JSON keys, "domain" enum values (traffic|flood|water|power|routing|analytics), numeric metrics, and verified OSM/station names accurate.'
      : '4. OUTPUT LANGUAGE: Respond strictly in concise, professional ENGLISH for all narrative fields.';

  return `${SYSTEM_INSTRUCTION}\n${langDirective}`;
}

interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface AssistantRequestBody {
  question?: unknown;
  history?: unknown;
  context?: unknown;
  language?: unknown;
}

let cachedAi: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyGeminiError(
  err: unknown,
  language: SupportedLanguage
): { code: string; detail: string; retryable: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  const isTh = language === 'th';
  if (/403|PERMISSION_DENIED|API_KEY_INVALID|400/i.test(msg)) {
    return {
      code: 'AUTH_OR_CONFIG_ERROR',
      detail: isTh
        ? 'การยืนยันตัวตน Gemini API ล้มเหลว โปรดตรวจสอบค่า GEMINI_API_KEY ใน Settings > Secrets'
        : 'Gemini API authentication failed. Verify the GEMINI_API_KEY secret in Settings > Secrets.',
      retryable: false,
    };
  }
  if (/429|RESOURCE_EXHAUSTED/i.test(msg)) {
    return {
      code: 'RATE_LIMITED',
      detail: isTh
        ? 'ถึงขีดจำกัดการเรียกใช้ Gemini API (429) ระบบสลับไปใช้เครื่องมือวิเคราะห์แบบกฎเกณฑ์อัตโนมัติ'
        : 'Gemini API rate limit reached (429). Switched to rule-based Problem Analyzer.',
      retryable: true,
    };
  }
  if (/404|NOT_FOUND/i.test(msg)) {
    return {
      code: 'MODEL_NOT_FOUND',
      detail: isTh
        ? 'ไม่พบโมเดล Gemini ที่กำหนด ระบบสลับไปใช้เครื่องมือวิเคราะห์แบบกฎเกณฑ์'
        : 'Configured Gemini model was unavailable. Switched to rule-based Problem Analyzer.',
      retryable: false,
    };
  }
  return {
    code: 'UPSTREAM_UNAVAILABLE',
    detail: isTh
      ? 'บริการ Gemini ไม่พร้อมใช้งานชั่วคราว กำลังใช้เครื่องมือวิเคราะห์ตามกฎเกณฑ์แทน'
      : 'Gemini service temporarily unavailable. Using deterministic rule-based Problem Analyzer.',
    retryable: true,
  };
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const rawKey = process.env.GEMINI_API_KEY?.trim() || '';
    const hasKey = Boolean(rawKey && rawKey !== 'MY_GEMINI_API_KEY');
    res.json({
      status: 'ok',
      geminiConfigured: hasKey,
      model: MODEL_NAME,
    });
  });

  app.post('/api/assistant/query', async (req: Request, res: Response) => {
    const body = (req.body || {}) as AssistantRequestBody;
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const snapshot = body.context as AssistantSimulationSnapshot | undefined;
    const language: SupportedLanguage = body.language === 'th' ? 'th' : 'en';

    if (!question) {
      res.status(400).json({
        error: language === 'th' ? 'กรุณาระบุคำถาม' : 'Question is required.',
      });
      return;
    }
    if (!snapshot || !snapshot.scenario || !snapshot.floodConditions || !snapshot.routing) {
      res.status(400).json({
        error:
          language === 'th'
            ? 'ต้องระบุข้อมูลบริบทการจำลองที่ถูกต้อง'
            : 'Valid simulation context snapshot is required.',
      });
      return;
    }

    const history: ChatHistoryTurn[] = Array.isArray(body.history)
      ? body.history
          .filter(
            (h): h is ChatHistoryTurn =>
              Boolean(h) &&
              typeof h === 'object' &&
              ((h as ChatHistoryTurn).role === 'user' ||
                (h as ChatHistoryTurn).role === 'assistant') &&
              typeof (h as ChatHistoryTurn).text === 'string'
          )
          .slice(-6)
      : [];

    const ai = getGeminiClient();
    if (!ai) {
      const fallback = generateStructuredFallbackAnalysis(question, snapshot, language);
      res.json({
        answer: fallback.answer,
        analysis: fallback.analysis,
        mode: 'fallback',
        model: 'rule-based-fallback',
        fallbackReason:
          language === 'th'
            ? 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์ ระบบจึงให้บริการวิเคราะห์ตามกฎเกณฑ์จากข้อมูลจำลองล่าสุดแทน'
            : 'GEMINI_API_KEY is not configured in server environment; serving deterministic rule-based Problem Analyzer from live simulation state.',
      });
      return;
    }

    const historyText = history.length
      ? `\nRECENT CONVERSATION:\n${history
          .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
          .join('\n')}\n`
      : '';

    const baselineScan = detectSimulationProblems(snapshot, language);
    const compactBaseline = baselineScan.problems.map((p) => ({
      domain: p.domain,
      severity: p.severity,
      title: p.title,
      location: p.location,
      knownConditions: p.knownConditions,
      supportingData: p.supportingData,
    }));

    const compactContext = {
      scenario: {
        label: snapshot.scenario.label,
        status: snapshot.scenario.status,
        affectedAreaLabel: snapshot.scenario.affectedAreaLabel,
        emergencyMode: snapshot.scenario.emergencyMode,
      },
      floodConditions: snapshot.floodConditions,
      waterManagement: snapshot.waterManagement,
      trafficManagement: snapshot.trafficManagement,
      powerManagement: {
        ...snapshot.powerManagement,
        affectedAreas: snapshot.powerManagement.affectedAreas.slice(0, 6),
        outageLocations: snapshot.powerManagement.outageLocations.slice(0, 6),
        feasibleBackupOptions: snapshot.powerManagement.feasibleBackupOptions.slice(0, 6),
        exposedCriticalFacilities: snapshot.powerManagement.exposedCriticalFacilities.slice(0, 4),
      },
      analyticsMetrics: snapshot.analyticsMetrics,
      impactSummary: snapshot.impactSummary,
      topAffectedRoads: snapshot.topAffectedRoads.slice(0, 4).map((r) => ({
        name: r.name,
        subType: r.subType,
        riskLevel: r.riskLevel,
        depthM: r.estimatedDepthMeters,
      })),
      topAffectedFacilities: snapshot.topAffectedFacilities.slice(0, 4).map((f) => ({
        name: f.name,
        subType: f.subType,
        riskLevel: f.riskLevel,
        depthM: f.estimatedDepthMeters,
      })),
      topAffectedParks: snapshot.topAffectedParks.slice(0, 3).map((p) => ({
        name: p.name,
        riskLevel: p.riskLevel,
        depthM: p.estimatedDepthMeters,
      })),
      routing: {
        status: snapshot.routing.status,
        originLabel: snapshot.routing.originLabel,
        destinationLabel: snapshot.routing.destinationLabel,
        vehicleProfile: snapshot.routing.vehicleProfile,
        routeMode: snapshot.routing.routeMode,
        maxSafeDepthMeters: snapshot.routing.maxSafeDepthMeters,
        passableNetworkPct: snapshot.routing.passableNetworkPct,
        trafficCongestionPct: snapshot.routing.trafficCongestionPct,
        avgNetworkSpeedKmh: snapshot.routing.avgNetworkSpeedKmh,
        activeAccidentsCount: snapshot.routing.activeAccidentsCount,
        closedRoadsCount: snapshot.routing.closedRoadsCount,
        blockedEdgeCount: snapshot.routing.blockedEdgeCount,
        safeKeyCorridorsCount: snapshot.routing.safeKeyCorridorsCount,
        totalKeyCorridorsCount: snapshot.routing.totalKeyCorridorsCount,
        originalRoute: snapshot.routing.originalRoute,
        routes: snapshot.routing.routes.slice(0, 3),
        topBlockedRoads: snapshot.routing.topBlockedRoads.slice(0, 5),
      },
      selectedEntity: snapshot.selectedEntity,
    };

    const promptContents = [
      'SIMULATION_CONTEXT:',
      JSON.stringify(compactContext),
      'DETECTED_PROBLEMS:',
      JSON.stringify(compactBaseline),
      historyText,
      `OPERATOR REQUEST: ${question}`,
    ].join('\n');

    const modelSequence = [
      { model: MODEL_NAME, timeoutMs: 5500 },
      { model: 'gemini-3.1-flash-lite', timeoutMs: 12000 },
    ] as const;
    let lastError: unknown = null;

    for (const { model: candidateModel, timeoutMs } of modelSequence) {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const attemptStart = Date.now();
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`GEMINI_TIMEOUT: ${candidateModel} exceeded ${timeoutMs}ms`)),
            timeoutMs
          );
        });

        const response = await Promise.race([
          ai.models.generateContent({
            model: candidateModel,
            contents: promptContents,
            config: {
              systemInstruction: buildSystemInstruction(language),
              responseMimeType: 'application/json',
              ...(candidateModel === 'gemini-4-hydrogen'
                ? {
                    thinkingConfig: {
                      thinkingLevel: ThinkingLevel.LOW,
                    },
                  }
                : {}),
            },
          }),
          timeoutPromise,
        ]);

        const rawText = response.text?.trim();
        if (!rawText) {
          throw new Error('Empty response received from Gemini API');
        }

        const cleanedJson = rawText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const parsed = JSON.parse(cleanedJson) as RawGeminiEnrichmentResponse;
        const reconciled = mergeGeminiEnrichmentsWithSnapshot(parsed, snapshot, language);
        console.log(
          `[assistant] Gemini (${candidateModel}, ${language}) succeeded in ${Date.now() - attemptStart}ms`
        );

        res.json({
          answer: reconciled.answer,
          analysis: reconciled.analysis,
          mode: 'gemini',
          model: candidateModel,
          fallbackReason: null,
        });
        return;
      } catch (err) {
        lastError = err;
        console.warn(
          `[assistant] Gemini (${candidateModel}) failed after ${Date.now() - attemptStart}ms:`,
          err instanceof Error ? err.message : String(err)
        );
        const classified = classifyGeminiError(err, language);
        if (!classified.retryable) {
          break;
        }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    }

    const isTimeout =
      lastError instanceof Error && lastError.message.includes('GEMINI_TIMEOUT');
    const classified = classifyGeminiError(lastError, language);
    const fallback = generateStructuredFallbackAnalysis(question, snapshot, language);
    res.json({
      answer: fallback.answer,
      analysis: fallback.analysis,
      mode: 'fallback',
      model: 'rule-based-fallback',
      errorCode: isTimeout ? 'UPSTREAM_TIMEOUT' : classified.code,
        fallbackReason: isTimeout
          ? language === 'th'
            ? 'การวิเคราะห์เชิงโครงสร้างด้วย Gemini หมดเวลาเชื่อมต่อ กำลังแสดงผลจากเครื่องมือวิเคราะห์ตามกฎเกณฑ์ทันที'
            : 'Gemini structured analysis timed out; serving instant rule-based Problem Analyzer.'
          : classified.detail,
      });
    });

  interface McdaExplainRequestBody {
    bundle?: {
      selectedProblem?: {
        id?: string;
        domain?: string;
        title?: string;
        titleTh?: string;
        location?: string;
        locationTh?: string;
        severity?: string;
        rootCausesRuleBased?: Array<{ text: string; textTh: string }>;
        supportingData?: string[];
        supportingDataTh?: string[];
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
        advantages: string[];
        advantagesTh: string[];
        remainingRisks: string[];
        remainingRisksTh: string[];
      } | null;
      feasibleCandidates?: Array<{
        id: string;
        rank: number | null;
        title: string;
        titleTh: string;
        weightedTotalScore: number;
        criterionScores: Record<string, number>;
        advantages: string[];
        advantagesTh: string[];
        disadvantages: string[];
        disadvantagesTh: string[];
        remainingRisks: string[];
        remainingRisksTh: string[];
      }>;
      infeasibleCandidates?: Array<{
        id: string;
        title: string;
        titleTh: string;
        rejectionReasons: string[];
        rejectionReasonsTh: string[];
      }>;
    };
    language?: unknown;
  }

  function buildDeterministicMcdaExplanation(
    bundle: NonNullable<McdaExplainRequestBody['bundle']>,
    language: SupportedLanguage
  ) {
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
            .map((x) => `${isTh ? x.titleTh : x.title}: ${(isTh ? x.rejectionReasonsTh : x.rejectionReasons)[0] ?? ''}`)
            .join(' | ') || (isTh ? 'โปรดปรับเงื่อนไขเบื้องต้น' : 'Adjust upstream drainage or isolation preconditions first.'),
        aiCausalHypotheses: isTh
          ? ['ภาวะวิกฤตซ้อนทับทำให้เกณฑ์รับน้ำหรือสายทางหลักถูกปิดกั้นทั้งหมดในขณะนี้']
          : ['Compound stress may have saturated all receiving basins or blocked primary corridors simultaneously.'],
        implementationGuidance: isTh
          ? 'ให้ลดความรุนแรงต้นทางหรือแยกจุดขัดข้องก่อนคำนวณ MCDA ใหม่อีกครั้ง'
          : 'Clear blocking incidents or isolate upstream faults before re-running MCDA ranking.',
      };
    }

    const recTitle = isTh ? rec.titleTh : rec.title;
    const runnerTitle = runnerUp ? (isTh ? runnerUp.titleTh : runnerUp.title) : '';
    const probTitle = prob ? (isTh ? prob.titleTh : prob.title) : isTh ? 'ภาพรวมทั้งเขต' : 'District Overview';

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
            'สมมติฐาน AI: ปัญหาหลักอาจเกิดจากผลกระทบร่วมกันระหว่างน้ำท่วมผิวถนน การจราจรสะสม และความเสี่ยงอุปกรณ์ไฟฟ้าในโซนลุ่มต่ำ (ไม่มีข้อมูลเซนเซอร์ SCADA สด)',
          ]
        : [
            'AI Hypothesis: Cross-module stress likely stems from compounding runoff accumulation, bottlenecked arterials, and flood-exposed distribution feeders (no live field SCADA telemetry).',
          ],
      implementationGuidance: isTh
        ? 'ตรวจสอบตัวอย่างผลลัพธ์บนเมือง 3 มิติทางด้านซ้ายก่อน แล้วจึงกดยืนยันการใช้แผนในขั้นตอน Confirm & Apply'
        : 'Preview projected impacts on the 3D Chatuchak viewport first, then confirm explicitly before applying to the simulation.',
    };
  }

  app.post('/api/dss/explain', async (req: Request, res: Response) => {
    const body = (req.body || {}) as McdaExplainRequestBody;
    const language: SupportedLanguage = body.language === 'th' ? 'th' : 'en';
    const bundle = body.bundle;

    if (!bundle || (!bundle.feasibleCandidates && !bundle.infeasibleCandidates)) {
      res.status(400).json({
        error:
          language === 'th'
            ? 'ต้องระบุข้อมูลผลการคำนวณ DSS และ MCDA ที่ถูกต้อง'
            : 'Valid precomputed DSS and MCDA bundle is required.',
      });
      return;
    }

    const ai = getGeminiClient();
    const fallbackExplanation = buildDeterministicMcdaExplanation(bundle, language);

    if (!ai) {
      res.json({
        ...fallbackExplanation,
        mode: 'fallback',
        model: 'deterministic-mcda-explainer',
        fallbackReason:
          language === 'th'
            ? 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ระบบแสดงคำอธิบายเชิงกำหนดจากผลคะแนน MCDA จริงแทน'
            : 'GEMINI_API_KEY is not configured; serving deterministic explanation grounded strictly in calculated MCDA numbers.',
      });
      return;
    }

    const sysInstruction = [
      'You are the FloodGuard AI Decision Explanation Module for Chatuchak District.',
      'CRITICAL RULES:',
      '1. You MUST NOT invent, modify, re-weight, or override any MCDA numeric scores, ranks, constraint pass/fail status, or simulation metrics.',
      '2. Clearly explain WHY the #1 feasible solution ranked highest using the exact scores and normalized weights provided, compare trade-offs with #2, and cite exact constraint rejections for infeasible solutions.',
      '3. Clearly distinguish rule-based simulation facts from AI causal hypotheses and state that estimated deltas are simulated.',
      language === 'th'
        ? '4. Respond strictly in concise, professional THAI for all JSON string values.'
        : '4. Respond strictly in concise, professional ENGLISH for all JSON string values.',
      '5. Return valid JSON ONLY with keys: executiveExplanation, recommendedRationale, tradeoffComparison, constraintNotes, aiCausalHypotheses (array of 1-2 short strings), implementationGuidance.',
    ].join('\n');

    const promptPayload = JSON.stringify({
      selectedProblem: bundle.selectedProblem,
      normalizedCriteriaWeights: (bundle.criteria ?? []).map((c) => ({
        criterion: c.id,
        direction: c.direction,
        weightPct: c.normalizedWeightPct,
        enabled: c.enabled,
      })),
      recommendedSolution: bundle.recommendedSolution
        ? {
            title: language === 'th' ? bundle.recommendedSolution.titleTh : bundle.recommendedSolution.title,
            weightedTotalScore: bundle.recommendedSolution.weightedTotalScore,
            criterionScores: bundle.recommendedSolution.criterionScores,
          }
        : null,
      feasibleRankings: (bundle.feasibleCandidates ?? []).slice(0, 5).map((c) => ({
        rank: c.rank,
        title: language === 'th' ? c.titleTh : c.title,
        weightedTotalScore: c.weightedTotalScore,
        criterionScores: c.criterionScores,
      })),
      rejectedByConstraints: (bundle.infeasibleCandidates ?? []).slice(0, 4).map((c) => ({
        title: language === 'th' ? c.titleTh : c.title,
        reasons: language === 'th' ? c.rejectionReasonsTh : c.rejectionReasons,
      })),
    });

    const modelSequence = [
      { model: MODEL_NAME, timeoutMs: 5500 },
      { model: 'gemini-3.1-flash-lite', timeoutMs: 11000 },
    ] as const;

    let lastErr: unknown = null;
    for (const { model: candidateModel, timeoutMs } of modelSequence) {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`GEMINI_TIMEOUT: ${candidateModel} exceeded ${timeoutMs}ms`)),
            timeoutMs
          );
        });

        const response = await Promise.race([
          ai.models.generateContent({
            model: candidateModel,
            contents: `PRECOMPUTED_MCDA_RESULTS (IMMUTABLE):\n${promptPayload}`,
            config: {
              systemInstruction: sysInstruction,
              responseMimeType: 'application/json',
              ...(candidateModel === 'gemini-4-hydrogen'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          }),
          timeoutPromise,
        ]);

        const rawText = response.text?.trim();
        if (!rawText) throw new Error('Empty response from Gemini');
        const cleaned = rawText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const parsed = JSON.parse(cleaned) as Partial<typeof fallbackExplanation>;

        res.json({
          executiveExplanation:
            typeof parsed.executiveExplanation === 'string' && parsed.executiveExplanation.trim()
              ? parsed.executiveExplanation.trim()
              : fallbackExplanation.executiveExplanation,
          recommendedRationale:
            typeof parsed.recommendedRationale === 'string' && parsed.recommendedRationale.trim()
              ? parsed.recommendedRationale.trim()
              : fallbackExplanation.recommendedRationale,
          tradeoffComparison:
            typeof parsed.tradeoffComparison === 'string' && parsed.tradeoffComparison.trim()
              ? parsed.tradeoffComparison.trim()
              : fallbackExplanation.tradeoffComparison,
          constraintNotes:
            typeof parsed.constraintNotes === 'string' && parsed.constraintNotes.trim()
              ? parsed.constraintNotes.trim()
              : fallbackExplanation.constraintNotes,
          aiCausalHypotheses:
            Array.isArray(parsed.aiCausalHypotheses) && parsed.aiCausalHypotheses.length > 0
              ? parsed.aiCausalHypotheses.filter((x): x is string => typeof x === 'string').slice(0, 3)
              : fallbackExplanation.aiCausalHypotheses,
          implementationGuidance:
            typeof parsed.implementationGuidance === 'string' && parsed.implementationGuidance.trim()
              ? parsed.implementationGuidance.trim()
              : fallbackExplanation.implementationGuidance,
          mode: 'gemini',
          model: candidateModel,
          fallbackReason: null,
        });
        return;
      } catch (err) {
        lastErr = err;
        const classified = classifyGeminiError(err, language);
        if (!classified.retryable) break;
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    }

    const classified = classifyGeminiError(lastErr, language);
    res.json({
      ...fallbackExplanation,
      mode: 'fallback',
      model: 'deterministic-mcda-explainer',
      fallbackReason: classified.detail,
    });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FloodGuard AI server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start FloodGuard AI server:', err);
  process.exit(1);
});
