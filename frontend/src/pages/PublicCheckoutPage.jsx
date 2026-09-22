import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { publicCheckoutService } from '../services/api';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Container = styled.div`
  min-height: 100vh;
  background: #f8fafc;
  color: #0f172a;
  font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  flex-direction: column;
`;

const TopBar = styled.header`
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 50;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  font-size: 18px;
  color: #0284c7;

  svg {
    width: 28px;
    height: 28px;
  }
`;

const SecureBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #10b981;
  background: #ecfdf5;
  padding: 6px 12px;
  border-radius: 9999px;
  border: 1px solid #a7f3d0;
`;

const Main = styled.main`
  flex: 1;
  max-width: 1000px;
  width: 100%;
  margin: 32px auto;
  padding: 0 16px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 32px;
  animation: ${fadeIn} 0.4s ease-out;

  @media (min-width: 860px) {
    grid-template-columns: 1.1fr 1fr;
  }
`;

const Card = styled.div`
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
`;

const SectionTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 16px 0;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LineItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  font-size: 14px;
  color: #475569;
  border-bottom: 1px dashed #f1f5f9;

  &.total {
    border-top: 2px solid #e2e8f0;
    border-bottom: none;
    margin-top: 8px;
    padding-top: 16px;
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
  }
`;

const TabGroup = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 10px;
`;

const Tab = styled.button`
  flex: 1;
  padding: 10px 14px;
  border: none;
  background: ${props => props.$active ? '#ffffff' : 'transparent'};
  color: ${props => props.$active ? '#0284c7' : '#64748b'};
  font-weight: ${props => props.$active ? '700' : '500'};
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: ${props => props.$active ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'};
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
`;

const FormGroup = styled.div`
  margin-bottom: 16px;

  label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #334155;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  input, select {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    background: #ffffff;
    box-sizing: border-box;
    transition: border-color 0.2s;

    &:focus {
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
    }
  }
`;

const InputRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`;

const PayButton = styled.button`
  width: 100%;
  padding: 14px;
  background: ${props => props.$apple ? '#000000' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'};
  color: #ffffff;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity 0.2s, transform 0.1s;

  &:hover:not(:disabled) {
    opacity: 0.95;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Spinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const SuccessOverlay = styled.div`
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #bbf7d0;
  padding: 40px 24px;
  text-align: center;
  animation: ${fadeIn} 0.4s ease-out;
  box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.1);
`;

const PublicCheckoutPage = () => {
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

  useEffect(() => {
    if (!trackingNumber) return;
    fetchCheckout();
  }, [trackingNumber]);

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

  const handlePay = async (e) => {
    if (e) e.preventDefault();
    try {
      setPaying(true);
      setError('');

      const res = await publicCheckoutService.processPayment(trackingNumber, {
        paymentMethod,
        customerName: cardName,
        bank: paymentMethod === 'KNET' ? knetBank : undefined
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
      <Container>
        <TopBar>
          <Brand>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11" />
              <path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2" />
              <circle cx="7" cy="18" r="2" />
              <circle cx="17" cy="18" r="2" />
            </svg>
            Target Logistics
          </Brand>
        </TopBar>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#0284c7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading secure checkout...</p>
        </div>
      </Container>
    );
  }

  if (error && !data) {
    return (
      <Container>
        <TopBar>
          <Brand>Target Logistics</Brand>
        </TopBar>
        <div style={{ maxWidth: 500, margin: '60px auto', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Checkout Not Available</h2>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{error}</p>
          <Link to="/track" style={{ color: '#0284c7', fontWeight: 600, textDecoration: 'none' }}>
            Go to Tracking Page &rarr;
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <TopBar>
        <Brand>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11" />
            <path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2" />
            <circle cx="7" cy="18" r="2" />
            <circle cx="17" cy="18" r="2" />
          </svg>
          Target Logistics
        </Brand>
        <SecureBadge>
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          256-Bit Encrypted
        </SecureBadge>
      </TopBar>

      <Main>
        {paidSuccess ? (
          <div style={{ gridColumn: '1 / -1', maxWidth: 600, margin: '0 auto', width: '100%' }}>
            <SuccessOverlay>
              <div style={{
                width: 64,
                height: 64,
                background: '#ecfdf5',
                color: '#10b981',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px auto',
                border: '2px solid #a7f3d0'
              }}>
                <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>
                Payment Successfully Settled!
              </h1>
              <p style={{ color: '#475569', fontSize: 14, margin: '0 0 24px 0' }}>
                Thank you. Your payment for shipment <strong>{data?.trackingNumber}</strong> has been received and confirmed.
              </p>

              <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'left', marginBottom: 24 }}>
                <LineItem>
                  <span>Tracking Number</span>
                  <strong style={{ color: '#0f172a' }}>{data?.trackingNumber}</strong>
                </LineItem>
                <LineItem>
                  <span>Amount Paid</span>
                  <strong style={{ color: '#10b981' }}>
                    {(data?.amount || data?.totalPaid || 0).toFixed(3)} {data?.currency}
                  </strong>
                </LineItem>
                <LineItem>
                  <span>Payment Method</span>
                  <span>{paymentResult?.method || data?.method || 'K-Net / Card'}</span>
                </LineItem>
                <LineItem>
                  <span>Transaction Reference</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{paymentResult?.reference || 'SETTLED'}</span>
                </LineItem>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <PayButton onClick={() => navigate(`/track/${data?.trackingNumber}`)}>
                  Track Live Shipment &rarr;
                </PayButton>
              </div>
            </SuccessOverlay>
          </div>
        ) : (
          <>
            {/* LEFT: Shipment & Invoice Summary */}
            <div>
              <Card>
                <SectionTitle>
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Shipment Summary
                </SectionTitle>

                <div style={{
                  padding: 14,
                  background: '#f8fafc',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  marginBottom: 16
                }}>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>TRACKING NUMBER</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0284c7', margin: '2px 0 10px 0' }}>
                    {data?.trackingNumber}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                    <strong>{data?.origin?.city || 'Kuwait'}</strong>
                    <span>&rarr;</span>
                    <strong>{data?.destination?.city || 'Destination'}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                    Network: <strong>{data?.carrierName}</strong> • {data?.parcelsCount} Package ({data?.totalWeight} kg)
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Price Breakdown</div>
                  <LineItem>
                    <span>Base Freight Fee</span>
                    <span>{(data?.breakdown?.baseFreight || (data?.amount * 0.85)).toFixed(3)} {data?.currency}</span>
                  </LineItem>
                  <LineItem>
                    <span>Fuel Surcharge & Handling</span>
                    <span>{(data?.breakdown?.fuelSurcharge + data?.breakdown?.handlingFee || (data?.amount * 0.15)).toFixed(3)} {data?.currency}</span>
                  </LineItem>
                  <LineItem className="total">
                    <span>Total Amount Due</span>
                    <span style={{ color: '#0284c7' }}>
                      {data?.amount?.toFixed(3)} {data?.currency}
                    </span>
                  </LineItem>
                </div>
              </Card>
            </div>

            {/* RIGHT: Payment Options & Card Form */}
            <div>
              <Card>
                <SectionTitle>
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  Payment Route
                </SectionTitle>

                <TabGroup>
                  <Tab
                    $active={paymentMethod === 'KNET'}
                    onClick={() => setPaymentMethod('KNET')}
                    type="button"
                  >
                    🏦 K-Net Debit
                  </Tab>
                  <Tab
                    $active={paymentMethod === 'CARD'}
                    onClick={() => setPaymentMethod('CARD')}
                    type="button"
                  >
                    💳 Visa / MC
                  </Tab>
                  <Tab
                    $active={paymentMethod === 'APPLE_PAY'}
                    onClick={() => setPaymentMethod('APPLE_PAY')}
                    type="button"
                  >
                     Apple Pay
                  </Tab>
                </TabGroup>

                {error && (
                  <div style={{
                    padding: 12,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    color: '#ef4444',
                    fontSize: 13,
                    marginBottom: 16
                  }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handlePay}>
                  {paymentMethod === 'KNET' && (
                    <>
                      <FormGroup>
                        <label>Select Bank</label>
                        <select value={knetBank} onChange={(e) => setKnetBank(e.target.value)}>
                          <option value="NBK">National Bank of Kuwait (NBK)</option>
                          <option value="CBK">Commercial Bank of Kuwait (CBK)</option>
                          <option value="GBK">Gulf Bank</option>
                          <option value="KFH">Kuwait Finance House (KFH)</option>
                          <option value="BOUBYAN">Boubyan Bank</option>
                          <option value="BURGAN">Burgan Bank</option>
                          <option value="WARBA">Warba Bank</option>
                        </select>
                      </FormGroup>

                      <FormGroup>
                        <label>K-Net Card Number</label>
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="Prefix + Card digits"
                          required
                        />
                      </FormGroup>

                      <InputRow>
                        <FormGroup>
                          <label>Expiration</label>
                          <input
                            type="text"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            placeholder="MM/YY"
                            required
                          />
                        </FormGroup>
                        <FormGroup>
                          <label>PIN Code</label>
                          <input
                            type="password"
                            maxLength="4"
                            defaultValue="••••"
                            placeholder="4-digit PIN"
                            required
                          />
                        </FormGroup>
                      </InputRow>
                    </>
                  )}

                  {paymentMethod === 'CARD' && (
                    <>
                      <FormGroup>
                        <label>Cardholder Name</label>
                        <input
                          type="text"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          placeholder="Name as printed on card"
                          required
                        />
                      </FormGroup>

                      <FormGroup>
                        <label>Card Number</label>
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="0000 0000 0000 0000"
                          required
                        />
                      </FormGroup>

                      <InputRow>
                        <FormGroup>
                          <label>Expiry (MM/YY)</label>
                          <input
                            type="text"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            placeholder="MM/YY"
                            required
                          />
                        </FormGroup>
                        <FormGroup>
                          <label>CVV / CVC</label>
                          <input
                            type="password"
                            maxLength="4"
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value)}
                            placeholder="123"
                            required
                          />
                        </FormGroup>
                      </InputRow>
                    </>
                  )}

                  {paymentMethod === 'APPLE_PAY' && (
                    <div style={{ padding: '24px 12px', textAlign: 'center', background: '#f8fafc', borderRadius: 10, marginBottom: 20 }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}></div>
                      <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
                        Authorize one-touch settlement with Face ID / Touch ID.
                      </p>
                    </div>
                  )}

                  <PayButton
                    type="submit"
                    disabled={paying}
                    $apple={paymentMethod === 'APPLE_PAY'}
                  >
                    {paying ? (
                      <>
                        <Spinner />
                        Processing Settlement...
                      </>
                    ) : paymentMethod === 'APPLE_PAY' ? (
                      ` Pay ${data?.amount?.toFixed(3)} ${data?.currency}`
                    ) : (
                      `Pay ${data?.amount?.toFixed(3)} ${data?.currency} Now`
                    )}
                  </PayButton>
                </form>

                <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
                  Target Logistics securely settles payments through authorized GCC payment gateways.
                </div>
              </Card>
            </div>
          </>
        )}
      </Main>
    </Container>
  );
};

export default PublicCheckoutPage;
