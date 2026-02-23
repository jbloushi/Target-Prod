import React, { useState, useEffect, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNavigate } from 'react-router-dom';
// import { useShipment } from '../context/ShipmentContext'; // DEPRECATED for fetching
import { useShipmentStats } from '../utils/useShipmentStats';
import { useShipments } from '../utils/useShipments';
import { PageHeader, Button, Card, StatusPill, Loader } from '../ui';

// --- Animations ---
const pulseGlow = keyframes`
    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 217, 184, 0.4); }
    50% { transform: scale(1.05); box-shadow: 0 0 20px 10px rgba(0, 217, 184, 0); }
`;

const ringPulse = keyframes`
    0% { opacity: 0; transform: scale(0.8); }
    50% { opacity: 0.3; }
    100% { opacity: 0; transform: scale(1.4); }
`;

// --- Styled Components ---
const DashboardGrid = styled.div`
  display: grid;
  gap: 32px;
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
`;

const StatCardContainer = styled.div`
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-2px);
    border-color: var(--accent-primary);
    box-shadow: 0 8px 24px rgba(0, 217, 184, 0.15);
  }
`;

const StatHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const StatLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const StatIcon = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.$bg || 'rgba(255, 255, 255, 0.1)'};
  color: ${props => props.$color || 'var(--text-primary)'};
  
  svg { width: 24px; height: 24px; }
`;

const StatValue = styled.div`
  font-family: 'Outfit', sans-serif;
  font-size: 36px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
`;

const StatMeta = styled.div`
    font-size: 12px;
    color: var(--text-secondary);
`;

const ChartsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;

  @media (min-width: 1024px) {
    grid-template-columns: 2fr 1fr;
  }
`;

const ChartContainer = styled.div`
  height: 240px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 20px 10px 0;
  gap: 12px;
`;

const BarColumn = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    height: 100%;
    justify-content: flex-end;
    group;
`;

const Bar = styled.div`
    width: 100%;
    max-width: 40px;
    background: linear-gradient(180deg, var(--accent-primary) 0%, rgba(0, 217, 184, 0.2) 100%);
    border-radius: 8px 8px 0 0;
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    min-height: 4px;
    opacity: 0.8;
    position: relative;
    
    &:hover {
        opacity: 1;
        transform: scaleY(1.05);
        box-shadow: 0 0 15px rgba(0, 217, 184, 0.3);
    }
`;

const BarLabel = styled.span`
    margin-top: 12px;
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 600;
`;

// --- Coming Soon Overlay Components ---
const ComingSoonContainer = styled.div`
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(135deg, rgba(10, 14, 26, 0.85) 0%, rgba(10, 14, 26, 0.95) 100%);
    backdrop-filter: blur(6px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.05);
    pointer-events: none;
`;

const ComingSoonIcon = styled.div`
    width: 64px; height: 64px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(0, 217, 184, 0.1) 0%, rgba(66, 165, 245, 0.1) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    border: 1px solid rgba(0, 217, 184, 0.2);
    position: relative;
    
    &::after {
        content: '';
        position: absolute;
        inset: -4px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--accent-primary), var(--accent-info));
        opacity: 0.2;
        animation: ${ringPulse} 3s infinite;
    }
    
    svg { color: var(--accent-primary); width: 28px; height: 28px; }
`;

const ComingSoonTitle = styled.h3`
    font-family: 'Outfit', sans-serif;
    font-size: 20px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-info) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin: 0 0 8px 0;
`;

const ComingSoonText = styled.p`
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
    max-width: 200px;
    text-align: center;
`;

const BlurredContent = styled.div`
    filter: blur(4px);
    opacity: 0.3;
    pointer-events: none;
    padding: 24px;
`;

// --- Table Styles ---
const TableContainer = styled.div`
  overflow-x: auto;
  margin: -1px; /* fix border overlap */
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  
  th {
    text-align: left;
    padding: 16px 24px;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-tertiary);
  }

  td {
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color);
    font-size: 14px;
    color: var(--text-primary);
  }

  tbody tr {
    transition: background 0.2s;
    cursor: pointer;
    &:hover { background: var(--bg-tertiary); }
    &:last-child td { border-bottom: none; }
  }
`;

const TrackingId = styled.span`
    font-weight: 600;
    color: var(--accent-primary);
    font-family: 'Outfit', sans-serif;
`;

// --- Components ---

const StatWidget = ({ title, value, icon, color, meta }) => (
    <StatCardContainer>
        <StatHeader>
            <StatLabel>{title}</StatLabel>
            <StatIcon $bg={`${color}20`} $color={color}>
                {icon}
            </StatIcon>
        </StatHeader>
        <StatValue>{value}</StatValue>
        {meta && <StatMeta>{meta}</StatMeta>}
    </StatCardContainer>
);

const ComingSoonOverlay = ({ title, description }) => (
    <ComingSoonContainer>
        <ComingSoonIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
        </ComingSoonIcon>
        <ComingSoonTitle>{title}</ComingSoonTitle>
        <ComingSoonText>{description}</ComingSoonText>
    </ComingSoonContainer>
);

const DashboardPage = () => {
    const navigate = useNavigate();

    // Fetch aggregated stats (fast, small payload)
    const { stats, loading: statsLoading } = useShipmentStats();

    // Fetch recent shipments (paginated, small payload)
    const { shipments: recentShipments, loading: recentLoading } = useShipments({ limit: 5 });

    // Calculate Shipment Activity (Group by Month)
    const chartData = useMemo(() => {
        if (!stats?.monthly || stats.monthly.length === 0) return [];

        // Transform backend aggregation to chart format
        // Backend returns: { _id: { month: M, year: Y }, count: N } sorted by date
        // Chart needs: { label: 'Jan', percent: N }

        // Create map for easy lookup
        const dataMap = {};
        stats.monthly.forEach(item => {
            const date = new Date(item._id.year, item._id.month - 1); // Month is 1-indexed in Mongo? Yes, $month returns 1-12. Date() check.
            const label = date.toLocaleString('default', { month: 'short' });
            dataMap[label] = item.count;
        });

        // Initialize last 6 months (same as before to keep UI consistent)
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const label = d.toLocaleString('default', { month: 'short' });
            months.push({
                label,
                count: dataMap[label] || 0
            });
        }

        // Find max for scaling
        const max = Math.max(...months.map(m => m.count), 5); // min scale 5
        return months.map(m => ({ ...m, percent: (m.count / max) * 100 }));
    }, [stats]);

    return (
        <DashboardGrid>
            <PageHeader
                title="Dashboard (VERIFIED V3)"
                description="Overview of your logistics operations."
                action={
                    <Button
                        variant="primary"
                        onClick={() => navigate('/create')}
                        icon={<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>}
                    >
                        New Shipment
                    </Button>
                }
            />

            {/* Stats */}
            <StatsGrid>
                <StatWidget
                    title="Total Shipments"
                    value={stats.total}
                    color="#00d9b8"
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /><line x1="3.27" y1="16.96" x2="12" y2="12.01" /><line x1="20.73" y1="16.96" x2="12" y2="12.01" /></svg>}
                    meta="All time"
                />
                <StatWidget
                    title="Pending"
                    value={stats.pending}
                    color="#ffa726"
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
                    meta="Ready for Pickup"
                />
                <StatWidget
                    title="Picked Up"
                    value={stats.pickedUp}
                    color="#42a5f5"
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>}
                    meta="Collected by Driver"
                />
                <StatWidget
                    title="In Transit"
                    value={stats.inTransit}
                    color="#3b82f6"
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>}
                    meta="On the Way"
                />
                <StatWidget
                    title="Delivered"
                    value={stats.delivered}
                    color="#4caf50"
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
                    meta="Completed"
                />
                <StatWidget
                    title="Exceptions"
                    value={stats.exceptions}
                    color="#ef5350"
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
                    meta="Issues"
                />
            </StatsGrid>

            {/* Charts Section */}
            <ChartsGrid>
                <Card title="Shipment Activity">
                    {statsLoading ? (
                        <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Loader />
                        </div>
                    ) : (
                        <ChartContainer>
                            {chartData.length > 0 ? chartData.map((data, i) => (
                                <BarColumn key={i}>
                                    <Bar style={{ height: `${data.percent}%` }}>
                                        {/* Tooltip could go here */}
                                    </Bar>
                                    <BarLabel>{data.label}</BarLabel>
                                </BarColumn>
                            )) : (
                                <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    No activity data yet
                                </div>
                            )}
                        </ChartContainer>
                    )}
                </Card>

                <Card title="Net Revenue" style={{ position: 'relative', overflow: 'hidden' }}>
                    <ComingSoonOverlay
                        title="Revenue Analytics"
                        description="Advanced financial insights and reporting coming soon."
                    />
                    <BlurredContent>
                        <div style={{ textAlign: 'center', marginTop: '40px' }}>
                            <div style={{ fontSize: '48px', fontWeight: 'bold' }}>0.00 KD</div>
                            <div style={{ color: 'var(--text-secondary)' }}>Total Revenue</div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <div style={{ flex: 1, height: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}></div>
                            <div style={{ flex: 1, height: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}></div>
                        </div>
                    </BlurredContent>
                </Card>
            </ChartsGrid>

            <StatsGrid>
                <Card title="Financial Books" style={{ position: 'relative', overflow: 'hidden', gridColumn: '1 / -1' }}>
                    <ComingSoonOverlay
                        title="Financial Books"
                        description="Bookkeeping and ledger management module."
                    />
                    <BlurredContent>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} style={{ height: '100px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}></div>
                            ))}
                        </div>
                    </BlurredContent>
                </Card>
            </StatsGrid>

            {/* Recent Shipments */}
            <Card title="Recent Shipments">
                <TableContainer>
                    <StyledTable>
                        <thead>
                            <tr>
                                <th>Tracking #</th>
                                <th>Route</th>
                                <th>Customer</th>
                                <th>Status</th>
                                <th>Est. Delivery</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentLoading ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}><Loader /></td></tr>
                            ) : recentShipments?.slice(0, 5).map(row => (
                                <tr key={row._id} onClick={() => navigate(`/shipment/${row.trackingNumber}`)}>
                                    <td><TrackingId>#{row.trackingNumber}</TrackingId></td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontWeight: '600' }}>{row.origin?.city || 'N/A'}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>→</span>
                                            <span style={{ fontWeight: '600' }}>{row.destination?.city || 'N/A'}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div>{row.customer?.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{row.customer?.phone}</div>
                                    </td>
                                    <td><StatusPill status={row.status} /></td>
                                    <td>{row.estimatedDelivery ? new Date(row.estimatedDelivery).toLocaleDateString() : '—'}</td>
                                </tr>
                            ))}
                            {!recentLoading && (!recentShipments || recentShipments.length === 0) && (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No recent shipments found.</td></tr>
                            )}
                        </tbody>
                    </StyledTable>
                </TableContainer>
            </Card>

        </DashboardGrid>
    );
};

export default DashboardPage;
