import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';

import { getCapabilitiesForRole } from '../utils/capabilities';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVITY_KEY = 'lastActivityAt';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Derive capabilities from user role
    const capabilities = useMemo(
        () => getCapabilitiesForRole(user?.role),
        [user?.role]
    );

    const can = useCallback(
        (capability) => capabilities.includes(capability),
        [capabilities]
    );

    const login = async (email, password) => {
        try {
            setLoading(true);
            setError(null);
            const res = await api.post('/auth/login', { email, password });

            const { token, data } = res.data;
            localStorage.setItem('token', token);
            localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
            setUser(data.user);
            return data.user;
        } catch (err) {
            const message = err.response?.data?.details || err.response?.data?.message || err.response?.data?.error || err.message;
            setError(typeof message === 'string' ? message : 'Login failed');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const signup = async (userData) => {
        try {
            setLoading(true);
            setError(null);
            const res = await api.post('/auth/signup', userData);

            const { token, data } = res.data;
            localStorage.setItem('token', token);
            localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
            setUser(data.user);
            return data.user;
        } catch (err) {
            const message = err.response?.data?.details || err.response?.data?.message || err.response?.data?.error || err.message;
            setError(typeof message === 'string' ? message : 'Signup failed');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const logout = useCallback(() => {
        localStorage.removeItem('token');
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        setUser(null);
    }, []);

    const loadUser = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            localStorage.removeItem(LAST_ACTIVITY_KEY);
            setLoading(false);
            return;
        }

        try {
            const res = await api.get('users/me', {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Fix: Controller returns { data: userObject }, not { data: { user: userObject } }
            setUser(res.data.data);
        } catch (err) {
            console.error('Load user failed:', err);
            if (err.response && err.response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem(LAST_ACTIVITY_KEY);
                setUser(null);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUser();
    }, [loadUser]);


    useEffect(() => {
        if (!user) return;

        const touchActivity = () => {
            localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
        };

        const enforceIdleTimeout = () => {
            const lastActivityAt = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
            if (!lastActivityAt) {
                touchActivity();
                return;
            }

            if (Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
                logout();
            }
        };

        touchActivity();
        const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
        activityEvents.forEach((eventName) => window.addEventListener(eventName, touchActivity, { passive: true }));

        const intervalId = window.setInterval(enforceIdleTimeout, 30 * 1000);

        return () => {
            activityEvents.forEach((eventName) => window.removeEventListener(eventName, touchActivity));
            window.clearInterval(intervalId);
        };
    }, [user, logout]);

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            error,
            login,
            signup,
            logout,
            refreshUser: loadUser,
            isAuthenticated: !!user,
            isStaff: ['staff', 'admin', 'manager', 'accounting'].includes(user?.role),
            isAdmin: user?.role === 'admin',
            isAccountant: user?.role === 'accounting' || user?.role === 'admin',
            can,
        }}>
            {children}
        </AuthContext.Provider>
    );
};
