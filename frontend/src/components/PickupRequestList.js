import React, { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Button, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    CircularProgress, Grid, Divider, Alert
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { shipmentService } from '../services/api';
import { useSnackbar } from 'notistack';
import { useAuth } from '../context/AuthContext';

import AddressPanel from './AddressPanel';

import { generateWaybillPDF } from '../utils/pdfGenerator';
import PrintIcon from '@mui/icons-material/Print';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

const PickupRequestList = () => {
    const { user } = useAuth();
    const { enqueueSnackbar } = useSnackbar();

    const [requests, setRequests] = useState([]);
    const [pendingShipments, setPendingShipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Review/Edit Dialog State
    // mode: 'review' (Staff) or 'edit' (Client)
    const [reviewDialog, setReviewDialog] = useState({ open: false, request: null, mode: 'review' });
    const [editData, setEditData] = useState(null);

    // Reject Modal State
    const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '' });

    // Fetch requests and pending shipments
    const fetchRequests = async () => {
        setLoading(true);
        try {
            // Fetch Pickup Requests
            const reqData = await shipmentService.getAllPickupRequests();
            if (reqData.success) {
                setRequests(reqData.data);
            }

            // Fetch Shipments for staff/admin to show in "Pending Approvals"
            if (user?.role === 'staff' || user?.role === 'admin') {
                const shipData = await shipmentService.getAllShipments();
                const allShips = Array.isArray(shipData) ? shipData : (shipData?.data || []);
                const pending = allShips.filter(s =>
                    (s.status === 'pending' || s.status === 'ready_for_pickup' || s.status === 'picked_up') &&
                    !s.dhlConfirmed
                );
                setPendingShipments(pending);
            }
        } catch (error) {
            console.error('Failed to fetch requests/shipments', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    // Open Review/Edit Dialog
    const handleOpenDialog = (item, mode = 'review') => {
        setReviewDialog({ open: true, request: item, mode });
        // Map common fields if it's a shipment
        const data = JSON.parse(JSON.stringify(item));
        if (data.items && !data.parcels) {
            data.parcels = data.items;
        }
        if (data.origin && !data.sender) {
            data.sender = data.origin;
        }
        if (data.destination && !data.receiver) {
            data.receiver = data.destination;
        }
        setEditData(data);
    };

    // Handle Edit Change
    const handleEditChange = (section, field, value, index = null) => {
        setEditData(prev => {
            const newData = { ...prev };
            if (section === 'parcels') {
                newData.parcels[index][field] = value;
            } else if (section) {
                if (field === null) {
                    newData[section] = value;
                } else {
                    newData[section][field] = value;
                }
            } else {
                newData[field] = value;
            }
            return newData;
        });
    };


    // Save (Client Edit) or Approve (Staff)
    const handleDialogSubmit = async () => {
        if (!editData) return;

        setActionLoading(true);
        try {
            // 2. If Staff Reviewing -> Approve / Finalize
            if (reviewDialog.mode === 'review') {
                // If it's an existing shipment (awaiting DGR submission)
                if (editData.trackingNumber && !editData.dhlConfirmed) {
                    await shipmentService.submitToDgr(editData.trackingNumber);
                    enqueueSnackbar('Shipment Processed & DGR Label Generated!', { variant: 'success' });
                }
                // If it's still a raw Pickup Request
                else {
                    await shipmentService.approvePickupRequest(editData._id);
                    enqueueSnackbar('Request Approved & Shipment Created!', { variant: 'success' });
                }
            } else {
                await shipmentService.updatePickupRequest(editData._id, {
                    sender: editData.sender,
                    receiver: editData.receiver,
                    parcels: editData.parcels,
                    serviceCode: editData.serviceCode
                });
                enqueueSnackbar('Request Updated Successfully!', { variant: 'success' });
            }

            setReviewDialog({ open: false, request: null, mode: 'review' });
            fetchRequests();
        } catch (error) {
            enqueueSnackbar(error.message || 'Operation Failed', { variant: 'error' });
        } finally {
            setActionLoading(false);
        }
    };

    // Delete Handler (Client)
    const handleDelete = async (request) => {
        if (!window.confirm('Are you sure you want to delete this pickup request?')) return;

        setActionLoading(true);
        try {
            await shipmentService.deletePickupRequest(request._id);
            enqueueSnackbar('Request Deleted', { variant: 'success' });
            fetchRequests();
        } catch (error) {
            enqueueSnackbar(error.message || 'Delete Failed', { variant: 'error' });
        } finally {
            setActionLoading(false);
        }
    };

    // Reject Handler
    const handleRejectSubmit = async () => {
        if (!rejectModal.reason) return;

        setActionLoading(true);
        try {
            await shipmentService.rejectPickupRequest(rejectModal.id, rejectModal.reason);
            enqueueSnackbar('Request Rejected', { variant: 'success' });
            setRejectModal({ open: false, id: null, reason: '' });
            fetchRequests();
        } catch (error) {
            enqueueSnackbar(error.message || 'Rejection Failed', { variant: 'error' });
        } finally {
            setActionLoading(false);
        }
    };

    const StatusChip = ({ status }) => {
        let color = 'default';
        let label = status;

        if (status === 'READY_FOR_PICKUP' || status === 'REQUESTED' || status === 'ready_for_pickup') {
            color = 'warning';
            label = 'Ready for Pickup';
        } else if (status === 'picked_up') {
            color = 'info';
            label = 'Picked Up (Awaiting DGR)';
        } else if (status === 'APPROVED' || status === 'approved') {
            color = 'success';
            label = 'Approved';
        } else if (status === 'REJECTED' || status === 'rejected') {
            color = 'error';
            label = 'Rejected';
        } else if (status === 'COMPLETED' || status === 'completed') {
            color = 'info';
            label = 'Completed';
        }

        return <Chip label={label} color={color} size="small" />;
    };

    if (loading) return <CircularProgress />;

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Pickup Requests</Typography>
                <Box>
                    {(user?.role === 'client') && (
                        <Button
                            variant="contained"
                            size="small"
                            color="primary"
                            sx={{ mr: 1 }}
                            onClick={() => window.location.href = '/create'}
                        >
                            New Request
                        </Button>
                    )}
                    <Button onClick={() => fetchRequests()} size="small">Refresh</Button>
                </Box>
            </Box>

            {/* Shipments Section (Awaiting Pickup) */}
            {pendingShipments.length > 0 && (
                <Box mb={4}>
                    <Box display="flex" alignItems="center" mb={2} gap={1}>
                        <LocalShippingIcon color="primary" />
                        <Typography variant="h6" color="primary">Approved Shipments (Awaiting Carrier Submission)</Typography>
                    </Box>
                    <Grid container spacing={2}>
                        {pendingShipments.map((ship) => (
                            <Grid item xs={12} key={ship._id}>
                                <Card variant="outlined" sx={{ borderLeft: '4px solid #2196f3', bgcolor: '#f8faff' }}>
                                    <CardContent>
                                        <Box display="flex" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="subtitle1" fontWeight="bold">
                                                    {ship.trackingNumber} | {ship.origin?.city} → {ship.destination?.city}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    Status: <Chip label={ship.status.replace(/_/g, ' ')} size="small" color="primary" variant="outlined" sx={{ ml: 1 }} />
                                                </Typography>
                                                <Typography variant="caption" display="block" mt={1}>
                                                    Customer: {ship.customer?.name} | Created: {new Date(ship.createdAt).toLocaleDateString()}
                                                </Typography>
                                            </Box>
                                            <Box display="flex" gap={1}>
                                                <Button
                                                    variant="contained"
                                                    size="small"
                                                    color="primary"
                                                    onClick={() => handleOpenDialog(ship, 'review')}
                                                >
                                                    Review & Approve
                                                </Button>
                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    onClick={() => window.location.href = `/tracking/${ship.trackingNumber}`}
                                                >
                                                    View
                                                </Button>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                    <Divider sx={{ my: 4 }} />
                </Box>
            )}

            <Box display="flex" alignItems="center" mb={2} gap={1}>
                {user?.role === 'client' ? (
                    <Typography variant="h6">My Pickup Requests</Typography>
                ) : (
                    <>
                        <AccessTimeIcon color="warning" />
                        <Typography variant="h6" color="warning">Pending Pickup Requests (Awaiting Approval)</Typography>
                    </>
                )}
            </Box>

            {requests.length === 0 ? (
                <Alert severity="info">No pickup requests found.</Alert>
            ) : (
                <Grid container spacing={2}>
                    {requests.map((req) => (
                        <Grid item xs={12} key={req._id}>
                            <Card variant="outlined" sx={{ borderLeft: req.status === 'REQUESTED' ? '4px solid #ff9800' : '1px solid #ddd' }}>
                                <CardContent>
                                    <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                                        <Box>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                {req.sender.company || req.sender.contactPerson} → {req.receiver.city}, {req.receiver.countryCode}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Created: {new Date(req.createdAt).toLocaleString()} | by {req.client?.name}
                                            </Typography>

                                            <Box mt={1}>
                                                <Typography variant="body2">
                                                    <strong>Items:</strong> {req.parcels.length} parcel(s)
                                                    ({req.parcels.reduce((sum, p) => sum + (p.weight || 0), 0)} kg total)
                                                </Typography>
                                                {req.shipment && (
                                                    <Typography variant="body2" color="primary">
                                                        Shipment: {req.shipment.trackingNumber}
                                                    </Typography>
                                                )}
                                                {req.rejectionReason && (
                                                    <Typography variant="body2" color="error">
                                                        Reason: {req.rejectionReason}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>

                                        <Box display="flex" flexDirection="column" alignItems="flex-end" gap={1}>
                                            <StatusChip status={req.status} />

                                            {/* Client Actions: Print Label, Edit, Delete */}
                                            {user?.role === 'client' && (
                                                <Box display="flex" gap={1} mt={1}>
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        startIcon={<PrintIcon />}
                                                        onClick={() => generateWaybillPDF(req)}
                                                    >
                                                        Print Label
                                                    </Button>
                                                    {req.status === 'REQUESTED' && (
                                                        <>
                                                            <Button
                                                                variant="outlined"
                                                                size="small"
                                                                startIcon={<EditIcon />}
                                                                onClick={() => handleOpenDialog(req, 'edit')}
                                                            >
                                                                Edit
                                                            </Button>
                                                            <Button
                                                                variant="outlined"
                                                                color="error"
                                                                size="small"
                                                                startIcon={<DeleteIcon />}
                                                                onClick={() => handleDelete(req)}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </>
                                                    )}
                                                </Box>
                                            )}

                                            {/* Staff Actions: Review & Approve, Reject */}
                                            {(req.status === 'READY_FOR_PICKUP' || req.status === 'REQUESTED') && (user?.role === 'staff' || user?.role === 'admin') && (
                                                <Box display="flex" gap={1} mt={1}>
                                                    <Button
                                                        variant="contained"
                                                        color="info"
                                                        size="small"
                                                        startIcon={<CheckCircleIcon />}
                                                        disabled={actionLoading}
                                                        onClick={() => handleOpenDialog(req, 'review')}
                                                    >
                                                        Review & Approve
                                                    </Button>
                                                    <Button
                                                        variant="outlined"
                                                        color="error"
                                                        size="small"
                                                        startIcon={<CancelIcon />}
                                                        disabled={actionLoading}
                                                        onClick={() => setRejectModal({ open: true, id: req._id, reason: '' })}
                                                    >
                                                        Reject
                                                    </Button>
                                                </Box>
                                            )}
                                        </Box>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Review/Edit Dialog */}
            <Dialog
                open={reviewDialog.open}
                onClose={() => setReviewDialog({ open: false, request: null, mode: 'review' })}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    {reviewDialog.mode === 'review' ? 'Review Pickup Request' : 'Edit Pickup Request'}
                </DialogTitle>
                <DialogContent dividers sx={{ bgcolor: 'grey.50' }}>
                    {editData && (
                        <Grid container spacing={3}>
                            {/* Sender & Receiver Side-by-Side */}
                            <Grid item xs={12} md={6}>
                                <AddressPanel
                                    type="sender"
                                    value={editData.sender}
                                    onChange={(newVal) => handleEditChange('sender', null, newVal)}
                                />
                            </Grid>

                            <Grid item xs={12} md={6}>
                                <AddressPanel
                                    type="receiver"
                                    value={editData.receiver}
                                    onChange={(newVal) => handleEditChange('receiver', null, newVal)}
                                />
                            </Grid>

                            {/* Parcel Details */}
                            <Grid item xs={12}>
                                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Parcels Information</Typography>
                                {editData.parcels.map((parcel, index) => (
                                    <Card key={index} variant="outlined" sx={{ mb: 2 }}>
                                        <CardContent>
                                            <Box display="flex" justifyContent="space-between" mb={2}>
                                                <Typography variant="subtitle2" fontWeight="bold" color="text.secondary">
                                                    Parcel #{index + 1}
                                                </Typography>
                                            </Box>
                                            <Grid container spacing={2}>
                                                <Grid item xs={12}>
                                                    <TextField
                                                        label="Description"
                                                        size="small"
                                                        fullWidth
                                                        value={parcel.description}
                                                        onChange={(e) => handleEditChange('parcels', 'description', e.target.value, index)}
                                                    />
                                                </Grid>
                                                <Grid item xs={6} sm={2}>
                                                    <TextField
                                                        label="Weight (kg)"
                                                        size="small"
                                                        type="number"
                                                        fullWidth
                                                        value={parcel.weight}
                                                        onChange={(e) => handleEditChange('parcels', 'weight', e.target.value, index)}
                                                    />
                                                </Grid>
                                                <Grid item xs={6} sm={2}>
                                                    <TextField
                                                        label="Length (cm)"
                                                        size="small"
                                                        type="number"
                                                        fullWidth
                                                        value={parcel.length}
                                                        onChange={(e) => handleEditChange('parcels', 'length', e.target.value, index)}
                                                    />
                                                </Grid>
                                                <Grid item xs={6} sm={2}>
                                                    <TextField
                                                        label="Width (cm)"
                                                        size="small"
                                                        type="number"
                                                        fullWidth
                                                        value={parcel.width}
                                                        onChange={(e) => handleEditChange('parcels', 'width', e.target.value, index)}
                                                    />
                                                </Grid>
                                                <Grid item xs={6} sm={2}>
                                                    <TextField
                                                        label="Height (cm)"
                                                        size="small"
                                                        type="number"
                                                        fullWidth
                                                        value={parcel.height}
                                                        onChange={(e) => handleEditChange('parcels', 'height', e.target.value, index)}
                                                    />
                                                </Grid>
                                                <Grid item xs={6} sm={2}>
                                                    <TextField
                                                        label="Quantity"
                                                        size="small"
                                                        type="number"
                                                        fullWidth
                                                        value={parcel.quantity || 1}
                                                        onChange={(e) => handleEditChange('parcels', 'quantity', e.target.value, index)}
                                                    />
                                                </Grid>
                                                <Grid item xs={6} sm={2}>
                                                    <TextField
                                                        label="Value (KD)"
                                                        size="small"
                                                        type="number"
                                                        fullWidth
                                                        value={parcel.declaredValue || 0}
                                                        onChange={(e) => handleEditChange('parcels', 'declaredValue', e.target.value, index)}
                                                    />
                                                </Grid>
                                            </Grid>
                                        </CardContent>
                                    </Card>
                                ))}
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReviewDialog({ open: false, request: null, mode: 'review' })}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDialogSubmit}
                        variant="contained"
                        color="primary"
                        disabled={actionLoading}
                    >
                        {actionLoading ? 'Processing...' : (reviewDialog.mode === 'review' ? 'Confirm & Create Shipment' : 'Save Changes')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Reject Dialog */}
            <Dialog open={rejectModal.open} onClose={() => setRejectModal({ ...rejectModal, open: false })}>
                <DialogTitle>Reject Request</DialogTitle>
                <DialogContent>
                    <Typography gutterBottom>Please provide a reason for rejection:</Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Reason"
                        fullWidth
                        multiline
                        rows={3}
                        value={rejectModal.reason}
                        onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRejectModal({ ...rejectModal, open: false })}>Cancel</Button>
                    <Button onClick={handleRejectSubmit} color="error" variant="contained">Reject</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
export default PickupRequestList;
