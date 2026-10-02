// Kinetic Horizon Design System Tokens
// Aligns with Target Logistics design specification (Target-Prod.zip)

export const TK = {
  // Brand Colors
  primary: '#0050d4',
  primaryDark: '#003eaf',
  primaryLight: '#2563eb',
  primaryBg: '#ebf0fc',
  primaryHover: 'rgba(0, 80, 212, 0.08)',

  // Neutral Background & Surface
  surface: '#f3f7fb',
  surfaceAlt: '#eef2f6',
  card: '#ffffff',
  cardHover: '#fafbfc',
  cardElevated: '#ffffff',
  border: '#e9edf2',
  borderDark: '#d0d7de',

  // Typography
  text1: '#1a1f23', // Primary high-contrast
  text2: '#575c60', // Secondary / labels
  text3: '#8c9196', // Tertiary / captions / disabled
  textInverse: '#ffffff',

  // Semantic Status & Feedback
  success: '#059669',
  successBg: '#d1fae5',
  successBorder: '#a7f3d0',

  warning: '#d97706',
  warningBg: '#fef3c7',
  warningBorder: '#fde68a',

  error: '#dc2626',
  danger: '#ef4444',
  errorBg: '#fee2e2',
  errorBorder: '#fecaca',

  info: '#0284c7',
  infoBg: '#e0f2fe',
  infoBorder: '#bae6fd',

  purple: '#7c3aed',
  purpleBg: '#ede9fe',
  purpleBorder: '#ddd6fe',

  amber: '#b45309',
  amberBg: '#fef3c7',

  // Geometry & Radiuses
  radiusSm: 8,
  radiusMd: 12,
  radiusCard: 18,
  radiusLg: 22,
  radiusPill: 99,

  // Shadows
  shadowSm: '0 1px 4px rgba(0,0,0,0.04)',
  shadowMd: '0 4px 16px rgba(0,0,0,0.06)',
  shadowLg: '0 12px 36px rgba(0,0,0,0.10)',
  shadowElevated: '0 20px 48px rgba(0,0,0,0.12)',
  shadowModal: '0 32px 80px rgba(0,0,0,0.22)',
};

// Standardized Operational Status Signal Maps
export const STATUS_CONFIG = {
  draft: {
    label: 'Draft',
    color: '#0f172a',
    dotColor: '#64748b',
    bg: '#f1f5f9',
    border: '#cbd5e1',
    icon: 'edit_note'
  },
  pending: {
    label: 'Pending Gate',
    color: '#78350f',
    dotColor: '#d97706',
    bg: '#fef3c7',
    border: '#fde68a',
    icon: 'pending'
  },
  pending_approval: {
    label: 'Pending Approval',
    color: '#701a75',
    dotColor: '#c026d3',
    bg: '#fae8ff',
    border: '#f5d0fe',
    icon: 'verified_user'
  },
  ready_for_pickup: {
    label: 'Ready for Pickup',
    color: '#082f49',
    dotColor: '#0284c7',
    bg: '#e0f2fe',
    border: '#7dd3fc',
    icon: 'schedule'
  },
  picked_up: {
    label: 'Picked Up',
    color: '#1e1b4b',
    dotColor: '#6366f1',
    bg: '#e0e7ff',
    border: '#a5b4fc',
    icon: 'inventory'
  },
  created: {
    label: 'Manifest Created',
    color: '#172554',
    dotColor: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    icon: 'add_circle'
  },
  in_transit: {
    label: 'In Transit',
    color: '#1e3a8a',
    dotColor: '#2563eb',
    bg: '#dbeafe',
    border: '#93c5fd',
    icon: 'flight'
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    color: '#064e3b',
    dotColor: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    icon: 'local_shipping'
  },
  delivered: {
    label: 'Delivered',
    color: '#064e3b',
    dotColor: '#10b981',
    bg: '#dcfce7',
    border: '#86efac',
    icon: 'check_circle'
  },
  completed: {
    label: 'Completed',
    color: '#064e3b',
    dotColor: '#10b981',
    bg: '#dcfce7',
    border: '#86efac',
    icon: 'task_alt'
  },
  exception: {
    label: 'Exception / Hold',
    color: '#881337',
    dotColor: '#e11d48',
    bg: '#fee2e2',
    border: '#fca5a5',
    icon: 'warning'
  },
  cancelled: {
    label: 'Cancelled',
    color: '#111827',
    dotColor: '#6b7280',
    bg: '#f3f4f6',
    border: '#d1d5db',
    icon: 'cancel'
  }
};

export default TK;
