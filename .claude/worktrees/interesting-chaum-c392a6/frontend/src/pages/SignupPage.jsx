import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Alert } from '../ui';

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

const SignupPage = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: ''
    });
    const { signup, loading, error, isAuthenticated, user } = useAuth();
    const navigate = useNavigate();

    React.useEffect(() => {
        if (isAuthenticated && user) {
            navigate(user.role === 'driver' ? '/driver/pickup' : '/dashboard');
        }
    }, [isAuthenticated, user, navigate]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await signup(formData);
            navigate('/');
        } catch (err) {
            // Error handled by context
        }
    };

    return (
        <PageWrapper>
            <FormSide>
                <BrandMark>
                    <BrandIcon>
                        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </BrandIcon>
                    <BrandText>Target Logistics</BrandText>
                </BrandMark>

                <Title>Join Target Logistics</Title>
                <Subtitle>Create your account to start managing shipments and unlock the full power of our logistics platform.</Subtitle>

                {error && (
                    <div style={{ marginBottom: '8px' }}>
                        <Alert severity="error" title="Registration Failed">
                            {typeof error === 'string' ? error : 'An unexpected error occurred'}
                        </Alert>
                    </div>
                )}

                <Form onSubmit={handleSubmit}>
                    <Input
                        label="Full Name"
                        name="name"
                        autoComplete="name"
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="John Doe"
                        required
                    />
                    <Input
                        label="Email Address"
                        name="email"
                        autoComplete="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="name@company.com"
                        required
                    />
                    <Input
                        label="Password"
                        name="new-password"
                        autoComplete="new-password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => handleChange('password', e.target.value)}
                        placeholder="Create a strong password"
                        required
                    />

                    <Button
                        variant="primary"
                        type="submit"
                        disabled={loading}
                        style={{ width: '100%', marginTop: '8px', padding: '16px' }}
                    >
                        {loading ? 'Creating Account...' : 'Create Account'}
                    </Button>
                </Form>

                <div style={{ marginTop: '28px', textAlign: 'center' }}>
                    <span style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>Already have an account? </span>
                    <LinkText to="/login">Sign In</LinkText>
                </div>
            </FormSide>

            <HeroSide>
                <HeroImage />
                <MotionLine style={{ left: '20%' }} />
                <MotionLine style={{ left: '50%', animationDelay: '0.2s' }} />
                <MotionLine style={{ left: '75%', animationDelay: '0.4s' }} />
            </HeroSide>
        </PageWrapper>
    );
};

export default SignupPage;
