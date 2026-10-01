import React, { useState, useEffect } from 'react';
import { fleetService } from '../services/api';
import { useSnackbar } from 'notistack';

const ZONE_COLORS = {
  CAPITAL: 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300',
  HAWALLI: 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300',
  FARWANIYA: 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300',
  AHMADI: 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300',
  JAHRA: 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300',
  MUBARAK_AL_KABEER: 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300',
  OTHER: 'border-slate-400 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
};

const FleetDispatchPage = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [activeTab, setActiveTab] = useState('dispatch'); // 'dispatch', 'runs', 'vehicles'
  const [loading, setLoading] = useState(true);
  
  // Deck Data
  const [clusters, setClusters] = useState({});
  const [totalPending, setTotalPending] = useState(0);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  
  // Selection
  const [selectedZone, setSelectedZone] = useState('ALL');
  const [selectedShipmentIds, setSelectedShipmentIds] = useState([]);

  // Modal State for Creating Run
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [runNotes, setRunNotes] = useState('');
  const [isSubmittingRun, setIsSubmittingRun] = useState(false);

  // Runs Data
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);

  // Vehicle Modal State
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    plateNumber: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    capacityParcels: 50,
    capacityWeightKg: 500
  });

  const fetchDeck = async () => {
    try {
      setLoading(true);
      const res = await fleetService.getDispatchDeck();
      if (res.success) {
        setClusters(res.data.clusters || {});
        setTotalPending(res.data.totalPending || 0);
        setDrivers(res.data.drivers || []);
        setVehicles(res.data.vehicles || []);
      }
    } catch (err) {
      enqueueSnackbar(err.message || 'Failed loading fleet dispatch deck', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchRuns = async () => {
    try {
      setRunsLoading(true);
      const res = await fleetService.getRuns({ limit: 50 });
      if (res.success) {
        setRuns(res.data.runs || []);
      }
    } catch (err) {
      enqueueSnackbar(err.message || 'Failed loading delivery runs', { variant: 'error' });
    } finally {
      setRunsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeck();
    fetchRuns();
  }, []);

  const handleSelectAllInZone = (zoneKey) => {
    const list = clusters[zoneKey] || [];
    const idsInZone = list.map(s => s.id);
    const allSelected = idsInZone.every(id => selectedShipmentIds.includes(id));

    if (allSelected) {
      setSelectedShipmentIds(prev => prev.filter(id => !idsInZone.includes(id)));
    } else {
      setSelectedShipmentIds(prev => Array.from(new Set([...prev, ...idsInZone])));
    }
  };

  const handleToggleShipment = (id) => {
    setSelectedShipmentIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleCreateRun = async () => {
    if (!selectedDriverId) {
      enqueueSnackbar('Please select a driver for this run', { variant: 'warning' });
      return;
    }
    if (selectedShipmentIds.length === 0) {
      enqueueSnackbar('Please select at least one shipment', { variant: 'warning' });
      return;
    }

    try {
      setIsSubmittingRun(true);
      const res = await fleetService.createRun({
        driverId: selectedDriverId,
        vehicleId: selectedVehicleId || null,
        zone: selectedZone !== 'ALL' ? selectedZone : 'MULTI_ZONE',
        shipmentIds: selectedShipmentIds,
        notes: runNotes
      });

      enqueueSnackbar(res.message || 'Delivery run created & dispatched!', { variant: 'success' });
      setIsDispatchModalOpen(false);
      setSelectedShipmentIds([]);
      setRunNotes('');
      fetchDeck();
      fetchRuns();
      setActiveTab('runs');
    } catch (err) {
      enqueueSnackbar(err.message || 'Failed creating delivery run', { variant: 'error' });
    } finally {
      setIsSubmittingRun(false);
    }
  };

  const handleSettleCod = async (runId) => {
    try {
      const res = await fleetService.settleRunCod(runId);
      enqueueSnackbar(res.message || 'COD settled into vault successfully!', { variant: 'success' });
      fetchRuns();
      if (selectedRun?.id === runId) {
        setSelectedRun(null);
      }
    } catch (err) {
      enqueueSnackbar(err.message || 'Failed settling run COD', { variant: 'error' });
    }
  };

  const handleAddVehicle = async () => {
    if (!newVehicle.plateNumber) {
      enqueueSnackbar('Plate number is required', { variant: 'warning' });
      return;
    }
    try {
      await fleetService.createVehicle(newVehicle);
      enqueueSnackbar('Vehicle added to fleet', { variant: 'success' });
      setIsVehicleModalOpen(false);
      setNewVehicle({ plateNumber: '', make: '', model: '', year: 2026, capacityParcels: 50, capacityWeightKg: 500 });
      fetchDeck();
    } catch (err) {
      enqueueSnackbar(err.message || 'Failed adding vehicle', { variant: 'error' });
    }
  };

  const filteredClusters = Object.entries(clusters).filter(([zoneKey]) => {
    if (selectedZone === 'ALL') return true;
    return zoneKey === selectedZone;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl">local_shipping</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Fleet Control Tower</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Automated Kuwait Zone & PACI Dispatch, Live Driver Runsheets & COD Vault Handover
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-700/50">
          <button
            onClick={() => setActiveTab('dispatch')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              activeTab === 'dispatch' 
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' 
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Zone Dispatch ({totalPending})
          </button>
          <button
            onClick={() => { setActiveTab('runs'); fetchRuns(); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              activeTab === 'runs' 
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' 
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Delivery Runs ({runs.length})
          </button>
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              activeTab === 'vehicles' 
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' 
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Fleet Assets ({vehicles.length})
          </button>
        </div>
      </div>

      {/* TAB 1: ZONE DISPATCH DECK */}
      {activeTab === 'dispatch' && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
              <button
                onClick={() => setSelectedZone('ALL')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  selectedZone === 'ALL'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                All Zones ({totalPending})
              </button>
              {Object.keys(clusters).map((z) => (
                <button
                  key={z}
                  onClick={() => setSelectedZone(z)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    selectedZone === z
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {z.replace(/_/g, ' ')} ({clusters[z]?.length || 0})
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchDeck}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer"
                title="Refresh"
              >
                <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>sync</span>
              </button>

              <button
                disabled={selectedShipmentIds.length === 0}
                onClick={() => setIsDispatchModalOpen(true)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition ${
                  selectedShipmentIds.length > 0
                    ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                    : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed text-slate-400'
                }`}
              >
                <span className="material-symbols-outlined text-base">add</span>
                Dispatch {selectedShipmentIds.length} Selected
              </button>
            </div>
          </div>

          {/* Zone Clusters Cards */}
          {loading ? (
            <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm text-slate-500">Auto-clustering shipments by PACI & Governorate...</p>
            </div>
          ) : totalPending === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
              <span className="material-symbols-outlined text-5xl text-emerald-500 mx-auto mb-2 block">check_circle</span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">All Clear! No Pending Shipments</h3>
              <p className="text-sm text-slate-500 mt-1">All approved shipments have been assigned to delivery runs.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredClusters.map(([zoneKey, shipments]) => {
                const zoneStyle = ZONE_COLORS[zoneKey] || ZONE_COLORS.OTHER;
                const totalCod = shipments.reduce((sum, s) => sum + (Number(s.codAmount) || 0), 0);
                const allSelected = shipments.every(s => selectedShipmentIds.includes(s.id));

                return (
                  <div 
                    key={zoneKey} 
                    className={`flex flex-col rounded-3xl border-2 bg-white dark:bg-slate-800 shadow-sm overflow-hidden transition hover:shadow-md ${zoneStyle.split(' ')[0]}`}
                  >
                    {/* Zone Header */}
                    <div className="p-4 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-600 text-xl">location_on</span>
                        <h3 className="font-bold text-slate-900 dark:text-white text-base">
                          {zoneKey.replace(/_/g, ' ')}
                        </h3>
                      </div>
                      <button
                        onClick={() => handleSelectAllInZone(zoneKey)}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    {/* Zone Summary Metrics */}
                    <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50/70 dark:bg-slate-800/50 text-xs border-b border-slate-100 dark:border-slate-700/60">
                      <div>
                        <span className="text-slate-500">Parcels:</span>{' '}
                        <strong className="text-slate-900 dark:text-white">{shipments.length} stops</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500">Total COD:</span>{' '}
                        <strong className="text-emerald-600 dark:text-emerald-400">{totalCod.toFixed(3)} KWD</strong>
                      </div>
                    </div>

                    {/* Shipments List */}
                    <div className="p-3 divide-y divide-slate-100 dark:divide-slate-700/50 max-h-96 overflow-y-auto flex-1">
                      {shipments.map((s) => {
                        const isSelected = selectedShipmentIds.includes(s.id);
                        const dest = s.destination || {};

                        return (
                          <div
                            key={s.id}
                            onClick={() => handleToggleShipment(s.id)}
                            className={`p-3 rounded-2xl cursor-pointer transition flex items-start gap-3 my-1 ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="mt-1 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                                  {s.trackingNumber}
                                </span>
                                {s.codAmount > 0 && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                                    COD {Number(s.codAmount).toFixed(3)} KWD
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 truncate">
                                {dest.contactPerson || dest.name || 'Recipient'} • {dest.phone || ''}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {dest.formattedAddress || `${dest.area || dest.city || ''} Blk ${dest.block || ''} St ${dest.street || ''}`}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DELIVERY RUNS TABLE */}
      {activeTab === 'runs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Active & Dispatched Delivery Runs</h2>
            <button
              onClick={fetchRuns}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer"
            >
              <span className={`material-symbols-outlined text-base ${runsLoading ? 'animate-spin' : ''}`}>sync</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Run #</th>
                    <th className="px-6 py-4">Driver & Van</th>
                    <th className="px-6 py-4">Zone</th>
                    <th className="px-6 py-4">Progress</th>
                    <th className="px-6 py-4">COD Expected / Collected</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {runs.map((r) => {
                    const progressPercent = r.totalStops > 0 ? Math.round((r.completedStops / r.totalStops) * 100) : 0;

                    return (
                      <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition">
                        <td className="px-6 py-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {r.runNumber}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {r.driver?.name || 'Unassigned'}
                          </div>
                          <div className="text-xs text-slate-500">
                            {r.vehicle?.plateNumber ? `Van: ${r.vehicle.plateNumber}` : 'No vehicle assigned'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {r.zone}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="w-36">
                            <div className="flex justify-between text-xs mb-1">
                              <span>{r.completedStops} / {r.totalStops}</span>
                              <span>{progressPercent}%</span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs">
                            <span className="text-slate-500">Exp:</span>{' '}
                            <strong>{Number(r.totalCodExpected).toFixed(3)} KWD</strong>
                          </div>
                          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                            <span>Col:</span> {Number(r.totalCodCollected).toFixed(3)} KWD
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            r.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : r.status === 'IN_TRANSIT'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={async () => {
                              const res = await fleetService.getRunDetails(r.id);
                              if (res.success) setSelectedRun(res.data);
                            }}
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                            title="View Run Stops"
                          >
                            <span className="material-symbols-outlined text-base">visibility</span>
                          </button>

                          {r.totalCodCollected > 0 && !r.codSettled && (
                            <button
                              onClick={() => handleSettleCod(r.id)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shadow-sm cursor-pointer"
                            >
                              Settle COD
                            </button>
                          )}
                          {r.codSettled && (
                            <span className="text-xs font-bold text-emerald-600">✓ Settled</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: VEHICLES MANAGEMENT */}
      {activeTab === 'vehicles' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Fleet Vans & Vehicles</h2>
            <button
              onClick={() => setIsVehicleModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold text-sm shadow-md hover:bg-blue-700 transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Add Vehicle
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {vehicles.map((v) => (
              <div key={v.id} className="p-6 rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-2xl">local_shipping</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg">{v.plateNumber}</h3>
                      <p className="text-xs text-slate-500">{v.make} {v.model} ({v.year || 2026})</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                    {v.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  <div>Capacity: <strong>{v.capacityParcels} Parcels</strong></div>
                  <div>Max Weight: <strong>{v.capacityWeightKg} KG</strong></div>
                  <div>Assigned Driver: <strong>{v.driver?.name || 'Unassigned'}</strong></div>
                  <div>Completed Runs: <strong>{v._count?.runs || 0}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DISPATCH RUN MODAL */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-2xl">local_shipping</span>
                Dispatch Delivery Run ({selectedShipmentIds.length} Parcels)
              </h3>
              <button onClick={() => setIsDispatchModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Assign Driver *
                </label>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                >
                  <option value="">Select a Driver...</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.phone || 'No phone'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Assign Delivery Van (Optional)
                </label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                >
                  <option value="">Select a Vehicle...</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.plateNumber} - {v.make} {v.model}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Run Notes / Instructions
                </label>
                <textarea
                  value={runNotes}
                  onChange={(e) => setRunNotes(e.target.value)}
                  placeholder="e.g. Priority deliveries for Hawalli morning shift"
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="px-5 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isSubmittingRun}
                onClick={handleCreateRun}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md transition cursor-pointer"
              >
                {isSubmittingRun ? 'Creating Run...' : 'Confirm & Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RUN DETAILS DRAWER */}
      {selectedRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl h-full bg-white dark:bg-slate-800 shadow-2xl p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white font-mono">{selectedRun.runNumber}</h3>
                <p className="text-xs text-slate-500">Driver: {selectedRun.driver?.name} • Zone: {selectedRun.zone}</p>
              </div>
              <button onClick={() => setSelectedRun(null)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                <span className="material-symbols-outlined text-2xl text-slate-500">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase">Sequenced Stops</h4>
              <div className="space-y-2">
                {selectedRun.shipments?.map((s, idx) => {
                  const dest = s.destination || {};
                  return (
                    <div key={s.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-blue-600">{s.trackingNumber}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {s.status}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1">
                          {dest.contactPerson || dest.name} ({dest.phone})
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{dest.formattedAddress}</p>
                        
                        {s.podSignatureUrl && (
                          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex items-center gap-2">
                            <span className="text-[11px] font-bold text-emerald-600">✓ POD Signature Captured</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD VEHICLE MODAL */}
      {isVehicleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Register Fleet Vehicle</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Plate Number *</label>
                <input
                  type="text"
                  value={newVehicle.plateNumber}
                  onChange={(e) => setNewVehicle({ ...newVehicle, plateNumber: e.target.value })}
                  placeholder="e.g. 15-94821"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Make</label>
                  <input
                    type="text"
                    value={newVehicle.make}
                    onChange={(e) => setNewVehicle({ ...newVehicle, make: e.target.value })}
                    placeholder="Toyota"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Model</label>
                  <input
                    type="text"
                    value={newVehicle.model}
                    onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                    placeholder="HiAce"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button onClick={() => setIsVehicleModalOpen(false)} className="px-4 py-2 rounded-xl text-slate-600 text-sm cursor-pointer">Cancel</button>
              <button onClick={handleAddVehicle} className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold cursor-pointer">Save Vehicle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetDispatchPage;
