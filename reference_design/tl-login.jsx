// ═══════════════════════════════════════════════
// Target Logistics — Login Page v2
// ═══════════════════════════════════════════════

const LoginPage = ({ onLogin }) => {
  const [email, setEmail]       = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading]   = React.useState(false);
  const [error, setError]       = React.useState('');
  const [showPw, setShowPw]     = React.useState(false);
  const [pwFocused, setPwFocused] = React.useState(false);
  const w = useWindowWidth();
  const isMobile = w < 768;

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setError('');
    setLoading(true);
    try {
      const { user } = await TL_API.auth.login({ email, password });
      setLoading(false);
      onLogin(user);
    } catch (err) {
      setLoading(false);
      setError(err?.message || 'Sign-in failed. Please try again.');
    }
  };

  const quickLogin = async (u) => {
    setLoading(true);
    try {
      const { user } = await TL_API.auth.login({ email: u.email, password: 'demo' });
      setLoading(false);
      onLogin(user);
    } catch (err) {
      // In live (non-mock) mode the demo creds may not exist — fall back to seeded user shape
      setLoading(false);
      onLogin(u);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'Manrope, sans-serif', background: TK.surface }}>

      {/* ── Left: Form panel ── */}
      <div style={{
        width: isMobile ? '100%' : 460,
        minWidth: isMobile ? 'unset' : 420,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: isMobile ? '40px 24px' : '56px 52px',
        background: '#fff',
        borderRight: isMobile ? 'none' : `1px solid ${TK.border}`,
        position: 'relative', zIndex: 2,
        overflowY: 'auto',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 40 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            background: 'linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 22px rgba(0,80,212,0.26)',
          }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 24, fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15.5, color: TK.text1, letterSpacing: '-0.025em' }}>Target Logistics</div>
            <div style={{ fontWeight: 600, fontSize: 10, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 1 }}>Global Operations</div>
          </div>
        </div>

        {/* Heading */}
        <h1 style={{ fontWeight: 800, fontSize: isMobile ? 24 : 28, color: TK.text1, letterSpacing: '-0.035em', margin: '0 0 8px' }}>
          Welcome back
        </h1>
        <p style={{ fontSize: 14, color: TK.text2, margin: '0 0 30px', lineHeight: 1.7 }}>
          Sign in to access your logistics dashboard and manage shipments globally.
        </p>

        {/* Error */}
        {error && (
          <div style={{
            padding: '11px 14px', borderRadius: 11, marginBottom: 18,
            background: TK.errorBg, border: `1px solid ${TK.error}30`,
            display: 'flex', alignItems: 'center', gap: 9,
            animation: 'tlSlideIn 0.2s ease',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.error, fontVariationSettings: "'FILL' 1", flexShrink: 0 }}>error</span>
            <span style={{ fontSize: 13, color: TK.error, fontWeight: 600 }}>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TLInput
            label="Email Address"
            type="email"
            placeholder="name@company.com"
            icon="mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          {/* Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontWeight: 600, fontSize: 12.5, color: TK.text2 }}>Password</label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 14px', borderRadius: 11,
              border: `1.5px solid ${pwFocused ? TK.primary : TK.border}`,
              background: '#fff',
              boxShadow: pwFocused ? '0 0 0 3px rgba(0,80,212,0.1)' : 'none',
              transition: 'all 0.15s',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: pwFocused ? TK.primary : TK.text3, flexShrink: 0, transition: 'color 0.15s' }}>lock</span>
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setPwFocused(true)}
                onBlur={() => setPwFocused(false)}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: TK.text1, width: '100%' }}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: TK.text3, padding: 0, display: 'flex', flexShrink: 0, transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = TK.text2}
                onMouseLeave={e => e.currentTarget.style.color = TK.text3}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{showPw ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <a href="#" style={{ fontSize: 12.5, color: TK.primary, fontWeight: 700, textDecoration: 'none' }}>Forgot password?</a>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '13px', borderRadius: 12, border: 'none',
              background: loading ? '#c5d3ef' : TK.primary, color: '#fff',
              fontWeight: 800, fontSize: 14.5,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 18px rgba(0,80,212,0.28)',
              transition: 'all 0.2s', marginTop: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = TK.primaryDim; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,80,212,0.36)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={e => { e.currentTarget.style.background = loading ? '#c5d3ef' : TK.primary; e.currentTarget.style.boxShadow = loading ? 'none' : '0 4px 18px rgba(0,80,212,0.28)'; e.currentTarget.style.transform = 'none'; }}
          >
            {loading ? (
              <>
                <span style={{ width: 17, height: 17, border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'tlspin 0.8s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                Signing In…
              </>
            ) : 'Sign In →'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13.5, color: TK.text2 }}>
          Don't have an account?{' '}
          <a href="#" style={{ color: TK.primary, fontWeight: 700, textDecoration: 'none' }}>Contact your administrator</a>
        </p>

        {/* Demo quick login */}
        <div style={{ marginTop: 28, padding: '16px', background: '#f8fafb', borderRadius: 14, border: `1px solid ${TK.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 11 }}>
            Demo Quick Login
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Admin',   name: 'Mohammed Al-Ali',  role: 'admin',   email: 'admin@target.kw' },
              { label: 'Staff',   name: 'Fatima Al-Rashid', role: 'staff',   email: 'staff@target.kw' },
              { label: 'Manager', name: 'Khalid Al-Sabah',  role: 'manager', email: 'manager@target.kw' },
              { label: 'Client',  name: 'Ahmad Hassan',     role: 'client',  email: 'client@target.kw' },
            ].map(u => (
              <button
                key={u.label}
                onClick={() => quickLogin(u)}
                style={{
                  padding: '9px', borderRadius: 10, border: `1px solid ${TK.border}`,
                  background: '#fff', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, color: TK.text2,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = TK.primary; e.currentTarget.style.color = TK.primary; e.currentTarget.style.background = TK.primaryBg; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = TK.border; e.currentTarget.style.color = TK.text2; e.currentTarget.style.background = '#fff'; }}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: Hero ── */}
      {!isMobile && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f0f5fb' }}>
          {/* Grid pattern */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.6 }} preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="loginGrid" patternUnits="userSpaceOnUse" width="48" height="48">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#d0dcef" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#loginGrid)" />
          </svg>
          {/* Blue radial glow */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 60% 35%, rgba(0,80,212,0.09) 0%, transparent 70%)' }} />

          {/* Hero content */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px' }}>
            <div style={{ textAlign: 'center', maxWidth: 400 }}>
              {/* Icon */}
              <div style={{
                width: 84, height: 84, borderRadius: 26, margin: '0 auto 28px',
                background: 'linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 20px 50px rgba(0,80,212,0.24)',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 44, color: '#fff', fontVariationSettings: "'FILL' 1" }}>public</span>
              </div>
              <h2 style={{ fontWeight: 800, fontSize: 26, color: TK.text1, letterSpacing: '-0.03em', margin: '0 0 12px', lineHeight: 1.2 }}>
                200+ Countries.<br />One Platform.
              </h2>
              <p style={{ fontSize: 14.5, color: TK.text2, lineHeight: 1.75, margin: '0 0 36px' }}>
                Manage your entire logistics operation from Kuwait to the world with real-time visibility at every step.
              </p>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 0, background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, overflow: 'hidden', boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
                {[
                  { value: '1,247', label: 'Active Shipments' },
                  { value: '99.2%', label: 'On-Time Rate'     },
                  { value: '24/7',  label: 'Live Support'     },
                ].map((s, i) => (
                  <div key={i} style={{
                    flex: 1, padding: '18px 12px', textAlign: 'center',
                    borderRight: i < 2 ? `1px solid ${TK.border}` : 'none',
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 20, color: TK.text1, letterSpacing: '-0.03em' }}>{s.value}</div>
                    <div style={{ fontSize: 10.5, color: TK.text3, fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom glass card */}
          <div style={{
            position: 'absolute', bottom: 40, left: 40, right: 40,
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(169,174,177,0.18)',
            borderRadius: 20, padding: '18px 22px',
            boxShadow: '0 8px 36px rgba(0,0,0,0.07)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 10, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Origin</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: TK.primary, letterSpacing: '-0.01em' }}>KUWAIT</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['AE','SA','GB','DE','SG','JP','US','FR'].map(c => (
                  <div key={c} style={{
                    width: 28, height: 22, borderRadius: 5, background: TK.primaryBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, color: TK.primary, letterSpacing: '0.02em',
                  }}>{c}</div>
                ))}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600, fontSize: 10, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Coverage</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: TK.text1 }}>200+ COUNTRIES</div>
              </div>
            </div>
            <div style={{ height: 5, background: TK.border, borderRadius: 99, overflow: 'hidden', marginBottom: 11 }}>
              <div style={{ height: '100%', width: '72%', background: 'linear-gradient(90deg, #0EA5E9, #2563EB)', borderRadius: 99 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: TK.success, boxShadow: `0 0 8px ${TK.success}80`, display: 'inline-block', animation: 'tlPulse 2s infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: TK.success, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Tracking Active</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { LoginPage });
