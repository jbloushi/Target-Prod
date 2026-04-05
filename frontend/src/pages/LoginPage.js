import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Alert } from '../ui';
import { getRoleLabel } from '../utils/roleLabels';

// --- Animations ---
const fadeSlideUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
`;

const driftIn = keyframes`
  from { opacity: 0; transform: translateX(40px); }
  to { opacity: 1; transform: translateX(0); }
`;

const lineGrow = keyframes`
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
`;

// --- Styled Components ---

const PageWrapper = styled.div`
    min-height: 100vh;
    width: 100%;
    display: flex;
    background: var(--surface, #f3f7fb);
    position: relative;
    overflow: hidden;
`;

const FormSide = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 48px;
    padding-left: 80px;
    max-width: 560px;
    position: relative;
    z-index: 2;
    animation: ${fadeSlideUp} 0.6s cubic-bezier(0.4, 0, 0.2, 1);

    @media (max-width: 1024px) {
        max-width: 100%;
        padding: 32px;
        padding-left: 32px;
    }
`;

const HeroSide = styled.div`
    flex: 1.2;
    position: relative;
    overflow: hidden;

    @media (max-width: 1024px) {
        display: none;
    }
`;

const HeroImage = styled.div`
    position: absolute;
    inset: 0;
    background-image: url('/images/logistics-hero.png');
    background-size: cover;
    background-position: center;
    animation: ${driftIn} 0.8s cubic-bezier(0.4, 0, 0.2, 1);
    
    &::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(to right, var(--surface, #f3f7fb) 0%, rgba(243, 247, 251, 0.3) 30%, transparent 60%);
    }
`;

const MotionLine = styled.div`
    position: absolute;
    top: 0;
    width: 1px;
    height: 100%;
    background: linear-gradient(to bottom, var(--primary, #0050d4), transparent);
    opacity: 0.08;
    transform-origin: top;
    animation: ${lineGrow} 1.2s cubic-bezier(0.4, 0, 0.2, 1);
`;

const GlassWidget = styled.div`
    position: absolute;
    bottom: 64px;
    right: 48px;
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(169, 174, 177, 0.15);
    border-radius: 24px;
    padding: 24px;
    min-width: 280px;
    z-index: 5;
    box-shadow: 0 20px 48px -8px rgba(42, 47, 50, 0.1);
    animation: ${fadeSlideUp} 1s cubic-bezier(0.4, 0, 0.2, 1) 0.3s both;
`;

const RouteLabel = styled.span`
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--on-surface-variant, #575c60);
`;

const BrandMark = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 48px;
`;

const BrandIcon = styled.div`
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--gradient-primary, linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%));
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 8px 24px rgba(0, 80, 212, 0.25);
`;

const BrandText = styled.span`
    font-family: 'Manrope', sans-serif;
    font-size: 20px;
    font-weight: 800;
    color: var(--on-surface, #2a2f32);
    letter-spacing: -0.02em;
`;

const Title = styled.h1`
    font-family: 'Manrope', sans-serif;
    font-size: 32px;
    font-weight: 800;
    margin-bottom: 8px;
    letter-spacing: -0.02em;
    color: var(--on-surface, #2a2f32);
    line-height: 1.2;
`;

const Subtitle = styled.p`
    font-size: 15px;
    color: var(--on-surface-variant, #575c60);
    margin-bottom: 36px;
    line-height: 1.6;
`;

const Form = styled.form`
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const LinkText = styled(RouterLink)`
    color: var(--primary, #0050d4);
    text-decoration: none;
    font-size: 14px;
    font-weight: 700;
    transition: all 0.2s;

    &:hover {
        color: var(--primary-dim, #0046bb);
    }
`;

const DevOptionsButton = styled.button`
    background: var(--surface-container-low, #ecf1f6);
    border: none;
    color: var(--on-surface-variant, #575c60);
    width: 100%;
    padding: 10px;
    border-radius: 12px;
    margin-top: 16px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    font-family: 'Manrope', sans-serif;
    transition: all 0.2s;
    
    &:hover {
        background: var(--surface-container, #e3e9ee);
        color: var(--on-surface, #2a2f32);
    }
`;

const DevPanel = styled.div`
  margin-top: 16px;
  padding: 16px;
  background: var(--surface-container-low, #ecf1f6);
  border-radius: 12px;
`;

const QuickLoginGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
`;

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showDevOptions, setShowDevOptions] = useState(false);

    const { login, loading, error, isAuthenticated, user } = useAuth();
    const navigate = useNavigate();

    const isDev = process.env.NODE_ENV === 'development' || process.env.REACT_APP_IS_DEV === 'true';

    React.useEffect(() => {
        if (isAuthenticated && user) {
            navigate(user.role === 'driver' ? '/driver/pickup' : '/dashboard');
        }
    }, [isAuthenticated, user, navigate]);

    const handleLogin = async (emailInput, passInput) => {
        try {
            await login(emailInput, passInput);
        } catch (err) {
            // Error handled by context
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        handleLogin(email, password);
    };

    return (
        <PageWrapper>
            {/* Left: Form */}
            <FormSide>
                <BrandMark>
                    <BrandIcon>
                        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </BrandIcon>
                    <BrandText>Target Logistics</BrandText>
                </BrandMark>

                <Title>Welcome back</Title>
                <Subtitle>Sign in to access your logistics dashboard and manage shipments across the globe.</Subtitle>

                {error && (
                    <div style={{ marginBottom: '8px' }}>
                        <Alert severity="error" title="Login Failed">
                            {typeof error === 'string' ? error : 'An unexpected error occurred'}
                        </Alert>
                    </div>
                )}

                <Form onSubmit={handleSubmit}>
                    <Input
                        label="Email Address"
                        type="email"
                        name="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        required
                        autoFocus
                    />
                    <Input
                        label="Password"
                        name="password"
                        autoComplete="current-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <LinkText to="/forgot-password">
                            Forgot password?
                        </LinkText>
                    </div>

                    <Button
                        variant="primary"
                        type="submit"
                        disabled={loading}
                        style={{ width: '100%', marginTop: '4px', padding: '16px' }}
                    >
                        {loading ? 'Signing In...' : 'Sign In'}
                    </Button>
                </Form>

                <div style={{ marginTop: '28px', textAlign: 'center' }}>
                    <span style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>Don't have an account? </span>
                    <LinkText to="/signup">Sign Up</LinkText>
                </div>

                {isDev && (
                    <>
                        <DevOptionsButton onClick={() => setShowDevOptions(!showDevOptions)}>
                            {showDevOptions ? 'Hide Developer Options' : 'Show Developer Options'}
                        </DevOptionsButton>

                        {showDevOptions && (
                            <DevPanel>
                                <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--on-surface-variant)', letterSpacing: '0.05em' }}>
                                    Quick Login (Dev Only)
                                </div>
                                <QuickLoginGrid>
                                    {['admin', 'staff', 'org_manager', 'org_agent', 'driver'].map((role) => (
                                        <Button
                                            key={role}
                                            variant="secondary"
                                            onClick={() => handleLogin(`${role}@demo.com`, 'password123')}
                                            style={{ textTransform: 'capitalize', fontSize: '12px', padding: '8px' }}
                                        >
                                            {getRoleLabel(role)}
                                        </Button>
                                    ))}
                                </QuickLoginGrid>
                            </DevPanel>
                        )}
                    </>
                )}
            </FormSide>

            {/* Right: Hero Image */}
            <HeroSide>
                <HeroImage />
                {/* Decorative Motion Lines */}
                <MotionLine style={{ left: '20%' }} />
                <MotionLine style={{ left: '50%', animationDelay: '0.2s' }} />
                <MotionLine style={{ left: '75%', animationDelay: '0.4s' }} />

                {/* Glassmorphic Route Widget */}
                <GlassWidget>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <RouteLabel>Origin</RouteLabel>
                            <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '16px', fontFamily: 'Manrope, sans-serif' }}>KUWAIT</div>
                        </div>
                        <svg width="24" height="24" fill="none" stroke="var(--primary)" viewBox="0 0 24 24" strokeWidth="2" style={{ opacity: 0.5 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        <div style={{ textAlign: 'right' }}>
                            <RouteLabel>Coverage</RouteLabel>
                            <div style={{ fontWeight: 800, color: 'var(--on-surface)', fontSize: '16px', fontFamily: 'Manrope, sans-serif' }}>200+ COUNTRIES</div>
                        </div>
                    </div>
                    <div style={{ height: '4px', background: 'var(--surface-container-high)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: '66%', background: 'var(--gradient-primary)', borderRadius: '9999px' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3adffa', boxShadow: '0 0 8px rgba(58, 223, 250, 0.5)' }} />
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#006573', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Tracking Active</span>
                    </div>
                </GlassWidget>
            </HeroSide>
        </PageWrapper>
    );
};

export default LoginPage;
