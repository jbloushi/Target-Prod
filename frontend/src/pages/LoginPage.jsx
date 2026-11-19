import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getDefaultLandingPath } from '../utils/uiVersion';

export const LoginPage = () => {
  const [loginMethod, setLoginMethod] = useState('email'); // 'email' | 'phone'
  
  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Phone / OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSuccessMsg, setOtpSuccessMsg] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const { login, loginWithOtp, requestOtp, loading, error, isAuthenticated, user } = useAuth();
  const { lang, toggleLanguage, isRTL } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getDefaultLandingPath(user.role));
    }
  }, [isAuthenticated, user, navigate]);

  // Resend countdown timer effect
  useEffect(() => {
    let interval = null;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [resendTimer]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch {
      // Error handled by AuthContext
    }
  };

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (!phone || phone.trim().length < 7) return;

    try {
      setOtpLoading(true);
      setOtpSuccessMsg('');
      const res = await requestOtp(phone);
      setOtpSent(true);
      setResendTimer(60);
      setOtpSuccessMsg(res.message || (isRTL ? 'تم إرسال رمز التحقق بنجاح' : 'Verification code sent to registered mobile'));
    } catch {
      // Error handled by AuthContext
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.trim().length < 6) return;

    try {
      await loginWithOtp(phone, otp);
    } catch {
      // Error handled by AuthContext
    }
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-base-200/50 bg-target-pattern grid grid-cols-1 lg:grid-cols-2 font-sans selection:bg-primary selection:text-white" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Left Column: Login Form */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 max-w-xl mx-auto w-full min-w-0 z-10">
        {/* Brand Header & Language Switcher */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <Link to="/" className="inline-block">
              <img 
                src="/images/target-logo.png" 
                alt="Target Logistics" 
                className="h-10 sm:h-11 w-auto object-contain dark:hidden" 
              />
              <img 
                src="/images/target-logo-white.png" 
                alt="Target Logistics" 
                className="h-10 sm:h-11 w-auto object-contain hidden dark:block" 
              />
            </Link>
            <div className="text-[11px] font-bold text-primary tracking-widest uppercase mt-2">
              {isRTL ? 'منظومة إدارة الشحن والخدمات اللوجستية' : 'Global Express Operating Suite'}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleLanguage}
            className="btn btn-ghost btn-sm px-2.5 rounded-xl font-extrabold text-xs flex items-center gap-1 border border-base-300/80 hover:bg-base-200 transition-colors shrink-0"
            title={lang === 'en' ? 'التحويل للغة العربية' : 'Switch to English'}
          >
            <span className="material-symbols-outlined text-sm text-primary">translate</span>
            <span className="font-semibold">{lang === 'en' ? '🇰🇼 عربي' : '🇬🇧 EN'}</span>
          </button>
        </div>

        {/* Welcome Text */}
        <div className="space-y-1 mb-6">
          <h1 className="text-3xl sm:text-4xl font-black text-base-content tracking-tight">
            {isRTL ? 'مرحباً بك مجدداً' : 'Welcome back'}
          </h1>
          <p className="text-xs sm:text-sm text-base-content/60">
            {isRTL 
              ? 'سجل الدخول للوصول إلى تتبع الشحنات والبيانات الجمركية ومحاسبة الشحن.' 
              : 'Sign in to access consignment telemetry, customs manifests, and GCC linehauls.'}
          </p>
        </div>

        {/* Method Switcher Tabs */}
        <div className="tabs tabs-boxed bg-base-200/80 p-1 rounded-2xl flex gap-1 mb-6 border border-base-300/60 shadow-xs">
          <button
            type="button"
            onClick={() => setLoginMethod('email')}
            className={`tab flex-1 font-bold text-xs sm:text-sm rounded-xl transition-all ${loginMethod === 'email' ? 'tab-active !bg-primary !text-primary-content shadow-sm' : 'text-base-content/70 hover:text-base-content'}`}
          >
            <span className="material-symbols-outlined text-base me-1.5">mail</span>
            {isRTL ? 'البريد وكلمة المرور' : 'Email & Password'}
          </button>
          <button
            type="button"
            onClick={() => setLoginMethod('phone')}
            className={`tab flex-1 font-bold text-xs sm:text-sm rounded-xl transition-all ${loginMethod === 'phone' ? 'tab-active !bg-primary !text-primary-content shadow-sm' : 'text-base-content/70 hover:text-base-content'}`}
          >
            <span className="material-symbols-outlined text-base me-1.5">smartphone</span>
            {isRTL ? 'رقم الهاتف ورمز OTP' : 'Mobile & OTP'}
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="alert alert-error text-xs py-3 px-4 shadow-sm mb-6 rounded-2xl">
            <span className="material-symbols-outlined text-base">error</span>
            <div className="flex-1 font-bold">
              {typeof error === 'string' ? error : (isRTL ? 'فشل تسجيل الدخول. يرجى التحقق من البيانات.' : 'Authentication failed. Please check credentials.')}
            </div>
          </div>
        )}

        {/* Success / OTP Info Notification */}
        {otpSuccessMsg && loginMethod === 'phone' && (
          <div className="alert alert-success text-xs py-3 px-4 shadow-sm mb-6 rounded-2xl">
            <span className="material-symbols-outlined text-base">verified</span>
            <div className="flex-1 font-bold">
              {otpSuccessMsg}
            </div>
          </div>
        )}

        {/* Option 1: Email & Password Form */}
        {loginMethod === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                {isRTL ? 'البريد الإلكتروني للعمل *' : 'Work Email Address *'}
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute start-3.5 top-1/2 -translate-y-1/2 text-base-content/40 text-lg pointer-events-none">
                  mail
                </span>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="input input-bordered w-full ps-10 pe-4 text-sm font-medium focus:input-primary rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                  {isRTL ? 'كلمة المرور *' : 'Password *'}
                </label>
                <Link to="/forgot-password-v2" className="link link-primary text-xs font-bold">
                  {isRTL ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
                </Link>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute start-3.5 top-1/2 -translate-y-1/2 text-base-content/40 text-lg pointer-events-none">
                  lock
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRTL ? 'أدخل كلمة مرور الحساب' : 'Enter account password'}
                  className="input input-bordered w-full ps-10 pe-10 text-sm font-medium focus:input-primary rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="btn btn-ghost btn-circle btn-xs absolute end-2.5 top-1/2 -translate-y-1/2 text-base-content/40"
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
                className="btn btn-primary w-full font-black text-sm shadow-md shadow-primary/20 gap-2 rounded-xl"
              >
                {loading ? (
                  <>
                    <span className="loading loading-spinner loading-xs" />
                    <span>{isRTL ? 'جاري التحقق...' : 'Authenticating...'}</span>
                  </>
                ) : (
                  <>
                    <span>{isRTL ? 'تسجيل الدخول' : 'Sign In'}</span>
                    <span className="material-symbols-outlined text-lg rtl:rotate-180">arrow_forward</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Option 2: Mobile & OTP Form */}
        {loginMethod === 'phone' && (
          <div className="space-y-4">
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                    {isRTL ? 'رقم الهاتف المسجل *' : 'Registered Mobile Number *'}
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute start-3.5 top-1/2 -translate-y-1/2 text-base-content/40 text-lg pointer-events-none">
                      phone_iphone
                    </span>
                    <input
                      type="tel"
                      required
                      autoFocus
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={isRTL ? 'مثال: 96590001122 أو 90001122' : 'e.g. +965 90001122 or 90001122'}
                      className="input input-bordered w-full ps-10 pe-4 text-sm font-medium focus:input-primary rounded-xl font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-base-content/50 pt-0.5">
                    {isRTL 
                      ? 'سيتم إرسال رمز تحقق مؤقت (OTP) مكون من 6 أرقام إلى هاتفك عبر الواتساب/الرسائل' 
                      : 'A 6-digit one-time verification code will be dispatched to your registered phone via WhatsApp.'}
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={otpLoading || !phone || phone.trim().length < 7}
                    className="btn btn-primary w-full font-black text-sm shadow-md shadow-primary/20 gap-2 rounded-xl"
                  >
                    {otpLoading ? (
                      <>
                        <span className="loading loading-spinner loading-xs" />
                        <span>{isRTL ? 'جاري إرسال الرمز...' : 'Sending Code...'}</span>
                      </>
                    ) : (
                      <>
                        <span>{isRTL ? 'إرسال رمز التحقق' : 'Send Verification Code'}</span>
                        <span className="material-symbols-outlined text-lg">send</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="p-3 bg-base-200/70 rounded-xl border border-base-300 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">smartphone</span>
                    <span className="font-mono font-bold text-base-content">{phone}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtp(''); setOtpSuccessMsg(''); }}
                    className="btn btn-ghost btn-xs text-primary font-bold"
                  >
                    {isRTL ? 'تغيير الرقم' : 'Change'}
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                    {isRTL ? 'رمز التحقق (6 أرقام) *' : '6-Digit Verification Code *'}
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute start-3.5 top-1/2 -translate-y-1/2 text-base-content/40 text-lg pointer-events-none">
                      key
                    </span>
                    <input
                      type="text"
                      required
                      autoFocus
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="• • • • • •"
                      className="input input-bordered w-full ps-10 pe-4 text-center text-lg tracking-[0.4em] font-mono font-black focus:input-primary rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-base-content/60">
                    {isRTL ? 'لم تستلم الرمز؟' : 'Didn\'t receive code?'}
                  </span>
                  {resendTimer > 0 ? (
                    <span className="text-base-content/40 font-mono font-bold">
                      {isRTL ? `إعادة الإرسال بعد ${resendTimer} ثانية` : `Resend in ${resendTimer}s`}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendOtp()}
                      disabled={otpLoading}
                      className="link link-primary font-bold"
                    >
                      {isRTL ? 'إعادة إرسال الرمز' : 'Resend Code'}
                    </button>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || otp.length < 6}
                    className="btn btn-primary w-full font-black text-sm shadow-md shadow-primary/20 gap-2 rounded-xl"
                  >
                    {loading ? (
                      <>
                        <span className="loading loading-spinner loading-xs" />
                        <span>{isRTL ? 'جاري التحقق وتسجيل الدخول...' : 'Verifying & Signing In...'}</span>
                      </>
                    ) : (
                      <>
                        <span>{isRTL ? 'التحقق وتسجيل الدخول' : 'Verify & Sign In'}</span>
                        <span className="material-symbols-outlined text-lg rtl:rotate-180">arrow_forward</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Public Links */}
        <div className="mt-8 pt-6 border-t border-base-200 text-center space-y-3">
          <p className="text-xs text-base-content/60">
            {isRTL ? 'ليس لديك حساب مؤسسي؟' : 'Don\'t have an enterprise account?'}{' '}
            <Link to="/signup" className="link link-primary font-bold">
              {isRTL ? 'إنشاء حساب جديد' : 'Sign Up'}
            </Link>
          </p>
          <div className="flex items-center justify-center gap-4 text-xs font-bold text-base-content/50">
            <Link to="/track" className="hover:text-primary">{isRTL ? 'تتبع شحنة' : 'Track Parcel'}</Link>
            <span>•</span>
            <Link to="/returns" className="hover:text-primary">{isRTL ? 'بوابة الإرجاع' : 'Returns Portal'}</Link>
          </div>
        </div>
      </div>

      {/* Right Column: Hero Graphic Banner (Desktop Only) */}
      <div className="hidden lg:flex min-w-0 w-full relative bg-[#00266e] bg-gradient-to-br from-[#003eaf] via-[#00266e] to-[#0a1628] text-white overflow-hidden p-12 flex-col justify-between">
        {/* Subtle Pattern & Decorative Grid Overlay */}
        <div className="absolute inset-0 bg-target-pattern opacity-15 pointer-events-none" />
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]" />

        {/* Top Floating Badge */}
        <div className="relative z-10 flex items-center justify-between">
          <img 
            src="/images/target-logo-white.png" 
            alt="Target Logistics" 
            className="h-8 w-auto object-contain opacity-95" 
          />
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/60 backdrop-blur-md text-white font-bold text-xs border border-white/15">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>{isRTL ? 'مركز الشرق الأوسط متصل' : 'Middle East Hub Online'}</span>
          </div>
        </div>

        {/* Central Graphic Visual */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold border border-white/25 text-white">
            <span className="material-symbols-outlined text-sm">flight_takeoff</span>
            <span>{isRTL ? 'ممرات الخليج والعالم للشحن السريع' : 'GCC Regional & Worldwide Corridors'}</span>
          </div>
          <h2 className="text-4xl xl:text-5xl font-black leading-tight tracking-tight text-white">
            {isRTL ? 'ذكاء الشحن الجوي والخدمات اللوجستية.' : 'Autonomous Freight & Logistics Intelligence.'}
          </h2>
          <p className="text-sm text-white/85 leading-relaxed">
            {isRTL
              ? 'إدارة الشحنات المتعددة، خطوط النقل البري في دول الخليج، التخليص الجمركي الآلي، وإثبات التسليم الفوري.'
              : 'Consolidated Air Cargo dispatch with DHL Express, LogesTechs GCC linehauls, automated Kuwait customs clearance, and instant touch-screen Proof of Delivery.'}
          </p>

          {/* Stat Badges */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/20 text-white">
            <div>
              <div className="text-2xl font-black font-mono">200+</div>
              <div className="text-[11px] text-white/80 uppercase font-bold">{isRTL ? 'وجهة عالمية' : 'Global Destinations'}</div>
            </div>
            <div>
              <div className="text-2xl font-black font-mono">99.4%</div>
              <div className="text-[11px] text-white/80 uppercase font-bold">{isRTL ? 'التزام بالمواعيد' : 'On-Time Linehaul'}</div>
            </div>
            <div>
              <div className="text-2xl font-black font-mono">Sub-Sec</div>
              <div className="text-[11px] text-white/80 uppercase font-bold">{isRTL ? 'مسح ضوئي فوري' : 'Optical Scanning'}</div>
            </div>
          </div>
        </div>

        {/* Bottom Floating Consignment Radar Card */}
        <div className="relative z-10 p-5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-white/20 text-slate-900 dark:text-slate-100 shadow-2xl flex items-center justify-between gap-4 max-w-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">radar</span>
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">{isRTL ? 'مسار تجاري نشط' : 'Active Trade Route'}</div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-white">{isRTL ? 'الكويت (KWI) ← دبي (DXB)' : 'Kuwait (KWI) → Dubai (DXB)'}</div>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-600 text-white font-bold text-xs whitespace-nowrap">
            {isRTL ? 'قيد النقل المباشر' : 'Live In Flight'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
