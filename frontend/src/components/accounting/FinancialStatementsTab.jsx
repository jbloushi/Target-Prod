import React, { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import { financeService } from '../../services/api';
import { TK } from '../../tokens/kineticHorizon';
import { Card, Button, WInput, Select, TableWrapper, Table, Thead, Tbody, Tr, Th, Td, Loader } from '../../ui';

const TabButton = ({ $active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
      $active ? 'bg-base-100 text-primary shadow-xs' : 'text-base-content/60 hover:text-base-content'
    }`}
  >
    {children}
  </button>
);

const KPIBar = ({ children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
    {children}
  </div>
);

const KPICard = ({ children, style }) => (
  <div style={style} className="bg-base-100 rounded-2xl border border-base-200 p-4 shadow-xs">
    {children}
  </div>
);

const FinancialStatementsTab = ({ lang = 'en' }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [statementType, setStatementType] = useState('balanceSheet'); // 'balanceSheet' | 'incomeStatement' | 'trialBalance'
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      let res;
      if (statementType === 'balanceSheet') {
        res = await financeService.getBalanceSheet({ asOfDate });
      } else if (statementType === 'incomeStatement') {
        res = await financeService.getIncomeStatement({ fromDate, toDate });
      } else {
        res = await financeService.getTrialBalance({ asOfDate });
      }
      if (res && res.success) {
        setReport(res.report);
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [statementType, asOfDate, fromDate, toDate, enqueueSnackbar]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const fmt = (num) => Number(num || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  return (
    <div>
      {/* Statement Sub-Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, padding: 4, background: '#eef2f6', borderRadius: 12 }}>
          <TabButton $active={statementType === 'balanceSheet'} onClick={() => setStatementType('balanceSheet')}>
            {lang === 'ar' ? 'الميزانية العمومية (Balance Sheet)' : 'Balance Sheet'}
          </TabButton>
          <TabButton $active={statementType === 'incomeStatement'} onClick={() => setStatementType('incomeStatement')}>
            {lang === 'ar' ? 'قائمة الدخل والأرباح (P&L)' : 'Income Statement (P&L)'}
          </TabButton>
          <TabButton $active={statementType === 'trialBalance'} onClick={() => setStatementType('trialBalance')}>
            {lang === 'ar' ? 'ميزان المراجعة (Trial Balance)' : 'Trial Balance'}
          </TabButton>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {statementType === 'incomeStatement' ? (
            <>
              <WInput
                type="date"
                label={lang === 'ar' ? 'من تاريخ' : 'From Date'}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ width: 140 }}
              />
              <WInput
                type="date"
                label={lang === 'ar' ? 'إلى تاريخ' : 'To Date'}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{ width: 140 }}
              />
            </>
          ) : (
            <WInput
              type="date"
              label={lang === 'ar' ? 'كما في تاريخ' : 'As of Date'}
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              style={{ width: 160 }}
            />
          )}
          <Button variant="outline" onClick={loadReport} style={{ height: 40, marginTop: 18 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 4 }}>refresh</span>
            {lang === 'ar' ? 'تحديث' : 'Refresh'}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card style={{ padding: 40, textAlign: 'center' }}><Loader /></Card>
      ) : report ? (
        <>
          {/* BALANCE SHEET VIEW */}
          {statementType === 'balanceSheet' && (
            <>
              <KPIBar>
                <KPICard>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    {lang === 'ar' ? 'إجمالي الأصول (Assets)' : 'Total Assets'}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: TK.primary, marginTop: 4 }}>
                    {fmt(report.totalAssets)} <span style={{ fontSize: 13 }}>KWD</span>
                  </div>
                </KPICard>
                <KPICard>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    {lang === 'ar' ? 'إجمالي الالتزامات (Liabilities)' : 'Total Liabilities'}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#e67e22', marginTop: 4 }}>
                    {fmt(report.liabilities?.total)} <span style={{ fontSize: 13 }}>KWD</span>
                  </div>
                </KPICard>
                <KPICard>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    {lang === 'ar' ? 'حقوق الملكية (Equity)' : 'Total Equity'}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: TK.success, marginTop: 4 }}>
                    {fmt(report.equity?.total)} <span style={{ fontSize: 13 }}>KWD</span>
                  </div>
                </KPICard>
                <KPICard style={{ borderLeft: report.isBalanced ? `4px solid ${TK.success}` : `4px solid ${TK.error}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    {lang === 'ar' ? 'توازن المعادلة المحاسبية' : 'Accounting Equation'}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: report.isBalanced ? TK.success : TK.error, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      {report.isBalanced ? 'check_circle' : 'error'}
                    </span>
                    {report.isBalanced
                      ? (lang === 'ar' ? 'متوازنة (الأصول = الخصوم + الملكية)' : 'Balanced (A = L + E)')
                      : `Difference: ${fmt(report.difference)} KWD`}
                  </div>
                </KPICard>
              </KPIBar>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
                {/* Assets Card */}
                <Card title={lang === 'ar' ? 'الأصول (Assets)' : 'Assets (1xxx)'}>
                  <TableWrapper>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>{lang === 'ar' ? 'رمز الحساب' : 'Code'}</Th>
                          <Th>{lang === 'ar' ? 'اسم الحساب' : 'Account'}</Th>
                          <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'الرصيد (د.ك)' : 'Balance (KWD)'}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {report.assets?.items?.map(acc => (
                          <Tr key={acc.id}>
                            <Td style={{ fontWeight: 700, color: TK.primary }}>{acc.code}</Td>
                            <Td>{acc.name}</Td>
                            <Td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(acc.netBalance)}</Td>
                          </Tr>
                        ))}
                        <Tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                          <Td colSpan={2}>{lang === 'ar' ? 'مجموع الأصول' : 'Total Assets'}</Td>
                          <Td style={{ textAlign: 'right', color: TK.primary }}>{fmt(report.totalAssets)}</Td>
                        </Tr>
                      </Tbody>
                    </Table>
                  </TableWrapper>
                </Card>

                {/* Liabilities & Equity Card */}
                <Card title={lang === 'ar' ? 'الخصوم وحقوق الملكية (Liabilities & Equity)' : 'Liabilities & Equity'}>
                  <TableWrapper>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>{lang === 'ar' ? 'رمز الحساب' : 'Code'}</Th>
                          <Th>{lang === 'ar' ? 'اسم الحساب' : 'Account'}</Th>
                          <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'الرصيد (د.ك)' : 'Balance (KWD)'}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        <Tr style={{ background: '#f1f5f9' }}>
                          <Td colSpan={3} style={{ fontWeight: 700, color: TK.text2 }}>
                            {lang === 'ar' ? 'الخصوم (Liabilities 2xxx)' : 'Liabilities (2xxx)'}
                          </Td>
                        </Tr>
                        {report.liabilities?.items?.map(acc => (
                          <Tr key={acc.id}>
                            <Td style={{ fontWeight: 700, color: '#e67e22' }}>{acc.code}</Td>
                            <Td>{acc.name}</Td>
                            <Td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(acc.netBalance)}</Td>
                          </Tr>
                        ))}
                        <Tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                          <Td colSpan={2}>{lang === 'ar' ? 'مجموع الخصوم' : 'Total Liabilities'}</Td>
                          <Td style={{ textAlign: 'right', color: '#e67e22' }}>{fmt(report.liabilities?.total)}</Td>
                        </Tr>

                        <Tr style={{ background: '#f1f5f9' }}>
                          <Td colSpan={3} style={{ fontWeight: 700, color: TK.text2 }}>
                            {lang === 'ar' ? 'حقوق الملكية (Equity 3xxx)' : 'Equity (3xxx)'}
                          </Td>
                        </Tr>
                        {report.equity?.items?.map((acc, i) => (
                          <Tr key={acc.id || i}>
                            <Td style={{ fontWeight: 700, color: TK.success }}>{acc.code}</Td>
                            <Td>{acc.name}</Td>
                            <Td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(acc.netBalance)}</Td>
                          </Tr>
                        ))}
                        <Tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                          <Td colSpan={2}>{lang === 'ar' ? 'مجموع حقوق الملكية' : 'Total Equity'}</Td>
                          <Td style={{ textAlign: 'right', color: TK.success }}>{fmt(report.equity?.total)}</Td>
                        </Tr>

                        <Tr style={{ background: '#e2e8f0', fontWeight: 800, fontSize: 14 }}>
                          <Td colSpan={2}>{lang === 'ar' ? 'مجموع الخصوم وحقوق الملكية' : 'Total Liabilities & Equity'}</Td>
                          <Td style={{ textAlign: 'right', color: TK.primary }}>{fmt(report.totalLiabilitiesAndEquity)}</Td>
                        </Tr>
                      </Tbody>
                    </Table>
                  </TableWrapper>
                </Card>
              </div>
            </>
          )}

          {/* INCOME STATEMENT VIEW */}
          {statementType === 'incomeStatement' && (
            <>
              <KPIBar>
                <KPICard>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    {lang === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: TK.primary, marginTop: 4 }}>
                    {fmt(report.revenue?.total)} <span style={{ fontSize: 13 }}>KWD</span>
                  </div>
                </KPICard>
                <KPICard>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    {lang === 'ar' ? 'تكلفة المبيعات (COGS)' : 'Cost of Goods Sold'}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#e67e22', marginTop: 4 }}>
                    {fmt(report.costOfGoodsSold?.total)} <span style={{ fontSize: 13 }}>KWD</span>
                  </div>
                </KPICard>
                <KPICard>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    {lang === 'ar' ? 'إجمالي الربح (هامش %)' : 'Gross Profit (Margin)'}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: TK.success, marginTop: 4 }}>
                    {fmt(report.grossProfit)} <span style={{ fontSize: 13 }}>({report.grossMarginPercent}%)</span>
                  </div>
                </KPICard>
                <KPICard style={{ borderLeft: `4px solid ${report.netIncome >= 0 ? TK.success : TK.error}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    {lang === 'ar' ? 'صافي الدخل التشغيلي' : 'Net Operating Income'}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: report.netIncome >= 0 ? TK.success : TK.error, marginTop: 4 }}>
                    {fmt(report.netIncome)} <span style={{ fontSize: 13 }}>KWD</span>
                  </div>
                </KPICard>
              </KPIBar>

              <Card title={lang === 'ar' ? 'بيان الأرباح والخسائر المفصل (P&L Breakdown)' : 'Profit & Loss Statement'}>
                <TableWrapper>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{lang === 'ar' ? 'البند المحاسبي' : 'Account Description'}</Th>
                        <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'المبلغ (د.ك)' : 'Amount (KWD)'}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {/* REVENUES */}
                      <Tr style={{ background: '#f1f5f9' }}>
                        <Td colSpan={2} style={{ fontWeight: 800, color: TK.primary }}>
                          {lang === 'ar' ? 'الإيرادات التشغيلية (Operating Revenues 4xxx)' : 'Operating Revenues (4xxx)'}
                        </Td>
                      </Tr>
                      {report.revenue?.items?.map(item => (
                        <Tr key={item.code}>
                          <Td style={{ paddingLeft: 30 }}>{item.code} — {item.name}</Td>
                          <Td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(item.amount)}</Td>
                        </Tr>
                      ))}
                      <Tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                        <Td>{lang === 'ar' ? 'مجموع الإيرادات' : 'Total Revenue'}</Td>
                        <Td style={{ textAlign: 'right', color: TK.primary }}>{fmt(report.revenue?.total)}</Td>
                      </Tr>

                      {/* COGS */}
                      <Tr style={{ background: '#f1f5f9' }}>
                        <Td colSpan={2} style={{ fontWeight: 800, color: '#e67e22' }}>
                          {lang === 'ar' ? 'تكلفة المبيعات والشحن المباشر (COGS 5xxx)' : 'Cost of Goods Sold (5xxx)'}
                        </Td>
                      </Tr>
                      {report.costOfGoodsSold?.items?.map(item => (
                        <Tr key={item.code}>
                          <Td style={{ paddingLeft: 30 }}>{item.code} — {item.name}</Td>
                          <Td style={{ textAlign: 'right', fontWeight: 600, color: '#e67e22' }}>({fmt(item.amount)})</Td>
                        </Tr>
                      ))}
                      <Tr style={{ background: '#fef3c7', fontWeight: 800, fontSize: 13 }}>
                        <Td>{lang === 'ar' ? 'مجمل الربح (Gross Profit)' : 'Gross Profit'}</Td>
                        <Td style={{ textAlign: 'right', color: TK.success }}>{fmt(report.grossProfit)}</Td>
                      </Tr>

                      {/* EXPENSES */}
                      <Tr style={{ background: '#f1f5f9' }}>
                        <Td colSpan={2} style={{ fontWeight: 800, color: TK.error }}>
                          {lang === 'ar' ? 'المصروفات التشغيلية والإدارية (OpEx 6xxx)' : 'Operating Expenses (6xxx)'}
                        </Td>
                      </Tr>
                      {report.operatingExpenses?.items?.map(item => (
                        <Tr key={item.code}>
                          <Td style={{ paddingLeft: 30 }}>{item.code} — {item.name}</Td>
                          <Td style={{ textAlign: 'right', fontWeight: 600, color: TK.error }}>({fmt(item.amount)})</Td>
                        </Tr>
                      ))}
                      <Tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                        <Td>{lang === 'ar' ? 'مجموع المصروفات التشغيلية' : 'Total Operating Expenses'}</Td>
                        <Td style={{ textAlign: 'right', color: TK.error }}>({fmt(report.operatingExpenses?.total)})</Td>
                      </Tr>

                      {/* NET INCOME */}
                      <Tr style={{ background: '#e2e8f0', fontWeight: 900, fontSize: 15 }}>
                        <Td>{lang === 'ar' ? 'صافي الربح / الخسارة (Net Income)' : 'Net Profit / (Loss)'}</Td>
                        <Td style={{ textAlign: 'right', color: report.netIncome >= 0 ? TK.success : TK.error }}>
                          {fmt(report.netIncome)} KWD
                        </Td>
                      </Tr>
                    </Tbody>
                  </Table>
                </TableWrapper>
              </Card>
            </>
          )}

          {/* TRIAL BALANCE VIEW */}
          {statementType === 'trialBalance' && (
            <>
              <KPIBar>
                <KPICard>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    {lang === 'ar' ? 'إجمالي المدين (Debits)' : 'Total Debits'}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: TK.primary, marginTop: 4 }}>
                    {fmt(report.totalDebits)} <span style={{ fontSize: 13 }}>KWD</span>
                  </div>
                </KPICard>
                <KPICard>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    {lang === 'ar' ? 'إجمالي الدائن (Credits)' : 'Total Credits'}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: TK.success, marginTop: 4 }}>
                    {fmt(report.totalCredits)} <span style={{ fontSize: 13 }}>KWD</span>
                  </div>
                </KPICard>
                <KPICard style={{ borderLeft: report.isBalanced ? `4px solid ${TK.success}` : `4px solid ${TK.error}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    {lang === 'ar' ? 'حالة التوازن' : 'Balance Status'}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: report.isBalanced ? TK.success : TK.error, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      {report.isBalanced ? 'verified' : 'warning'}
                    </span>
                    {report.isBalanced ? (lang === 'ar' ? 'متوازن تماماً' : 'In Perfect Balance') : `Variance: ${fmt(report.difference)}`}
                  </div>
                </KPICard>
              </KPIBar>

              <Card title={lang === 'ar' ? 'ميزان المراجعة الكامل (Trial Balance Table)' : 'Trial Balance Account Register'}>
                <TableWrapper>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{lang === 'ar' ? 'رمز الحساب' : 'Code'}</Th>
                        <Th>{lang === 'ar' ? 'اسم الحساب' : 'Account Name'}</Th>
                        <Th>{lang === 'ar' ? 'النوع' : 'Type'}</Th>
                        <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'إجمالي المدين (DR)' : 'Debit (DR)'}</Th>
                        <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'إجمالي الدائن (CR)' : 'Credit (CR)'}</Th>
                        <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'صافي الرصيد' : 'Net Balance'}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {report.accounts?.map(acc => (
                        <Tr key={acc.id}>
                          <Td style={{ fontWeight: 700, color: TK.primary }}>{acc.code}</Td>
                          <Td style={{ fontWeight: 600 }}>{acc.name}</Td>
                          <Td>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: '#f1f5f9',
                              color: TK.text2
                            }}>
                              {acc.type}
                            </span>
                          </Td>
                          <Td style={{ textAlign: 'right', fontWeight: 600 }}>{acc.debits > 0 ? fmt(acc.debits) : '—'}</Td>
                          <Td style={{ textAlign: 'right', fontWeight: 600 }}>{acc.credits > 0 ? fmt(acc.credits) : '—'}</Td>
                          <Td style={{ textAlign: 'right', fontWeight: 800 }}>{fmt(acc.netBalance)}</Td>
                        </Tr>
                      ))}
                      <Tr style={{ background: '#e2e8f0', fontWeight: 900, fontSize: 14 }}>
                        <Td colSpan={3}>{lang === 'ar' ? 'المجاميع الإجمالية' : 'Total Balances'}</Td>
                        <Td style={{ textAlign: 'right', color: TK.primary }}>{fmt(report.totalDebits)}</Td>
                        <Td style={{ textAlign: 'right', color: TK.success }}>{fmt(report.totalCredits)}</Td>
                        <Td style={{ textAlign: 'right' }}>
                          {report.isBalanced ? '✓ 0.000' : `${fmt(report.difference)}`}
                        </Td>
                      </Tr>
                    </Tbody>
                  </Table>
                </TableWrapper>
              </Card>
            </>
          )}
        </>
      ) : null}
    </div>
  );
};

export default FinancialStatementsTab;
