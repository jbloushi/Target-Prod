import React, { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { financeService } from '../../services/api';
import { TK } from '../../tokens/kineticHorizon';
import { Card, Button, WInput, Select, Modal, TableWrapper, Table, Thead, Tbody, Tr, Th, Td, Loader } from '../../ui';

const BalanceTicker = ({ $balanced, children }) => (
  <div className={`flex justify-between items-center p-3 px-4 rounded-xl my-3 text-xs font-bold border ${
    $balanced ? 'bg-success/10 border-success/30 text-success' : 'bg-error/10 border-error/30 text-error'
  }`}>
    {children}
  </div>
);

const LineRow = ({ children }) => (
  <div className="grid grid-cols-[180px_1fr_100px_100px_36px] gap-2.5 items-center mb-2.5">
    {children}
  </div>
);

const GeneralLedgerTab = ({ lang = 'en' }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [subView, setSubView] = useState('journals'); // 'journals' | 'accounts'
  const [loading, setLoading] = useState(false);
  const [journalEntries, setJournalEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });

  // New Journal Entry Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    reference: '',
    notes: '',
    sourceType: 'MANUAL',
    lines: [
      { accountCode: '1100', debit: '', credit: '', memo: '' },
      { accountCode: '4010', debit: '', credit: '', memo: '' }
    ]
  });

  // Reversal Modal State
  const [reversalTarget, setReversalTarget] = useState(null);
  const [reversalReason, setReversalReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (subView === 'journals') {
        const res = await financeService.listJournalEntries({ page: pagination.page, limit: pagination.limit });
        if (res && res.success) {
          setJournalEntries(res.items || []);
          setPagination(res.pagination || pagination);
        }
      } else {
        const res = await financeService.listAccounts();
        if (res && res.success) {
          setAccounts(res.accounts || []);
        }
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [subView, pagination.page, pagination.limit, enqueueSnackbar]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Balance calculation for new entry modal
  const totalDebits = newEntry.lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredits = newEntry.lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const diff = Math.abs(totalDebits - totalCredits);
  const isBalanced = diff < 0.001 && totalDebits > 0;

  const handleAddLine = () => {
    setNewEntry({
      ...newEntry,
      lines: [...newEntry.lines, { accountCode: '1010', debit: '', credit: '', memo: '' }]
    });
  };

  const handleRemoveLine = (idx) => {
    if (newEntry.lines.length <= 2) {
      enqueueSnackbar('Journal entries require at least 2 lines', { variant: 'warning' });
      return;
    }
    const updated = newEntry.lines.filter((_, i) => i !== idx);
    setNewEntry({ ...newEntry, lines: updated });
  };

  const handleLineChange = (idx, field, val) => {
    const updated = [...newEntry.lines];
    updated[idx][field] = val;
    // If setting debit, clear credit and vice versa
    if (field === 'debit' && val) updated[idx].credit = '';
    if (field === 'credit' && val) updated[idx].debit = '';
    setNewEntry({ ...newEntry, lines: updated });
  };

  const handlePostJournalEntry = async () => {
    if (!isBalanced) {
      enqueueSnackbar('Debits must exactly equal credits before posting', { variant: 'error' });
      return;
    }
    try {
      const payload = {
        date: newEntry.date,
        reference: newEntry.reference,
        notes: newEntry.notes,
        sourceType: newEntry.sourceType,
        lines: newEntry.lines.map(l => ({
          accountCode: l.accountCode,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          memo: l.memo
        }))
      };
      const res = await financeService.createJournalEntry(payload);
      if (res && res.success) {
        enqueueSnackbar('Journal Entry posted successfully', { variant: 'success' });
        setIsCreateModalOpen(false);
        loadData();
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    }
  };

  const handleReverseEntry = async () => {
    if (!reversalTarget) return;
    try {
      const res = await financeService.reverseJournalEntry(reversalTarget.id, { reason: reversalReason });
      if (res && res.success) {
        enqueueSnackbar(`Entry reversed as ${res.reversal.entryNumber}`, { variant: 'success' });
        setReversalTarget(null);
        setReversalReason('');
        loadData();
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    }
  };

  const fmt = (num) => Number(num || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant={subView === 'journals' ? 'primary' : 'outline'}
            onClick={() => setSubView('journals')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 4 }}>receipt_long</span>
            {lang === 'ar' ? 'قيود اليومية العامة (Journal Entries)' : 'Journal Entries'}
          </Button>
          <Button
            variant={subView === 'accounts' ? 'primary' : 'outline'}
            onClick={() => setSubView('accounts')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 4 }}>account_tree</span>
            {lang === 'ar' ? 'دليل الحسابات (Chart of Accounts)' : 'Chart of Accounts'}
          </Button>
        </div>

        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 4 }}>add_circle</span>
          {lang === 'ar' ? 'إنشاء قيد محاسبي يدوي' : 'New Journal Entry'}
        </Button>
      </div>

      {loading ? (
        <Card style={{ padding: 40, textAlign: 'center' }}><Loader /></Card>
      ) : subView === 'journals' ? (
        <Card title={lang === 'ar' ? 'دفتر اليومية العامة المزدوج' : 'General Ledger Journal'}>
          <TableWrapper>
            <Table>
              <Thead>
                <Tr>
                  <Th>{lang === 'ar' ? 'رقم القيد' : 'Entry #'}</Th>
                  <Th>{lang === 'ar' ? 'التاريخ' : 'Date'}</Th>
                  <Th>{lang === 'ar' ? 'المصدر' : 'Source'}</Th>
                  <Th>{lang === 'ar' ? 'المرجع' : 'Reference'}</Th>
                  <Th>{lang === 'ar' ? 'البيان وتفاصيل البنود' : 'Account Lines & Memo'}</Th>
                  <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'المبلغ' : 'Amount (KWD)'}</Th>
                  <Th>{lang === 'ar' ? 'الحالة' : 'Status'}</Th>
                  <Th style={{ textAlign: 'center' }}>{lang === 'ar' ? 'إجراءات' : 'Actions'}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {journalEntries.length > 0 ? journalEntries.map(e => (
                  <Tr key={e.id}>
                    <Td style={{ fontWeight: 700, color: TK.primary }}>{e.entryNumber}</Td>
                    <Td style={{ fontSize: 12 }}>{format(new Date(e.date), 'yyyy-MM-dd')}</Td>
                    <Td>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9' }}>
                        {e.sourceType}
                      </span>
                    </Td>
                    <Td style={{ fontSize: 12 }}>{e.reference || '—'}</Td>
                    <Td style={{ minWidth: 260 }}>
                      <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 600 }}>{e.notes}</div>
                      {e.lines?.map(l => (
                        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: TK.text2, borderBottom: '1px dashed #e2e8f0', padding: '2px 0' }}>
                          <span>{l.accountCode} - {l.accountName}</span>
                          <span style={{ fontWeight: 700, color: l.debit > 0 ? TK.primary : TK.success }}>
                            {l.debit > 0 ? `Dr ${fmt(l.debit)}` : `Cr ${fmt(l.credit)}`}
                          </span>
                        </div>
                      ))}
                    </Td>
                    <Td style={{ textAlign: 'right', fontWeight: 800 }}>{fmt(e.totalAmount)}</Td>
                    <Td>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: e.status === 'POSTED' ? TK.successBg : TK.errorBg,
                        color: e.status === 'POSTED' ? TK.success : TK.error
                      }}>
                        {e.status}
                      </span>
                    </Td>
                    <Td style={{ textAlign: 'center' }}>
                      {e.status === 'POSTED' && e.sourceType !== 'REVERSAL' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReversalTarget(e)}
                          style={{ padding: '2px 8px', fontSize: 11, color: TK.error }}
                        >
                          {lang === 'ar' ? 'عكس القيد' : 'Reverse'}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                )) : (
                  <Tr><Td colSpan={8} style={{ textAlign: 'center', padding: 30 }}>{lang === 'ar' ? 'لا توجد قيود مسجلة' : 'No journal entries found'}</Td></Tr>
                )}
              </Tbody>
            </Table>
          </TableWrapper>
        </Card>
      ) : (
        /* CHART OF ACCOUNTS VIEW */
        <Card title={lang === 'ar' ? 'دليل الحسابات الموحد (Chart of Accounts Tree)' : 'Standard Chart of Accounts (COA)'}>
          <TableWrapper>
            <Table>
              <Thead>
                <Tr>
                  <Th>{lang === 'ar' ? 'رمز الحساب' : 'Code'}</Th>
                  <Th>{lang === 'ar' ? 'اسم الحساب' : 'Account Name'}</Th>
                  <Th>{lang === 'ar' ? 'التصنيف الرئيسي' : 'Classification'}</Th>
                  <Th>{lang === 'ar' ? 'العملة' : 'Currency'}</Th>
                  <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'الرصيد الدفتري الحالي' : 'Current Ledger Balance'}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {accounts.map(acc => (
                  <Tr key={acc.id}>
                    <Td style={{ fontWeight: 800, color: TK.primary }}>{acc.code}</Td>
                    <Td style={{ fontWeight: 600 }}>{acc.name}</Td>
                    <Td>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background:
                          acc.type === 'ASSET' ? '#eff6ff' :
                          acc.type === 'LIABILITY' ? '#fef3c7' :
                          acc.type === 'EQUITY' ? '#f0fdf4' :
                          acc.type === 'REVENUE' ? '#ecfdf5' : '#fef2f2',
                        color:
                          acc.type === 'ASSET' ? '#1d4ed8' :
                          acc.type === 'LIABILITY' ? '#b45309' :
                          acc.type === 'EQUITY' ? '#15803d' :
                          acc.type === 'REVENUE' ? '#047857' : '#b91c1c'
                      }}>
                        {acc.type} ({acc.subType || 'GENERAL'})
                      </span>
                    </Td>
                    <Td>{acc.currency}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 800 }}>
                      {fmt(acc.balance)} {acc.currency}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrapper>
        </Card>
      )}

      {/* CREATE JOURNAL ENTRY MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={lang === 'ar' ? 'إنشاء قيد محاسبي مزدوج (Double-Entry Posting)' : 'New Double-Entry Journal'}
        size="lg"
      >
        <div style={{ padding: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <WInput
              type="date"
              label={lang === 'ar' ? 'تاريخ القيد' : 'Posting Date'}
              value={newEntry.date}
              onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
            />
            <WInput
              label={lang === 'ar' ? 'رقم المرجع / السند' : 'Reference #'}
              value={newEntry.reference}
              onChange={(e) => setNewEntry({ ...newEntry, reference: e.target.value })}
              placeholder="e.g. ADJ-001"
            />
            <WInput
              label={lang === 'ar' ? 'البيان / الشرح' : 'Description / Notes'}
              value={newEntry.notes}
              onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
              placeholder="Reason for adjustment"
            />
          </div>

          <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: TK.text2 }}>
            {lang === 'ar' ? 'أسطر القيد (يجب أن يتساوى إجمالي المدين مع إجمالي الدائن)' : 'Journal Lines (Debits must equal Credits)'}
          </div>

          {newEntry.lines.map((line, idx) => (
            <LineRow key={idx}>
              <Select
                value={line.accountCode}
                onChange={(e) => handleLineChange(idx, 'accountCode', e.target.value)}
              >
                <option value="1010">1010 - NBK Operating Cash</option>
                <option value="1020">1020 - Cash in Transit Driver</option>
                <option value="1030">1030 - Hub Vault Safe</option>
                <option value="1100">1100 - Accounts Receivable</option>
                <option value="1150">1150 - Customs Advances</option>
                <option value="2010">2010 - Carrier AP</option>
                <option value="2020">2020 - Trade Vendor AP</option>
                <option value="2100">2100 - Merchant Escrow</option>
                <option value="3010">3010 - Share Capital</option>
                <option value="4010">4010 - Freight Revenue</option>
                <option value="5010">5010 - Carrier Direct Cost</option>
                <option value="6020">6020 - Office Expenses</option>
              </Select>
              <WInput
                placeholder="Line memo"
                value={line.memo}
                onChange={(e) => handleLineChange(idx, 'memo', e.target.value)}
              />
              <WInput
                type="number"
                step="0.001"
                placeholder="Debit"
                value={line.debit}
                onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
              />
              <WInput
                type="number"
                step="0.001"
                placeholder="Credit"
                value={line.credit}
                onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRemoveLine(idx)}
                style={{ padding: 4, color: TK.error }}
              >
                ✕
              </Button>
            </LineRow>
          ))}

          <Button variant="secondary" size="sm" onClick={handleAddLine} style={{ marginTop: 6 }}>
            + {lang === 'ar' ? 'إضافة سطر' : 'Add Line'}
          </Button>

          <BalanceTicker $balanced={isBalanced}>
            <span>Total Debits: {fmt(totalDebits)} KWD</span>
            <span>Total Credits: {fmt(totalCredits)} KWD</span>
            <span>
              {isBalanced ? '✓ In Balance' : `Variance: ${fmt(diff)} KWD`}
            </span>
          </BalanceTicker>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={handlePostJournalEntry} disabled={!isBalanced}>
              {lang === 'ar' ? 'اعتماد وترحيل القيد' : 'Post Journal Entry'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* REVERSAL MODAL */}
      <Modal
        isOpen={!!reversalTarget}
        onClose={() => setReversalTarget(null)}
        title={lang === 'ar' ? 'عكس القيد المحاسبي' : 'Reverse Journal Entry'}
      >
        <div style={{ padding: 10 }}>
          <p style={{ fontSize: 13, color: TK.text2, marginBottom: 14 }}>
            {lang === 'ar'
              ? `سيتم إنشاء قيد معاكس بالكامل للقيد ${reversalTarget?.entryNumber} مع الاحتفاظ بالسجل التدقيقي الأصلي.`
              : `A contra reversing entry will be posted for ${reversalTarget?.entryNumber}. The original audit trail is fully preserved.`}
          </p>
          <WInput
            label={lang === 'ar' ? 'سبب العكس' : 'Reason for Reversal'}
            value={reversalReason}
            onChange={(e) => setReversalReason(e.target.value)}
            placeholder="e.g. Accounting correction / duplicate"
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <Button variant="outline" onClick={() => setReversalTarget(null)}>
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={handleReverseEntry} style={{ background: TK.error }}>
              {lang === 'ar' ? 'تأكيد العكس' : 'Confirm Reversal'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default GeneralLedgerTab;
