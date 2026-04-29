import React, { useCallback, useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useSnackbar } from 'notistack';
import { userService, organizationService, shipmentService } from '../services/api';
import {
    PageHeader,
    Card,
    Button,
    Input,
    Select,
    Modal,
    TableWrapper,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    StatusPill,
    Tabs,
    Tab,
    Alert
} from '../ui';
import { getRoleLabel } from '../utils/roleLabels';

// --- Styled Components ---

const FilterBar = styled.div`
    display: flex;
    gap: 16px;
    align-items: center;
    background: var(--bg-secondary);
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    margin-bottom: 24px;
    flex-wrap: wrap;
`;

const ActionButton = styled.button`
    background: transparent;
    border: none;
    cursor: pointer;
    color: ${props => props.$color || 'var(--text-secondary)'};
    padding: 4px;
    transition: all 0.2s;
    &:hover { color: var(--text-primary); transform: scale(1.1); }
`;

const EmptyState = styled.div`
    text-align: center;
    padding: 48px 24px;
    color: var(--text-secondary);
`;

const CARRIER_SERVICE_OPTIONS = {
    DGR: [
        { serviceCode: 'P', serviceName: 'DHL Express Worldwide' },
        { serviceCode: 'Y', serviceName: 'DHL Express 12:00' },
        { serviceCode: 'H', serviceName: 'DHL Economy Select' }
    ],
    DHL: [
        { serviceCode: 'P', serviceName: 'DHL Express Worldwide' },
        { serviceCode: 'Y', serviceName: 'DHL Express 12:00' },
        { serviceCode: 'H', serviceName: 'DHL Economy Select' }
    ],
    ARAMEX: [
        { serviceCode: 'P', serviceName: 'Aramex Priority' }
    ],
    FEDEX: [
        { serviceCode: 'P', serviceName: 'FedEx Priority' }
    ],
    OTE: [
        { serviceCode: 'STD', serviceName: 'OTE Standard' }
    ],
    LOGESTECHS: [
        { serviceCode: 'STD', serviceName: 'LogesTechs Standard' }
    ]
};

const DHL_CARRIERS = new Set(['DGR', 'DHL']);

const normalizeShippingAccess = (user = {}) => {
    const existing = user.agentPolicy?.shippingAccess;
    const carrierCode = (existing?.carrierCode || user.carrierConfig?.preferredCarrier || 'DGR').toUpperCase();

    if (existing?.mode === 'manual' || carrierCode === 'MANUAL') {
        return { mode: 'manual', carrierCode: 'MANUAL', serviceCode: '', serviceName: 'Manual Shipment' };
    }

    const serviceCode = existing?.serviceCode || user.carrierConfig?.serviceCode || '';
    const serviceName = existing?.serviceName
        || CARRIER_SERVICE_OPTIONS[carrierCode]?.find(service => service.serviceCode === serviceCode)?.serviceName
        || serviceCode;

    return { mode: 'carrier', carrierCode, serviceCode, serviceName };
};

// Markup lives in agentPolicy.markupOverride on the server; fall back to top-level markup for legacy records
const resolveUserMarkup = (user) =>
    user?.agentPolicy?.markupOverride || user?.markup || { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };

const AdminUsersPage = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);

    // Dialog State
    const [openDialog, setOpenDialog] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [activeTab, setActiveTab] = useState('profile');
    const [isDirty, setIsDirty] = useState(false);

    // Filter State
    const [roleFilter, setRoleFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Form Data
    const [formData, setFormData] = useState({});

    // Aux Data
    const [organizations, setOrganizations] = useState([]);
    const [availableCarriers, setAvailableCarriers] = useState([]);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await userService.getUsers(roleFilter);
            setUsers(res.data);
        } catch (error) {
            console.error(error);
            enqueueSnackbar('Failed to load users', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [enqueueSnackbar, roleFilter]);

    const fetchOrgs = async () => {
        try {
            const res = await organizationService.getOrganizations();
            setOrganizations(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchCarriers = async () => {
        try {
            const res = await shipmentService.getAvailableCarriers(undefined, { scope: 'assignment' });
            setAvailableCarriers(res.data || []);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        if (openDialog) {
            fetchOrgs();
            fetchCarriers();
        }
    }, [openDialog]);

    // Handle Open Dialog
    const handleOpenDialog = (user = null) => {
        setEditingUser(user);

        const initialData = user ? { ...user } : {
            role: 'org_agent',
            carrierConfig: {
                preferredCarrier: 'DGR',
                traderType: 'business',
                pricingByCarrier: {
                    OTE: { fixedFee: 25, currency: 'AED' }
                }
            },
            shippingAccess: { mode: 'carrier', carrierCode: 'DGR', serviceCode: '', serviceName: 'Any Available Service' },
            markup: { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 },
            optionalServiceMarkup: {
                insurance: { enabled: false, type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 }
            }
        };

        // Ensure nested objects
        if (!initialData.carrierConfig) initialData.carrierConfig = { preferredCarrier: 'DGR', traderType: 'business' };
        if (!initialData.carrierConfig.pricingByCarrier) initialData.carrierConfig.pricingByCarrier = {};
        if (!initialData.carrierConfig.pricingByCarrier.OTE) {
            initialData.carrierConfig.pricingByCarrier.OTE = { fixedFee: 25, currency: 'AED' };
        }
        initialData.shippingAccess = normalizeShippingAccess(initialData);

        // Markup lives in agentPolicy.markupOverride — normalize it into the form's markup field
        if (!initialData.markup) {
            initialData.markup = resolveUserMarkup(initialData);
        }

        if (!initialData.optionalServiceMarkup) {
            initialData.optionalServiceMarkup = {
                insurance: { enabled: false, type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 }
            };
        }
        if (!initialData.optionalServiceMarkup.insurance) {
            initialData.optionalServiceMarkup.insurance = { enabled: false, type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 };
        }
        if (typeof initialData.organization === 'object' && initialData.organization) {
            initialData.organizationId = initialData.organization.id;
        }

        setFormData(initialData);
        setActiveTab('profile');
        setIsDirty(false);
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        if (isDirty && !window.confirm('You have unsaved changes. Close anyway?')) return;
        setOpenDialog(false);
        setIsDirty(false);
    };

    // Handle Save
    const handleSave = async () => {
        try {
            const payload = { ...formData };
            if (payload.creditLimit !== undefined) payload.creditLimit = Number(payload.creditLimit);
            if (payload.organization && !payload.organizationId) payload.organizationId = payload.organization;
            if (payload.markup) {
                payload.markup.percentageValue = Number(payload.markup.percentageValue || 0);
                payload.markup.flatValue = Number(payload.markup.flatValue || 0);
            }
            if (payload.optionalServiceMarkup?.insurance) {
                payload.optionalServiceMarkup.insurance = {
                    ...payload.optionalServiceMarkup.insurance,
                    enabled: Boolean(payload.optionalServiceMarkup.insurance.enabled),
                    percentageValue: Number(payload.optionalServiceMarkup.insurance.percentageValue || 0),
                    flatValue: Number(payload.optionalServiceMarkup.insurance.flatValue || 0)
                };
            }
            if (payload.shippingAccess?.mode === 'manual') {
                payload.shippingAccess = {
                    mode: 'manual',
                    carrierCode: 'MANUAL',
                    serviceCode: null,
                    serviceName: 'Manual Shipment'
                };
            } else if (payload.shippingAccess) {
                const carrierCode = payload.shippingAccess.carrierCode || 'DGR';
                const serviceCode = payload.shippingAccess.serviceCode || '';
                payload.shippingAccess = {
                    mode: 'carrier',
                    carrierCode,
                    serviceCode: serviceCode || null,
                    serviceName: serviceCode
                        ? (CARRIER_SERVICE_OPTIONS[carrierCode]?.find(service => service.serviceCode === serviceCode)?.serviceName || serviceCode)
                        : 'Any Available Service'
                };
            }
            if (!payload.carrierConfig) payload.carrierConfig = {};
            if (!payload.carrierConfig.pricingByCarrier) payload.carrierConfig.pricingByCarrier = {};
            const currentOtePricing = payload.carrierConfig.pricingByCarrier.OTE || {};
            payload.carrierConfig.pricingByCarrier.OTE = {
                fixedFee: Number(currentOtePricing.fixedFee || 25),
                currency: String(currentOtePricing.currency || 'AED').toUpperCase().slice(0, 3)
            };

            if (editingUser?.id) {
                if (!payload.password) delete payload.password;
                await userService.updateUser(editingUser.id, payload);
                enqueueSnackbar('User updated successfully', { variant: 'success' });
            } else {
                await userService.createUser(payload);
                enqueueSnackbar('User created successfully', { variant: 'success' });
            }
            setOpenDialog(false);
            setIsDirty(false);
            fetchUsers();
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.error || 'Failed to save user';
            enqueueSnackbar(msg, { variant: 'error' });
        }
    };

    // Handle Delete
    const handleDelete = async (id) => {
        try {
            await userService.deleteUser(id);
            enqueueSnackbar('User deleted', { variant: 'success' });
            setDeleteConfirmId(null);
            fetchUsers();
        } catch (error) {
            enqueueSnackbar('Failed to delete user', { variant: 'error' });
        }
    };

    // Helper to update form (marks dirty)
    const updateField = (field, value) => {
        setIsDirty(true);
        setFormData(prev => ({ ...prev, [field]: value }));
    };
    const updateNested = (parent, field, value) => {
        setIsDirty(true);
        setFormData(prev => ({ ...prev, [parent]: { ...prev[parent], [field]: value } }));
    };

    const updateShippingAccess = (field, value) => {
        setIsDirty(true);
        setFormData(prev => {
            const current = prev.shippingAccess || normalizeShippingAccess(prev);
            const next = { ...current, [field]: value };

            if (field === 'mode' && value === 'manual') {
                return {
                    ...prev,
                    shippingAccess: { mode: 'manual', carrierCode: 'MANUAL', serviceCode: '', serviceName: 'Manual Shipment' }
                };
            }

            if (field === 'carrierCode') {
                const options = CARRIER_SERVICE_OPTIONS[value] || [];
                next.mode = value === 'MANUAL' ? 'manual' : 'carrier';
                next.serviceCode = value === 'MANUAL' ? '' : (options[0]?.serviceCode || '');
                next.serviceName = value === 'MANUAL' ? 'Manual Shipment' : (options[0]?.serviceName || 'Any Available Service');
            }

            if (field === 'serviceCode') {
                next.serviceName = CARRIER_SERVICE_OPTIONS[next.carrierCode]?.find(service => service.serviceCode === value)?.serviceName || value;
            }

            return { ...prev, shippingAccess: next };
        });
    };

    const renderShippingAccess = (user) => {
        const access = normalizeShippingAccess(user);
        if (access.mode === 'manual') return 'Manual Shipment';
        return `${access.carrierCode} / ${access.serviceName}`;
    };

    const renderMarkupInfo = (user) => {
        const m = resolveUserMarkup(user);
        if (m.type === 'PERCENTAGE') return <StatusPill status="info" text={`${m.percentageValue}%`} />;
        if (m.type === 'FLAT') return <StatusPill status="info" text={`${m.flatValue} KD`} />;
        return <StatusPill status="warning" text={`${m.percentageValue}% + ${m.flatValue}K`} />;
    };

    // Filtered user list
    const filteredUsers = users.filter(user => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            user.name?.toLowerCase().includes(q) ||
            user.email?.toLowerCase().includes(q) ||
            user.phone?.includes(q)
        );
    });

    const assignedCarrier = formData.shippingAccess?.carrierCode || 'DGR';
    const isOteCarrier = assignedCarrier === 'OTE' || assignedCarrier === 'LOGESTECHS';
    const isDhlCarrier = DHL_CARRIERS.has(assignedCarrier);

    return (
        <div>
            <PageHeader
                title="User Management"
                description="Administer system users, roles, and permissions."
                action={
                    <Button variant="primary" onClick={() => handleOpenDialog()}>
                        Add New User
                    </Button>
                }
                secondaryAction={
                    <Button variant="secondary" onClick={fetchUsers}>
                        Refresh
                    </Button>
                }
            />

            <FilterBar>
                <div style={{ width: '280px' }}>
                    <Input
                        label="Search"
                        placeholder="Name, email or phone..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <div style={{ width: '220px' }}>
                    <Select
                        label="Filter by Role"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    >
                        <option value="">All Roles</option>
                        <option value="staff">Platform Staff</option>
                        <option value="admin">Platform Admin</option>
                        <option value="driver">Driver</option>
                        <option value="manager">Manager</option>
                        <option value="accounting">Accounting</option>
                        <option value="org_manager">Organization Manager</option>
                        <option value="org_agent">Organization Agent</option>
                        <option value="client">Client</option>
                    </Select>
                </div>
            </FilterBar>

            <Card>
                <TableWrapper>
                    <Table>
                        <Thead>
                            <Tr>
                                <Th>Name & Contact</Th>
                                <Th>Role</Th>
                                <Th>Organization</Th>
                                <Th>Assigned Network</Th>
                                <Th>Markup</Th>
                                <Th>Credit Limit</Th>
                                <Th style={{ textAlign: 'right' }}>Actions</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {loading ? (
                                <Tr><Td colSpan={7} style={{ textAlign: 'center' }}>Loading...</Td></Tr>
                            ) : filteredUsers.length === 0 ? (
                                <Tr>
                                    <Td colSpan={7}>
                                        <EmptyState>
                                            {searchQuery || roleFilter
                                                ? 'No users match the current filters.'
                                                : 'No users yet. Click "Add New User" to get started.'}
                                        </EmptyState>
                                    </Td>
                                </Tr>
                            ) : filteredUsers.map(user => (
                                <Tr key={user.id}>
                                    <Td>
                                        <div style={{ fontWeight: 'bold' }}>{user.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{user.email}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{user.phone}</div>
                                    </Td>
                                    <Td>
                                        <StatusPill
                                            status={user.role === 'admin' ? 'error' : user.role === 'staff' ? 'warning' : 'success'}
                                            text={getRoleLabel(user.role)}
                                        />
                                    </Td>
                                    <Td>
                                        {user.organization ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                </svg>
                                                {user.organization.name}
                                            </div>
                                        ) : <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Solo Account</span>}
                                    </Td>
                                    <Td>{renderShippingAccess(user)}</Td>
                                    <Td>{renderMarkupInfo(user)}</Td>
                                    <Td>
                                        {user.organization ? (
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                Organization-controlled
                                            </div>
                                        ) : (
                                            <div style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
                                                {Number(user.creditLimit || 0).toFixed(3)} KWD
                                            </div>
                                        )}
                                    </Td>
                                    <Td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            <ActionButton $color="var(--accent-primary)" onClick={() => handleOpenDialog(user)}>
                                                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </ActionButton>
                                            <ActionButton $color="var(--accent-error)" onClick={() => setDeleteConfirmId(user.id)}>
                                                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </ActionButton>
                                        </div>
                                    </Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
                </TableWrapper>
            </Card>

            <Modal
                isOpen={openDialog}
                onClose={handleCloseDialog}
                title={editingUser ? `Edit User — ${editingUser.name}` : 'Create New User'}
                width="800px"
                footer={
                    <>
                        <Button variant="secondary" onClick={handleCloseDialog}>Cancel</Button>
                        <Button variant="primary" onClick={handleSave}>Save User</Button>
                    </>
                }
            >
                <Tabs>
                    <Tab active={activeTab === 'profile'} onClick={() => setActiveTab('profile')}>Profile</Tab>
                    <Tab active={activeTab === 'org'} onClick={() => setActiveTab('org')}>Organization</Tab>
                    <Tab active={activeTab === 'config'} onClick={() => setActiveTab('config')}>Config & Financials</Tab>
                </Tabs>

                <div style={{ marginTop: '24px' }}>
                    {activeTab === 'profile' && (
                        <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: '1fr 1fr' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <Input label="Full Name *" value={formData.name || ''} onChange={e => updateField('name', e.target.value)} />
                            </div>
                            <Input label="Email *" type="email" value={formData.email || ''} onChange={e => updateField('email', e.target.value)} />
                            <Input label="Phone" value={formData.phone || ''} onChange={e => updateField('phone', e.target.value)} />

                            <Select label="Role" value={formData.role || 'org_agent'} onChange={e => updateField('role', e.target.value)}>
                                <option value="staff">Staff</option>
                                <option value="admin">Admin</option>
                                <option value="driver">Driver</option>
                                <option value="manager">Manager</option>
                                <option value="accounting">Accounting</option>
                                <option value="org_manager">Organization Manager</option>
                                <option value="org_agent">Organization Agent</option>
                                <option value="client">Client</option>
                            </Select>

                            <Input
                                label={editingUser ? 'New Password (leave blank to keep current)' : 'Password *'}
                                type="password"
                                value={formData.password || ''}
                                onChange={e => updateField('password', e.target.value)}
                            />
                        </div>
                    )}

                    {activeTab === 'org' && (
                        <div>
                            <Alert severity="info" title="Organization Membership" style={{ marginBottom: '16px' }}>
                                Users belonging to an organization share its ledger-based balance and credit limit.
                            </Alert>
                            <Select
                                label="Select Organization"
                                value={formData.organizationId || formData.organization || ''}
                                onChange={e => updateField('organizationId', e.target.value)}
                            >
                                <option value="">-- No Organization (Solo) --</option>
                                {organizations.map(org => (
                                    <option key={org.id} value={org.id}>{org.name} ({org.type})</option>
                                ))}
                            </Select>
                        </div>
                    )}

                    {activeTab === 'config' && (
                        <div style={{ display: 'grid', gap: '24px' }}>
                            <Card title="Financial Settings" variant="subtle">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <Input
                                        label="Credit Limit (KWD)"
                                        type="number"
                                        value={formData.creditLimit || 0}
                                        onChange={e => updateField('creditLimit', e.target.value)}
                                        hint={formData.organizationId ? 'Updates the organization credit limit' : undefined}
                                    />
                                </div>
                            </Card>

                            <Card title="Markup Configuration" variant="subtle">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    <Select
                                        label="Markup Type"
                                        value={formData.markup?.type || 'PERCENTAGE'}
                                        onChange={e => updateNested('markup', 'type', e.target.value)}
                                    >
                                        <option value="PERCENTAGE">% Only</option>
                                        <option value="FLAT">Flat Only</option>
                                        <option value="COMBINED">Combined</option>
                                    </Select>
                                    <Input
                                        label="Percentage %"
                                        type="number"
                                        value={formData.markup?.percentageValue ?? 0}
                                        onChange={e => updateNested('markup', 'percentageValue', e.target.value)}
                                    />
                                    <Input
                                        label="Flat Value"
                                        type="number"
                                        value={formData.markup?.flatValue ?? 0}
                                        onChange={e => updateNested('markup', 'flatValue', e.target.value)}
                                    />
                                </div>
                            </Card>

                            <Card title="Shipping Access" variant="subtle">
                                <Alert severity="info" style={{ marginBottom: '16px' }}>
                                    Client users are assigned exactly one shipment network: either one carrier service or Manual Shipment.
                                </Alert>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <Select
                                        label="Assigned Network"
                                        value={assignedCarrier}
                                        onChange={e => updateShippingAccess('carrierCode', e.target.value)}
                                    >
                                        {(availableCarriers.length ? availableCarriers : [
                                            { code: 'MANUAL', name: 'Manual Shipment', active: true },
                                            { code: 'DGR', name: 'DHL DGR', active: true },
                                            { code: 'ARAMEX', name: 'Aramex', active: true },
                                            { code: 'FEDEX', name: 'FedEx', active: false }
                                        ]).map(carrier => (
                                            <option key={carrier.code} value={carrier.code} disabled={!carrier.active}>
                                                {carrier.code === 'MANUAL' ? 'Manual Shipment' : carrier.name}
                                            </option>
                                        ))}
                                    </Select>
                                    {assignedCarrier !== 'MANUAL' ? (
                                        <Select
                                            label="Assigned Service"
                                            value={formData.shippingAccess?.serviceCode || ''}
                                            onChange={e => updateShippingAccess('serviceCode', e.target.value)}
                                        >
                                            <option value="">Any Available Service</option>
                                            {(CARRIER_SERVICE_OPTIONS[assignedCarrier] || CARRIER_SERVICE_OPTIONS.DGR).map(service => (
                                                <option key={service.serviceCode} value={service.serviceCode}>
                                                    {service.serviceName}
                                                </option>
                                            ))}
                                        </Select>
                                    ) : (
                                        <Input label="Assigned Service" value="Manual Shipment" disabled />
                                    )}
                                    <Input
                                        label="Tax / VAT ID"
                                        value={formData.carrierConfig?.vatNo || ''}
                                        onChange={e => updateNested('carrierConfig', 'vatNo', e.target.value)}
                                    />
                                </div>
                            </Card>

                            {isOteCarrier && (
                                <Card title={`${assignedCarrier} Pricing`} variant="subtle">
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <Input
                                            label="Fixed Fee per Shipment"
                                            type="number"
                                            value={formData.carrierConfig?.pricingByCarrier?.OTE?.fixedFee ?? 25}
                                            onChange={e => {
                                                setIsDirty(true);
                                                setFormData(prev => ({
                                                    ...prev,
                                                    carrierConfig: {
                                                        ...(prev.carrierConfig || {}),
                                                        pricingByCarrier: {
                                                            ...(prev.carrierConfig?.pricingByCarrier || {}),
                                                            OTE: {
                                                                ...(prev.carrierConfig?.pricingByCarrier?.OTE || {}),
                                                                fixedFee: e.target.value
                                                            }
                                                        }
                                                    }
                                                }));
                                            }}
                                        />
                                        <Select
                                            label="Billing Currency"
                                            value={(formData.carrierConfig?.pricingByCarrier?.OTE?.currency || 'AED').toUpperCase()}
                                            onChange={e => {
                                                setIsDirty(true);
                                                setFormData(prev => ({
                                                    ...prev,
                                                    carrierConfig: {
                                                        ...(prev.carrierConfig || {}),
                                                        pricingByCarrier: {
                                                            ...(prev.carrierConfig?.pricingByCarrier || {}),
                                                            OTE: {
                                                                ...(prev.carrierConfig?.pricingByCarrier?.OTE || {}),
                                                                currency: e.target.value
                                                            }
                                                        }
                                                    }
                                                }));
                                            }}
                                        >
                                            <option value="AED">AED</option>
                                            <option value="KWD">KWD</option>
                                            <option value="SAR">SAR</option>
                                            <option value="USD">USD</option>
                                        </Select>
                                    </div>
                                </Card>
                            )}

                            {isDhlCarrier && (
                                <Card title="Insurance Markup (Service II)" variant="subtle">
                                    <Alert severity="info" style={{ marginBottom: '12px' }}>
                                        Configure how insurance (II) is marked up for this user during DHL quoting and booking.
                                    </Alert>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                                        <Select
                                            label="Enabled"
                                            value={formData.optionalServiceMarkup?.insurance?.enabled ? 'yes' : 'no'}
                                            onChange={e => updateNested('optionalServiceMarkup', 'insurance', {
                                                ...(formData.optionalServiceMarkup?.insurance || {}),
                                                enabled: e.target.value === 'yes'
                                            })}
                                        >
                                            <option value="yes">Yes</option>
                                            <option value="no">No</option>
                                        </Select>
                                        <Select
                                            label="Markup Type"
                                            value={formData.optionalServiceMarkup?.insurance?.type || 'PERCENTAGE'}
                                            onChange={e => updateNested('optionalServiceMarkup', 'insurance', {
                                                ...(formData.optionalServiceMarkup?.insurance || {}),
                                                type: e.target.value
                                            })}
                                        >
                                            <option value="PERCENTAGE">% Only</option>
                                            <option value="FLAT">Flat Only</option>
                                            <option value="COMBINED">Combined</option>
                                        </Select>
                                        <Input
                                            label="Insurance %"
                                            type="number"
                                            value={formData.optionalServiceMarkup?.insurance?.percentageValue ?? 0}
                                            onChange={e => updateNested('optionalServiceMarkup', 'insurance', {
                                                ...(formData.optionalServiceMarkup?.insurance || {}),
                                                percentageValue: e.target.value
                                            })}
                                        />
                                        <Input
                                            label="Insurance Flat"
                                            type="number"
                                            value={formData.optionalServiceMarkup?.insurance?.flatValue ?? 0}
                                            onChange={e => updateNested('optionalServiceMarkup', 'insurance', {
                                                ...(formData.optionalServiceMarkup?.insurance || {}),
                                                flatValue: e.target.value
                                            })}
                                        />
                                    </div>
                                </Card>
                            )}
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={!!deleteConfirmId}
                onClose={() => setDeleteConfirmId(null)}
                title="Delete User?"
                footer={
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                        <Button variant="danger" onClick={() => handleDelete(deleteConfirmId)}>Delete</Button>
                    </div>
                }
            >
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Are you sure you want to permanently delete this user? This cannot be undone.
                </p>
            </Modal>
        </div>
    );
};

export default AdminUsersPage;
