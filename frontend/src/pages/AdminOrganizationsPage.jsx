import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useSnackbar } from 'notistack';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { financeService, organizationService, userService } from '../services/api';
import { TK } from '../tokens/kineticHorizon';
import { Modal, WInput, WSelect } from '../ui';

// ── Styled Components ─────────────────────────────────

const PageContainer = styled.div`
    max-width: 1400px;
    margin: 0 auto;
    padding: 28px 24px;
    min-height: 100vh;
`;

const HeaderRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
`;

const HeaderTitle = styled.h1`
    font-size: 24px;
    font-weight: 800;
    color: ${TK.text1};
    letter-spacing: -0.03em;
    margin: 0;
`;

const HeaderSubtitle = styled.p`
    font-size: 13.5px;
    color: ${TK.text2};
    margin: 5px 0 0;
`;

const KpiGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
`;

const KpiCard = styled.div`
    background: #ffffff;
    border-radius: 20px;
    border: 1px solid ${TK.border};
    padding: 18px 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    display: flex;
    align-items: center;
    gap: 16px;
    transition: transform 0.15s, box-shadow 0.15s;

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    }
`;

const KpiIconWrapper = styled.div`
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: ${props => props.$bg || TK.primaryBg};
    color: ${props => props.$color || TK.primary};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const ControlBar = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 14px;
`;

const FilterGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
`;

const FilterChip = styled.button`
    padding: 6px 14px;
    border-radius: 10px;
    border: 1px solid ${props => props.$active ? TK.primary : TK.border};
    background: ${props => props.$active ? TK.primaryBg : '#ffffff'};
    color: ${props => props.$active ? TK.primary : TK.text2};
    font-weight: ${props => props.$active ? '700' : '600'};
    font-size: 12.5px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
        border-color: ${TK.primary};
        color: ${TK.primary};
    }
`;

const TableCard = styled.div`
    background: #ffffff;
    border-radius: 20px;
    border: 1px solid ${TK.border};
    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    overflow: hidden;
`;

const ActionIconButton = styled.button`
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid ${TK.border};
    background: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: ${props => props.$color || TK.text2};
    transition: all 0.15s;

    &:hover {
        background: ${TK.surfaceAlt};
        border-color: ${TK.primary};
        color: ${TK.primary};
        transform: translateY(-1px);
    }
`;

const OrgAvatar = styled.div`
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, ${TK.primaryBg} 0%, #e0e7ff 100%);
    color: ${TK.primary};
    font-weight: 800;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #c7d2fe;
    flex-shrink: 0;
`;

const TypeChip = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 6px;
    background: ${props => {
        switch (props.$type) {
            case 'internal': return '#fef3c7';
            case 'GOVERNMENT': return '#d1fae5';
            case 'INDIVIDUAL': return '#ede9fe';
            default: return '#e0f2fe';
        }
    }};
    color: ${props => {
        switch (props.$type) {
            case 'internal': return '#b45309';
            case 'GOVERNMENT': return '#059669';
            case 'INDIVIDUAL': return '#7c3aed';
            default: return '#0284c7';
        }
    }};
    text-transform: capitalize;
`;

const AdminOrganizationsPage = () => {
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const { user } = useAuth();
    const { t, lang, isRTL } = useLanguage();
    const isAdmin = user?.role === 'admin';

    const [orgs, setOrgs] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [orgOverviews, setOrgOverviews] = useState({});

    // Filter & Search
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');

    // Dialog States
    const [openDialog, setOpenDialog] = useState(false);
    const [openMembersDialog, setOpenMembersDialog] = useState(false);
    const [editingOrg, setEditingOrg] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        taxId: '',
        type: 'BUSINESS',
        creditLimit: 0,
        active: true
    });

    const [selectedMemberToAdd, setSelectedMemberToAdd] = useState('');

    const fetchOrgs = useCallback(async () => {
        setLoading(true);
        try {
            const [orgRes, userRes] = await Promise.all([
                organizationService.getOrganizations(),
                userService.getUsers()
            ]);
            const organizations = orgRes.data || [];
            setOrgs(organizations);
            setUsers(userRes.data || []);

            const overviewEntries = await Promise.all(organizations.map(async (org) => {
                try {
                    const response = await financeService.getOrganizationOverview(org.id);
                    return [org.id, response.data];
                } catch (error) {
                    return [org.id, null];
                }
            }));
            setOrgOverviews(Object.fromEntries(overviewEntries));
        } catch (error) {
            console.error(error);
            enqueueSnackbar(lang === 'ar' ? 'فشل تحميل المؤسسات' : 'Failed to load organizations', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [enqueueSnackbar]);

    useEffect(() => {
        fetchOrgs();
    }, [fetchOrgs]);

    // KPI Aggregations
    const kpiData = useMemo(() => {
        const total = orgs.length;
        const businessCount = orgs.filter(o => o.type?.toUpperCase() === 'BUSINESS').length;
        let totalCreditLimit = 0;
        let totalOutstanding = 0;

        orgs.forEach(o => {
            totalCreditLimit += parseFloat(o.creditLimit || 0);
            const overview = orgOverviews[o.id];
            if (overview?.balance) {
                totalOutstanding += parseFloat(overview.balance || 0);
            }
        });

        return {
            total,
            businessCount,
            totalCreditLimit,
            totalOutstanding
        };
    }, [orgs, orgOverviews]);

    // Filtered Orgs
    const filteredOrgs = useMemo(() => {
        return orgs.filter(org => {
            const matchesSearch = !search ||
                org.name?.toLowerCase().includes(search.toLowerCase()) ||
                org.taxId?.toLowerCase().includes(search.toLowerCase());

            const matchesType = typeFilter === 'ALL' ||
                (typeFilter === 'BUSINESS' && org.type?.toUpperCase() === 'BUSINESS') ||
                (typeFilter === 'INTERNAL' && org.type?.toLowerCase() === 'internal') ||
                (typeFilter === 'GOVERNMENT' && org.type?.toUpperCase() === 'GOVERNMENT') ||
                (typeFilter === 'INDIVIDUAL' && org.type?.toUpperCase() === 'INDIVIDUAL');

            return matchesSearch && matchesType;
        });
    }, [orgs, search, typeFilter]);

    const handleOpenDialog = (org = null) => {
        if (!isAdmin) {
            enqueueSnackbar(lang === 'ar' ? 'فقط المسؤولون يمكنهم إنشاء أو تعديل المؤسسات.' : 'Only administrators can create or edit organizations.', { variant: 'warning' });
            return;
        }
        if (org) {
            setEditingOrg(org);
            setFormData({
                name: org.name || '',
                taxId: org.taxId || '',
                type: org.type || (lang === 'ar' ? 'أعمال' : 'BUSINESS'),
                creditLimit: org.creditLimit || 0,
                active: org.active ?? true,
                markup: org.markup || { type: 'percentage', value: 0 },
                allowedCarriers: org.allowedCarriers || { allowed: ['DGR', 'OTE', 'ARAMEX'], defaultCarrier: 'DGR' }
            });
        } else {
            setEditingOrg(null);
            setFormData({
                name: '',
                taxId: '',
                type: 'BUSINESS',
                creditLimit: 0,
                active: true,
                markup: { type: 'percentage', value: 0 },
                allowedCarriers: { allowed: ['DGR', 'OTE', 'ARAMEX'], defaultCarrier: 'DGR' }
            });
        }
        setOpenDialog(true);
    };

    const handleSave = async () => {
        try {
            if (editingOrg) {
                await organizationService.updateOrganization(editingOrg.id, formData);
                enqueueSnackbar(lang === 'ar' ? `تم تحديث مؤسسة ${formData.name}` : `Organization ${formData.name} updated`, { variant: 'success' });
            } else {
                await organizationService.createOrganization(formData);
                enqueueSnackbar(lang === 'ar' ? `تم إنشاء مؤسسة ${formData.name}` : `Organization ${formData.name} created`, { variant: 'success' });
            }
            setOpenDialog(false);
            fetchOrgs();
        } catch (error) {
            const msg = error.response?.data?.error || lang === 'ar' ? 'فشل حفظ المؤسسة' : 'Failed to save organization';
            enqueueSnackbar(msg, { variant: 'error' });
        }
    };

    const handleAddMember = async () => {
        if (!isAdmin) {
            enqueueSnackbar(lang === 'ar' ? 'فقط المسؤولون يمكنهم إدارة الأعضاء.' : 'Only admins can manage members.', { variant: 'warning' });
            return;
        }
        if (!selectedMemberToAdd) return;
        try {
            await organizationService.addMember(editingOrg.id, selectedMemberToAdd);
            enqueueSnackbar(lang === 'ar' ? 'تمت إضافة العضو بنجاح' : 'Member added successfully', { variant: 'success' });
            fetchOrgs();
            const updatedOrgRes = await organizationService.getOrganization(editingOrg.id);
            setEditingOrg(updatedOrgRes.data);
            setSelectedMemberToAdd('');
        } catch (err) {
            const msg = err.response?.data?.error || lang === 'ar' ? 'فشل إضافة العضو' : 'Failed to add member';
            enqueueSnackbar(msg, { variant: 'error' });
        }
    };

    const handleRemoveMember = async (memberId) => {
        if (!isAdmin) {
            enqueueSnackbar(lang === 'ar' ? 'فقط المسؤولون يمكنهم إدارة الأعضاء.' : 'Only admins can manage members.', { variant: 'warning' });
            return;
        }
        try {
            await organizationService.removeMember(editingOrg.id, memberId);
            enqueueSnackbar(lang === 'ar' ? 'تمت إزالة العضو' : 'Member removed', { variant: 'success' });
            fetchOrgs();
            setEditingOrg(prev => ({
                ...prev,
                members: (prev.members || []).filter(m => m.id !== memberId)
            }));
        } catch (err) {
            enqueueSnackbar(lang === 'ar' ? 'فشل إزالة العضو' : 'Failed to remove member', { variant: 'error' });
        }
    };

    return (
        <PageContainer dir={isRTL ? 'rtl' : 'ltr'}>
            {/* Header */}
            <HeaderRow>
                <div>
                    <HeaderTitle>{lang === 'ar' ? 'إدارة المؤسسات' : 'Organization Management'}</HeaderTitle>
                    <HeaderSubtitle>
                        {lang === 'ar' ? 'إدارة الكيانات التجارية والتعرض الائتماني والأرصدة المشتركة وقوائم أعضاء الشركة.' : 'Manage business entities, credit exposure, shared balances, and company member rosters.'}
                    </HeaderSubtitle>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        type="button"
                        onClick={fetchOrgs}
                        disabled={loading}
                        style={{
                            padding: '9px 16px',
                            borderRadius: 11,
                            border: `1px solid ${TK.border}`,
                            background: '#ffffff',
                            color: TK.text2,
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'all 0.15s'
                        }}
                    >
                        <span
                            className="material-symbols-outlined"
                            style={{
                                fontSize: 18,
                                animation: loading ? 'spin 1s linear infinite' : 'none'
                            }}
                        >
                            refresh
                        </span>
                        Refresh
                    </button>

                    {isAdmin && (
                        <button
                            type="button"
                            onClick={() => handleOpenDialog()}
                            style={{
                                padding: '9px 18px',
                                borderRadius: 11,
                                border: 'none',
                                background: TK.primary,
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                boxShadow: '0 2px 8px rgba(0,80,212,0.25)',
                                transition: 'all 0.15s'
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                            New Organization
                        </button>
                    )}
                </div>
            </HeaderRow>

            {/* KPI Metrics */}
            <KpiGrid>
                <KpiCard>
                    <KpiIconWrapper $bg={TK.primaryBg} $color={TK.primary}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>corporate_fare</span>
                    </KpiIconWrapper>
                    <div>
                        <div style={{ fontSize: 12, color: TK.text3, fontWeight: 600 }}>{lang === 'ar' ? 'إجمالي المؤسسات' : 'Total Organizations'}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: TK.text1, marginTop: 2 }}>{kpiData.total}</div>
                    </div>
                </KpiCard>

                <KpiCard>
                    <KpiIconWrapper $bg="#e0f2fe" $color="#0284c7">
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>storefront</span>
                    </KpiIconWrapper>
                    <div>
                        <div style={{ fontSize: 12, color: TK.text3, fontWeight: 600 }}>{lang === 'ar' ? 'حسابات الأعمال' : 'Business Accounts'}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: TK.text1, marginTop: 2 }}>{kpiData.businessCount}</div>
                    </div>
                </KpiCard>

                <KpiCard>
                    <KpiIconWrapper $bg="#fef3c7" $color="#b45309">
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>credit_score</span>
                    </KpiIconWrapper>
                    <div>
                        <div style={{ fontSize: 12, color: TK.text3, fontWeight: 600 }}>{lang === 'ar' ? 'إجمالي الحد الائتماني' : 'Total Credit Limit'}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: TK.text1, marginTop: 2 }}>
                            {kpiData.totalCreditLimit.toFixed(3)} <span style={{ fontSize: 12, fontWeight: 600, color: TK.text3 }}>KWD</span>
                        </div>
                    </div>
                </KpiCard>

                <KpiCard>
                    <KpiIconWrapper
                        $bg={kpiData.totalOutstanding > 0 ? '#fee2e2' : '#d1fae5'}
                        $color={kpiData.totalOutstanding > 0 ? '#dc2626' : '#059669'}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>account_balance_wallet</span>
                    </KpiIconWrapper>
                    <div>
                        <div style={{ fontSize: 12, color: TK.text3, fontWeight: 600 }}>{lang === 'ar' ? 'إجمالي المستحقات' : 'Total Outstanding'}</div>
                        <div style={{
                            fontSize: 20,
                            fontWeight: 800,
                            color: kpiData.totalOutstanding > 0 ? '#dc2626' : '#059669',
                            marginTop: 2
                        }}>
                            {kpiData.totalOutstanding.toFixed(3)} <span style={{ fontSize: 12, fontWeight: 600, color: TK.text3 }}>KWD</span>
                        </div>
                    </div>
                </KpiCard>
            </KpiGrid>

            {/* Controls: Search & Type Filter */}
            <ControlBar>
                <div style={{ flex: 1, minWidth: 260, maxWidth: 380 }}>
                    <WInput
                        icon="search"
                        placeholder={lang === 'ar' ? 'ابحث عن اسم الشركة أو الرقم الضريبي...' : 'Search company name or Tax ID...'}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        trailing={search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    color: TK.text3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 8px'
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                            </button>
                        )}
                    />
                </div>

                <FilterGroup>
                    {[
                        { key: 'ALL', label: lang === 'ar' ? 'جميع المؤسسات' : 'All Organizations' },
                        { key: 'BUSINESS', label: lang === 'ar' ? 'أعمال' : 'Business' },
                        { key: 'INTERNAL', label: lang === 'ar' ? 'داخلي' : 'Internal' },
                        { key: 'GOVERNMENT', label: lang === 'ar' ? 'حكومي' : 'Government' },
                    ].map(f => (
                        <FilterChip
                            key={f.key}
                            $active={typeFilter === f.key}
                            onClick={() => setTypeFilter(f.key)}
                        >
                            {f.label}
                        </FilterChip>
                    ))}
                </FilterGroup>
            </ControlBar>

            {/* Organizations Table */}
            <TableCard>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${TK.border}`, background: '#f8fafc' }}>
                                <th style={{ padding: '13px 18px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lang === 'ar' ? 'الكيان التجاري' : 'Company Entity'}</th>
                                <th style={{ padding: '13px 18px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lang === 'ar' ? 'النوع' : 'Type'}</th>
                                <th style={{ padding: '13px 18px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lang === 'ar' ? 'الأعضاء' : 'Members'}</th>
                                <th style={{ padding: '13px 18px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lang === 'ar' ? 'المستحقات' : 'Outstanding'}</th>
                                <th style={{ padding: '13px 18px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lang === 'ar' ? 'الائتمان المتاح' : 'Available Credit'}</th>
                                <th style={{ padding: '13px 18px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lang === 'ar' ? 'الحد الائتماني' : 'Credit Limit'}</th>
                                <th style={{ padding: '13px 18px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                                <th style={{ padding: '13px 18px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: TK.text3 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite', color: TK.primary }}>progress_activity</span>
                                        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>{lang === 'ar' ? 'جاري تحميل بيان المؤسسات...' : 'Loading organizations manifest...'}</div>
                                    </td>
                                </tr>
                            ) : filteredOrgs.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: TK.text3 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 36, color: TK.text3 }}>domain_disabled</span>
                                        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: TK.text1 }}>{lang === 'ar' ? 'لم يتم العثور على مؤسسات' : 'No organizations found'}</div>
                                        <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 4 }}>{lang === 'ar' ? 'حاول مسح استعلام البحث أو إضافة مؤسسة جديدة.' : 'Try clearing your search query or add a new organization.'}</div>
                                    </td>
                                </tr>
                            ) : (
                                filteredOrgs.map((org, index) => {
                                    const overview = orgOverviews[org.id];
                                    const outstanding = overview?.balance ?? 0;
                                    const availableCredit = overview?.availableCredit ?? 0;
                                    const creditLimit = parseFloat(org.creditLimit || 0);

                                    return (
                                        <tr
                                            key={org.id}
                                            style={{
                                                borderBottom: index === filteredOrgs.length - 1 ? 'none' : `1px solid ${TK.border}`,
                                                transition: 'background 0.1s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={{ padding: '14px 18px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <OrgAvatar>
                                                        {org.name?.charAt(0).toUpperCase() || 'O'}
                                                    </OrgAvatar>
                                                    <div>
                                                        <div style={{ fontWeight: 700, fontSize: 13.5, color: TK.text1 }}>{org.name}</div>
                                                        <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>
                                                            {org.taxId ? `Tax ID: ${org.taxId}` : lang === 'ar' ? 'لا يوجد رقم ضريبي / EORI' : 'No Tax / EORI ID'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '14px 18px' }}>
                                                <TypeChip $type={org.type}>{org.type || (lang === 'ar' ? 'أعمال' : 'BUSINESS')}</TypeChip>
                                            </td>
                                            <td style={{ padding: '14px 18px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingOrg(org);
                                                        setOpenMembersDialog(true);
                                                    }}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        padding: '3px 8px',
                                                        borderRadius: 6,
                                                        border: `1px solid ${TK.border}`,
                                                        background: '#ffffff',
                                                        cursor: 'pointer',
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                        color: TK.text1,
                                                        transition: 'all 0.15s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.borderColor = TK.primary}
                                                    onMouseLeave={e => e.currentTarget.style.borderColor = TK.border}
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: TK.primary }}>group</span>
                                                    {org.members?.length || 0}
                                                </button>
                                            </td>
                                            <td style={{ padding: '14px 18px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
                                                <span style={{ color: outstanding > 0 ? '#dc2626' : '#059669' }}>
                                                    {Number(outstanding).toFixed(3)}
                                                </span>
                                                <span style={{ fontSize: 10, color: TK.text3, marginLeft: 4 }}>KWD</span>
                                            </td>
                                            <td style={{ padding: '14px 18px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, fontSize: 13, color: TK.text1 }}>
                                                {Number(availableCredit).toFixed(3)}
                                                <span style={{ fontSize: 10, color: TK.text3, marginLeft: 4 }}>KWD</span>
                                            </td>
                                            <td style={{ padding: '14px 18px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: TK.text2 }}>
                                                {creditLimit.toFixed(3)}
                                                <span style={{ fontSize: 10, color: TK.text3, marginLeft: 4 }}>KWD</span>
                                            </td>
                                            <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: '50%',
                                                    background: org.active ? '#10b981' : '#9ca3af',
                                                    marginRight: 6
                                                }} />
                                                <span style={{ fontSize: 12, fontWeight: 600, color: org.active ? '#059669' : '#6b7280' }}>
                                                    {org.active ? lang === 'ar' ? 'نشط' : 'Active' : lang === 'ar' ? 'معطل' : 'Disabled'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: 6 }}>
                                                    <ActionIconButton
                                                        title={lang === 'ar' ? 'إدارة الأعضاء' : 'Manage Members'}
                                                        onClick={() => {
                                                            setEditingOrg(org);
                                                            setOpenMembersDialog(true);
                                                        }}
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
                                                    </ActionIconButton>

                                                    {isAdmin && (
                                                        <ActionIconButton
                                                            title={lang === 'ar' ? 'تعديل المؤسسة' : 'Edit Organization'}
                                                            $color={TK.primary}
                                                            onClick={() => handleOpenDialog(org)}
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                                                        </ActionIconButton>
                                                    )}

                                                    <ActionIconButton
                                                        title={lang === 'ar' ? 'عرض البيانات المالية' : 'View Financials'}
                                                        $color="#059669"
                                                        onClick={() => navigate(`/finance`)}
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>account_balance_wallet</span>
                                                    </ActionIconButton>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </TableCard>

            {/* Create / Edit Organization Modal */}
            <Modal
                isOpen={openDialog}
                onClose={() => setOpenDialog(false)}
                title={editingOrg ? (lang === 'ar' ? 'تعديل المؤسسة' : 'Edit Organization') : (lang === 'ar' ? 'إنشاء مؤسسة جديدة' : 'Create New Organization')}
                width="560px"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
                        <button
                            type="button"
                            onClick={() => setOpenDialog(false)}
                            style={{
                                padding: '9px 18px',
                                borderRadius: 10,
                                border: `1px solid ${TK.border}`,
                                background: '#ffffff',
                                color: TK.text2,
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: 'pointer'
                            }}
                        >
                            {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            style={{
                                padding: '9px 20px',
                                borderRadius: 10,
                                border: 'none',
                                background: TK.primary,
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(0,80,212,0.25)'
                            }}
                        >
                            {editingOrg ? 'Save Changes' : 'Create Organization'}
                        </button>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
                    <WInput
                        label={lang === 'ar' ? 'اسم المؤسسة *' : 'Organization Name *'}
                        placeholder={lang === 'ar' ? 'مثال: شركة البحر للخدمات اللوجستية العالمية' : 'e.g. Al-Bahar Global Logistics'}
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        required
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <WInput
                            label={lang === 'ar' ? 'الرقم الضريبي / EORI' : 'Tax / EORI ID'}
                            placeholder="KW-1002345"
                            value={formData.taxId}
                            onChange={e => setFormData({ ...formData, taxId: e.target.value })}
                        />

                        <WSelect
                            label={lang === 'ar' ? 'نوع المؤسسة' : 'Organization Type'}
                            value={formData.type}
                            onChange={e => setFormData({ ...formData, type: e.target.value })}
                            options={[
                                { value: 'BUSINESS', label: lang === 'ar' ? 'أعمال (عميل)' : 'Business (Client)' },
                                { value: 'internal', label: lang === 'ar' ? 'مركز لوجستي داخلي' : 'Internal Logistics Hub' },
                                { value: 'GOVERNMENT', label: lang === 'ar' ? 'جهة حكومية' : 'Government Agency' },
                                { value: 'INDIVIDUAL', label: lang === 'ar' ? 'شاحن فردي' : 'Individual Shipper' }
                            ]}
                        />
                    </div>

                    {/* Carrier Access Policy section */}
                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: `1px solid ${TK.border}` }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 17, color: TK.primary }}>local_shipping</span>
                            {lang === 'ar' ? 'سياسة وصول شركات النقل للمؤسسة' : 'Organization Carrier Access Policy'}
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                            {[
                                { code: 'DGR', name: 'DHL Express (DGR)' },
                                { code: 'OTE', name: 'LogesTechs (OTE Ground)' },
                                { code: 'ARAMEX', name: 'Aramex Express' },
                                { code: 'INTERNAL', name: 'Target Local Fleet' }
                            ].map(c => {
                                const currentAllowed = formData.allowedCarriers?.allowed || ['DGR', 'OTE', 'ARAMEX'];
                                const isChecked = currentAllowed.includes(c.code);
                                return (
                                    <label key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: TK.text1, cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                                const next = e.target.checked
                                                    ? [...currentAllowed, c.code]
                                                    : currentAllowed.filter(x => x !== c.code);
                                                setFormData({
                                                    ...formData,
                                                    allowedCarriers: { ...(formData.allowedCarriers || {}), allowed: next }
                                                });
                                            }}
                                        />
                                        {c.name}
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {/* Rate Markup & Commercial Pricing Cockpit */}
                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: `1px solid ${TK.border}` }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 17, color: TK.primary }}>price_change</span>
                            {lang === 'ar' ? 'سياسة التسعير التجاري وهوامش الربح' : 'Rate Markup & Commercial Pricing Policy'}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                            <WSelect
                                label={lang === 'ar' ? 'نموذج هامش الربح الافتراضي' : 'Default Markup Model'}
                                value={formData.markup?.type || 'PERCENTAGE'}
                                onChange={(e) => {
                                    const type = e.target.value;
                                    setFormData({
                                        ...formData,
                                        markup: {
                                            ...(formData.markup || {}),
                                            type,
                                            percentageValue: formData.markup?.percentageValue ?? 15,
                                            flatValue: formData.markup?.flatValue ?? 0
                                        }
                                    });
                                }}
                                options={[
                                    { value: 'PERCENTAGE', label: lang === 'ar' ? 'رسوم إضافية بالنسبة المئوية (%)' : 'Percentage (%) Surcharge' },
                                    { value: 'FLAT', label: lang === 'ar' ? 'رسوم ثابتة (د.ك) لكل شحنة' : 'Flat Fee (KWD) per Shipment' },
                                    { value: 'COMBINED', label: lang === 'ar' ? 'مدمج (نسبة + مبلغ ثابت د.ك)' : 'Combined (% + Flat KWD)' }
                                ]}
                            />

                            {(formData.markup?.type === 'PERCENTAGE' || formData.markup?.type === 'COMBINED' || !formData.markup?.type) && (
                                <WInput
                                    label={lang === 'ar' ? 'هامش الربح بالنسبة المئوية (%)' : 'Percentage Markup (%)'}
                                    type="number"
                                    placeholder="15.0"
                                    value={formData.markup?.percentageValue ?? ''}
                                    onChange={(e) => {
                                        setFormData({
                                            ...formData,
                                            markup: {
                                                ...(formData.markup || {}),
                                                percentageValue: parseFloat(e.target.value) || 0
                                            }
                                        });
                                    }}
                                />
                            )}

                            {(formData.markup?.type === 'FLAT' || formData.markup?.type === 'COMBINED') && (
                                <WInput
                                    label={lang === 'ar' ? 'رسوم إضافية ثابتة (د.ك)' : 'Flat Surcharge (KWD)'}
                                    type="number"
                                    placeholder="1.500"
                                    value={formData.markup?.flatValue ?? ''}
                                    onChange={(e) => {
                                        setFormData({
                                            ...formData,
                                            markup: {
                                                ...(formData.markup || {}),
                                                flatValue: parseFloat(e.target.value) || 0
                                            }
                                        });
                                    }}
                                />
                            )}
                        </div>

                        <div style={{ fontSize: 11.5, color: TK.text3, marginTop: 4 }}>
                            {lang === 'ar' ? 'يُطبق عبر عروض الأسعار وإنشاء بوالص الشحن لجميع المستخدمين التابعين لهذا التاجر.' : 'Applied across quotes and waybill creations for all users affiliated with this merchant.'}
                        </div>
                    </div>

                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: `1px solid ${TK.border}` }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 17, color: TK.primary }}>credit_card</span>
                            {lang === 'ar' ? 'شروط الائتمان والتعرض المالي' : 'Credit Terms & Financial Exposure'}
                        </div>
                        <WInput
                            label={lang === 'ar' ? 'الحد الائتماني المعتمد (د.ك)' : 'Approved Credit Limit (KWD)'}
                            type="number"
                            placeholder="0.000"
                            value={formData.creditLimit}
                            onChange={e => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || 0 })}
                        />
                        <div style={{ fontSize: 11.5, color: TK.text3, marginTop: 8 }}>
                            {lang === 'ar' ? 'يتم الاحتفاظ بجميع قيود دفتر الأستاذ والخصوم والأرصدة غير المطبقة تلقائيًا في سجل التدقيق المالي.' : 'All ledger entries, debits, and unapplied credits are maintained automatically in the financial audit log.'}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Members Roster Modal */}
            <Modal
                isOpen={openMembersDialog}
                onClose={() => setOpenMembersDialog(false)}
                title={lang === 'ar' ? `أعضاء ${editingOrg?.name || 'المؤسسة'}` : `Members of ${editingOrg?.name || 'Organization'}`}
                width="650px"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                        <button
                            type="button"
                            onClick={() => setOpenMembersDialog(false)}
                            style={{
                                padding: '9px 18px',
                                borderRadius: 10,
                                border: `1px solid ${TK.border}`,
                                background: '#ffffff',
                                color: TK.text2,
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: 'pointer'
                            }}
                        >
                            {lang === 'ar' ? 'إغلاق' : 'Close'}
                        </button>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 0' }}>
                    {/* Member List */}
                    <div style={{ border: `1px solid ${TK.border}`, borderRadius: 14, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${TK.border}` }}>
                                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>{lang === 'ar' ? 'العضو' : 'Member'}</th>
                                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>{lang === 'ar' ? 'الدور' : 'Role'}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>{lang === 'ar' ? 'الإجراء' : 'Action'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(!editingOrg?.members || editingOrg.members.length === 0) ? (
                                    <tr>
                                        <td colSpan={3} style={{ padding: '24px 14px', textAlign: 'center', color: TK.text3, fontSize: 12.5 }}>
                                            {lang === 'ar' ? 'لم يتم تعيين أي أعضاء لهذه المؤسسة بعد.' : 'No members assigned to this organization yet.'}
                                        </td>
                                    </tr>
                                ) : (
                                    editingOrg.members.map((member, i) => (
                                        <tr
                                            key={member.id}
                                            style={{
                                                borderBottom: i === editingOrg.members.length - 1 ? 'none' : `1px solid ${TK.border}`
                                            }}
                                        >
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>{member.name}</div>
                                                <div style={{ fontSize: 11, color: TK.text3 }}>{member.email}</div>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span style={{
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    padding: '2px 8px',
                                                    borderRadius: 5,
                                                    background: member.role === 'admin' ? '#ede9fe' : member.role === 'org_manager' ? '#e0f2fe' : '#f3f4f6',
                                                    color: member.role === 'admin' ? '#7c3aed' : member.role === 'org_manager' ? '#0284c7' : '#4b5563'
                                                }}>
                                                    {member.role?.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                {isAdmin && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveMember(member.id)}
                                                        style={{
                                                            border: 'none',
                                                            background: 'transparent',
                                                            color: '#dc2626',
                                                            fontWeight: 600,
                                                            fontSize: 12,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {lang === 'ar' ? 'إزالة' : 'Remove'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Add Member Card */}
                    {isAdmin && (
                        <div style={{ background: '#f8fafc', borderRadius: 14, padding: 16, border: `1px solid ${TK.border}` }}>
                            <div style={{ fontWeight: 700, fontSize: 12.5, color: TK.text1, marginBottom: 8 }}>
                                {lang === 'ar' ? 'تعيين مستخدم حالي' : 'Assign Existing User'}
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <WSelect
                                    value={selectedMemberToAdd}
                                    onChange={e => setSelectedMemberToAdd(e.target.value)}
                                    options={[
                                        { value: '', label: lang === 'ar' ? '-- اختر مستخدم غير معين --' : '-- Choose unassigned user --' },
                                        ...users
                                            .filter(u => !editingOrg?.members?.some(m => m.id === u.id) && !u.organizationId)
                                            .map(u => ({
                                                value: u.id,
                                                label: `${u.name} (${u.email}) — ${u.role}`
                                            }))
                                    ]}
                                />
                                <button
                                    type="button"
                                    onClick={handleAddMember}
                                    disabled={!selectedMemberToAdd}
                                    style={{
                                        padding: '9px 18px',
                                        borderRadius: 10,
                                        border: 'none',
                                        background: selectedMemberToAdd ? TK.primary : '#94a3b8',
                                        color: '#ffffff',
                                        fontWeight: 700,
                                        fontSize: 12.5,
                                        cursor: selectedMemberToAdd ? 'pointer' : 'not-allowed',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {lang === 'ar' ? 'إضافة عضو' : 'Add Member'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </PageContainer>
    );
};

export default AdminOrganizationsPage;
