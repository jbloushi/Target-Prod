import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const SignupPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    company: '',
    phone: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');

  const { register, loading, error, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (validationError) setValidationError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setValidationError('Passwords do not match.');
      return;
    }
    if (formData.password.length < 8) {
      setValidationError('Password must be at least 8 characters.');
      return;
    }

    try {
      await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        company: formData.company,
        phone: formData.phone,
        role: 'client',
      });
    } catch (err) {
      // Handled by AuthContext
    }
  };

  const activeError = validationError || (typeof error === 'string' ? error : error?.message);

  return (
    <div className="min-h-screen bg-base-200/50 flex items-stretch font-sans selection:bg-primary selection:text-white">
      {/* Left Column: Registration Form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20 max-w-xl mx-auto w-full z-10">
        {/* Brand Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-lg shadow-lg shadow-primary/30">
            TL
          </div>
          <div>
            <div className="font-black text-xl text-base-content leading-tight">Target Logistics</div>
            <div className="text-[11px] font-bold text-primary tracking-widest uppercase">Shipper Onboarding</div>
          </div>
        </div>

        {/* Welcome Text */}
        <div className="space-y-1 mb-6">
          <h1 className="text-3xl font-black text-base-content tracking-tight">
            Create Shipper Account
          </h1>
          <p className="text-xs sm:text-sm text-base-content/60">
            Join Kuwait's premier logistics network for worldwide express air cargo and GCC corridors.
          </p>
        </div>

        {/* Error Notification */}
        {activeError && (
          <div className="alert alert-error text-xs py-3 px-4 shadow-sm mb-6">
            <span className="material-symbols-outlined text-base">error</span>
            <div className="flex-1 font-bold">{activeError}</div>
          </div>
        )}

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                Full Name *
              </label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Bader Al-Ahmad"
                className="input input-bordered input-sm w-full text-xs font-medium focus:input-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                Company Name
              </label>
              <input
                type="text"
                name="company"
                value={formData.company}
                onChange={handleChange}
                placeholder="e.g. Al-Bader Trading"
                className="input input-bordered input-sm w-full text-xs font-medium focus:input-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                Work Email *
              </label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="name@company.com"
                className="input input-bordered input-sm w-full text-xs font-medium focus:input-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                Phone Number *
              </label>
              <input
                type="text"
                name="phone"
                required
                value={formData.phone}
                onChange={handleChange}
                placeholder="+965 9000 0000"
                className="input input-bordered input-sm w-full font-mono text-xs focus:input-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Min 8 characters"
                  className="input input-bordered input-sm w-full text-xs focus:input-primary pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="btn btn-ghost btn-circle btn-xs absolute right-1.5 top-1/2 -translate-y-1/2 text-base-content/40"
                >
                  <span className="material-symbols-outlined text-xs">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                Confirm Password *
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                name="confirmPassword"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter password"
                className="input input-bordered input-sm w-full text-xs focus:input-primary"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full font-black text-sm shadow-md shadow-primary/20 gap-2"
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <span>Create Account & Start Shipping</span>
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Public Links */}
        <div className="mt-8 pt-6 border-t border-base-200 text-center space-y-3">
          <p className="text-xs text-base-content/60">
            Already have an enterprise account?{' '}
            <Link to="/login" className="link link-primary font-bold">
              Sign In
            </Link>
          </p>
        </div>
      </div>

      {/* Right Column: Hero Graphic Banner (Desktop Only) */}
      <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-primary via-primary-focus to-neutral text-primary-content overflow-hidden p-12 flex-col justify-between">
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="badge badge-neutral/80 backdrop-blur-md text-white font-bold text-xs gap-1.5 py-3 px-3">
            <span className="w-2 h-2 rounded-full bg-success animate-ping" />
            <span>Instant Dispatch Approval</span>
          </div>
          <span className="font-mono text-xs opacity-75">Kuwait City UTC+3</span>
        </div>

        <div className="relative z-10 max-w-lg space-y-6">
          <h2 className="text-4xl xl:text-5xl font-black leading-tight tracking-tight">
            Connect Your Business to the World.
          </h2>
          <p className="text-sm opacity-85 leading-relaxed">
            Instant AWB label generation, automated commercial invoices, Dangerous Goods IATA documentation, and live corridor radar.
          </p>
        </div>

        <div className="relative z-10 p-5 rounded-2xl bg-base-100/95 backdrop-blur-xl border border-white/20 text-base-content shadow-2xl flex items-center justify-between gap-4 max-w-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">verified</span>
            </div>
            <div>
              <div className="text-[11px] font-bold text-base-content/50 uppercase">Zero Platform Fees</div>
              <div className="font-extrabold text-sm text-base-content">Transparent Carrier Billing</div>
            </div>
          </div>
          <span className="badge badge-primary badge-sm font-bold text-xs">Live B2B Rate</span>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
