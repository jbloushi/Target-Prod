import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'target_modules_config_v1';

export const DEFAULT_MODULES = {
  analytics: {
    id: 'analytics',
    label: 'Analytics & BI',
    labelAr: 'التحليلات والتقارير',
    description: 'Executive volume, cost per kg, and carrier split analytics.',
    descriptionAr: 'تحليلات حجم الشحن المتقدمة وهوامش الربح وتوزيع الناقلين.',
    path: '/analytics',
    enabled: true,
    tier: 'ENTERPRISE',
    icon: 'insights',
    badgeColor: 'badge-primary',
  },
  fleets: {
    id: 'fleets',
    label: 'Fleet Telemetry',
    labelAr: 'تتبع الأسطول المباشر',
    description: 'Real-time GPS vehicle tracking, geofencing, and OBD telemetry.',
    descriptionAr: 'تتبع الشاحنات اللحظي عبر الأقمار الصناعية واستهلاك الوقود.',
    path: '/fleets',
    enabled: true,
    tier: 'ENTERPRISE',
    icon: 'directions_car',
    badgeColor: 'badge-accent',
  },
  drivers: {
    id: 'drivers',
    label: 'Driver Dispatch',
    labelAr: 'إدارة السائقين والمناديب',
    description: 'Live courier manifests, route optimization, and ePOD tracking.',
    descriptionAr: 'توزيع المناديب الذكي وتحسين مسارات التوصيل وإثبات التسليم.',
    path: '/drivers',
    enabled: true,
    tier: 'ENTERPRISE',
    icon: 'badge',
    badgeColor: 'badge-secondary',
  },
  warehouse: {
    id: 'warehouse',
    label: 'Smart Warehouse',
    labelAr: 'المستودع الذكي والتخزين',
    description: 'Automated bin allocations, zone management, and pallet telemetry.',
    descriptionAr: 'إدارة الأرفف والمخزون والتوزيع الآلي للطرود داخل المستودع.',
    path: '/warehouse',
    enabled: true,
    tier: 'ENTERPRISE',
    icon: 'warehouse',
    badgeColor: 'badge-warning',
  },
  calendar: {
    id: 'calendar',
    label: 'Dispatch Calendar',
    labelAr: 'جدول المواعيد والترحيل',
    description: 'Scheduled multi-leg air cargo slots and customs booking.',
    descriptionAr: 'جدولة حجوزات الشحن الجوي والنافذة الجمركية للمواعيد.',
    path: '/calendar',
    enabled: false,
    tier: 'PRO',
    icon: 'calendar_month',
    badgeColor: 'badge-info',
  },
  messages: {
    id: 'messages',
    label: 'Communications Hub',
    labelAr: 'مركز المراسلات الموحد',
    description: 'Omnichannel client communication with Meta WhatsApp Cloud gateway.',
    descriptionAr: 'مركز المراسلات الموحد مع العملاء والربط المباشر مع واتساب.',
    path: '/messages',
    enabled: false,
    tier: 'PRO',
    icon: 'chat',
    badgeColor: 'badge-info',
  },
};

const ModuleContext = createContext(null);

export const useModules = () => {
  const context = useContext(ModuleContext);
  if (!context) {
    throw new Error('useModules must be used within a ModuleProvider');
  }
  return context;
};

export const ModuleProvider = ({ children }) => {
  const [modules, setModules] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure all keys exist
        return { ...DEFAULT_MODULES, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load module config from storage:', e);
    }
    return DEFAULT_MODULES;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
    } catch (e) {
      console.error('Failed to persist module config:', e);
    }
  }, [modules]);

  const toggleModule = (moduleId) => {
    setModules((prev) => {
      if (!prev[moduleId]) return prev;
      return {
        ...prev,
        [moduleId]: {
          ...prev[moduleId],
          enabled: !prev[moduleId].enabled,
        },
      };
    });
  };

  const setModuleEnabled = (moduleId, enabled) => {
    setModules((prev) => {
      if (!prev[moduleId]) return prev;
      return {
        ...prev,
        [moduleId]: {
          ...prev[moduleId],
          enabled: Boolean(enabled),
        },
      };
    });
  };

  const resetModules = () => {
    setModules(DEFAULT_MODULES);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  };

  const isModuleEnabled = (moduleId) => {
    return Boolean(modules[moduleId]?.enabled);
  };

  const value = useMemo(() => ({
    modules,
    toggleModule,
    setModuleEnabled,
    resetModules,
    isModuleEnabled,
  }), [modules]);

  return (
    <ModuleContext.Provider value={value}>
      {children}
    </ModuleContext.Provider>
  );
};

export default ModuleContext;
