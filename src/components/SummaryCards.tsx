import { Building2, Route, TrafficCone, Waves } from 'lucide-react';
import { useTranslation } from '../i18n';
import { localizeSeverityStatus } from '../i18n/domainLabels';
import type { SummaryMetrics } from '../types/city';

interface SummaryCardsProps {
  metrics: SummaryMetrics;
}

export function SummaryCards({ metrics }: SummaryCardsProps) {
  const { t, language, formatNumber, formatDecimal } = useTranslation();
  const unitM = language === 'th' ? 'ม.' : 'm';

  const floodAccent =
    metrics.floodSeverityLabel === 'Critical'
      ? 'text-[#DC2626] dark:text-red-400'
      : metrics.floodSeverityLabel === 'Warning'
        ? 'text-orange-600 dark:text-orange-400'
        : metrics.floodSeverityLabel === 'Elevated'
          ? 'text-[#D97706] dark:text-amber-300'
          : 'text-[#0891B2] dark:text-cyan-400';

  const roadWarn = metrics.affectedRoadsCount > 0;
  const buildingWarn = metrics.affectedBuildingsCount > 0;
  const routeCritical = metrics.safeRoutesCount <= 2;
  const routeWarn = metrics.safeRoutesCount <= 4 && !routeCritical;

  return (
    <section
      aria-label={t('overview.summaryAria')}
      className="grid grid-cols-2 gap-2.5"
    >
      {/* Flood Level */}
      <div className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 px-3.5 py-3 flex flex-col justify-between gap-1.5 shadow-2xs dark:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">
            {t('overview.floodLevel')}
          </span>
          <Waves className={`w-4 h-4 shrink-0 ${floodAccent}`} />
        </div>
        <div className="space-y-0.5">
          <div className={`text-lg font-bold font-mono-tabular ${floodAccent}`}>
            {formatDecimal(metrics.floodLevelMeters, 2)} {unitM}
          </div>
          <div className="text-[11px] font-medium text-[#64748B] dark:text-slate-400 font-mono-tabular">
            {localizeSeverityStatus(metrics.floodSeverityLabel, t)} ·{' '}
            {formatDecimal(metrics.floodedAreaKm2, 2)} {t('common.km2Unit')} (
            {formatDecimal(metrics.floodedAreaPct, 0)}%)
          </div>
        </div>
      </div>

      {/* Affected Roads */}
      <div className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 px-3.5 py-3 flex flex-col justify-between gap-1.5 shadow-2xs dark:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">
            {t('overview.affectedRoads')}
          </span>
          <TrafficCone
            className={`w-4 h-4 shrink-0 ${
              metrics.floodLevelMeters >= 1.2
                ? 'text-[#DC2626] dark:text-red-400'
                : roadWarn
                  ? 'text-[#D97706] dark:text-orange-400'
                  : 'text-[#0891B2] dark:text-sky-400'
            }`}
          />
        </div>
        <div className="space-y-0.5">
          <div className="text-lg font-bold font-mono-tabular text-[#172033] dark:text-slate-100">
            {formatNumber(metrics.affectedRoadsCount)}
          </div>
          <div className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {t('overview.ofTotalSimulated', {
              total: formatNumber(metrics.totalRoadsCount),
            })}
          </div>
        </div>
      </div>

      {/* Affected Buildings */}
      <div className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 px-3.5 py-3 flex flex-col justify-between gap-1.5 shadow-2xs dark:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">
            {t('overview.affectedBuildings')}
          </span>
          <Building2
            className={`w-4 h-4 shrink-0 ${
              metrics.floodLevelMeters >= 1.2
                ? 'text-[#DC2626] dark:text-red-400'
                : buildingWarn
                  ? 'text-[#D97706] dark:text-orange-400'
                  : 'text-[#0891B2] dark:text-sky-400'
            }`}
          />
        </div>
        <div className="space-y-0.5">
          <div className="text-lg font-bold font-mono-tabular text-[#172033] dark:text-slate-100">
            {formatNumber(metrics.affectedBuildingsCount)}
          </div>
          <div className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
            {formatNumber(metrics.totalBuildingsCount)} ·{' '}
            {t('overview.drainageCompact', {
              pct: formatNumber(metrics.effectiveDrainagePct),
            })}
          </div>
        </div>
      </div>

      {/* Facilities & Safe Routes */}
      <div className="rounded-xl bg-white border border-[#E2E8F0] dark:bg-[#0b1220] dark:border-slate-800/90 px-3.5 py-3 flex flex-col justify-between gap-1.5 shadow-2xs dark:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">
            {t('overview.facilitiesSafeRoutes')}
          </span>
          <Route
            className={`w-4 h-4 shrink-0 ${
              routeCritical
                ? 'text-[#DC2626] dark:text-red-400'
                : routeWarn
                  ? 'text-[#D97706] dark:text-orange-400'
                  : 'text-[#0891B2] dark:text-cyan-400'
            }`}
          />
        </div>
        <div className="space-y-0.5">
          <div
            data-testid="summary-affected-facilities"
            className="text-lg font-bold font-mono-tabular text-[#172033] dark:text-slate-100"
          >
            {formatNumber(metrics.affectedFacilitiesCount)}
            <span className="text-xs font-normal text-[#64748B] dark:text-slate-400">
              /{formatNumber(metrics.totalFacilitiesCount)} {t('overview.facSuffix')}
            </span>
          </div>
          <div
            className={`text-[11px] font-semibold font-mono-tabular ${
              routeCritical
                ? 'text-[#DC2626] dark:text-red-400'
                : routeWarn
                  ? 'text-[#D97706] dark:text-orange-400'
                  : 'text-[#0891B2] dark:text-cyan-400'
            }`}
          >
            {t('overview.safeCorridorsCount', {
              safe: formatNumber(metrics.safeRoutesCount),
              total: formatNumber(metrics.totalCorridorsCount),
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
