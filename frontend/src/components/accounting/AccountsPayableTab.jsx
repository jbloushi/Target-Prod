import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { financeService } from '../../services/api';
import { TK } from '../../tokens/kineticHorizon';
import { Card, Button, WInput, Select, Modal, TableWrapper, Table, Thead, Tbody, Tr, Th, Td, Loader } from '../../ui';

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid ${TK.border};
  padding: 16px 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.03);
`;

const AccountsPayableTab = ({ lang = 'en' }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(false);
  const [bills, setBills] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);

  // New Bill Form
  const [billForm, setBillForm] = useState({
    vendorId: '',
    billNumber: '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    tax: 0,
    notes: '',
    lines: [{ accountCode: '5010', description: '', amount: '' }]
  });

  // Pay Bill Form
  const [selectedBill, setSelectedBill] = useState(null);
  const [payForm, setPayForm] = useState({
    bankAccountId: '',
    amount: '',
    reference: '',
    method: 'bank_transfer',
    notes: ''
  });

  // Reconcile CSV Form
  const [reconcileVendorId, setReconcileVendorId] = useState('');
  const [reconcileRawText, setReconcileRawText] = useState('');
  const [reconciliationResult, setReconciliationResult] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [billsRes, vendorsRes, banksRes] = await Promise.all([
        financeService.listBills({ status: statusFilter || undefined }),
        financeService.listVendors(),
        financeService.listBankAccounts()
      ]);
      if (billsRes && billsRes.success) setBills(billsRes.bills || []);
      if (vendorsRes && vendorsRes.success) setVendors(vendorsRes.vendors || []);
      if (banksRes && banksRes.success) setBankAccounts(banksRes.accounts || []);
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, enqueueSnackbar]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Totals
  const totalPayable = bills.reduce((sum, b) => sum + (b.remainingBalance || 0), 0);
  const totalPaid = bills.reduce((sum, b) => sum + (b.paidAmount || 0), 0);

  const handleAddBillLine = () => {
    setBillForm({
      ...billForm,
      lines: [...billForm.lines, { accountCode: '5010', description: '', amount: '' }]
    });
  };

  const handleCreateBill = async () => {
    if (!billForm.vendorId) {
      enqueueSnackbar('Please select a vendor', { variant: 'warning' });
      return;
    }
    try {
      const payload = {
        vendorId: billForm.vendorId,
        billNumber: billForm.billNumber || undefined,
        issueDate: billForm.issueDate,
        dueDate: billForm.dueDate || undefined,
        tax: parseFloat(billForm.tax) || 0,
        notes: billForm.notes,
        lines: billForm.lines.map(l => ({
          accountCode: l.accountCode,
          description: l.description,
          amount: parseFloat(l.amount) || 0
        }))
      };
      const res = await financeService.createBill(payload);
      if (res && res.success) {
        enqueueSnackbar('Vendor bill created and posted to AP ledger', { variant: 'success' });
        setIsBillModalOpen(false);
        loadData();
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    }
  };

  const openPayModal = (bill) => {
    setSelectedBill(bill);
    setPayForm({
      bankAccountId: bankAccounts[0]?.id || '',
      amount: bill.remainingBalance || bill.total,
      reference: `WIRE-${bill.billNumber}`,
      method: 'bank_transfer',
      notes: `Settlement for ${bill.billNumber}`
    });
    setIsPayModalOpen(true);
  };

  const handleDisbursePayment = async () => {
    if (!payForm.bankAccountId || !payForm.amount) {
      enqueueSnackbar('Please select a bank account and enter amount', { variant: 'warning' });
      return;
    }
    try {
      const res = await financeService.payBill(selectedBill.id, {
        bankAccountId: payForm.bankAccountId,
        amount: parseFloat(payForm.amount),
        reference: payForm.reference,
        method: payForm.method,
        notes: payForm.notes
      });
      if (res && res.success) {
        enqueueSnackbar(`Payment of ${payForm.amount} KWD disbursed successfully`, { variant: 'success' });
        setIsPayModalOpen(false);
        loadData();
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    }
  };

  const handleRunReconciliation = async () => {
    if (!reconcileVendorId || !reconcileRawText.trim()) {
      enqueueSnackbar('Please select vendor and provide CSV rows (AWB, amount)', { variant: 'warning' });
      return;
    }
    try {
      // Parse CSV rows: trackingNumber, amount
      const lines = reconcileRawText
        .trim()
        .split('\n')
        .map(row => {
          const parts = row.split(',').map(p => p.trim());
          return { trackingNumber: parts[0], amount: parseFloat(parts[1]) || 0 };
        })
        .filter(l => l.trackingNumber);

      const res = await financeService.reconcileCarrierBill({
        vendorId: reconcileVendorId,
        lines
      });
      if (res && res.success) {
        setReconciliationResult(res);
        enqueueSnackbar(`Reconciliation complete: ${res.matchedCount} matched, ${res.mismatchedCount} discrepancies`, { variant: 'info' });
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    }
  };

  const fmt = (num) => Number(num || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  return (
    <div>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <SummaryGrid style={{ margin: 0, flex: 1 }}>
          <StatCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
              {lang === 'ar' ? 'إجمالي مستحقات الموردين (AP)' : 'Outstanding Carrier AP'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#e67e22', marginTop: 4 }}>
              {fmt(totalPayable)} <span style={{ fontSize: 13 }}>KWD</span>
            </div>
          </StatCard>
          <StatCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
              {lang === 'ar' ? 'المسدد هذا الشهر' : 'Settled Disbursements'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: TK.success, marginTop: 4 }}>
              {fmt(totalPaid)} <span style={{ fontSize: 13 }}>KWD</span>
            </div>
          </StatCard>
        </SummaryGrid>

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" onClick={() => setIsReconcileModalOpen(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 4 }}>find_replace</span>
            {lang === 'ar' ? 'مطابقة فواتير الناقل (3-Way Match)' : '3-Way Match Tool'}
          </Button>
          <Button variant="primary" onClick={() => setIsBillModalOpen(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 4 }}>post_add</span>
            {lang === 'ar' ? 'تسجيل فاتورة مورد / ناقل' : 'New Vendor Bill'}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card style={{ padding: 40, textAlign: 'center' }}><Loader /></Card>
      ) : (
        <Card title={lang === 'ar' ? 'فواتير ومستحقات الموردين والناقلين' : 'Carrier & Vendor Bills'}>
          <TableWrapper>
            <Table>
              <Thead>
                <Tr>
                  <Th>{lang === 'ar' ? 'رقم الفاتورة' : 'Bill #'}</Th>
                  <Th>{lang === 'ar' ? 'المورد / الناقل' : 'Vendor'}</Th>
                  <Th>{lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}</Th>
                  <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'الإجمالي' : 'Total'}</Th>
                  <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'المسدد' : 'Paid'}</Th>
                  <Th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'المتبقي' : 'Remaining'}</Th>
                  <Th>{lang === 'ar' ? 'الحالة' : 'Status'}</Th>
                  <Th style={{ textAlign: 'center' }}>{lang === 'ar' ? 'إجراءات' : 'Actions'}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {bills.length > 0 ? bills.map(b => (
                  <Tr key={b.id}>
                    <Td style={{ fontWeight: 700, color: TK.primary }}>{b.billNumber}</Td>
                    <Td style={{ fontWeight: 600 }}>{b.vendor?.name} ({b.vendor?.code})</Td>
                    <Td style={{ fontSize: 12 }}>{format(new Date(b.dueDate), 'yyyy-MM-dd')}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(b.total)} KWD</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 600, color: TK.success }}>{fmt(b.paidAmount)} KWD</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 800, color: b.remainingBalance > 0 ? '#e67e22' : TK.success }}>
                      {fmt(b.remainingBalance)} KWD
                    </Td>
                    <Td>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background:
                          b.status === 'PAID' ? TK.successBg :
                          b.status === 'PARTIALLY_PAID' ? '#fef3c7' : '#eff6ff',
                        color:
                          b.status === 'PAID' ? TK.success :
                          b.status === 'PARTIALLY_PAID' ? '#b45309' : '#1d4ed8'
                      }}>
                        {b.status}
                      </span>
                    </Td>
                    <Td style={{ textAlign: 'center' }}>
                      {b.status !== 'PAID' && (
                        <Button variant="primary" size="sm" onClick={() => openPayModal(b)}>
                          {lang === 'ar' ? 'سداد' : 'Pay Bill'}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                )) : (
                  <Tr><Td colSpan={8} style={{ textAlign: 'center', padding: 30 }}>{lang === 'ar' ? 'لا توجد فواتير موردين' : 'No vendor bills recorded'}</Td></Tr>
                )}
              </Tbody>
            </Table>
          </TableWrapper>
        </Card>
      )}

      {/* CREATE BILL MODAL */}
      <Modal
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        title={lang === 'ar' ? 'تسجيل فاتورة مورد / ناقل جديدة' : 'Record New Vendor Bill'}
        size="lg"
      >
        <div style={{ padding: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Select
              label={lang === 'ar' ? 'المورد / الناقل' : 'Vendor'}
              value={billForm.vendorId}
              onChange={(e) => setBillForm({ ...billForm, vendorId: e.target.value })}
            >
              <option value="">-- {lang === 'ar' ? 'اختر المورد' : 'Select Vendor'} --</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
              ))}
            </Select>
            <WInput
              label={lang === 'ar' ? 'رقم فاتورة المورد' : 'Vendor Bill #'}
              value={billForm.billNumber}
              onChange={(e) => setBillForm({ ...billForm, billNumber: e.target.value })}
              placeholder="e.g. INV-DHL-2026-09"
            />
            <WInput
              type="date"
              label={lang === 'ar' ? 'تاريخ الإصدار' : 'Issue Date'}
              value={billForm.issueDate}
              onChange={(e) => setBillForm({ ...billForm, issueDate: e.target.value })}
            />
            <WInput
              type="date"
              label={lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
              value={billForm.dueDate}
              onChange={(e) => setBillForm({ ...billForm, dueDate: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, color: TK.text2 }}>
            {lang === 'ar' ? 'بنود الفاتورة' : 'Bill Line Items'}
          </div>

          {billForm.lines.map((l, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 120px', gap: 10, marginBottom: 8 }}>
              <Select
                value={l.accountCode}
                onChange={(e) => {
                  const updated = [...billForm.lines];
                  updated[idx].accountCode = e.target.value;
                  setBillForm({ ...billForm, lines: updated });
                }}
              >
                <option value="5010">5010 - Carrier Direct Expense</option>
                <option value="6020">6020 - Office / Admin Expense</option>
                <option value="1150">1150 - Customs Advances</option>
              </Select>
              <WInput
                placeholder="Description"
                value={l.description}
                onChange={(e) => {
                  const updated = [...billForm.lines];
                  updated[idx].description = e.target.value;
                  setBillForm({ ...billForm, lines: updated });
                }}
              />
              <WInput
                type="number"
                step="0.001"
                placeholder="Amount (KWD)"
                value={l.amount}
                onChange={(e) => {
                  const updated = [...billForm.lines];
                  updated[idx].amount = e.target.value;
                  setBillForm({ ...billForm, lines: updated });
                }}
              />
            </div>
          ))}

          <Button variant="secondary" size="sm" onClick={handleAddBillLine} style={{ marginTop: 6 }}>
            + {lang === 'ar' ? 'إضافة بند' : 'Add Line Item'}
          </Button>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <Button variant="outline" onClick={() => setIsBillModalOpen(false)}>
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={handleCreateBill}>
              {lang === 'ar' ? 'حفظ وترحيل الفاتورة' : 'Save & Post to AP'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* DISBURSE PAYMENT MODAL */}
      <Modal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        title={lang === 'ar' ? `سداد فاتورة: ${selectedBill?.billNumber}` : `Pay Bill: ${selectedBill?.billNumber}`}
      >
        <div style={{ padding: 10 }}>
          <div style={{ marginBottom: 14, background: '#f8fafc', padding: 12, borderRadius: 10, fontSize: 13 }}>
            <div>Vendor: <strong>{selectedBill?.vendor?.name}</strong></div>
            <div>Total Amount: <strong>{fmt(selectedBill?.total)} KWD</strong></div>
            <div>Remaining Balance: <strong style={{ color: '#e67e22' }}>{fmt(selectedBill?.remainingBalance)} KWD</strong></div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <Select
              label={lang === 'ar' ? 'الحساب البنكي للصرف' : 'Disbursement Bank Account'}
              value={payForm.bankAccountId}
              onChange={(e) => setPayForm({ ...payForm, bankAccountId: e.target.value })}
            >
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.accountName} (Balance: {fmt(b.currentBalance)} {b.currency})
                </option>
              ))}
            </Select>

            <WInput
              type="number"
              step="0.001"
              label={lang === 'ar' ? 'مبلغ السداد (د.ك)' : 'Payment Amount (KWD)'}
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
            />

            <WInput
              label={lang === 'ar' ? 'رقم الحوالة / الشيك' : 'Payment Reference #'}
              value={payForm.reference}
              onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
            />

            <Select
              label={lang === 'ar' ? 'طريقة الصرف' : 'Method'}
              value={payForm.method}
              onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
            >
              <option value="bank_transfer">{lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</option>
              <option value="cheque">{lang === 'ar' ? 'شيك' : 'Cheque'}</option>
              <option value="cash">{lang === 'ar' ? 'نقدي' : 'Cash'}</option>
            </Select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <Button variant="outline" onClick={() => setIsPayModalOpen(false)}>
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={handleDisbursePayment}>
              {lang === 'ar' ? 'اعتماد الصرف وتحديث الحساب' : 'Disburse & Update Ledger'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 3-WAY RECONCILIATION MODAL */}
      <Modal
        isOpen={isReconcileModalOpen}
        onClose={() => setIsReconcileModalOpen(false)}
        title={lang === 'ar' ? 'مطابقة فواتير الناقل الذاتية (3-Way Matching)' : 'Carrier Invoice 3-Way Reconciliation'}
        size="lg"
      >
        <div style={{ padding: 10 }}>
          <p style={{ fontSize: 13, color: TK.text2, marginBottom: 14 }}>
            {lang === 'ar'
              ? 'الصق بيانات الفاتورة بتنسيق CSV (رقم الشحنة/AWB، التكلفة). سيقوم النظام بمطابقتها آلياً مع التكلفة المقدرة للشحنة في قاعدة البيانات.'
              : 'Paste CSV rows (AWB, BilledAmount). Target ERP matches each AWB against booked shipments and highlights discrepancies.'}
          </p>

          <Select
            label={lang === 'ar' ? 'الناقل' : 'Carrier / Vendor'}
            value={reconcileVendorId}
            onChange={(e) => setReconcileVendorId(e.target.value)}
            style={{ marginBottom: 12 }}
          >
            <option value="">-- Select Vendor --</option>
            {vendors.map(v => (
              <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
            ))}
          </Select>

          <textarea
            rows={5}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${TK.border}`, fontFamily: 'monospace', fontSize: 12 }}
            placeholder={"TRK-1001, 3.500\nTRK-1002, 4.250\nDHL-9921, 12.000"}
            value={reconcileRawText}
            onChange={(e) => setReconcileRawText(e.target.value)}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12, marginBottom: 16 }}>
            <Button variant="primary" onClick={handleRunReconciliation}>
              {lang === 'ar' ? 'بدء المطابقة الآلية' : 'Execute 3-Way Match'}
            </Button>
          </div>

          {reconciliationResult && (
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: `1px solid ${TK.border}` }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontWeight: 700, fontSize: 13 }}>
                <span style={{ color: TK.success }}>✓ Matched: {reconciliationResult.matchedCount}</span>
                <span style={{ color: '#e67e22' }}>⚠ Discrepancies: {reconciliationResult.mismatchedCount}</span>
                <span style={{ color: TK.error }}>✕ Not Found: {reconciliationResult.notFoundCount}</span>
                <span>Net Variance: {fmt(reconciliationResult.totalDiscrepancy)} KWD</span>
              </div>

              <TableWrapper>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>AWB</Th>
                      <Th style={{ textAlign: 'right' }}>Billed</Th>
                      <Th style={{ textAlign: 'right' }}>Expected</Th>
                      <Th style={{ textAlign: 'right' }}>Diff</Th>
                      <Th>Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {reconciliationResult.lines?.map((l, i) => (
                      <Tr key={i}>
                        <Td style={{ fontWeight: 600 }}>{l.trackingNumber}</Td>
                        <Td style={{ textAlign: 'right' }}>{fmt(l.billedAmount)}</Td>
                        <Td style={{ textAlign: 'right' }}>{fmt(l.expectedAmount)}</Td>
                        <Td style={{ textAlign: 'right', fontWeight: 700, color: l.difference !== 0 ? '#e67e22' : TK.success }}>
                          {fmt(l.difference)}
                        </Td>
                        <Td>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: l.status === 'MATCHED' ? TK.successBg : '#fef2f2',
                            color: l.status === 'MATCHED' ? TK.success : TK.error
                          }}>
                            {l.status}
                          </span>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrapper>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AccountsPayableTab;
