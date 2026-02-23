import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Alert } from '../ui';
import { getRoleLabel } from '../utils/roleLabels';

// --- Styled Components ---

const FullPageGradient = styled.div`
    min-height: 100vh;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at 15% 50%, rgba(0, 217, 184, 0.1) 0%, transparent 25%),
                radial-gradient(circle at 85% 30%, rgba(59, 130, 246, 0.1) 0%, transparent 25%),
                linear-gradient(135deg, #0a0e1a 0%, #1e293b 100%); /* Fallback to dark theme assumption for premium feel */
    background-size: cover;
    padding: 16px;
`;

const LoginCard = styled.div`
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    border-radius: 24px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(30, 41, 59, 0.7);
    transition: transform 0.3s ease-in-out;

    &:hover {
        transform: translateY(-4px);
    }
`;

const BrandLogo = styled.div`
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary, #3b82f6));
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    color: #fff;
    box-shadow: 0 8px 16px rgba(0, 217, 184, 0.4);
    font-size: 32px;
`;

const Title = styled.h1`
    font-size: 24px;
    font-weight: 800;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
    color: #fff;
`;

const Subtitle = styled.p`
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 32px;
    text-align: center;
`;

const Form = styled.form`
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const LinkText = styled(RouterLink)`
    color: var(--accent-primary);
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
    transition: opacity 0.2s;

    &:hover {
        opacity: 0.8;
    }
`;

const DevOptionsButton = styled.button`
    background: transparent;
    border: 1px dashed var(--border-color);
    color: var(--text-secondary);
    width: 100%;
    padding: 8px;
    border-radius: 8px;
    margin-top: 16px;
    cursor: pointer;
    font-size: 12px;
    
    &:hover {
        border-color: var(--text-secondary);
        color: var(--text-primary);
    }
`;

const DevPanel = styled.div`
  margin-top: 16px;
  padding: 16px;
  background: rgba(0,0,0,0.3);
  border-radius: 8px;
  border: 1px solid var(--border-color);
`;

const QuickLoginGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
`;

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showDevOptions, setShowDevOptions] = useState(false);

    // Note: 'rememberMe' state existed but wasn't doing anything logic-wise in the original code beyond UI toggle.
    // Keeping it simple unless explicitly needed.

    const { login, loading, error, isAuthenticated, user } = useAuth();
    const navigate = useNavigate();

    // Check for Dev Environment (Vite or Node)
    const isDev = process.env.NODE_ENV === 'development' || process.env.REACT_APP_IS_DEV === 'true';

    // If authenticated, redirect
    React.useEffect(() => {
        if (isAuthenticated && user) {
            navigate(user.role === 'driver' ? '/driver/pickup' : '/dashboard');
        }
    }, [isAuthenticated, user, navigate]);

    const handleLogin = async (emailInput, passInput) => {
        try {
            await login(emailInput, passInput);
            // Redirection handled by useEffect
        } catch (err) {
            // Error handled by helper
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        handleLogin(email, password);
    };

    return (
        <FullPageGradient>
            <LoginCard>
                <BrandLogo>
                    <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                </BrandLogo>

                <Title>3PLogistics Solution</Title>
                <Subtitle>Secure access for authorized personnel</Subtitle>

                {error && (
                    <div style={{ width: '100%', marginBottom: '24px' }}>
                        <Alert type="error" title="Login Failed">
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
                        style={{ width: '100%', marginTop: '8px' }}
                    >
                        {loading ? 'Signing In...' : 'Sign In'}
                    </Button>
                </Form>

                <div style={{ marginTop: '24px', textAlign: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Don't have an account? </span>
                    <LinkText to="/signup">Sign Up</LinkText>
                </div>

                {/* Dev Options Toggle */}
                {isDev && (
                    <>
                        <DevOptionsButton onClick={() => setShowDevOptions(!showDevOptions)}>
                            {showDevOptions ? 'Hide Developer Options' : 'Show Developer Options'}
                        </DevOptionsButton>

                        {showDevOptions && (
                            <DevPanel>
                                <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                                    Quick Login (Dev Only)
                                </div>
                                <QuickLoginGrid>
                                    {['admin', 'staff', 'client', 'driver'].map((role) => (
                                        <Button
                                            key={role}
                                            variant="secondary"
                                            onClick={() => handleLogin(`${role}@demo.com`, 'password123')}
                                            style={{ textTransform: 'capitalize', fontSize: '12px', padding: '6px' }}
                                        >
                                            {getRoleLabel(role)}
                                        </Button>
                                    ))}
                                </QuickLoginGrid>
                            </DevPanel>
                        )}
                    </>
                )}
            </LoginCard>
        </FullPageGradient>
    );
};

export default LoginPage;
