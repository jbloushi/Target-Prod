import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Card, Table, Thead, Tbody, Tr, Th, Td, Button, Loader, StatusPill, Modal, Select } from '../ui';
import ExportButton from '../components/ExportButton';
import { financeService, whatsappService } from '../services/api';
import { generateAccountStatementPDF } from '../utils/pdfGenerator';
import { format } from 'date-fns';
import { TK } from '../tokens/kineticHorizon';
import { useLanguage } from '../context/LanguageContext';

const ReportContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const ReportHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 12px;
`;

const ReportTitle = styled.h3`
    font-size: 18px;
    font-weight: 700;
    margin: 0;
    color: ${TK.text1};
`;

const SummaryGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 14px;
    margin-bottom: 20px;
`;

const SummaryCard = styled.div`
    background: #f8fafc;
    border: 1px solid ${TK.border};
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const SummaryLabel = styled.div`
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: ${TK.text3};
    letter-spacing: 0.04em;
`;

const SummaryValue = styled.div`
    font-size: 20px;
    font-weight: 800;
    color: ${props => props.$color || TK.text1};
`;

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
            <Card>
                <ReportHeader>
                    <div>
                        <ReportTitle>{t('rep_cogs_title', 'Carrier COGS & Shipment Profitability')}</ReportTitle>
                        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: TK.text2 }}>
                            {t('rep_cogs_desc', 'Real-time double-entry margin analysis comparing wholesale carrier cost vs. billed revenue.')}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Button variant="outline" onClick={loadProfitability} disabled={loading} style={{ height: 36, padding: '0 12px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                        </Button>
                        <ExportButton data={exportRows} filename="Shipment_Profitability_Report" />
                    </div>
                </ReportHeader>

                {/* Summary KPI Cards */}
                <SummaryGrid>
                    <SummaryCard>
                        <SummaryLabel>{t('rep_total_revenue', 'Total Billed Revenue')}</SummaryLabel>
                        <SummaryValue>{fmt(summary.totalRevenue)} <span style={{ fontSize: 13 }}>{curSymbol}</span></SummaryValue>
                    </SummaryCard>
                    <SummaryCard>
                        <SummaryLabel>{t('rep_wholesale_cost', 'Wholesale Carrier Cost (COGS)')}</SummaryLabel>
                        <SummaryValue $color="#dc2626">{fmt(summary.totalCost)} <span style={{ fontSize: 13 }}>{curSymbol}</span></SummaryValue>
                    </SummaryCard>
                    <SummaryCard>
                        <SummaryLabel>{t('rep_net_gross_profit', 'Net Gross Profit')}</SummaryLabel>
                        <SummaryValue $color="#16a34a">{fmt(summary.totalProfit)} <span style={{ fontSize: 13 }}>{curSymbol}</span></SummaryValue>
                    </SummaryCard>
                    <SummaryCard>
                        <SummaryLabel>{t('rep_overall_margin', 'Overall Gross Margin')}</SummaryLabel>
                        <SummaryValue $color={summary.overallMarginPercent >= 0 ? '#16a34a' : '#dc2626'}>
                            {summary.overallMarginPercent || 0}%
                        </SummaryValue>
                    </SummaryCard>
                </SummaryGrid>

                {loading ? (
                    <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Loader /></div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <Table>
                            <Thead>
                                <Tr>
                                    <Th>{t('rep_tracking', 'Tracking')}</Th>
                                    <Th>{t('rep_carrier', 'Carrier')}</Th>
                                    <Th>{t('rep_date', 'Date')}</Th>
                                    <Th>{t('rep_customer', 'Customer')}</Th>
                                    <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_cost', 'Wholesale Cost')}</Th>
                                    <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_revenue', 'Billed Revenue')}</Th>
                                    <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_profit', 'Gross Profit')}</Th>
                                    <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_margin_pct', 'Margin %')}</Th>
                                    <Th style={{ textAlign: 'center' }}>{t('rep_payment', 'Payment')}</Th>
                                </Tr>
                            </Thead>
                            <Tbody>
                                {items.length > 0 ? items.map((row) => (
                                    <Tr key={row.id}>
                                        <Td style={{ fontWeight: 700 }}>{row.trackingNumber}</Td>
                                        <Td>
                                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9' }}>
                                                {row.carrierCode}
                                            </span>
                                        </Td>
                                        <Td style={{ fontSize: 12 }}>{format(new Date(row.createdAt), 'MMM dd, yyyy')}</Td>
                                        <Td>{row.customerName}</Td>
                                        <Td style={{ textAlign: isRTL ? 'left' : 'right', color: '#dc2626' }}>{fmt(row.cost)} {row.currency === 'KWD' ? curSymbol : row.currency}</Td>
                                        <Td style={{ textAlign: isRTL ? 'left' : 'right', fontWeight: 600 }}>{fmt(row.revenue)} {row.currency === 'KWD' ? curSymbol : row.currency}</Td>
                                        <Td style={{ textAlign: isRTL ? 'left' : 'right', fontWeight: 800, color: row.profit >= 0 ? '#16a34a' : '#dc2626' }}>
                                            {fmt(row.profit)} {row.currency === 'KWD' ? curSymbol : row.currency}
                                        </Td>
                                        <Td style={{ textAlign: isRTL ? 'left' : 'right', fontWeight: 700 }}>{row.marginPercent}%</Td>
                                        <Td style={{ textAlign: 'center' }}>
                                            <StatusPill status={row.paid ? 'paid' : 'unpaid'} />
                                        </Td>
                                    </Tr>
                                )) : (
                                    <Tr><Td colSpan={9} style={{ textAlign: 'center', padding: '30px' }}>{t('no_shipments_found', 'No shipments found')}</Td></Tr>
                                )}
                            </Tbody>
                        </Table>
                    </div>
                )}
            </Card>
        );
    };

    const renderCodReport = () => {
        const shipments = codData.shipments || [];
        const unremittedTotals = codData.unremittedTotalsByCurrency || {};

        return (
            <Card>
                <ReportHeader>
                    <div>
                        <ReportTitle>{t('rep_cod_title', 'Driver Cash-on-Delivery (COD) Clearing')}</ReportTitle>
                        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: TK.text2 }}>
                            {t('rep_cod_desc', 'Track cash collected by drivers upon delivery and reconcile hub vault handovers.')}
                        </p>
                    </div>
                    <Button variant="outline" onClick={loadCodSummary} disabled={loading} style={{ height: 36, padding: '0 12px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                    </Button>
                </ReportHeader>

                <SummaryGrid>
                    <SummaryCard>
                        <SummaryLabel>{t('rep_unremitted_shipments', 'Unremitted COD Shipments')}</SummaryLabel>
                        <SummaryValue>{codData.unremittedCount || 0}</SummaryValue>
                    </SummaryCard>
                    {Object.entries(unremittedTotals).map(([cur, amt]) => (
                        <SummaryCard key={cur}>
                            <SummaryLabel>{t('rep_unremitted_cash', 'Unremitted Cash')} ({cur === 'KWD' ? curSymbol : cur})</SummaryLabel>
                            <SummaryValue $color="#ea580c">{fmt(amt)} <span style={{ fontSize: 13 }}>{cur === 'KWD' ? curSymbol : cur}</span></SummaryValue>
                        </SummaryCard>
                    ))}
                </SummaryGrid>

                <div style={{ overflowX: 'auto' }}>
                    <Table>
                        <Thead>
                            <Tr>
                                <Th>{t('rep_tracking', 'Tracking')}</Th>
                                <Th>{t('rep_driver', 'Driver')}</Th>
                                <Th>{t('rep_cod_amount', 'COD Amount')}</Th>
                                <Th>{t('rep_delivery_status', 'Delivery Status')}</Th>
                                <Th>{t('rep_cod_clearing_status', 'COD Clearing Status')}</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {shipments.length > 0 ? shipments.map((s) => (
                                <Tr key={s.id}>
                                    <Td style={{ fontWeight: 700 }}>{s.trackingNumber}</Td>
                                    <Td>{s.assignedDriver?.name || (lang === 'ar' ? 'غير مسند' : 'Unassigned')}</Td>
                                    <Td style={{ fontWeight: 700 }}>{fmt(s.codAmount)} {s.codCurrency === 'KWD' ? curSymbol : (s.codCurrency || curSymbol)}</Td>
                                    <Td><StatusPill status={s.status} /></Td>
                                    <Td>
                                        <span style={{
                                            fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
                                            background: s.codStatus === 'REMITTED' ? '#dcfce7' : '#ffedd5',
                                            color: s.codStatus === 'REMITTED' ? '#16a34a' : '#c2410c'
                                        }}>
                                            {s.codStatus === 'REMITTED' ? (lang === 'ar' ? 'تم التوريد' : 'REMITTED') : (lang === 'ar' ? 'قيد التوريد' : 'PENDING')}
                                        </span>
                                    </Td>
                                </Tr>
                            )) : (
                                <Tr><Td colSpan={5} style={{ textAlign: 'center', padding: '30px' }}>{t('no_shipments_found', 'No COD shipments found')}</Td></Tr>
                            )}
                        </Tbody>
                    </Table>
                </div>
            </Card>
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
            <Card>
                <ReportHeader>
                    <ReportTitle>{t('rep_daily_rev_title', 'Daily Invoiced Revenue & Collections')}</ReportTitle>
                    <ExportButton data={data} filename="Daily_Revenue_Collections" />
                </ReportHeader>
                <Table>
                    <Thead>
                        <Tr>
                            <Th>{t('rep_date', 'Date')}</Th>
                            <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_invoiced_charges', 'Invoiced Charges')} ({curSymbol})</Th>
                            <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_payments_collected', 'Payments Collected')} ({curSymbol})</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        {data.length > 0 ? data.map((row, i) => (
                            <Tr key={i}>
                                <Td>{row.date}</Td>
                                <Td style={{ textAlign: isRTL ? 'left' : 'right', fontWeight: 600 }}>{fmt(row.revenue)}</Td>
                                <Td style={{ textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: '#16a34a' }}>{fmt(row.received)}</Td>
                            </Tr>
                        )) : (
                            <Tr><Td colSpan={3} style={{ textAlign: 'center', padding: '20px' }}>{t('fin_no_transactions', 'No transactions found')}</Td></Tr>
                        )}
                    </Tbody>
                </Table>
            </Card>
        );
    };

    const [downloadingOrgId, setDownloadingOrgId] = useState(null);
    const [sendingStatementOrgId, setSendingStatementOrgId] = useState(null);
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

            // Auto-select preferred approved template
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
            <Card>
                <ReportHeader>
                    <ReportTitle>{t('rep_client_org_balances', 'Client & Organization Balances')}</ReportTitle>
                    <ExportButton data={data.map(({ rawOrg, ...rest }) => rest)} filename="Organization_Balances" />
                </ReportHeader>

                {sendSuccessMsg && (
                    <div style={{
                        padding: '10px 14px',
                        background: '#dcfce7',
                        color: '#15803d',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '13px',
                        marginBottom: '14px'
                    }}>
                        ✓ {sendSuccessMsg}
                    </div>
                )}

                <div style={{ overflowX: 'auto' }}>
                    <Table>
                        <Thead>
                            <Tr>
                                <Th>{t('org_company_entity', 'Organization')}</Th>
                                <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_credit_limit', 'Credit Limit')} ({curSymbol})</Th>
                                <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_current_balance', 'Current Balance')} ({curSymbol})</Th>
                                <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_unapplied_cash', 'Unapplied Cash')} ({curSymbol})</Th>
                                <Th>{t('status', 'Status')}</Th>
                                <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('actions', 'Actions')}</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {data.length > 0 ? data.map((row, i) => (
                                <Tr key={i}>
                                    <Td style={{ fontWeight: 600 }}>{row.Organization}</Td>
                                    <Td style={{ textAlign: isRTL ? 'left' : 'right' }}>{row['Credit Limit']}</Td>
                                    <Td style={{ textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: parseFloat(row['Current Balance']) > 0 ? '#dc2626' : 'inherit' }}>
                                        {row['Current Balance']}
                                    </Td>
                                    <Td style={{ textAlign: isRTL ? 'left' : 'right', color: parseFloat(row['Unapplied Cash']) > 0 ? '#16a34a' : 'inherit' }}>
                                        {row['Unapplied Cash']}
                                    </Td>
                                    <Td>{row.Status}</Td>
                                    <Td style={{ textAlign: isRTL ? 'left' : 'right' }}>
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: isRTL ? 'flex-start' : 'flex-end' }}>
                                            <Button
                                                variant="outline"
                                                size="small"
                                                onClick={() => handleDownloadStatement(row.id)}
                                                disabled={downloadingOrgId === row.id}
                                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 14, marginInlineEnd: 4 }}>picture_as_pdf</span>
                                                {downloadingOrgId === row.id ? '...' : 'PDF'}
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="small"
                                                onClick={() => handleOpenWhatsappModal(row.rawOrg)}
                                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 14, marginInlineEnd: 4 }}>send</span>
                                                WhatsApp
                                            </Button>
                                        </div>
                                    </Td>
                                </Tr>
                            )) : (
                                <Tr><Td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>{lang === 'ar' ? 'لا توجد شركات أو حسابات مسجلة' : 'No organizations found'}</Td></Tr>
                            )}
                        </Tbody>
                    </Table>
                </div>

                {/* WhatsApp Template Selection Modal */}
                <Modal
                    isOpen={whatsappModalOpen}
                    onClose={() => setWhatsappModalOpen(false)}
                    title={lang === 'ar' ? 'إرسال كشف الحساب عبر واتساب' : 'Dispatch Statement via WhatsApp'}
                >
                    <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
                            <div><strong>{lang === 'ar' ? 'الجهة المستلمة:' : 'Recipient Entity:'}</strong> {selectedOrgForWhatsapp?.name}</div>
                            <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                                <strong>{lang === 'ar' ? 'رقم الواتساب المسجل:' : 'WhatsApp Phone:'}</strong> {selectedOrgForWhatsapp?.billingWhatsappNumber || '+965 99554433'}
                            </div>
                            <div style={{ background: '#ecfdf5', color: '#047857', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, marginTop: 8, display: 'inline-block' }}>
                                🧪 {lang === 'ar' ? 'وضع التطوير (Sandbox): موجه إلى هاتف المطور: +201040957289' : 'Dev Sandbox: Safely routed to developer phone: +201040957289'}
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: TK.text1 }}>
                                {lang === 'ar' ? 'قالب رسالة واتساب (Meta Cloud API)' : 'WhatsApp Template (Meta Cloud API)'}
                            </label>
                            {loadingTemplates ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: TK.text2 }}>
                                    <Loader /> {lang === 'ar' ? 'جاري جلب القوالب المعتمدة من Meta...' : 'Fetching live templates from Meta...'}
                                </div>
                            ) : (
                                <Select
                                    value={selectedTemplateName}
                                    onChange={(e) => setSelectedTemplateName(e.target.value)}
                                    style={{ width: '100%', marginBottom: 0 }}
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
                                            {lang === 'ar' ? 'رسالة نصية مباشرة (Direct Text - جلسة نشطة)' : 'Direct Text Message (Active Session Window)'}
                                        </option>
                                    </optgroup>
                                </Select>
                            )}
                            <div style={{ fontSize: 11.5, color: TK.text3, marginTop: 4 }}>
                                {lang === 'ar' 
                                    ? 'يُوصى باختيار قالب معتمد (Approved) لضمان تسليم الرسالة فوراً خارج نافذة ٢٤ ساعة.'
                                    : 'Select an APPROVED template to ensure immediate delivery outside the 24-hour customer window.'}
                            </div>
                        </div>

                        {/* Live Message Preview */}
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4, color: TK.text2 }}>
                                {lang === 'ar' ? 'معاينة الإشعار:' : 'Message Preview:'}
                            </div>
                            <div style={{
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                borderRadius: 10,
                                padding: '12px 14px',
                                fontSize: 12,
                                fontFamily: 'monospace',
                                color: '#1e293b',
                                whiteSpace: 'pre-line',
                                maxHeight: '140px',
                                overflowY: 'auto'
                            }}>
                                {`📋 TARGET LOGISTICS - ACCOUNT STATEMENT\n` +
                                 `🏢 Account: ${selectedOrgForWhatsapp?.name || ''}\n` +
                                 `💰 Current Outstanding: ${fmt(selectedOrgForWhatsapp?.balance)} ${curSymbol}\n` +
                                 `💳 Credit Limit: ${fmt(selectedOrgForWhatsapp?.creditLimit)} ${curSymbol}\n` +
                                 `📅 Date: ${new Date().toLocaleDateString('en-GB')}\n` +
                                 `------------------------------------\n` +
                                 `Template Mode: [${selectedTemplateName || 'Auto-Detect'}]`}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                            <Button variant="secondary" onClick={() => setWhatsappModalOpen(false)}>
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleConfirmSendWhatsapp}
                                disabled={sendingWhatsapp || !selectedTemplateName}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16, marginInlineEnd: 6 }}>send</span>
                                {sendingWhatsapp ? (lang === 'ar' ? 'جاري الإرسال...' : 'Sending...') : (lang === 'ar' ? 'إرسال الإشعار' : 'Dispatch WhatsApp')}
                            </Button>
                        </div>
                    </div>
                </Modal>
            </Card>
        );
    };

    // --- Multi-Currency FX Rates State & Logic ---
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
            <Card>
                <ReportHeader>
                    <div>
                        <ReportTitle>{t('rep_fx_title', 'Multi-Currency Exchange Rates & Conversion Engine')}</ReportTitle>
                        <div style={{ fontSize: '13px', color: TK.text2, marginTop: '4px' }}>
                            {t('rep_fx_desc', 'Base Reference Currency: Kuwaiti Dinar (KWD).')}
                        </div>
                    </div>
                </ReportHeader>

                {/* Quick Conversion Calculator Strip */}
                <div style={{
                    padding: '16px',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    border: `1px solid ${TK.border}`,
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap'
                }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: TK.text2 }}>{t('rep_live_fx_calc', 'Live FX Calculator')}:</span>
                    <input
                        type="number"
                        value={calcAmount}
                        onChange={(e) => setCalcAmount(e.target.value)}
                        style={{
                            width: '100px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: `1px solid ${TK.border}`,
                            fontWeight: 700
                        }}
                    />
                    <select
                        value={calcFrom}
                        onChange={(e) => setCalcFrom(e.target.value)}
                        style={{ padding: '6px 8px', borderRadius: '6px', border: `1px solid ${TK.border}`, fontWeight: 600 }}
                    >
                        {Object.keys(exchangeRates).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <span style={{ fontWeight: 700, color: TK.text2 }}>=</span>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#16a34a' }}>
                        {performConversion(calcAmount, calcFrom, calcTo)}
                    </span>
                    <select
                        value={calcTo}
                        onChange={(e) => setCalcTo(e.target.value)}
                        style={{ padding: '6px 8px', borderRadius: '6px', border: `1px solid ${TK.border}`, fontWeight: 600 }}
                    >
                        {Object.keys(exchangeRates).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <Table>
                    <Thead>
                        <Tr>
                            <Th>{t('rep_currency_code', 'Currency Code')}</Th>
                            <Th>{t('rep_currency_name', 'Currency Name')}</Th>
                            <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_rate_in_kwd', 'Rate in KWD (1 Unit =)')}</Th>
                            <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_kwd_parity', 'KWD Parity (1 KWD =)')}</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
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
                                <Tr key={code}>
                                    <Td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{code}</Td>
                                    <Td>{lang === 'ar' ? arName : enName}</Td>
                                    <Td style={{ textAlign: isRTL ? 'left' : 'right', fontWeight: 700 }}>
                                        {numRate.toFixed(4)} {curSymbol}
                                    </Td>
                                    <Td style={{ textAlign: isRTL ? 'left' : 'right', color: TK.text2 }}>
                                        {parity} {code}
                                    </Td>
                                </Tr>
                            );
                        })}
                    </Tbody>
                </Table>
            </Card>
        );
    };

    const renderCarrierReconciliation = () => {
        return (
            <Card>
                <ReportHeader>
                    <div>
                        <ReportTitle>{t('rep_reconciliation_title', 'Carrier Invoice Reconciliation')}</ReportTitle>
                        <div style={{ fontSize: '13px', color: TK.text2, marginTop: '4px' }}>
                            {t('rep_reconciliation_desc', 'Upload or paste carrier billing invoices to audit wholesale costs and post adjustments.')}
                        </div>
                    </div>
                </ReportHeader>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: TK.text2 }}>{t('rep_select_carrier', 'Select Carrier')}:</label>
                            <select
                                value={reconcileCarrier}
                                onChange={(e) => setReconcileCarrier(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: `1px solid ${TK.border}`,
                                    fontWeight: 600
                                }}
                            >
                                <option value="DHL">DHL Express (شحن جوي دولي)</option>
                                <option value="LOGESTECHS">LogesTechs (توصيل ميل أخير)</option>
                                <option value="OTE">OTE Delivery</option>
                                <option value="DGR">DGR Logistics (شحن بضائع خطرة)</option>
                                <option value="GENERIC">{lang === 'ar' ? 'ناقل آخر' : 'Generic / Other Carrier'}</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: TK.text2 }}>{t('rep_upload_csv', 'Upload CSV Invoice')}:</label>
                            <input
                                type="file"
                                accept=".csv,.txt"
                                onChange={handleFileUpload}
                                style={{ fontSize: '13px' }}
                            />
                        </div>

                        <Button
                            variant="primary"
                            onClick={runCarrierReconciliation}
                            disabled={reconcileLoading || !csvInput.trim()}
                            style={{ alignSelf: 'flex-end' }}
                        >
                            {reconcileLoading ? t('rep_auditing', 'Auditing Invoices...') : t('rep_audit_btn', 'Audit & Match Records')}
                        </Button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: TK.text2 }}>
                            {t('rep_paste_csv_title', 'Or Paste CSV Data')} (Format: <code style={{ background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px' }}>trackingNumber, billedAmount, [billedWeight], [currency]</code>):
                        </label>
                        <textarea
                            rows={4}
                            value={csvInput}
                            onChange={(e) => setCsvInput(e.target.value)}
                            placeholder="DHL-1001, 3.500, 2.0, KWD&#10;DHL-1002, 4.250, 2.5, KWD"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${TK.border}`,
                                fontFamily: 'monospace',
                                fontSize: '13px'
                            }}
                        />
                    </div>
                </div>

                {adjustSuccessMessage && (
                    <div style={{
                        padding: '12px 16px',
                        background: '#dcfce7',
                        color: '#15803d',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '14px',
                        marginBottom: '16px'
                    }}>
                        ✓ {adjustSuccessMessage}
                    </div>
                )}

                {reconcileResult && (
                    <div>
                        <SummaryGrid>
                            <SummaryCard>
                                <SummaryLabel>{t('rep_carrier_billed', 'Total Carrier Billed')}</SummaryLabel>
                                <SummaryValue>{fmt(reconcileResult.summary.totalBilled)} <span style={{ fontSize: 13 }}>{curSymbol}</span></SummaryValue>
                            </SummaryCard>
                            <SummaryCard>
                                <SummaryLabel>{t('rep_internal_cost', 'Internal Expected Cost')}</SummaryLabel>
                                <SummaryValue>{fmt(reconcileResult.summary.totalExpected)} <span style={{ fontSize: 13 }}>{curSymbol}</span></SummaryValue>
                            </SummaryCard>
                            <SummaryCard>
                                <SummaryLabel>{t('rep_cost_variance', 'Total Cost Variance')}</SummaryLabel>
                                <SummaryValue $color={reconcileResult.summary.totalVariance > 0 ? '#dc2626' : (reconcileResult.summary.totalVariance < 0 ? '#16a34a' : 'inherit')}>
                                    {reconcileResult.summary.totalVariance > 0 ? `+${fmt(reconcileResult.summary.totalVariance)}` : fmt(reconcileResult.summary.totalVariance)} <span style={{ fontSize: 13 }}>{curSymbol}</span>
                                </SummaryValue>
                            </SummaryCard>
                            <SummaryCard>
                                <SummaryLabel>{t('rep_discrepancies', 'Discrepancies / Unmatched')}</SummaryLabel>
                                <SummaryValue $color={reconcileResult.summary.discrepancyCount > 0 ? '#ea580c' : 'inherit'}>
                                    {reconcileResult.summary.discrepancyCount} / {reconcileResult.summary.unmatchedCount}
                                </SummaryValue>
                            </SummaryCard>
                        </SummaryGrid>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                                {lang === 'ar' ? `نتائج المطابقة التفصيلية (${reconcileResult.items.length} سجل)` : `Itemized Audit Comparison (${reconcileResult.items.length} records)`}
                            </h4>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <ExportButton data={reconcileResult.items} filename={`Carrier_Reconciliation_${reconcileCarrier}`} />
                                {reconcileResult.summary.discrepancyCount > 0 && (
                                    <Button
                                        variant="secondary"
                                        onClick={handlePostAdjustments}
                                        disabled={postingAdjustments}
                                    >
                                        {postingAdjustments ? t('rep_posting', 'Posting...') : `${t('rep_post_adjustments', 'Post Adjustments')} (${reconcileResult.summary.discrepancyCount})`}
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <Table>
                                <Thead>
                                    <Tr>
                                        <Th>{t('rep_tracking', 'Tracking / AWB')}</Th>
                                        <Th>{t('status', 'Status')}</Th>
                                        <Th>{t('org_company_entity', 'Organization')}</Th>
                                        <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_carrier_billed', 'Carrier Billed')}</Th>
                                        <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_internal_cost', 'Expected Cost')}</Th>
                                        <Th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('rep_cost_variance', 'Cost Delta')}</Th>
                                        <Th>{t('rep_audit_notes', 'Audit Notes')}</Th>
                                    </Tr>
                                </Thead>
                                <Tbody>
                                    {reconcileResult.items.map((item, idx) => (
                                        <Tr key={idx}>
                                            <Td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                                {item.trackingNumber}
                                            </Td>
                                            <Td>
                                                <StatusPill
                                                    $status={
                                                        item.status === 'MATCHED_EXACT' ? 'DELIVERED' :
                                                        item.status === 'SURCHARGE_DISCREPANCY' ? 'FAILED' :
                                                        item.status === 'CREDIT_DISCREPANCY' ? 'IN_TRANSIT' : 'CANCELLED'
                                                    }
                                                >
                                                    {item.status.replace(/_/g, ' ')}
                                                </StatusPill>
                                            </Td>
                                            <Td>{item.organizationName || '-'}</Td>
                                            <Td style={{ textAlign: isRTL ? 'left' : 'right', fontWeight: 600 }}>{fmt(item.billedAmount)} {item.currency === 'KWD' ? curSymbol : item.currency}</Td>
                                            <Td style={{ textAlign: isRTL ? 'left' : 'right' }}>{fmt(item.expectedAmount)} {item.currency === 'KWD' ? curSymbol : item.currency}</Td>
                                            <Td style={{
                                                textAlign: isRTL ? 'left' : 'right',
                                                fontWeight: 700,
                                                color: item.deltaAmount > 0 ? '#dc2626' : (item.deltaAmount < 0 ? '#16a34a' : 'inherit')
                                            }}>
                                                {item.deltaAmount > 0 ? `+${fmt(item.deltaAmount)}` : fmt(item.deltaAmount)} {item.currency === 'KWD' ? curSymbol : item.currency}
                                            </Td>
                                            <Td style={{ fontSize: '12px', color: TK.text2 }}>{item.reason}</Td>
                                        </Tr>
                                    ))}
                                </Tbody>
                            </Table>
                        </div>
                    </div>
                )}
            </Card>
        );
    };

    return (
        <ReportContainer>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Button
                    variant={activeReport === 'profitability' ? 'primary' : 'outline'}
                    onClick={() => setActiveReport('profitability')}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, marginInlineEnd: 6 }}>trending_up</span>
                    {t('rep_tab_profitability', 'Shipment Profitability & COGS')}
                </Button>
                <Button
                    variant={activeReport === 'reconciliation' ? 'primary' : 'outline'}
                    onClick={() => setActiveReport('reconciliation')}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, marginInlineEnd: 6 }}>receipt_long</span>
                    {t('rep_tab_reconciliation', 'Carrier Reconciliation')}
                </Button>
                <Button
                    variant={activeReport === 'cod' ? 'primary' : 'outline'}
                    onClick={() => setActiveReport('cod')}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, marginInlineEnd: 6 }}>payments</span>
                    {t('rep_tab_cod', 'Driver COD Clearing')}
                </Button>
                <Button
                    variant={activeReport === 'revenue' ? 'primary' : 'outline'}
                    onClick={() => setActiveReport('revenue')}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, marginInlineEnd: 6 }}>calendar_today</span>
                    {t('rep_tab_revenue', 'Revenue & Collections')}
                </Button>
                {organizations.length > 0 && (
                    <Button
                        variant={activeReport === 'balances' ? 'primary' : 'outline'}
                        onClick={() => setActiveReport('balances')}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 16, marginInlineEnd: 6 }}>account_balance</span>
                        {t('rep_tab_balances', 'Organization Balances')}
                    </Button>
                )}
                <Button
                    variant={activeReport === 'rates' ? 'primary' : 'outline'}
                    onClick={() => setActiveReport('rates')}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, marginInlineEnd: 6 }}>currency_exchange</span>
                    {t('rep_tab_rates', 'Multi-Currency FX Rates')}
                </Button>
            </div>

            {activeReport === 'profitability' && renderProfitability()}
            {activeReport === 'reconciliation' && renderCarrierReconciliation()}
            {activeReport === 'cod' && renderCodReport()}
            {activeReport === 'revenue' && renderDailyRevenue()}
            {activeReport === 'balances' && renderOrgBalances()}
            {activeReport === 'rates' && renderExchangeRates()}
        </ReportContainer>
    );
};

export default FinanceReports;


