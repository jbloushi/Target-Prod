// ═══════════════════════════════════════════════
// Target Logistics — Shared UI Components v2
// Design System: Kinetic Horizon (Light-first)
// ═══════════════════════════════════════════════

const TK = {
  primary: '#0050d4',
  primaryBg: '#ebf0fc',
  primaryDim: '#003eaf',
  surface: '#f3f7fb',
  card: '#ffffff',
  border: '#e9edf2',
  text1: '#1a1f23',
  text2: '#575c60',
  text3: '#a9aeb1',
  success: '#0a6e4f',
  successBg: '#e7f5ef',
  warning: '#924d0a',
  warningBg: '#fef3e2',
  error: '#b31b25',
  errorBg: '#fdf0f0',
  info: '#0369a1',
  infoBg: '#e0f2fe',
  purple: '#6d28d9',
  purpleBg: '#ede9fe'
};

const STATUS_CFG = {
  draft: { label: 'Draft', color: TK.text2, bg: '#f0f2f4' },
  pending: { label: 'Pending', color: '#b45309', bg: '#fef3c7' },
  updated: { label: 'Updated', color: TK.primary, bg: TK.primaryBg },
  ready_for_pickup: { label: 'Ready for Pickup', color: TK.info, bg: TK.infoBg },
  picked_up: { label: 'Picked Up', color: TK.info, bg: '#dbeafe' },
  created: { label: 'Created', color: TK.primary, bg: TK.primaryBg },
  in_transit: { label: 'In Transit', color: TK.primary, bg: TK.primaryBg },
  out_for_delivery: { label: 'Out for Delivery', color: '#059669', bg: '#d1fae5' },
  delivered: { label: 'Delivered', color: TK.success, bg: TK.successBg },
  completed: { label: 'Completed', color: TK.success, bg: TK.successBg },
  exception: { label: 'Exception', color: TK.error, bg: TK.errorBg },
  cancelled: { label: 'Cancelled', color: TK.text3, bg: '#f0f2f4' }
};

// ── Responsive hook ──────────────────────────────
const useWindowWidth = () => {
  const [w, setW] = React.useState(window.innerWidth);
  React.useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
};

// ── StatusPill ──────────────────────────────────
const StatusPill = ({ status }) => {
  const cfg = STATUS_CFG[status] || STATUS_CFG.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 99,
      fontSize: 11, fontWeight: 700,
      color: cfg.color, background: cfg.bg,
      whiteSpace: 'nowrap', letterSpacing: '0.01em'
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>);

};

// ── Nav items ────────────────────────────────────
const NAV_ITEMS = [
{ label: 'Dashboard', icon: 'speed', page: 'dashboard' },
{ label: 'Shipments', icon: 'local_shipping', page: 'shipments' },
{ label: 'Organizations', icon: 'corporate_fare', page: null },
{ label: 'Users', icon: 'people', page: null },
{ label: 'Address Book', icon: 'menu_book', page: null },
{ label: 'Financials', icon: 'account_balance_wallet', page: null },
{ label: 'API Docs', icon: 'api', page: null },
{ label: 'Settings', icon: 'settings', page: null }];


// ── NavItem ─────────────────────────────────────
const NavItem = ({ item, isActive, collapsed, onClick }) => {
  const [hov, setHov] = React.useState(false);
  const canClick = !!item.page;
  return (
    <button
      onClick={() => canClick && onClick(item.page)}
      title={collapsed ? item.label : ''}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center',
        gap: 11,
        padding: collapsed ? '11px 0' : '10px 13px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 12, border: 'none',
        cursor: canClick ? 'pointer' : 'default',
        background: isActive ?
        TK.primaryBg :
        hov && canClick ? '#f5f7fa' : 'transparent',
        color: isActive ?
        TK.primary :
        hov && canClick ? TK.text1 : TK.text2,
        fontWeight: isActive ? 700 : 500, fontSize: 13.5,
        transition: 'background 0.15s, color 0.15s', width: '100%',
        opacity: !canClick ? 0.45 : 1,
        position: 'relative'
      }}>
      
      {isActive && !collapsed &&
      <span style={{
        position: 'absolute', left: 0, top: '20%', bottom: '20%',
        width: 3, borderRadius: 99, background: TK.primary
      }} />
      }
      <span className="material-symbols-outlined" style={{
        fontSize: 21, flexShrink: 0,
        fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
        transition: 'font-variation-settings 0.2s'
      }}>{item.icon}</span>
      {!collapsed &&
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.label}
        </span>
      }
    </button>);

};

// ── Sidebar ─────────────────────────────────────
const Sidebar = ({ collapsed, onToggle, currentPage, onNavigate, user, mobile, drawerOpen, onDrawerClose }) => {
  const [colHov, setColHov] = React.useState(false);
  const showFull = mobile ? true : !collapsed;

  const sidebarW = mobile ? 260 : collapsed ? 72 : 228;

  return (
    <aside style={{
      width: sidebarW,
      minWidth: sidebarW,
      height: '100vh',
      position: 'fixed', left: 0, top: 0,
      background: '#ffffff',
      borderRight: `1px solid ${TK.border}`,
      display: 'flex', flexDirection: 'column',
      padding: '18px 0 12px',
      transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1), transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      zIndex: 200,
      overflowX: 'hidden',
      transform: mobile && !drawerOpen ? 'translateX(-100%)' : 'translateX(0)',
      boxShadow: mobile && drawerOpen ? '4px 0 32px rgba(0,0,0,0.14)' : 'none'
    }}>
      {/* Logo */}
      <div style={{ padding: '0 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: collapsed && !mobile ? 'center' : 'space-between' }}>
        <div
          onClick={() => {onNavigate('dashboard');if (mobile) onDrawerClose();}}
          style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer', minWidth: 0 }}>
          
          <div style={{
            width: 38, height: 38, flexShrink: 0, borderRadius: 11,
            background: 'linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,80,212,0.26)'
          }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 21, fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
          </div>
          {showFull &&
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: TK.text1, letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>
                Target Logistics
              </div>
              <div style={{ fontWeight: 600, fontSize: 10, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                Global Suite
              </div>
            </div>
          }
        </div>
        {mobile &&
        <button onClick={onDrawerClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: TK.text3, padding: 4, display: 'flex', borderRadius: 8, flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        }
      </div>

      {/* Section label */}
      {showFull &&
      <div style={{ padding: '0 20px 8px', fontWeight: 700, fontSize: 9.5, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Navigation
        </div>
      }

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV_ITEMS.map((item) =>
        <NavItem
          key={item.label}
          item={item}
          isActive={currentPage === item.page}
          collapsed={collapsed && !mobile}
          onClick={(p) => {onNavigate(p);if (mobile) onDrawerClose();}} />

        )}
      </nav>

      {/* Footer */}
      <div style={{ padding: '8px 10px 0', display: 'flex', flexDirection: 'column', gap: 2, borderTop: `1px solid ${TK.border}`, marginTop: 8 }}>
        {!mobile &&
        <button
          onMouseEnter={() => setColHov(true)}
          onMouseLeave={() => setColHov(false)}
          onClick={onToggle}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: collapsed ? '10px 0' : '9px 13px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 12, border: 'none', cursor: 'pointer',
            background: colHov ? '#f5f7fa' : 'transparent',
            color: colHov ? TK.text2 : TK.text3,
            fontWeight: 500, fontSize: 13,
            transition: 'background 0.12s', width: '100%'
          }}>
          
            <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0, transition: 'transform 0.25s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
              chevron_left
            </span>
            {!collapsed && <span>Collapse</span>}
          </button>
        }

        {/* User card */}
        <div style={{
          padding: collapsed && !mobile ? '10px 0' : '10px 13px',
          display: 'flex', alignItems: 'center',
          gap: 10, justifyContent: collapsed && !mobile ? 'center' : 'flex-start',
          background: '#f8fafb', borderRadius: 13, marginTop: 4
        }}>
          <div style={{
            width: 34, height: 34, flexShrink: 0, borderRadius: 9,
            background: 'linear-gradient(135deg, #ebf0fc 0%, #dbeafe 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 13.5, color: TK.primary, letterSpacing: '-0.01em'
          }}>
            {user?.name?.[0] || 'U'}
          </div>
          {showFull &&
          <div style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || 'User'}
              </div>
              <div style={{ fontWeight: 500, fontSize: 10.5, color: TK.text3, textTransform: 'capitalize' }}>
                {user?.role || 'Member'}
              </div>
            </div>
          }
          {showFull &&
          <span className="material-symbols-outlined" style={{ fontSize: 17, color: TK.text3, flexShrink: 0 }}>unfold_more</span>
          }
        </div>
      </div>
    </aside>);

};

// ── TopBar ──────────────────────────────────────
const TopBar = ({ onNavigate, user, onMenuToggle, isMobile }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [searchFocused, setSearchFocused] = React.useState(false);
  const [searchVal, setSearchVal] = React.useState('');

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    setTimeout(() => document.addEventListener('click', close), 0);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  return (
    <header style={{
      height: isMobile ? 56 : 62,
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(243,247,251,0.95)', backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderBottom: `1px solid ${TK.border}`,
      display: 'flex', alignItems: 'center',
      padding: isMobile ? '0 14px' : '0 24px',
      gap: isMobile ? 10 : 14, flexShrink: 0
    }}>
      {/* Mobile hamburger */}
      {isMobile &&
      <button
        onClick={onMenuToggle}
        style={{
          width: 36, height: 36, borderRadius: 10,
          border: `1px solid ${TK.border}`, background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: TK.text2, flexShrink: 0
        }}>
        
          <span className="material-symbols-outlined" style={{ fontSize: 21 }}>menu</span>
        </button>
      }

      {/* Brand on mobile */}
      {isMobile &&
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
          width: 30, height: 30, borderRadius: 9,
          background: 'linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 17, fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: 13.5, color: TK.text1, letterSpacing: '-0.02em' }}>Target Logistics</span>
        </div>
      }

      {/* Search — hidden on mobile unless we expand */}
      {!isMobile &&
      <div style={{
        flex: 1, maxWidth: 400,
        display: 'flex', alignItems: 'center', gap: 9,
        background: searchFocused ? '#fff' : '#f5f7fa',
        border: `1.5px solid ${searchFocused ? TK.primary : 'transparent'}`,
        borderRadius: 11, padding: '7px 14px',
        transition: 'all 0.18s',
        boxShadow: searchFocused ? '0 0 0 3px rgba(0,80,212,0.1)' : 'none'
      }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: searchFocused ? TK.primary : TK.text3, transition: 'color 0.15s' }}>search</span>
          <input
          placeholder="Search shipments, tracking IDs..."
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13, color: TK.text1, width: '100%'
          }} />
        
          {searchVal &&
        <button onClick={() => setSearchVal('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: TK.text3, padding: 0, display: 'flex', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </button>
        }
          {!searchVal &&
        <span style={{
          fontSize: 10.5, color: TK.text3,
          background: '#e9edf2', padding: '2px 6px', borderRadius: 5, whiteSpace: 'nowrap', flexShrink: 0
        }}>⌘K</span>
        }
        </div>
      }

      <div style={{ flex: 1 }} />

      {/* Balance chip */}
      {!isMobile &&
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '7px 14px', borderRadius: 99,
        background: TK.primaryBg, color: TK.primary,
        fontWeight: 700, fontSize: 13,
        whiteSpace: 'nowrap', border: `1px solid ${TK.primary}22`
      }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>account_balance_wallet</span>
          248.500 KD
        </div>
      }

      {/* Notifications */}
      <button style={{
        width: 36, height: 36, borderRadius: 10,
        border: `1px solid ${TK.border}`, background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: TK.text2, position: 'relative',
        transition: 'all 0.15s',
        flexShrink: 0
      }}
      onMouseEnter={(e) => {e.currentTarget.style.background = '#f5f7fa';e.currentTarget.style.borderColor = TK.text3;}}
      onMouseLeave={(e) => {e.currentTarget.style.background = '#fff';e.currentTarget.style.borderColor = TK.border;}}>
        
        <span className="material-symbols-outlined" style={{ fontSize: 19 }}>notifications</span>
        <span style={{ position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: TK.error, border: '1.5px solid #fff' }} />
      </button>

      {/* New Shipment — icon-only on mobile */}
      <button
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: isMobile ? '9px' : '9px 16px',
          borderRadius: 10, border: 'none',
          background: TK.primary, color: '#fff',
          fontWeight: 700, fontSize: 13,
          cursor: 'pointer', whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,80,212,0.22)',
          transition: 'all 0.15s', flexShrink: 0
        }}
        onMouseEnter={(e) => {e.currentTarget.style.background = TK.primaryDim;e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,80,212,0.3)';}}
        onMouseLeave={(e) => {e.currentTarget.style.background = TK.primary;e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,80,212,0.22)';}}>
        
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
        {!isMobile && 'New Shipment'}
      </button>

      {/* User avatar + menu */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={(e) => {e.stopPropagation();setMenuOpen(!menuOpen);}}
          style={{
            width: 36, height: 36, borderRadius: 10,
            border: `1.5px solid ${menuOpen ? TK.primary : TK.border}`,
            background: menuOpen ? TK.primaryBg : '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 13.5, color: TK.primary,
            transition: 'all 0.15s'
          }}>
          
          {user?.name?.[0] || 'A'}
        </button>

        {menuOpen &&
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            background: '#fff', border: `1px solid ${TK.border}`,
            borderRadius: 14, boxShadow: '0 12px 36px rgba(0,0,0,0.11)',
            minWidth: 196, zIndex: 300, overflow: 'hidden'
          }}>
          
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${TK.border}` }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>{user?.name || 'User'}</div>
              <div style={{ fontSize: 11.5, color: TK.text3, marginTop: 2 }}>{user?.email || `${user?.role}@target.kw`}</div>
            </div>
            {[
          { icon: 'person', label: 'My Profile' },
          { icon: 'settings', label: 'Settings' },
          { icon: 'help', label: 'Help & Support' }].
          map((item) =>
          <button key={item.label}
          style={{
            width: '100%', padding: '9px 16px', border: 'none', background: 'transparent',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 13, color: TK.text1, cursor: 'pointer', textAlign: 'left',
            transition: 'background 0.12s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#f5f7fa'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: TK.text3 }}>{item.icon}</span>
                {item.label}
              </button>
          )}
            <div style={{ height: 1, background: TK.border }} />
            <button
            style={{
              width: '100%', padding: '9px 16px', border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13, color: TK.error, cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.12s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = TK.errorBg}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            onClick={() => onNavigate('login')}>
            
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>logout</span>
              Sign Out
            </button>
          </div>
        }
      </div>
    </header>);

};

// ── TLButton ────────────────────────────────────
const TLButton = ({ children, variant = 'primary', onClick, style, disabled, icon, small }) => {
  const [hov, setHov] = React.useState(false);
  const pad = small ? '6px 13px' : '9px 18px';

  const variants = {
    primary: {
      background: disabled ? '#c5d3ef' : hov ? TK.primaryDim : TK.primary,
      color: '#fff', border: 'none',
      boxShadow: hov && !disabled ? '0 6px 16px rgba(0,80,212,0.3)' : '0 2px 6px rgba(0,80,212,0.16)'
    },
    secondary: {
      background: hov ? '#f0f2f5' : '#fff',
      color: TK.text1, border: `1px solid ${TK.border}`,
      boxShadow: 'none'
    },
    ghost: {
      background: hov ? '#f5f7fa' : 'transparent',
      color: TK.text2, border: 'none', boxShadow: 'none'
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: pad, borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700, fontSize: small ? 12 : 13,
        transition: 'all 0.15s', ...variants[variant], ...style
      }}>
      
      {icon && <span className="material-symbols-outlined" style={{ fontSize: small ? 15 : 17 }}>{icon}</span>}
      {children}
    </button>);

};

// ── TLInput ─────────────────────────────────────
const TLInput = ({ label, placeholder, type = 'text', value, onChange, icon }) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label &&
      <label style={{ fontWeight: 600, fontSize: 12.5, color: TK.text2 }}>{label}</label>
      }
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 14px', borderRadius: 11,
        border: `1.5px solid ${focused ? TK.primary : TK.border}`,
        background: '#fff',
        boxShadow: focused ? '0 0 0 3px rgba(0,80,212,0.1)' : 'none',
        transition: 'all 0.15s'
      }}>
        {icon &&
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: focused ? TK.primary : TK.text3, transition: 'color 0.15s', flexShrink: 0 }}>
            {icon}
          </span>
        }
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13.5, color: TK.text1, width: '100%'
          }} />
        
      </div>
    </div>);

};

// ── Skeleton loader ─────────────────────────────
const Skeleton = ({ w = '100%', h = 16, r = 8 }) =>
<div style={{
  width: w, height: h, borderRadius: r,
  background: 'linear-gradient(90deg, #f0f2f4 25%, #e5e9ed 50%, #f0f2f4 75%)',
  backgroundSize: '200% 100%',
  animation: 'tlSkeleton 1.4s ease-in-out infinite',
  flexShrink: 0
}} />;


Object.assign(window, {
  TK, STATUS_CFG, StatusPill, Sidebar, TopBar, TLButton, TLInput, Skeleton, useWindowWidth
});