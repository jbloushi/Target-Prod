import React, { useState, useEffect, useCallback } from 'react';
import ExportButton from '../components/ExportButton';
import { financeService, whatsappService } from '../services/api';
import { generateAccountStatementPDF } from '../utils/pdfGenerator';
import { format } from 'date-fns';
import { useLanguage } from '../context/LanguageContext';

const FinanceReports = ({ ledger = [], shipments = [], organizations = [] }) => {
    const { t, lang, isRTL } = useLanguage();
    const curSymbol = lang === 'ar' ? 'د.ك' : 'KWD';
    const [activeReport, setActiveReport] = useState('profitability');
    const [profitabilityData, setProfitabilityData] = useState({ items: [], summary: {} });
    const [codData, setCodData] = useState({ shipments: [], unremittedTotalsByCurrency: {}, unremittedCount: 0 });
    const [loading, setLoading] = useState(false);

    // Carrier Reconciliation State
    const [reconcileCarrier, setReconcileCarrier] = useState('DHL');
    const [csvInput, setCsvInput] = useState('');
    const [reconcileResult, setReconcileResult] = useState(null);
    const [reconcileLoading, setReconcileLoading] = useState(false);
    const [postingAdjustments, setPostingAdjustments] = useState(false);
    const [adjustSuccessMessage, setAdjustSuccessMessage] = useState('');

    const fmt = (val) => parseFloat(val || 0).toFixed(3);

    const parseCsvRows = (text) => {
        const lines = text.trim().split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) return [];

        const headerLine = lines[0].toLowerCase();
        const hasHeader = headerLine.includes('tracking') || headerLine.includes('awb') || headerLine.includes('amount') || headerLine.includes('cost');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        return dataLines.map(line => {
            const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
            return {
                trackingNumber: cols[0] || '',
                billedAmount: parseFloat(cols[1] || 0),
                billedWeight: cols[2] ? parseFloat(cols[2]) : undefined,
                currency: cols[3] || 'KWD'
            };
        }).filter(r => r.trackingNumber);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result;
            if (typeof content === 'string') {
                setCsvInput(content);
            }
        };
        reader.readAsText(file);
    };

    const runCarrierReconciliation = async () => {
        const records = parseCsvRows(csvInput);
        if (records.length === 0) {
            alert('Please paste valid CSV data or upload a file with tracking numbers and billed amounts.');
            return;
        }

        try {
            setReconcileLoading(true);
            setAdjustSuccessMessage('');
            const res = await financeService.reconcileCarrierInvoice({
                carrier: reconcileCarrier,
                records
            });
            if (res?.data) {
                setReconcileResult(res.data);
            }
        } catch (err) {
            console.error('Reconciliation error:', err);
            alert(err.response?.data?.error || err.message || 'Failed to reconcile carrier invoice');
        } finally {
            setReconcileLoading(false);
        }
    };

    const handlePostAdjustments = async () => {
        if (!reconcileResult?.items) return;
        const discrepancies = reconcileResult.items.filter(
            i => (i.status === 'SURCHARGE_DISCREPANCY' || i.status === 'CREDIT_DISCREPANCY') && i.shipmentId
        ).map(i => ({
            shipmentId: i.shipmentId,
            organizationId: i.organizationId,
            deltaAmount: i.deltaAmount,
            currency: i.currency,
            reason: i.reason
        }));

        if (discrepancies.length === 0) {
            alert('No adjustment discrepancies to post.');
            return;
        }

        try {
            setPostingAdjustments(true);
            const res = await financeService.postCarrierReconciliationAdjustments({ adjustments: discrepancies });
            if (res?.data) {
                setAdjustSuccessMessage(`Successfully posted ${res.data.count} reconciliation adjustment ledger entries!`);
            }
        } catch (err) {
            console.error('Failed to post adjustments:', err);
            alert(err.response?.data?.error || err.message || 'Failed to post adjustments');
        } finally {
            setPostingAdjustments(false);
        }
    };

    const loadProfitability = useCallback(async () => {
        try {
            setLoading(true);
            const res = await financeService.getProfitabilityReport();
            if (res?.data) {
                setProfitabilityData(res.data);
            }
        } catch (err) {
            console.error('Failed to load profitability report:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadCodSummary = useCallback(async () => {
        try {
            setLoading(true);
            const res = await financeService.getDriverCodSummary();
            if (res?.data) {
                setCodData(res.data);
            }
        } catch (err) {
            console.error('Failed to load driver COD summary:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeReport === 'profitability') {
            loadProfitability();
        } else if (activeReport === 'cod') {
            loadCodSummary();
        }
    }, [activeReport, loadProfitability, loadCodSummary]);

    const renderProfitability = () => {
        const items = profitabilityData.items || [];
        const summary = profitabilityData.summary || {};

        const exportRows = items.map(s => ({
            Tracking: s.trackingNumber,
            Carrier: s.carrierCode,
            Date: format(new Date(s.createdAt), 'yyyy-MM-dd'),
            Customer: s.customerName,
            Currency: s.currency,
            'Wholesale Cost': fmt(s.cost),
            'Billed Revenue': fmt(s.revenue),
            'Gross Profit': fmt(s.profit),
            'Margin %': `${s.marginPercent}%`,
            Status: s.paid ? t('rep_paid', 'PAID') : t('rep_unpaid', 'UNPAID')
        }));

        return (
            <div className="card bg-base-100 border border-base-200 p-6 space-y-5 shadow-xs">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                        <h3 className="text-base font-extrabold text-base-content">{t('rep_cogs_title', 'Carrier COGS & Shipment Profitability')}</h3>
                        <p className="text-xs text-base-content/60 mt-0.5">
                            {t('rep_cogs_desc', 'Real-time double-entry margin analysis comparing wholesale carrier cost vs. billed revenue.')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            type="button" 
                            onClick={loadProfitability} 
                            disabled={loading} 
                            className="btn btn-sm btn-outline btn-circle"
                            aria-label="Refresh profitability"
                        >
                            <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        </button>
                        <ExportButton data={exportRows} filename="Shipment_Profitability_Report" />
                    </div>
                </div>

                {/* Summary KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-base-200/50 border border-base-200 rounded-xl p-4 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/60">{t('rep_total_revenue', 'Total Billed Revenue')}</div>
                        <div className="text-xl font-black text-base-content font-mono">{fmt(summary.totalRevenue)} <span className="text-xs font-sans text-base-content/60">{curSymbol}</span></div>
                    </div>
                    <div className="bg-base-200/50 border border-base-200 rounded-xl p-4 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/60">{t('rep_wholesale_cost', 'Wholesale Carrier Cost (COGS)')}</div>
                        <div className="text-xl font-black text-error font-mono">{fmt(summary.totalCost)} <span className="text-xs font-sans text-base-content/60">{curSymbol}</span></div>
                    </div>
                    <div className="bg-base-200/50 border border-base-200 rounded-xl p-4 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/60">{t('rep_net_gross_profit', 'Net Gross Profit')}</div>
                        <div className="text-xl font-black text-success font-mono">{fmt(summary.totalProfit)} <span className="text-xs font-sans text-base-content/60">{curSymbol}</span></div>
                    </div>
                    <div className="bg-base-200/50 border border-base-200 rounded-xl p-4 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/60">{t('rep_overall_margin', 'Overall Gross Margin')}</div>
                        <div className={`text-xl font-black font-mono ${(summary.overallMarginPercent || 0) >= 0 ? 'text-success' : 'text-error'}`}>
                            {summary.overallMarginPercent || 0}%
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 flex justify-center"><span className="loading loading-spinner text-primary loading-md" /></div>
                ) : (
                    <div className="overflow-x-auto border border-base-200 rounded-xl">
                        <table className="table table-sm w-full">
                            <thead className="bg-base-200/60 text-xs">
                                <tr>
                                    <th>{t('rep_tracking', 'Tracking')}</th>
                                    <th>{t('rep_carrier', 'Carrier')}</th>
                                    <th>{t('rep_date', 'Date')}</th>
                                    <th>{t('rep_customer', 'Customer')}</th>
                                    <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_cost', 'Wholesale Cost')}</th>
                                    <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_revenue', 'Billed Revenue')}</th>
                                    <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_profit', 'Gross Profit')}</th>
                                    <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_margin_pct', 'Margin %')}</th>
                                    <th className="text-center">{t('rep_payment', 'Payment')}</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs">
                                {items.length > 0 ? items.map((row) => (
                                    <tr key={row.id} className="hover:bg-base-200/40">
                                        <td className="font-mono font-bold text-primary">{row.trackingNumber}</td>
                                        <td>
                                            <span className="badge badge-sm badge-neutral font-bold">{row.carrierCode}</span>
                                        </td>
                                        <td className="text-base-content/70">{format(new Date(row.createdAt), 'MMM dd, yyyy')}</td>
                                        <td className="font-semibold text-base-content">{row.customerName}</td>
                                        <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono text-error font-medium`}>
                                            {fmt(row.cost)} {row.currency === 'KWD' ? curSymbol : row.currency}
                                        </td>
                                        <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono font-bold text-base-content`}>
                                            {fmt(row.revenue)} {row.currency === 'KWD' ? curSymbol : row.currency}
                                        </td>
                                        <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono font-black ${row.profit >= 0 ? 'text-success' : 'text-error'}`}>
                                            {fmt(row.profit)} {row.currency === 'KWD' ? curSymbol : row.currency}
                                        </td>
                                        <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono font-bold`}>{row.marginPercent}%</td>
                                        <td className="text-center">
                                            <span className={`badge badge-sm font-bold ${row.paid ? 'badge-success' : 'badge-warning'}`}>
                                                {row.paid ? 'PAID' : 'UNPAID'}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={9} className="text-center py-8 text-base-content/50">
                                            {t('no_shipments_found', 'No shipments found')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    const renderCodReport = () => {
        const codShipments = codData.shipments || [];
        const unremittedTotals = codData.unremittedTotalsByCurrency || {};

        return (
            <div className="card bg-base-100 border border-base-200 p-6 space-y-5 shadow-xs">
                <div className="flex justify-between items-center gap-3">
                    <div>
                        <h3 className="text-base font-extrabold text-base-content">{t('rep_cod_title', 'Driver Cash-on-Delivery (COD) Clearing')}</h3>
                        <p className="text-xs text-base-content/60 mt-0.5">
                            {t('rep_cod_desc', 'Track cash collected by drivers upon delivery and reconcile hub vault handovers.')}
                        </p>
                    </div>
                    <button 
                        type="button" 
                        onClick={loadCodSummary} 
                        disabled={loading} 
                        className="btn btn-sm btn-outline btn-circle"
                        aria-label="Refresh COD summary"
                    >
                        <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>refresh</span>
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-base-200/50 border border-base-200 rounded-xl p-4 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/60">{t('rep_unremitted_shipments', 'Unremitted COD Shipments')}</div>
                        <div className="text-xl font-black text-base-content font-mono">{codData.unremittedCount || 0}</div>
                    </div>
                    {Object.entries(unremittedTotals).map(([cur, amt]) => (
                        <div key={cur} className="bg-base-200/50 border border-base-200 rounded-xl p-4 space-y-1">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/60">{t('rep_unremitted_cash', 'Unremitted Cash')} ({cur === 'KWD' ? curSymbol : cur})</div>
                            <div className="text-xl font-black text-warning font-mono">{fmt(amt)} <span className="text-xs font-sans text-base-content/60">{cur === 'KWD' ? curSymbol : cur}</span></div>
                        </div>
                    ))}
                </div>

                <div className="overflow-x-auto border border-base-200 rounded-xl">
                    <table className="table table-sm w-full">
                        <thead className="bg-base-200/60 text-xs">
                            <tr>
                                <th>{t('rep_tracking', 'Tracking')}</th>
                                <th>{t('rep_driver', 'Driver')}</th>
                                <th>{t('rep_cod_amount', 'COD Amount')}</th>
                                <th>{t('rep_delivery_status', 'Delivery Status')}</th>
                                <th>{t('rep_cod_clearing_status', 'COD Clearing Status')}</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            {codShipments.length > 0 ? codShipments.map((s) => (
                                <tr key={s.id} className="hover:bg-base-200/40">
                                    <td className="font-mono font-bold text-primary">{s.trackingNumber}</td>
                                    <td className="font-semibold text-base-content">{s.assignedDriver?.name || (lang === 'ar' ? 'غير مسند' : 'Unassigned')}</td>
                                    <td className="font-mono font-bold">{fmt(s.codAmount)} {s.codCurrency === 'KWD' ? curSymbol : (s.codCurrency || curSymbol)}</td>
                                    <td>
                                        <span className="badge badge-sm badge-outline font-bold">{s.status}</span>
                                    </td>
                                    <td>
                                        <span className={`badge badge-sm font-bold ${s.codStatus === 'REMITTED' ? 'badge-success' : 'badge-warning'}`}>
                                            {s.codStatus === 'REMITTED' ? (lang === 'ar' ? 'تم التوريد' : 'REMITTED') : (lang === 'ar' ? 'قيد التوريد' : 'PENDING')}
                                        </span>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-base-content/50">
                                        {t('no_shipments_found', 'No COD shipments found')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderDailyRevenue = () => {
        const dailyStats = ledger.reduce((acc, entry) => {
            const date = format(new Date(entry.createdAt), 'yyyy-MM-dd');
            if (!acc[date]) acc[date] = { date, revenue: 0, received: 0 };

            if (entry.entryType === 'DEBIT' && entry.category === 'SHIPMENT_CHARGE') {
                acc[date].revenue += parseFloat(entry.amount || 0);
            } else if (entry.entryType === 'CREDIT' && (entry.category === 'PAYMENT' || entry.category === 'ALLOCATION')) {
                acc[date].received += parseFloat(entry.amount || 0);
            }
            return acc;
        }, {});

        const data = Object.values(dailyStats).sort((a, b) => new Date(b.date) - new Date(a.date));

        return (
            <div className="card bg-base-100 border border-base-200 p-6 space-y-4 shadow-xs">
                <div className="flex justify-between items-center gap-3">
                    <h3 className="text-base font-extrabold text-base-content">{t('rep_daily_rev_title', 'Daily Invoiced Revenue & Collections')}</h3>
                    <ExportButton data={data} filename="Daily_Revenue_Collections" />
                </div>
                <div className="overflow-x-auto border border-base-200 rounded-xl">
                    <table className="table table-sm w-full">
                        <thead className="bg-base-200/60 text-xs">
                            <tr>
                                <th>{t('rep_date', 'Date')}</th>
                                <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_invoiced_charges', 'Invoiced Charges')} ({curSymbol})</th>
                                <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_payments_collected', 'Payments Collected')} ({curSymbol})</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            {data.length > 0 ? data.map((row, i) => (
                                <tr key={i} className="hover:bg-base-200/40">
                                    <td className="font-mono text-base-content/70">{row.date}</td>
                                    <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono font-bold text-base-content`}>{fmt(row.revenue)}</td>
                                    <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono font-black text-success`}>{fmt(row.received)}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={3} className="text-center py-6 text-base-content/50">
                                        {t('fin_no_transactions', 'No transactions found')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const [downloadingOrgId, setDownloadingOrgId] = useState(null);
    const [sendSuccessMsg, setSendSuccessMsg] = useState('');

    // WhatsApp Template Dispatch Modal State
    const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
    const [selectedOrgForWhatsapp, setSelectedOrgForWhatsapp] = useState(null);
    const [availableTemplates, setAvailableTemplates] = useState([]);
    const [selectedTemplateName, setSelectedTemplateName] = useState('');
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);

    const handleDownloadStatement = async (orgId) => {
        try {
            setDownloadingOrgId(orgId);
            const res = await financeService.getOrganizationStatement(orgId);
            if (res?.data) {
                await generateAccountStatementPDF(res.data);
            }
        } catch (err) {
            console.error('Error generating statement PDF:', err);
            alert(err.response?.data?.error || err.message || 'Failed to generate statement PDF');
        } finally {
            setDownloadingOrgId(null);
        }
    };

    const handleOpenWhatsappModal = async (org) => {
        setSelectedOrgForWhatsapp(org);
        setWhatsappModalOpen(true);
        setLoadingTemplates(true);
        try {
            const res = await whatsappService.getTemplates();
            const tpls = res.data || [];
            setAvailableTemplates(tpls);

            const approvedStmt = tpls.find(t => t.name === 'account_statement_v1' && t.status === 'APPROVED');
            if (approvedStmt) {
                setSelectedTemplateName('account_statement_v1');
            } else {
                const approvedShipment = tpls.find(t => t.name === 'new_shipment_created' && t.status === 'APPROVED');
                setSelectedTemplateName(approvedShipment ? 'new_shipment_created' : (tpls[0]?.name || 'direct_text'));
            }
        } catch (err) {
            console.error('Error loading WhatsApp templates:', err);
            setSelectedTemplateName('direct_text');
        } finally {
            setLoadingTemplates(false);
        }
    };

    const handleConfirmSendWhatsapp = async () => {
        if (!selectedOrgForWhatsapp) return;
        try {
            setSendingWhatsapp(true);
            const res = await financeService.sendStatementNotification(selectedOrgForWhatsapp.id, {
                templateName: selectedTemplateName
            });
            setWhatsappModalOpen(false);
            setSendSuccessMsg(res.message || 'Statement notification dispatched via WhatsApp successfully');
            setTimeout(() => setSendSuccessMsg(''), 6000);
        } catch (err) {
            console.error('Error sending statement notification:', err);
            alert(err.response?.data?.error || err.message || 'Failed to send WhatsApp statement');
        } finally {
            setSendingWhatsapp(false);
        }
    };

    const renderOrgBalances = () => {
        const data = organizations.map(org => ({
            id: org.id,
            rawOrg: org,
            Organization: org.name,
            'Credit Limit': fmt(org.creditLimit),
            'Current Balance': fmt(org.balance),
            'Unapplied Cash': fmt(org.unappliedBalance),
            Status: org.active ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'معطل' : 'Inactive')
        })).sort((a, b) => parseFloat(b['Current Balance']) - parseFloat(a['Current Balance']));

        return (
            <div className="card bg-base-100 border border-base-200 p-6 space-y-4 shadow-xs">
                <div className="flex justify-between items-center gap-3">
                    <h3 className="text-base font-extrabold text-base-content">{t('rep_client_org_balances', 'Client & Organization Balances')}</h3>
                    <ExportButton data={data.map(({ rawOrg, ...rest }) => rest)} filename="Organization_Balances" />
                </div>

                {sendSuccessMsg && (
                    <div className="alert alert-success text-xs py-2 px-3">
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        <span>{sendSuccessMsg}</span>
                    </div>
                )}

                <div className="overflow-x-auto border border-base-200 rounded-xl">
                    <table className="table table-sm w-full">
                        <thead className="bg-base-200/60 text-xs">
                            <tr>
                                <th>{t('org_company_entity', 'Organization')}</th>
                                <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_credit_limit', 'Credit Limit')} ({curSymbol})</th>
                                <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_current_balance', 'Current Balance')} ({curSymbol})</th>
                                <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_unapplied_cash', 'Unapplied Cash')} ({curSymbol})</th>
                                <th>{t('status', 'Status')}</th>
                                <th className={isRTL ? 'text-start' : 'text-end'}>{t('actions', 'Actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            {data.length > 0 ? data.map((row, i) => (
                                <tr key={i} className="hover:bg-base-200/40">
                                    <td className="font-bold text-base-content">{row.Organization}</td>
                                    <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono`}>{row['Credit Limit']}</td>
                                    <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono font-bold ${parseFloat(row['Current Balance']) > 0 ? 'text-error' : 'text-base-content'}`}>
                                        {row['Current Balance']}
                                    </td>
                                    <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono ${parseFloat(row['Unapplied Cash']) > 0 ? 'text-success font-bold' : 'text-base-content/60'}`}>
                                        {row['Unapplied Cash']}
                                    </td>
                                    <td>
                                        <span className={`badge badge-sm font-bold ${row.rawOrg.active ? 'badge-success' : 'badge-ghost'}`}>
                                            {row.Status}
                                        </span>
                                    </td>
                                    <td className={isRTL ? 'text-start' : 'text-end'}>
                                        <div className={`flex gap-1.5 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                                            <button
                                                type="button"
                                                onClick={() => handleDownloadStatement(row.id)}
                                                disabled={downloadingOrgId === row.id}
                                                className="btn btn-xs btn-outline gap-1 font-bold"
                                            >
                                                <span className="material-symbols-outlined text-xs">picture_as_pdf</span>
                                                {downloadingOrgId === row.id ? '...' : 'PDF'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleOpenWhatsappModal(row.rawOrg)}
                                                className="btn btn-xs btn-outline btn-success gap-1 font-bold"
                                            >
                                                <span className="material-symbols-outlined text-xs">chat</span>
                                                WhatsApp
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="text-center py-6 text-base-content/50">
                                        {lang === 'ar' ? 'لا توجد شركات أو حسابات مسجلة' : 'No organizations found'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* WhatsApp Template Selection Modal */}
                {whatsappModalOpen && (
                    <div className="modal modal-open z-50">
                        <div className="modal-box max-w-lg bg-base-100 border border-base-300 p-6 space-y-4 shadow-2xl">
                            <div className="flex items-center justify-between border-b border-base-200 pb-3">
                                <h3 className="font-black text-base text-base-content flex items-center gap-2">
                                    <span className="material-symbols-outlined text-success text-xl">chat</span>
                                    {lang === 'ar' ? 'إرسال كشف الحساب عبر واتساب' : 'Dispatch Statement via WhatsApp'}
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setWhatsappModalOpen(false)}
                                    className="btn btn-xs btn-circle btn-ghost"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-3 text-xs">
                                <div className="bg-base-200/60 p-3 rounded-xl border border-base-200 space-y-1">
                                    <div><strong>{lang === 'ar' ? 'الجهة المستلمة:' : 'Recipient Entity:'}</strong> {selectedOrgForWhatsapp?.name}</div>
                                    <div className="text-base-content/70">
                                        <strong>{lang === 'ar' ? 'رقم الواتساب المسجل:' : 'WhatsApp Phone:'}</strong> {selectedOrgForWhatsapp?.billingWhatsappNumber || '+965 99554433'}
                                    </div>
                                    <div className="badge badge-success badge-sm font-bold mt-1">
                                        🧪 {lang === 'ar' ? 'وضع التطوير (Sandbox): +201040957289' : 'Dev Sandbox: +201040957289'}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="block font-bold text-base-content">
                                        {lang === 'ar' ? 'قالب رسالة واتساب (Meta Cloud API)' : 'WhatsApp Template (Meta Cloud API)'}
                                    </label>
                                    {loadingTemplates ? (
                                        <div className="flex items-center gap-2 text-base-content/60 py-2">
                                            <span className="loading loading-spinner loading-xs text-primary" />
                                            {lang === 'ar' ? 'جاري جلب القوالب المعتمدة من Meta...' : 'Fetching live templates from Meta...'}
                                        </div>
                                    ) : (
                                        <select
                                            value={selectedTemplateName}
                                            onChange={(e) => setSelectedTemplateName(e.target.value)}
                                            className="select select-bordered select-sm w-full"
                                        >
                                            <optgroup label={lang === 'ar' ? 'قوالب Meta المعتمدة' : 'Approved Meta Templates'}>
                                                {availableTemplates.filter(t => t.status === 'APPROVED').map(t => (
                                                    <option key={t.id || t.name} value={t.name}>
                                                        ✓ {t.name} ({t.category} • {t.language})
                                                    </option>
                                                ))}
                                            </optgroup>
                                            {availableTemplates.filter(t => t.status !== 'APPROVED').length > 0 && (
                                                <optgroup label={lang === 'ar' ? 'قوالب قيد المراجعة' : 'Pending Review Templates'}>
                                                    {availableTemplates.filter(t => t.status !== 'APPROVED').map(t => (
                                                        <option key={t.id || t.name} value={t.name}>
                                                            ⏳ {t.name} ({t.status})
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            <optgroup label={lang === 'ar' ? 'أخرى' : 'Other Methods'}>
                                                <option value="direct_text">
                                                    {lang === 'ar' ? 'رسالة نصية مباشرة (Direct Text)' : 'Direct Text Message (Active Session Window)'}
                                                </option>
                                            </optgroup>
                                        </select>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    <div className="font-bold text-base-content/70">
                                        {lang === 'ar' ? 'معاينة الإشعار:' : 'Message Preview:'}
                                    </div>
                                    <div className="bg-base-200/50 border border-base-300 rounded-xl p-3 font-mono text-[11px] whitespace-pre-line max-h-32 overflow-y-auto">
                                        {`📋 TARGET LOGISTICS - ACCOUNT STATEMENT\n` +
                                         `🏢 Account: ${selectedOrgForWhatsapp?.name || ''}\n` +
                                         `💰 Outstanding: ${fmt(selectedOrgForWhatsapp?.balance)} ${curSymbol}\n` +
                                         `💳 Credit Limit: ${fmt(selectedOrgForWhatsapp?.creditLimit)} ${curSymbol}\n` +
                                         `📅 Date: ${new Date().toLocaleDateString('en-GB')}\n` +
                                         `------------------------------------\n` +
                                         `Template: [${selectedTemplateName || 'Auto-Detect'}]`}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-base-200">
                                <button type="button" onClick={() => setWhatsappModalOpen(false)} className="btn btn-sm btn-ghost">
                                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmSendWhatsapp}
                                    disabled={sendingWhatsapp || !selectedTemplateName}
                                    className="btn btn-sm btn-success font-bold gap-1.5"
                                >
                                    {sendingWhatsapp ? (
                                        <>
                                            <span className="loading loading-spinner loading-xs" />
                                            {lang === 'ar' ? 'جاري الإرسال...' : 'Sending...'}
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-base">send</span>
                                            {lang === 'ar' ? 'إرسال الإشعار' : 'Dispatch WhatsApp'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                        <div className="modal-backdrop bg-black/50" onClick={() => setWhatsappModalOpen(false)} />
                    </div>
                )}
            </div>
        );
    };

    // Multi-Currency FX Rates State & Logic
    const [exchangeRates, setExchangeRates] = useState({
        KWD: 1.0, USD: 0.3080, AED: 0.0839, SAR: 0.0821, QAR: 0.0846, BHD: 0.8170, OMR: 0.8000, EUR: 0.3350, GBP: 0.3920
    });
    const [calcAmount, setCalcAmount] = useState('100');
    const [calcFrom, setCalcFrom] = useState('USD');
    const [calcTo, setCalcTo] = useState('KWD');

    const loadRates = useCallback(async () => {
        try {
            const res = await financeService.getExchangeRates();
            if (res?.data?.rates) {
                setExchangeRates(res.data.rates);
            }
        } catch (err) {
            console.error('Failed to load rates:', err);
        }
    }, []);

    useEffect(() => {
        if (activeReport === 'rates') {
            loadRates();
        }
    }, [activeReport, loadRates]);

    const performConversion = (amt, from, to) => {
        const fromRate = exchangeRates[from] || 1.0;
        const toRate = exchangeRates[to] || 1.0;
        const inKwd = parseFloat(amt || 0) * fromRate;
        return (inKwd / toRate).toFixed(3);
    };

    const renderExchangeRates = () => {
        return (
            <div className="card bg-base-100 border border-base-200 p-6 space-y-5 shadow-xs">
                <div>
                    <h3 className="text-base font-extrabold text-base-content">{t('rep_fx_title', 'Multi-Currency Exchange Rates & Conversion Engine')}</h3>
                    <p className="text-xs text-base-content/60 mt-0.5">
                        {t('rep_fx_desc', 'Base Reference Currency: Kuwaiti Dinar (KWD).')}
                    </p>
                </div>

                {/* Quick Conversion Calculator Strip */}
                <div className="p-4 bg-base-200/50 rounded-xl border border-base-200 flex items-center gap-3 flex-wrap text-xs">
                    <span className="font-bold text-base-content">{t('rep_live_fx_calc', 'Live FX Calculator')}:</span>
                    <input
                        type="number"
                        value={calcAmount}
                        onChange={(e) => setCalcAmount(e.target.value)}
                        className="input input-bordered input-sm w-24 font-bold font-mono"
                    />
                    <select
                        value={calcFrom}
                        onChange={(e) => setCalcFrom(e.target.value)}
                        className="select select-bordered select-sm font-bold"
                    >
                        {Object.keys(exchangeRates).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <span className="font-black text-base-content/60">=</span>
                    <span className="text-base font-black text-success font-mono">
                        {performConversion(calcAmount, calcFrom, calcTo)}
                    </span>
                    <select
                        value={calcTo}
                        onChange={(e) => setCalcTo(e.target.value)}
                        className="select select-bordered select-sm font-bold"
                    >
                        {Object.keys(exchangeRates).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div className="overflow-x-auto border border-base-200 rounded-xl">
                    <table className="table table-sm w-full">
                        <thead className="bg-base-200/60 text-xs">
                            <tr>
                                <th>{t('rep_currency_code', 'Currency Code')}</th>
                                <th>{t('rep_currency_name', 'Currency Name')}</th>
                                <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_rate_in_kwd', 'Rate in KWD (1 Unit =)')}</th>
                                <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_kwd_parity', 'KWD Parity (1 KWD =)')}</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            {Object.entries(exchangeRates).map(([code, rate]) => {
                                const numRate = parseFloat(rate);
                                const parity = numRate > 0 ? (1 / numRate).toFixed(4) : '-';
                                const arName = code === 'KWD' ? 'دينار كويتي (الأساس)' :
                                               code === 'USD' ? 'دولار أمريكي' :
                                               code === 'AED' ? 'درهم إماراتي' :
                                               code === 'SAR' ? 'ريال سعودي' :
                                               code === 'QAR' ? 'ريال قطري' :
                                               code === 'BHD' ? 'دينار بحريني' :
                                               code === 'OMR' ? 'ريال عماني' :
                                               code === 'EUR' ? 'يورو أوروبي' :
                                               code === 'GBP' ? 'جنيه إسترليني' : code;
                                const enName = code === 'KWD' ? 'Kuwaiti Dinar (Base)' :
                                               code === 'USD' ? 'US Dollar' :
                                               code === 'AED' ? 'UAE Dirham' :
                                               code === 'SAR' ? 'Saudi Riyal' :
                                               code === 'QAR' ? 'Qatari Riyal' :
                                               code === 'BHD' ? 'Bahraini Dinar' :
                                               code === 'OMR' ? 'Omani Rial' :
                                               code === 'EUR' ? 'Euro' :
                                               code === 'GBP' ? 'British Pound' : code;
                                return (
                                    <tr key={code} className="hover:bg-base-200/40">
                                        <td className="font-mono font-bold text-primary">{code}</td>
                                        <td className="text-base-content/80">{lang === 'ar' ? arName : enName}</td>
                                        <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono font-bold text-base-content`}>
                                            {numRate.toFixed(4)} {curSymbol}
                                        </td>
                                        <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono text-base-content/60`}>
                                            {parity} {code}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderCarrierReconciliation = () => {
        return (
            <div className="card bg-base-100 border border-base-200 p-6 space-y-5 shadow-xs">
                <div>
                    <h3 className="text-base font-extrabold text-base-content">{t('rep_reconciliation_title', 'Carrier Invoice Reconciliation')}</h3>
                    <p className="text-xs text-base-content/60 mt-0.5">
                        {t('rep_reconciliation_desc', 'Upload or paste carrier billing invoices to audit wholesale costs and post adjustments.')}
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="flex gap-4 items-end flex-wrap">
                        <div className="space-y-1">
                            <label className="block text-xs font-bold text-base-content/70">{t('rep_select_carrier', 'Select Carrier')}:</label>
                            <select
                                value={reconcileCarrier}
                                onChange={(e) => setReconcileCarrier(e.target.value)}
                                className="select select-bordered select-sm font-bold"
                            >
                                <option value="DHL">DHL Express (شحن جوي دولي)</option>
                                <option value="LOGESTECHS">LogesTechs (توصيل ميل أخير)</option>
                                <option value="OTE">OTE Delivery</option>
                                <option value="DGR">DGR Logistics (شحن بضائع خطرة)</option>
                                <option value="GENERIC">{lang === 'ar' ? 'ناقل آخر' : 'Generic / Other Carrier'}</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-bold text-base-content/70">{t('rep_upload_csv', 'Upload CSV Invoice')}:</label>
                            <input
                                type="file"
                                accept=".csv,.txt"
                                onChange={handleFileUpload}
                                className="file-input file-input-bordered file-input-sm text-xs"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={runCarrierReconciliation}
                            disabled={reconcileLoading || !csvInput.trim()}
                            className="btn btn-sm btn-primary font-bold gap-2"
                        >
                            {reconcileLoading ? (
                                <>
                                    <span className="loading loading-spinner loading-xs" />
                                    {t('rep_auditing', 'Auditing Invoices...')}
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-base">fact_check</span>
                                    {t('rep_audit_btn', 'Audit & Match Records')}
                                </>
                            )}
                        </button>
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-bold text-base-content/70">
                            {t('rep_paste_csv_title', 'Or Paste CSV Data')} (<span className="font-mono text-[11px] text-primary">trackingNumber, billedAmount, [billedWeight], [currency]</span>):
                        </label>
                        <textarea
                            rows={4}
                            value={csvInput}
                            onChange={(e) => setCsvInput(e.target.value)}
                            placeholder="DHL-1001, 3.500, 2.0, KWD&#10;DHL-1002, 4.250, 2.5, KWD"
                            className="textarea textarea-bordered w-full font-mono text-xs"
                        />
                    </div>
                </div>

                {adjustSuccessMessage && (
                    <div className="alert alert-success text-xs py-2 px-3">
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        <span>{adjustSuccessMessage}</span>
                    </div>
                )}

                {reconcileResult && (
                    <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="bg-base-200/50 border border-base-200 rounded-xl p-4 space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/60">{t('rep_carrier_billed', 'Total Carrier Billed')}</div>
                                <div className="text-xl font-black text-base-content font-mono">{fmt(reconcileResult.summary.totalBilled)} <span className="text-xs font-sans text-base-content/60">{curSymbol}</span></div>
                            </div>
                            <div className="bg-base-200/50 border border-base-200 rounded-xl p-4 space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/60">{t('rep_internal_cost', 'Internal Expected Cost')}</div>
                                <div className="text-xl font-black text-base-content font-mono">{fmt(reconcileResult.summary.totalExpected)} <span className="text-xs font-sans text-base-content/60">{curSymbol}</span></div>
                            </div>
                            <div className="bg-base-200/50 border border-base-200 rounded-xl p-4 space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/60">{t('rep_cost_variance', 'Total Cost Variance')}</div>
                                <div className={`text-xl font-black font-mono ${reconcileResult.summary.totalVariance > 0 ? 'text-error' : reconcileResult.summary.totalVariance < 0 ? 'text-success' : 'text-base-content'}`}>
                                    {reconcileResult.summary.totalVariance > 0 ? `+${fmt(reconcileResult.summary.totalVariance)}` : fmt(reconcileResult.summary.totalVariance)} <span className="text-xs font-sans text-base-content/60">{curSymbol}</span>
                                </div>
                            </div>
                            <div className="bg-base-200/50 border border-base-200 rounded-xl p-4 space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/60">{t('rep_discrepancies', 'Discrepancies / Unmatched')}</div>
                                <div className="text-xl font-black text-warning font-mono">
                                    {reconcileResult.summary.discrepancyCount} / {reconcileResult.summary.unmatchedCount}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center gap-3 flex-wrap">
                            <h4 className="font-bold text-sm text-base-content">
                                {lang === 'ar' ? `نتائج المطابقة التفصيلية (${reconcileResult.items.length} سجل)` : `Itemized Audit Comparison (${reconcileResult.items.length} records)`}
                            </h4>
                            <div className="flex gap-2">
                                <ExportButton data={reconcileResult.items} filename={`Carrier_Reconciliation_${reconcileCarrier}`} />
                                {reconcileResult.summary.discrepancyCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={handlePostAdjustments}
                                        disabled={postingAdjustments}
                                        className="btn btn-sm btn-primary font-bold gap-1.5"
                                    >
                                        {postingAdjustments ? t('rep_posting', 'Posting...') : `${t('rep_post_adjustments', 'Post Adjustments')} (${reconcileResult.summary.discrepancyCount})`}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-base-200 rounded-xl">
                            <table className="table table-sm w-full">
                                <thead className="bg-base-200/60 text-xs">
                                    <tr>
                                        <th>{t('rep_tracking', 'Tracking / AWB')}</th>
                                        <th>{t('status', 'Status')}</th>
                                        <th>{t('org_company_entity', 'Organization')}</th>
                                        <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_carrier_billed', 'Carrier Billed')}</th>
                                        <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_internal_cost', 'Expected Cost')}</th>
                                        <th className={isRTL ? 'text-start' : 'text-end'}>{t('rep_cost_variance', 'Cost Delta')}</th>
                                        <th>{t('rep_audit_notes', 'Audit Notes')}</th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs">
                                    {reconcileResult.items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-base-200/40">
                                            <td className="font-mono font-bold text-primary">{item.trackingNumber}</td>
                                            <td>
                                                <span className={`badge badge-sm font-bold ${
                                                    item.status === 'MATCHED_EXACT' ? 'badge-success' :
                                                    item.status === 'SURCHARGE_DISCREPANCY' ? 'badge-error' :
                                                    item.status === 'CREDIT_DISCREPANCY' ? 'badge-info' : 'badge-warning'
                                                }`}>
                                                    {item.status.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="font-medium text-base-content">{item.organizationName || '-'}</td>
                                            <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono font-bold`}>{fmt(item.billedAmount)} {item.currency === 'KWD' ? curSymbol : item.currency}</td>
                                            <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono`}>{fmt(item.expectedAmount)} {item.currency === 'KWD' ? curSymbol : item.currency}</td>
                                            <td className={`${isRTL ? 'text-start' : 'text-end'} font-mono font-black ${item.deltaAmount > 0 ? 'text-error' : item.deltaAmount < 0 ? 'text-success' : 'text-base-content'}`}>
                                                {item.deltaAmount > 0 ? `+${fmt(item.deltaAmount)}` : fmt(item.deltaAmount)} {item.currency === 'KWD' ? curSymbol : item.currency}
                                            </td>
                                            <td className="text-base-content/60 text-xs">{item.reason}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-2 flex-wrap">
                <button
                    type="button"
                    className={`btn btn-sm ${activeReport === 'profitability' ? 'btn-primary font-bold' : 'btn-ghost'}`}
                    onClick={() => setActiveReport('profitability')}
                >
                    <span className="material-symbols-outlined text-base">trending_up</span>
                    {t('rep_tab_profitability', 'Shipment Profitability & COGS')}
                </button>
                <button
                    type="button"
                    className={`btn btn-sm ${activeReport === 'reconciliation' ? 'btn-primary font-bold' : 'btn-ghost'}`}
                    onClick={() => setActiveReport('reconciliation')}
                >
                    <span className="material-symbols-outlined text-base">receipt_long</span>
                    {t('rep_tab_reconciliation', 'Carrier Reconciliation')}
                </button>
                <button
                    type="button"
                    className={`btn btn-sm ${activeReport === 'cod' ? 'btn-primary font-bold' : 'btn-ghost'}`}
                    onClick={() => setActiveReport('cod')}
                >
                    <span className="material-symbols-outlined text-base">payments</span>
                    {t('rep_tab_cod', 'Driver COD Clearing')}
                </button>
                <button
                    type="button"
                    className={`btn btn-sm ${activeReport === 'revenue' ? 'btn-primary font-bold' : 'btn-ghost'}`}
                    onClick={() => setActiveReport('revenue')}
                >
                    <span className="material-symbols-outlined text-base">calendar_today</span>
                    {t('rep_tab_revenue', 'Revenue & Collections')}
                </button>
                {organizations.length > 0 && (
                    <button
                        type="button"
                        className={`btn btn-sm ${activeReport === 'balances' ? 'btn-primary font-bold' : 'btn-ghost'}`}
                        onClick={() => setActiveReport('balances')}
                    >
                        <span className="material-symbols-outlined text-base">account_balance</span>
                        {t('rep_tab_balances', 'Organization Balances')}
                    </button>
                )}
                <button
                    type="button"
                    className={`btn btn-sm ${activeReport === 'rates' ? 'btn-primary font-bold' : 'btn-ghost'}`}
                    onClick={() => setActiveReport('rates')}
                >
                    <span className="material-symbols-outlined text-base">currency_exchange</span>
                    {t('rep_tab_rates', 'Multi-Currency FX Rates')}
                </button>
            </div>

            {activeReport === 'profitability' && renderProfitability()}
            {activeReport === 'reconciliation' && renderCarrierReconciliation()}
            {activeReport === 'cod' && renderCodReport()}
            {activeReport === 'revenue' && renderDailyRevenue()}
            {activeReport === 'balances' && renderOrgBalances()}
            {activeReport === 'rates' && renderExchangeRates()}
        </div>
    );
};

export default FinanceReports;
