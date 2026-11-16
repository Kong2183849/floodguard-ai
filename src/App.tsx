import { GripVertical, Maximize2, Minimize2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { CityViewport } from './components/CityViewport';
import { RightCommandPanel } from './components/RightCommandPanel';
import { TopNavbar } from './components/TopNavbar';
import { SimulationProvider } from './context/SimulationContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider, useTranslation } from './i18n';

const DEFAULT_LEFT_PCT = 70;
const MIN_LEFT_PCT = 45;
const MAX_LEFT_PCT = 78;

function clampSplitPct(pct: number): number {
  return Math.min(MAX_LEFT_PCT, Math.max(MIN_LEFT_PCT, pct));
}

function DashboardShell() {
  const { t } = useTranslation();
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [leftWidthPct, setLeftWidthPct] = useState(DEFAULT_LEFT_PCT);
  const [isDragging, setIsDragging] = useState(false);
  const [mobileViewportExpanded, setMobileViewportExpanded] = useState(false);

  useEffect(() => {
    splitContainerRef.current?.style.setProperty(
      '--left-pane-width',
      `${leftWidthPct}%`
    );
  }, [leftWidthPct]);

  const updateWidthFromClientX = useCallback((clientX: number) => {
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return;
    const rawPct = ((clientX - rect.left) / rect.width) * 100;
    setLeftWidthPct(clampSplitPct(Math.round(rawPct * 10) / 10));
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      updateWidthFromClientX(event.clientX);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, updateWidthFromClientX]);

  const handleDividerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
    updateWidthFromClientX(event.clientX);
  };

  const handleDividerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setLeftWidthPct((prev) => clampSplitPct(prev - 2));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setLeftWidthPct((prev) => clampSplitPct(prev + 2));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setLeftWidthPct(MIN_LEFT_PCT);
    } else if (event.key === 'End') {
      event.preventDefault();
      setLeftWidthPct(MAX_LEFT_PCT);
    }
  };

  return (
    <div
      className={`h-screen w-screen overflow-hidden flex flex-col bg-[#F4F7FB] text-[#172033] dark:bg-[#060b14] dark:text-slate-100 ${
        isDragging ? 'select-none' : ''
      }`}
    >
      <TopNavbar
        leftWidthPct={leftWidthPct}
        onResetSplit={() => setLeftWidthPct(DEFAULT_LEFT_PCT)}
      />

      {/* Permanent Two-Panel Split-Screen Workspace */}
      <div
        ref={splitContainerRef}
        data-testid="split-workspace"
        className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative"
      >
        {/* LEFT PANEL: Permanent Chatuchak 3D City Viewport (~70% default on desktop) */}
        <section
          aria-label={t('app.viewportAria')}
          data-testid="left-3d-panel"
          className={`w-full lg:w-[var(--left-pane-width,70%)] shrink-0 min-w-0 relative bg-[#F4F7FB] dark:bg-[#060b14] p-2.5 lg:p-3 ${
            mobileViewportExpanded ? 'h-[60vh]' : 'h-[46vh]'
          } lg:h-full transition-[height] duration-200 lg:transition-none`}
        >
          <CityViewport />

          {/* Mobile/Tablet Viewport Height Preset Toggle (Both panels stay visible simultaneously) */}
          <button
            type="button"
            onClick={() => setMobileViewportExpanded((v) => !v)}
            title={
              mobileViewportExpanded
                ? t('app.compact3dTitle')
                : t('app.expand3dTitle')
            }
            className="lg:hidden absolute bottom-4 right-4 z-20 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/95 border border-[#E2E8F0] text-[#172033] shadow-sm dark:bg-[#080f1c]/90 dark:border-slate-700/80 dark:text-slate-200 hover:border-[#0891B2] dark:hover:border-cyan-500/50 cursor-pointer"
          >
            {mobileViewportExpanded ? (
              <>
                <Minimize2 className="w-3 h-3 text-[#0891B2] dark:text-cyan-400" />
                <span>{t('app.compact3d')}</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3 text-[#0891B2] dark:text-cyan-400" />
                <span>{t('app.expand3d')}</span>
              </>
            )}
          </button>
        </section>

        {/* DRAGGABLE DESKTOP SPLIT DIVIDER */}
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={t('app.dividerAria')}
          aria-valuenow={Math.round(leftWidthPct)}
          aria-valuemin={MIN_LEFT_PCT}
          aria-valuemax={MAX_LEFT_PCT}
          data-testid="split-divider"
          title={t('app.dividerTitle')}
          onPointerDown={handleDividerPointerDown}
          onDoubleClick={() => setLeftWidthPct(DEFAULT_LEFT_PCT)}
          onKeyDown={handleDividerKeyDown}
          className={`hidden lg:flex w-2.5 shrink-0 cursor-col-resize items-center justify-center border-x transition-colors focus:outline-none focus:bg-cyan-500/20 ${
            isDragging
              ? 'bg-cyan-500/25 border-cyan-500/60'
              : 'bg-[#E2E8F0]/70 border-[#CBD5E1] hover:bg-cyan-500/15 hover:border-[#0891B2]/50 dark:bg-[#060b14] dark:border-slate-800/90 dark:hover:bg-cyan-500/15 dark:hover:border-cyan-500/40'
          }`}
        >
          <div
            className={`flex items-center justify-center w-full h-14 rounded-sm transition-colors ${
              isDragging
                ? 'text-[#0891B2] dark:text-cyan-300'
                : 'text-slate-500 hover:text-[#0891B2] dark:text-slate-600 dark:hover:text-cyan-400'
            }`}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* RIGHT PANEL: Command Workspace (~30% default on desktop) */}
        <div
          data-testid="right-panel-container"
          className="flex-1 min-w-0 min-h-0 lg:h-full overflow-hidden border-t lg:border-t-0 border-[#E2E8F0] dark:border-slate-800/90"
        >
          <RightCommandPanel />
        </div>

        {/* Pointer capture guard while dragging across Three.js WebGL canvas */}
        {isDragging && (
          <div
            aria-hidden="true"
            className="fixed inset-0 z-50 cursor-col-resize"
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <SimulationProvider>
          <DashboardShell />
        </SimulationProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
