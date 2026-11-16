import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { NavSection } from '../types/city';

export interface FloatingNavModuleItem {
  id: NavSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface FloatingNavPopupProps {
  popupId: 'command' | 'ai';
  isOpen: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  title: string;
  subtitle: string;
  headerIcon: ComponentType<{ className?: string }>;
  variant: 'command' | 'ai';
  items: FloatingNavModuleItem[];
  activeSection: NavSection;
  onSelectModule: (section: NavSection) => void;
  closeLabel: string;
  closeAriaLabel: string;
  navAriaLabel: string;
}

interface RectBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface ComputedPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  useSingleColumn: boolean;
}

const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 8;

function toRectBox(r: DOMRect | null | undefined): RectBox | null {
  if (!r || r.width <= 0 || r.height <= 0) return null;
  return {
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

function intersectionArea(a: RectBox, b: RectBox): number {
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  if (xOverlap <= 0) return 0;
  const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return xOverlap * yOverlap;
}

function makeCandidateBox(left: number, top: number, width: number, height: number): RectBox {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

export function FloatingNavPopup({
  popupId,
  isOpen,
  onClose,
  anchorRef,
  title,
  subtitle,
  headerIcon: HeaderIcon,
  variant,
  items,
  activeSection,
  onSelectModule,
  closeLabel,
  closeAriaLabel,
  navAriaLabel,
}: FloatingNavPopupProps) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<ComputedPosition | null>(null);

  const computePosition = useCallback(() => {
    if (!isOpen || !anchorRef.current) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isDesktop = vw >= 1024;

    const topNavRect = toRectBox(
      document.querySelector('[data-testid="top-navbar"]')?.getBoundingClientRect()
    );
    const left3dRect = toRectBox(
      document.querySelector('[data-testid="left-3d-panel"]')?.getBoundingClientRect()
    );
    const rightPanelRect = toRectBox(
      document.querySelector('[data-testid="right-panel-container"]')?.getBoundingClientRect()
    );

    const obstacles: RectBox[] = [];
    const layersMenuRect = toRectBox(
      document.querySelector('[data-testid="layers-menu-popover"]')?.getBoundingClientRect()
    );
    if (layersMenuRect) obstacles.push(layersMenuRect);

    const legendRect = toRectBox(
      document.querySelector('[data-testid="flood-legend"]')?.getBoundingClientRect()
    );
    if (legendRect) obstacles.push(legendRect);

    const siblingPopups = document.querySelectorAll<HTMLElement>('[data-nav-popup]');
    siblingPopups.forEach((el) => {
      if (el.dataset.navPopup !== popupId) {
        const sibRect = toRectBox(el.getBoundingClientRect());
        if (sibRect) obstacles.push(sibRect);
      }
    });

    const minTop = (topNavRect ? topNavRect.bottom : 0) + 8;
    const maxBottom = vh - VIEWPORT_MARGIN;

    const desiredMaxW = variant === 'command' ? 396 : 376;
    const rightWorkspaceAvailable =
      isDesktop && rightPanelRect
        ? Math.max(260, vw - rightPanelRect.left - VIEWPORT_MARGIN - 4)
        : vw - VIEWPORT_MARGIN * 2;
    const popupWidth = Math.min(desiredMaxW, Math.max(250, rightWorkspaceAvailable), vw - VIEWPORT_MARGIN * 2);
    const useSingleColumn = vw < 640 || popupWidth < 310;

    const measuredH =
      popupRef.current?.scrollHeight ??
      (useSingleColumn ? items.length * 42 + 78 : Math.ceil(items.length / 2) * 44 + 78);
    const popupHeight = Math.min(measuredH, Math.max(200, maxBottom - minTop));

    const minAllowedLeft =
      isDesktop && left3dRect && left3dRect.right + popupWidth + VIEWPORT_MARGIN <= vw
        ? Math.max(VIEWPORT_MARGIN, left3dRect.right + 4)
        : VIEWPORT_MARGIN;
    const maxAllowedLeft = Math.max(minAllowedLeft, vw - popupWidth - VIEWPORT_MARGIN);

    const clampX = (rawLeft: number) => Math.min(maxAllowedLeft, Math.max(minAllowedLeft, rawLeft));
    const clampY = (rawTop: number) =>
      Math.min(Math.max(minTop, maxBottom - popupHeight), Math.max(minTop, rawTop));

    const belowY = anchorRect.bottom + ANCHOR_GAP;
    const aboveY = anchorRect.top - popupHeight - ANCHOR_GAP;

    const candidateCoords: Array<{ left: number; top: number; bias: number }> = [
      { left: clampX(anchorRect.left), top: belowY, bias: 0 },
      { left: clampX(anchorRect.right - popupWidth), top: belowY, bias: 2 },
      { left: maxAllowedLeft, top: belowY, bias: 5 },
      { left: minAllowedLeft, top: belowY, bias: 6 },
      { left: clampX(anchorRect.left), top: aboveY, bias: 12 },
      { left: clampX(anchorRect.right - popupWidth), top: aboveY, bias: 14 },
    ];

    siblingPopups.forEach((el) => {
      if (el.dataset.navPopup !== popupId) {
        const sib = el.getBoundingClientRect();
        if (sib.width > 0 && sib.height > 0) {
          candidateCoords.push(
            { left: clampX(anchorRect.left), top: sib.bottom + ANCHOR_GAP, bias: 3 },
            { left: clampX(sib.left - popupWidth - ANCHOR_GAP), top: belowY, bias: 4 },
            { left: clampX(sib.right + ANCHOR_GAP), top: belowY, bias: 4 },
            { left: clampX(anchorRect.right - popupWidth), top: sib.bottom + ANCHOR_GAP, bias: 5 }
          );
        }
      }
    });

    let bestScore = Number.POSITIVE_INFINITY;
    let bestLeft = clampX(anchorRect.left);
    let bestTop = clampY(belowY);

    for (const cand of candidateCoords) {
      const clampedTop = Math.min(vh - VIEWPORT_MARGIN - 180, Math.max(minTop, cand.top));
      const box = makeCandidateBox(cand.left, clampedTop, popupWidth, popupHeight);

      let penalty = cand.bias;

      if (box.bottom > maxBottom) {
        penalty += (box.bottom - maxBottom) * 50;
      }
      if (topNavRect) {
        penalty += intersectionArea(box, topNavRect) * 200;
      }
      if (isDesktop && left3dRect) {
        penalty += intersectionArea(box, left3dRect) * 120;
      }
      for (const obs of obstacles) {
        penalty += intersectionArea(box, obs) * 500;
      }
      const selfAnchorBox = toRectBox(anchorRect);
      if (selfAnchorBox) {
        penalty += intersectionArea(box, selfAnchorBox) * 300;
      }

      if (penalty < bestScore) {
        bestScore = penalty;
        bestLeft = box.left;
        bestTop = clampedTop;
      }
    }

    const availableMaxHeight = Math.max(180, vh - bestTop - VIEWPORT_MARGIN);

    setPosition({
      left: Math.round(bestLeft),
      top: Math.round(bestTop),
      width: Math.round(popupWidth),
      maxHeight: Math.round(availableMaxHeight),
      useSingleColumn,
    });
  }, [anchorRef, isOpen, items.length, popupId, variant]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    computePosition();
    const rafId = window.requestAnimationFrame(computePosition);

    const handleReposition = () => computePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    const resizeObserver = new ResizeObserver(handleReposition);
    if (popupRef.current) resizeObserver.observe(popupRef.current);
    if (anchorRef.current) resizeObserver.observe(anchorRef.current);
    const rightPane = document.querySelector('[data-testid="right-panel-container"]');
    if (rightPane) resizeObserver.observe(rightPane);

    const mutationObserver = new MutationObserver(() => {
      window.requestAnimationFrame(computePosition);
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [anchorRef, computePosition, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (popupRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;

      if (
        target.closest('[data-testid="layers-menu-popover"]') ||
        target.closest('[data-testid="layers-toggle-btn"]') ||
        target.closest('[data-testid="flood-legend"]') ||
        target.closest('[data-testid="trigger-command-modules"]') ||
        target.closest('[data-testid="trigger-ai-analysis"]') ||
        target.closest('[data-nav-popup]')
      ) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorRef, isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const isAi = variant === 'ai';

  return createPortal(
    <div
      ref={popupRef}
      id={`floating-nav-${popupId}`}
      role="dialog"
      aria-label={title}
      data-testid={`floating-nav-popup-${popupId}`}
      data-nav-popup={popupId}
      style={
        position
          ? {
              left: `${position.left}px`,
              top: `${position.top}px`,
              width: `${position.width}px`,
              maxHeight: `${position.maxHeight}px`,
            }
          : {
              left: '16px',
              top: '68px',
              width: '360px',
              maxHeight: '420px',
              visibility: 'hidden',
            }
      }
      className={`fixed z-40 flex flex-col rounded-xl border shadow-xl transition-[opacity,transform] duration-150 ease-out origin-top ${
        isAi
          ? 'bg-white border-[#0891B2]/35 dark:bg-[#0b1526] dark:border-cyan-500/35'
          : 'bg-white border-[#CBD5E1] dark:bg-[#0b1322] dark:border-slate-700/90'
      }`}
    >
      <div
        className={`flex items-center justify-between gap-2 px-3.5 py-2.5 border-b shrink-0 rounded-t-xl ${
          isAi
            ? 'bg-cyan-50/70 border-[#0891B2]/20 dark:bg-cyan-950/35 dark:border-cyan-500/25'
            : 'bg-[#F8FAFC] border-[#E2E8F0] dark:bg-slate-900/75 dark:border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
              isAi
                ? 'bg-[#0891B2]/12 border-[#0891B2]/30 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-400/35 dark:text-cyan-300'
                : 'bg-white border-[#E2E8F0] text-[#0891B2] dark:bg-slate-800 dark:border-slate-700 dark:text-cyan-400'
            }`}
          >
            <HeaderIcon className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <h3
              className={`text-xs font-bold tracking-wide truncate ${
                isAi ? 'text-[#0891B2] dark:text-cyan-300' : 'text-[#172033] dark:text-slate-100'
              }`}
            >
              {title}
            </h3>
            <p className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">
              {subtitle}
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid={`close-nav-popup-${popupId}`}
          aria-label={closeAriaLabel}
          title={closeLabel}
          onClick={onClose}
          className="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-transparent text-[#64748B] hover:text-[#172033] hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <nav
        aria-label={navAriaLabel}
        className={`p-2.5 overflow-y-auto grid gap-1.5 ${
          position?.useSingleColumn ? 'grid-cols-1' : 'grid-cols-2'
        }`}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`module-tab-${item.id}`}
              title={item.label}
              onClick={() => {
                onSelectModule(item.id);
                onClose();
              }}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center justify-start gap-2 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors text-left cursor-pointer ${
                active
                  ? isAi
                    ? 'bg-[#0891B2] border-[#0891B2] text-white font-semibold dark:bg-cyan-500/20 dark:border-cyan-400/70 dark:text-cyan-200'
                    : 'bg-[#0891B2]/12 border-[#0891B2] text-[#0891B2] font-semibold dark:bg-cyan-500/18 dark:border-cyan-400/60 dark:text-cyan-200'
                  : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#172033] hover:border-[#0891B2]/60 hover:bg-white dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-200 dark:hover:text-white dark:hover:border-cyan-500/40 dark:hover:bg-slate-800/80'
              }`}
            >
              <Icon
                className={`w-3.5 h-3.5 shrink-0 ${
                  active
                    ? isAi
                      ? 'text-white dark:text-cyan-300'
                      : 'text-[#0891B2] dark:text-cyan-300'
                    : isAi
                      ? 'text-[#0891B2] dark:text-cyan-400'
                      : 'text-[#64748B] dark:text-slate-400'
                }`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>,
    document.body
  );
}
