import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { useSnackbar } from 'notistack';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/api';
import { PageHeader, Button, Card, Modal, Input } from '../ui';
import AddressPanel from '../components/AddressPanel';

// Custom Table Styles (Sharing with Dashboard but inline for now as requested)
const TableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  
  th {
    text-align: left;
    padding: 14px 16px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-tertiary);
  }

  th:first-child { border-radius: 10px 0 0 0; }
  th:last-child { border-radius: 0 10px 0 0; }

  td {
    padding: 20px 16px;
    border-bottom: 1px solid var(--border-color);
    font-size: 14px;
    color: var(--text-primary);
    background: var(--bg-secondary);
  }

  tbody tr {
    transition: all 0.2s ease;
    &:hover td {
      background: var(--bg-tertiary);
    }
  }
`;

const ActionButton = styled.button`
    background: transparent;
    border: none;
    cursor: pointer;
    color: ${props => props.$color || 'var(--text-secondary)'};
    padding: 4px;
    transition: color 0.2s;
    &:hover { color: var(--text-primary); }
`;

const SearchContainer = styled.div`
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
`;

const AddressBookPage = () => {
    const { user, refreshUser } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const [allAddresses, setAllAddresses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);
    const [editingUser, setEditingUser] = useState(null);

    const isStaff = ['admin', 'staff'].includes(user?.role);

    const fetchAddresses = async () => {
        setLoading(true);
        try {
            let addresses = [];
            if (isStaff) {
                const res = await userService.getUsers();
                addresses = res.data.flatMap(u =>
                    (u.addresses || []).map(addr => ({
                        ...addr,
                        _ownerId: u._id,
                        _ownerName: u.name,
                        _ownerEmail: u.email,
                        _orgName: u.organization?.name || 'Personal'
                    }))
                );
            } else {
                await refreshUser();
                addresses = (user.addresses || []).map(addr => ({
                    ...addr,
                    _ownerId: user._id,
                    _ownerName: 'Me'
                }));
            }
            setAllAddresses(addresses);
        } catch (error) {
            console.error('Failed to fetch addresses:', error);
            enqueueSnackbar('Failed to load address book', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) fetchAddresses();
    }, [user?.role]);

    const filteredAddresses = useMemo(() => {
        if (!searchQuery) return allAddresses;
        const lowerQ = searchQuery.toLowerCase();
        return allAddresses.filter(addr =>
            (addr.label || '').toLowerCase().includes(lowerQ) ||
            (addr.company || '').toLowerCase().includes(lowerQ) ||
            (addr.contactPerson || '').toLowerCase().includes(lowerQ) ||
            (addr.city || '').toLowerCase().includes(lowerQ) ||
            (addr._ownerName || '').toLowerCase().includes(lowerQ)
        );
    }, [allAddresses, searchQuery]);

    const handleOpenDialog = (address = null) => {
        if (address) {
            setEditingAddress(address);
            setEditingUser({ _id: address._ownerId });
        } else {
            setEditingAddress({ countryCode: 'KW', phoneCountryCode: '+965' });
            setEditingUser({ _id: user._id });
        }
        setOpenDialog(true);
    };

    const handleSave = async (addressData) => {
        try {
            // Logic same as previous implementation
            const usersRes = await userService.getUsers();
            const targetUser = usersRes.data.find(u => u._id === editingUser._id);

            if (!targetUser) {
                enqueueSnackbar('User not found. Cannot save address.', { variant: 'error' });
                return;
            }

            let updatedAddresses = [...(targetUser.addresses || [])];

            if (addressData._id) {
                updatedAddresses = updatedAddresses.map(a =>
                    a._id === addressData._id ? { ...addressData } : a
                );
            } else {
                const { _ownerId, _ownerName, _ownerEmail, _orgName, ...cleanAddress } = addressData;
                updatedAddresses.push(cleanAddress);
            }

            // Cleanup metadata
            updatedAddresses = updatedAddresses.map(({ _ownerId, _ownerName, _ownerEmail, _orgName, ...rest }) => rest);

            await userService.updateUser(targetUser._id, { addresses: updatedAddresses });

            enqueueSnackbar('Address saved successfully', { variant: 'success' });
            setOpenDialog(false);
            fetchAddresses();
            if (targetUser._id === user._id) refreshUser();

        } catch (error) {
            console.error('Save failed:', error);
            enqueueSnackbar('Failed to save address', { variant: 'error' });
        }
    };

    const handleDelete = async (address) => {
        if (!window.confirm(`Are you sure you want to delete "${address.label || 'this address'}"?`)) return;

        try {
            const usersRes = await userService.getUsers();
            const targetUser = usersRes.data.find(u => u._id === address._ownerId);

            if (!targetUser) {
                enqueueSnackbar('User not found.', { variant: 'error' });
                return;
            }

            const updatedAddresses = (targetUser.addresses || []).filter(a => a._id !== address._id);

            await userService.updateUser(targetUser._id, { addresses: updatedAddresses });

            enqueueSnackbar('Address deleted', { variant: 'success' });
            fetchAddresses();
            if (targetUser._id === user._id) refreshUser();

        } catch (error) {
            console.error('Delete failed:', error);
            enqueueSnackbar('Failed to delete address', { variant: 'error' });
        }
    };

    return (
        <div>
            <PageHeader
                title="Address Book"
                description={isStaff ? "Manage all addresses across the system." : "Manage your saved addresses."}
                action={
                    <Button
                        variant="primary"
                        icon={
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                        }
                        onClick={() => handleOpenDialog()}
                    >
                        Add New Address
                    </Button>
                }
                secondaryAction={
                    <Button variant="secondary" onClick={fetchAddresses}>
                        Refresh
                    </Button>
                }
            />

            <SearchContainer>
                <div style={{ position: 'relative' }}>
                    <svg
                        style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
                        width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search by label, company, contact, or user..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '12px 16px 12px 44px',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                            fontSize: '14px'
                        }}
                    />
                </div>
            </SearchContainer>

            <Card>
                <TableWrapper>
                    <StyledTable>
                        <thead>
                            <tr>
                                <th>Label / Company</th>
                                <th>Location</th>
                                <th>Contact Info</th>
                                {isStaff && <th>Owner</th>}
                                <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={isStaff ? 5 : 4} style={{ textAlign: 'center' }}>Loading...</td></tr>
                            ) : filteredAddresses.map((addr, index) => (
                                <tr key={addr._id || index}>
                                    <td>
                                        <div style={{ fontWeight: 'bold' }}>{addr.label || 'No Label'}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{addr.company}</div>
                                    </td>
                                    <td>
                                        <div>{addr.city}, {addr.countryCode}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{addr.streetLines?.[0]}</div>
                                    </td>
                                    <td>
                                        <div>{addr.contactPerson}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{addr.phone}</div>
                                    </td>
                                    {isStaff && (
                                        <td>
                                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{addr._ownerName}</span>
                                        </td>
                                    )}
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                            <ActionButton $color="var(--accent-warning)" onClick={() => handleOpenDialog(addr)}>
                                                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </ActionButton>
                                            <ActionButton $color="var(--accent-error)" onClick={() => handleDelete(addr)}>
                                                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </ActionButton>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && filteredAddresses.length === 0 && (
                                <tr>
                                    <td colSpan={isStaff ? 5 : 4} style={{ textAlign: 'center', padding: '40px' }}>
                                        <div style={{ color: 'var(--text-secondary)' }}>No addresses found.</div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </StyledTable>
                </TableWrapper>
            </Card>

            <Modal
                isOpen={openDialog}
                onClose={() => setOpenDialog(false)}
                title={editingAddress?._id ? 'Edit Address' : 'Add New Address'}
                width="800px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpenDialog(false)}>Cancel</Button>
                        <Button variant="primary" onClick={() => handleSave(editingAddress)}>Save Address</Button>
                    </>
                }
            >
                <div style={{ padding: '0 8px' }}>
                    <AddressPanel
                        titleOverride="" // No title inside modal
                        value={editingAddress || {}}
                        onChange={setEditingAddress}
                    />
                </div>
            </Modal>
        </div>
    );
};

export default AddressBookPage;
