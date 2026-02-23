import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    PageHeader,
    Card,
    Button,
    Input,
    Select,
    Tabs,
    Tab,
    AddressPanel,
    Alert
} from '../ui';

// --- Styled Components for Settings Layout ---
const Container = styled.div`
    max-width: 1200px;
    margin: 0 auto;
`;

const SectionGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
    
    @media (min-width: 1024px) {
        grid-template-columns: 2fr 1fr;
    }
`;

const CodeBlock = styled.pre`
    background: #0a0e1a;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    overflow-x: auto;
    margin-top: 16px;
`;

const SettingsPage = () => {
    const { user, refreshUser, isStaff } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('general');

    // API Key State
    const [apiKey, setApiKey] = useState(user?.apiKey || '');
    const [loading, setLoading] = useState(false);

    // Staff states
    const [clients, setClients] = useState([]);
    const [clientsLoading, setClientsLoading] = useState(false);

    // Shipper Profile State
    const [shipperProfile, setShipperProfile] = useState({});
    const [profileLoading, setProfileLoading] = useState(false);

    // Initialize Shipper Profile
    useEffect(() => {
        if (user) {
            setApiKey(user.apiKey || '');
            const defaultAddress = user.addresses?.find(a => a.isDefault) || {};
            setShipperProfile({
                ...defaultAddress,
                company: user.company || defaultAddress.company || '',
                contactPerson: user.name || defaultAddress.contactPerson || '',
                phone: user.phone || defaultAddress.phone || '',
                vatNumber: user.carrierConfig?.vatNo || defaultAddress.vatNumber || '',
                eoriNumber: user.carrierConfig?.eori || defaultAddress.eoriNumber || '',
                taxId: user.carrierConfig?.taxId || defaultAddress.taxId || '',
                traderType: user.carrierConfig?.traderType || defaultAddress.traderType || 'business',
                reference: user.carrierConfig?.defaultReference || defaultAddress.reference || ''
            });
        }
    }, [user]);

    const generateNewKey = async () => {
        try {
            setLoading(true);
            const res = await axios.post('/api/auth/api-key', {}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setApiKey(res.data.apiKey);
            enqueueSnackbar('New API Key generated successfully!', { variant: 'success' });
        } catch (err) {
            console.error(err);
            enqueueSnackbar('Failed to generate API Key', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(apiKey);
        enqueueSnackbar('API Key copied!', { variant: 'success' });
    };

    const fetchClients = async () => {
        setClientsLoading(true);
        try {
            const res = await axios.get('/api/auth/users', {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setClients(res.data.data);
        } catch (err) {
            console.error(err);
        } finally {
            setClientsLoading(false);
        }
    };

    const updateSurcharge = async (userId, data) => {
        try {
            await axios.patch('/api/auth/surcharge', { userId, ...data }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            enqueueSnackbar('User surcharge updated!', { variant: 'success' });
        } catch (err) {
            console.error(err);
            enqueueSnackbar('Failed to update surcharge', { variant: 'error' });
        }
    };

    const handleSaveProfile = async () => {
        setProfileLoading(true);
        try {
            const token = localStorage.getItem('token');
            const profilePayload = {
                name: shipperProfile.contactPerson,
                phone: shipperProfile.phone,
                company: shipperProfile.company,
                carrierConfig: {
                    preferredCarrier: user.carrierConfig?.preferredCarrier || 'DGR',
                    taxId: shipperProfile.taxId,
                    eori: shipperProfile.eoriNumber,
                    vatNo: shipperProfile.vatNumber,
                    traderType: shipperProfile.traderType,
                    defaultReference: shipperProfile.reference
                }
            };

            let currentAddresses = [...(user.addresses || [])];
            const existingDefaultIndex = currentAddresses.findIndex(a => a.isDefault);

            const newAddressObj = {
                ...shipperProfile,
                label: 'Default Shipper Profile',
                isDefault: true,
                _id: existingDefaultIndex !== -1 ? currentAddresses[existingDefaultIndex]._id : undefined
            };

            if (existingDefaultIndex !== -1) {
                currentAddresses[existingDefaultIndex] = newAddressObj;
            } else {
                currentAddresses.push(newAddressObj);
            }

            // Clean internal props
            currentAddresses = currentAddresses.map(({ _ownerId, _ownerName, _orgName, ...rest }) => rest);
            profilePayload.addresses = currentAddresses;

            await axios.patch('/api/users/profile', profilePayload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            enqueueSnackbar('Shipper Profile Updated Successfully', { variant: 'success' });
            await refreshUser();
        } catch (error) {
            console.error(error);
            enqueueSnackbar('Failed to update profile', { variant: 'error' });
        } finally {
            setProfileLoading(false);
        }
    };

    return (
        <Container>
            <PageHeader
                title="Settings"
                description="Manage your account, API access, and shipping preferences."
            />

            <Tabs>
                <Tab
                    active={activeTab === 'general'}
                    onClick={() => setActiveTab('general')}
                >
                    General & API
                </Tab>
                <Tab
                    active={activeTab === 'profile'}
                    onClick={() => setActiveTab('profile')}
                >
                    Default Shipper Profile
                </Tab>
            </Tabs>

            {/* GENERAL TAB */}
            {activeTab === 'general' && (
                <SectionGrid>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <Card title="Developer API Access">
                            <Alert severity="info" title="API Usage">
                                Use this key to integrate TargetLogistics tracking into your own warehouse or e-commerce workflow.
                            </Alert>

                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginTop: '24px' }}>
                                <div style={{ flex: 1 }}>
                                    <Input
                                        label="Your API Key"
                                        value={apiKey || 'No key generated yet'}
                                        disabled
                                        icon={
                                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                            </svg>
                                        }
                                    />
                                </div>
                                <Button variant="secondary" onClick={copyToClipboard} disabled={!apiKey}>
                                    Copy
                                </Button>
                                <Button variant="primary" onClick={generateNewKey} disabled={loading}>
                                    {apiKey ? 'Regenerate' : 'Generate Key'}
                                </Button>
                            </div>

                            <CodeBlock>
                                curl -X POST https://api.yourlogistics.com/shipments \<br />
                                &nbsp;&nbsp;-H "Authorization: Bearer YOUR_API_KEY" \<br />
                                &nbsp;&nbsp;-d {'\'{"origin": "..."}\''}
                            </CodeBlock>
                        </Card>

                        {isStaff && (
                            <Card title="Staff Operations">
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                    Manage client surcharges and global settings.
                                </p>
                                {!clients.length ? (
                                    <Button variant="outlined" onClick={fetchClients} disabled={clientsLoading}>
                                        {clientsLoading ? 'Loading...' : 'Load Client List'}
                                    </Button>
                                ) : (
                                    <div style={{ display: 'grid', gap: '16px' }}>
                                        {clients.map(client => (
                                            <ClientMarkupEditor
                                                key={client._id}
                                                client={client}
                                                onUpdate={(data) => updateSurcharge(client._id, data)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </Card>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <Card title="Connection Guide">
                            <h4 style={{ color: 'var(--accent-primary)', marginBottom: '8px' }}>1. Map Tracking (Mapbox)</h4>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
                                Add your token to <code>.env</code>:<br />
                                <code>REACT_APP_MAPBOX_TOKEN=pk.xxx</code>
                            </p>

                            <h4 style={{ color: 'var(--accent-primary)', marginBottom: '8px' }}>2. Carrier API</h4>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                DGR Developer Portal credentials:<br />
                                <code>DGR_API_KEY=...</code>
                            </p>
                        </Card>
                    </div>
                </SectionGrid>
            )}

            {/* PROFILE TAB */}
            {activeTab === 'profile' && (
                <SectionGrid>
                    <div>
                        <AddressPanel
                            titleOverride="Default Shipper Details (Autofill)"
                            value={shipperProfile}
                            onChange={setShipperProfile}
                        />
                        <div style={{ marginTop: '24px' }}>
                            <Button
                                variant="primary"
                                fullWidth
                                onClick={handleSaveProfile}
                                disabled={profileLoading}
                            >
                                {profileLoading ? 'Saving...' : 'Save Default Shipper Profile'}
                            </Button>
                        </div>
                    </div>
                    <div>
                        <Card title="Address Book">
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                Manage your saved addresses for receivers and regular destinations.
                            </p>
                            <Button
                                variant="secondary"
                                fullWidth
                                onClick={() => navigate('/address-book')}
                            >
                                Manage Address Book
                            </Button>
                        </Card>
                    </div>
                </SectionGrid>
            )}
        </Container>
    );
};

// Mini component for Markup Editor
const ClientMarkupEditor = ({ client, onUpdate }) => {
    const [type, setType] = useState(client.markup?.type || 'PERCENTAGE');
    const [percentage, setPercentage] = useState(client.markup?.percentageValue || 15);
    const [flat, setFlat] = useState(client.markup?.flatValue || 0);

    const handleSave = () => {
        onUpdate({
            markup: {
                type,
                percentageValue: parseFloat(percentage),
                flatValue: parseFloat(flat)
            }
        });
    };

    return (
        <div style={{
            padding: '12px',
            background: 'var(--bg-tertiary)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)'
        }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{client.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                <Select label="Type" value={type} onChange={e => setType(e.target.value)}>
                    <option value="PERCENTAGE">% Only</option>
                    <option value="FLAT">Flat Only</option>
                    <option value="COMBINED">% + Flat</option>
                </Select>
                {(type !== 'FLAT') && (
                    <Input label="%" type="number" value={percentage} onChange={e => setPercentage(e.target.value)} />
                )}
                {(type !== 'PERCENTAGE') && (
                    <Input label="Flat" type="number" value={flat} onChange={e => setFlat(e.target.value)} />
                )}
                <Button variant="secondary" onClick={handleSave} style={{ height: '42px', marginBottom: '1px' }}>Save</Button>
            </div>
        </div>
    );
};

export default SettingsPage;
