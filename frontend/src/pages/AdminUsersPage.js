import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useSnackbar } from 'notistack';
import { userService, organizationService } from '../services/api';
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

const AdminUsersPage = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);

    // Dialog State
    const [openDialog, setOpenDialog] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [activeTab, setActiveTab] = useState('profile');

    // Filter State
    const [roleFilter, setRoleFilter] = useState('');

    // Form Data
    const [formData, setFormData] = useState({});

    // Aux Data
    const [organizations, setOrganizations] = useState([]);

    const fetchUsers = async () => {
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
    };

    const fetchOrgs = async () => {
        try {
            const res = await organizationService.getOrganizations();
            setOrganizations(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [roleFilter]);

    useEffect(() => {
        if (openDialog) fetchOrgs();
    }, [openDialog]);

    // Handle Open Dialog
    const handleOpenDialog = (user = null) => {
        setEditingUser(user);

        // Init Form Data
        const initialData = user ? { ...user } : {
            role: 'client',
            carrierConfig: { preferredCarrier: 'DGR', traderType: 'business' },
            markup: { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 }
        };

        // Ensure nested objects
        if (!initialData.carrierConfig) initialData.carrierConfig = { preferredCarrier: 'DGR', traderType: 'business' };
        if (!initialData.markup) initialData.markup = { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };
        if (typeof initialData.organization === 'object' && initialData.organization) {
            initialData.organization = initialData.organization._id;
        }

        setFormData(initialData);
        setActiveTab('profile');
        setOpenDialog(true);
    };

    // Handle Save
    const handleSave = async () => {
        try {
            const payload = { ...formData };
            // Ensure numbers
            if (payload.creditLimit) payload.creditLimit = Number(payload.creditLimit);
            // Cleanup markup
            if (payload.markup) {
                payload.markup.percentageValue = Number(payload.markup.percentageValue || 0);
                payload.markup.flatValue = Number(payload.markup.flatValue || 0);
            }

            if (editingUser?._id) {
                await userService.updateUser(editingUser._id, payload);
                enqueueSnackbar('User updated successfully', { variant: 'success' });
            } else {
                await userService.createUser(payload);
                enqueueSnackbar('User created successfully', { variant: 'success' });
            }
            setOpenDialog(false);
            fetchUsers();
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.error || 'Failed to save user';
            enqueueSnackbar(msg, { variant: 'error' });
        }
    };

    // Handle Delete
    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this user?')) return;
        try {
            await userService.deleteUser(id);
            enqueueSnackbar('User deleted', { variant: 'success' });
            fetchUsers();
        } catch (error) {
            enqueueSnackbar('Failed to delete user', { variant: 'error' });
        }
    };

    // Helper to update form
    const updateField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));
    const updateNested = (parent, field, value) => setFormData(prev => ({
        ...prev,
        [parent]: { ...prev[parent], [field]: value }
    }));

    // Render Markup Pill
    const renderMarkupInfo = (user) => {
        const m = user.markup || { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };
        if (m.type === 'PERCENTAGE') return <StatusPill status="info" text={`${m.percentageValue}%`} />;
        if (m.type === 'FLAT') return <StatusPill status="info" text={`${m.flatValue} KD`} />;
        return <StatusPill status="warning" text={`${m.percentageValue}% + ${m.flatValue}K`} />;
    };

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
                <div style={{ width: '250px' }}>
                    <Select
                        label="Filter by Role"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    >
                        <option value="">All Roles</option>
                        <option value="client">Organization Agent</option>
                        <option value="staff">Platform Staff</option>
                        <option value="admin">Platform Admin</option>
                        <option value="driver">Driver</option>
                        <option value="manager">Manager</option>
                        <option value="accounting">Accounting</option>
                        <option value="org_manager">Organization Manager</option>
                        <option value="org_agent">Organization Agent</option>
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
                                <Th>Carrier Config</Th>
                                <Th>Markup</Th>
                                <Th>Credit Limit</Th>
                                <Th style={{ textAlign: 'right' }}>Actions</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {loading ? (
                                <Tr><Td colSpan={7} style={{ textAlign: 'center' }}>Loading...</Td></Tr>
                            ) : users.map(user => (
                                <Tr key={user._id}>
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
                                    <Td>
                                        {user.carrierConfig?.preferredCarrier || 'Default'}
                                    </Td>
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
                                            <ActionButton $color="var(--accent-error)" onClick={() => handleDelete(user._id)}>
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
                onClose={() => setOpenDialog(false)}
                title={editingUser ? 'Edit User' : 'Create New User'}
                width="800px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpenDialog(false)}>Cancel</Button>
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

                            <Select label="Role" value={formData.role || 'client'} onChange={e => updateField('role', e.target.value)}>
                                <option value="client">Client</option>
                                <option value="staff">Staff</option>
                                <option value="admin">Admin</option>
                                <option value="driver">Driver</option>
                        <option value="manager">Manager</option>
                        <option value="accounting">Accounting</option>
                        <option value="org_manager">Organization Manager</option>
                        <option value="org_agent">Organization Agent</option>
                            </Select>

                            {!editingUser && (
                                <Input label="Password *" type="password" value={formData.password || ''} onChange={e => updateField('password', e.target.value)} />
                            )}
                        </div>
                    )}

                    {activeTab === 'org' && (
                        <div>
                            <Alert severity="info" title="Organization Membership" style={{ marginBottom: '16px' }}>
                                Users belonging to an organization share its ledger-based balance and credit limit.
                            </Alert>
                            <Select
                                label="Select Organization"
                                value={formData.organization || ''}
                                onChange={e => updateField('organization', e.target.value)}
                            >
                                <option value="">-- No Organization (Solo) --</option>
                                {organizations.map(org => (
                                    <option key={org._id} value={org._id}>{org.name} ({org.type})</option>
                                ))}
                            </Select>
                        </div>
                    )}

                    {activeTab === 'config' && (
                        <div style={{ display: 'grid', gap: '24px' }}>
                            <Card title="Financial Settings" variant="subtle">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <Input label="Credit Limit (KWD)" type="number" value={formData.creditLimit || 0} onChange={e => updateField('creditLimit', e.target.value)} />
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
                                        value={formData.markup?.percentageValue || 0}
                                        onChange={e => updateNested('markup', 'percentageValue', e.target.value)}
                                    />
                                    <Input
                                        label="Flat Value"
                                        type="number"
                                        value={formData.markup?.flatValue || 0}
                                        onChange={e => updateNested('markup', 'flatValue', e.target.value)}
                                    />
                                </div>
                            </Card>

                            <Card title="Carrier Config" variant="subtle">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <Select
                                        label="Preferred Carrier"
                                        value={formData.carrierConfig?.preferredCarrier || 'DGR'}
                                        onChange={e => updateNested('carrierConfig', 'preferredCarrier', e.target.value)}
                                    >
                                        <option value="DGR">DGR Express</option>
                                        <option value="DHL">DHL</option>
                                        <option value="FEDEX">FedEx</option>
                                    </Select>
                                    <Input
                                        label="Tax / VAT ID"
                                        value={formData.carrierConfig?.vatNo || ''}
                                        onChange={e => updateNested('carrierConfig', 'vatNo', e.target.value)}
                                    />
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default AdminUsersPage;
