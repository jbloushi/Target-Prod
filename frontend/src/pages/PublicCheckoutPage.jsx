import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { publicCheckoutService } from '../services/api';

export const PublicCheckoutPage = () => {
  const { trackingNumber } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [paidSuccess, setPaidSuccess] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);

  // Form State
  const [paymentMethod, setPaymentMethod] = useState('KNET');
  const [knetBank, setKnetBank] = useState('NBK');
  const [cardNumber, setCardNumber] = useState('4111 2222 3333 4444');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvv, setCardCvv] = useState('123');
  const [cardName, setCardName] = useState('');

  const fetchCheckout = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await publicCheckoutService.getCheckoutDetails(trackingNumber);
      if (res?.data) {
        setData(res.data);
        if (res.data.destination?.contactPerson) {
          setCardName(res.data.destination.contactPerson);
        } else if (res.data.origin?.contactPerson) {
          setCardName(res.data.origin.contactPerson);
        }
        if (res.data.paid) {
          setPaidSuccess(true);
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to load checkout details. Please check the link.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!trackingNumber) return;
    fetchCheckout();
  }, [trackingNumber]);

  const handlePay = async (e) => {
    if (e) e.preventDefault();
    try {
      setPaying(true);
      setError('');

      const res = await publicCheckoutService.processPayment(trackingNumber, {
        paymentMethod,
        customerName: cardName,
        bank: paymentMethod === 'KNET' ? knetBank : undefined,
      });

      if (res?.success) {
        setPaymentResult(res.data || {});
        setPaidSuccess(true);
      } else {
        setError(res?.error || 'Payment declined. Please verify your details.');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Payment processing failed');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
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
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <span className="loading loading-ring loading-lg text-primary" />
          <p className="text-sm font-bold text-base-content/60">Loading secure checkout gateway...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
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
        <div className="max-w-md mx-auto my-16 p-8 card bg-base-100 border border-base-200 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-error/10 text-error flex items-center justify-center mx-auto text-2xl">
            <span className="material-symbols-outlined text-3xl">warning</span>
          </div>
          <h2 className="text-xl font-black text-base-content">Checkout Unavailable</h2>
          <p className="text-xs text-base-content/60">{error}</p>
          <div className="pt-2">
            <Link to="/track" className="btn btn-primary btn-sm font-bold text-xs">
              Go to Tracking Portal &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200/50 flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* Top Bar */}
      <header className="navbar bg-base-100 border-b border-base-200 px-4 sm:px-8 py-3 sticky top-0 z-40 shadow-sm">
        <div className="flex-1 flex items-center gap-3">
          <div className="flex items-center gap-2.5 text-primary font-black text-lg tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center font-black text-sm shadow-md shadow-primary/20">
              TL
            </div>
            <div className="flex flex-col">
              <span className="leading-tight font-extrabold text-base-content">Target Logistics</span>
              <span className="text-[10px] text-primary uppercase font-bold tracking-widest">Pay-by-Link Gateway</span>
            </div>
          </div>
        </div>
        <div className="flex-none">
          <div className="badge badge-success badge-outline font-bold text-xs gap-1.5 py-3 px-3">
            <span className="material-symbols-outlined text-sm">lock</span>
            <span>256-Bit Encrypted S2S</span>
          </div>
        </div>
      </header>

      {/* Main Form */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {paidSuccess ? (
          <div className="max-w-xl mx-auto card bg-base-100 border border-base-200 shadow-sm p-6 sm:p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-4xl">check_circle</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-base-content tracking-tight">
                Payment Successfully Settled!
              </h1>
              <p className="text-xs sm:text-sm text-base-content/60 mt-1">
                Your settlement for consignment <strong className="text-base-content">{data?.trackingNumber}</strong> has been confirmed.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-3 text-xs text-left">
              <div className="flex items-center justify-between">
                <span className="text-base-content/60 font-bold">WAYBILL NUMBER</span>
                <span className="font-mono font-black text-base-content">{data?.trackingNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base-content/60 font-bold">AMOUNT SETTLED</span>
                <span className="font-mono font-black text-success text-sm">
                  {(data?.amount || data?.totalPaid || 0).toFixed(3)} {data?.currency || 'KWD'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base-content/60 font-bold">PAYMENT CHANNEL</span>
                <span className="font-bold text-base-content">{paymentResult?.method || data?.method || 'K-Net Local Debit'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base-content/60 font-bold">REFERENCE CODE</span>
                <span className="font-mono text-base-content/80">{paymentResult?.reference || 'KNET-TX-SETTLED'}</span>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => navigate(`/track/${data?.trackingNumber}`)}
                className="btn btn-primary w-full font-bold text-sm shadow-md shadow-primary/20 gap-2"
              >
                <span className="material-symbols-outlined text-lg">radar</span>
                <span>Track Live Consignment &rarr;</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Summary & Invoice Breakdown */}
            <div className="lg:col-span-5 card bg-base-100 border border-base-200 shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-2 font-black text-base text-base-content">
                <span className="material-symbols-outlined text-primary text-xl">receipt_long</span>
                <span>Consignment Invoice</span>
              </div>

              <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-2">
                <div className="text-[11px] font-bold text-base-content/50 uppercase">WAYBILL REFERENCE</div>
                <div className="font-mono font-black text-primary text-base">{data?.trackingNumber}</div>
                <div className="text-xs font-bold text-base-content flex items-center gap-1.5 pt-1">
                  <span>{data?.origin?.city || 'Kuwait'}</span>
                  <span className="text-primary font-black">→</span>
                  <span>{data?.destination?.city || 'Destination'}</span>
                </div>
                <div className="text-[11px] text-base-content/60">
                  Carrier: <strong>{data?.carrierName || 'Target Express'}</strong> • {data?.parcelsCount || 1} Pcs ({data?.totalWeight || 1} kg)
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-base-200 text-xs">
                <div className="flex items-center justify-between text-base-content/70">
                  <span>Base Airfreight Fee</span>
                  <span className="font-mono font-medium">
                    {(data?.breakdown?.baseFreight || (data?.amount * 0.85)).toFixed(3)} {data?.currency || 'KWD'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-base-content/70">
                  <span>Fuel Surcharge & Handling</span>
                  <span className="font-mono font-medium">
                    {(data?.breakdown?.fuelSurcharge + data?.breakdown?.handlingFee || (data?.amount * 0.15)).toFixed(3)} {data?.currency || 'KWD'}
                  </span>
                </div>
                <div className="flex items-center justify-between font-black text-sm text-base-content pt-3 border-t border-base-200">
                  <span>Total Payable</span>
                  <span className="text-primary font-mono text-base">
                    {data?.amount?.toFixed(3)} {data?.currency || 'KWD'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Payment Method Selector & Gateway Form */}
            <div className="lg:col-span-7 card bg-base-100 border border-base-200 shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-2 font-black text-base text-base-content">
                <span className="material-symbols-outlined text-primary text-xl">credit_card</span>
                <span>Select Payment Channel</span>
              </div>

              {/* Payment Tabs */}
              <div role="tablist" className="tabs tabs-boxed bg-base-200 p-1">
                <button
                  type="button"
                  role="tab"
                  onClick={() => setPaymentMethod('KNET')}
                  className={`tab font-bold text-xs gap-1.5 transition-all ${
                    paymentMethod === 'KNET' ? 'tab-active bg-primary text-white' : 'text-base-content/70'
                  }`}
                >
                  <span>🏦</span>
                  <span>K-Net Debit</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  onClick={() => setPaymentMethod('CARD')}
                  className={`tab font-bold text-xs gap-1.5 transition-all ${
                    paymentMethod === 'CARD' ? 'tab-active bg-primary text-white' : 'text-base-content/70'
                  }`}
                >
                  <span>💳</span>
                  <span>Visa / Mastercard</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  onClick={() => setPaymentMethod('APPLE_PAY')}
                  className={`tab font-bold text-xs gap-1.5 transition-all ${
                    paymentMethod === 'APPLE_PAY' ? 'tab-active bg-neutral text-white' : 'text-base-content/70'
                  }`}
                >
                  <span></span>
                  <span>Apple Pay</span>
                </button>
              </div>

              {error && (
                <div className="alert alert-error text-xs py-2.5 px-3">
                  <span className="material-symbols-outlined text-base">error</span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handlePay} className="space-y-4">
                {paymentMethod === 'KNET' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-base-content/70 uppercase">
                        Select Kuwait Bank *
                      </label>
                      <select
                        value={knetBank}
                        onChange={(e) => setKnetBank(e.target.value)}
                        className="select select-bordered w-full text-sm font-medium focus:select-primary"
                      >
                        <option value="NBK">National Bank of Kuwait (NBK)</option>
                        <option value="CBK">Commercial Bank of Kuwait (CBK)</option>
                        <option value="GBK">Gulf Bank</option>
                        <option value="KFH">Kuwait Finance House (KFH)</option>
                        <option value="BOUBYAN">Boubyan Bank</option>
                        <option value="BURGAN">Burgan Bank</option>
                        <option value="WARBA">Warba Bank</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-base-content/70 uppercase">
                        K-Net Card Number *
                      </label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="Prefix + Card digits"
                        className="input input-bordered w-full font-mono text-sm focus:input-primary"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-base-content/70 uppercase">Expiry (MM/YY) *</label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          className="input input-bordered w-full font-mono text-sm focus:input-primary"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-base-content/70 uppercase">ATM PIN *</label>
                        <input
                          type="password"
                          maxLength="4"
                          defaultValue="••••"
                          placeholder="4-digit PIN"
                          className="input input-bordered w-full font-mono text-sm focus:input-primary"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                {paymentMethod === 'CARD' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-base-content/70 uppercase">
                        Cardholder Name *
                      </label>
                      <input
                        type="text"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        placeholder="Full name as printed on card"
                        className="input input-bordered w-full text-sm font-medium focus:input-primary"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-base-content/70 uppercase">
                        Card Number *
                      </label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="4111 0000 0000 0000"
                        className="input input-bordered w-full font-mono text-sm focus:input-primary"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-base-content/70 uppercase">Expiry *</label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          className="input input-bordered w-full font-mono text-sm focus:input-primary"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-base-content/70 uppercase">CVV / CVC *</label>
                        <input
                          type="password"
                          maxLength="4"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          placeholder="123"
                          className="input input-bordered w-full font-mono text-sm focus:input-primary"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                {paymentMethod === 'APPLE_PAY' && (
                  <div className="p-8 text-center bg-base-200/50 rounded-xl space-y-2 border border-base-200">
                    <div className="text-4xl"></div>
                    <div className="font-extrabold text-sm text-base-content">Apple Pay Express Settlement</div>
                    <p className="text-xs text-base-content/60 max-w-xs mx-auto">
                      Confirm payment with Touch ID or Face ID directly on your Apple device.
                    </p>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={paying}
                    className={`btn w-full font-bold text-sm shadow-md transition-all ${
                      paymentMethod === 'APPLE_PAY'
                        ? 'btn-neutral'
                        : 'btn-primary shadow-primary/20'
                    }`}
                  >
                    {paying ? (
                      <>
                        <span className="loading loading-spinner loading-xs" />
                        <span>Processing Gateway Settlement...</span>
                      </>
                    ) : paymentMethod === 'APPLE_PAY' ? (
                      <span> Pay {data?.amount?.toFixed(3)} {data?.currency || 'KWD'}</span>
                    ) : (
                      <span>Settle {data?.amount?.toFixed(3)} {data?.currency || 'KWD'} Now</span>
                    )}
                  </button>
                </div>
              </form>

              <div className="text-center text-[11px] text-base-content/40">
                Target Logistics processes transactions through Central Bank of Kuwait licensed gateways.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicCheckoutPage;
