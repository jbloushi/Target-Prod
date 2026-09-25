import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { useSnackbar } from 'notistack';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { userService } from '../services/api';
import PageHeader from '../components/common/PageHeader';

export const AddressBookPage = () => {
  const { user, refreshUser } = useAuth();
  const userId = user?._id || user?.id;
  const userRole = user?.role;
  const userAddresses = user?.addresses;
  const { enqueueSnackbar } = useSnackbar();
  const { lang } = useLanguage();

  const [allAddresses, setAllAddresses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [saving, setSaving] = useState(false);

  const isStaff = ['admin', 'staff', 'manager'].includes(userRole);

  const fetchAddresses = useCallback(async () => {
    setLoading(true);
    try {
      let addresses = [];
      if (isStaff) {
        const res = await userService.getUsers();
        addresses = (res.data || []).flatMap((u) =>
          (u.addresses || []).map((addr) => ({
            ...addr,
            _ownerId: u._id,
            _ownerName: u.name,
            _ownerEmail: u.email,
            _orgName: u.organization?.name || 'Personal',
          }))
        );
      } else {
        await refreshUser();
        addresses = (userAddresses || []).map((addr) => ({
          ...addr,
          _ownerId: userId,
          _ownerName: 'Me',
        }));
      }
      setAllAddresses(addresses);
    } catch (error) {
      console.error('Failed to fetch addresses:', error);
      enqueueSnackbar('Failed to load address book', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar, isStaff, refreshUser, userAddresses, userId]);

  useEffect(() => {
    if (userId) fetchAddresses();
  }, [fetchAddresses, userId]);

  const filteredAddresses = useMemo(() => {
    if (!searchQuery) return allAddresses;
    const lowerQ = searchQuery.toLowerCase();
    return allAddresses.filter(
      (addr) =>
        (addr.label || '').toLowerCase().includes(lowerQ) ||
        (addr.company || '').toLowerCase().includes(lowerQ) ||
        (addr.contactPerson || '').toLowerCase().includes(lowerQ) ||
        (addr.city || '').toLowerCase().includes(lowerQ) ||
        (addr._ownerName || '').toLowerCase().includes(lowerQ)
    );
  }, [allAddresses, searchQuery]);

  const handleOpenModal = (address = null) => {
    if (address) {
      setEditingAddress({
        ...address,
        streetLines: address.streetLines || [address.address || ''],
      });
      setEditingUser({ _id: address._ownerId });
    } else {
      setEditingAddress({
        label: '',
        contactPerson: '',
        company: '',
        phone: '',
        email: '',
        city: 'Kuwait City',
        state: 'Capital',
        streetLines: [''],
        buildingName: '',
        unitNumber: '',
        postalCode: '',
        countryCode: 'KW',
      });
      setEditingUser({ _id: user._id });
    }
    setOpenModal(true);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!editingAddress.label || !editingAddress.contactPerson) {
      enqueueSnackbar('Label and contact person are required', { variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const usersRes = await userService.getUsers();
      const targetUser = (usersRes.data || []).find((u) => u._id === editingUser._id);

      if (!targetUser) {
        enqueueSnackbar('User not found. Cannot save address.', { variant: 'error' });
        return;
      }

      let updatedAddresses = [...(targetUser.addresses || [])];

      if (editingAddress._id) {
        updatedAddresses = updatedAddresses.map((a) =>
          a._id === editingAddress._id ? { ...editingAddress } : a
        );
      } else {
        const { _ownerId, _ownerName, _ownerEmail, _orgName, ...cleanAddress } = editingAddress;
        updatedAddresses.push({ ...cleanAddress, _id: `addr_${Date.now()}` });
      }

      // Cleanup metadata before sending
      updatedAddresses = updatedAddresses.map(({ _ownerId, _ownerName, _ownerEmail, _orgName, ...rest }) => rest);

      await userService.updateUser(targetUser._id, { addresses: updatedAddresses });
      enqueueSnackbar('Address saved successfully', { variant: 'success' });
      setOpenModal(false);
      fetchAddresses();
      if (targetUser._id === user._id) refreshUser();
    } catch (error) {
      console.error('Save failed:', error);
      enqueueSnackbar('Failed to save address', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (address) => {
    if (!window.confirm(`Are you sure you want to delete "${address.label || 'this address'}"?`)) return;

    try {
      const usersRes = await userService.getUsers();
      const targetUser = (usersRes.data || []).find((u) => u._id === address._ownerId);

      if (!targetUser) {
        enqueueSnackbar('User not found.', { variant: 'error' });
        return;
      }

      const updatedAddresses = (targetUser.addresses || []).filter((a) => a._id !== address._id);
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title={lang === 'ar' ? 'سجل العناوين المركزي' : 'Address Registry & Hub Directory'}
        subtitle={
          isStaff
            ? 'Manage all shipper and consignee addresses across the enterprise logistics network.'
            : 'Manage saved pickup warehouses, corporate offices, and client delivery locations.'
        }
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchAddresses}
            className="btn btn-outline border-base-300 btn-sm font-bold text-xs gap-1"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="btn btn-primary btn-sm font-bold text-xs gap-1.5 shadow-md shadow-primary/20"
          >
            <span className="material-symbols-outlined text-base">add_location_alt</span>
            <span>Add New Address</span>
          </button>
        </div>
      </PageHeader>

      {/* Search & Filter Bar */}
      <div className="card bg-base-100 border border-base-200 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 text-lg pointer-events-none">
              search
            </span>
            <input
              type="text"
              placeholder="Search by label, company, contact person, city, or owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input input-bordered input-sm w-full pl-9 pr-8 text-xs focus:input-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="btn btn-ghost btn-circle btn-xs absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40"
              >
                ✕
              </button>
            )}
          </div>
          <div className="text-xs font-bold text-base-content/60 shrink-0">
            Total Locations: <span className="font-mono text-primary font-black">{filteredAddresses.length}</span>
          </div>
        </div>
      </div>

      {/* Addresses Table Card */}
      <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm w-full">
            <thead>
              <tr className="bg-base-200/50 text-base-content/70">
                <th>Label / Company</th>
                <th>Location & Area</th>
                <th>Contact Details</th>
                {isStaff && <th>Account Owner</th>}
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isStaff ? 5 : 4} className="text-center py-12">
                    <span className="loading loading-spinner loading-md text-primary" />
                    <p className="text-xs text-base-content/60 mt-2">Loading addresses...</p>
                  </td>
                </tr>
              ) : filteredAddresses.length === 0 ? (
                <tr>
                  <td colSpan={isStaff ? 5 : 4} className="text-center py-12">
                    <span className="material-symbols-outlined text-4xl text-base-content/30 mb-2">location_off</span>
                    <p className="font-bold text-sm text-base-content">No Addresses Found</p>
                    <p className="text-xs text-base-content/50 mt-1">
                      {searchQuery ? 'Try clearing your search query.' : 'Add your first warehouse or recipient preset.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredAddresses.map((addr, index) => (
                  <tr key={addr._id || index} className="hover">
                    <td>
                      <div className="font-bold text-sm text-base-content">{addr.label || 'Saved Location'}</div>
                      <div className="text-xs text-base-content/60">{addr.company || '—'}</div>
                    </td>
                    <td>
                      <div className="font-semibold text-xs text-base-content">
                        {addr.city}, {addr.state || ''}
                      </div>
                      <div className="text-[11px] text-base-content/60">
                        {addr.streetLines?.[0] || addr.address || ''} {addr.buildingName && `(${addr.buildingName})`}
                      </div>
                    </td>
                    <td>
                      <div className="font-medium text-xs text-base-content">{addr.contactPerson}</div>
                      <div className="text-[11px] font-mono text-base-content/60">{addr.phone || addr.email || '—'}</div>
                    </td>
                    {isStaff && (
                      <td>
                        <span className="badge badge-sm badge-neutral font-medium text-[11px]">
                          {addr._ownerName || 'Staff'}
                        </span>
                        {addr._orgName && addr._orgName !== 'Personal' && (
                          <span className="block text-[10px] text-base-content/50 mt-0.5">{addr._orgName}</span>
                        )}
                      </td>
                    )}
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenModal(addr)}
                          className="btn btn-ghost btn-xs btn-circle text-primary"
                          title="Edit Address"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(addr)}
                          className="btn btn-ghost btn-xs btn-circle text-error"
                          title="Delete Address"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Address Modal */}
      {openModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-base-200">
              <h3 className="font-black text-base text-base-content">
                {editingAddress?._id ? 'Edit Address Preset' : 'Add New Address Preset'}
              </h3>
              <button
                type="button"
                onClick={() => setOpenModal(false)}
                className="btn btn-ghost btn-circle btn-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Preset Label *</label>
                  <input
                    type="text"
                    value={editingAddress.label || ''}
                    onChange={(e) => setEditingAddress({ ...editingAddress, label: e.target.value })}
                    placeholder="e.g. Shuwaikh Central Warehouse"
                    className="input input-bordered input-sm w-full"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Company Name</label>
                  <input
                    type="text"
                    value={editingAddress.company || ''}
                    onChange={(e) => setEditingAddress({ ...editingAddress, company: e.target.value })}
                    placeholder="Company or Trading Name"
                    className="input input-bordered input-sm w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Contact Person *</label>
                  <input
                    type="text"
                    value={editingAddress.contactPerson || ''}
                    onChange={(e) => setEditingAddress({ ...editingAddress, contactPerson: e.target.value })}
                    placeholder="Full Contact Name"
                    className="input input-bordered input-sm w-full"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Phone Number</label>
                  <input
                    type="text"
                    value={editingAddress.phone || ''}
                    onChange={(e) => setEditingAddress({ ...editingAddress, phone: e.target.value })}
                    placeholder="+965 9000 0000"
                    className="input input-bordered input-sm w-full font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-base-content/70 uppercase">Street Address / Block</label>
                <input
                  type="text"
                  value={editingAddress.streetLines?.[0] || ''}
                  onChange={(e) => setEditingAddress({ ...editingAddress, streetLines: [e.target.value] })}
                  placeholder="Block 4, Street 12, Plot 89"
                  className="input input-bordered input-sm w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Building / PACI No</label>
                  <input
                    type="text"
                    value={editingAddress.buildingName || ''}
                    onChange={(e) => setEditingAddress({ ...editingAddress, buildingName: e.target.value })}
                    placeholder="Tower name or PACI"
                    className="input input-bordered input-sm w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Unit / Floor</label>
                  <input
                    type="text"
                    value={editingAddress.unitNumber || ''}
                    onChange={(e) => setEditingAddress({ ...editingAddress, unitNumber: e.target.value })}
                    placeholder="Floor 2, Apt 4"
                    className="input input-bordered input-sm w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">City / Area</label>
                  <input
                    type="text"
                    value={editingAddress.city || ''}
                    onChange={(e) => setEditingAddress({ ...editingAddress, city: e.target.value })}
                    className="input input-bordered input-sm w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Governorate</label>
                  <input
                    type="text"
                    value={editingAddress.state || ''}
                    onChange={(e) => setEditingAddress({ ...editingAddress, state: e.target.value })}
                    className="input input-bordered input-sm w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Country</label>
                  <select
                    value={editingAddress.countryCode || 'KW'}
                    onChange={(e) => setEditingAddress({ ...editingAddress, countryCode: e.target.value })}
                    className="select select-bordered select-sm w-full"
                  >
                    <option value="KW">Kuwait 🇰🇼</option>
                    <option value="SA">Saudi Arabia 🇸🇦</option>
                    <option value="AE">UAE 🇦🇪</option>
                    <option value="BH">Bahrain 🇧🇭</option>
                    <option value="QA">Qatar 🇶🇦</option>
                    <option value="OM">Oman 🇴🇲</option>
                  </select>
                </div>
              </div>

              <div className="modal-action pt-2">
                <button
                  type="button"
                  onClick={() => setOpenModal(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary btn-sm font-bold shadow-md shadow-primary/20"
                >
                  {saving ? 'Saving...' : 'Save Address'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddressBookPage;
