import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { financeService } from '../../services/api';
import { TK } from '../../tokens/kineticHorizon';
import { Card, Button, TableWrapper, Table, Thead, Tbody, Tr, Th, Td, Loader } from '../../ui';

const Banner = styled.div`
  background: ${props => props.$closed ? '#fef2f2' : '#ecfdf5'};
  border: 1px solid ${props => props.$closed ? '#f87171' : '#6ee7b7'};
  border-radius: 16px;
  padding: 20px 24px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const PeriodClosingTab = ({ lang = 'en' }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(false);
  const [periods, setPeriods] = useState([]);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeService.listAccountingPeriods();
      if (res && res.success) {
        setPeriods(res.periods || []);
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  const handleClosePeriod = async (periodId, periodName) => {
    if (!window.confirm(lang === 'ar' ? `هل أنت متأكد من إغلاق الفترة ${periodName}؟ لن يتمكن أحد من تسجيل قيود جديدة على هذه الفترة.` : `Are you sure you want to close ${periodName}? Posting to closed periods will be strictly locked.`)) {
      return;
    }
    try {
      const res = await financeService.closeAccountingPeriod(periodId);
      if (res && res.success) {
        enqueueSnackbar(`Period ${periodName} locked successfully`, { variant: 'success' });
        loadPeriods();
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    }
  };

  const handleReopenPeriod = async (periodId, periodName) => {
    try {
      const res = await financeService.reopenAccountingPeriod(periodId);
      if (res && res.success) {
        enqueueSnackbar(`Period ${periodName} re-opened`, { variant: 'info' });
        loadPeriods();
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
    }
  };

  const activePeriod = periods.find(p => !p.isClosed) || periods[0];

  return (
    <div>
      {/* Current Month-End Close Banner */}
      {activePeriod && (
        <Banner $closed={activePeriod.isClosed}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: activePeriod.isClosed ? '#b91c1c' : '#047857' }}>
              {lang === 'ar' ? 'حالة الفترة المحاسبية الحالية' : 'Current Accounting Period Status'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: activePeriod.isClosed ? '#991b1b' : '#065f46', marginTop: 4 }}>
              Period: {activePeriod.name} ({activePeriod.isClosed ? (lang === 'ar' ? 'مغلقة ومقفلة نهائياً' : 'HARD LOCKED') : (lang === 'ar' ? 'مفتوحة للعمليات' : 'OPEN FOR POSTING')})
            </div>
            <div style={{ fontSize: 13, color: TK.text2, marginTop: 4 }}>
              {format(new Date(activePeriod.startDate), 'yyyy-MM-dd')} to {format(new Date(activePeriod.endDate), 'yyyy-MM-dd')}
            </div>
          </div>

          <div>
            {!activePeriod.isClosed ? (
              <Button
                variant="primary"
                style={{ background: '#b91c1c', borderColor: '#b91c1c' }}
                onClick={() => handleClosePeriod(activePeriod.id, activePeriod.name)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 4 }}>lock</span>
                {lang === 'ar' ? 'إغلاق الفترة وترحيل الأرصدة' : 'Hard Close & Lock Period'}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => handleReopenPeriod(activePeriod.id, activePeriod.name)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 4 }}>lock_open</span>
                {lang === 'ar' ? 'إعادة فتح الفترة (للمدير فقط)' : 'Re-open Period (Admin)'}
              </Button>
            )}
          </div>
        </Banner>
      )}

      {loading ? (
        <Card style={{ padding: 40, textAlign: 'center' }}><Loader /></Card>
      ) : (
        <Card title={lang === 'ar' ? 'سجل الفترات المالية والإقفال الشهري' : 'Accounting Periods & Month-End Archive'}>
          <TableWrapper>
            <Table>
              <Thead>
                <Tr>
                  <Th>{lang === 'ar' ? 'اسم الفترة' : 'Period'}</Th>
                  <Th>{lang === 'ar' ? 'تاريخ البدء' : 'Start Date'}</Th>
                  <Th>{lang === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}</Th>
                  <Th>{lang === 'ar' ? 'الحالة' : 'Status'}</Th>
                  <Th>{lang === 'ar' ? 'تاريخ الإغلاق' : 'Closed At'}</Th>
                  <Th style={{ textAlign: 'center' }}>{lang === 'ar' ? 'إجراءات الإقفال' : 'Control'}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {periods.map(p => (
                  <Tr key={p.id}>
                    <Td style={{ fontWeight: 800, color: TK.primary }}>{p.name}</Td>
                    <Td style={{ fontSize: 12 }}>{format(new Date(p.startDate), 'yyyy-MM-dd')}</Td>
                    <Td style={{ fontSize: 12 }}>{format(new Date(p.endDate), 'yyyy-MM-dd')}</Td>
                    <Td>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: p.isClosed ? '#fef2f2' : TK.successBg,
                        color: p.isClosed ? '#b91c1c' : TK.success
                      }}>
                        {p.isClosed ? 'LOCKED' : 'OPEN'}
                      </span>
                    </Td>
                    <Td style={{ fontSize: 12 }}>{p.closedAt ? format(new Date(p.closedAt), 'yyyy-MM-dd HH:mm') : '—'}</Td>
                    <Td style={{ textAlign: 'center' }}>
                      {!p.isClosed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          style={{ color: '#b91c1c' }}
                          onClick={() => handleClosePeriod(p.id, p.name)}
                        >
                          {lang === 'ar' ? 'إقفال' : 'Close'}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReopenPeriod(p.id, p.name)}
                        >
                          {lang === 'ar' ? 'إعادة فتح' : 'Unlock'}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrapper>
        </Card>
      )}
    </div>
  );
};

export default PeriodClosingTab;
