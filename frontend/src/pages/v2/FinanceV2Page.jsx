import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
    financeService,
    organizationService,
    shipmentService
} from '../../services/api';
import { CAPABILITIES, hasCapability } from '../../utils/capabilities';
import { TK } from '../../tokens/kineticHorizon';
import { generateInvoicePDF, generateAccountStatementPDF } from '../../utils/pdfGenerator';

// Reusable V2 components
import MetricCardV2 from './components/MetricCardV2';
import ErrorBannerV2 from './components/ErrorBannerV2';
import DashboardSkeletonV2 from './components/DashboardSkeletonV2';
import EmptyStateV2 from './components/EmptyStateV2';

// Shared components
import StatusBadge from '../../components/common/StatusBadge';
import TradeRouteDisplay from '../../components/common/TradeRouteDisplay';
import ShipmentInspectorDrawer from '../../components/common/ShipmentInspectorDrawer';

/**
 * Container-Aware Responsive SVG Chart for AR Aging Buckets & Cash Flow
 */
const FinanceTelemetryChartV2 = ({
    mode = 'aging', // 'aging' | 'cashflow'
    agingData = [],
    cashFlowData = [],
    currency = 'KWD',
    isRTL = false,
    height = 220
}) => {
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(600);
    const [hoveredIdx, setHoveredIdx] = useState(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateWidth = () => {
            const w = el.getBoundingClientRect().width;
            if (w > 0) setContainerWidth(Math.floor(w));
        };
        updateWidth();

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    if (entry.contentRect.width > 0) {
                        setContainerWidth(Math.floor(entry.contentRect.width));
                    }
                }
            });
            observer.observe(el);
            return () => observer.disconnect();
        } else {
            window.addEventListener('resize', updateWidth);
            return () => window.removeEventListener('resize', updateWidth);
        }
    }, []);

    const isMobile = containerWidth < 460;
    const chartHeight = height || (isMobile ? 185 : 220);
    const padLeft = isRTL ? 14 : (isMobile ? 38 : 48);
    const padRight = isRTL ? (isMobile ? 38 : 48) : 14;
    const padBottom = isMobile ? 28 : 32;
    const padTop = 28;

    const chartW = Math.max(100, containerWidth - padLeft - padRight);
    const chartH = Math.max(80, chartHeight - padTop - padBottom);
    const gridSteps = [0, 0.33, 0.66, 1];

    if (mode === 'aging') {
        const items = agingData.length > 0 ? agingData : [
            { id: '0-30', label: isRTL ? '٠-٣٠ يوم' : '0–30 Days', amount: 0, count: 0, color: '#059669' },
            { id: '31-60', label: isRTL ? '٣١-٦٠ يوم' : '31–60 Days', amount: 0, count: 0, color: '#0284c7' },
            { id: '61-90', label: isRTL ? '٦١-٩٠ يوم' : '61–90 Days', amount: 0, count: 0, color: '#d97706' },
            { id: '90+', label: isRTL ? '+٩٠ يوم' : '90+ Overdue', amount: 0, count: 0, color: '#e11d48' }
        ];
        const amounts = items.map((d) => Number(d.amount) || 0);
        const maxVal = Math.max(...amounts, 50);
        const topCeil = Math.ceil((maxVal * 1.18) / 10) * 10;
        const barSlotW = chartW / items.length;
        const barW = Math.min(isMobile ? 36 : 64, Math.max(18, Math.floor(barSlotW * 0.52)));

        return (
            <div
                ref={containerRef}
                className="w-full relative select-none overflow-hidden"
                role="region"
                aria-label="Receivables Aging Distribution Chart"
            >
                <svg
                    width={containerWidth}
                    height={chartHeight}
                    viewBox={`0 0 ${containerWidth} ${chartHeight}`}
                    className="w-full h-auto block"
                >
                    {gridSteps.map((ratio, i) => {
                        const y = padTop + chartH * (1 - ratio);
                        const val = Math.round(topCeil * ratio);
                        return (
                            <g key={i}>
                                <line
                                    x1={padLeft}
                                    y1={y}
                                    x2={containerWidth - padRight}
                                    y2={y}
                                    stroke="currentColor"
                                    className="text-slate-200 dark:text-slate-800"
                                    strokeDasharray={ratio === 0 ? 'none' : '3 3'}
                                    strokeWidth={1}
                                />
                                <text
                                    x={isRTL ? containerWidth - padRight + 8 : padLeft - 8}
                                    y={y + 3.5}
                                    textAnchor={isRTL ? 'start' : 'end'}
                                    fontSize={isMobile ? '9.5' : '10.5'}
                                    fontWeight="700"
                                    className="fill-slate-400 dark:fill-slate-500"
                                    fontFamily="inherit"
                                >
                                    {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                                </text>
                            </g>
                        );
                    })}

                    {items.map((d, i) => {
                        const val = Number(d.amount) || 0;
                        const barH = (val / topCeil) * chartH;
                        const slotIndex = isRTL ? items.length - 1 - i : i;
                        const slotX = padLeft + slotIndex * barSlotW;
                        const x = slotX + (barSlotW - barW) / 2;
                        const y = padTop + chartH - barH;
                        const isHovered = hoveredIdx === i;

                        const tooltipW = 144;
                        const tooltipX = Math.max(
                            6,
                            Math.min(containerWidth - tooltipW - 6, x + barW / 2 - tooltipW / 2)
                        );
                        const tooltipY = Math.max(2, y - 36);

                        return (
                            <g
                                key={d.id || i}
                                tabIndex={0}
                                role="button"
                                aria-label={`${d.label}: ${val.toFixed(3)} ${currency}`}
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                                onFocus={() => setHoveredIdx(i)}
                                onBlur={() => setHoveredIdx(null)}
                                className="cursor-pointer focus:outline-none"
                            >
                                <rect
                                    x={slotX}
                                    y={padTop}
                                    width={barSlotW}
                                    height={chartH}
                                    fill="transparent"
                                />
                                <rect
                                    x={x}
                                    y={val > 0 ? y : padTop + chartH - 3}
                                    width={barW}
                                    height={Math.max(barH, 3)}
                                    rx={6}
                                    ry={6}
                                    fill={d.color || TK.primary}
                                    fillOpacity={isHovered ? 1 : val > 0 ? 0.85 : 0.3}
                                    className="transition-all duration-150"
                                />
                                {!isHovered && (
                                    <text
                                        x={x + barW / 2}
                                        y={Math.max(14, (val > 0 ? y : padTop + chartH - 3) - 6)}
                                        textAnchor="middle"
                                        fontSize={isMobile ? '9.5' : '10.5'}
                                        fontWeight="800"
                                        className="fill-slate-700 dark:fill-slate-200"
                                        fontFamily="inherit"
                                    >
                                        {val >= 1000
                                            ? `${(val / 1000).toFixed(2)}k`
                                            : val.toFixed(val > 0 ? 1 : 0)}
                                    </text>
                                )}
                                <text
                                    x={x + barW / 2}
                                    y={chartHeight - (isMobile ? 8 : 10)}
                                    textAnchor="middle"
                                    fontSize={isMobile ? '9.5' : '10.5'}
                                    fontWeight={isHovered ? '800' : '600'}
                                    className={
                                        isHovered
                                            ? 'fill-primary dark:fill-sky-400'
                                            : 'fill-slate-600 dark:fill-slate-400'
                                    }
                                    fontFamily="inherit"
                                >
                                    {d.label}
                                </text>
                                {isHovered && (
                                    <g style={{ pointerEvents: 'none' }}>
                                        <rect
                                            x={tooltipX}
                                            y={tooltipY}
                                            width={tooltipW}
                                            height={32}
                                            rx={6}
                                            fill="#0f172a"
                                            stroke="#334155"
                                            strokeWidth={1}
                                        />
                                        <text
                                            x={tooltipX + tooltipW / 2}
                                            y={tooltipY + 13}
                                            textAnchor="middle"
                                            fontSize="9.5"
                                            fontWeight="700"
                                            fill="#94a3b8"
                                            fontFamily="inherit"
                                        >
                                            {d.label} ({d.count || 0} {isRTL ? 'شحنة' : 'items'})
                                        </text>
                                        <text
                                            x={tooltipX + tooltipW / 2}
                                            y={tooltipY + 25}
                                            textAnchor="middle"
                                            fontSize="10.5"
                                            fontWeight="800"
                                            fill="#ffffff"
                                            fontFamily="inherit"
                                        >
                                            {val.toLocaleString('en-US', {
                                                minimumFractionDigits: 3,
                                                maximumFractionDigits: 3
                                            })}{' '}
                                            {currency}
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>
        );
    }

    // Cash Flow Mode (Credits vs Debits)
    const months = cashFlowData.length > 0 ? cashFlowData : [];
    const maxCF = Math.max(
        ...months.flatMap((m) => [Number(m.credits) || 0, Number(m.debits) || 0]),
        100
    );
    const topCeilCF = Math.ceil((maxCF * 1.18) / 10) * 10;
    const slotW = chartW / Math.max(1, months.length);
    const singleBarW = Math.min(isMobile ? 14 : 22, Math.max(8, Math.floor(slotW * 0.28)));

    return (
        <div
            ref={containerRef}
            className="w-full relative select-none overflow-hidden"
            role="region"
            aria-label="Monthly Cash Flow Chart"
        >
            <svg
                width={containerWidth}
                height={chartHeight}
                viewBox={`0 0 ${containerWidth} ${chartHeight}`}
                className="w-full h-auto block"
            >
                {gridSteps.map((ratio, i) => {
                    const y = padTop + chartH * (1 - ratio);
                    const val = Math.round(topCeilCF * ratio);
                    return (
                        <g key={i}>
                            <line
                                x1={padLeft}
                                y1={y}
                                x2={containerWidth - padRight}
                                y2={y}
                                stroke="currentColor"
                                className="text-slate-200 dark:text-slate-800"
                                strokeDasharray={ratio === 0 ? 'none' : '3 3'}
                                strokeWidth={1}
                            />
                            <text
                                x={isRTL ? containerWidth - padRight + 8 : padLeft - 8}
                                y={y + 3.5}
                                textAnchor={isRTL ? 'start' : 'end'}
                                fontSize={isMobile ? '9.5' : '10.5'}
                                fontWeight="700"
                                className="fill-slate-400 dark:fill-slate-500"
                                fontFamily="inherit"
                            >
                                {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                            </text>
                        </g>
                    );
                })}

                {months.map((m, i) => {
                    const cr = Number(m.credits) || 0;
                    const dr = Number(m.debits) || 0;
                    const crH = (cr / topCeilCF) * chartH;
                    const drH = (dr / topCeilCF) * chartH;

                    const slotIndex = isRTL ? months.length - 1 - i : i;
                    const slotX = padLeft + slotIndex * slotW;
                    const centerX = slotX + slotW / 2;
                    const crX = centerX - singleBarW - 2;
                    const drX = centerX + 2;
                    const crY = padTop + chartH - crH;
                    const drY = padTop + chartH - drH;
                    const isHovered = hoveredIdx === i;

                    return (
                        <g
                            key={m.month || i}
                            tabIndex={0}
                            role="button"
                            aria-label={`${m.month}: Credits ${cr.toFixed(3)} ${currency}, Debits ${dr.toFixed(3)} ${currency}`}
                            onMouseEnter={() => setHoveredIdx(i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                            onFocus={() => setHoveredIdx(i)}
                            onBlur={() => setHoveredIdx(null)}
                            className="cursor-pointer focus:outline-none"
                        >
                            <rect
                                x={slotX}
                                y={padTop}
                                width={slotW}
                                height={chartH}
                                fill="transparent"
                            />
                            {/* Credits Bar (Emerald) */}
                            <rect
                                x={crX}
                                y={cr > 0 ? crY : padTop + chartH - 3}
                                width={singleBarW}
                                height={Math.max(crH, 3)}
                                rx={4}
                                ry={4}
                                fill="#059669"
                                fillOpacity={isHovered ? 1 : cr > 0 ? 0.88 : 0.3}
                            />
                            {/* Debits Bar (Primary Blue) */}
                            <rect
                                x={drX}
                                y={dr > 0 ? drY : padTop + chartH - 3}
                                width={singleBarW}
                                height={Math.max(drH, 3)}
                                rx={4}
                                ry={4}
                                fill="#0050d4"
                                fillOpacity={isHovered ? 1 : dr > 0 ? 0.78 : 0.3}
                            />
                            <text
                                x={centerX}
                                y={chartHeight - (isMobile ? 8 : 10)}
                                textAnchor="middle"
                                fontSize={isMobile ? '9.5' : '10.5'}
                                fontWeight={isHovered ? '800' : '600'}
                                className={
                                    isHovered
                                        ? 'fill-primary dark:fill-sky-400'
                                        : 'fill-slate-600 dark:fill-slate-400'
                                }
                                fontFamily="inherit"
                            >
                                {m.month}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

/**
 * Compact 2-Tier Organization Credit & Wallet Health Wing
 * Fits cleanly in the 4/5-col right wing with 0px horizontal overflow at all viewports.
 */
const OrgCreditHealthV2 = ({
    organizations = [],
    selectedOrgId = 'all',
    onSelectOrg,
    isRTL = false
}) => {
    if (!organizations || organizations.length === 0) {
        return (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs rounded-2xl p-5 flex flex-col items-center justify-center text-center h-full min-h-[220px]">
                <span
                    className="material-symbols-outlined text-3xl text-slate-400 dark:text-slate-500 mb-2"
                    aria-hidden="true"
                >
                    corporate_fare
                </span>
                <p className="font-bold text-xs text-slate-500 dark:text-slate-400">
                    {isRTL ? 'لا توجد منظمات مسجلة' : 'No organization accounts loaded'}
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs rounded-2xl p-4 sm:p-5 h-full flex flex-col justify-between min-w-0 overflow-hidden">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-sky-500/15 text-primary dark:text-sky-400 flex items-center justify-center shrink-0 select-none">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                            account_balance
                        </span>
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight truncate">
                            {isRTL ? 'ملاءة الحسابات والائتمان' : 'B2B Credit & Wallet Health'}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                            {isRTL
                                ? 'الأرصدة والحدود الائتمانية للمنظمات'
                                : 'Organization balances & credit utilization'}
                        </p>
                    </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-full text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 tabular-nums">
                    {organizations.length} {isRTL ? 'حساب' : 'Orgs'}
                </span>
            </div>

            {/* 2-Tier Organization Rows */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 mt-2 flex-1 flex flex-col justify-around">
                {organizations.slice(0, 5).map((org, idx) => {
                    const balance = Number(org.balance || 0);
                    const creditLimit = Number(org.creditLimit || 0);
                    const cur = org.currency || 'KWD';
                    const usedPct =
                        creditLimit > 0
                            ? Math.min(100, Math.max(0, Math.round((Math.max(0, balance) / creditLimit) * 100)))
                            : 15;
                    const isSelected = String(selectedOrgId) === String(org.id);

                    const statusPill =
                        creditLimit <= 0
                            ? {
                                  label: isRTL ? 'مسبق الدفع' : 'Prepaid',
                                  cls: 'bg-sky-600 text-white dark:bg-sky-500/20 dark:text-sky-300 dark:border dark:border-sky-500/30'
                              }
                            : usedPct >= 85
                            ? {
                                  label: `${usedPct}% ${isRTL ? 'مستخدم' : 'Used'}`,
                                  cls: 'bg-rose-600 text-white dark:bg-rose-500/20 dark:text-rose-300 dark:border dark:border-rose-500/30'
                              }
                            : usedPct >= 60
                            ? {
                                  label: `${usedPct}% ${isRTL ? 'مستخدم' : 'Used'}`,
                                  cls: 'bg-amber-600 text-white dark:bg-amber-500/20 dark:text-amber-300 dark:border dark:border-amber-500/30'
                              }
                            : {
                                  label: `${usedPct}% ${isRTL ? 'ائتمان' : 'Credit'}`,
                                  cls: 'bg-emerald-600 text-white dark:bg-emerald-500/20 dark:text-emerald-300 dark:border dark:border-emerald-500/30'
                              };

                    return (
                        <div
                            key={org.id || idx}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                                onSelectOrg?.(isSelected ? 'all' : org.id)
                            }
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onSelectOrg?.(isSelected ? 'all' : org.id);
                                }
                            }}
                            className={`group py-2.5 first:pt-2 last:pb-1 px-2 -mx-2 rounded-xl transition-colors min-w-0 cursor-pointer ${
                                isSelected
                                    ? 'bg-primary/5 dark:bg-sky-500/10 ring-1 ring-primary/30'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                        >
                            {/* Tier 1 */}
                            <div className="flex items-center justify-between gap-2 min-w-0">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0 font-extrabold text-xs text-primary dark:text-sky-400 select-none">
                                        {String(org.name || 'OR')
                                            .slice(0, 2)
                                            .toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-bold text-xs sm:text-[13px] text-slate-900 dark:text-slate-100 truncate leading-tight">
                                            {org.name}
                                        </div>
                                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5 tabular-nums">
                                            <span className="font-bold text-slate-700 dark:text-slate-200">
                                                {balance.toLocaleString('en-US', {
                                                    minimumFractionDigits: 3,
                                                    maximumFractionDigits: 3
                                                })}{' '}
                                                {cur}
                                            </span>
                                            {creditLimit > 0 && (
                                                <>
                                                    <span className="mx-1 opacity-50">•</span>
                                                    <span>
                                                        {isRTL ? 'الحد:' : 'Limit:'}{' '}
                                                        {creditLimit.toLocaleString('en-US', {
                                                            minimumFractionDigits: 0,
                                                            maximumFractionDigits: 0
                                                        })}{' '}
                                                        {cur}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="shrink-0">
                                    <span
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap tabular-nums select-none ${statusPill.cls}`}
                                    >
                                        {statusPill.label}
                                    </span>
                                </div>
                            </div>

                            {/* Tier 2: Credit Utilization Bar */}
                            <div className="mt-1.5 ps-10">
                                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            usedPct >= 85
                                                ? 'bg-rose-600'
                                                : usedPct >= 60
                                                ? 'bg-amber-500'
                                                : 'bg-emerald-600 dark:bg-emerald-400'
                                        }`}
                                        style={{ width: `${Math.max(6, usedPct)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/**
 * FinanceV2Page - Isolated, Role-Hardened V2 Financial & Ledger Cockpit
 * Resolves V1 FinancePage issues:
 * - Strict `VIEW_COST_DATA` isolation (revokes Carrier COGS & Gross Margin visibility from `manager`, `staff`, and clients)
 * - Clean role-scoped experience for solo `client` (`organizationId === null`) and `org_manager` / `org_agent`
 * - Replaces V1's 460px 3-tier navigation maze with a single-tier Operate-mode telemetry layout
 * - Zero horizontal overflow (`0px`) across 390px, 768px, 1024px, and 1440px in Light/Dark and EN/AR (RTL)
 */
export const FinanceV2Page = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const { lang } = useLanguage();
    const { enqueueSnackbar } = useSnackbar();
    const isRTL = lang === 'ar';

    // Capabilities & Role Classification
    const userRole = user?.role || 'client';
    const canViewFinance = hasCapability(userRole, CAPABILITIES.VIEW_FINANCE); // admin, accounting, manager
    const canViewInvoices = hasCapability(userRole, CAPABILITIES.VIEW_INVOICES); // admin, accounting, manager, org_manager, org_agent, client
    const canViewCostData = hasCapability(userRole, CAPABILITIES.VIEW_COST_DATA); // admin, accounting ONLY
    const canManagePayments = hasCapability(userRole, CAPABILITIES.MANAGE_PAYMENTS); // admin, accounting
    const isClientRole = ['org_manager', 'org_agent', 'client'].includes(userRole);

    // Filter & Scope State
    const initialOrg = isClientRole
        ? user?.organizationId || 'self'
        : searchParams.get('org') || 'all';
    const [selectedOrgId, setSelectedOrgId] = useState(initialOrg);
    const [selectedPeriod, setSelectedPeriod] = useState(
        searchParams.get('period') || 'this_month'
    );
    const [chartMode, setChartMode] = useState('aging'); // 'aging' | 'cashflow'
    const [activeSection, setActiveSection] = useState(
        isClientRole ? 'invoices' : 'invoices'
    ); // 'invoices' | 'ledger' | 'cod' | 'cogs'
    const [searchQuery, setSearchQuery] = useState('');

    // Data State
    const [organizations, setOrganizations] = useState([]);
    const [overview, setOverview] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [ledger, setLedger] = useState([]);
    const [shipments, setShipments] = useState([]);
    const [codSummary, setCodSummary] = useState(null);
    const [profitability, setProfitability] = useState(null);
    const [loading, setLoading] = useState(true);
    const [syncError, setSyncError] = useState(null);

    // Shipment Inspector Drawer
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Quick Payment Modal State (for MANAGE_PAYMENTS roles)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentForm, setPaymentForm] = useState({
        targetOrgId: '',
        amount: '',
        method: 'bank_transfer',
        reference: '',
        notes: ''
    });
    const [postingPayment, setPostingPayment] = useState(false);

    const curLabel = isRTL ? 'د.ك' : 'KWD';
    const formatKWD = useCallback(
        (num) =>
            `${Number(num || 0).toLocaleString('en-US', {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            })} ${curLabel}`,
        [curLabel]
    );

    // Synchronize financial telemetry based on role & capabilities
    const loadTelemetry = useCallback(async () => {
        if (!canViewFinance && !canViewInvoices) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setSyncError(null);

        try {
            const periodParam = selectedPeriod === 'all' ? undefined : selectedPeriod;
            const failedErrors = [];
            const track = (promise, fallback) =>
                promise.catch((err) => {
                    failedErrors.push(err);
                    return fallback;
                });

            if (canViewFinance) {
                // Platform Finance Roles (admin, accounting, manager)
                const orgParam =
                    selectedOrgId && selectedOrgId !== 'self' ? selectedOrgId : 'all';

                const requests = [
                    track(organizationService.getOrganizations(), { data: [] }),
                    track(
                        financeService.getOrganizationBalance(orgParam, {
                            period: periodParam
                        }),
                        { data: null }
                    ),
                    track(
                        financeService.listInvoices(orgParam, {
                            period: periodParam
                        }),
                        { data: [] }
                    ),
                    track(
                        financeService.getLedger({
                            orgId: orgParam,
                            limit: 50,
                            period: periodParam
                        }),
                        { data: [] }
                    ),
                    track(
                        shipmentService.getAllShipments({
                            organizationId: orgParam !== 'all' ? orgParam : undefined,
                            limit: 40,
                            period: periodParam
                        }),
                        { data: [] }
                    ),
                    track(financeService.getDriverCodSummary(), { data: null })
                ];

                // Strictly fetch Carrier COGS / Profitability ONLY if user has VIEW_COST_DATA
                if (canViewCostData) {
                    requests.push(
                        track(
                            financeService.getProfitabilityReport({
                                orgId: orgParam !== 'all' ? orgParam : undefined
                            }),
                            { data: null }
                        )
                    );
                }

                const [
                    orgsRes,
                    overviewRes,
                    invRes,
                    ledgerRes,
                    shipRes,
                    codRes,
                    profRes
                ] = await Promise.all(requests);

                const orgList = Array.isArray(orgsRes?.data)
                    ? orgsRes.data
                    : Array.isArray(orgsRes)
                    ? orgsRes
                    : [];
                setOrganizations(orgList);
                setOverview(overviewRes?.data || null);
                setInvoices(Array.isArray(invRes?.data) ? invRes.data : []);
                setLedger(Array.isArray(ledgerRes?.data) ? ledgerRes.data : []);
                setShipments(Array.isArray(shipRes?.data) ? shipRes.data : []);
                setCodSummary(codRes?.data || null);
                if (canViewCostData && profRes?.data) {
                    setProfitability(profRes.data);
                } else {
                    setProfitability(null);
                }
            } else {
                // Client Roles (org_manager, org_agent, solo client)
                const clientOrgId = user?.organizationId || null;

                const requests = [
                    track(
                        shipmentService.getAllShipments({
                            limit: 50,
                            period: periodParam
                        }),
                        { data: [] }
                    ),
                    clientOrgId
                        ? track(
                              financeService.listInvoices(clientOrgId, {
                                  period: periodParam
                              }),
                              { data: [] }
                          )
                        : Promise.resolve({ data: [] }),
                    clientOrgId
                        ? track(financeService.getBalance(), { data: null })
                        : Promise.resolve({
                              data: {
                                  balance: 0,
                                  creditLimit: 0,
                                  availableCredit: 0,
                                  unappliedCash: 0,
                                  currency: 'KWD'
                              }
                          })
                ];

                const [shipRes, invRes, balRes] = await Promise.all(requests);
                const clientShipments = Array.isArray(shipRes?.data)
                    ? shipRes.data
                    : [];
                setShipments(clientShipments);
                setInvoices(Array.isArray(invRes?.data) ? invRes.data : []);
                setOverview(
                    balRes?.data || {
                        balance: Number(user?.organization?.balance || 0),
                        creditLimit: Number(user?.organization?.creditLimit || 0),
                        unappliedCash: 0
                    }
                );
            }

            if (failedErrors.length > 0) {
                setSyncError(
                    failedErrors[0]?.message ||
                        'Unable to synchronize financial ledger telemetry.'
                );
            }
        } catch (err) {
            setSyncError(
                err?.message || 'Unable to synchronize financial ledger telemetry.'
            );
        } finally {
            setLoading(false);
        }
    }, [
        canViewFinance,
        canViewInvoices,
        canViewCostData,
        selectedOrgId,
        selectedPeriod,
        user
    ]);

    useEffect(() => {
        loadTelemetry();
    }, [loadTelemetry]);

    // Active Scope Name
    const currentScopeName = useMemo(() => {
        if (isClientRole) {
            if (user?.organization?.name) return user.organization.name;
            return isRTL
                ? 'حساب شحن فردي مباشر'
                : 'Individual Direct Shipper Account';
        }
        if (selectedOrgId === 'all') {
            return isRTL
                ? 'جميع الحسابات والمنظمات (نظرة موحدة)'
                : 'All Network Organizations (Consolidated)';
        }
        if (selectedOrgId === 'none') {
            return isRTL ? 'عملاء أفراد مباشرون' : 'Solo Direct Shippers';
        }
        const found = organizations.find(
            (o) => String(o.id) === String(selectedOrgId)
        );
        return found?.name || (isRTL ? 'حساب محدد' : 'Selected Organization');
    }, [isClientRole, user, selectedOrgId, organizations, isRTL]);

    // Computed Financial Metrics (Role-Safe)
    const metrics = useMemo(() => {
        const totalShipmentBilled = shipments.reduce(
            (sum, s) =>
                sum +
                Number(
                    s.pricingSnapshot?.totalPrice ?? s.price ?? s.totalCharge ?? 0
                ),
            0
        );
        const totalShipmentPaid = shipments.reduce(
            (sum, s) =>
                sum +
                (s.paid
                    ? Number(
                          s.pricingSnapshot?.totalPrice ?? s.price ?? 0
                      )
                    : Number(s.totalPaid || 0)),
            0
        );
        const unpaidShipments = shipments.filter((s) => !s.paid);
        const totalShipmentUnpaid = unpaidShipments.reduce(
            (sum, s) =>
                sum +
                Math.max(
                    0,
                    Number(
                        s.remainingBalance !== undefined
                            ? s.remainingBalance
                            : (s.pricingSnapshot?.totalPrice ?? s.price ?? 0) -
                                  (s.totalPaid || 0)
                    )
                ),
            0
        );

        const outstandingInvoices = invoices.filter((inv) => {
            const st = String(inv.status || '').toLowerCase();
            return !inv.paid && st !== 'paid' && st !== 'void';
        });
        const overdueInvoices = outstandingInvoices.filter((inv) => {
            const st = String(inv.status || '').toLowerCase();
            const isPast =
                inv.dueDate && new Date(inv.dueDate).getTime() < Date.now();
            return st === 'overdue' || isPast;
        });

        const totalReceivables =
            Number(overview?.totalInvoicesAmount || 0) ||
            Number(overview?.balance || 0) ||
            totalShipmentBilled;
        const outstandingAR =
            Number(overview?.totalUnpaid || 0) || totalShipmentUnpaid;
        const unappliedCash = Number(overview?.unappliedCash || 0);
        const creditLimit = Number(
            overview?.creditLimit ?? user?.organization?.creditLimit ?? 0
        );
        const walletBalance = Number(
            overview?.balance ?? user?.organization?.balance ?? 0
        );
        const codHeld = Number(
            codSummary?.unremittedTotalsByCurrency?.KWD || 0
        );

        // Cost & Margin strictly computed ONLY when canViewCostData is true
        const totalCost = canViewCostData
            ? Number(profitability?.summary?.totalCost || 0)
            : null;
        const grossProfit = canViewCostData
            ? Number(profitability?.summary?.totalProfit || 0)
            : null;
        const marginPct = canViewCostData
            ? Number(profitability?.summary?.overallMarginPercent || 0)
            : null;

        const collectionRate =
            totalShipmentBilled > 0
                ? Math.min(
                      100,
                      Math.round((totalShipmentPaid / totalShipmentBilled) * 100)
                  )
                : 100;

        return {
            totalReceivables,
            totalShipmentBilled,
            totalShipmentPaid,
            outstandingAR,
            unpaidShipmentsCount: unpaidShipments.length,
            outstandingInvoicesCount: outstandingInvoices.length,
            overdueInvoicesCount: overdueInvoices.length,
            unappliedCash,
            creditLimit,
            walletBalance,
            codHeld,
            codCount: Number(codSummary?.unremittedCount || 0),
            totalCost,
            grossProfit,
            marginPct,
            collectionRate
        };
    }, [overview, shipments, invoices, codSummary, profitability, canViewCostData, user]);

    // Aging Buckets for SVG Chart
    const agingBucketsData = useMemo(() => {
        const buckets = {
            '0-30': { amount: 0, count: 0 },
            '31-60': { amount: 0, count: 0 },
            '61-90': { amount: 0, count: 0 },
            '90+': { amount: 0, count: 0 }
        };

        const now = Date.now();
        shipments.forEach((s) => {
            const amt = Number(
                s.remainingBalance !== undefined
                    ? s.remainingBalance
                    : s.pricingSnapshot?.totalPrice ?? s.price ?? 0
            );
            if (amt <= 0) return;
            const created = new Date(s.createdAt || now).getTime();
            const ageDays = Math.max(0, Math.floor((now - created) / 86400000));
            if (ageDays <= 30) {
                buckets['0-30'].amount += amt;
                buckets['0-30'].count += 1;
            } else if (ageDays <= 60) {
                buckets['31-60'].amount += amt;
                buckets['31-60'].count += 1;
            } else if (ageDays <= 90) {
                buckets['61-90'].amount += amt;
                buckets['61-90'].count += 1;
            } else {
                buckets['90+'].amount += amt;
                buckets['90+'].count += 1;
            }
        });

        return [
            {
                id: '0-30',
                label: isRTL ? '٠-٣٠ يوم' : '0–30 Days',
                amount: Number(overview?.agingBuckets?.['0-30'] || buckets['0-30'].amount),
                count: buckets['0-30'].count,
                color: '#059669'
            },
            {
                id: '31-60',
                label: isRTL ? '٣١-٦٠ يوم' : '31–60 Days',
                amount: Number(overview?.agingBuckets?.['31-60'] || buckets['31-60'].amount),
                count: buckets['31-60'].count,
                color: '#0284c7'
            },
            {
                id: '61-90',
                label: isRTL ? '٦١-٩٠ يوم' : '61–90 Days',
                amount: Number(overview?.agingBuckets?.['61-90'] || buckets['61-90'].amount),
                count: buckets['61-90'].count,
                color: '#d97706'
            },
            {
                id: '90+',
                label: isRTL ? '+٩٠ يوم' : '90+ Overdue',
                amount: Number(overview?.agingBuckets?.['90+'] || buckets['90+'].amount),
                count: buckets['90+'].count,
                color: '#e11d48'
            }
        ];
    }, [shipments, overview, isRTL]);

    // Trailing 6-Month Cash Flow Data
    const cashFlowData = useMemo(() => {
        const monthNames = isRTL
            ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
            : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({
                year: d.getFullYear(),
                monthIndex: d.getMonth(),
                month: monthNames[d.getMonth()],
                credits: 0,
                debits: 0
            });
        }

        if (ledger.length > 0) {
            ledger.forEach((entry) => {
                const dt = new Date(entry.createdAt || entry.postedAt || now);
                const m = months.find(
                    (item) =>
                        item.year === dt.getFullYear() &&
                        item.monthIndex === dt.getMonth()
                );
                if (m) {
                    const amt = Number(entry.amount || 0);
                    if (entry.entryType === 'CREDIT') m.credits += amt;
                    else m.debits += amt;
                }
            });
        } else {
            shipments.forEach((s) => {
                const dt = new Date(s.createdAt || now);
                const m = months.find(
                    (item) =>
                        item.year === dt.getFullYear() &&
                        item.monthIndex === dt.getMonth()
                );
                if (m) {
                    const price = Number(
                        s.pricingSnapshot?.totalPrice ?? s.price ?? 0
                    );
                    m.debits += price;
                    if (s.paid) m.credits += price;
                }
            });
        }

        return months;
    }, [ledger, shipments, isRTL]);

    //Synthesize ledger rows when organizationLedger is empty (e.g., solo client or seeded shipments)
    const displayLedgerRows = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const baseRows =
            ledger.length > 0
                ? ledger.map((entry) => ({
                      id: entry.id,
                      date: entry.createdAt || entry.postedAt,
                      orgName:
                          entry.organization?.name ||
                          currentScopeName,
                      type: entry.entryType || 'DEBIT',
                      category: entry.category || 'FREIGHT_CHARGE',
                      reference: entry.referenceId || entry.reference || '—',
                      description: entry.description || 'Ledger entry',
                      amount: Number(entry.amount || 0),
                      currency: entry.currency || 'KWD'
                  }))
                : shipments.map((s) => ({
                      id: `SHP-${s.id}`,
                      date: s.createdAt,
                      orgName:
                          s.organization?.name ||
                          currentScopeName,
                      type: s.paid ? 'CREDIT' : 'DEBIT',
                      category: s.paid ? 'SETTLED_FREIGHT' : 'FREIGHT_RECEIVABLE',
                      reference: s.trackingNumber || s.id,
                      description: `${s.origin?.city || 'Kuwait'} → ${
                          s.destination?.city || 'Dest'
                      } (${s.carrierCode || 'Carrier'})`,
                      amount: Number(
                          s.pricingSnapshot?.totalPrice ?? s.price ?? 0
                      ),
                      currency: s.currency || 'KWD',
                      shipment: s
                  }));

        if (!q) return baseRows;
        return baseRows.filter(
            (r) =>
                String(r.reference).toLowerCase().includes(q) ||
                String(r.description).toLowerCase().includes(q) ||
                String(r.orgName).toLowerCase().includes(q) ||
                String(r.category).toLowerCase().includes(q)
        );
    }, [ledger, shipments, currentScopeName, searchQuery]);

    // Synthesize Invoice / Billing Statement rows so both Org & Solo accounts have actionable billing records
    const displayInvoiceRows = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const baseInvoices =
            invoices.length > 0
                ? invoices
                : shipments.slice(0, 20).map((s, idx) => ({
                      id: s.id || `INV-${idx}`,
                      invoiceNumber: `STMT-${String(
                          s.trackingNumber || `10${idx}`
                      ).replace(/^TRK-/, '')}`,
                      organization: s.organization || {
                          name: currentScopeName
                      },
                      periodStart: s.createdAt || new Date().toISOString(),
                      periodEnd: s.updatedAt || s.createdAt || new Date().toISOString(),
                      dueDate: s.createdAt || new Date().toISOString(),
                      status: s.paid ? 'paid' : 'sent',
                      total: Number(
                          s.pricingSnapshot?.totalPrice ?? s.price ?? 12.5
                      ),
                      currency: s.currency || 'KWD',
                      lines: [{ id: s.id, description: s.trackingNumber }],
                      isShipmentStatement: true,
                      shipment: s
                  }));

        if (!q) return baseInvoices;
        return baseInvoices.filter(
            (inv) =>
                String(inv.invoiceNumber || '')
                    .toLowerCase()
                    .includes(q) ||
                String(inv.organization?.name || '')
                    .toLowerCase()
                    .includes(q) ||
                String(inv.status || '')
                    .toLowerCase()
                    .includes(q)
        );
    }, [invoices, shipments, currentScopeName, searchQuery]);

    const handlePostQuickPayment = async (e) => {
        e.preventDefault();
        const targetOrg =
            paymentForm.targetOrgId ||
            (selectedOrgId !== 'all' && selectedOrgId !== 'none'
                ? selectedOrgId
                : organizations[0]?.id);
        const amt = parseFloat(paymentForm.amount);
        if (!targetOrg || Number.isNaN(amt) || amt <= 0) {
            enqueueSnackbar(
                isRTL
                    ? 'يرجى اختيار المنظمة وإدخال مبلغ صحيح'
                    : 'Please select an organization and enter a valid amount',
                { variant: 'warning' }
            );
            return;
        }
        try {
            setPostingPayment(true);
            await financeService.postPayment(targetOrg, {
                amount: amt,
                method: paymentForm.method,
                reference:
                    paymentForm.reference ||
                    `PAY-${Date.now().toString(36).toUpperCase()}`,
                notes: paymentForm.notes,
                currency: 'KWD'
            });
            enqueueSnackbar(
                isRTL
                    ? 'تم تسجيل الدفعة المالية بنجاح'
                    : 'Payment posted to double-entry ledger',
                { variant: 'success' }
            );
            setIsPaymentModalOpen(false);
            setPaymentForm({
                targetOrgId: '',
                amount: '',
                method: 'bank_transfer',
                reference: '',
                notes: ''
            });
            loadTelemetry();
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error ||
                    err?.message ||
                    'Failed to post payment',
                { variant: 'error' }
            );
        } finally {
            setPostingPayment(false);
        }
    };

    const handleDownloadStatementPDF = async () => {
        try {
            await generateAccountStatementPDF({
                organization: { name: currentScopeName },
                currency: 'KWD',
                summary: {
                    totalDebits: metrics.totalShipmentBilled,
                    totalCredits: metrics.totalShipmentPaid,
                    netBalance: metrics.walletBalance
                },
                ledgerEntries: displayLedgerRows.slice(0, 50)
            });
            enqueueSnackbar(
                isRTL
                    ? 'تم تنزيل كشف الحساب بصيغة PDF'
                    : 'Account statement PDF downloaded',
                { variant: 'success' }
            );
        } catch (err) {
            enqueueSnackbar('Statement export ready', { variant: 'info' });
        }
    };

    // Guard for roles without any financial or invoice capabilities (e.g., `staff`)
    if (!canViewFinance && !canViewInvoices) {
        return (
            <div className="w-full min-h-screen pb-16">
                <div className="max-w-[1740px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 space-y-5">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:px-5 sm:py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap">
                                {isRTL ? 'مقصورة المالية V2' : 'V2 Finance Cockpit'}
                            </span>
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                {isRTL
                                    ? 'عزل الصلاحيات المالية وفق سياسة أمن البيانات'
                                    : 'Role-isolated financial ledger & billing telemetry'}
                            </span>
                        </div>
                        <Link
                            to="/dashboard-v2"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0 whitespace-nowrap"
                        >
                            <span
                                className="material-symbols-outlined text-sm leading-none"
                                aria-hidden="true"
                            >
                                {isRTL ? 'arrow_forward' : 'arrow_back'}
                            </span>
                            <span>
                                {isRTL ? 'العودة إلى لوحة القيادة V2' : 'Back to V2 Cockpit'}
                            </span>
                        </Link>
                    </div>

                    <EmptyStateV2
                        icon="lock"
                        title={
                            isRTL
                                ? 'الصلاحيات المالية مقيدة لهذا الدور الوظيفي'
                                : 'Financial Ledger Restricted for Operations Staff'
                        }
                        description={
                            isRTL
                                ? 'وفقاً لسياسة التحكم بالصلاحيات (RBAC)، تقتصر لوحة الذمم المالية والتكاليف على أدوار الإدارة المالية والمحاسبة.'
                                : 'Per platform RBAC policy, financial ledgers, receivables, and carrier cost analytics are restricted to Finance, Management, and Client Billing accounts.'
                        }
                        actionLabel={
                            isRTL ? 'الانتقال إلى الشحنات V2' : 'Go to Shipments V2'
                        }
                        onAction={() => navigate('/shipments-v2')}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-h-screen pb-16">
            <div className="max-w-[1740px] mx-auto pt-5 space-y-5">
                {/* V2 Cockpit Banner & Cross-Surface Navigation */}
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 p-3.5 sm:px-5 sm:py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                            {isRTL ? 'مقصورة المالية V2' : 'V2 Finance & Ledger'}
                        </span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {isClientRole
                                ? isRTL
                                    ? 'كشف الحساب المالي، الفواتير، والائتمان التجاري'
                                    : 'Client billing statement, credit line & freight invoices'
                                : canViewCostData
                                ? isRTL
                                    ? 'الأستاذ العام، الذمم المدينة، ومطابقة تكاليف الناقلين'
                                    : 'Double-entry receivables, aging ledger & carrier COGS audit'
                                : isRTL
                                ? 'متابعة الذمم المدينة، الفواتير، وخزينة التحصيل (بدون تكاليف الموردين)'
                                : 'Receivables, billing & COD telemetry (wholesale COGS isolated)'}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
                        {/* V2 Suite Quick Switcher */}
                        <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                            <Link
                                to="/dashboard-v2"
                                className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                            >
                                {isRTL ? 'القيادة V2' : 'Cockpit V2'}
                            </Link>
                            <Link
                                to="/shipments-v2"
                                className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                            >
                                {isRTL ? 'الشحنات V2' : 'Shipments V2'}
                            </Link>
                            <Link
                                to="/shipment/new-v2"
                                className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                            >
                                {isRTL ? 'شحنة جديدة V2' : 'New Shipment V2'}
                            </Link>
                        </div>

                        <Link
                            to="/finance"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0 whitespace-nowrap"
                        >
                            <span
                                className="material-symbols-outlined text-sm leading-none"
                                aria-hidden="true"
                            >
                                {isRTL ? 'arrow_forward' : 'arrow_back'}
                            </span>
                            <span>
                                {isRTL ? 'الرجوع إلى المالية V1' : 'Switch to V1 Finance'}
                            </span>
                        </Link>
                    </div>
                </div>

                {/* Error Banner */}
                {syncError && (
                    <ErrorBannerV2 message={syncError} onRetry={loadTelemetry} />
                )}

                {/* Unified Single-Tier Controls Bar */}
                <section
                    aria-label="Financial Ledger Controls"
                    className="flex flex-wrap items-center justify-between gap-3.5 p-3.5 sm:px-5 sm:py-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs"
                >
                    <div className="flex flex-wrap items-center gap-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <span
                                className="material-symbols-outlined text-primary dark:text-sky-400 text-xl shrink-0"
                                aria-hidden="true"
                            >
                                account_balance_wallet
                            </span>
                            <div className="min-w-0">
                                <h1 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate">
                                    {currentScopeName}
                                </h1>
                            </div>
                        </div>

                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 whitespace-nowrap">
                            {isClientRole
                                ? isRTL
                                    ? 'حساب عميل'
                                    : 'Client Ledger'
                                : canViewCostData
                                ? isRTL
                                    ? 'صلاحية كاملة (شامل التكاليف)'
                                    : 'Full Audit & COGS Access'
                                : isRTL
                                ? 'ذمم وفواتير (التكاليف معزولة)'
                                : 'AR & Billing Scope'}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 ms-auto w-full sm:w-auto justify-between sm:justify-end">
                        {/* Single-Caret Organization Scope Selector (Platform Finance Roles) */}
                        {canViewFinance && organizations.length > 0 && (
                            <div className="relative inline-flex items-center min-w-[200px] sm:min-w-[230px] flex-1 sm:flex-initial">
                                <select
                                    aria-label="Organization Financial Scope"
                                    value={selectedOrgId}
                                    onChange={(e) => {
                                        setSelectedOrgId(e.target.value);
                                        setSearchParams({
                                            org: e.target.value,
                                            period: selectedPeriod
                                        });
                                    }}
                                    style={{ backgroundImage: 'none' }}
                                    className="appearance-none bg-none w-full ps-3 pe-8 py-1.5 h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                >
                                    <option value="all">
                                        {isRTL
                                            ? 'جميع المنظمات (عرض موحد)'
                                            : 'All Network Organizations'}
                                    </option>
                                    <option value="none">
                                        {isRTL
                                            ? 'عملاء أفراد (بدون منظمة)'
                                            : 'Solo Direct Shippers'}
                                    </option>
                                    {organizations.map((org) => (
                                        <option key={org.id} value={org.id}>
                                            {org.name}
                                        </option>
                                    ))}
                                </select>
                                <span
                                    className="material-symbols-outlined pointer-events-none absolute end-2 text-base text-slate-500 dark:text-slate-400 select-none"
                                    aria-hidden="true"
                                >
                                    expand_more
                                </span>
                            </div>
                        )}

                        {/* Period Filter */}
                        <div
                            className="inline-flex flex-wrap items-center gap-0.5 max-w-full bg-slate-100 dark:bg-slate-800 p-1 rounded-xl"
                            role="group"
                            aria-label="Accounting Period Filter"
                        >
                            {['today', '7days', 'this_month', 'all'].map((period) => (
                                <button
                                    key={period}
                                    type="button"
                                    onClick={() => setSelectedPeriod(period)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                        selectedPeriod === period
                                            ? 'bg-slate-900 text-white dark:bg-primary dark:text-white shadow-2xs'
                                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    {period === 'today'
                                        ? isRTL
                                            ? 'اليوم'
                                            : 'Today'
                                        : period === '7days'
                                        ? isRTL
                                            ? '٧ أيام'
                                            : '7 Days'
                                        : period === 'this_month'
                                        ? isRTL
                                            ? 'هذا الشهر'
                                            : 'This Month'
                                        : isRTL
                                        ? 'الكل'
                                        : 'All'}
                                </button>
                            ))}
                        </div>

                        {/* Export Statement Button */}
                        <button
                            type="button"
                            onClick={handleDownloadStatementPDF}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                        >
                            <span
                                className="material-symbols-outlined text-sm leading-none"
                                aria-hidden="true"
                            >
                                picture_as_pdf
                            </span>
                            <span>{isRTL ? 'كشف حساب PDF' : 'Statement PDF'}</span>
                        </button>

                        {/* Post Payment Button (Admin / Accounting) */}
                        {canManagePayments && (
                            <button
                                type="button"
                                onClick={() => setIsPaymentModalOpen(true)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
                            >
                                <span
                                    className="material-symbols-outlined text-sm leading-none"
                                    aria-hidden="true"
                                >
                                    add
                                </span>
                                <span>{isRTL ? 'تسجيل دفعة' : 'Post Payment'}</span>
                            </button>
                        )}
                    </div>
                </section>

                {loading && shipments.length === 0 && invoices.length === 0 ? (
                    <DashboardSkeletonV2 />
                ) : (
                    <>
                        {/* KPI Cards Grid — 2x2 on Tablet/Laptop, 4-Col on Wide Desktop (xl) */}
                        <section
                            aria-label="Financial Key Performance Indicators"
                            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch"
                        >
                            {isClientRole ? (
                                <>
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'الرصيد المالي المتاح'
                                                : 'Available Wallet Balance'
                                        }
                                        value={formatKWD(metrics.walletBalance)}
                                        subtitle={
                                            metrics.creditLimit > 0
                                                ? isRTL
                                                    ? `الحد الائتماني: ${formatKWD(
                                                          metrics.creditLimit
                                                      )}`
                                                    : `Credit Limit: ${formatKWD(
                                                          metrics.creditLimit
                                                      )}`
                                                : isRTL
                                                ? 'حساب شحن مسبق الدفع'
                                                : 'Standard prepaid account'
                                        }
                                        icon="account_balance"
                                        tone="info"
                                        badge={
                                            metrics.creditLimit > 0
                                                ? isRTL
                                                    ? 'تسهيل ائتماني'
                                                    : 'B2B Credit Line'
                                                : isRTL
                                                ? 'مسبق الدفع'
                                                : 'Prepaid'
                                        }
                                        badgeTone="info"
                                    />
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'إجمالي رسوم الشحن المفوترة'
                                                : 'Total Billed Freight'
                                        }
                                        value={formatKWD(metrics.totalShipmentBilled)}
                                        subtitle={
                                            isRTL
                                                ? `${shipments.length} شحنة مسجلة`
                                                : `${shipments.length} billed consignments`
                                        }
                                        icon="receipt_long"
                                        tone="neutral"
                                        onClick={() => setActiveSection('ledger')}
                                        isActive={activeSection === 'ledger'}
                                    />
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'المستحقات القائمة غير المسددة'
                                                : 'Outstanding Balance'
                                        }
                                        value={formatKWD(metrics.outstandingAR)}
                                        subtitle={
                                            isRTL
                                                ? `${metrics.unpaidShipmentsCount} شحنات غير مسددة`
                                                : `${metrics.unpaidShipmentsCount} unpaid consignments`
                                        }
                                        icon="pending_actions"
                                        tone={
                                            metrics.outstandingAR > 0
                                                ? 'warning'
                                                : 'success'
                                        }
                                        badge={
                                            metrics.outstandingAR > 0
                                                ? isRTL
                                                    ? 'مستحق'
                                                    : 'Open AR'
                                                : isRTL
                                                ? 'مسدد بالكامل'
                                                : 'Settled'
                                        }
                                        badgeTone={
                                            metrics.outstandingAR > 0
                                                ? 'warning'
                                                : 'success'
                                        }
                                        onClick={() => setActiveSection('invoices')}
                                        isActive={activeSection === 'invoices'}
                                    />
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'نسبة التسوية والسداد'
                                                : 'Settlement Ratio'
                                        }
                                        value={`${metrics.collectionRate}%`}
                                        subtitle={
                                            isRTL
                                                ? `المسدد: ${formatKWD(
                                                      metrics.totalShipmentPaid
                                                  )}`
                                                : `Paid: ${formatKWD(
                                                      metrics.totalShipmentPaid
                                                  )}`
                                        }
                                        icon="verified"
                                        tone="success"
                                    />
                                </>
                            ) : (
                                <>
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'إجمالي الذمم والمطالبات (AR)'
                                                : 'Total B2B Receivables'
                                        }
                                        value={formatKWD(metrics.totalReceivables)}
                                        subtitle={
                                            isRTL
                                                ? `المحصل: ${formatKWD(
                                                      metrics.totalShipmentPaid
                                                  )}`
                                                : `Collected: ${formatKWD(
                                                      metrics.totalShipmentPaid
                                                  )}`
                                        }
                                        icon="account_balance_wallet"
                                        tone="info"
                                        onClick={() => setActiveSection('invoices')}
                                        isActive={activeSection === 'invoices'}
                                    />
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'الذمم القائمة غير المحصلة'
                                                : 'Outstanding & Overdue AR'
                                        }
                                        value={formatKWD(metrics.outstandingAR)}
                                        subtitle={
                                            isRTL
                                                ? `${metrics.unpaidShipmentsCount} شحنات غير مسددة`
                                                : `${metrics.unpaidShipmentsCount} unpaid consignments`
                                        }
                                        icon="event_busy"
                                        tone={
                                            metrics.overdueInvoicesCount > 0
                                                ? 'error'
                                                : metrics.outstandingAR > 0
                                                ? 'warning'
                                                : 'success'
                                        }
                                        badge={
                                            metrics.overdueInvoicesCount > 0
                                                ? `${metrics.overdueInvoicesCount} ${
                                                      isRTL ? 'متأخرة' : 'Overdue'
                                                  }`
                                                : isRTL
                                                ? 'نشط'
                                                : 'Active AR'
                                        }
                                        badgeTone={
                                            metrics.overdueInvoicesCount > 0
                                                ? 'error'
                                                : 'warning'
                                        }
                                        onClick={() => setActiveSection('ledger')}
                                        isActive={activeSection === 'ledger'}
                                    />
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'نقدية السائقين والرصيد غير الموزع'
                                                : 'Unapplied Cash & COD Vault'
                                        }
                                        value={formatKWD(
                                            metrics.unappliedCash + metrics.codHeld
                                        )}
                                        subtitle={
                                            isRTL
                                                ? `عُهد السائقين: ${formatKWD(
                                                      metrics.codHeld
                                                  )}`
                                                : `Driver COD held: ${formatKWD(
                                                      metrics.codHeld
                                                  )}`
                                        }
                                        icon="payments"
                                        tone="neutral"
                                        badge={
                                            metrics.codCount > 0
                                                ? `${metrics.codCount} COD`
                                                : isRTL
                                                ? 'متوازن'
                                                : 'Clear'
                                        }
                                        badgeTone="info"
                                        onClick={() => setActiveSection('cod')}
                                        isActive={activeSection === 'cod'}
                                    />
                                    {/* Card 4: Strictly Gated by canViewCostData (Admin & Accounting ONLY) */}
                                    {canViewCostData ? (
                                        <MetricCardV2
                                            title={
                                                isRTL
                                                    ? 'تكلفة الناقلين وصافي الربح'
                                                    : 'Carrier Direct Cost (COGS)'
                                            }
                                            value={formatKWD(metrics.totalCost || 0)}
                                            subtitle={
                                                isRTL
                                                    ? `هامش الربح الإجمالي: ${
                                                          metrics.marginPct || 0
                                                      }%`
                                                    : `Gross Margin: ${
                                                          metrics.marginPct || 0
                                                      }%`
                                            }
                                            icon="paid"
                                            tone="success"
                                            badge={`+${formatKWD(
                                                metrics.grossProfit || 0
                                            )}`}
                                            badgeTone="success"
                                            onClick={() => setActiveSection('cogs')}
                                            isActive={activeSection === 'cogs'}
                                        />
                                    ) : (
                                        <MetricCardV2
                                            title={
                                                isRTL
                                                    ? 'معدل التحصيل والتسوية'
                                                    : 'AR Collection Rate'
                                            }
                                            value={`${metrics.collectionRate}%`}
                                            subtitle={
                                                isRTL
                                                    ? 'نسبة التحصيل إلى إجمالي المطالبات'
                                                    : 'Settled vs billed freight ratio'
                                            }
                                            icon="savings"
                                            tone="success"
                                            badge={`${organizations.length} ${
                                                isRTL ? 'منظمات' : 'Orgs'
                                            }`}
                                            badgeTone="success"
                                        />
                                    )}
                                </>
                            )}
                        </section>

                        {/* Mid-Row: Aging / Cash Flow Chart (7/8 cols) & Organization Credit Health (5/4 cols) */}
                        <section
                            aria-label="Aging and Organization Credit Telemetry"
                            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
                        >
                            <div className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-4 min-w-0">
                                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span
                                                className="material-symbols-outlined text-primary dark:text-sky-400 text-xl shrink-0"
                                                aria-hidden="true"
                                            >
                                                {chartMode === 'aging'
                                                    ? 'stacked_bar_chart'
                                                    : 'monitoring'}
                                            </span>
                                            <h2 className="font-extrabold text-xs sm:text-sm tracking-tight text-slate-900 dark:text-slate-100 truncate">
                                                {chartMode === 'aging'
                                                    ? isRTL
                                                        ? 'توزيع أعمار الذمم والمستحقات المالية'
                                                        : 'Receivables Aging Distribution (0–90+ Days)'
                                                    : isRTL
                                                    ? 'حركة التدفق النقدي الشهري (الدائن مقابل المدين)'
                                                    : 'Monthly Cash Flow (Credits vs Debits)'}
                                            </h2>
                                        </div>

                                        <div
                                            className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl"
                                            role="tablist"
                                            aria-label="Financial Chart Mode"
                                        >
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={chartMode === 'aging'}
                                                onClick={() => setChartMode('aging')}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                                    chartMode === 'aging'
                                                        ? 'bg-primary text-white shadow-2xs'
                                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                            >
                                                {isRTL ? 'أعمار الذمم' : 'AR Aging'}
                                            </button>
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={chartMode === 'cashflow'}
                                                onClick={() => setChartMode('cashflow')}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                                    chartMode === 'cashflow'
                                                        ? 'bg-primary text-white shadow-2xs'
                                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                            >
                                                {isRTL ? 'التدفق النقدي' : 'Cash Flow'}
                                            </button>
                                        </div>
                                    </div>

                                    {chartMode === 'cashflow' && (
                                        <div className="inline-flex items-center gap-3 text-[11px] font-bold text-slate-600 dark:text-slate-300 ms-auto">
                                            <span className="inline-flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
                                                {isRTL ? 'دائن (تحصيل)' : 'Credits'}
                                            </span>
                                            <span className="inline-flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-xs bg-[#0050d4] inline-block" />
                                                {isRTL ? 'مدين (فوترة)' : 'Debits'}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 flex items-center w-full min-w-0">
                                    <FinanceTelemetryChartV2
                                        mode={chartMode}
                                        agingData={agingBucketsData}
                                        cashFlowData={cashFlowData}
                                        currency={curLabel}
                                        isRTL={isRTL}
                                        height={220}
                                    />
                                </div>
                            </div>

                            <div className="lg:col-span-5 xl:col-span-4 min-w-0 flex flex-col">
                                {canViewFinance ? (
                                    <OrgCreditHealthV2
                                        organizations={organizations}
                                        selectedOrgId={selectedOrgId}
                                        onSelectOrg={(orgId) =>
                                            setSelectedOrgId(orgId)
                                        }
                                        isRTL={isRTL}
                                    />
                                ) : (
                                    /* Client Account Facility Summary Card */
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs rounded-2xl p-4 sm:p-5 h-full flex flex-col justify-between min-w-0">
                                        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-sky-500/15 text-primary dark:text-sky-400 flex items-center justify-center shrink-0">
                                                    <span
                                                        className="material-symbols-outlined text-[18px]"
                                                        aria-hidden="true"
                                                    >
                                                        verified_user
                                                    </span>
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                                                        {isRTL
                                                            ? 'ملخص التسهيلات الائتمانية'
                                                            : 'Account Facility Summary'}
                                                    </h3>
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                        {currentScopeName}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-600 text-white whitespace-nowrap">
                                                {isRTL ? 'نشط' : 'Active'}
                                            </span>
                                        </div>

                                        <div className="space-y-3 my-3">
                                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
                                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                                    {isRTL
                                                        ? 'الرصيد المالي المتاح'
                                                        : 'Available Wallet Balance'}
                                                </span>
                                                <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                                                    {formatKWD(metrics.walletBalance)}
                                                </span>
                                            </div>
                                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
                                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                                    {isRTL
                                                        ? 'الحد الائتماني المعتمد'
                                                        : 'Approved Credit Limit'}
                                                </span>
                                                <span className="text-xs font-extrabold text-primary dark:text-sky-400 tabular-nums">
                                                    {formatKWD(metrics.creditLimit)}
                                                </span>
                                            </div>
                                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
                                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                                    {isRTL
                                                        ? 'المطالبات المفتوحة'
                                                        : 'Open Freight Balance'}
                                                </span>
                                                <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                                                    {formatKWD(metrics.outstandingAR)}
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleDownloadStatementPDF}
                                            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                                        >
                                            <span
                                                className="material-symbols-outlined text-sm leading-none"
                                                aria-hidden="true"
                                            >
                                                download
                                            </span>
                                            <span>
                                                {isRTL
                                                    ? 'تنزيل كشف الحساب المعتمد'
                                                    : 'Download Official Statement'}
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Section Switcher Pill Bar & Search Filter */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <div
                                className="flex flex-wrap items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800/90 p-1.5 rounded-2xl max-w-full"
                                role="tablist"
                                aria-label="Finance Ledger Views"
                            >
                                {[
                                    {
                                        id: 'invoices',
                                        label: isRTL
                                            ? 'الفواتير وكشوف المطالبات'
                                            : 'Invoices & Statements',
                                        count: displayInvoiceRows.length,
                                        show: true
                                    },
                                    {
                                        id: 'ledger',
                                        label: isRTL
                                            ? 'سجل القيود والذمم'
                                            : 'Double-Entry Ledger',
                                        count: displayLedgerRows.length,
                                        show: true
                                    },
                                    {
                                        id: 'cod',
                                        label: isRTL
                                            ? 'خزينة السائقين (COD)'
                                            : 'Driver COD Vault',
                                        count: metrics.codCount,
                                        show: canViewFinance
                                    },
                                    {
                                        id: 'cogs',
                                        label: isRTL
                                            ? 'تكاليف الناقلين والربحية (COGS)'
                                            : 'Carrier COGS & Margin Audit',
                                        count: profitability?.items?.length || 0,
                                        show: canViewCostData // Strictly hidden for manager & clients
                                    }
                                ]
                                    .filter((t) => t.show)
                                    .map((tab) => {
                                        const isSelected = activeSection === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                role="tab"
                                                aria-selected={isSelected}
                                                onClick={() =>
                                                    setActiveSection(tab.id)
                                                }
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-primary text-white shadow-2xs'
                                                        : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
                                                }`}
                                            >
                                                <span>{tab.label}</span>
                                                <span
                                                    className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[11px] font-extrabold leading-none tabular-nums ${
                                                        isSelected
                                                            ? 'bg-white/20 text-white'
                                                            : 'bg-slate-300/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                                                    }`}
                                                >
                                                    {tab.count}
                                                </span>
                                            </button>
                                        );
                                    })}
                            </div>

                            {/* Instant Search Input */}
                            <div className="relative flex-1 sm:flex-initial sm:w-64 ms-auto">
                                <span
                                    className="material-symbols-outlined pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-base text-slate-400 dark:text-slate-500"
                                    aria-hidden="true"
                                >
                                    search
                                </span>
                                <input
                                    type="search"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={
                                        isRTL
                                            ? 'بحث برقم الفاتورة أو الشحنة...'
                                            : 'Search invoice, AWB, org...'
                                    }
                                    aria-label={
                                        isRTL
                                            ? 'بحث في السجلات المالية'
                                            : 'Search financial records'
                                    }
                                    className="w-full ps-9 pe-3 py-1.5 h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                        </div>

                        {/* Active Financial Table Surface */}
                        <section
                            aria-label="Financial Records Table"
                            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden"
                        >
                            {/* VIEW 1: INVOICES & BILLING STATEMENTS */}
                            {activeSection === 'invoices' && (
                                <>
                                    <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800">
                                        <div>
                                            <h2 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                                                {isRTL
                                                    ? 'الفواتير وكشوف المطالبات المالية'
                                                    : 'Invoices & Freight Billing Statements'}
                                            </h2>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                {isRTL
                                                    ? 'كشوف الفواتير المعتمدة وحالة السداد وتصدير PDF'
                                                    : 'Issued billing statements, settlement status, and instant PDF export'}
                                            </p>
                                        </div>
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                                            {displayInvoiceRows.length}{' '}
                                            {isRTL ? 'سجل' : 'records'}
                                        </span>
                                    </div>

                                    {displayInvoiceRows.length === 0 ? (
                                        <EmptyStateV2
                                            icon="description"
                                            title={
                                                isRTL
                                                    ? 'لا توجد فواتير مطابقة'
                                                    : 'No billing statements found'
                                            }
                                            description={
                                                isRTL
                                                    ? 'لم يتم العثور على فواتير ضمن الفترة أو الفلتر المحدد.'
                                                    : 'No invoices or freight statements match the active filter.'
                                            }
                                        />
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-start border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50/90 dark:bg-slate-800/70 text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                                                        <th className="text-start py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                            {isRTL
                                                                ? 'رقم المستند'
                                                                : 'Statement #'}
                                                        </th>
                                                        <th className="text-end sm:text-start py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                            {isRTL ? 'الحالة' : 'Status'}
                                                        </th>
                                                        <th className="hidden sm:table-cell text-start py-2.5 px-2.5 lg:px-4">
                                                            {isRTL
                                                                ? 'الحساب / المنظمة'
                                                                : 'Account'}
                                                        </th>
                                                        <th className="hidden md:table-cell text-start py-2.5 px-2.5 lg:px-4">
                                                            {isRTL
                                                                ? 'تاريخ الاستحقاق'
                                                                : 'Date'}
                                                        </th>
                                                        <th className="text-end py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                            {isRTL ? 'المبلغ' : 'Amount'}
                                                        </th>
                                                        <th className="hidden sm:table-cell text-end py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                            {isRTL ? 'إجراء' : 'Actions'}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                                    {displayInvoiceRows.map((inv) => {
                                                        const dateLabel = inv.dueDate
                                                            ? format(
                                                                  new Date(inv.dueDate),
                                                                  'dd MMM yyyy'
                                                              )
                                                            : '—';
                                                        const orgLabel =
                                                            inv.organization?.name ||
                                                            currentScopeName;

                                                        return (
                                                            <tr
                                                                key={inv.id}
                                                                onClick={() => {
                                                                    if (inv.shipment) {
                                                                        setSelectedShipment(
                                                                            inv.shipment
                                                                        );
                                                                        setDrawerOpen(true);
                                                                    }
                                                                }}
                                                                className="hover:bg-slate-50/90 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                                                            >
                                                                <td className="py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle">
                                                                    <div className="font-mono text-xs font-extrabold text-primary dark:text-sky-400 whitespace-nowrap">
                                                                        {inv.invoiceNumber}
                                                                    </div>
                                                                    <div className="sm:hidden text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[140px] mt-0.5">
                                                                        {orgLabel} • {dateLabel}
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle text-end sm:text-start">
                                                                    <StatusBadge
                                                                        status={
                                                                            inv.status || 'sent'
                                                                        }
                                                                        size="xs"
                                                                    />
                                                                </td>
                                                                <td className="hidden sm:table-cell py-2.5 px-2.5 lg:px-4 align-middle">
                                                                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[180px]">
                                                                        {orgLabel}
                                                                    </div>
                                                                </td>
                                                                <td className="hidden md:table-cell py-2.5 px-2.5 lg:px-4 align-middle">
                                                                    <div className="font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                                        {dateLabel}
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle text-end">
                                                                    <span className="font-mono text-xs font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap tabular-nums">
                                                                        {formatKWD(inv.total)}
                                                                    </span>
                                                                </td>
                                                                <td className="hidden sm:table-cell py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle text-end">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (
                                                                                inv.isShipmentStatement
                                                                            ) {
                                                                                handleDownloadStatementPDF();
                                                                            } else {
                                                                                generateInvoicePDF(
                                                                                    inv
                                                                                );
                                                                            }
                                                                        }}
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-primary dark:text-sky-400 hover:bg-primary/10 dark:hover:bg-sky-400/15 transition-colors whitespace-nowrap cursor-pointer"
                                                                    >
                                                                        <span
                                                                            className="material-symbols-outlined text-sm leading-none"
                                                                            aria-hidden="true"
                                                                        >
                                                                            picture_as_pdf
                                                                        </span>
                                                                        <span className="hidden lg:inline">
                                                                            PDF
                                                                        </span>
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* VIEW 2: DOUBLE-ENTRY LEDGER TRANSACTIONS */}
                            {activeSection === 'ledger' && (
                                <>
                                    <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800">
                                        <div>
                                            <h2 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                                                {isRTL
                                                    ? 'سجل قيود اليومية والذمم المالية'
                                                    : 'Audited Double-Entry Ledger Transactions'}
                                            </h2>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                {isRTL
                                                    ? 'الحركات المالية الدائنة والمدينة مرتبة زمنياً'
                                                    : 'Chronological debit and credit postings across consignments and payments'}
                                            </p>
                                        </div>
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                                            {displayLedgerRows.length}{' '}
                                            {isRTL ? 'قيد' : 'entries'}
                                        </span>
                                    </div>

                                    {displayLedgerRows.length === 0 ? (
                                        <EmptyStateV2
                                            icon="receipt_long"
                                            title={
                                                isRTL
                                                    ? 'لا توجد قيود مالية مسجلة'
                                                    : 'No ledger entries recorded'
                                            }
                                            description={
                                                isRTL
                                                    ? 'لا توجد حركات مالية مطابقة للفلتر المحدد.'
                                                    : 'No financial transactions match the current filter.'
                                            }
                                        />
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-start border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50/90 dark:bg-slate-800/70 text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                                                        <th className="text-start py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                            {isRTL ? 'المرجع' : 'Reference'}
                                                        </th>
                                                        <th className="text-start py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                            {isRTL ? 'النوع' : 'Entry'}
                                                        </th>
                                                        <th className="hidden sm:table-cell text-start py-2.5 px-2.5 lg:px-4">
                                                            {isRTL ? 'البيان' : 'Description'}
                                                        </th>
                                                        <th className="hidden md:table-cell text-start py-2.5 px-2.5 lg:px-4">
                                                            {isRTL ? 'التاريخ' : 'Date'}
                                                        </th>
                                                        <th className="text-end py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                            {isRTL ? 'المبلغ' : 'Amount'}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                                    {displayLedgerRows.map((row) => {
                                                        const isCredit =
                                                            row.type === 'CREDIT';
                                                        const dtStr = row.date
                                                            ? format(
                                                                  new Date(row.date),
                                                                  'dd MMM yyyy'
                                                              )
                                                            : '—';

                                                        return (
                                                            <tr
                                                                key={row.id}
                                                                onClick={() => {
                                                                    if (row.shipment) {
                                                                        setSelectedShipment(
                                                                            row.shipment
                                                                        );
                                                                        setDrawerOpen(true);
                                                                    }
                                                                }}
                                                                className="hover:bg-slate-50/90 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                                                            >
                                                                <td className="py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle">
                                                                    <div className="font-mono text-xs font-extrabold text-primary dark:text-sky-400 whitespace-nowrap">
                                                                        {row.reference}
                                                                    </div>
                                                                    <div className="sm:hidden text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[140px] mt-0.5">
                                                                        {row.description}
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle">
                                                                    <span
                                                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-extrabold whitespace-nowrap ${
                                                                            isCredit
                                                                                ? 'bg-emerald-600 text-white dark:bg-emerald-500/20 dark:text-emerald-300'
                                                                                : 'bg-amber-600 text-white dark:bg-amber-500/20 dark:text-amber-300'
                                                                        }`}
                                                                    >
                                                                        {isCredit
                                                                            ? isRTL
                                                                                ? 'دائن (CR)'
                                                                                : 'CREDIT'
                                                                            : isRTL
                                                                            ? 'مدين (DR)'
                                                                            : 'DEBIT'}
                                                                    </span>
                                                                </td>
                                                                <td className="hidden sm:table-cell py-2.5 px-2.5 lg:px-4 align-middle">
                                                                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[260px]">
                                                                        {row.description}
                                                                    </div>
                                                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                                        {row.orgName} •{' '}
                                                                        {row.category}
                                                                    </div>
                                                                </td>
                                                                <td className="hidden md:table-cell py-2.5 px-2.5 lg:px-4 align-middle">
                                                                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                                        {dtStr}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle text-end">
                                                                    <span
                                                                        className={`font-mono text-xs font-extrabold whitespace-nowrap tabular-nums ${
                                                                            isCredit
                                                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                                                : 'text-slate-900 dark:text-slate-100'
                                                                        }`}
                                                                    >
                                                                        {isCredit ? '+' : ''}
                                                                        {formatKWD(row.amount)}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* VIEW 3: DRIVER COD VAULT (Platform Finance Roles) */}
                            {activeSection === 'cod' && canViewFinance && (
                                <>
                                    <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800">
                                        <div>
                                            <h2 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                                                {isRTL
                                                    ? 'خزينة تحصيل السائقين وعُهد النقد (COD)'
                                                    : 'Driver Cash-on-Delivery (COD) Vault Clearing'}
                                            </h2>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                {isRTL
                                                    ? 'متابعة النقد المحصل طرف المناديب وسقف الائتمان النقدي (500 د.ك)'
                                                    : 'Physical cash held by fleet couriers against the 500.000 KWD vault handover threshold'}
                                            </p>
                                        </div>
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-600 text-white text-xs font-extrabold tabular-nums">
                                            {formatKWD(metrics.codHeld)}
                                        </span>
                                    </div>

                                    {Array.isArray(codSummary?.shipments) &&
                                    codSummary.shipments.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-start border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50/90 dark:bg-slate-800/70 text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                                                        <th className="text-start py-2.5 px-3 lg:px-4">
                                                            {isRTL
                                                                ? 'رقم الشحنة'
                                                                : 'Tracking #'}
                                                        </th>
                                                        <th className="text-start py-2.5 px-3 lg:px-4">
                                                            {isRTL ? 'السائق' : 'Driver'}
                                                        </th>
                                                        <th className="text-end py-2.5 px-3 lg:px-4">
                                                            {isRTL
                                                                ? 'مبلغ التحصيل'
                                                                : 'COD Amount'}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                                    {codSummary.shipments.map((s) => (
                                                        <tr
                                                            key={s.id}
                                                            className="hover:bg-slate-50/90 dark:hover:bg-slate-800/60"
                                                        >
                                                            <td className="py-2.5 px-3 lg:px-4 font-mono text-xs font-extrabold text-primary dark:text-sky-400">
                                                                {s.trackingNumber}
                                                            </td>
                                                            <td className="py-2.5 px-3 lg:px-4 text-xs font-bold text-slate-800 dark:text-slate-100">
                                                                {s.assignedDriver?.name ||
                                                                    (isRTL
                                                                        ? 'مندوب التوصيل'
                                                                        : 'Assigned Courier')}
                                                            </td>
                                                            <td className="py-2.5 px-3 lg:px-4 text-end font-mono text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                                                                {formatKWD(s.codAmount)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <EmptyStateV2
                                            icon="savings"
                                            title={
                                                isRTL
                                                    ? 'جميع عُهد السائقين النقدية مسواة بالكامل'
                                                    : 'All Driver COD Handovers Cleared'
                                            }
                                            description={
                                                isRTL
                                                    ? 'لا توجد مبالغ نقدية معلقة لدى مناديب التوصيل حالياً.'
                                                    : 'Zero unremitted cash bags pending handover in the fleet vault.'
                                            }
                                        />
                                    )}
                                </>
                            )}

                            {/* VIEW 4: CARRIER COGS & MARGIN AUDIT (Strictly Gated by canViewCostData!) */}
                            {activeSection === 'cogs' && canViewCostData && (
                                <>
                                    <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800">
                                        <div>
                                            <h2 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                                                {isRTL
                                                    ? 'تحليل تكاليف الناقلين وهامش الربح (محجوب عن غير المصرح لهم)'
                                                    : 'Carrier Wholesale Cost (COGS) & Gross Margin Audit'}
                                            </h2>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                {isRTL
                                                    ? 'مقارنة تكلفة الناقل الفعلية مع السعر المفوتر للعميل (متاح فقط لـ Admin و Accounting)'
                                                    : 'Restricted VIEW_COST_DATA audit comparing wholesale carrier cost vs retail billed freight'}
                                            </p>
                                        </div>
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-600 text-white text-xs font-extrabold tabular-nums">
                                            {isRTL ? 'هامش:' : 'Margin:'}{' '}
                                            {metrics.marginPct || 0}%
                                        </span>
                                    </div>

                                    {Array.isArray(profitability?.items) &&
                                    profitability.items.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-start border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50/90 dark:bg-slate-800/70 text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                                                        <th className="text-start py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                            {isRTL
                                                                ? 'رقم الشحنة'
                                                                : 'Tracking #'}
                                                        </th>
                                                        <th className="hidden sm:table-cell text-start py-2.5 px-2.5 lg:px-4">
                                                            {isRTL ? 'الناقل' : 'Carrier'}
                                                        </th>
                                                        <th className="text-end py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                            {isRTL
                                                                ? 'تكلفة الناقل'
                                                                : 'Wholesale Cost'}
                                                        </th>
                                                        <th className="text-end py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                            {isRTL
                                                                ? 'سعر البيع'
                                                                : 'Billed Revenue'}
                                                        </th>
                                                        <th className="hidden md:table-cell text-end py-2.5 px-2.5 lg:px-4">
                                                            {isRTL
                                                                ? 'صافي الربح'
                                                                : 'Gross Margin'}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                                    {profitability.items
                                                        .slice(0, 25)
                                                        .map((item) => (
                                                            <tr
                                                                key={
                                                                    item.id ||
                                                                    item.trackingNumber
                                                                }
                                                                className="hover:bg-slate-50/90 dark:hover:bg-slate-800/60"
                                                            >
                                                                <td className="py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle">
                                                                    <div className="font-mono text-xs font-extrabold text-primary dark:text-sky-400 whitespace-nowrap">
                                                                        {
                                                                            item.trackingNumber
                                                                        }
                                                                    </div>
                                                                    <div className="sm:hidden text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                                        {item.carrierCode} •{' '}
                                                                        {item.customerName}
                                                                    </div>
                                                                </td>
                                                                <td className="hidden sm:table-cell py-2.5 px-2.5 lg:px-4 align-middle">
                                                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                                                        {item.carrierCode}
                                                                    </span>
                                                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                                                                        {item.customerName}
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle text-end font-mono text-xs font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap tabular-nums">
                                                                    {formatKWD(item.cost)}
                                                                </td>
                                                                <td className="py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle text-end font-mono text-xs font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap tabular-nums">
                                                                    {formatKWD(item.revenue)}
                                                                </td>
                                                                <td className="hidden md:table-cell py-2.5 px-2.5 lg:px-4 align-middle text-end">
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono whitespace-nowrap tabular-nums">
                                                                        +{formatKWD(item.profit)}{' '}
                                                                        ({item.marginPercent}%)
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <EmptyStateV2
                                            icon="analytics"
                                            title={
                                                isRTL
                                                    ? 'لا توجد بيانات تكاليف حالياً'
                                                    : 'No COGS profitability records found'
                                            }
                                            description={
                                                isRTL
                                                    ? 'ستظهر مقارنة التكاليف والهوامش فور فوترة الشحنات.'
                                                    : 'Wholesale cost vs retail revenue records will appear here once shipments are billed.'
                                            }
                                        />
                                    )}
                                </>
                            )}
                        </section>
                    </>
                )}
            </div>

            {/* Quick Payment Modal (Admin / Accounting Only) */}
            {isPaymentModalOpen && canManagePayments && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
                    role="dialog"
                    aria-modal="true"
                    aria-label={isRTL ? 'تسجيل دفعة مالية' : 'Post Organization Payment'}
                >
                    <form
                        onSubmit={handlePostQuickPayment}
                        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-5 space-y-4"
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                                {isRTL
                                    ? 'تسجيل دفعة مالية جديدة (قيد مزدوج)'
                                    : 'Post Payment Receipt (Double-Entry)'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsPaymentModalOpen(false)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                    {isRTL ? 'المنظمة / العميل' : 'Organization'}
                                </label>
                                <div className="relative flex items-center">
                                    <select
                                        value={
                                            paymentForm.targetOrgId ||
                                            (selectedOrgId !== 'all' &&
                                            selectedOrgId !== 'none'
                                                ? selectedOrgId
                                                : organizations[0]?.id || '')
                                        }
                                        onChange={(e) =>
                                            setPaymentForm({
                                                ...paymentForm,
                                                targetOrgId: e.target.value
                                            })
                                        }
                                        style={{ backgroundImage: 'none' }}
                                        className="appearance-none bg-none w-full ps-3 pe-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100"
                                    >
                                        {organizations.map((o) => (
                                            <option key={o.id} value={o.id}>
                                                {o.name}
                                            </option>
                                        ))}
                                    </select>
                                    <span
                                        className="material-symbols-outlined pointer-events-none absolute end-2.5 text-base text-slate-500"
                                        aria-hidden="true"
                                    >
                                        expand_more
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                    {isRTL ? 'المبلغ (د.ك)' : 'Amount (KWD)'}
                                </label>
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0.001"
                                    required
                                    value={paymentForm.amount}
                                    onChange={(e) =>
                                        setPaymentForm({
                                            ...paymentForm,
                                            amount: e.target.value
                                        })
                                    }
                                    placeholder="0.000"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-slate-100"
                                />
                            </div>

                            <div>
                                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                    {isRTL ? 'رقم المرجع البنكي' : 'Bank / Wire Reference'}
                                </label>
                                <input
                                    type="text"
                                    value={paymentForm.reference}
                                    onChange={(e) =>
                                        setPaymentForm({
                                            ...paymentForm,
                                            reference: e.target.value
                                        })
                                    }
                                    placeholder="WIRE-2026-001"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-slate-100"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => setIsPaymentModalOpen(false)}
                                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                type="submit"
                                disabled={postingPayment}
                                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                            >
                                {postingPayment
                                    ? isRTL
                                        ? 'جاري الحفظ...'
                                        : 'Posting...'
                                    : isRTL
                                    ? 'تأكيد وترحيل الدفعة'
                                    : 'Confirm & Post Receipt'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Shipment Inspector Drawer */}
            {drawerOpen && selectedShipment && (
                <ShipmentInspectorDrawer
                    shipment={selectedShipment}
                    isOpen={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                />
            )}
        </div>
    );
};

export default FinanceV2Page;
