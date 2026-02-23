import React, { useState } from 'react';
import styled from 'styled-components';
import { Card, Table, Thead, Tbody, Tr, Th, Td, Button, Loader } from '../ui';
import ExportButton from '../components/ExportButton';
import { format } from 'date-fns';

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
`;

const ReportTitle = styled.h3`
    font-size: 18px;
    font-weight: 700;
    margin: 0;
`;

// Placeholder data generation for demonstration/MVP
// In a real implementation, these would come from the backend via useEffect
const FinanceReports = ({ ledger = [], shipments = [], organizations = [] }) => {
    const [activeReport, setActiveReport] = useState('profitability');

    const renderProfitability = () => {
        // Calculate profitability from shipments
        const data = shipments.map(s => {
            const cost = s.carrierRate || (s.pricingSnapshot?.carrierRate) || (s.price * 0.7) || 0; // Fallback mock cost logic
            const revenue = s.pricingSnapshot?.totalPrice || s.price || 0;
            const profit = revenue - cost;
            const margin = revenue ? ((profit / revenue) * 100).toFixed(1) : '0.0';

            return {
                Tracking: s.trackingNumber,
                Date: format(new Date(s.createdAt), 'yyyy-MM-dd'),
                Customer: s.customer?.name || 'N/A',
                Cost: cost.toFixed(3),
                Revenue: revenue.toFixed(3),
                Profit: profit.toFixed(3),
                Margin: `${margin}%`,
                Status: s.paid ? 'PAID' : 'UNPAID'
            };
        });

        return (
            <Card>
                <ReportHeader>
                    <ReportTitle>Shipment Profitability</ReportTitle>
                    <ExportButton data={data} filename="Shipment_Profitability" />
                </ReportHeader>
                <div style={{ overflowX: 'auto' }}>
                    <Table>
                        <Thead>
                            <Tr>
                                <Th>Tracking</Th>
                                <Th>Date</Th>
                                <Th>Customer</Th>
                                <Th style={{ textAlign: 'right' }}>Cost</Th>
                                <Th style={{ textAlign: 'right' }}>Revenue</Th>
                                <Th style={{ textAlign: 'right' }}>Profit</Th>
                                <Th style={{ textAlign: 'right' }}>Margin</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {data.length > 0 ? data.slice(0, 50).map((row, i) => ( // Limit to 50 for preview
                                <Tr key={i}>
                                    <Td>{row.Tracking}</Td>
                                    <Td>{row.Date}</Td>
                                    <Td>{row.Customer}</Td>
                                    <Td style={{ textAlign: 'right' }}>{row.Cost}</Td>
                                    <Td style={{ textAlign: 'right' }}>{row.Revenue}</Td>
                                    <Td style={{ textAlign: 'right', color: parseFloat(row.Profit) >= 0 ? 'var(--accent-success)' : 'var(--accent-error)' }}>
                                        {row.Profit}
                                    </Td>
                                    <Td style={{ textAlign: 'right' }}>{row.Margin}</Td>
                                </Tr>
                            )) : (
                                <Tr><Td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>No shipments found</Td></Tr>
                            )}
                        </Tbody>
                    </Table>
                </div>
            </Card>
        );
    };

    const renderDailyRevenue = () => {
        // Aggregate ledger for daily revenue
        const dailyStats = ledger.reduce((acc, entry) => {
            const date = format(new Date(entry.createdAt), 'yyyy-MM-dd');
            if (!acc[date]) acc[date] = { date, revenue: 0, received: 0 };

            if (entry.entryType === 'DEBIT' && entry.category === 'SHIPMENT_CHARGE') {
                acc[date].revenue += entry.amount;
            } else if (entry.entryType === 'CREDIT' && entry.category === 'PAYMENT') {
                acc[date].received += entry.amount;
            }
            return acc;
        }, {});

        const data = Object.values(dailyStats).sort((a, b) => new Date(b.date) - new Date(a.date));

        return (
            <Card>
                <ReportHeader>
                    <ReportTitle>Daily Revenue & Collections</ReportTitle>
                    <ExportButton data={data} filename="Daily_Revenue" />
                </ReportHeader>
                <Table>
                    <Thead>
                        <Tr>
                            <Th>Date</Th>
                            <Th style={{ textAlign: 'right' }}>Invoiced Revenue</Th>
                            <Th style={{ textAlign: 'right' }}>Payments Collected</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        {data.length > 0 ? data.map((row, i) => (
                            <Tr key={i}>
                                <Td>{row.date}</Td>
                                <Td style={{ textAlign: 'right' }}>{row.revenue.toFixed(3)}</Td>
                                <Td style={{ textAlign: 'right', color: 'var(--accent-success)' }}>{row.received.toFixed(3)}</Td>
                            </Tr>
                        )) : (
                            <Tr><Td colSpan={3} style={{ textAlign: 'center', padding: '20px' }}>No transactions found</Td></Tr>
                        )}
                    </Tbody>
                </Table>
            </Card>
        );
    };

    const renderOrgBalances = () => {
        const data = organizations.map(org => ({
            Organization: org.name,
            'Credit Limit': (org.creditLimit || 0).toFixed(3),
            'Current Balance': (org.balance || 0).toFixed(3),
            'Unapplied Cash': (org.unappliedBalance || 0).toFixed(3), // Use unappliedBalance from model
            Status: org.active ? 'Active' : 'Inactive'
        })).sort((a, b) => parseFloat(b['Current Balance']) - parseFloat(a['Current Balance']));

        return (
            <Card>
                <ReportHeader>
                    <ReportTitle>Organization Balances</ReportTitle>
                    <ExportButton data={data} filename="Organization_Balances" />
                </ReportHeader>
                <div style={{ overflowX: 'auto' }}>
                    <Table>
                        <Thead>
                            <Tr>
                                <Th>Organization</Th>
                                <Th style={{ textAlign: 'right' }}>Credit Limit</Th>
                                <Th style={{ textAlign: 'right' }}>Current Balance</Th>
                                <Th style={{ textAlign: 'right' }}>Unapplied Cash</Th>
                                <Th>Status</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {data.length > 0 ? data.map((row, i) => (
                                <Tr key={i}>
                                    <Td style={{ fontWeight: 600 }}>{row.Organization}</Td>
                                    <Td style={{ textAlign: 'right' }}>{row['Credit Limit']}</Td>
                                    <Td style={{ textAlign: 'right', fontWeight: 700, color: parseFloat(row['Current Balance']) > 0 ? 'var(--accent-error)' : 'inherit' }}>
                                        {row['Current Balance']}
                                    </Td>
                                    <Td style={{ textAlign: 'right', color: parseFloat(row['Unapplied Cash']) > 0 ? 'var(--accent-success)' : 'inherit' }}>
                                        {row['Unapplied Cash']}
                                    </Td>
                                    <Td>{row.Status}</Td>
                                </Tr>
                            )) : (
                                <Tr><Td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>No organizations found</Td></Tr>
                            )}
                        </Tbody>
                    </Table>
                </div>
            </Card>
        );
    };

    return (
        <ReportContainer>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Button
                    variant={activeReport === 'profitability' ? 'primary' : 'outline'}
                    onClick={() => setActiveReport('profitability')}
                >
                    Shipment Profitability
                </Button>
                <Button
                    variant={activeReport === 'revenue' ? 'primary' : 'outline'}
                    onClick={() => setActiveReport('revenue')}
                >
                    Revenue & Collections
                </Button>
                {organizations.length > 0 && (
                    <Button
                        variant={activeReport === 'balances' ? 'primary' : 'outline'}
                        onClick={() => setActiveReport('balances')}
                    >
                        Organization Balances
                    </Button>
                )}
            </div>

            {activeReport === 'profitability' && renderProfitability()}
            {activeReport === 'revenue' && renderDailyRevenue()}
            {activeReport === 'balances' && renderOrgBalances()}
        </ReportContainer>
    );
};

export default FinanceReports;
