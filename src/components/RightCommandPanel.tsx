import { useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bot,
  BrainCircuit,
  Cpu,
  Droplets,
  FlaskConical,
  LayoutDashboard,
  LayoutGrid,
  Route,
  Scale,
  Sliders,
  TrafficCone,
  Waves,
  Zap,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTranslation } from '../i18n';
import {
  localizeAffectedAreaLabel,
  localizeScenarioInfo,
} from '../i18n/domainLabels';
import type { NavSection } from '../types/city';
import { FloatingNavPopup, type FloatingNavModuleItem } from './FloatingNavPopup';
import { SelectedFeatureInspector } from './SelectedFeatureInspector';
import { WorkspaceViews } from './WorkspaceViews';

interface ModuleTabMeta {
  id: NavSection;
  labelKey: string;
  icon: typeof LayoutDashboard;
}

const COMMAND_MODULE_TABS: ModuleTabMeta[] = [
  { id: 'overview', labelKey: 'nav.overview', icon: LayoutDashboard },
  { id: 'simulation', labelKey: 'nav.simulation', icon: Sliders },
  { id: 'flood', labelKey: 'nav.flood', icon: Waves },
  { id: 'water', labelKey: 'nav.water', icon: Droplets },
  { id: 'power', labelKey: 'nav.power', icon: Zap },
  { id: 'traffic', labelKey: 'nav.traffic', icon: TrafficCone },
  { id: 'routing', labelKey: 'nav.routing', icon: Route },
  { id: 'analytics', labelKey: 'nav.analytics', icon: BarChart3 },
];

const AI_ANALYSIS_TABS: ModuleTabMeta[] = [
  { id: 'dss', labelKey: 'nav.dss', icon: Cpu },
  { id: 'mcda', labelKey: 'nav.mcda', icon: Scale },
  { id: 'whatif', labelKey: 'nav.whatif', icon: FlaskConical },
  { id: 'assistant', labelKey: 'nav.assistant', icon: Bot },
];

const ALL_MODULE_TABS: ModuleTabMeta[] = [...COMMAND_MODULE_TABS, ...AI_ANALYSIS_TABS];

export function RightCommandPanel() {
  const { state, activeArea, setSection } = useSimulation();
  const { t, language, formatNumber } = useTranslation();
  const { activeSection, settings } = state;

  const [commandPopupOpen, setCommandPopupOpen] = useState(false);
  const [aiPopupOpen, setAiPopupOpen] = useState(false);

  const commandTriggerRef = useRef<HTMLButtonElement | null>(null);
  const aiTriggerRef = useRef<HTMLButtonElement | null>(null);

  const activeScenario = localizeScenarioInfo(settings, t, language);
  const localizedAreaLabel = localizeAffectedAreaLabel(activeArea, t);

  const hasActiveCommandTab = COMMAND_MODULE_TABS.some((tab) => tab.id === activeSection);
  const hasActiveAiTab = AI_ANALYSIS_TABS.some((tab) => tab.id === activeSection);
  const activeTabMeta =
    ALL_MODULE_TABS.find((tab) => tab.id === activeSection) ?? COMMAND_MODULE_TABS[0];
  const ActiveModuleIcon = activeTabMeta.icon;

  const commandItems: FloatingNavModuleItem[] = useMemo(
    () =>
      COMMAND_MODULE_TABS.map((tab) => ({
        id: tab.id,
        label: t(tab.labelKey),
        icon: tab.icon,
      })),
    [t]
  );

  const aiItems: FloatingNavModuleItem[] = useMemo(
    () =>
      AI_ANALYSIS_TABS.map((tab) => ({
        id: tab.id,
        label: t(tab.labelKey),
        icon: tab.icon,
      })),
    [t]
  );

  return (
    <aside
      aria-label={t('nav.panelAria')}
      data-testid="right-command-panel"
      className="flex flex-col h-full bg-[#F4F7FB] dark:bg-[#080f1c] overflow-hidden"
    >
      {/* Compact Command Workspace Toolbar + Floating Navigation Triggers */}
      <div
        data-testid="nav-header-container"
        className="px-3 py-2 border-b border-[#E2E8F0] dark:border-slate-800/90 space-y-1.5 shrink-0 bg-white dark:bg-[#080f1c]"
      >
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <ActiveModuleIcon className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <h2
              data-testid="active-module-heading"
              className="text-xs font-semibold text-[#172033] dark:text-slate-100 truncate"
            >
              {t(activeTabMeta.labelKey)}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
            <span className="hidden sm:inline text-[#64748B] dark:text-slate-400 truncate max-w-[140px]">
              {activeScenario.label} · {localizedAreaLabel}
            </span>
            <span className="font-mono-tabular font-medium text-[#0891B2] dark:text-cyan-300 whitespace-nowrap">
              {t('nav.severitySimulatedBadge', {
                severity: formatNumber(settings.floodSeverity),
              })}
            </span>
          </div>
        </div>

        {/* Two Independent Compact Floating Popup Triggers */}
        <div
          data-testid="simulation-command-toolbar"
          className="grid grid-cols-2 gap-1.5"
        >
          <button
            ref={commandTriggerRef}
            type="button"
            data-testid="trigger-command-modules"
            aria-expanded={commandPopupOpen}
            aria-haspopup="dialog"
            aria-controls="floating-nav-command"
            aria-label={
              commandPopupOpen
                ? t('nav.closePopupAria', { group: t('nav.groupCommandHeading') })
                : t('nav.openPopupAria', { group: t('nav.groupCommandHeading') })
            }
            onClick={() => setCommandPopupOpen((prev) => !prev)}
            className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
              commandPopupOpen
                ? 'bg-[#0891B2]/12 border-[#0891B2] text-[#0891B2] font-semibold dark:bg-cyan-500/20 dark:border-cyan-400/70 dark:text-cyan-200'
                : hasActiveCommandTab
                  ? 'bg-[#F8FAFC] border-[#0891B2]/50 text-[#172033] hover:border-[#0891B2] dark:bg-slate-900/90 dark:border-cyan-500/40 dark:text-slate-100 dark:hover:border-cyan-400/70'
                  : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#172033] hover:border-[#0891B2]/60 dark:bg-slate-900/70 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white dark:hover:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <LayoutGrid
                className={`w-3.5 h-3.5 shrink-0 ${
                  commandPopupOpen || hasActiveCommandTab
                    ? 'text-[#0891B2] dark:text-cyan-400'
                    : 'text-[#64748B] dark:text-slate-400'
                }`}
              />
              <span className="truncate">{t('nav.groupCommandHeading')}</span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {hasActiveCommandTab && (
                <span
                  data-testid="active-indicator-command"
                  className="w-1.5 h-1.5 rounded-full bg-[#0891B2] dark:bg-cyan-400"
                  aria-hidden="true"
                />
              )}
              <span className="text-[10px] font-mono-tabular font-semibold px-1.5 py-0.5 rounded bg-white border border-[#E2E8F0] text-[#64748B] dark:bg-slate-950/80 dark:border-slate-700/80 dark:text-slate-300">
                {formatNumber(COMMAND_MODULE_TABS.length)}
              </span>
            </span>
          </button>

          <button
            ref={aiTriggerRef}
            type="button"
            data-testid="trigger-ai-analysis"
            aria-expanded={aiPopupOpen}
            aria-haspopup="dialog"
            aria-controls="floating-nav-ai"
            aria-label={
              aiPopupOpen
                ? t('nav.closePopupAria', { group: t('nav.groupAiHeading') })
                : t('nav.openPopupAria', { group: t('nav.groupAiHeading') })
            }
            onClick={() => setAiPopupOpen((prev) => !prev)}
            className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
              aiPopupOpen
                ? 'bg-[#0891B2] border-[#0891B2] text-white font-semibold dark:bg-cyan-500/25 dark:border-cyan-400/75 dark:text-cyan-100'
                : hasActiveAiTab
                  ? 'bg-cyan-50/80 border-[#0891B2]/55 text-[#0891B2] font-semibold hover:border-[#0891B2] dark:bg-cyan-950/35 dark:border-cyan-500/45 dark:text-cyan-200 dark:hover:border-cyan-400'
                  : 'bg-cyan-50/55 border-[#0891B2]/25 text-[#0891B2] hover:border-[#0891B2]/60 dark:bg-cyan-950/20 dark:border-cyan-500/25 dark:text-cyan-300 dark:hover:border-cyan-400/50'
            }`}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <BrainCircuit
                className={`w-3.5 h-3.5 shrink-0 ${
                  aiPopupOpen ? 'text-white dark:text-cyan-200' : 'text-[#0891B2] dark:text-cyan-400'
                }`}
              />
              <span className="truncate">{t('nav.groupAiHeading')}</span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {hasActiveAiTab && (
                <span
                  data-testid="active-indicator-ai"
                  className={`w-1.5 h-1.5 rounded-full ${
                    aiPopupOpen ? 'bg-white dark:bg-cyan-300' : 'bg-[#0891B2] dark:bg-cyan-400'
                  }`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`text-[10px] font-mono-tabular font-semibold px-1.5 py-0.5 rounded border ${
                  aiPopupOpen
                    ? 'bg-white/20 border-white/30 text-white dark:bg-slate-950/80 dark:border-cyan-400/40 dark:text-cyan-200'
                    : 'bg-white/90 border-[#0891B2]/25 text-[#0891B2] dark:bg-slate-950/80 dark:border-cyan-500/30 dark:text-cyan-300'
                }`}
              >
                {formatNumber(AI_ANALYSIS_TABS.length)}
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Scrollable Active Module Content + Contextual 3D Feature Inspector */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
        <SelectedFeatureInspector />
        <WorkspaceViews />
      </div>

      {/* Independent Portal-Rendered Floating Popups */}
      <FloatingNavPopup
        popupId="command"
        isOpen={commandPopupOpen}
        onClose={() => setCommandPopupOpen(false)}
        anchorRef={commandTriggerRef}
        title={t('nav.groupCommandHeading')}
        subtitle={t('nav.commandPopupSubtitle')}
        headerIcon={LayoutGrid}
        variant="command"
        items={commandItems}
        activeSection={activeSection}
        onSelectModule={setSection}
        closeLabel={t('nav.closeLabel')}
        closeAriaLabel={t('nav.closePopupAria', { group: t('nav.groupCommandHeading') })}
        navAriaLabel={t('nav.tabsAria')}
      />

      <FloatingNavPopup
        popupId="ai"
        isOpen={aiPopupOpen}
        onClose={() => setAiPopupOpen(false)}
        anchorRef={aiTriggerRef}
        title={t('nav.groupAiHeading')}
        subtitle={t('nav.aiPopupSubtitle')}
        headerIcon={BrainCircuit}
        variant="ai"
        items={aiItems}
        activeSection={activeSection}
        onSelectModule={setSection}
        closeLabel={t('nav.closeLabel')}
        closeAriaLabel={t('nav.closePopupAria', { group: t('nav.groupAiHeading') })}
        navAriaLabel={t('nav.aiTabsAria')}
      />
    </aside>
  );
}
