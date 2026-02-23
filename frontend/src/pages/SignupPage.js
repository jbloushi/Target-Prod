import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Alert } from '../ui';

// --- Styled Components ---

const FullPageGradient = styled.div`
    min-height: 100vh;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(at 0% 0%, rgba(0, 217, 184, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 0%, rgba(59, 130, 246, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.1) 0px, transparent 50%), /* Success/Green hints */
                linear-gradient(135deg, #0a0e1a 0%, #111827 100%);
    background-size: cover;
    padding: 16px;
`;

const SignupCard = styled.div`
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    border-radius: 24px;
    width: 100%;
    max-width: 480px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(30, 41, 59, 0.7);
    transition: transform 0.3s ease-in-out;
`;

const Title = styled.h1`
    font-size: 28px;
    font-weight: 800;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
    color: #fff;
    text-align: center;
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

const SignupPage = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: ''
    });
    const { signup, loading, error, isAuthenticated, user } = useAuth();
    const navigate = useNavigate();

    // If already authenticated, redirect
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
        <FullPageGradient>
            <SignupCard>
                <Title>Join 3PLogistics</Title>
                <Subtitle>Create your organization agent account to start managing shipments</Subtitle>

                {error && (
                    <div style={{ width: '100%', marginBottom: '24px' }}>
                        <Alert type="error" title="Registration Failed">
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
                        style={{ width: '100%', marginTop: '16px' }}
                    >
                        {loading ? 'Creating Account...' : 'Create Account'}
                    </Button>
                </Form>

                <div style={{ marginTop: '24px', textAlign: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Already have an account? </span>
                    <LinkText to="/login">Log In</LinkText>
                </div>
            </SignupCard>
        </FullPageGradient>
    );
};

export default SignupPage;
