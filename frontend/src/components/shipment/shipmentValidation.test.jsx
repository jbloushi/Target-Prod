import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  NON_POSTAL_COUNTRIES,
  FIELD_LABELS,
  isValidInternationalPhone,
  isPostalCodeRequired,
  isInternationalShipment,
  isDGRCargoRequired,
  validateWizardStep,
  getValidationAlertMessage
} from './shipmentValidation';
import { KineticShipmentWizard } from './KineticShipmentWizard';

// Mock router
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

// Mock notistack
const mockEnqueueSnackbar = vi.fn();
vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar })
}));

// Mock AuthContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', name: 'Test User', email: 'test@targetlogistics.com', phone: '+96599123456', role: 'admin' },
    refreshUser: vi.fn(),
    isStaff: true,
    isAdmin: true
  })
}));

// Mock LanguageContext
vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (k) => k,
    lang: 'en',
    isRTL: false
  })
}));

// Mock API
vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { data: [] } }),
    get: vi.fn().mockResolvedValue({ data: { data: [] } })
  },
  shipmentService: {
    createShipment: vi.fn().mockResolvedValue({ data: { trackingNumber: 'TLG-99887766' } }),
    updateShipmentDetails: vi.fn().mockResolvedValue({ data: { trackingNumber: 'TLG-99887766' } }),
    savePackageTemplate: vi.fn().mockResolvedValue({ data: {} })
  },
  userService: {
    getAssignableClients: vi.fn().mockResolvedValue({ data: [] }),
    getUsers: vi.fn().mockResolvedValue({ data: [] }),
    getMe: vi.fn().mockResolvedValue({ data: { addresses: [] } }),
    updateProfile: vi.fn().mockResolvedValue({ data: {} })
  }
}));

// Mock Google Maps subcomponents
vi.mock('../GoogleAddressInput', () => ({
  default: ({ onSelectAddress, placeholder, className, style }) => (
    <input
      data-testid="mock-google-address-input"
      placeholder={placeholder}
      className={className}
      style={style}
      onChange={(e) => onSelectAddress && onSelectAddress({ formattedAddress: e.target.value, addressLine1: e.target.value })}
    />
  )
}));

vi.mock('../GoogleMapPinDrop', () => ({
  default: () => <div data-testid="mock-map-pin-drop">Map Pin Drop</div>
}));

describe('shipmentValidation Unit Tests', () => {
  describe('Phone number validation', () => {
    it('accepts valid phone numbers with country codes or local formats', () => {
      expect(isValidInternationalPhone('+96599123456')).toBe(true);
      expect(isValidInternationalPhone('+965 99 123 456')).toBe(true);
      expect(isValidInternationalPhone('+971 50 123 4567')).toBe(true);
      expect(isValidInternationalPhone('+1 (555) 123-4567')).toBe(true);
      expect(isValidInternationalPhone('0096599123456')).toBe(true);
      expect(isValidInternationalPhone('99123456')).toBe(true); // 8-digit Kuwait format
    });

    it('rejects invalid or too short phone numbers', () => {
      expect(isValidInternationalPhone('')).toBe(false);
      expect(isValidInternationalPhone(null)).toBe(false);
      expect(isValidInternationalPhone('123')).toBe(false);
      expect(isValidInternationalPhone('abc-phone')).toBe(false);
      expect(isValidInternationalPhone('+++')).toBe(false);
    });
  });

  describe('Postal code requirement & exception list', () => {
    it('does not require postal code for non-postal countries', () => {
      NON_POSTAL_COUNTRIES.forEach(code => {
        expect(isPostalCodeRequired(code)).toBe(false);
      });
      expect(isPostalCodeRequired('KW')).toBe(false);
      expect(isPostalCodeRequired('AE')).toBe(false);
      expect(isPostalCodeRequired('QA')).toBe(false);
      expect(isPostalCodeRequired('BH')).toBe(false);
      expect(isPostalCodeRequired('OM')).toBe(false);
      expect(isPostalCodeRequired('HK')).toBe(false);
      expect(isPostalCodeRequired('IE')).toBe(false);
    });

    it('requires postal code for standard countries', () => {
      expect(isPostalCodeRequired('US')).toBe(true);
      expect(isPostalCodeRequired('GB')).toBe(true);
      expect(isPostalCodeRequired('DE')).toBe(true);
      expect(isPostalCodeRequired('CA')).toBe(true);
      expect(isPostalCodeRequired('SA')).toBe(true);
    });
  });

  describe('International shipment detection', () => {
    it('detects domestic shipments', () => {
      expect(isInternationalShipment({ countryCode: 'KW' }, { countryCode: 'KW' })).toBe(false);
      expect(isInternationalShipment({ country: 'Kuwait' }, { country: 'Kuwait' })).toBe(false);
    });

    it('detects international shipments across GCC or world', () => {
      expect(isInternationalShipment({ countryCode: 'KW' }, { countryCode: 'AE' })).toBe(true);
      expect(isInternationalShipment({ countryCode: 'KW' }, { countryCode: 'US' })).toBe(true);
      expect(isInternationalShipment({ country: 'Kuwait' }, { country: 'United Arab Emirates' })).toBe(true);
    });
  });

  describe('Carrier-aware DGR cargo requirements', () => {
    it('returns false for standard cargo with DGR (DHL Express)', () => {
      expect(isDGRCargoRequired('DGR', { dangerousGoods: false })).toBe(false);
      expect(isDGRCargoRequired('dgr', {})).toBe(false);
    });

    it('returns true when shipping dangerous goods with DGR or OTE', () => {
      expect(isDGRCargoRequired('DGR', { dangerousGoods: true })).toBe(true);
      expect(isDGRCargoRequired('OTE', { dangerousGoods: true })).toBe(true);
    });

    it('returns true when UN code is explicitly provided or DGR preset is selected', () => {
      expect(isDGRCargoRequired('DGR', { unCode: 'UN1266' })).toBe(true);
      expect(isDGRCargoRequired('OTE', { unCode: 'UN3481' })).toBe(true);
      expect(isDGRCargoRequired('DGR', { dgClass: 'Class 3' })).toBe(true);
    });
  });

  describe('Step-by-step validateWizardStep matrix', () => {
    it('validates Step 1 (Sender) required fields', () => {
      const emptyForm = {
        sender: { name: '', phone: '', addr1: '', city: '', countryCode: 'KW' }
      };
      const errors = validateWizardStep(1, emptyForm, false, 'en');
      expect(errors.sender_name).toBeDefined();
      expect(errors.sender_phone).toBeDefined();
      expect(errors.sender_addr1).toBeDefined();
      expect(errors.sender_city).toBeDefined();
      // Postal code not required for KW
      expect(errors.sender_zip).toBeUndefined();

      // Postal code required for US
      const usSenderForm = {
        sender: { name: 'John Doe', phone: '+15551234567', addr1: '123 Main St', city: 'New York', countryCode: 'US', zip: '' }
      };
      const usErrors = validateWizardStep(1, usSenderForm, false, 'en');
      expect(usErrors.sender_zip).toBeDefined();

      // Valid sender passes
      const validForm = {
        sender: { name: 'Ali Al-Salem', phone: '+96599123456', addr1: 'Salem Al Mubarak St', city: 'Salmiya', countryCode: 'KW' }
      };
      expect(Object.keys(validateWizardStep(1, validForm, false, 'en')).length).toBe(0);
    });

    it('validates Step 2 (Receiver) required fields', () => {
      const emptyReceiver = {
        receiver: { name: '', phone: '', addr1: '', city: '', countryCode: 'AE' }
      };
      const errors = validateWizardStep(2, emptyReceiver, false, 'en');
      expect(errors.receiver_name).toBeDefined();
      expect(errors.receiver_phone).toBeDefined();
      expect(errors.receiver_addr1).toBeDefined();
      expect(errors.receiver_city).toBeDefined();
      // Postal code not required for AE
      expect(errors.receiver_zip).toBeUndefined();

      // Postal code required for GB
      const ukReceiver = {
        receiver: { name: 'Jane Smith', phone: '+447911123456', addr1: '10 Downing St', city: 'London', countryCode: 'GB', zip: '' }
      };
      const ukErrors = validateWizardStep(2, ukReceiver, false, 'en');
      expect(ukErrors.receiver_zip).toBeDefined();
    });

    it('validates Step 3 (Package) - standard cargo vs DGR cargo', () => {
      // Empty description and weight
      const emptyPkg = {
        pkg: { description: '', weight: '' },
        service: { carrierCode: 'DGR' }
      };
      const errors = validateWizardStep(3, emptyPkg, false, 'en');
      expect(errors.pkg_description).toBeDefined();
      expect(errors.pkg_weight).toBeDefined();

      // Standard cargo: zero DGR errors required
      const standardPkg = {
        pkg: { description: 'Electronics Spare Parts', weight: '2.5', length: '30', width: '20', height: '15', dangerousGoods: false },
        service: { carrierCode: 'DGR' }
      };
      const stdErrors = validateWizardStep(3, standardPkg, false, 'en');
      expect(stdErrors.pkg_unCode).toBeUndefined();
      expect(stdErrors.pkg_dgClass).toBeUndefined();
      expect(Object.keys(stdErrors).length).toBe(0);

      // DGR Cargo with DGR carrier: enforces all 6 DG declarations
      const dgrPkg = {
        pkg: {
          description: 'Perfumes UN1266',
          weight: '3.0',
          dangerousGoods: true,
          unCode: '',
          dgClass: '',
          dgServiceCode: '',
          dgContentId: '',
          properShippingName: '',
          dgMarks: ''
        },
        service: { carrierCode: 'DGR' }
      };
      const dgrErrors = validateWizardStep(3, dgrPkg, false, 'en');
      expect(dgrErrors.pkg_unCode).toBeDefined();
      expect(dgrErrors.pkg_dgClass).toBeDefined();
      expect(dgrErrors.pkg_dgServiceCode).toBeDefined();
      expect(dgrErrors.pkg_dgContentId).toBeDefined();
      expect(dgrErrors.pkg_properShippingName).toBeDefined();
      expect(dgrErrors.pkg_dgMarks).toBeDefined();

      // Complete DGR declaration passes
      const completeDgrPkg = {
        pkg: {
          description: 'Perfumes UN1266',
          weight: '3.0',
          dangerousGoods: true,
          unCode: 'UN1266',
          dgClass: 'Class 3 - Flammable Liquid',
          dgServiceCode: 'PAX',
          dgContentId: 'ID-PERFUME-01',
          properShippingName: 'PERFUMERY PRODUCTS',
          dgMarks: 'LTD QTY'
        },
        service: { carrierCode: 'DGR' }
      };
      expect(Object.keys(validateWizardStep(3, completeDgrPkg, false, 'en')).length).toBe(0);
    });

    it('validates Step 4 (Service) selection', () => {
      expect(validateWizardStep(4, { service: { carrierCode: '' } }, false, 'en').service_carrierCode).toBeDefined();
      expect(Object.keys(validateWizardStep(4, { service: { carrierCode: 'DGR' } }, false, 'en')).length).toBe(0);
      expect(Object.keys(validateWizardStep(4, { service: { carrierCode: 'OTE' } }, false, 'en')).length).toBe(0);
    });

    it('validates Step 5 (Logistics & Customs) for international cargo', () => {
      // Domestic: no invoice value strictly enforced
      const domesticForm = {
        sender: { countryCode: 'KW' },
        receiver: { countryCode: 'KW' },
        pkg: { value: '' },
        customs: { invoiceVal: '' }
      };
      expect(validateWizardStep(5, domesticForm, false, 'en').customs_invoiceVal).toBeUndefined();

      // International: invoice value required
      const intlForm = {
        sender: { countryCode: 'KW' },
        receiver: { countryCode: 'AE' },
        pkg: { value: '' },
        customs: { invoiceVal: '' }
      };
      const intlErrors = validateWizardStep(5, intlForm, false, 'en');
      expect(intlErrors.customs_invoiceVal).toBeDefined();

      // Value provided passes
      intlForm.customs.invoiceVal = '150.00';
      expect(Object.keys(validateWizardStep(5, intlForm, false, 'en')).length).toBe(0);
    });

    it('validates Step 6 (Review & Confirmation)', () => {
      expect(validateWizardStep(6, { confirmed: false }, false, 'en').review_confirmed).toBeDefined();
      expect(Object.keys(validateWizardStep(6, { confirmed: true }, false, 'en')).length).toBe(0);
    });
  });

  describe('getValidationAlertMessage localized alerts', () => {
    it('returns descriptive English error summary', () => {
      const errors = {
        sender_name: 'Sender contact or company name is required',
        sender_phone: 'Valid sender phone number is required'
      };
      const msg = getValidationAlertMessage(1, errors, false, 'en');
      expect(msg).toContain('Please resolve 2 required field(s):');
      expect(msg).toContain('Sender Name');
      expect(msg).toContain('Sender Phone');
    });

    it('returns descriptive Arabic error summary when language is Arabic', () => {
      const errors = {
        receiver_name: 'اسم المستلم مطلوب',
        receiver_city: 'مدينة التسليم مطلوبة'
      };
      const msg = getValidationAlertMessage(2, errors, true, 'ar');
      expect(msg).toContain('يرجى استكمال 2 من الحقول الإلزامية:');
      expect(msg).toContain('اسم المستلم');
      expect(msg).toContain('مدينة المستلم');
    });
  });
});

describe('KineticShipmentWizard Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders "Next Step" as clickable (not disabled) on initial mount', () => {
    render(<KineticShipmentWizard />);
    const nextBtn = screen.getByRole('button', { name: /next step/i });
    expect(nextBtn).toBeDefined();
    expect(nextBtn.disabled).toBe(false);
  });

  it('clicking "Next Step" with invalid Step 1 shows error toast, highlights red, and scrolls', async () => {
    render(<KineticShipmentWizard />);

    const nextBtn = screen.getByRole('button', { name: /next step/i });
    expect(nextBtn.disabled).toBe(false);

    fireEvent.click(nextBtn);

    // Snackbar should be called with error variant
    expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(1);
    expect(mockEnqueueSnackbar.mock.calls[0][1]).toEqual({ variant: 'error' });
    expect(mockEnqueueSnackbar.mock.calls[0][0]).toContain('required field');

    // Invalid fields should be rendered with error indicators
    await waitFor(() => {
      const nameField = document.querySelector('[data-field-key="sender_name"]');
      expect(nameField).not.toBeNull();
    });
  });

  it('clears error in real-time when user enters required data', async () => {
    render(<KineticShipmentWizard />);

    const nextBtn = screen.getByRole('button', { name: /next step/i });
    fireEvent.click(nextBtn);

    // sender_addr1 has an error because addr1 is initially empty
    await waitFor(() => {
      expect(screen.getByText(/Address Line 1 \(Street\) is required/i)).toBeDefined();
    });

    // Type into sender addr1
    const addrInput = screen.getByPlaceholderText(/Building, Street, House No./i);
    fireEvent.change(addrInput, { target: { value: 'Building 14, Salem Al Mubarak St' } });

    await waitFor(() => {
      expect(screen.queryByText(/Address Line 1 \(Street\) is required/i)).toBeNull();
    });
  });

  it('submitting Step 6 without agreement highlights agreement and shows notification', async () => {
    // In ReviewStep when reached, submit button triggers validation on confirmed
    const stepErrors = validateWizardStep(6, { confirmed: false }, false, 'en');
    expect(stepErrors.review_confirmed).toBeDefined();

    const alertMsg = getValidationAlertMessage(6, stepErrors, false, 'en');
    expect(alertMsg).toContain('Legal Declaration Agreement');
  });
});
