import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { financeService } from '../../services/api';
import { TK } from '../../tokens/kineticHorizon';
import { Card, Button, WInput, Select, Modal, TableWrapper, Table, Thead, Tbody, Tr, Th, Td, Loader } from '../../ui';

const TreasuryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const TreasuryCard = styled.div`
  background: #ffffff;
  border-radius: 18px;
  border: 1px solid ${TK.border};
  padding: 18px 22px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.04);
  position: relative;
  overflow: hidden;
`;

const BankCard = styled.div`
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid ${TK.border};
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.03);
`;

const TreasuryTab = ({ lang = 'en' }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState('');

  // Modals
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [isCreateBankModalOpen, setIsCreateBankModalOpen] = useState(false);
  const [newBank, setNewBank] = useState({
    accountName: '',
    accountNumber: '',
    bankName: 'National Bank of Kuwait',
    iban: '',
    swiftCode: '',
    currency: 'KWD'
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, banksRes] = await Promise.all([
        financeService.getTreasurySummary(),
        financeService.listBankAccounts()
      ]);
      if (sumRes && sumRes.success) setSummary(sumRes);
      if (banksRes && banksRes.success) {
        setBankAccounts(banksRes.accounts || []);
        if (!selectedBankId && banksRes.accounts?.length > 0) {
          setSelectedBankId(banksRes.accounts[0].id);
        }
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [selectedBankId, enqueueSnackbar]);

  const loadTransactions = useCallback(async () => {
    if (!selectedBankId) return;
    try {
      const txRes = await financeService.getBankTransactions({ bankAccountId: selectedBankId });
      if (txRes && txRes.success) setTransactions(txRes.transactions || []);
    } catch (err) {
      console.error(err);
    }
  }, [selectedBankId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleCreateBank = async () => {
    if (!newBank.accountName || !newBank.accountNumber) {
      enqueueSnackbar('Account name and number are required', { variant: 'warning' });
      return;
    }
    try {
      const res = await financeService.createBankAccount(newBank);
      if (res && res.success) {
        enqueueSnackbar('Bank Account registered successfully', { variant: 'success' });
        setIsCreateBankModalOpen(false);
        loadData();
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    }
  };

  const handleImportStatement = async () => {
    if (!selectedBankId || !importText.trim()) {
      enqueueSnackbar('Please select account and paste statement lines (Date, Amount, Description)', { variant: 'warning' });
      return;
    }
    try {
      const lines = importText
        .trim()
        .split('\n')
        .map(row => {
          const parts = row.split(',').map(p => p.trim());
          return {
            date: parts[0] || new Date().toISOString(),
            amount: parseFloat(parts[1]) || 0,
            reference: parts[2] || '',
            description: parts[3] || 'Statement transaction'
          };
        })
        .filter(l => l.amount !== 0);

      const res = await financeService.importBankStatement({
        bankAccountId: selectedBankId,
        lines
      });
      if (res && res.success) {
        enqueueSnackbar(`Imported ${res.importedCount} transactions. Net change: ${res.netChange} KWD`, { variant: 'success' });
        setIsImportModalOpen(false);
        setImportText('');
        loadData();
        loadTransactions();
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    }
  };

  const handleReconcile = async (txId) => {
    try {
      const res = await financeService.reconcileBankTransaction({
        transactionId: txId,
        matchedType: 'MANUAL_AUDIT'
      });
      if (res && res.success) {
        enqueueSnackbar('Transaction reconciled', { variant: 'success' });
        loadTransactions();
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    }
  };

  const fmt = (num) => Number(num || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  return (
    <div>
      {/* Treasury KPIs */}
      {summary && (
        <TreasuryGrid>
          <TreasuryCard style={{ borderLeft: `4px solid ${TK.primary}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
              {lang === 'ar' ? 'إجمالي السيولة النقدية' : 'Total Liquid Assets'}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: TK.primary, marginTop: 4 }}>
              {fmt(summary.totalLiquidAssets)} <span style={{ fontSize: 13 }}>KWD</span>
            </div>
          </TreasuryCard>
          <TreasuryCard style={{ borderLeft: `4px solid #3b82f6` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
              {lang === 'ar' ? 'أرصدة البنوك التشغيلية' : 'Bank Operating Cash'}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#3b82f6', marginTop: 4 }}>
              {fmt(summary.breakdown?.bankCash)} <span style={{ fontSize: 13 }}>KWD</span>
            </div>
          </TreasuryCard>
          <TreasuryCard style={{ borderLeft: `4px solid ${TK.success}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
              {lang === 'ar' ? 'خزينة الفرع الرئيسية (Safe)' : 'Hub Vault Safe Cash (1030)'}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: TK.success, marginTop: 4 }}>
              {fmt(summary.breakdown?.vaultSafeCash)} <span style={{ fontSize: 13 }}>KWD</span>
            </div>
          </TreasuryCard>
          <TreasuryCard style={{ borderLeft: `4px solid #f59e0b` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
              {lang === 'ar' ? 'نقد في الطريق مع السائقين' : 'Cash in Transit Driver COD (1020)'}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>
              {fmt(summary.breakdown?.cashInTransitDrivers)} <span style={{ fontSize: 13 }}>KWD</span>
            </div>
          </TreasuryCard>
        </TreasuryGrid>
      )}

      {/* Bank Accounts Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
          {lang === 'ar' ? 'الحسابات البنكية المعتمدة' : 'Registered Company Bank Accounts'}
        </h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 4 }}>upload_file</span>
            {lang === 'ar' ? 'استيراد كشف حساب' : 'Import Statement'}
          </Button>
          <Button variant="primary" onClick={() => setIsCreateBankModalOpen(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 4 }}>add</span>
            {lang === 'ar' ? 'إضافة حساب بنكي' : 'Add Bank Account'}
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
        {bankAccounts.map(b => (
          <BankCard
            key={b.id}
            style={{
              cursor: 'pointer',
              border: selectedBankId === b.id ? `2px solid ${TK.primary}` : `1px solid ${TK.border}`
            }}
            onClick={() => setSelectedBankId(b.id)}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>{b.accountName}</div>
              <div style={{ fontSize: 12, color: TK.text3, marginTop: 2 }}>
                {b.bankName} • Acc: {b.accountNumber}
              </div>
              {b.iban && <div style={{ fontSize: 11, color: TK.text3 }}>IBAN: {b.iban}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: TK.primary }}>
                {fmt(b.currentBalance)} <span style={{ fontSize: 12 }}>{b.currency}</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: TK.text3 }}>
                GL: {b.glAccount?.code}
              </div>
            </div>
          </BankCard>
        ))}
      </div>

      {/* Transactions Register */}
      <Card title={lang === 'ar' ? 'سجل العمليات البنكية والمطابقة' : 'Bank Transactions & Reconciliation Register'}>
        <TableWrapper>
          <Table>
            <Thead>
              <Tr>
                <Th>{lang === 'ar' ? 'التاريخ' : 'Date'}</Th>
                <Th>{lang === 'ar' ? 'المرجع' : 'Reference'}</Th>
                <Th>{lang === 'ar' ? 'الوصف' : 'Description'}</Th>
                <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'المبلغ' : 'Amount'}</Th>
                <Th>{lang === 'ar' ? 'حالة المطابقة' : 'Reconciliation'}</Th>
                <Th style={{ textAlign: 'center' }}>{lang === 'ar' ? 'إجراء' : 'Action'}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {transactions.length > 0 ? transactions.map(t => (
                <Tr key={t.id}>
                  <Td style={{ fontSize: 12 }}>{format(new Date(t.transactionDate), 'yyyy-MM-dd')}</Td>
                  <Td style={{ fontSize: 12, fontWeight: 600 }}>{t.reference || '—'}</Td>
                  <Td style={{ fontSize: 12 }}>{t.description}</Td>
                  <Td style={{
                    textAlign: 'right',
                    fontWeight: 700,
                    color: t.amount > 0 ? TK.success : TK.error
                  }}>
                    {t.amount > 0 ? `+${fmt(t.amount)}` : fmt(t.amount)} {t.currency}
                  </Td>
                  <Td>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: t.isReconciled ? TK.successBg : '#fef3c7',
                      color: t.isReconciled ? TK.success : '#b45309'
                    }}>
                      {t.isReconciled ? (lang === 'ar' ? 'مطابق ومقيد' : 'Reconciled') : (lang === 'ar' ? 'معلق' : 'Unreconciled')}
                    </span>
                  </Td>
                  <Td style={{ textAlign: 'center' }}>
                    {!t.isReconciled && (
                      <Button variant="outline" size="sm" onClick={() => handleReconcile(t.id)}>
                        {lang === 'ar' ? 'تأكيد المطابقة' : 'Reconcile'}
                      </Button>
                    )}
                  </Td>
                </Tr>
              )) : (
                <Tr><Td colSpan={6} style={{ textAlign: 'center', padding: 30 }}>{lang === 'ar' ? 'لا توجد حركات مسجلة لهذا الحساب' : 'No transactions recorded for this account'}</Td></Tr>
              )}
            </Tbody>
          </Table>
        </TableWrapper>
      </Card>

      {/* CREATE BANK ACCOUNT MODAL */}
      <Modal
        isOpen={isCreateBankModalOpen}
        onClose={() => setIsCreateBankModalOpen(false)}
        title={lang === 'ar' ? 'تسجيل حساب بنكي جديد' : 'Register New Bank Account'}
      >
        <div style={{ padding: 10 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <WInput
              label={lang === 'ar' ? 'اسم الحساب' : 'Account Name'}
              value={newBank.accountName}
              onChange={(e) => setNewBank({ ...newBank, accountName: e.target.value })}
              placeholder="e.g. NBK Operating Account"
            />
            <WInput
              label={lang === 'ar' ? 'اسم البنك' : 'Bank Name'}
              value={newBank.bankName}
              onChange={(e) => setNewBank({ ...newBank, bankName: e.target.value })}
            />
            <WInput
              label={lang === 'ar' ? 'رقم الحساب' : 'Account Number'}
              value={newBank.accountNumber}
              onChange={(e) => setNewBank({ ...newBank, accountNumber: e.target.value })}
            />
            <WInput
              label={lang === 'ar' ? 'رقم الآيبان (IBAN)' : 'IBAN'}
              value={newBank.iban}
              onChange={(e) => setNewBank({ ...newBank, iban: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <Button variant="outline" onClick={() => setIsCreateBankModalOpen(false)}>
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={handleCreateBank}>
              {lang === 'ar' ? 'حفظ الحساب' : 'Register Account'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* IMPORT STATEMENT MODAL */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title={lang === 'ar' ? 'استيراد كشف حساب بنكي (CSV)' : 'Import Bank Statement (CSV)'}
      >
        <div style={{ padding: 10 }}>
          <p style={{ fontSize: 13, color: TK.text2, marginBottom: 12 }}>
            {lang === 'ar'
              ? 'الصق أسطر كشف الحساب بتنسيق (التاريخ, المبلغ, المرجع, الوصف). استخدم الإشارة السالبة (-) للمدفوعات.'
              : 'Paste CSV rows: (YYYY-MM-DD, Amount, Reference, Description). Negative amount for disbursements.'}
          </p>
          <textarea
            rows={6}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${TK.border}`, fontFamily: 'monospace', fontSize: 12 }}
            placeholder={"2026-09-20, 1500.000, WIRE-991, Customer Settlement Inflow\n2026-09-21, -450.000, CHQ-1002, Carrier Freight Payment"}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <Button variant="outline" onClick={() => setIsImportModalOpen(false)}>
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={handleImportStatement}>
              {lang === 'ar' ? 'استيراد وتحديث الرصيد' : 'Import & Update Balance'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TreasuryTab;
