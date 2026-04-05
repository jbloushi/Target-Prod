import React, { useCallback, useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { shipmentService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useShipments } from '../utils/useShipments';
import { useShipmentStats } from '../utils/useShipmentStats';
import { TableWrapper, Table, Thead, Tbody, Tr, Th, Td, Button, Input, StatusPill } from '../ui';
import { generateWaybillPDF } from '../utils/pdfGenerator';

import { Menu, MenuItem, Divider, ListItemIcon, ListItemText, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';

import DescriptionIcon from '@mui/icons-material/Description';
import ReceiptIcon from '@mui/icons-material/Receipt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AddIcon from '@mui/icons-material/Add';
import SearchOffIcon from '@mui/icons-material/SearchOff';

// --- Animations ---
const shimmer = keyframes`
  0% { background-position: -468px 0; }
  100% { background-position: 468px 0; }
`;

// --- Styled Components ---

const SkeletonBox = styled.div`
  height: ${props => props.$height || '20px'};
  width: ${props => props.$width || '100%'};
  border-radius: 4px;
  background: #1a2035;
  background-image: linear-gradient(to right, #1a2035 0%, #2a3347 20%, #1a2035 40%, #1a2035 100%);
  background-repeat: no-repeat;
  background-size: 800px 104px;
  animation: ${shimmer} 1.5s linear infinite forwards;
`;

const Toolbar = styled.div`
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
`;

const ResultsMeta = styled.div`
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 12px;
`;

const EmptyStateContainer = styled.div`
  padding: 80px 24px;
  text-align: center;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  
  svg {
    font-size: 64px;
    opacity: 0.2;
    margin-bottom: 8px;
  }
`;

const CounterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const CounterCard = styled.button`
  background: var(--bg-secondary);
  border: 1px solid ${props => props.$active ? props.$color : 'var(--border-color)'};
  padding: 18px 20px;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  display: grid;
  gap: 6px;

  &:hover {
    transform: translateY(-2px);
    border-color: ${props => props.$color};
    box-shadow: 0 4px 20px -5px ${props => `${props.$color}33`};
  }
`;

const CounterLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const CounterValue = styled.span`
  font-family: 'Outfit', sans-serif;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
`;

const PaginationContainer = styled.div`
  padding: 16px;
  display: flex;
  justify-content: center;
  gap: 8px;
  background: var(--bg-secondary);
  border-radius: 0 0 16px 16px;
`;

const PageBtn = styled.button`
  background: ${props => props.$active ? 'var(--accent-primary)' : 'transparent'};
  color: ${props => props.$active ? '#0a0e1a' : 'var(--text-secondary)'};
  border: 1px solid ${props => props.$active ? 'var(--accent-primary)' : 'var(--border-color)'};
  border-radius: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-weight: 600;

  &:hover:not(:disabled) {
    border-color: var(--accent-primary);
    color: ${props => props.$active ? '#0a0e1a' : 'var(--accent-primary)'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const ACTIVE_STATUSES = ['created', 'in_transit', 'out_for_delivery'];
const PENDING_STATUSES = ['draft', 'pending', 'updated', 'ready_for_pickup', 'picked_up'];

const STATUS_GROUP_MAP = {
  all: undefined,
  drafts: ['draft'],
  pending: ['pending', 'updated', 'ready_for_pickup'],
  active: ['created', 'picked_up', 'in_transit', 'out_for_delivery'],
  delivered: ['delivered', 'completed']
};

const DEBOUNCE_MS = 350;

const ShipmentList = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, isStaff } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('all');
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Menu State
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [activeShipment, setActiveShipment] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
      setPage(1); // Reset page on search
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Data Fetching via SWR
  const statusIn = STATUS_GROUP_MAP[viewMode];
  const { shipments, pagination, loading, mutate } = useShipments({
    page,
    limit: ITEMS_PER_PAGE,
    statusIn,
    q: debouncedSearchQuery
  });

  const { stats, loading: statsLoading } = useShipmentStats();

  const totalPages = Math.max(pagination.pages || 1, 1);
  const hasFilters = Boolean(searchQuery) || viewMode !== 'all';

  const getVisiblePages = () => {
    const maxVisiblePages = 7;
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const start = Math.max(1, page - 3);
    const end = Math.min(totalPages, start + maxVisiblePages - 1);
    const adjustedStart = Math.max(1, end - maxVisiblePages + 1);

    return Array.from({ length: end - adjustedStart + 1 }, (_, i) => adjustedStart + i);
  };

  const visiblePages = getVisiblePages();
  // The 'counters' array is not used for rendering the CounterGrid directly.
  // The CounterGrid is rendered with hardcoded CounterCard components below.

  // Handlers
  const handleMenuOpen = (event, shipment) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setActiveShipment(shipment);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setActiveShipment(null);
  };

  const handleDownloadLabel = async () => {
    if (activeShipment) {
      await generateWaybillPDF(activeShipment);
    }
    handleMenuClose();
  };

  const handleOpenPdf = (url) => {
    if (!url) return;
    if (url.startsWith('data:')) {
      try {
        const arr = url.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      } catch (e) {
        console.error('Error opening PDF data URI:', e);
        window.open(url, '_blank');
      }
    } else {
      window.open(url, '_blank');
    }
    handleMenuClose();
  };

  const handleDelete = async () => {
    if (!activeShipment) return;
    setDeleteConfirmOpen(true);
    handleMenuClose();
  };

  const handleDeleteConfirmed = async () => {
    if (!activeShipment) return;
    try {
      await shipmentService.deleteShipment(activeShipment.trackingNumber);
      mutate();
    } catch (e) {
      console.error('Delete failed', e);
    } finally {
      setDeleteConfirmOpen(false);
      setActiveShipment(null);
    }
  };

  const handleApproveEdit = () => {
    if (activeShipment) {
      navigate(`/shipment/${activeShipment.trackingNumber}?action=approve`);
    }
    handleMenuClose();
  };

  const renderSkeleton = () => (
    Array.from({ length: 5 }).map((_, i) => (
      <Tr key={`skel-${i}`}>
        <Td><SkeletonBox $width="120px" /><SkeletonBox $width="60px" style={{ marginTop: '4px' }} /></Td>
        <Td><SkeletonBox $width="100px" /></Td>
        <Td><SkeletonBox $width="100px" /></Td>
        <Td><SkeletonBox $width="140px" /></Td>
        <Td><SkeletonBox $width="100px" /><SkeletonBox $width="80px" style={{ marginTop: '4px' }} /></Td>
        <Td><SkeletonBox $width="70px" $height="24px" /></Td>
        <Td><SkeletonBox $width="80px" /></Td>
        <Td><SkeletonBox $width="80px" /></Td>
        <Td style={{ textAlign: 'right' }}><SkeletonBox $width="60px" $height="32px" style={{ marginLeft: 'auto' }} /></Td>
      </Tr>
    ))
  );

  return (
    <div>
      <CounterGrid>
        <CounterCard
          $active={viewMode === 'all'}
          $color="var(--accent-primary)"
          onClick={() => { setViewMode('all'); setPage(1); }}
        >
          <CounterLabel>All Shipments</CounterLabel>
          <CounterValue>{stats.total || 0}</CounterValue>
        </CounterCard>
        <CounterCard
          $active={viewMode === 'drafts'}
          $color="#ffa726"
          onClick={() => { setViewMode('drafts'); setPage(1); }}
        >
          <CounterLabel>Drafts</CounterLabel>
          <CounterValue>{stats.drafts || 0}</CounterValue>
        </CounterCard>
        <CounterCard
          $active={viewMode === 'pending'}
          $color="#00d9b8"
          onClick={() => { setViewMode('pending'); setPage(1); }}
        >
          <CounterLabel>Pending Action</CounterLabel>
          <CounterValue>{stats.pending || 0}</CounterValue>
        </CounterCard>
        <CounterCard
          $active={viewMode === 'active'}
          $color="#2196f3"
          onClick={() => { setViewMode('active'); setPage(1); }}
        >
          <CounterLabel>In Transit</CounterLabel>
          <CounterValue>{stats.inTransit || 0}</CounterValue>
        </CounterCard>
        <CounterCard
          $active={viewMode === 'delivered'}
          $color="#4caf50"
          onClick={() => { setViewMode('delivered'); setPage(1); }}
        >
          <CounterLabel>Completed</CounterLabel>
          <CounterValue>{stats.delivered || 0}</CounterValue>
        </CounterCard>
      </CounterGrid>

      {/* List Container */}
      <div style={{ borderRadius: '16px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
        {/* Search Bar */}
        <Toolbar>
          <div style={{ flex: 1, maxWidth: '400px' }}>
            <Input
              placeholder="Search by tracking number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <ResultsMeta>
            <span>
              {loading ? 'Fetching...' : `Showing ${shipments.length} of ${pagination.total}`}
            </span>
            {hasFilters && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchQuery('');
                  setViewMode('all');
                  setPage(1);
                }}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Clear filters
              </Button>
            )}
          </ResultsMeta>
        </Toolbar>

        <TableWrapper style={{ border: 'none', borderRadius: 0 }}>
          <Table>
            <Thead>
              <Tr>
                <Th>Tracking Info</Th>
                <Th>Organization</Th>
                <Th>Created By</Th>
                <Th>Route</Th>
                <Th>Customer</Th>
                <Th style={{ verticalAlign: 'middle' }}>Status</Th>
                <Th>Created</Th>
                <Th>Est. Deliv</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loading ? renderSkeleton() : shipments.map(shipment => (
                <Tr
                  key={shipment.id}
                  onClick={() => navigate(`/shipment/${shipment.trackingNumber}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <Td>
                    <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{shipment.trackingNumber}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{shipment.serviceCode || 'Standard'}</div>
                  </Td>
                  <Td>
                    <div style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>{shipment.organization?.name || 'Personal'}</div>
                  </Td>
                  <Td>
                    <div style={{ fontSize: '13px' }}>{shipment.user?.name || 'System'}</div>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: '600' }}>{shipment.origin?.city}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>→</span>
                      <span style={{ fontWeight: '600' }}>{shipment.destination?.city}</span>
                    </div>
                  </Td>
                  <Td>
                    <div>{shipment.customer?.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{shipment.customer?.phone}</div>
                  </Td>
                  <Td style={{ verticalAlign: 'middle' }}><StatusPill status={shipment.status} /></Td>
                  <Td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{shipment.createdAt ? new Date(shipment.createdAt).toLocaleDateString() : '—'}</Td>
                  <Td style={{ fontSize: '13px' }}>
                    {shipment.estimatedDelivery ? (
                      (() => {
                        const days = Math.ceil((new Date(shipment.estimatedDelivery) - new Date()) / (1000 * 60 * 60 * 24));
                        return days > 0 ? `~${days} Days` : 'Today';
                      })()
                    ) : '~Days'}
                  </Td>
                  <Td style={{ textAlign: 'right' }}>
                    <Button
                      variant="secondary"
                      onClick={(e) => handleMenuOpen(e, shipment)}
                      style={{ padding: '6px 12px', fontSize: '13px' }}
                    >
                      Actions
                    </Button>
                  </Td>
                </Tr>
              ))}
              {!loading && shipments.length === 0 && (
                <Tr>
                  <Td colSpan="9" style={{ padding: 0 }}>
                    <EmptyStateContainer>
                      <SearchOffIcon />
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '18px' }}>No shipments found</div>
                      <div style={{ maxWidth: '300px', marginBottom: '16px' }}>We couldn't find any shipments matching your current filters or search criteria.</div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        {hasFilters ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSearchQuery('');
                              setViewMode('all');
                              setPage(1);
                            }}
                          >
                            Clear search
                          </Button>
                        ) : (
                          <Button onClick={() => navigate('/create')}>
                            <AddIcon style={{ fontSize: '18px', marginRight: '4px' }} /> Create First Shipment
                          </Button>
                        )}
                      </div>
                    </EmptyStateContainer>
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </TableWrapper>

        {/* Mui Menu for Actions */}
        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={handleMenuClose}
          PaperProps={{
            style: {
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              minWidth: '180px'
            }
          }}
        >
          <MenuItem onClick={handleDownloadLabel}>
            <ListItemIcon><DescriptionIcon fontSize="small" sx={{ color: 'var(--text-secondary)' }} /></ListItemIcon>
            <ListItemText>Label</ListItemText>
          </MenuItem>

          {activeShipment && isStaff && (
            <div>
              <Divider sx={{ my: 0.5, borderColor: 'var(--border-color)', opacity: 0.5 }} />
              <div style={{ padding: '4px 16px', fontSize: '10px', color: 'var(--text-secondary)', textAlign: 'center', opacity: 0.7 }}>
                {activeShipment.carrier?.toUpperCase() || 'CARRIER'}
              </div>

              <MenuItem
                disabled={!activeShipment.labelUrl}
                onClick={() => handleOpenPdf(activeShipment.labelUrl)}
              >
                <ListItemIcon><LocalShippingIcon fontSize="small" sx={{ color: 'var(--text-secondary)' }} /></ListItemIcon>
                <ListItemText>AWB / Label</ListItemText>
              </MenuItem>
              <MenuItem
                disabled={!activeShipment.invoiceUrl}
                onClick={() => handleOpenPdf(activeShipment.invoiceUrl)}
              >
                <ListItemIcon><ReceiptIcon fontSize="small" sx={{ color: 'var(--text-secondary)' }} /></ListItemIcon>
                <ListItemText>Invoice</ListItemText>
              </MenuItem>
              {['pending', 'draft', 'updated', 'ready_for_pickup', 'picked_up'].includes(activeShipment.status) && (
                <MenuItem onClick={handleApproveEdit}>
                  <ListItemIcon><CheckCircleIcon fontSize="small" sx={{ color: 'var(--text-secondary)' }} /></ListItemIcon>
                  <ListItemText>Approve / Edit</ListItemText>
                </MenuItem>
              )}
            </div>
          )}

          {activeShipment && ['pending', 'draft'].includes(activeShipment.status) && (
            <div>
              <Divider sx={{ my: 0.5, borderColor: 'var(--border-color)', opacity: 0.5 }} />
              <MenuItem onClick={handleDelete} sx={{ color: 'var(--accent-error)' }}>
                <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: 'var(--accent-error)' }} /></ListItemIcon>
                <ListItemText>Delete</ListItemText>
              </MenuItem>
            </div>
          )}
        </Menu>

        {/* Pagination */}
        {totalPages > 1 && (
          <PaginationContainer>
            <PageBtn disabled={page === 1} onClick={() => setPage(1)}>«</PageBtn>
            <PageBtn disabled={page === 1} onClick={() => setPage(p => p - 1)}>&lt;</PageBtn>
            {visiblePages[0] > 1 && (
              <>
                <PageBtn onClick={() => setPage(1)}>1</PageBtn>
                {visiblePages[0] > 2 && <span style={{ padding: '0 6px', color: 'var(--text-secondary)' }}>…</span>}
              </>
            )}
            {visiblePages.map(p => (
              <PageBtn key={p} $active={p === page} onClick={() => setPage(p)}>{p}</PageBtn>
            ))}
            {visiblePages[visiblePages.length - 1] < totalPages && (
              <>
                {visiblePages[visiblePages.length - 1] < totalPages - 1 && <span style={{ padding: '0 6px', color: 'var(--text-secondary)' }}>…</span>}
                <PageBtn onClick={() => setPage(totalPages)}>{totalPages}</PageBtn>
              </>
            )}
            <PageBtn disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>&gt;</PageBtn>
            <PageBtn disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</PageBtn>
          </PaginationContainer>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete Shipment?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to permanently delete shipment <strong>{activeShipment?.trackingNumber}</strong>? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <DialogActions>
            <button onClick={() => setDeleteConfirmOpen(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleDeleteConfirmed} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#f44336', color: 'white', cursor: 'pointer', fontWeight: 700 }}>Delete</button>
          </DialogActions>
        </DialogActions>
      </Dialog>

    </div>
  );
};

export default ShipmentList;
