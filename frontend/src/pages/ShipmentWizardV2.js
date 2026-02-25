import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import {
    Container, Card, Typography, Button, Box, Grid,
    Divider, CardContent, CircularProgress, Alert, Chip, IconButton,
    Tooltip, Stack, Paper, Fade, Zoom,
    Menu, MenuItem,
    FormControl, InputLabel, Select, Checkbox,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    List, ListItem, ListItemIcon, ListItemText,
    ThemeProvider, createTheme,
    RadioGroup, FormControlLabel, Radio, ListItemSecondaryAction
} from '@mui/material';


import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CalculateIcon from '@mui/icons-material/Calculate';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { CAPABILITIES } from '../utils/capabilities';

// Icons
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import VerifiedIcon from '@mui/icons-material/Verified';
import WarningIcon from '@mui/icons-material/Warning';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DescriptionIcon from '@mui/icons-material/Description';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BugReportIcon from '@mui/icons-material/BugReport';
import TimerIcon from '@mui/icons-material/Timer';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';

import { useAuth } from '../context/AuthContext';
import AddressPanel from '../components/AddressPanel';
import ParcelCard from '../components/shipment/ParcelCard';
import DangerousGoodsPanel from '../components/shipment/DangerousGoodsPanel';
import { generateWaybillPDF } from '../utils/pdfGenerator';
import { formatPartyAddress } from '../utils/addressFormatter';
import ShipmentSetup from '../components/shipment/ShipmentSetup';
import ShipmentContent from '../components/shipment/ShipmentContent';
import ShipmentBilling from '../components/shipment/ShipmentBilling';
import api, { financeService, shipmentService } from '../services/api';


// --- Custom Dark Theme Local Override ---
const darkFormTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#00d9b8' },
        background: { paper: '#141929', default: '#0a0e1a' },
        text: { primary: '#e2e8f0', secondary: '#94a3b8' }
    },
    components: {
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        backgroundColor: '#1a2035',
                        '& fieldset': { borderColor: '#2a3347' },
                        '&:hover fieldset': { borderColor: '#00d9b8' },
                        '&.Mui-focused fieldset': { borderColor: '#00d9b8' }
                    }
                }
            }
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundColor: '#141929',
                    borderColor: '#2a3347',
                    backgroundImage: 'none'
                }
            }
        },
        MuiSelect: {
            styleOverrides: {
                root: {
                    backgroundColor: '#1a2035',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2a3347' }
                }
            }
        }
    }
});


const VOLUME_FACTOR = 5000;
const BASE_STEPS = ['Setup', 'Content', 'Billing', 'Review', 'Success'];
const IS_DEV = process.env.NODE_ENV === 'development' || process.env.REACT_APP_VITE_DEV_TOOLS === 'true';
const HS_CODE_REGEX = /^\d{4}(\.\d{2}(\.\d{2})?)?$/;
const ISO_COUNTRY_REGEX = /^[A-Z]{2}$/;
const FIELD_LIMITS = {
    invoiceRemarks: 120,
    packageMarks: 70,
    properShippingName: 70,
    dgMarksInstructions: 200
};

const CARRIER_PROFILES = {
    DGR: {
        requiresShipperReference: true,
        requiresReceiverReference: true,
        supportsDangerousGoods: true,
        requiredFields: {
            sender: ['company', 'contactPerson', 'phone', 'email', 'streetLines', 'city', 'countryCode', 'postalCode', 'reference'],
            receiver: ['contactPerson', 'phone', 'streetLines', 'city', 'countryCode', 'postalCode', 'reference']
        },
        packagingOptions: [
            { value: 'user', label: 'My Own Packaging' },
            { value: 'CP', label: 'Custom Packaging' },
            { value: 'EE', label: 'DGR Express Envelope' },
            { value: 'OD', label: 'Other DGR Packaging' }
        ]
    },
    DHL: {
        requiresShipperReference: true,
        requiresReceiverReference: true,
        supportsDangerousGoods: true,
        requiredFields: {
            sender: ['contactPerson', 'phone', 'streetLines', 'city', 'countryCode', 'postalCode'],
            receiver: ['contactPerson', 'phone', 'streetLines', 'city', 'countryCode', 'postalCode']
        },
        packagingOptions: [
            { value: 'user', label: 'My Own Packaging' },
            { value: 'CP', label: 'Custom Packaging' },
            { value: 'EE', label: 'DGR Express Envelope' },
            { value: 'OD', label: 'Other DGR Packaging' }
        ]
    },
    FEDEX: {
        requiresShipperReference: false,
        requiresReceiverReference: false,
        supportsDangerousGoods: false,
        requiredFields: {
            sender: ['contactPerson', 'phone', 'streetLines', 'city', 'countryCode', 'postalCode'],
            receiver: ['contactPerson', 'phone', 'streetLines', 'city', 'countryCode', 'postalCode']
        },
        packagingOptions: [
            { value: 'user', label: 'My Own Packaging' }
        ]
    },
    UPS: {
        requiresShipperReference: false,
        requiresReceiverReference: false,
        supportsDangerousGoods: false,
        requiredFields: {
            sender: ['contactPerson', 'phone', 'streetLines', 'city', 'countryCode', 'postalCode'],
            receiver: ['contactPerson', 'phone', 'streetLines', 'city', 'countryCode', 'postalCode']
        },
        packagingOptions: [
            { value: 'user', label: 'My Own Packaging' }
        ]
    }
};

// --- Integrated Autofill Scenarios ---
// --- Integrated Autofill Scenarios ---
const AUTOFILL_SCENARIOS = {
    'DHL DGR': {
        'Standard': {
            'Full Business Shipment (DAP)': {
                sender: {
                    company: 'Target Logistics Hub KW', contactPerson: 'Ahmed Al-Sabah', phone: '90001234', phoneCountryCode: '+965', email: 'shipments@target-kw.com',
                    streetLines: ['Street 20, Plot 5'],
                    buildingName: 'Logistics Center', unitNumber: 'Dock 4',
                    area: 'Shuwaikh Industrial', city: 'KUWAIT', state: 'Asimah', countryCode: 'KW', postalCode: '70050',
                    vatNumber: 'KW-VAT-12345', eoriNumber: 'KW-EORI-98765', taxId: 'KW-TAX-112233', traderType: 'business', reference: 'REF-KW-001'
                },
                receiver: {
                    company: 'Global Retailers Inc', contactPerson: 'Sarah Jenkins', phone: '2025550123', phoneCountryCode: '+1', email: 'receiving@global-retail.com',
                    streetLines: ['123 Commerce Blvd'],
                    buildingName: 'Trade Tower', unitNumber: 'Suite 2104', landmark: 'Opposite Central Park',
                    area: 'Manhattan', city: 'New York', state: 'NY', countryCode: 'US', postalCode: '10001',
                    vatNumber: 'US-VAT-554433', eoriNumber: 'US-EORI-223344', taxId: 'EIN-99887766', traderType: 'business', reference: 'PO-998877'
                },
                parcels: [
                    { description: 'Precision Tools', weight: 14.2, length: 50, width: 40, height: 30, quantity: 1, declaredValue: 2450, hsCode: '8207.50.30', countryOfOrigin: 'US' }
                ],
                incoterm: 'DAP',
                invoiceRemarks: 'Test Shipment - Please Deliver Urgently'
            }
        },
        'DG': {
            'Dry Ice (UN1845)': {
                sender: {
                    company: 'ColdChain KW', contactPerson: 'Sara K', phone: '90005555', phoneCountryCode: '+965', email: 'cold@test.kw',
                    streetLines: ['Block 5, Street 12'],
                    city: 'KUWAIT', countryCode: 'KW', postalCode: '70051',
                    buildingName: 'Frozen Logistics', unitNumber: 'Dock 1', area: 'Sulaibiya',
                    vatNumber: 'KW-COLD-123', taxId: 'KW-TAX-456', reference: 'ICE-999', traderType: 'business'
                },
                receiver: {
                    company: 'Lab DE', contactPerson: 'Max M', phone: '4930000000', phoneCountryCode: '+49', email: 'lab@test.de',
                    streetLines: ['Invalidenstr 1'],
                    city: 'Berlin', countryCode: 'DE', postalCode: '10115',
                    buildingName: 'Medical Center', unitNumber: 'Level 4', area: 'Mitte',
                    vatNumber: 'DE-VAT-789', taxId: 'DE-TAX-012', reference: 'LAB-REQ-88', traderType: 'business'
                },
                parcels: [{ description: 'Insulated box', weight: 3, length: 30, width: 25, height: 20, quantity: 1, declaredValue: 120, hsCode: '3822.90.00', countryOfOrigin: 'KW' }],
                incoterm: 'DAP',
                invoiceRemarks: 'Dry ice shipment test',
                dangerousGoods: {
                    contains: true,
                    code: '1845',
                    serviceCode: 'HC',
                    contentId: '901',
                    dryIceWeight: 1.0,
                    customDescription: 'DRY ICE, 1.0 KG',
                    properShippingName: 'Dry Ice'
                }
            },
            'Lithium Batteries (PI Section II)': {
                sender: {
                    company: 'KWT Tech', contactPerson: 'Ali A', phone: '90000001', phoneCountryCode: '+965', email: 'tech@test.kw',
                    streetLines: ['Tech Park, Building 2'],
                    city: 'KUWAIT', countryCode: 'KW', postalCode: '70051',
                    area: 'Ardiya', vatNumber: 'VAT-TECH-1', eoriNumber: 'EORI-TECH-1', taxId: 'TAX-TECH-1', reference: 'BAT-001', traderType: 'business'
                },
                receiver: {
                    company: 'Receiver Ltd', contactPerson: 'John J', phone: '44200000', phoneCountryCode: '+44', email: 'recv@test.gb',
                    streetLines: ['10 Downing St'],
                    city: 'London', countryCode: 'GB', postalCode: 'SW1A 1AA',
                    area: 'Westminster', vatNumber: 'UK-VAT-99', eoriNumber: 'GB-EORI-99', taxId: 'UK-TAX-99', reference: 'ORDER-LI', traderType: 'business'
                },
                parcels: [{ description: 'Electronics box', weight: 2, length: 25, width: 20, height: 10, quantity: 1, declaredValue: 300, hsCode: '8526.91.00', countryOfOrigin: 'CN' }],
                incoterm: 'DAP',
                invoiceRemarks: 'Lithium PI Section II test',
                dangerousGoods: {
                    contains: true,
                    code: '3481',
                    serviceCode: 'HV',
                    contentId: '967',
                    customDescription: 'LITHIUM ION BATTERIES CONTAINED IN EQUIPMENT',
                    properShippingName: 'Lithium Ion Batteries'
                }
            },
            'Consumer Commodity (ID8000)': {
                sender: {
                    company: 'Retail KW', contactPerson: 'Mona M', phone: '90000002', phoneCountryCode: '+965', email: 'retail@test.kw',
                    streetLines: ['Retail Hub, Gate 3'],
                    city: 'KUWAIT', countryCode: 'KW', postalCode: '70051',
                    buildingName: 'Mall of Kuwait', area: 'Fahaheel',
                    vatNumber: 'KW-VAT-888', eoriNumber: 'KW-EORI-888', taxId: 'KW-TAX-888', reference: 'RETAIL-001', traderType: 'business'
                },
                receiver: {
                    company: 'AU Shop', contactPerson: 'Sam S', phone: '61200000', phoneCountryCode: '+61', email: 'au@test.au',
                    streetLines: ['1 George St'],
                    city: 'Sydney', countryCode: 'AU', postalCode: '2000',
                    buildingName: 'Sydney Trade Center', area: 'CBD',
                    vatNumber: 'AU-VAT-111', eoriNumber: 'AU-EORI-111', taxId: 'AU-TAX-111', reference: 'REF-AU-123', traderType: 'business'
                },
                parcels: [{ description: 'Small box', weight: 1, length: 20, width: 15, height: 10, quantity: 1, declaredValue: 80, hsCode: '3307.90.00', countryOfOrigin: 'KW' }],
                incoterm: 'DAP',
                invoiceRemarks: 'Consumer commodity test',
                dangerousGoods: {
                    contains: true,
                    code: '8000', // ID8000
                    serviceCode: 'HK',
                    contentId: '700',
                    customDescription: 'CONSUMER COMMODITY',
                    properShippingName: 'Consumer Commodity'
                },
                payerOfVat: 'shipper',
                palletCount: 1,
                packageMarks: 'Handle with Care'
            },
            'Perfumes (UN1266) - Passenger': {
                sender: {
                    company: 'Kuwait Fragrance', contactPerson: 'Ahmed F', phone: '90000005', phoneCountryCode: '+965', email: 'factory@test.kw',
                    city: 'KUWAIT', countryCode: 'KW', postalCode: '70051',
                    streetLines: ['Sanam Industrial Area'],
                    buildingName: 'Fragrance Factory', area: 'Industrial 1',
                    vatNumber: '0258', eoriNumber: '753', taxId: 'TAX123', reference: 'SHIP-456', traderType: 'business'
                },
                receiver: {
                    company: 'Beauty Boutique', contactPerson: 'Claire', phone: '33100000', phoneCountryCode: '+33', email: 'claire@boutique.fr',
                    city: 'Paris', countryCode: 'FR', postalCode: '75001',
                    streetLines: ['12 Rue de la Paix'],
                    buildingName: 'Boutique House', area: '1st Arr',
                    vatNumber: '8520', eoriNumber: 'EORI753', taxId: 'RECV-TAX-999', reference: 'RECV-654', traderType: 'business'
                },
                parcels: [{ description: 'Perfume boxes', weight: 5, length: 40, width: 30, height: 20, quantity: 1, declaredValue: 500, hsCode: '3303.00.00', countryOfOrigin: 'KW' }],
                incoterm: 'DAP',
                invoiceRemarks: 'Perfumery products for retail',
                dangerousGoods: {
                    contains: true,
                    code: '1266',
                    serviceCode: 'HE',
                    contentId: '910',
                    properShippingName: 'PERFUMERY PRODUCTS',
                    hazardClass: '3',
                    packingGroup: 'II'
                }
            },
            'Perfumes (UN1266) - Cargo': {
                sender: {
                    company: 'Kuwait Fragrance', contactPerson: 'Ahmed F', phone: '90000005', phoneCountryCode: '+965', email: 'factory@test.kw',
                    city: 'KUWAIT', countryCode: 'KW', postalCode: '70051',
                    streetLines: ['Sanam Industrial Area'],
                    buildingName: 'Fragrance Factory', area: 'Industrial 1',
                    vatNumber: '0258', eoriNumber: '753', taxId: 'TAX123', reference: 'SHIP-CARGO', traderType: 'business'
                },
                receiver: {
                    company: 'Luxury Scents', contactPerson: 'Marco', phone: '39060000', phoneCountryCode: '+39', email: 'marco@luxury.it',
                    city: 'Milan', countryCode: 'IT', postalCode: '20121',
                    streetLines: ['Via Montenapoleone 1'],
                    buildingName: 'Luxury Plaza', area: 'Milan Center',
                    vatNumber: 'IT-VAT-555', eoriNumber: 'IT-EORI-555', taxId: 'IT-TAX-555', reference: 'RECV-CARGO', traderType: 'business'
                },
                parcels: [{ description: 'Large perfume shipment', weight: 15, length: 60, width: 40, height: 40, quantity: 1, declaredValue: 1500, hsCode: '3303.00.00', countryOfOrigin: 'KW' }],
                incoterm: 'DAP',
                invoiceRemarks: 'Cargo-only perfume shipment',
                dangerousGoods: {
                    contains: true,
                    code: '1266',
                    serviceCode: 'HE',
                    contentId: '911',
                    properShippingName: 'PERFUMERY PRODUCTS',
                    hazardClass: '3',
                    packingGroup: 'II'
                }
            },
            'Excepted Quantities (E01)': {
                sender: {
                    company: 'Test Labs KW', contactPerson: 'Testing Lab', phone: '90000003', phoneCountryCode: '+965', email: 'lab@test.kw',
                    city: 'KUWAIT', countryCode: 'KW', postalCode: '70051',
                    streetLines: ['Block 1, Street 1'], buildingName: 'Research Wing', area: 'Shuwaikh',
                    vatNumber: 'KW-LAB-1', eoriNumber: 'KW-LAB-EORI', taxId: 'KW-TAX-LAB', reference: 'EXP-001', traderType: 'business'
                },
                receiver: {
                    company: 'US University', contactPerson: 'Dean of Science', phone: '121200000', phoneCountryCode: '+1', email: 'dean@univ.us',
                    city: 'New York', countryCode: 'US', postalCode: '10001',
                    streetLines: ['5th Ave'], buildingName: 'Science Hall', area: 'Manhattan',
                    vatNumber: 'US-EDU-99', eoriNumber: 'US-EORI-EDU', taxId: 'US-TAX-EDU', reference: 'GRANT-777', traderType: 'business'
                },
                parcels: [{ description: 'Lab Samples', weight: 1, length: 20, width: 15, height: 10, quantity: 1, declaredValue: 60, hsCode: '3822.00.00', countryOfOrigin: 'KW' }],
                incoterm: 'DAP',
                invoiceRemarks: 'Excepted quantities E01 test',
                dangerousGoods: {
                    contains: true,
                    code: '0000',
                    serviceCode: 'HH',
                    contentId: 'E01',
                    customDescription: 'EXCEPTED QUANTITIES',
                    properShippingName: 'Excepted Quantities'
                }
            }
        }
    }
};

const WizardHeader = ({ activeStep, totalSteps, estimatedTime, onDevMenuClick, isStaff, isAdmin, title, steps }) => (
    <Box
        position="sticky"
        top="70px"
        zIndex={500}
        bgcolor="#0a0e1a"
        borderBottom="1px solid #2a3347"
        py={3}
        px={3}
        mx={-3}
        mb={4}
        boxShadow="0 4px 20px rgba(0,0,0,0.4)"
    >
        <Container maxWidth="lg">
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Box>
                    <Typography variant="h5" fontWeight="800" sx={{ fontFamily: 'Outfit', color: '#fff', letterSpacing: '-0.5px' }}>
                        {title || 'Create New Shipment'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {steps[activeStep]} <Box component="span" sx={{ opacity: 0.5, mx: 1 }}>|</Box> Step {activeStep + 1} of {totalSteps}
                    </Typography>
                </Box>


                {/* Right Side: Timer & Dev Tools */}
                <Box display="flex" alignItems="center" gap={2}>
                    <Chip
                        icon={<TimerIcon fontSize="small" style={{ color: '#00d9b8' }} />}
                        label={`Est: ${estimatedTime}`}
                        size="small"
                        sx={{
                            bgcolor: 'rgba(0, 217, 184, 0.1)',
                            color: 'primary.main',
                            fontWeight: 600,
                            border: '1px solid rgba(0, 217, 184, 0.2)'
                        }}
                    />

                    {/* DEV TOOLS BUTTON */}
                    {(IS_DEV || isStaff || isAdmin) && (
                        <Tooltip title="Dev Tools: Autofill Scenarios">
                            <IconButton onClick={onDevMenuClick} size="small" sx={{ border: '1px dashed #00d9b8', color: '#00d9b8' }}>
                                <BugReportIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
            </Box>

            {/* Progress Bar */}
            <Box sx={{ position: 'relative', height: 6, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                <Box sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${((activeStep + 1) / totalSteps) * 100}%`,
                    bgcolor: 'primary.main',
                    borderRadius: 4,
                    transition: 'width 0.5s ease',
                    boxShadow: '0 0 10px #00d9b8'
                }} />
            </Box>
        </Container >
    </Box >
);

const DataRow = ({ label, value, required, isMandatory }) => {
    const isMissing = !value || (typeof value === 'string' && value.trim() === '');
    const isError = isMissing && (required || isMandatory);

    return (
        <Box display="flex" justifyContent="space-between" py={1.5} borderBottom="1px solid rgba(255,255,255,0.05)">
            <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="body2" color="text.secondary">{label}:</Typography>
                {isMandatory && (
                    <Tooltip title="Required for this Carrier/Service">
                        <ErrorOutlineIcon sx={{ fontSize: 14, color: isMissing ? '#ef4444' : '#f59e0b' }} />
                    </Tooltip>
                )}
            </Box>
            <Typography
                variant="body2"
                fontWeight={value ? 600 : 400}
                sx={{
                    color: isError ? '#ef4444' : (value ? '#e2e8f0' : 'text.disabled'),
                    bgcolor: isError ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                    px: isError ? 1 : 0,
                    borderRadius: 1,
                    maxWidth: '60%',
                    textAlign: 'right'
                }}
            >
                {value || '—'}
            </Typography>
        </Box>
    );
};

// --- Main Wizard Component ---

const initialAddress = {
    company: '', contactPerson: '', phone: '', phoneCountryCode: '+965', email: '',
    formattedAddress: '', streetLines: [], city: '', state: '', area: '', postalCode: '', countryCode: 'KW',
    buildingName: '', unitNumber: '', landmark: '',
    vatNumber: '', eoriNumber: '', taxId: '', reference: '',
    validated: false
};

const ShipmentWizardV2 = () => {
    const navigate = useNavigate();
    const { trackingNumber: editTrackingNumber } = useParams();
    const isEditMode = Boolean(editTrackingNumber);
    const { enqueueSnackbar } = useSnackbar();
    const { isAuthenticated, user, isStaff, isAdmin, isAccountant, refreshUser, can } = useAuth();

    const [activeStep, setActiveStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [editLoaded, setEditLoaded] = useState(false);
    const [currentStatus, setCurrentStatus] = useState(''); // Store status for approval check
    const [financeSummary, setFinanceSummary] = useState(null);
    const [sender, setSender] = useState({ ...initialAddress });
    const [receiver, setReceiver] = useState({ ...initialAddress });
    const [parcels, setParcels] = useState([{ description: 'Box 1', weight: '', length: '', width: '', height: '', quantity: 1, trackingReference: '' }]);
    const [items, setItems] = useState([{ description: '', quantity: 1, declaredValue: '', currency: 'KWD', weight: '', hsCode: '', countryOfOrigin: '', sku: '' }]);
    // Step 1 Consolidated State
    const [pickupRequired, setPickupRequired] = useState(false);
    // Step 2 Content State
    const [dangerousGoods, setDangerousGoods] = useState({ contains: false, serviceCode: '', unNumber: '', properName: '', class: '', packingGroup: '' });
    const [packagingType, setPackagingType] = useState('user');
    // Step 3 Billing & Docs State
    const [exportReason, setExportReason] = useState('permanent');
    const [invoiceRemarks, setInvoiceRemarks] = useState('');
    const [incoterm, setIncoterm] = useState('DAP');
    const [gstPaid, setGstPaid] = useState(false);
    const [payerOfVat, setPayerOfVat] = useState('receiver');
    const [shipperAccount, setShipperAccount] = useState('');
    const [labelFormat, setLabelFormat] = useState('pdf');
    const [signatureName, setSignatureName] = useState('');
    const [signatureTitle, setSignatureTitle] = useState('');
    const [palletCount, setPalletCount] = useState('');
    const [packageMarks, setPackageMarks] = useState('');

    // Auto-fill Signature Name from Sender Contact
    useEffect(() => {
        if (sender.contactPerson && !signatureName) {
            setSignatureName(sender.contactPerson);
        }
    }, [sender.contactPerson, signatureName]);

    useEffect(() => {
        if (dangerousGoods.contains && !dangerousGoods.customDescription) {
            setDangerousGoods(prev => ({ ...prev, customDescription: 'DANGEROUS GOODS AS PER ASSOCIATED DGD' }));
        }
    }, [dangerousGoods.contains, dangerousGoods.customDescription]);

    useEffect(() => {
        const loadFinance = async () => {
            if (!user?.organization) return;
            try {
                const response = await financeService.getBalance();
                setFinanceSummary(response.data);
            } catch (error) {
                console.error('Failed to fetch finance summary:', error);
            }
        };

        loadFinance();
    }, [user?.organization]);

    const [expandedParcel, setExpandedParcel] = useState(0);

    const [selectedService, setSelectedService] = useState({ serviceName: 'DHL DGR Express Worldwide', serviceCode: 'P', totalPrice: '0.000', currency: 'KWD', deliveryDate: new Date() });
    const [availableOptionalServices, setAvailableOptionalServices] = useState([]);
    const [selectedOptionalServiceCodes, setSelectedOptionalServiceCodes] = useState([]);

    // Approval Step State
    const [bookingOptions, setBookingOptions] = useState([]);
    const [selectedBookingOption, setSelectedBookingOption] = useState(null);
    const [approvalLoading, setApprovalLoading] = useState(false);


    // Global Settings
    const [currency, setCurrency] = useState('KWD');
    const [shipmentType, setShipmentType] = useState('package');
    const [plannedDate, setPlannedDate] = useState(new Date().toISOString().split('T')[0]);

    const [errors, setErrors] = useState({});

    // Dev Tools Menu
    const [devMenuAnchor, setDevMenuAnchor] = useState(null);

    const handleDevMenuOpen = (event) => {
        setDevMenuAnchor(event.currentTarget);
    };

    const handleDevMenuClose = () => {
        setDevMenuAnchor(null);
    };

    // Staff/Admin Features
    // Staff/Admin Features (already destructured above)


    // Determine if Approval Step should be shown
    // Must be in edit mode, user must have approval/booking capability,
    // and shipment status must be one where booking is allowed.
    const showApprovalStep = useMemo(() => {
        if (!isEditMode) return false;
        const canApprove = can(CAPABILITIES.APPROVE_SHIPMENTS) || can(CAPABILITIES.BOOK_CARRIERS);
        const isBookableStatus = ['draft', 'created', 'updated', 'ready_for_pickup'].includes(currentStatus);
        return canApprove && isBookableStatus;
    }, [isEditMode, can, currentStatus]);

    const steps = useMemo(() => {
        const s = [...BASE_STEPS];
        if (showApprovalStep) {
            // Insert Approval before Success (Success is last)
            s.splice(s.length - 1, 0, 'Approval');
        }
        return s;
    }, [showApprovalStep]);

    const availableCredit = useMemo(() => {
        if (financeSummary?.availableCredit !== undefined && financeSummary?.availableCredit !== null) {
            return Number(financeSummary.availableCredit);
        }
        const balance = Number(user?.balance || 0);
        const creditLimit = Number(user?.creditLimit || user?.organization?.creditLimit || 0);
        return balance + creditLimit;
    }, [financeSummary, user]);
    const [selectedClient, setSelectedClient] = useState('');
    const [clients, setClients] = useState([]);
    const [availableCarriers, setAvailableCarriers] = useState([]);
    const [selectedCarrier, setSelectedCarrier] = useState('DGR');
    const selectedCarrierProfile = useMemo(() => (
        CARRIER_PROFILES[selectedCarrier] || CARRIER_PROFILES.DGR
    ), [selectedCarrier]);

    const handleCarrierChange = (carrierCode) => {
        setSelectedCarrier(carrierCode);
        // Reset service selection if carrier changes to prevent invalid service codes
        setSelectedService(prev => ({ ...prev, serviceCode: 'P' }));
        setAvailableOptionalServices([]);
        setSelectedOptionalServiceCodes([]);

        // DGR Logic: Auto-enable DG toggle
        if (carrierCode === 'DGR') {
            setDangerousGoods(prev => ({ ...prev, contains: true }));
            enqueueSnackbar('Dangerous Goods mode enabled for DGR', { variant: 'info' });
        }
    };

    // Fetch Carriers & Clients
    React.useEffect(() => {
        const fetchMetadata = async () => {
            try {
                const token = localStorage.getItem('token');

                // 1. Fetch Available Carriers
                const carrierRes = await shipmentService.getAvailableCarriers();
                if (carrierRes.success) {
                    setAvailableCarriers(carrierRes.data);
                }

                if (isStaff) {
                    const clientRes = await api.get('/users');
                    const filteredClients = clientRes.data.data.filter(c => ['client', 'org_agent'].includes(c.role));
                    setClients(filteredClients);
                } else if (user && !isStaff) {
                    // 3. Client: Auto-fill My Default Profile ONLY if not staff
                    const config = user.carrierConfig || {};
                    const defaultAddress = user.addresses?.find(a => a.isDefault) || {};

                    setSender(prev => ({
                        ...prev,
                        company: defaultAddress.company || user.company || user.organization?.name || prev.company,
                        contactPerson: defaultAddress.contactPerson || user.name,
                        email: defaultAddress.email || user.email,
                        phone: defaultAddress.phone || user.phone,
                        phoneCountryCode: defaultAddress.phoneCountryCode || prev.phoneCountryCode,
                        streetLines: defaultAddress.streetLines || prev.streetLines,
                        city: defaultAddress.city || prev.city,
                        state: defaultAddress.state || prev.state,
                        postalCode: defaultAddress.postalCode || prev.postalCode,
                        countryCode: defaultAddress.countryCode || prev.countryCode,
                        vatNumber: defaultAddress.vatNumber || config.vatNo || prev.vatNumber,
                        eoriNumber: defaultAddress.eoriNumber || config.eori || prev.eoriNumber,
                        taxId: defaultAddress.taxId || config.taxId || prev.taxId,
                        traderType: defaultAddress.traderType || config.traderType || 'business',
                        reference: defaultAddress.reference || config.defaultReference || prev.reference
                    }));
                }
            } catch (err) {
                console.error('Failed to fetch metadata', err);
            }
        };
        fetchMetadata();
    }, [isStaff, user, enqueueSnackbar]);

    // --- Load Existing Shipment for Edit Mode ---
    React.useEffect(() => {
        if (!isEditMode || !editTrackingNumber || editLoaded) return;
        const fetchShipment = async () => {
            try {
                setLoading(true);
                const response = await shipmentService.getShipment(editTrackingNumber);
                const shipment = response.data || response;
                if (shipment) {
                    if (shipment.origin) setSender(prev => ({ ...prev, ...shipment.origin }));
                    if (shipment.destination) setReceiver(prev => ({ ...prev, ...shipment.destination }));
                    // ... other fields ...
                    if (shipment.status) setCurrentStatus(shipment.status); // Capture status
                    if (shipment.parcels?.length) {
                        setParcels(shipment.parcels.map(p => ({
                            ...p,
                            length: p.dimensions?.length || p.length || '',
                            width: p.dimensions?.width || p.width || '',
                            height: p.dimensions?.height || p.height || ''
                        })));
                    }
                    if (shipment.items?.length) setItems(shipment.items);
                    if (shipment.dangerousGoods) setDangerousGoods(shipment.dangerousGoods);
                    if (shipment.serviceCode) setSelectedService(prev => ({ ...prev, serviceCode: shipment.serviceCode }));
                    if (shipment.carrierCode || shipment.carrier) setSelectedCarrier(shipment.carrierCode || shipment.carrier || 'DGR');
                    if (shipment.incoterm) setIncoterm(shipment.incoterm);
                    if (shipment.currency) setCurrency(shipment.currency);
                    if (shipment.remarks) setInvoiceRemarks(shipment.remarks);
                    if (shipment.packagingType) setPackagingType(shipment.packagingType);
                    if (shipment.exportReason) setExportReason(shipment.exportReason);
                    if (shipment.shipmentType) setShipmentType(shipment.shipmentType);
                    if (shipment.gstPaid !== undefined) setGstPaid(shipment.gstPaid);
                    if (shipment.payerOfVat) setPayerOfVat(shipment.payerOfVat);
                    if (shipment.packageMarks) setPackageMarks(shipment.packageMarks);
                    if (shipment.userId && isStaff) setSelectedClient(shipment.userId);
                    setEditLoaded(true);
                    enqueueSnackbar(`Editing shipment ${editTrackingNumber}`, { variant: 'info' });
                }
            } catch (err) {
                console.error('Failed to load shipment for editing:', err);
                enqueueSnackbar('Failed to load shipment data', { variant: 'error' });
            } finally {
                setLoading(false);
            }
        };
        fetchShipment();
    }, [isEditMode, editTrackingNumber, editLoaded, enqueueSnackbar]);

    // --- Auto-Save Draft Logic ---
    React.useEffect(() => {
        if (!user || isEditMode) return;
        const saveDraft = setTimeout(() => {
            const draftData = {
                sender, receiver, parcels, items, activeStep,
                pickupRequired, shipmentType, plannedDate,
                dangerousGoods, packagingType, exportReason,
                invoiceRemarks, incoterm, gstPaid, payerOfVat,
                shipperAccount, labelFormat, signatureName, signatureTitle,
                palletCount, packageMarks, selectedOptionalServiceCodes, selectedClient: isStaff ? selectedClient : undefined,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem(`shipment_draft_${user._id}`, JSON.stringify(draftData));
            // Optional: console.log('Draft saved');
        }, 1000); // Debounce 1s

        return () => clearTimeout(saveDraft);
    }, [
        user, sender, receiver, parcels, items, activeStep,
        pickupRequired, shipmentType, plannedDate,
        dangerousGoods, packagingType, exportReason,
        invoiceRemarks, incoterm, gstPaid, payerOfVat,
        shipperAccount, labelFormat, signatureName, signatureTitle,
        palletCount, packageMarks, selectedOptionalServiceCodes, selectedClient, isStaff
    ]);

    // Check for draft on mount
    React.useEffect(() => {
        if (!user) return;
        const savedDraft = localStorage.getItem(`shipment_draft_${user._id}`);
        if (savedDraft) {
            try {
                const parsed = JSON.parse(savedDraft);
                // Check if draft is recent (e.g., less than 7 days)
                const draftDate = new Date(parsed.updatedAt);
                const now = new Date();
                const isRecent = (now - draftDate) < 7 * 24 * 60 * 60 * 1000;

                if (isRecent) {
                    enqueueSnackbar('Unsaved draft found', {
                        variant: 'info',
                        persist: false, // Auto-hide
                        action: (key) => (
                            <React.Fragment>
                                <Button size="small" color="inherit" onClick={() => {
                                    loadDraft(parsed);
                                    // closeSnackbar(key); // Need closeSnackbar from hook
                                }}>
                                    Resume
                                </Button>
                                <Button size="small" color="inherit" onClick={() => {
                                    localStorage.removeItem(`shipment_draft_${user._id}`);
                                    // closeSnackbar(key);
                                }}>
                                    Discard
                                </Button>
                            </React.Fragment>
                        )
                    });
                }
            } catch (e) {
                console.error('Failed to parse draft', e);
            }
        }
    }, [user, enqueueSnackbar]);

    const loadDraft = (data) => {
        if (data.sender) setSender(data.sender);
        if (data.receiver) setReceiver(data.receiver);
        if (data.parcels) {
            setParcels(data.parcels.map(p => ({
                ...p,
                length: p.dimensions?.length || p.length || '',
                width: p.dimensions?.width || p.width || '',
                height: p.dimensions?.height || p.height || ''
            })));
        }
        if (data.items) setItems(data.items);
        if (data.activeStep !== undefined) setActiveStep(data.activeStep);
        if (data.pickupRequired !== undefined) setPickupRequired(data.pickupRequired);
        if (data.shipmentType) setShipmentType(data.shipmentType);
        if (data.plannedDate) setPlannedDate(data.plannedDate);
        if (data.dangerousGoods) setDangerousGoods(data.dangerousGoods);
        if (data.packagingType) setPackagingType(data.packagingType);
        if (data.exportReason) setExportReason(data.exportReason);
        if (data.invoiceRemarks) setInvoiceRemarks(data.invoiceRemarks);
        if (data.incoterm) setIncoterm(data.incoterm);
        if (data.gstPaid !== undefined) setGstPaid(data.gstPaid);
        if (data.payerOfVat) setPayerOfVat(data.payerOfVat);
        if (data.shipperAccount) setShipperAccount(data.shipperAccount);
        if (data.labelFormat) setLabelFormat(data.labelFormat);
        if (data.signatureName) setSignatureName(data.signatureName);
        if (data.signatureTitle) setSignatureTitle(data.signatureTitle);
        if (data.palletCount) setPalletCount(data.palletCount);
        if (data.packageMarks) setPackageMarks(data.packageMarks);
        if (data.selectedOptionalServiceCodes) setSelectedOptionalServiceCodes(data.selectedOptionalServiceCodes);
        if (data.selectedClient && isStaff) setSelectedClient(data.selectedClient);

        enqueueSnackbar('Draft restored', { variant: 'success' });
    };

    // --- Dynamic Quote Fetching ---
    React.useEffect(() => {
        if (activeStep < 2) return undefined;

        const hasBasicAddress = (address) => Boolean(
            address?.city && address?.countryCode && address?.postalCode
        );
        const hasParcelData = Array.isArray(parcels) && parcels.length > 0;

        if (!hasBasicAddress(sender) || !hasBasicAddress(receiver) || !hasParcelData) {
            return undefined;
        }

        // Debounce quote requests so typing does not trigger API calls on every keystroke.
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const payload = {
                    sender, receiver, parcels, items,
                    carrierCode: selectedCarrier,
                    userId: selectedClient || user?._id, // Use selected client ID for markup!
                    shipmentType,
                    shipperAccount // Added to improve account-specific quoting
                };
                const response = await shipmentService.getQuotes(payload);
                console.log('FE_QUOTE_RESPONSE:', response); // DEBUG

                if (response.success && response.data && response.data.length > 0) {
                    const quote = response.data.find(q => q.serviceCode === 'P') || response.data[0];

                    console.log(`[DEBUG] Selected Quote (${quote.serviceCode}):`, {
                        totalPrice: quote.totalPrice,
                        optionalServicesDefined: !!quote.optionalServices,
                        optionalServicesCount: quote.optionalServices?.length || 0
                    });

                    setSelectedService({
                        serviceName: quote.serviceName,
                        serviceCode: quote.serviceCode,
                        totalPrice: quote.totalPrice,
                        basePrice: quote.basePrice,
                        markupLabel: quote.markupLabel,
                        markupAmount: quote.markupAmount,
                        currency: quote.currency,
                        deliveryDate: quote.deliveryDate
                    });
                    setAvailableOptionalServices(quote.optionalServices || []);
                } else {
                    console.warn('[DEBUG] No quotes returned or success=false:', response);
                }

                // Fix: Do NOT reset selected services here, or we lose selections on re-quote
                // setSelectedOptionalServiceCodes([]); 
            }
            } catch (err) {
            console.error('Quote fetch error', err);
            enqueueSnackbar('Failed to calculate latest rates', { variant: 'warning' });
        } finally {
            setLoading(false);
        }
    }, 600);

    return () => clearTimeout(timer);
}, [activeStep, sender, receiver, parcels, items, selectedCarrier, selectedClient, user, enqueueSnackbar, shipperAccount, shipmentType]);


// Handle Client Selection (Autofill)
const handleClientChange = (clientId) => {
    setSelectedClient(clientId);
    const client = clients.find(c => c._id === clientId);
    if (client) {
        const config = client.carrierConfig || {};
        const defaultAddress = client.addresses?.find(a => a.isDefault) || {};

        // Priority: Default Address (Shipper Profile) -> Client Basic -> Config
        setSender(prev => ({
            ...prev,
            // Identity
            company: defaultAddress.company || client.company || client.organization?.name || prev.company,
            contactPerson: defaultAddress.contactPerson || client.name,
            email: defaultAddress.email || client.email,
            phone: defaultAddress.phone || client.phone,
            phoneCountryCode: defaultAddress.phoneCountryCode || prev.phoneCountryCode,

            // Address (only if default exists)
            streetLines: defaultAddress.streetLines || (defaultAddress.street ? [defaultAddress.street] : []) || prev.streetLines,
            buildingName: defaultAddress.buildingName || prev.buildingName,
            unitNumber: defaultAddress.unitNumber || prev.unitNumber,
            landmark: defaultAddress.landmark || prev.landmark,
            city: defaultAddress.city || prev.city,
            state: defaultAddress.state || prev.state,
            postalCode: defaultAddress.postalCode || prev.postalCode,
            countryCode: defaultAddress.countryCode || prev.countryCode,

            // Compliance
            vatNumber: defaultAddress.vatNumber || config.vatNo || prev.vatNumber,
            eoriNumber: defaultAddress.eoriNumber || config.eori || prev.eoriNumber,
            taxId: defaultAddress.taxId || config.taxId || prev.taxId,
            traderType: defaultAddress.traderType || config.traderType || 'business',
            reference: defaultAddress.reference || config.defaultReference || prev.reference
        }));

        enqueueSnackbar(`Autofilled details for ${client.name}`, { variant: 'info' });
    }
};

// --- Approval Logic ---
const handleFetchBookingOptions = async () => {
    setApprovalLoading(true);
    try {
        const options = await shipmentService.getBookingOptions(editTrackingNumber, selectedCarrier);
        if (options && options.length > 0) {
            setBookingOptions(options);
            // Auto-select the first option or the one matching current service code if possible
            const match = options.find(o => o.serviceCode === selectedService.serviceCode) || options[0];
            setSelectedBookingOption(match);
            setAvailableOptionalServices(match.optionalServices || []);
        } else {
            enqueueSnackbar('No booking options available for this shipment.', { variant: 'warning' });
        }
    } catch (error) {
        console.error('Failed to fetch booking options:', error);
        enqueueSnackbar('Failed to fetch booking options', { variant: 'error' });
    } finally {
        setApprovalLoading(false);
    }
};

// Trigger fetch when entering Approval step
useEffect(() => {
    // Approval step index is steps.length - 2 (since Success is last)
    // e.g. Setup(0), Content(1), Billing(2), Review(3), Approval(4), Success(5)
    const approvalIndex = steps.indexOf('Approval');
    if (activeStep === approvalIndex && showApprovalStep) {
        handleFetchBookingOptions();
    }
}, [activeStep, showApprovalStep, steps, editTrackingNumber, selectedCarrier]);


const handleApproveAndBook = async () => {
    if (!selectedBookingOption) return;
    setLoading(true);
    try {
        await shipmentService.bookShipment(editTrackingNumber, selectedCarrier, selectedOptionalServiceCodes);
        enqueueSnackbar('Shipment approved and booked successfully', { variant: 'success' });
        // Navigate to details page (or Success step?) - UX choice: Success step seems appropriate or direct redirect.
        // Let's redirect to details page as explicitly requested in plan for "manual verification point 4" logic
        // But wait, the wizard usually ends with Success step. Let's go to Success step.
        setActiveStep(steps.indexOf('Success'));
    } catch (error) {
        console.error('Booking failed:', error);
        enqueueSnackbar(error.message || 'Booking failed', { variant: 'error' });
    } finally {
        setLoading(false);
    }
};

// Totals Calculation
const totals = useMemo(() => {
    const parcelTotals = parcels.reduce((acc, p) => {
        const qty = Number(p.quantity) || 1;
        const volPerUnit = (p.length * p.width * p.height) / VOLUME_FACTOR;
        acc.pieces += qty;
        acc.actualWeight += Number(p.weight || 0) * qty;
        acc.volumetricWeight += volPerUnit * qty;
        return acc;
    }, { pieces: 0, actualWeight: 0, volumetricWeight: 0 });

    const itemTotals = items.reduce((acc, i) => {
        const qty = Number(i.quantity) || 1;
        acc.declaredValue += Number(i.declaredValue || 0) * qty;
        return acc;
    }, { declaredValue: 0 });

    return { ...parcelTotals, ...itemTotals };
}, [parcels, items]);

const billableWeight = Math.max(totals.actualWeight, totals.volumetricWeight);

const selectedOptionalServices = useMemo(() => {
    const selectedCodes = new Set(selectedOptionalServiceCodes);
    return availableOptionalServices.filter((service) => selectedCodes.has(service.serviceCode));
}, [availableOptionalServices, selectedOptionalServiceCodes]);

const optionalServicesTotal = useMemo(() => {
    return selectedOptionalServices.reduce((sum, service) => sum + Number(service.totalPrice || 0), 0);
}, [selectedOptionalServices]);

const estimatedShipmentCost = Number(selectedService.totalPrice || 0);
const estimatedShipmentTotal = Number((estimatedShipmentCost + optionalServicesTotal).toFixed(3));

const toggleOptionalService = (serviceCode) => {
    setSelectedOptionalServiceCodes((prev) => (
        prev.includes(serviceCode)
            ? prev.filter((code) => code !== serviceCode)
            : [...prev, serviceCode]
    ));
};

const loadScenario = (scenario, name) => {
    if (scenario) {
        setSender({
            ...initialAddress,
            ...scenario.sender,
            streetLines: scenario.sender.streetLines || [scenario.sender.street || '']
        });
        setReceiver({
            ...initialAddress,
            ...scenario.receiver,
            streetLines: scenario.receiver.streetLines || [scenario.receiver.street || '']
        });
        if (scenario.parcels) {
            setParcels(scenario.parcels);
            // Auto-generate items from parcels for consistency in Autofill
            setItems(scenario.parcels.map(p => ({
                description: p.description,
                quantity: p.quantity,
                weight: (p.weight / p.quantity) || 1, // Unit weight
                declaredValue: (p.declaredValue / p.quantity) || 1, // Unit value
                hsCode: p.hsCode || '',
                countryOfOrigin: p.countryOfOrigin || (scenario.sender && scenario.sender.countryCode) || 'KW',
                currency: 'KWD'
            })));
            setExpandedParcel(0);
        }
        if (scenario.dangerousGoods) {
            setDangerousGoods(scenario.dangerousGoods);
        } else {
            setDangerousGoods({ contains: false });
        }
        if (scenario.invoiceRemarks) {
            setInvoiceRemarks(scenario.invoiceRemarks);
        } else {
            setInvoiceRemarks('');
        }
        // Load new config fields
        if (scenario.gstPaid !== undefined) setGstPaid(scenario.gstPaid);
        if (scenario.payerOfVat) setPayerOfVat(scenario.payerOfVat);
        if (scenario.palletCount !== undefined) setPalletCount(scenario.palletCount);
        if (scenario.packageMarks) setPackageMarks(scenario.packageMarks);
        if (scenario.shipmentType) setShipmentType(scenario.shipmentType);
        if (scenario.incoterm) setIncoterm(scenario.incoterm);

        setDevMenuAnchor(null);
        enqueueSnackbar(`Loaded Scenario: ${name}`, { variant: 'success' });
    }
};

const renderDevMenu = () => (
    <Menu
        anchorEl={devMenuAnchor}
        open={Boolean(devMenuAnchor)}
        onClose={handleDevMenuClose}
        PaperProps={{
            style: {
                backgroundColor: '#1a2035',
                color: '#fff',
                border: '1px solid #2a3347',
                maxHeight: 400
            },
        }}
    >
        {Object.keys(AUTOFILL_SCENARIOS).map((carrier) => (
            <div key={carrier}>
                <MenuItem disabled sx={{ opacity: 1, fontWeight: 'bold', color: '#00d9b8', fontSize: '0.8rem', mt: 1 }}>
                    {carrier}
                </MenuItem>
                {Object.keys(AUTOFILL_SCENARIOS[carrier]).map((category) => (
                    <div key={category}>
                        <MenuItem disabled sx={{ opacity: 0.8, fontSize: '0.75rem', pl: 3, color: '#94a3b8' }}>
                            {category}
                        </MenuItem>
                        {Object.keys(AUTOFILL_SCENARIOS[carrier][category]).map((scenarioName) => (
                            <MenuItem
                                key={scenarioName}
                                onClick={() => loadScenario(AUTOFILL_SCENARIOS[carrier][category][scenarioName], scenarioName)}
                                sx={{ pl: 4, fontSize: '0.9rem' }}
                            >
                                {scenarioName}
                            </MenuItem>
                        ))}
                    </div>
                ))}
                <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
            </div>
        ))}
    </Menu>
);

const updateParcel = (index, field, val) => {
    const newParcels = [...parcels];
    newParcels[index][field] = val;
    setParcels(newParcels);
};

const removeParcel = (index) => {
    if (parcels.length > 1) {
        setParcels(parcels.filter((_, i) => i !== index));
    }
};

const handleNext = () => {
    if (!validateStep(activeStep)) return;
    setActiveStep((prev) => prev + 1);
    window.scrollTo(0, 0);
};

const handleBack = () => setActiveStep((prev) => prev - 1);

const validateStep = (step) => {
    const newErrors = {};
    let isValid = true;

    if (step === 0) {
        // Staff must select a client
        if (isStaff && !selectedClient) {
            newErrors.client = 'You must select a client to create a shipment on their behalf';
            isValid = false;
        }

        // Sender basic
        if (!sender.contactPerson) newErrors.senderContact = 'Contact Person required';
        if (!sender.phone) newErrors.senderPhone = 'Phone number required';
        if (!sender.email) newErrors.senderEmail = 'Email required';
        if (!sender.city) newErrors.senderCity = 'City required';
        if (!sender.countryCode) newErrors.senderCountry = 'Country required';
        if (!sender.postalCode) newErrors.senderPostal = 'Postal Code required';
        // if (!sender.streetLines?.[0] && !sender.formattedAddress) newErrors.senderStreet = 'Street address required';

        // Carrier-specific sender requirements
        if (selectedCarrierProfile.requiresShipperReference && !sender.reference) {
            newErrors.senderReference = `Shipper Reference required for ${selectedCarrier}`;
        }

        // Receiver basic
        if (!receiver.contactPerson) newErrors.receiverContact = 'Contact Person required';
        if (!receiver.phone) newErrors.receiverPhone = 'Phone number required';
        if (!receiver.email) newErrors.receiverEmail = 'Email required';
        if (!receiver.city) newErrors.receiverCity = 'City required';
        if (!receiver.countryCode) newErrors.receiverCountry = 'Country required';
        if (!receiver.postalCode) newErrors.receiverPostal = 'Postal Code required';
        // if (!receiver.streetLines?.[0] && !receiver.formattedAddress) newErrors.receiverStreet = 'Street address required';

        // Carrier-specific receiver requirements
        // if (!receiver.vatNumber) newErrors.receiverVat = 'Receiver VAT number required (DGR)';
        if (selectedCarrierProfile.requiresReceiverReference && !receiver.reference) {
            newErrors.receiverReference = `Receiver Reference required (${selectedCarrier})`;
        }
    }

    if (step === 1) {
        // 1. Validate Parcels
        if (parcels.length === 0) {
            enqueueSnackbar('At least one parcel is required', { variant: 'error' });
            return false;
        }
        parcels.forEach((p, i) => {
            if (!p.description) newErrors[`parcel${i}desc`] = 'Description required';
            if (!p.weight || p.weight <= 0) newErrors[`parcel${i}weight`] = 'Valid weight required';
            if (!p.length || p.length <= 0) newErrors[`parcel${i}length`] = 'L required';
            if (!p.width || p.width <= 0) newErrors[`parcel${i}width`] = 'W required';
            if (!p.height || p.height <= 0) newErrors[`parcel${i}height`] = 'H required';
        });

        // 2. Validate Items (only if Package)
        if (shipmentType !== 'documents') {
            if (items.length === 0) {
                enqueueSnackbar('At least one item is required for packages', { variant: 'error' });
                return false;
            }
            items.forEach((item, i) => {
                if (!item.description) newErrors[`item${i}desc`] = 'Description required';
                if (!item.quantity || item.quantity <= 0) newErrors[`item${i}qty`] = 'Qty required';
                if (!item.declaredValue || item.declaredValue <= 0) newErrors[`item${i}val`] = 'Value required';
                if (!item.weight || item.weight <= 0) newErrors[`item${i}wgt`] = 'Weight required';
                if (!item.hsCode) newErrors[`item${i}hs`] = 'HS Code required';
                if (!item.countryOfOrigin) newErrors[`item${i}origin`] = 'Origin required';
                if (item.hsCode && !HS_CODE_REGEX.test(item.hsCode)) newErrors[`item${i}hs`] = 'HS code format invalid';
                if (item.countryOfOrigin && !ISO_COUNTRY_REGEX.test(String(item.countryOfOrigin).toUpperCase())) newErrors[`item${i}origin`] = 'Origin must be ISO-2 code (e.g. KW)';
            });

            if (selectedCarrierProfile.supportsDangerousGoods && dangerousGoods.contains) {
                if ((dangerousGoods.properShippingName || '').length > FIELD_LIMITS.properShippingName) {
                    newErrors.dgProperName = `DG proper shipping name max ${FIELD_LIMITS.properShippingName} chars`;
                }
                if ((dangerousGoods.customDescription || '').length > FIELD_LIMITS.dgMarksInstructions) {
                    newErrors.dgMarks = `DG marks/instructions max ${FIELD_LIMITS.dgMarksInstructions} chars`;
                }
            }

            // Validate Currency Consistency
            const currencies = new Set(items.map(i => i.currency || 'USD'));
            if (currencies.size > 1) {
                newErrors['currencyConsistency'] = `All items must have the same currency. Found: ${Array.from(currencies).join(', ')}`;
                enqueueSnackbar('All items must have the same currency.', { variant: 'error' });
                isValid = false;
            }
        }
    }

    if (step === 2) {
        // Billing & Docs Validation
        if (!incoterm) newErrors.incoterm = 'Incoterm required';

        // Export Reason is mandatory for Goods (Package), optional for Documents
        if (shipmentType !== 'documents' && !exportReason) {
            newErrors.exportReason = 'Reason for Export required for Goods';
        }

        if ((invoiceRemarks || '').length > FIELD_LIMITS.invoiceRemarks) newErrors.invoiceRemarks = `Invoice remarks max ${FIELD_LIMITS.invoiceRemarks} chars`;
        if ((packageMarks || '').length > FIELD_LIMITS.packageMarks) newErrors.packageMarks = `Package marks max ${FIELD_LIMITS.packageMarks} chars`;
    }

    if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        const firstError = Object.values(newErrors)[0];
        enqueueSnackbar(`Missing Information: ${firstError}`, { variant: 'error' });
        isValid = false;
    } else {
        setErrors({});
    }

    return isValid;
};

const [createdShipment, setCreatedShipment] = useState(null);

const handleSubmit = async () => {
    setLoading(true);
    try {
        const payload = {
            parcels: parcels.map(p => ({
                ...p,
                dimensions: {
                    length: Number(p.length) || 10,
                    width: Number(p.width) || 10,
                    height: Number(p.height) || 10
                },
                weight: Number(p.weight)
            })),
            items: items.map(i => ({
                ...i,
                quantity: Number(i.quantity),
                declaredValue: Number(i.declaredValue),
                weight: Number(i.weight),
                currency: i.currency || currency // Fallback to global currency if missing
            })),
            serviceCode: selectedService.serviceCode,
            carrierCode: selectedCarrier,
            status: 'ready_for_pickup',
            skipCarrierCreation: true,
            price: estimatedShipmentTotal,
            costPrice: selectedService.rawPrice, // Pass raw cost if available (Admin/Staff)
            optionalServices: selectedOptionalServices,
            optionalServicesTotal,
            estimatedShipmentCost,
            currency: currency, // Dynamic currency
            incoterm: incoterm, // Dynamic incoterm
            dangerousGoods: dangerousGoods, // Dynamic DG
            totals,
            customer: {
                name: sender.contactPerson,
                email: sender.email,
                phone: sender.phone,
                vatNo: sender.vatNumber,
                eori: sender.eoriNumber,
                taxId: sender.taxId,
                traderType: sender.traderType
            },
            shipmentType,
            plannedDate,
            packagingType,
            exportReason,
            remarks: invoiceRemarks,
            // Assign to selected client if staff, otherwise to self (client/org_agent)
            userId: isStaff ? selectedClient : (user._id),
            // Pass new fields
            gstPaid,
            payerOfVat,
            packageMarks,
            receiverReference: receiver.reference,
            shipperAccount, // Pass override account
            labelSettings: {
                format: labelFormat,
                signatureName,
                signatureTitle
            },
            // Explicitly pass Tax/EORI into objects to be sure
            sender: { ...sender, vatNumber: sender.vatNumber, eoriNumber: sender.eoriNumber, taxId: sender.taxId },
            receiver: { ...receiver, vatNumber: receiver.vatNumber, eoriNumber: receiver.eoriNumber, taxId: receiver.taxId }
        };

        let response;
        if (isEditMode) {
            response = await shipmentService.updateShipmentDetails(editTrackingNumber, payload);
        } else {
            response = await shipmentService.createShipment(payload);
        }

        if (response.success || response.data) {
            if (!isEditMode) setCreatedShipment(response.data);
            await refreshUser(); // Update balance in Header

            // If we are in edit mode, check if we need to show Approval next
            if (isEditMode && showApprovalStep) {
                // Go to Approval step
                setActiveStep(steps.indexOf('Approval'));
            } else if (isEditMode) {
                // No approval needed/allowed, just done.
                enqueueSnackbar(`Shipment ${editTrackingNumber} updated successfully`, { variant: 'success' });
                navigate(`/shipment/${editTrackingNumber}`);
            } else {
                // Create mode -> Success
                setActiveStep(steps.indexOf('Success'));
                // Clear draft (only in create mode)
                if (user) localStorage.removeItem(`shipment_draft_${user._id}`);
                enqueueSnackbar('Shipment created and scheduled for pickup', { variant: 'success' });
            }
        }
    } catch (error) {
        console.error('Submission Failed:', error);
        enqueueSnackbar(error.message || 'Submission Failed', { variant: 'error' });
    } finally {
        setLoading(false);
    }
};





const renderParcels = () => {
    return (
        <Box>
            <DangerousGoodsPanel
                dangerousGoods={dangerousGoods}
                setDangerousGoods={setDangerousGoods}
            />

            <Box mb={3}>
                <FormControl fullWidth>
                    <InputLabel>Packaging Type</InputLabel>
                    <Select value={packagingType} label="Packaging Type" onChange={(e) => setPackagingType(e.target.value)}>
                        <MenuItem value="user">My Own Packaging</MenuItem>
                        <MenuItem value="CP">Custom Packaging</MenuItem>
                        <MenuItem value="EE">DGR Express Envelope</MenuItem>
                        <MenuItem value="OD">Other DGR Packaging</MenuItem>
                    </Select>
                </FormControl>
            </Box>
            {
                parcels.map((parcel, index) => (
                    <ParcelCard
                        key={index}
                        parcel={parcel} index={index}
                        expanded={expandedParcel === index}
                        onToggle={() => setExpandedParcel(expandedParcel === index ? -1 : index)}
                        onChange={(field, val) => updateParcel(index, field, val)}
                        onRemove={() => removeParcel(index)}
                        errors={errors}
                    />
                ))
            }
            <Box mb={10}>
                <Button startIcon={<AddIcon />} onClick={() => setParcels([...parcels, { description: '', weight: '', length: '', width: '', height: '', quantity: 1, declaredValue: '' }])}>
                    Add Another Parcel
                </Button>
            </Box>

            {/* Sticky Summary Bar */}
            <Paper
                elevation={4}
                sx={{
                    position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                    bgcolor: 'grey.900', color: 'white', p: 2, borderRadius: 4, zIndex: 1200,
                    display: 'flex', gap: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)'
                }}
            >
                <Box textAlign="center"><Typography variant="caption" sx={{ opacity: 0.6 }}>PCS</Typography><Typography variant="body1" fontWeight="bold">{totals.pieces}</Typography></Box>
                <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />
                <Box textAlign="center"><Typography variant="caption" sx={{ opacity: 0.6 }}>ACTUAL</Typography><Typography variant="body1" fontWeight="bold">{totals.actualWeight.toFixed(2)}</Typography></Box>
                <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />
                <Box textAlign="center"><Typography variant="caption" sx={{ opacity: 0.6 }}>VOLUMETRIC</Typography><Typography variant="body1" fontWeight="bold">{totals.volumetricWeight.toFixed(2)}</Typography></Box>
                <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />
                <Box textAlign="center" sx={{ bgcolor: 'primary.main', px: 2, py: 0.5, borderRadius: 2 }}>
                    <Typography variant="caption" sx={{ opacity: 0.9 }}>BILLABLE</Typography>
                    <Typography variant="body1" fontWeight="bold">{billableWeight.toFixed(2)} KG</Typography>
                </Box>
            </Paper>
        </Box >
    );
};

const updateItem = (index, field, val) => {
    const newItems = [...items];
    newItems[index][field] = val;
    setItems(newItems);
};

const removeItem = (index) => {
    if (items.length > 1) {
        setItems(items.filter((_, i) => i !== index));
    }
};

const renderContent = () => (
    <ShipmentContent
        parcels={parcels} setParcels={setParcels}
        items={items} setItems={setItems}
        dangerousGoods={dangerousGoods} setDangerousGoods={setDangerousGoods}
        packagingType={packagingType} setPackagingType={setPackagingType}
        shipmentType={shipmentType}
        errors={errors}
        showDangerousGoods={selectedCarrierProfile.supportsDangerousGoods}
        packagingOptions={selectedCarrierProfile.packagingOptions}
    />
);
const renderBilling = () => (
    <ShipmentBilling
        exportReason={exportReason} setExportReason={setExportReason}
        invoiceRemarks={invoiceRemarks} setInvoiceRemarks={setInvoiceRemarks}
        incoterm={incoterm} setIncoterm={setIncoterm}
        gstPaid={gstPaid} setGstPaid={setGstPaid}
        payerOfVat={payerOfVat} setPayerOfVat={setPayerOfVat}
        shipperAccount={shipperAccount} setShipperAccount={setShipperAccount}
        labelFormat={labelFormat} setLabelFormat={setLabelFormat}
        signatureName={signatureName} setSignatureName={setSignatureName}
        signatureTitle={signatureTitle} setSignatureTitle={setSignatureTitle}
        palletCount={palletCount} setPalletCount={setPalletCount}
        packageMarks={packageMarks} setPackageMarks={setPackageMarks}
        availableOptionalServices={availableOptionalServices}
        selectedOptionalServiceCodes={selectedOptionalServiceCodes}
        onToggleOptionalService={toggleOptionalService}
        estimatedShipmentCost={estimatedShipmentCost}
        optionalServicesTotal={optionalServicesTotal}
        estimatedShipmentTotal={estimatedShipmentTotal}
        errors={errors}
    />
);



const renderReview = () => {
    const s = formatPartyAddress(sender);
    const r = formatPartyAddress(receiver);

    // Compliance Logic
    const missingFields = [];
    const rf = selectedCarrierProfile.requiredFields || { sender: [], receiver: [] };

    // Helper to check if a field is missing in the party object
    const isFieldMissing = (party, field) => {
        if (field === 'streetLines') return !(party.streetLines || []).filter(Boolean).length;
        return !party[field] || (typeof party[field] === 'string' && party[field].trim() === '');
    };

    // Check Sender
    rf.sender.forEach(field => {
        if (isFieldMissing(sender, field)) {
            const label = field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
            missingFields.push(`Shipper ${label}`);
        }
    });

    // Check Receiver
    rf.receiver.forEach(field => {
        if (isFieldMissing(receiver, field)) {
            const label = field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
            missingFields.push(`Consignee ${label}`);
        }
    });

    // Styles
    const SectionHeader = ({ icon, title, onEdit }) => (
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1} sx={{ color: 'primary.main' }}>
            <Box display="flex" alignItems="center" gap={1}>
                {icon}
                <Typography variant="h6" fontWeight="bold">{title}</Typography>
            </Box>
            {onEdit && (
                <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={onEdit}
                    sx={{ color: 'primary.main', textTransform: 'none', fontWeight: 600 }}
                >
                    Change
                </Button>
            )}
        </Box>
    );

    const AddressCard = ({ title, data, onEdit }) => (
        <Card variant="outlined" sx={{ height: '100%', bgcolor: 'background.paper', borderRadius: 2, position: 'relative' }}>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Typography variant="overline" color="text.secondary" fontWeight="bold">{title}</Typography>
                    {onEdit && (
                        <Tooltip title="Edit these details">
                            <IconButton size="small" onClick={onEdit} sx={{ color: 'text.secondary' }}>
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
                <Box mt={1}>
                    <Typography variant="subtitle1" fontWeight="bold">{data.company}</Typography>
                    <Typography variant="body2">{data.contact}</Typography>
                    <Divider sx={{ my: 1 }} />
                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        <DescriptionIcon fontSize="small" color="action" />
                        <Typography variant="body2">{data.building} {data.street}</Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        <VerifiedIcon fontSize="small" color="action" />
                        <Typography variant="body2">{data.city}, {data.state} {data.postalCode}</Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2" fontWeight="bold">{data.country}</Typography>
                    </Box>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="caption" display="block">Phone: {data.phone}</Typography>
                    <Typography variant="caption" display="block">Email: {data.email}</Typography>
                    <Typography variant="caption" display="block" color="primary">Ref: {data.reference}</Typography>
                </Box>
            </CardContent>
        </Card>
    );

    return (
        <Grid container spacing={4}>
            {/* Left: Detailed Review */}
            <Grid item xs={12} lg={8}>
                <Stack spacing={4}>

                    {/* 1. Route Details */}
                    <Box>
                        <SectionHeader
                            icon={<LocalShippingIcon />}
                            title="Route & Parties"
                        />
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <AddressCard title="SHIPPER (FROM)" data={s} />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <AddressCard title="CONSIGNEE (TO)" data={r} />
                            </Grid>
                        </Grid>
                    </Box>

                    <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.05)' }} />

                    {/* 2. Shipment Content */}
                    <Box>
                        <SectionHeader
                            icon={<DescriptionIcon />}
                            title="Content & Packages"
                        />
                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                            <CardContent>
                                <Grid container spacing={2} alignItems="center" mb={2}>
                                    <Grid item>
                                        <Chip icon={<DescriptionIcon />} label={`${totals.pieces} Pieces`} />
                                    </Grid>
                                    <Grid item>
                                        <Chip icon={<CalculateIcon />} label={`${totals.actualWeight.toFixed(2)} KG Actual`} />
                                    </Grid>
                                    <Grid item>
                                        <Chip icon={<WarningIcon />} label={`${totals.volumetricWeight.toFixed(2)} KG Volumetric`} variant="outlined" />
                                    </Grid>
                                    <Grid item xs />
                                    <Grid item>
                                        <Typography variant="h6" color="primary.main">
                                            {currency} {totals.declaredValue.toFixed(2)}
                                        </Typography>
                                        <Typography variant="caption" display="block" textAlign="right">Total Declared Value</Typography>
                                    </Grid>
                                </Grid>

                                <TableContainer component={Paper} elevation={0} variant="outlined">
                                    <Table size="small">
                                        <TableHead sx={{ bgcolor: 'action.hover' }}>
                                            <TableRow>
                                                <TableCell>Description</TableCell>
                                                <TableCell>Dimensions (cm)</TableCell>
                                                <TableCell width={100}>Weight</TableCell>
                                                <TableCell width={80}>Qty</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {parcels.map((p, i) => (
                                                <TableRow key={i}>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight="bold">Parcel {i + 1}</Typography>
                                                        <Typography variant="caption">{p.description}</Typography>
                                                    </TableCell>
                                                    <TableCell>{p.length} x {p.width} x {p.height}</TableCell>
                                                    <TableCell>{p.weight} kg</TableCell>
                                                    <TableCell>x{p.quantity}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </CardContent>
                        </Card>
                    </Box>
                </Stack>
            </Grid>

            {/* Right: Confirmation Sidebar */}
            <Grid item xs={12} lg={4}>
                <Stack spacing={2} position="sticky" top={100}>

                    {/* Admin/Staff: Client Info Header */}
                    {(isAdmin || isStaff) && selectedClient && (
                        <Paper sx={{ p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                            <Typography variant="overline" color="text.secondary" display="block" lineHeight={1}>SHIPMENT FOR</Typography>

                            {/* Organization (Big) */}
                            <Typography variant="h6" fontWeight="bold" sx={{ mt: 1, lineHeight: 1.2 }}>
                                {clients.find(c => c._id === selectedClient)?.organization?.name || 'No Organization'}
                            </Typography>

                            {/* Agent Name (Small) */}
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                {clients.find(c => c._id === selectedClient)?.name || 'Unknown Agent'}
                            </Typography>

                            <Divider sx={{ my: 1 }} />

                            {/* Carrier */}
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="caption" color="text.secondary">Carrier</Typography>
                                <Typography variant="caption" fontWeight="bold">
                                    {selectedCarrier === 'DHL' ? 'DHL Express' : selectedCarrier}
                                </Typography>
                            </Box>
                        </Paper>
                    )}

                    {/* Cost Summary Card */}
                    <Card sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2 }}>
                        <CardContent>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="overline" sx={{ opacity: 0.8 }}>ESTIMATED SHIPMENT TOTAL</Typography>
                            </Box>
                            <Box display="flex" alignItems="baseline" gap={1}>
                                <Typography variant="h3" fontWeight="bold">{estimatedShipmentTotal.toFixed(3)}</Typography>
                                <Typography variant="subtitle1">KD</Typography>
                            </Box>

                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)', my: 2 }} />

                            <Box display="flex" justifyContent="space-between" mb={0.5}>
                                <Typography variant="body2">Billable Weight</Typography>
                                <Typography variant="body2" fontWeight="bold">{billableWeight.toFixed(2)} KG</Typography>
                            </Box>

                            <Box display="flex" justifyContent="space-between" mb={1.5}>
                                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    Incoterm
                                    <IconButton size="small" onClick={() => setActiveStep(2)} sx={{ p: 0, color: 'inherit', opacity: 0.7 }}>
                                        <EditIcon sx={{ fontSize: 12 }} />
                                    </IconButton>
                                </Typography>
                                <Typography variant="body2" fontWeight="bold">{incoterm}</Typography>
                            </Box>

                            <Box display="flex" justifyContent="space-between" mb={0.5}>
                                <Typography variant="body2">Service</Typography>
                                <Typography variant="body2" fontWeight="bold" sx={{ maxWidth: '60%', textAlign: 'right' }}>
                                    {selectedService.serviceName}
                                </Typography>
                            </Box>

                            <Box display="flex" justifyContent="space-between" mb={0.5}>
                                <Typography variant="body2">Shipment Cost</Typography>
                                <Typography variant="body2" fontWeight="bold">{estimatedShipmentCost.toFixed(3)} KD</Typography>
                            </Box>
                            <Box display="flex" justifyContent="space-between" mb={1.5}>
                                <Typography variant="body2">Optional Services</Typography>
                                <Typography variant="body2" fontWeight="bold">{optionalServicesTotal.toFixed(3)} KD</Typography>
                            </Box>

                            {/* Admin Markup Analysis - Staff/Admin Only */}
                            {(isAdmin || isStaff || isAccountant) && selectedClient && (
                                <Box mt={2} pt={2} borderTop={1} borderColor="rgba(255,255,255,0.2)">
                                    <Typography variant="overline" sx={{ opacity: 0.8, display: 'block', mb: 1 }}>
                                        ADMIN MARKUP ANALYSIS
                                    </Typography>

                                    {/* Client Markup Config */}
                                    {(() => {
                                        const client = clients.find(c => c._id === selectedClient);
                                        // Backend Logic: User Markup > Organization Markup
                                        const markup = client?.markup || client?.organization?.markup;
                                        return markup ? (
                                            <Box display="flex" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption">Rule:</Typography>
                                                <Typography variant="caption" fontWeight="bold">
                                                    {markup.type} ({markup.value || markup.percentageValue || markup.flatValue || 0})
                                                </Typography>
                                            </Box>
                                        ) : (
                                            <Box display="flex" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption">Rule:</Typography>
                                                <Typography variant="caption" fontWeight="bold" color="warning.light">Not Configured (Default 15%)</Typography>
                                            </Box>
                                        );
                                    })()}

                                    {/* Standardized Markup Analysis */}
                                    {(() => {
                                        const client = clients.find(c => c._id === selectedClient);
                                        const config = client?.markup || client?.organization?.markup || { type: 'DEFAULT', value: 15 };

                                        const base = Number(selectedService.basePrice || 0);
                                        const addon = Number(selectedService.markupAmount || 0);

                                        // Formatting Helper
                                        const fmt = (n) => Number(n || 0).toFixed(3);

                                        return (
                                            <>
                                                <Box display="flex" justifyContent="space-between" mb={0.5} sx={{ opacity: 0.8 }}>
                                                    <Typography variant="caption">Calculation:</Typography>
                                                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                                        {config.type === 'FLAT' && `${fmt(base)} + (Flat ${config.value || config.flatValue})`}
                                                        {(config.type === 'PERCENTAGE' || config.type === 'DEFAULT') && `${fmt(base)} + (${fmt(base)} × ${config.value || config.percentageValue || 15}%)`}
                                                        {config.type === 'COMBINED' && `(${fmt(base)} × ${config.percentageValue}%) + ${config.flatValue}`}
                                                        {!['FLAT', 'PERCENTAGE', 'COMBINED', 'DEFAULT'].includes(config.type) && `${fmt(base)} + ${fmt(addon)}`}
                                                    </Typography>
                                                </Box>

                                                <Box display="flex" justifyContent="space-between" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.1)', px: 1, py: 0.5, borderRadius: 1, mt: 1 }}>
                                                    <Typography variant="caption" fontWeight="bold">Add-on:</Typography>
                                                    <Typography variant="caption" fontWeight="bold">{fmt(addon)} KD</Typography>
                                                </Box>
                                            </>
                                        );
                                    })()}
                                </Box>
                            )}


                            {availableOptionalServices.some(s => selectedOptionalServiceCodes.includes(s.serviceCode) && Number(s.totalPrice || 0) > 0) && (
                                <Box mb={1.5} mt={2}>
                                    <Typography variant="caption" sx={{ opacity: 0.85, display: 'block', mb: 0.5 }}>
                                        Selected Services (Paid)
                                    </Typography>
                                    <List dense disablePadding>
                                        {availableOptionalServices
                                            .filter(s => selectedOptionalServiceCodes.includes(s.serviceCode) && Number(s.totalPrice || 0) > 0)
                                            .map((service) => (
                                                <ListItem
                                                    key={service.serviceCode}
                                                    dense
                                                    disableGutters
                                                    sx={{ py: 0.3 }}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 28 }}>
                                                        <CheckCircleIcon sx={{ fontSize: 18, color: '#fff' }} />
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primaryTypographyProps={{ variant: 'caption', color: 'inherit' }}
                                                        secondaryTypographyProps={{ variant: 'caption', color: 'rgba(255,255,255,0.7)' }}
                                                        primary={service.serviceName}
                                                        secondary={`${Number(service.totalPrice).toFixed(3)} KD`}
                                                    />
                                                </ListItem>
                                            ))}
                                    </List>
                                </Box>
                            )}
                        </CardContent>
                    </Card>

                    {/* Compliance Card */}
                    <Card variant="outlined" sx={{
                        borderRadius: 2,
                        borderColor: missingFields.length > 0 ? 'error.main' : 'success.main',
                        borderWidth: 2
                    }}>
                        <CardContent>
                            <Typography variant="subtitle2" gutterBottom fontWeight="bold" color={missingFields.length > 0 ? 'error.main' : 'success.main'}>
                                {missingFields.length > 0 ? 'Action Required' : 'Ready to Book'}
                            </Typography>

                            <Stack spacing={1}>
                                {missingFields.length > 0 ? (
                                    missingFields.map((f, i) => (
                                        <Alert severity="error" icon={<ErrorOutlineIcon fontSize="inherit" />} key={i} sx={{ py: 0 }}>
                                            {f} Missing
                                        </Alert>
                                    ))
                                ) : (
                                    <Alert severity="success" icon={<CheckCircleIcon fontSize="inherit" />} sx={{ py: 0 }}>
                                        All Data Validated
                                    </Alert>
                                )}

                                <Divider sx={{ my: 1 }} />

                                <Box display="flex" justifyContent="space-between" alignItems="center">
                                    <AuditItem label="Address Valid" valid={sender.countryCode && receiver.countryCode} />
                                    <AuditItem label="Customs Data" valid={items.every(i => i.hsCode)} />
                                    <AuditItem label="DG Checked" valid={true} />
                                </Box>
                            </Stack>
                        </CardContent>
                    </Card>

                    <Alert severity="info" variant="outlined" sx={{ alignItems: 'center' }}>
                        <Typography variant="caption">
                            By finalizing, you confirm all details are correct. Changes may incur fees.
                        </Typography>
                    </Alert>

                    {/* Credit Balance Warning */}
                    {user && (
                        <Card variant="outlined" sx={{
                            borderRadius: 2,
                            bgcolor: availableCredit < estimatedShipmentTotal ? 'error.lighter' : 'success.lighter',
                            borderColor: availableCredit < estimatedShipmentTotal ? 'error.main' : 'success.main',
                            p: 1
                        }}>
                            <Box display="flex" alignItems="center" gap={1}>
                                <AccountBalanceWalletIcon color={availableCredit < estimatedShipmentTotal ? 'error' : 'success'} />
                                <Box>
                                    <Typography variant="caption" display="block" fontWeight="bold">
                                        Available Credit: {availableCredit.toFixed(3)} KD
                                    </Typography>
                                    {availableCredit < estimatedShipmentTotal && (
                                        <Typography variant="caption" color="error.main" fontWeight="bold">
                                            Insufficient balance. Please top up.
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        </Card>
                    )}
                </Stack>
            </Grid>
        </Grid>
    );
};

const renderApprovalStep = () => (
    <Box>
        <Typography variant="h6" gutterBottom sx={{ color: '#fff', mb: 3 }}>
            Approve & Book Shipment
        </Typography>

        {/* Context Info */}
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', mb: 3, p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Current Selection
            </Typography>
            <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                    <DataRow label="Carrier" value={selectedCarrier} />
                    <DataRow label="Service" value={selectedService.serviceName} />
                </Grid>
                <Grid item xs={12} md={6}>
                    <DataRow label="Total Value" value={`${totals.declaredValue} ${currency}`} />
                    <DataRow label="Est. Cost" value={`${estimatedShipmentTotal} ${currency}`} />
                </Grid>
            </Grid>
        </Card>

        <Typography variant="subtitle1" sx={{ color: '#00d9b8', mb: 2 }}>
            Select Booking Service
        </Typography>

        {approvalLoading ? (
            <Box display="flex" justifyContent="center" p={4}>
                <CircularProgress size={40} sx={{ color: '#00d9b8' }} />
            </Box>
        ) : (
            <RadioGroup
                value={selectedBookingOption?.serviceCode || ''}
                onChange={(e) => {
                    const service = bookingOptions.find(o => o.serviceCode === e.target.value);
                    setSelectedBookingOption(service);
                    setAvailableOptionalServices(service?.optionalServices || []);
                }}
            >
                <List disablePadding>
                    {bookingOptions.map((option) => {
                        const isSelected = selectedBookingOption?.serviceCode === option.serviceCode;
                        return (
                            <ListItem
                                key={option.serviceCode}
                                sx={{
                                    border: isSelected ? '1px solid #00d9b8' : '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 2,
                                    mb: 2,
                                    bgcolor: isSelected ? 'rgba(0, 217, 184, 0.05)' : 'transparent',
                                    transition: 'all 0.2s',
                                    cursor: 'pointer'
                                }}
                                onClick={() => setSelectedBookingOption(option)}
                            >
                                <FormControlLabel
                                    value={option.serviceCode}
                                    control={<Radio sx={{ color: isSelected ? '#00d9b8' : 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#00d9b8' } }} />}
                                    label=""
                                    sx={{ mr: 2, my: 0 }}
                                />
                                <ListItemText
                                    primary={
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Typography variant="subtitle1" fontWeight={600} color="#fff">
                                                {option.serviceName}
                                            </Typography>
                                            {isSelected && <Chip label="Selected" size="small" sx={{ bgcolor: '#00d9b8', color: '#000', fontWeight: 'bold', height: 20 }} />}
                                        </Box>
                                    }
                                    secondary={
                                        <Typography variant="body2" color="text.secondary">
                                            Delivery: {new Date(option.deliveryDate).toLocaleDateString()}
                                        </Typography>
                                    }
                                />
                                <ListItemSecondaryAction>
                                    <Typography variant="h6" color="#00d9b8" fontWeight="bold">
                                        {Number(option.totalPrice).toFixed(3)} {option.currency}
                                    </Typography>
                                </ListItemSecondaryAction>
                            </ListItem>
                        );
                    })}
                    {bookingOptions.length === 0 && !approvalLoading && (
                        <Typography variant="body2" color="text.secondary" align="center" py={4}>
                            No booking options found. Please check shipment details.
                        </Typography>
                    )}
                </List>
            </RadioGroup>
        )}

        <Box display="flex" justifyContent="flex-end" gap={2} mt={4}>
            <Button
                variant="outlined"
                onClick={handleBack}
                sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
            >
                Back
            </Button>
            <Button
                variant="contained"
                onClick={handleApproveAndBook}
                disabled={loading || approvalLoading || !selectedBookingOption}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <LocalShippingIcon />}
                sx={{
                    bgcolor: '#00d9b8',
                    color: '#000',
                    fontWeight: 'bold',
                    px: 4,
                    '&:hover': { bgcolor: '#00bfa3' }
                }}
            >
                {loading ? 'Processing...' : 'Approve & Book'}
            </Button>
        </Box>
    </Box>
);

const AuditItem = ({ label, valid }) => (
    <Tooltip title={valid ? "Passed" : "Failed"}>
        <Box display="flex" alignItems="center" gap={0.5} sx={{ opacity: valid ? 1 : 0.5 }}>
            {valid ? <CheckCircleIcon color="success" sx={{ fontSize: 16 }} /> : <ErrorOutlineIcon color="error" sx={{ fontSize: 16 }} />}
            <Typography variant="caption">{label}</Typography>
        </Box>
    </Tooltip>
);

if (activeStep === 4) {
    return (
        <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
            <Zoom in><CheckCircleIcon color="success" sx={{ fontSize: 80, mb: 2 }} /></Zoom>
            <Typography variant="h4" gutterBottom>Shipment Created!</Typography>
            <Typography variant="subtitle1" color="primary" fontWeight="bold" gutterBottom>
                Status: Ready For Pickup (Pending Approval)
            </Typography>
            <Typography color="text.secondary" paragraph>
                The internal record has been created. Please download the System Label for the driver.
                Carrier booking will occur after staff approval.
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center" mt={4}>
                <Button
                    variant="contained"
                    size="large"
                    onClick={() => generateWaybillPDF(createdShipment || { sender, receiver, parcels, totals, _id: 'PENDING' })}
                    startIcon={<DescriptionIcon />}
                >
                    Download System Label
                </Button>
                <Button variant="outlined" size="large" onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
            </Stack>
        </Container>
    );
}

return (
    <ThemeProvider theme={darkFormTheme}>
        <Box sx={{ minHeight: '100vh', bgcolor: '#0a0e1a', pb: 8 }}>
            <WizardHeader
                activeStep={activeStep}
                totalSteps={steps.length}
                estimatedTime="5-8 min"
                onDevMenuClick={handleDevMenuOpen}
                isStaff={isStaff}
                isAdmin={isAdmin}
                title={isEditMode ? `Edit Shipment — ${editTrackingNumber}` : 'Create New Shipment'}
                steps={steps}
            />

            {loading && !editLoaded && isEditMode && (
                <Box sx={{
                    position: 'fixed', top: 120, left: 0, right: 0, bottom: 0,
                    bgcolor: 'rgba(10, 14, 26, 0.8)', zIndex: 1000,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                }}>
                    <CircularProgress size={60} sx={{ color: '#00d9b8', mb: 2 }} />
                    <Typography variant="h6" color="#fff" sx={{ fontFamily: 'Outfit' }}>Loading Shipment Data...</Typography>
                </Box>
            )}

            {renderDevMenu()}

            <Container maxWidth="lg">
                <Fade in key={activeStep}>
                    <Box>
                        {activeStep === 0 && (
                            <Box>
                                <ShipmentSetup
                                    sender={sender} setSender={setSender}
                                    receiver={receiver} setReceiver={setReceiver}
                                    pickupRequired={pickupRequired} setPickupRequired={setPickupRequired}
                                    errors={errors}
                                    isStaff={isStaff} clients={clients}
                                    selectedClient={selectedClient} onClientChange={handleClientChange}
                                    isAdmin={isAdmin}
                                    availableCarriers={availableCarriers}
                                    selectedCarrier={selectedCarrier}
                                    onCarrierChange={handleCarrierChange}
                                    requiredFields={selectedCarrierProfile.requiredFields}
                                />
                            </Box>
                        )}
                        {activeStep === 1 && (
                            <Box>
                                <ShipmentContent
                                    parcels={parcels} setParcels={setParcels}
                                    items={items} setItems={setItems}
                                    shipmentType={shipmentType} setShipmentType={setShipmentType}
                                    updateParcel={updateParcel} removeParcel={removeParcel}
                                    expandedParcel={expandedParcel} setExpandedParcel={setExpandedParcel}
                                    dangerousGoods={dangerousGoods} setDangerousGoods={setDangerousGoods}
                                    addParcel={() => setParcels([...parcels, { description: '', weight: '', length: '', width: '', height: '', quantity: 1 }])}
                                    addItem={() => setItems([...items, { description: '', quantity: 1, declaredValue: '', weight: '' }])}
                                    removeItem={(i) => setItems(items.filter((_, idx) => idx !== i))}
                                    updateItem={(i, f, v) => { const n = [...items]; n[i][f] = v; setItems(n); }}
                                    errors={errors} packagingType={packagingType} setPackagingType={setPackagingType}
                                    showDangerousGoods={selectedCarrierProfile.supportsDangerousGoods}
                                    packagingOptions={selectedCarrierProfile.packagingOptions}
                                />
                            </Box>
                        )}
                        {activeStep === 2 && (
                            <Box>
                                <ShipmentBilling
                                    exportReason={exportReason} setExportReason={setExportReason}
                                    invoiceRemarks={invoiceRemarks} setInvoiceRemarks={setInvoiceRemarks}
                                    incoterm={incoterm} setIncoterm={setIncoterm}
                                    gstPaid={gstPaid} setGstPaid={setGstPaid}
                                    payerOfVat={payerOfVat} setPayerOfVat={setPayerOfVat}
                                    shipperAccount={shipperAccount} setShipperAccount={setShipperAccount}
                                    labelFormat={labelFormat} setLabelFormat={setLabelFormat}
                                    signatureName={signatureName} setSignatureName={setSignatureName}
                                    signatureTitle={signatureTitle} setSignatureTitle={setSignatureTitle}
                                    palletCount={palletCount} setPalletCount={setPalletCount}
                                    packageMarks={packageMarks} setPackageMarks={setPackageMarks}
                                    availableOptionalServices={availableOptionalServices}
                                    selectedOptionalServiceCodes={selectedOptionalServiceCodes}
                                    onToggleOptionalService={toggleOptionalService}
                                    estimatedShipmentCost={estimatedShipmentCost}
                                    optionalServicesTotal={optionalServicesTotal}
                                    estimatedShipmentTotal={estimatedShipmentTotal}
                                    errors={errors}
                                />
                            </Box>
                        )}
                        {activeStep === 3 && renderReview()}
                        {steps[activeStep] === 'Approval' && renderApprovalStep()}
                    </Box>
                </Fade>

                <Box display={steps[activeStep] === 'Approval' ? 'none' : 'flex'} justifyContent="space-between" mt={4} pt={4} borderTop="1px solid rgba(255,255,255,0.1)">
                    <Button
                        disabled={activeStep === 0}
                        onClick={handleBack}
                        startIcon={<ArrowBackIcon />}
                        sx={{ color: 'text.secondary' }}
                    >
                        Back
                    </Button>
                    <Button
                        variant="contained" size="large" onClick={activeStep === 3 ? handleSubmit : handleNext}
                        endIcon={loading ? <CircularProgress size={20} color="inherit" /> : <ArrowForwardIcon />}
                        disabled={loading || (activeStep === 3 && user && !isAdmin && !isStaff && availableCredit < estimatedShipmentTotal)}

                        sx={{
                            borderRadius: 50,
                            px: 4,
                            boxShadow: '0 4px 14px rgba(0, 217, 184, 0.4)',
                            fontWeight: 700
                        }}
                    >
                        {activeStep === 3 ? (showApprovalStep ? 'Proceed to Approval' : (isEditMode ? 'Update Request' : 'Finalize & Book')) : 'Continue'}
                    </Button>
                </Box>
            </Container>
        </Box>
    </ThemeProvider>
);
};

export default ShipmentWizardV2;
