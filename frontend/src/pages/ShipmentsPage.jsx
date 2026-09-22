import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ShipmentList from '../components/ShipmentList';
import BulkShipmentImportModal from '../components/BulkShipmentImportModal';
import { useLanguage } from '../context/LanguageContext';
import { TK } from '../tokens/kineticHorizon';

const ShipmentsPage = () => {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ fontWeight: 800, fontSize: 22, color: TK.text1, letterSpacing: '-0.03em', margin: 0 }}>
                        {t('shipments_title', 'Shipments Management')}
                    </h1>
                    <p style={{ fontSize: 13.5, color: TK.text2, margin: '5px 0 0' }}>
                        {t('shipments_subtitle', 'Manage consignment lifecycle, track dual-carrier routes, and handle delivery exceptions.')}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        type="button"
                        onClick={() => setIsBulkModalOpen(true)}
                        style={{
                            padding: '11px 18px', borderRadius: 12, border: `1px solid ${TK.border}`,
                            background: '#ffffff', color: TK.text1, fontWeight: 700, fontSize: 13,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.15s ease'
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.primary }}>upload_file</span>
                        {t('bulk_import_csv', 'Bulk Import CSV')}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/shipment/new')}
                        style={{
                            padding: '11px 20px', borderRadius: 12, border: 'none',
                            background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 13,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
                            boxShadow: '0 2px 10px rgba(0,80,212,0.22)', transition: 'all 0.15s ease'
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                        {t('new_shipment', 'New Shipment')}
                    </button>
                </div>
            </div>

            <ShipmentList key={refreshKey} />

            <BulkShipmentImportModal
                isOpen={isBulkModalOpen}
                onClose={() => setIsBulkModalOpen(false)}
                onImportSuccess={() => setRefreshKey(prev => prev + 1)}
            />
        </div>
    );
};

export default ShipmentsPage;


