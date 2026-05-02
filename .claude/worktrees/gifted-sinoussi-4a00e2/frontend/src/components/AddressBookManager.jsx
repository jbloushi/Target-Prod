import React, { useState } from 'react';
import {
    Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
    Grid, Typography, IconButton, Card, CardContent, Chip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import StarIcon from '@mui/icons-material/Star';
import AddressPanel from './AddressPanel';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { useSnackbar } from 'notistack';

const AddressBookManager = () => {
    const { user, refreshUser } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const [open, setOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);

    const handleSave = async (address) => {
        try {
            const token = localStorage.getItem('token');
            let updatedAddresses = [...(user.addresses || [])];

            if (editingAddress && editingAddress._id) {
                // Update existing
                updatedAddresses = updatedAddresses.map(a =>
                    a._id === editingAddress._id ? { ...address, _id: a._id } : a
                );
            } else {
                // Add new
                updatedAddresses.push(address);
            }

            await axios.patch('/api/users/profile', {
                addresses: updatedAddresses
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            enqueueSnackbar('Address Book Updated', { variant: 'success' });
            await refreshUser();
            setOpen(false);
        } catch (error) {
            console.error(error);
            enqueueSnackbar('Failed to save address', { variant: 'error' });
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure?')) return;
        try {
            const token = localStorage.getItem('token');
            const updatedAddresses = user.addresses.filter(a => a._id !== id);

            await axios.patch('/api/users/profile', {
                addresses: updatedAddresses
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            enqueueSnackbar('Address Deleted', { variant: 'success' });
            await refreshUser();
        } catch (error) {
            console.error(error);
            enqueueSnackbar('Failed to delete address', { variant: 'error' });
        }
    };

    const handleSetDefault = async (id) => {
        try {
            const token = localStorage.getItem('token');
            const updatedAddresses = user.addresses.map(a => ({
                ...a,
                isDefault: a._id === id
            }));

            await axios.patch('/api/users/profile', {
                addresses: updatedAddresses
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            enqueueSnackbar('Default Address Updated', { variant: 'success' });
            await refreshUser();
        } catch (error) {
            console.error(error);
            enqueueSnackbar('Failed to update default', { variant: 'error' });
        }
    };

    return (
        <React.Fragment>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Saved Addresses</Typography>
                <Button startIcon={<AddIcon />} variant="outlined" onClick={() => { setEditingAddress({}); setOpen(true); }}>
                    Add New
                </Button>
            </Box>

            <Grid container spacing={2}>
                {user?.addresses?.map((addr, index) => (
                    <Grid item xs={12} md={6} key={addr._id || index}>
                        <Card variant="outlined">
                            <CardContent sx={{ pb: 1 }}>
                                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                                    <Box>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                {addr.label || 'Address'}
                                            </Typography>
                                            {addr.isDefault && <Chip label="Default" size="small" color="primary" icon={<StarIcon />} />}
                                        </Box>
                                        <Typography variant="body2">{addr.company || addr.contactPerson}</Typography>
                                        <Typography variant="caption" color="textSecondary">
                                            {addr.city}, {addr.countryCode}
                                        </Typography>
                                    </Box>
                                    <Box>
                                        <IconButton size="small" onClick={() => { setEditingAddress(addr); setOpen(true); }}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                        <IconButton size="small" color="error" onClick={() => handleDelete(addr._id)}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                </Box>
                                {!addr.isDefault && (
                                    <Button size="small" onClick={() => handleSetDefault(addr._id)}>
                                        Set as Default
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* Edit Dialog */}
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>{editingAddress?._id ? 'Edit Address' : 'Add New Address'}</DialogTitle>
                <DialogContent dividers>
                    <AddressPanel
                        type="receiver" // Default to Receiver for Address Book
                        value={editingAddress || {}}
                        onChange={setEditingAddress}
                        titleOverride="Receiver Details/Address"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={() => handleSave(editingAddress)}>Save</Button>
                </DialogActions>
            </Dialog>
        </React.Fragment>
    );
};

export default AddressBookManager;
