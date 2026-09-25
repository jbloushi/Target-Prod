import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import GoogleAddressInput from '../components/GoogleAddressInput';
import LocationPicker from '../components/LocationPicker';
import TrackingTimeline from '../components/TrackingTimeline';
import { getApiBaseUrl } from '../utils/env';

const countries = [
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
];

const API_URL = getApiBaseUrl();

export const PublicLocationPage = () => {
  const { trackingNumber } = useParams();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [userMode, setUserMode] = useState('view'); // 'view' | 'update'

  const [addressData, setAddressData] = useState({
    formattedAddress: '',
    streetLines: ['', ''],
    city: '',
    state: '',
    postalCode: '',
    countryCode: 'KW',
    country: 'Kuwait',
    unitNumber: '',
    buildingName: '',
    landmark: '',
    deliveryNotes: '',
    coordinates: null,
  });

  // OTP Verification State
  const [otpStep, setOtpStep] = useState('initial'); // 'initial' | 'sent' | 'verified'
  const [otpInput, setOtpInput] = useState('');
  const [otpToken, setOtpToken] = useState(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');

  useEffect(() => {
    const fetchShipment = async () => {
      try {
        const response = await fetch(`${API_URL}/public/shipments/${trackingNumber}`);
        const data = await response.json();

        if (data.success) {
          setShipment(data.data);
        } else {
          setError(data.error?.message || data.error || 'Failed to load consignment.');
        }
      } catch (err) {
        setError('Network error. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    fetchShipment();
  }, [trackingNumber]);

  const reverseGeocode = async (lat, lng) => {
    if (!window.google || !window.google.maps) return;
    const geocoder = new window.google.maps.Geocoder();
    try {
      const response = await geocoder.geocode({ location: { lat, lng } });
      if (response.results?.[0]) {
        const result = response.results[0];
        setAddressData((prev) => ({
          ...prev,
          formattedAddress: result.formatted_address,
          coordinates: [lng, lat],
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddressSelect = (data) => {
    const newData = { ...data };
    if (!newData.coordinates && newData.latitude) {
      newData.coordinates = [newData.longitude, newData.latitude];
    }
    if (!Array.isArray(newData.streetLines)) {
      newData.streetLines = [newData.formattedAddress || '', ''];
    }
    setAddressData((prev) => ({ ...prev, ...newData }));
  };

  const handleLocationPickerChange = (location) => {
    setAddressData((prev) => ({ ...prev, coordinates: [location.lng, location.lat] }));
    reverseGeocode(location.lat, location.lng);
  };

  const handleFieldChange = (field, value) => {
    setAddressData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSendOtp = async () => {
    setSendingOtp(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/public/shipments/${trackingNumber}/location/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (data.success) {
        setOtpStep('sent');
        setOtpMessage(data.message);
        if (data.devOtp) setDevOtpHint(data.devOtp);
      } else {
        setError(data.error || 'Failed to send OTP verification code.');
      }
    } catch (err) {
      setError('Failed to send WhatsApp verification code.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpInput || otpInput.length < 6) return;
    setVerifyingOtp(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/public/shipments/${trackingNumber}/location/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpInput }),
      });
      const data = await response.json();
      if (data.success) {
        setOtpStep('verified');
        setOtpToken(data.otpToken);
        setUserMode('update');
      } else {
        setError(data.error || 'Invalid 6-digit OTP code.');
      }
    } catch (err) {
      setError('Failed to verify OTP code.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSubmit = async () => {
    if (!addressData) return;
    setUpdating(true);
    try {
      const response = await fetch(`${API_URL}/public/shipments/${trackingNumber}/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinates: addressData.coordinates,
          address: addressData.formattedAddress,
          streetLines: addressData.streetLines,
          city: addressData.city,
          state: addressData.state,
          postalCode: addressData.postalCode,
          countryCode: addressData.countryCode,
          country: addressData.country,
          unitNumber: addressData.unitNumber,
          buildingName: addressData.buildingName,
          landmark: addressData.landmark,
          deliveryNotes: addressData.deliveryNotes,
          otpToken,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error?.message || data.error || 'Failed to update location.');
      }
    } catch (err) {
      setError('Failed to submit location update.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-base-200/50 flex flex-col items-center justify-center gap-3">
        <span className="loading loading-ring loading-lg text-primary" />
        <p className="text-sm font-bold text-base-content/60">Loading GPS dispatch location...</p>
      </div>
    );
  }

  if (error && !shipment) {
    return (
      <div className="min-h-screen bg-base-200/50 flex flex-col items-center justify-center p-4">
        <div className="card bg-base-100 border border-base-200 shadow-sm max-w-md w-full p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-error/10 text-error flex items-center justify-center mx-auto text-2xl">
            <span className="material-symbols-outlined text-3xl">error</span>
          </div>
          <h2 className="text-xl font-black text-base-content">Lookup Error</h2>
          <p className="text-xs text-base-content/60">{error}</p>
          <div className="pt-2">
            <Link to="/track" className="btn btn-primary btn-sm text-xs font-bold">
              Return to Tracking &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-base-200/50 flex flex-col font-sans">
        <header className="navbar bg-base-100 border-b border-base-200 px-6 py-3">
          <div className="flex items-center gap-2.5 text-primary font-black text-lg">
            <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-black text-sm">
              TL
            </div>
            <span>Target Logistics</span>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="card bg-base-100 border border-base-200 shadow-sm max-w-md w-full p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto text-3xl">
              <span className="material-symbols-outlined text-4xl">check_circle</span>
            </div>
            <div>
              <h2 className="text-2xl font-black text-base-content">Location Confirmed!</h2>
              <p className="text-xs sm:text-sm text-base-content/60 mt-1">
                Your exact delivery GPS coordinates have been relayed to the assigned courier driver.
              </p>
            </div>
            <div className="p-3 bg-base-200 rounded-xl font-mono text-xs text-base-content/70">
              Waybill: <strong>{trackingNumber}</strong>
            </div>
            <div className="pt-2">
              <Link to={`/track/${trackingNumber}`} className="btn btn-primary w-full font-bold text-xs shadow-md shadow-primary/20">
                View Live Consignment Tracker &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200/50 flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* Top Header */}
      <header className="navbar bg-base-100 border-b border-base-200 px-4 sm:px-8 py-3 sticky top-0 z-40 shadow-sm">
        <div className="flex-1 flex items-center gap-3">
          <Link to={`/track/${trackingNumber}`} className="flex items-center gap-2.5 text-primary font-black text-lg">
            <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-black text-sm shadow-md shadow-primary/20">
              TL
            </div>
            <span className="font-extrabold text-base-content">Target Logistics</span>
          </Link>
        </div>
        <div className="flex-none">
          <Link to={`/track/${trackingNumber}`} className="btn btn-ghost btn-sm text-xs font-bold text-base-content/70">
            &larr; Back to Consignment
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Status Column */}
          <div className={`${userMode === 'update' ? 'lg:col-span-5' : 'lg:col-span-12 max-w-xl mx-auto w-full'} card bg-base-100 border border-base-200 shadow-sm p-6 sm:p-8 space-y-6`}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto text-2xl">
                📍
              </div>
              <h2 className="text-xl font-black text-base-content tracking-tight">
                Receiver GPS Confirmation
              </h2>
              <div className="font-mono font-bold text-primary text-sm">{trackingNumber}</div>
            </div>

            {shipment?.history && (
              <div className="pt-2">
                <TrackingTimeline history={shipment.history} currentStatus={shipment.status} />
              </div>
            )}

            {userMode === 'view' && (
              <div className="pt-4 border-t border-base-200 space-y-4">
                <p className="text-xs text-base-content/60 text-center leading-relaxed">
                  To protect recipient privacy, verify the receiver phone number with a WhatsApp OTP to unlock the high-precision map pin.
                </p>

                {error && (
                  <div className="alert alert-error text-xs py-2.5 px-3">
                    <span className="material-symbols-outlined text-base">error</span>
                    <span>{error}</span>
                  </div>
                )}

                {otpStep === 'initial' && (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={sendingOtp}
                    className="btn btn-primary w-full font-bold text-sm shadow-md shadow-primary/20 gap-2"
                  >
                    {sendingOtp ? (
                      <>
                        <span className="loading loading-spinner loading-xs" />
                        <span>Sending WhatsApp Code...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-lg">chat</span>
                        <span>Send WhatsApp Verification OTP</span>
                      </>
                    )}
                  </button>
                )}

                {otpStep === 'sent' && (
                  <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-3">
                    <div className="text-xs font-bold text-base-content">
                      {otpMessage || 'Enter the 6-digit OTP sent to your WhatsApp:'}
                    </div>

                    {devOtpHint && (
                      <div className="badge badge-success badge-sm font-bold text-xs gap-1 py-2">
                        [DEV HINT] Test OTP: {devOtpHint}
                      </div>
                    )}

                    <input
                      type="text"
                      maxLength={6}
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      placeholder="e.g. 123456"
                      className="input input-bordered w-full text-center font-mono font-black text-lg tracking-widest focus:input-primary"
                    />

                    <button
                      type="button"
                      onClick={handleVerifyOtp}
                      disabled={verifyingOtp || otpInput.length < 6}
                      className="btn btn-primary w-full font-bold text-xs shadow-md shadow-primary/20"
                    >
                      {verifyingOtp ? 'Verifying...' : 'Verify OTP & Unlock Map Pin'}
                    </button>
                  </div>
                )}

                {otpStep === 'verified' && (
                  <button
                    type="button"
                    onClick={() => setUserMode('update')}
                    className="btn btn-success w-full font-bold text-xs text-white shadow-md shadow-success/20 gap-2"
                  >
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    <span>OTP Verified - Proceed to Pin Address</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Location Update Form Column */}
          {userMode === 'update' && (
            <div className="lg:col-span-7 card bg-base-100 border border-base-200 shadow-sm p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-xl font-black text-base-content tracking-tight">
                  Update Delivery GPS & Address
                </h3>
                <p className="text-xs text-base-content/60 mt-0.5">
                  Drag the pin on the map or type your PACI / address below to assist the driver.
                </p>
              </div>

              {/* Google Address Auto-suggest */}
              <div>
                <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider block mb-1.5">
                  Search Place or Landmark
                </label>
                <GoogleAddressInput
                  label="Search place in Kuwait..."
                  onChange={handleAddressSelect}
                />
              </div>

              {/* Map Location Picker */}
              <div className="rounded-xl overflow-hidden border border-base-200">
                <LocationPicker
                  initialLocation={
                    addressData?.coordinates
                      ? { lat: addressData.coordinates[1], lng: addressData.coordinates[0] }
                      : (shipment?.currentLocation || shipment?.destination)
                  }
                  onLocationChange={handleLocationPickerChange}
                />
              </div>

              {/* Address Fields Form */}
              <div className="space-y-4 pt-4 border-t border-base-200">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Street Address / Block</label>
                  <input
                    type="text"
                    value={addressData.streetLines?.[0] || ''}
                    onChange={(e) => handleFieldChange('streetLines', [e.target.value, addressData.streetLines?.[1] || ''])}
                    placeholder="e.g. Block 4, Street 12, Building 8"
                    className="input input-bordered w-full text-sm font-medium focus:input-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Unit / Floor</label>
                    <input
                      type="text"
                      value={addressData.unitNumber || ''}
                      onChange={(e) => handleFieldChange('unitNumber', e.target.value)}
                      placeholder="e.g. Apt 4B, Floor 2"
                      className="input input-bordered w-full text-sm font-medium focus:input-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Building / PACI No</label>
                    <input
                      type="text"
                      value={addressData.buildingName || ''}
                      onChange={(e) => handleFieldChange('buildingName', e.target.value)}
                      placeholder="e.g. Al-Bader Tower / PACI"
                      className="input input-bordered w-full text-sm font-medium focus:input-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">City / Area</label>
                    <input
                      type="text"
                      value={addressData.city || ''}
                      onChange={(e) => handleFieldChange('city', e.target.value)}
                      placeholder="e.g. Salmiya, Hawalli"
                      className="input input-bordered w-full text-sm font-medium focus:input-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Governorate</label>
                    <input
                      type="text"
                      value={addressData.state || ''}
                      onChange={(e) => handleFieldChange('state', e.target.value)}
                      placeholder="e.g. Capital, Hawalli"
                      className="input input-bordered w-full text-sm font-medium focus:input-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Postal Code</label>
                    <input
                      type="text"
                      value={addressData.postalCode || ''}
                      onChange={(e) => handleFieldChange('postalCode', e.target.value)}
                      placeholder="e.g. 13000"
                      className="input input-bordered w-full text-sm font-medium focus:input-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Country</label>
                    <select
                      value={addressData.countryCode || 'KW'}
                      onChange={(e) => handleFieldChange('countryCode', e.target.value)}
                      className="select select-bordered w-full text-sm font-medium focus:select-primary"
                    >
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Driver Delivery Notes</label>
                  <input
                    type="text"
                    value={addressData.landmark || addressData.deliveryNotes || ''}
                    onChange={(e) => handleFieldChange('landmark', e.target.value)}
                    placeholder="Near mosque, call before arrival, gate code 1234..."
                    className="input input-bordered w-full text-sm font-medium focus:input-primary"
                  />
                </div>

                {error && (
                  <div className="alert alert-error text-xs py-2.5 px-3">
                    <span className="material-symbols-outlined text-base">error</span>
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setUserMode('view')}
                    className="btn btn-ghost font-bold text-xs flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={updating}
                    onClick={handleSubmit}
                    className="btn btn-primary font-bold text-xs flex-1 shadow-md shadow-primary/20 gap-2"
                  >
                    {updating ? (
                      <>
                        <span className="loading loading-spinner loading-xs" />
                        <span>Confirming...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">save</span>
                        <span>Confirm Exact Location</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PublicLocationPage;
