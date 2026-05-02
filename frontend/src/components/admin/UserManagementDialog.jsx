import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, FormControl, InputLabel, Select, MenuItem,
    Box, Tabs, Tab, Typography, Grid, InputAdornment,
    Divider, Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import LockResetIcon from '@mui/icons-material/LockReset';
import { organizationService, userService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSnackbar } from 'notistack';

const UserManagementDialog = ({ open, onClose, user, onSave, refreshTrigger }) => {
    const { enqueueSnackbar } = useSnackbar();
    const { user: currentUser } = useAuth();
    const [tabIndex, setTabIndex] = useState(0);
    const [formData, setFormData] = useState({});
    const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    const canResetPassword = user?._id && ['admin', 'accounting'].includes(currentUser?.role);

    const handleResetPassword = async () => {
        if (!newPassword || newPassword.length < 8) {
            enqueueSnackbar('Password must be at least 8 characters', { variant: 'error' });
            return;
        }
        setResetLoading(true);
        try {
            await userService.resetUserPassword(user._id, newPassword);
            enqueueSnackbar('Password reset successfully', { variant: 'success' });
            setResetPasswordOpen(false);
            setNewPassword('');
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || 'Failed to reset password', { variant: 'error' });
        } finally {
            setResetLoading(false);
        }
    };

    // Org Data
    const [organizations, setOrganizations] = useState([]);
    const [isCreatingOrg, setIsCreatingOrg] = useState(false);
    const [newOrgName, setNewOrgName] = useState('');

    useEffect(() => {
        if (open) {
            loadOrganizations();
            // Initialize form data from user prop
            const initialData = user ? { ...user } : {};

            // Ensure nested objects exist
            if (!initialData.carrierConfig) initialData.carrierConfig = {};
            if (!initialData.markup) initialData.markup = { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };
            if (!initialData.optionalServiceMarkup) {
                initialData.optionalServiceMarkup = {
                    insurance: { enabled: false, type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 }
                };
            } else if (!initialData.optionalServiceMarkup.insurance) {
                initialData.optionalServiceMarkup.insurance = { enabled: false, type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 };
            }

            // Map legacy or missing fields if needed
            if (!initialData.carrierConfig.preferredCarrier) initialData.carrierConfig.preferredCarrier = 'DGR';

            setFormData(initialData);
            setTabIndex(0);
            setIsCreatingOrg(false);
            setNewOrgName('');
            setResetPasswordOpen(false);
            setNewPassword('');
        }
    }, [open, user]);

    const loadOrganizations = async () => {
        try {
            const res = await organizationService.getOrganizations();
            setOrganizations(res.data);
        } catch (err) {
            console.error('Failed to load orgs', err);
        }
    };

    const handleTabChange = (event, newValue) => {
        setTabIndex(newValue);
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleCarrierConfigChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            carrierConfig: { ...prev.carrierConfig, [field]: value }
        }));
    };

    const handleMarkupChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            markup: { ...prev.markup, [field]: value }
        }));
    };

    const handleInsuranceMarkupChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            optionalServiceMarkup: {
                ...(prev.optionalServiceMarkup || {}),
                insurance: {
                    ...(prev.optionalServiceMarkup?.insurance || { enabled: false, type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 }),
                    [field]: value
                }
            }
        }));
    };

    const handleCreateOrg = async () => {
        if (!newOrgName.trim()) return;
        try {
            const res = await organizationService.createOrganization({
                name: newOrgName,
                type: 'client'
            });

            const newOrg = res.data;
            setOrganizations(prev => [...prev, newOrg]);
            setFormData(prev => ({ ...prev, organization: newOrg._id }));
            setIsCreatingOrg(false);
            enqueueSnackbar('Organization created', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar('Failed to create organization', { variant: 'error' });
        }
    };

    const handleSave = () => {
        // Prepare payload - extract ID from object if needed
        const payload = { ...formData };
        if (typeof payload.organization === 'object' && payload.organization !== null) {
            payload.organization = payload.organization._id;
        }
        onSave(payload);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                {user?._id ? `Edit User: ${user.name}` : 'Create New User'}
            </DialogTitle>
            <DialogContent dividers>
                <Tabs value={tabIndex} onChange={handleTabChange} sx={{ mb: 3 }}>
                    <Tab label="Profile" />
                    <Tab label="Organization" />
                    <Tab label="Configuration (Markup & Carriers)" />
                </Tabs>

                {/* Tab 0: Profile */}
                {tabIndex === 0 && (
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Name" fullWidth required
                                value={formData.name || ''}
                                onChange={(e) => handleChange('name', e.target.value)}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Email" fullWidth required type="email"
                                value={formData.email || ''}
                                onChange={(e) => handleChange('email', e.target.value)}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Phone" fullWidth
                                value={formData.phone || ''}
                                onChange={(e) => handleChange('phone', e.target.value)}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel>Role</InputLabel>
                                <Select
                                    value={formData.role || 'client'}
                                    label="Role"
                                    onChange={(e) => handleChange('role', e.target.value)}
                                >
                                    <MenuItem value="client">Organization Agent</MenuItem>
                                    <MenuItem value="staff">Platform Staff</MenuItem>
                                    <MenuItem value="admin">Platform Admin</MenuItem>
                                    <MenuItem value="driver">Driver</MenuItem>
                                    <MenuItem value="manager">Manager</MenuItem>
                                    <MenuItem value="accounting">Accounting</MenuItem>
                                    <MenuItem value="org_manager">Organization Manager</MenuItem>
                                    <MenuItem value="org_agent">Organization Agent</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        {!user?._id && (
                            <Grid item xs={12}>
                                <TextField
                                    label="Password" fullWidth required type="password"
                                    value={formData.password || ''}
                                    onChange={(e) => handleChange('password', e.target.value)}
                                />
                            </Grid>
                        )}
                        <Grid item xs={12}>
                            <Typography variant="h6" sx={{ mt: 2 }}>Financials</Typography>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Credit Limit" fullWidth type="number"
                                value={formData.creditLimit || 0}
                                onChange={(e) => handleChange('creditLimit', Number(e.target.value))}
                                InputProps={{ endAdornment: <InputAdornment position="end">KWD</InputAdornment> }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="body2" color="text.secondary">
                                Balances are derived from the organization ledger. Post adjustments or payments in Finance.
                            </Typography>
                        </Grid>
                    </Grid>
                )}

                {/* Tab 1: Organization */}
                {tabIndex === 1 && (
                    <Box>
                        <Typography variant="body2" color="text.secondary" paragraph>
                            Link this user to an Organization for shared billing and address books.
                        </Typography>

                        {!isCreatingOrg ? (
                            <Box display="flex" gap={2} alignItems="center">
                                <FormControl fullWidth>
                                    <InputLabel>Organization</InputLabel>
                                    <Select
                                        value={typeof formData.organization === 'object' ? formData.organization?._id : (formData.organization || '')}
                                        label="Organization"
                                        onChange={(e) => handleChange('organization', e.target.value)}
                                    >
                                        <MenuItem value=""><em>None (Solo Account)</em></MenuItem>
                                        {organizations.map(org => (
                                            <MenuItem key={org._id} value={org._id}>
                                                {org.name} ({org.type})
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Button
                                    variant="outlined"
                                    startIcon={<AddIcon />}
                                    onClick={() => setIsCreatingOrg(true)}
                                    sx={{ minWidth: 160 }}
                                >
                                    New Org
                                </Button>
                            </Box>
                        ) : (
                            <Box p={2} border={1} borderColor="divider" borderRadius={1} bgcolor="action.hover">
                                <Typography variant="subtitle2" gutterBottom>Create New Organization</Typography>
                                <Box display="flex" gap={2}>
                                    <TextField
                                        label="Organization Name"
                                        fullWidth
                                        size="small"
                                        value={newOrgName}
                                        onChange={(e) => setNewOrgName(e.target.value)}
                                    />
                                    <Button variant="contained" onClick={handleCreateOrg}>Create</Button>
                                    <Button onClick={() => setIsCreatingOrg(false)}>Cancel</Button>
                                </Box>
                            </Box>
                        )}

                        {formData.organization && (
                            <Alert severity="info" sx={{ mt: 2 }}>
                                This user acts as a member of the selected Organization. Markup and Credit settings may be inherited depending on configuration.
                            </Alert>
                        )}
                    </Box>
                )}

                {/* Tab 2: Configuration */}
                {tabIndex === 2 && (
                    <Box>
                        {/* Markup Section */}
                        <Typography variant="h6" gutterBottom>Markup Configuration</Typography>
                        <Grid container spacing={2} sx={{ mb: 4 }}>
                            <Grid item xs={12} sm={4}>
                                <FormControl fullWidth>
                                    <InputLabel>Markup Type</InputLabel>
                                    <Select
                                        value={formData.markup?.type || 'PERCENTAGE'}
                                        label="Markup Type"
                                        onChange={(e) => handleMarkupChange('type', e.target.value)}
                                    >
                                        <MenuItem value="PERCENTAGE">Percentage Only</MenuItem>
                                        <MenuItem value="FLAT">Flat Fee Only</MenuItem>
                                        <MenuItem value="COMBINED">Combined (Perc + Flat)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField
                                    label="Percentage (%)" fullWidth type="number"
                                    value={formData.markup?.percentageValue || 0}
                                    onChange={(e) => handleMarkupChange('percentageValue', Number(e.target.value))}
                                    disabled={formData.markup?.type === 'FLAT'}
                                    InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField
                                    label="Flat Fee" fullWidth type="number"
                                    value={formData.markup?.flatValue || 0}
                                    onChange={(e) => handleMarkupChange('flatValue', Number(e.target.value))}
                                    disabled={formData.markup?.type === 'PERCENTAGE'}
                                    InputProps={{ endAdornment: <InputAdornment position="end">KWD</InputAdornment> }}
                                />
                            </Grid>
                        </Grid>

                        <Divider sx={{ my: 2 }} />

                        {/* Optional Service Markup Section */}
                        <Typography variant="h6" gutterBottom>Insurance Markup (Service II)</Typography>
                        <Grid container spacing={2} sx={{ mb: 4 }}>
                            <Grid item xs={12} sm={4}>
                                <FormControl fullWidth>
                                    <InputLabel>Insurance Markup Type</InputLabel>
                                    <Select
                                        value={formData.optionalServiceMarkup?.insurance?.type || 'PERCENTAGE'}
                                        label="Insurance Markup Type"
                                        onChange={(e) => handleInsuranceMarkupChange('type', e.target.value)}
                                        disabled={!formData.optionalServiceMarkup?.insurance?.enabled}
                                    >
                                        <MenuItem value="PERCENTAGE">Percentage Only</MenuItem>
                                        <MenuItem value="FLAT">Flat Fee Only</MenuItem>
                                        <MenuItem value="COMBINED">Combined (Perc + Flat)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={2}>
                                <FormControl fullWidth>
                                    <InputLabel>Enabled</InputLabel>
                                    <Select
                                        value={formData.optionalServiceMarkup?.insurance?.enabled ? 'yes' : 'no'}
                                        label="Enabled"
                                        onChange={(e) => handleInsuranceMarkupChange('enabled', e.target.value === 'yes')}
                                    >
                                        <MenuItem value="yes">Yes</MenuItem>
                                        <MenuItem value="no">No</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <TextField
                                    label="Insurance %"
                                    fullWidth
                                    type="number"
                                    value={formData.optionalServiceMarkup?.insurance?.percentageValue || 0}
                                    onChange={(e) => handleInsuranceMarkupChange('percentageValue', Number(e.target.value))}
                                    disabled={!formData.optionalServiceMarkup?.insurance?.enabled || formData.optionalServiceMarkup?.insurance?.type === 'FLAT'}
                                    InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <TextField
                                    label="Insurance Flat"
                                    fullWidth
                                    type="number"
                                    value={formData.optionalServiceMarkup?.insurance?.flatValue || 0}
                                    onChange={(e) => handleInsuranceMarkupChange('flatValue', Number(e.target.value))}
                                    disabled={!formData.optionalServiceMarkup?.insurance?.enabled || formData.optionalServiceMarkup?.insurance?.type === 'PERCENTAGE'}
                                    InputProps={{ endAdornment: <InputAdornment position="end">KWD</InputAdornment> }}
                                />
                            </Grid>
                        </Grid>

                        <Divider sx={{ my: 2 }} />

                        {/* Carrier Section */}
                        <Typography variant="h6" gutterBottom>Carrier Settings</Typography>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Preferred Carrier</InputLabel>
                                    <Select
                                        value={formData.carrierConfig?.preferredCarrier || 'DGR'}
                                        label="Preferred Carrier"
                                        onChange={(e) => handleCarrierConfigChange('preferredCarrier', e.target.value)}
                                    >
                                        <MenuItem value="DGR">DGR Express</MenuItem>
                                        <MenuItem value="DHL">DHL (Legacy)</MenuItem>
                                        <MenuItem value="FEDEX">FedEx</MenuItem>
                                        <MenuItem value="UPS">UPS</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    label="Tax ID / Civil ID" fullWidth
                                    value={formData.carrierConfig?.taxId || ''}
                                    onChange={(e) => handleCarrierConfigChange('taxId', e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    label="VAT Number" fullWidth
                                    value={formData.carrierConfig?.vatNo || ''}
                                    onChange={(e) => handleCarrierConfigChange('vatNo', e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    label="EORI Number" fullWidth
                                    value={formData.carrierConfig?.eori || ''}
                                    onChange={(e) => handleCarrierConfigChange('eori', e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Trader Type</InputLabel>
                                    <Select
                                        value={formData.carrierConfig?.traderType || 'business'}
                                        label="Trader Type"
                                        onChange={(e) => handleCarrierConfigChange('traderType', e.target.value)}
                                    >
                                        <MenuItem value="business">Business</MenuItem>
                                        <MenuItem value="private">Individual</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                    </Box>
                )}
            </DialogContent>
            {resetPasswordOpen && (
                <Box sx={{ px: 3, pb: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Reset Password for {user?.name}</Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <TextField
                            label="New Password" type="password" size="small"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()}
                            helperText="Minimum 8 characters"
                            sx={{ flex: 1 }}
                        />
                        <Button variant="contained" color="warning" onClick={handleResetPassword} disabled={resetLoading}>
                            {resetLoading ? 'Saving…' : 'Confirm Reset'}
                        </Button>
                        <Button onClick={() => { setResetPasswordOpen(false); setNewPassword(''); }}>Cancel</Button>
                    </Box>
                </Box>
            )}
            <DialogActions>
                {canResetPassword && !resetPasswordOpen && (
                    <Button
                        startIcon={<LockResetIcon />}
                        color="warning"
                        onClick={() => setResetPasswordOpen(true)}
                        sx={{ mr: 'auto' }}
                    >
                        Reset Password
                    </Button>
                )}
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={handleSave}>Save User</Button>
            </DialogActions>
        </Dialog>
    );
};

export default UserManagementDialog;
