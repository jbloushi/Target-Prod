import React, { Suspense, lazy, useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { shipmentService } from '../services/api';
import { StatusPill, Loader } from '../ui';
import { TK } from '../tokens/kineticHorizon';
import WarehouseIntakeModal from '../components/warehouse/WarehouseIntakeModal';
import { generateCarrierManifestPDF } from '../utils/pdfGenerator';
import { useLanguage } from '../context/LanguageContext';

const QrScanner = lazy(() => import('react-qr-scanner'));

const scanAnimation = keyframes`
    0% { top: 10%; opacity: 0; }
    50% { opacity: 1; }
    100% { top: 90%; opacity: 0; }
`;

const ScanLine = styled.div`
    position: absolute;
    width: 80%;
    height: 2px;
    background: ${TK.primary};
    top: 50%;
    left: 10%;
    box-shadow: 0 0 12px ${TK.primary};
    animation: ${scanAnimation} 2s infinite ease-in-out;
    pointer-events: none;
`;

const WarehouseScanPage = () => {
    const { t, lang, isRTL } = useLanguage();
    const navigate = useNavigate();
    const [manualInput, setManualInput] = useState('');
    const [scanResult, setScanResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [cameraFacingMode, setCameraFacingMode] = useState('environment');
    const [isScanning, setIsScanning] = useState(true);
    const [incomingShipments, setIncomingShipments] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedCarrier, setSelectedCarrier] = useState('ALL');
    const [manifestLoading, setManifestLoading] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [scannedTrackingNumber, setScannedTrackingNumber] = useState('');

    const toggleCamera = () => {
        setCameraFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
    };

    const fetchIncomingShipments = async () => {
        setRefreshing(true);
        try {
            const response = await shipmentService.getAllShipments({ status: 'picked_up' });
            if (response.success && Array.isArray(response.data)) {
                setIncomingShipments(response.data);
            }
        } catch (err) {
            console.error('Failed to fetch incoming shipments', err);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchIncomingShipments();
    }, []);

    const handleScan = async (data) => {
        if (data && isScanning) {
            setIsScanning(false);
            try {
                const text = data.text || data;
                let trackingNumber = text;
                try {
                    const json = JSON.parse(text);
                    if (json.tracking) trackingNumber = json.tracking;
                } catch (e) {
                    // direct string
                }

                setScannedTrackingNumber(trackingNumber);
                setIsModalOpen(true);
            } catch (err) {
                setError(lang === 'ar' ? 'تنسيق رمز الاستجابة السريعة غير صالح' : 'Invalid QR Code format');
                setScanResult(null);
                setTimeout(() => setIsScanning(true), 2000);
            }
        }
    };

    const handleManualSubmit = (e) => {
        e.preventDefault();
        if (!manualInput.trim()) return;
        const tracking = manualInput.trim();
        setManualInput('');
        setScannedTrackingNumber(tracking);
        setIsModalOpen(true);
    };

    const handleError = (err) => {
        console.error(err);
        setError(lang === 'ar' ? 'خطأ في الوصول إلى الكاميرا أو تم رفض الإذن.' : 'Camera access error or permission denied.');
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setScannedTrackingNumber('');
        resetScanner();
    };

    const handleProcessed = (trackingNumber) => {
        setSuccessMsg(lang === 'ar' ? `تمت معالجة الشحنة ${trackingNumber} بنجاح!` : `Shipment ${trackingNumber} processed successfully!`);
        fetchIncomingShipments();
    };

    const processInbound = (trackingNumber) => {
        setScannedTrackingNumber(trackingNumber);
        setIsModalOpen(true);
    };

    const resetScanner = () => {
        setScanResult(null);
        setError('');
        setSuccessMsg('');
        setIsScanning(true);
    };

    const handleGenerateManifest = async (carrier = 'ALL') => {
        try {
            setManifestLoading(true);
            const res = await shipmentService.generateCarrierManifest({ carrier });
            if (res?.data) {
                await generateCarrierManifestPDF(res.data);
            }
        } catch (err) {
            console.error('Error generating carrier manifest:', err);
            alert(err.response?.data?.error || err.message || (lang === 'ar' ? 'فشل في إنشاء بيان شركة النقل' : 'Failed to generate carrier manifest'));
        } finally {
            setManifestLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '28px 24px', minHeight: '100vh', direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: TK.primary }}>warehouse</span>
                        <h1 style={{ fontWeight: 800, fontSize: 22, color: TK.text1, letterSpacing: '-0.03em', margin: 0 }}>
                            {lang === 'ar' ? 'عمليات المستودع والاستلام' : 'Warehouse Operations & Intake'}
                        </h1>
                    </div>
                    <p style={{ fontSize: 13.5, color: TK.text2, margin: 0 }}>
                        {lang === 'ar' ? 'مسح الباركود، والتحقق من أبعاد الطرود، ومعالجة الشحنات الواردة، وإنشاء بيانات التوزيع لشركات النقل.' : 'Scan barcodes, verify parcel dimensions, process inbound consignments, and generate carrier dispatch manifests.'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        type="button"
                        onClick={() => navigate('/dashboard')}
                        style={{
                            padding: '10px 18px', borderRadius: 12, border: `1.5px solid ${TK.border}`,
                            background: '#fff', color: TK.text1, fontWeight: 700, fontSize: 13,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            transition: 'all 0.15s'
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.text3 }}>dashboard</span>
                        {lang === 'ar' ? 'لوحة القيادة' : 'Dashboard'}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/shipments')}
                        style={{
                            padding: '10px 18px', borderRadius: 12, border: 'none',
                            background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 13,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            boxShadow: '0 2px 10px rgba(0,80,212,0.22)', transition: 'all 0.15s'
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>view_list</span>
                        {lang === 'ar' ? 'قائمة البيانات' : 'Manifest List'}
                    </button>
                </div>
            </div>

            {/* Main Layout Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
                {/* Left Column: Scanner & Quick Entry */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Scanner Card */}
                    <div style={{
                        background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`,
                        padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: TK.primary }}>qr_code_scanner</span>
                                <span style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>
                                    {lang === 'ar' ? 'ماسح الباركود / الاستجابة السريعة البصري' : 'Optical Barcode / QR Scanner'}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={toggleCamera}
                                style={{
                                    padding: '6px 12px', borderRadius: 9, border: `1px solid ${TK.border}`,
                                    background: '#f8fafc', color: TK.text2, fontSize: 12, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>flip_camera_ios</span>
                                {lang === 'ar' ? 'قلب العدسة' : 'Flip Lens'}
                            </button>
                        </div>

                        {error && (
                            <div style={{
                                padding: '12px 16px', borderRadius: 12, background: TK.errorBg,
                                border: `1px solid ${TK.error}40`, color: TK.error, fontSize: 13,
                                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16
                            }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {successMsg ? (
                            <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                                <div style={{
                                    width: 64, height: 64, borderRadius: 20, background: TK.successBg,
                                    color: TK.success, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 16
                                }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32 }}>verified</span>
                                </div>
                                <h3 style={{ fontSize: 17, fontWeight: 800, color: TK.text1, margin: '0 0 6px 0' }}>
                                    {lang === 'ar' ? 'اكتمل الاستلام' : 'Inbound Complete'}
                                </h3>
                                <p style={{ fontSize: 13, color: TK.text2, margin: '0 0 20px 0' }}>{successMsg}</p>
                                <button
                                    type="button"
                                    onClick={resetScanner}
                                    style={{
                                        padding: '10px 24px', borderRadius: 12, border: 'none',
                                        background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 13,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {lang === 'ar' ? 'مسح طرد آخر' : 'Scan Next Parcel'}
                                </button>
                            </div>
                        ) : (
                            <div>
                                <div style={{
                                    position: 'relative', overflow: 'hidden', borderRadius: 14,
                                    background: '#090d14', height: 280, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', marginBottom: 16
                                }}>
                                    {loading && (
                                        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                            <Loader color="white" />
                                            <span style={{ color: 'white', marginTop: 12, fontWeight: 600, fontSize: 13 }}>
                                                {lang === 'ar' ? 'جاري المعالجة...' : 'Processing Intake...'}
                                            </span>
                                        </div>
                                    )}

                                    {isScanning ? (
                                        navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? (
                                            <Suspense fallback={<Loader color="white" />}>
                                                <QrScanner
                                                    delay={300}
                                                    onError={handleError}
                                                    onScan={handleScan}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    constraints={{ video: { facingMode: cameraFacingMode } }}
                                                />
                                            </Suspense>
                                        ) : (
                                            <div style={{ padding: 24, textAlign: 'center', color: '#f87171', fontSize: 13, zIndex: 5 }}>
                                                {lang === 'ar' ? 'يتطلب الوصول إلى الكاميرا اتصالاً آمنًا (HTTPS) أو المضيف المحلي. استخدم الإدخال اليدوي أدناه.' : 'Camera access requires a secure connection (HTTPS) or localhost. Use manual input below.'}
                                            </div>
                                        )
                                    ) : (
                                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600 }}>
                                            {lang === 'ar' ? 'تم إيقاف الماسح الضوئي مؤقتًا' : 'Scanner Paused'}
                                        </div>
                                    )}

                                    {/* Reticle Overlay */}
                                    <div style={{ position: 'absolute', inset: 0, border: '36px solid rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
                                    <div style={{
                                        position: 'absolute', width: '68%', height: 160,
                                        border: '2px solid rgba(255,255,255,0.7)', borderRadius: 12,
                                        pointerEvents: 'none'
                                    }} />
                                    <ScanLine />
                                </div>

                                {/* Manual tracking input fallback */}
                                <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: 8 }}>
                                    <div style={{
                                        flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                                        border: `1.5px solid ${TK.border}`, borderRadius: 12, padding: '9px 14px',
                                        background: '#fafbfc'
                                    }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.text3 }}>barcode_scanner</span>
                                        <input
                                            placeholder={lang === 'ar' ? 'أو أدخل رقم التتبع / ماسح USB...' : 'Or enter tracking number / USB scanner...'}
                                            value={manualInput}
                                            onChange={e => setManualInput(e.target.value)}
                                            style={{
                                                border: 'none', outline: 'none', background: 'transparent',
                                                fontSize: 13, color: TK.text1, width: '100%', fontWeight: 600
                                            }}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={!manualInput.trim()}
                                        style={{
                                            padding: '0 20px', borderRadius: 12, border: 'none',
                                            background: manualInput.trim() ? TK.primary : TK.border,
                                            color: manualInput.trim() ? '#fff' : TK.text3,
                                            fontWeight: 700, fontSize: 13, cursor: manualInput.trim() ? 'pointer' : 'default',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        {lang === 'ar' ? 'استلام' : 'Intake'}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>

                    {/* Carrier Handover Manifest Generator */}
                    <div style={{
                        background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`,
                        padding: 22, boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: TK.primary }}>assignment_turned_in</span>
                            <span style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>
                                {lang === 'ar' ? 'بيان تسليم شركة النقل' : 'Carrier Handover Manifest'}
                            </span>
                        </div>
                        <p style={{ fontSize: 12.5, color: TK.text2, margin: '0 0 16px 0' }}>
                            {lang === 'ar' ? 'قم بإنشاء بيان تسليم رسمي وإيصال استلام لرحلات الطيران الصادرة وسائقي 3PL.' : 'Generate an official handover manifest and custody receipt for outgoing line-haul flights and 3PL drivers.'}
                        </p>

                        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                            {[
                                { id: 'ALL', label: lang === 'ar' ? 'جميع شركات النقل النشطة' : 'All Active Carriers' },
                                { id: 'DHL', label: lang === 'ar' ? 'دي إتش إل إكسبريس' : 'DHL Express' },
                                { id: 'LOGESTECHS', label: lang === 'ar' ? 'لوجيستيكس 3PL' : 'LogesTechs 3PL' },
                            ].map(carrier => (
                                <button
                                    key={carrier.id}
                                    type="button"
                                    onClick={() => setSelectedCarrier(carrier.id)}
                                    style={{
                                        padding: '7px 14px', borderRadius: 9,
                                        border: `1.5px solid ${selectedCarrier === carrier.id ? TK.primary : TK.border}`,
                                        background: selectedCarrier === carrier.id ? TK.primaryBg : '#fff',
                                        color: selectedCarrier === carrier.id ? TK.primary : TK.text2,
                                        fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all 0.12s'
                                    }}
                                >
                                    {carrier.label}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => handleGenerateManifest(selectedCarrier)}
                            disabled={manifestLoading}
                            style={{
                                width: '100%', padding: '11px 20px', borderRadius: 12, border: 'none',
                                background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 13,
                                cursor: manifestLoading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                opacity: manifestLoading ? 0.7 : 1, transition: 'all 0.15s'
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                                {manifestLoading ? 'progress_activity' : 'picture_as_pdf'}
                            </span>
                            {manifestLoading 
                                ? (lang === 'ar' ? 'تجميع البيان الرسمي...' : 'Compiling Official Manifest...') 
                                : (lang === 'ar' ? `إنشاء بيان PDF (${selectedCarrier})` : `Generate PDF Manifest (${selectedCarrier})`)}
                        </button>
                    </div>
                </div>

                {/* Right Column: Driver Pickups En En Route */}
                <div style={{
                    background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`,
                    padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex',
                    flexDirection: 'column', height: 'fit-content'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: TK.info }}>local_shipping</span>
                                <span style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>
                                    {lang === 'ar' ? 'الشحنات الواردة من السائقين' : 'Incoming Driver Pickups'}
                                </span>
                                <span style={{
                                    padding: '2px 8px', borderRadius: 8, background: TK.primaryBg,
                                    color: TK.primary, fontWeight: 800, fontSize: 11
                                }}>
                                    {incomingShipments.length}
                                </span>
                            </div>
                            <div style={{ fontSize: 12, color: TK.text3, marginTop: 2 }}>
                                {lang === 'ar' ? 'الطرود التي تم جمعها بواسطة السائقين في انتظار الدخول إلى المستودع' : 'Parcels collected by drivers awaiting warehouse gate intake'}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={fetchIncomingShipments}
                            disabled={refreshing}
                            style={{
                                width: 32, height: 32, borderRadius: 8, border: `1px solid ${TK.border}`,
                                background: '#f8fafc', color: TK.text2, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>refresh</span>
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 520, overflowY: 'auto' }}>
                        {incomingShipments.length === 0 ? (
                            <div style={{ padding: '48px 20px', textAlign: 'center', color: TK.text3 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 36, color: TK.text3 }}>inventory</span>
                                <div style={{ fontSize: 13, fontWeight: 700, color: TK.text1, marginTop: 8 }}>
                                    {lang === 'ar' ? 'لا يوجد طرود في الطريق' : 'No parcels en route'}
                                </div>
                                <div style={{ fontSize: 12, color: TK.text3, marginTop: 2 }}>
                                    {lang === 'ar' ? 'تمت معالجة جميع المجموعات من السائقين في المركز.' : 'All driver collections have been processed at the hub.'}
                                </div>
                            </div>
                        ) : (
                            incomingShipments.map((s) => (
                                <div
                                    key={s.trackingNumber || s.id}
                                    onClick={() => processInbound(s.trackingNumber)}
                                    style={{
                                        padding: '13px 15px', borderRadius: 13, border: `1px solid ${TK.border}`,
                                        background: '#fafbfc', cursor: 'pointer', display: 'flex',
                                        alignItems: 'center', justifyContent: 'space-between', gap: 12,
                                        transition: 'all 0.12s'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.borderColor = TK.primary;
                                        e.currentTarget.style.background = '#fff';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.borderColor = TK.border;
                                        e.currentTarget.style.background = '#fafbfc';
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{
                                            width: 38, height: 38, borderRadius: 10, background: TK.primaryBg,
                                            color: TK.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>package_2</span>
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>
                                                {s.trackingNumber}
                                            </div>
                                            <div style={{ fontSize: 11.5, color: TK.text3, marginTop: 2 }}>
                                                {s.originCity || s.sender?.city || (lang === 'ar' ? 'المصدر' : 'Origin')} → {s.destCity || s.receiver?.city || (lang === 'ar' ? 'الوجهة' : 'Dest')} • {s.service || (lang === 'ar' ? 'سريع' : 'Express')}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <StatusPill status={s.status || 'picked_up'} />
                                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.text3 }}>chevron_right</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Warehouse Intake Modal */}
            <WarehouseIntakeModal
                isOpen={isModalOpen}
                onClose={handleModalClose}
                trackingNumber={scannedTrackingNumber}
                onProcessed={handleProcessed}
            />
        </div>
    );
};

export default WarehouseScanPage;
