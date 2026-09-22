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
    color: '#6b7280',
    bg: '#f3f4f6',
    border: '#e5e7eb',
    icon: 'edit_note'
  },
  pending: {
    label: 'Pending Gate',
    color: '#b45309',
    bg: '#fef3c7',
    border: '#fde68a',
    icon: 'pending'
  },
  ready_for_pickup: {
    label: 'Ready for Pickup',
    color: '#0284c7',
    bg: '#e0f2fe',
    border: '#bae6fd',
    icon: 'schedule'
  },
  picked_up: {
    label: 'Picked Up',
    color: '#0284c7',
    bg: '#e0f2fe',
    border: '#bae6fd',
    icon: 'inventory'
  },
  created: {
    label: 'Manifest Created',
    color: '#0050d4',
    bg: '#ebf0fc',
    border: '#c7d7fe',
    icon: 'add_circle'
  },
  in_transit: {
    label: 'In Transit',
    color: '#0050d4',
    bg: '#ebf0fc',
    border: '#c7d7fe',
    icon: 'flight'
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    color: '#059669',
    bg: '#d1fae5',
    border: '#a7f3d0',
    icon: 'local_shipping'
  },
  delivered: {
    label: 'Delivered',
    color: '#059669',
    bg: '#d1fae5',
    border: '#a7f3d0',
    icon: 'check_circle'
  },
  completed: {
    label: 'Completed',
    color: '#059669',
    bg: '#d1fae5',
    border: '#a7f3d0',
    icon: 'task_alt'
  },
  exception: {
    label: 'Exception / Hold',
    color: '#dc2626',
    bg: '#fee2e2',
    border: '#fecaca',
    icon: 'warning'
  },
  cancelled: {
    label: 'Cancelled',
    color: '#6b7280',
    bg: '#f3f4f6',
    border: '#e5e7eb',
    icon: 'cancel'
  }
};

export default TK;
