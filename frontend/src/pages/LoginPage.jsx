import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isDevelopmentMode, getClientEnv } from '../utils/env';

const DEMO_USERS = [
  { role: 'admin', label: 'Superadmin', tag: 'Full Control', badge: 'badge-primary' },
  { role: 'manager', label: 'Target Owner', tag: 'Executive', badge: 'badge-secondary' },
  { role: 'accounting', label: 'Target Accounting', tag: 'Ledgers & Cash', badge: 'badge-accent' },
  { role: 'staff', label: 'Target Ops Staff', tag: 'Dispatch & Hub', badge: 'badge-info' },
  { role: 'driver', label: 'Courier Driver', tag: 'Kuwait Fleet', badge: 'badge-warning' },
  { role: 'org_manager', label: 'Company Manager', tag: 'Corporate B2B', badge: 'badge-neutral' },
  { role: 'org_agent', label: 'Company Agent', tag: 'Client Staff', badge: 'badge-ghost' },
  { role: 'client', label: 'Direct Shipper', tag: 'Portal User', badge: 'badge-outline' },
  { role: 'dgr', label: 'DGR Specialist', tag: 'IATA Class 3/9', badge: 'badge-error', email: 'dgr@demo.com' },
];

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDevOptions, setShowDevOptions] = useState(false);

  const { login, loading, error, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const isDev = isDevelopmentMode() || getClientEnv('VITE_IS_DEV') === 'true' || getClientEnv('REACT_APP_IS_DEV') === 'true';

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === 'driver' ? '/driver/pickup' : '/dashboard');
    }
  }, [isAuthenticated, user, navigate]);

  const handleLogin = async (emailInput, passInput) => {
    try {
      await login(emailInput, passInput);
    } catch (err) {
      // Error is handled and surfaced by AuthContext
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-base-200/50 flex items-stretch font-sans selection:bg-primary selection:text-white">
      {/* Left Column: Login Form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20 max-w-xl mx-auto w-full z-10">
        {/* Brand Header */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-lg shadow-lg shadow-primary/30">
            TL
          </div>
          <div>
            <div className="font-black text-xl text-base-content leading-tight">Target Logistics</div>
            <div className="text-[11px] font-bold text-primary tracking-widest uppercase">Global Express Operating Suite</div>
          </div>
        </div>

        {/* Welcome Text */}
        <div className="space-y-1 mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-base-content tracking-tight">
            Welcome back
          </h1>
          <p className="text-xs sm:text-sm text-base-content/60">
            Sign in to access consignment telemetry, customs manifests, and GCC linehauls.
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="alert alert-error text-xs py-3 px-4 shadow-sm mb-6">
            <span className="material-symbols-outlined text-base">error</span>
            <div className="flex-1 font-bold">
              {typeof error === 'string' ? error : 'Authentication failed. Please check credentials.'}
            </div>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
              Work Email Address *
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/40 text-lg pointer-events-none">
                mail
              </span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="input input-bordered w-full pl-10 pr-4 text-sm font-medium focus:input-primary"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                Password *
              </label>
              <Link to="/forgot-password" className="link link-primary text-xs font-bold">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/40 text-lg pointer-events-none">
                lock
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter account password"
                className="input input-bordered w-full pl-10 pr-10 text-sm font-medium focus:input-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="btn btn-ghost btn-circle btn-xs absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40"
              >
                <span className="material-symbols-outlined text-base">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="btn btn-primary w-full font-black text-sm shadow-md shadow-primary/20 gap-2"
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Public Links */}
        <div className="mt-8 pt-6 border-t border-base-200 text-center space-y-3">
          <p className="text-xs text-base-content/60">
            Don't have an enterprise account?{' '}
            <Link to="/signup" className="link link-primary font-bold">
              Sign Up
            </Link>
          </p>
          <div className="flex items-center justify-center gap-4 text-xs font-bold text-base-content/50">
            <Link to="/track" className="hover:text-primary">Track Parcel</Link>
            <span>•</span>
            <Link to="/returns" className="hover:text-primary">Returns Portal</Link>
          </div>
        </div>

        {/* Dev Quick Role Switcher */}
        {isDev && (
          <div className="mt-8 pt-4 border-t border-dashed border-base-300">
            <button
              type="button"
              onClick={() => setShowDevOptions(!showDevOptions)}
              className="btn btn-ghost btn-xs w-full text-base-content/50 font-bold gap-1"
            >
              <span className="material-symbols-outlined text-sm">developer_mode</span>
              <span>{showDevOptions ? 'Hide Client Showcase Roles' : 'Show Client Showcase Quick Login (All Roles)'}</span>
            </button>

            {showDevOptions && (
              <div className="p-4 rounded-xl bg-base-200/60 border border-base-300 mt-3 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-base-content/70 uppercase tracking-wider">Demo Accounts (Pass: password123)</span>
                  <span className="badge badge-xs badge-success font-bold">Local Seed Ready</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DEMO_USERS.map((item) => (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => handleLogin(item.email || `${item.role}@demo.com`, 'password123')}
                      className="btn btn-outline border-base-300 hover:border-primary hover:bg-primary/5 h-auto py-2 px-2.5 flex flex-col items-start gap-0.5 normal-case"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-black text-xs text-base-content">{item.label}</span>
                        <span className={`badge badge-xs ${item.badge} text-[9px]`}>{item.tag}</span>
                      </div>
                      <span className="font-mono text-[10px] text-base-content/50 truncate w-full text-left">
                        {item.email || `${item.role}@demo.com`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Column: Hero Graphic Banner (Desktop Only) */}
      <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-primary via-primary-focus to-neutral text-primary-content overflow-hidden p-12 flex-col justify-between">
        {/* Decorative Grid Lines */}
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]" />

        {/* Top Floating Badge */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="badge badge-neutral/80 backdrop-blur-md text-white font-bold text-xs gap-1.5 py-3 px-3">
            <span className="w-2 h-2 rounded-full bg-success animate-ping" />
            <span>Middle East Hub Online</span>
          </div>
          <span className="font-mono text-xs opacity-75">Kuwait City UTC+3</span>
        </div>

        {/* Central Graphic Visual */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-bold border border-white/20">
            <span className="material-symbols-outlined text-sm">flight_takeoff</span>
            <span>GCC Regional & Worldwide Corridors</span>
          </div>
          <h2 className="text-4xl xl:text-5xl font-black leading-tight tracking-tight">
            Autonomous Freight & Logistics Intelligence.
          </h2>
          <p className="text-sm opacity-85 leading-relaxed">
            Consolidated Air Cargo dispatch with DHL Express, LogesTechs GCC linehauls, automated Kuwait customs clearance, and instant touch-screen Proof of Delivery.
          </p>

          {/* Stat Badges */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/20">
            <div>
              <div className="text-2xl font-black font-mono">200+</div>
              <div className="text-[11px] opacity-75 uppercase font-bold">Global Destinations</div>
            </div>
            <div>
              <div className="text-2xl font-black font-mono">99.4%</div>
              <div className="text-[11px] opacity-75 uppercase font-bold">On-Time Linehaul</div>
            </div>
            <div>
              <div className="text-2xl font-black font-mono">Sub-Sec</div>
              <div className="text-[11px] opacity-75 uppercase font-bold">Optical Scanning</div>
            </div>
          </div>
        </div>

        {/* Bottom Floating Consignment Radar Card */}
        <div className="relative z-10 p-5 rounded-2xl bg-base-100/95 backdrop-blur-xl border border-white/20 text-base-content shadow-2xl flex items-center justify-between gap-4 max-w-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">radar</span>
            </div>
            <div>
              <div className="text-[11px] font-bold text-base-content/50 uppercase">Active Trade Route</div>
              <div className="font-extrabold text-sm text-base-content">Kuwait (KWI) &rarr; Dubai (DXB)</div>
            </div>
          </div>
          <span className="badge badge-success badge-sm font-bold text-xs">Live In Flight</span>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
