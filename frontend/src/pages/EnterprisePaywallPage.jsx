import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useModules } from '../context/ModuleContext';

const MODULE_DETAILS = {
  analytics: {
    title: 'Advanced Logistics Analytics & BI',
    titleAr: 'التحليلات اللوجستية المتقدمة وذكاء الأعمال',
    tagline: 'Carrier arbitrage, profit-per-kg telemetry, and enterprise volume forecasting.',
    taglineAr: 'تحليل هوامش الربح لكل كيلوغرام، ومقارنة تكلفة الناقلين، والتنبؤ بأحجام الشحن.',
    icon: 'insights',
    tier: 'ENTERPRISE',
    color: 'primary',
    previewType: 'chart',
    capabilities: [
      { icon: 'balance', title: 'Carrier Margin & Cost Arbitrage', desc: 'Real-time comparison of DHL, Aramex, and FedEx bulk rates against billing markups.' },
      { icon: 'trending_up', title: 'Volume Velocity & Lane Telemetry', desc: 'Predictive throughput algorithms for GCC and international air corridors.' },
      { icon: 'file_download', title: 'Automated Executive BI Reports', desc: 'One-click scheduled PDF & CSV balance sheet and shipping manifest exports.' },
      { icon: 'hub', title: 'Multi-Tenant Consolidated Views', desc: 'Roll-up analytics across all enterprise subsidiary accounts and sub-agents.' },
    ],
  },
  fleets: {
    title: 'Fleet Telemetry & IoT Vehicle Tracking',
    titleAr: 'تتبع الأسطول المباشر وإنترنت الأشياء (IoT)',
    tagline: 'Satellite GPS live telemetry, geofence compliance, and real-time fuel efficiency.',
    taglineAr: 'تتبع الشاحنات اللحظي عبر الأقمار الصناعية، والمحيط الجغرافي الآمن، وكفاءة الوقود.',
    icon: 'directions_car',
    tier: 'ENTERPRISE',
    color: 'accent',
    previewType: 'map',
    capabilities: [
      { icon: 'satellite_alt', title: 'Real-Time Satellite GPS Positioning', desc: 'Sub-second vehicle telemetry across Kuwait City, Shuwaikh, and border customs points.' },
      { icon: 'fence', title: 'Dynamic Geofencing & Hub Alerts', desc: 'Automatic ingress and egress notifications when trucks enter airport cargo terminals.' },
      { icon: 'local_gas_station', title: 'OBD-II Fuel & Engine Diagnostics', desc: 'Preventive maintenance tracking, idle times, and driver speed telemetry.' },
      { icon: 'speed', title: 'Automated Route Dispatch Engine', desc: 'Dynamic multi-stop route optimization avoiding Kuwait highway congestion.' },
    ],
  },
  drivers: {
    title: 'Driver Dispatch & ePOD Management',
    titleAr: 'إدارة السائقين والمناديب وإثبات التسليم الرقمي',
    tagline: 'Mobile manifest dispatch, instant digital signature capture, and courier performance.',
    taglineAr: 'إدارة المناديب الذكية، والتقاط التوقيعات الرقمية اللحظية، ومراقبة أداء التسليم.',
    icon: 'badge',
    tier: 'ENTERPRISE',
    color: 'secondary',
    previewType: 'driver',
    capabilities: [
      { icon: 'draw', title: 'Digital Proof of Delivery (ePOD)', desc: 'Instant photo proof, customer e-signature capture, and GPS coordinate timestamping.' },
      { icon: 'alt_route', title: 'Smart Pickups & Delivery Batches', desc: 'Automated job assignment based on courier proximity and cargo volume.' },
      { icon: 'chat', title: 'Direct WhatsApp Courier Sync', desc: 'Automated driver-to-customer WhatsApp dispatch alerts with live tracking links.' },
      { icon: 'stars', title: 'Courier Delivery SLA Scorecards', desc: 'Track first-attempt success rates, pickup punctuality, and cash-on-delivery handling.' },
    ],
  },
  warehouse: {
    title: 'Smart Warehouse & Storage Management',
    titleAr: 'المستودع الذكي وإدارة التخزين والأرفف',
    tagline: 'Zone-based bin allocations, 2D barcode intake, and pallet volume telemetry.',
    taglineAr: 'التوزيع الآلي للمواقع والأرفف، والمسح الضوئي المتقدم، وتتبع سعة المستودع.',
    icon: 'warehouse',
    tier: 'ENTERPRISE',
    color: 'warning',
    previewType: 'warehouse',
    capabilities: [
      { icon: 'grid_view', title: 'Intelligent Bin & Rack Allocation', desc: 'Automated slotting based on package dimensions, destination, and transit urgency.' },
      { icon: 'qr_code_scanner', title: 'High-Speed Pallet Intake Scanning', desc: 'Batch barcode verification with instant airway bill reconciliation and ERP sync.' },
      { icon: 'inventory_2', title: 'Dangerous Goods & Bonded Storage', desc: 'Automated compliance checkpoints for lithium batteries, chemicals, and customs holds.' },
      { icon: 'history', title: 'Real-Time Zone Audit Logs', desc: 'Full chain-of-custody audit trail for every pallet moved inside Kuwait Airport Hub.' },
    ],
  },
  calendar: {
    title: 'Dispatch & Slot Booking Calendar',
    titleAr: 'جدول المواعيد وحجوزات الترحيل',
    tagline: 'Scheduled airline cargo flight cutoffs, customs slots, and recurring pickups.',
    taglineAr: 'مواعيد إغلاق رحلات الشحن الجوي، ونوافذ التفتيش الجمركي، وحجوزات الاستلام.',
    icon: 'calendar_month',
    tier: 'PRO',
    color: 'info',
    previewType: 'calendar',
    capabilities: [
      { icon: 'schedule', title: 'Flight Manifest Cutoff Timers', desc: 'Live countdowns for daily carrier cargo departures from Kuwait International (KWI).' },
      { icon: 'event_repeat', title: 'Scheduled Recurring Client Pickups', desc: 'Set automated daily or weekly courier sweeps for enterprise warehouses.' },
      { icon: 'alarm', title: 'Customs Clearance Windows', desc: 'Pre-schedule customs inspector appointments for fast-track border transit.' },
      { icon: 'notifications_active', title: 'Proactive Delay Mitigation', desc: 'Automated reschedule recommendations during flight disruptions or bad weather.' },
    ],
  },
  messages: {
    title: 'Omnichannel Communications Center',
    titleAr: 'مركز المراسلات الموحد والتنبيهات',
    tagline: 'Unified Meta WhatsApp Cloud messaging, SMS fallback, and customer support inbox.',
    taglineAr: 'منظومة مراسلات واتساب السحابية الموحدة، والرسائل النصية، وصندوق دعم العملاء.',
    icon: 'chat',
    tier: 'PRO',
    color: 'info',
    previewType: 'messages',
    capabilities: [
      { icon: 'forum', title: 'Official Meta WhatsApp Cloud Gateway', desc: 'Send branded interactive waybill updates, tracking links, and PDF invoices directly.' },
      { icon: 'support_agent', title: 'Unified Customer Support Desk', desc: 'Centralized inbox for client inquiries, delivery reschedules, and exception notes.' },
      { icon: 'sms', title: 'Automatic SMS & Email Fallback', desc: 'Guaranteed delivery across 180+ global carriers when WhatsApp is unavailable.' },
      { icon: 'analytics', title: 'Message Delivery & Read Receipts', desc: 'Real-time telemetry on WhatsApp delivery rates, click-throughs, and responses.' },
    ],
  },
};

export const EnterprisePaywallPage = ({ moduleKey }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isRTL, lang } = useLanguage();
  const { modules, toggleModule } = useModules();

  // Determine active module from props or current URL
  const activeKey = moduleKey || location.pathname.replace(/^\//, '').split('/')[0] || 'analytics';
  const info = MODULE_DETAILS[activeKey] || MODULE_DETAILS.analytics;
  const moduleConfig = modules[activeKey] || { enabled: true, tier: info.tier };

  const userRole = user?.role || 'staff';
  const isAdminOrOwner = ['admin', 'manager', 'accounting'].includes(userRole);
  const orgName = user?.organization?.name || (isRTL ? 'حساب المؤسسة' : 'Your Organization');

  const cleanPhone = '96590001000';
  const waMessage = encodeURIComponent(
    isRTL
      ? `مرحباً إدارة تارغت اللوجستية، أود الاستفسار عن تفعيل باقة (${info.titleAr}) لمنظمتنا (${orgName}).`
      : `Hello Target Logistics Management, I would like to request activation of the (${info.title}) Enterprise Module for our organization (${orgName}).`
  );

  return (
    <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 py-4 space-y-6">
      
      {/* ── Admin Mode Fast Feature Flag Controller ────────────────────────── */}
      {isAdminOrOwner && (
        <div className="bg-base-100 border-2 border-primary/30 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">admin_panel_settings</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs text-base-content uppercase tracking-wider">
                  {isRTL ? 'لوحة تحكم المشرف: ظهور الوحدة' : 'Admin Visibility Controller'}
                </span>
                <span className={`badge badge-xs font-bold ${moduleConfig.enabled ? 'badge-success' : 'badge-ghost text-base-content/60'}`}>
                  {moduleConfig.enabled ? (isRTL ? 'مفعل في القائمة' : 'Active in Menu') : (isRTL ? 'مخفي عن المستخدمين' : 'Hidden from Menu')}
                </span>
              </div>
              <p className="text-[11px] text-base-content/60 font-medium mt-0.5">
                {isRTL 
                  ? 'يمكنك تشغيل أو إخفاء هذه الوحدة من القائمة الرئيسية لحسابات المستخدمين والمشغلين في أي وقت.' 
                  : 'Toggle this module ON/OFF in navigation menus for users. When built, it links directly to production.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <span className="text-xs font-bold text-base-content/70">
              {moduleConfig.enabled ? (isRTL ? 'معروض في القائمة' : 'Shown in Nav') : (isRTL ? 'مخفي' : 'Hidden')}
            </span>
            <input 
              type="checkbox" 
              checked={moduleConfig.enabled} 
              onChange={() => toggleModule(activeKey)}
              className="toggle toggle-primary toggle-sm"
              title="Toggle Menu Visibility"
            />
          </div>
        </div>
      )}

      {/* ── Hero Enterprise Header ────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-base-100 via-base-100 to-primary/5 border border-base-200 shadow-sm rounded-3xl p-6 sm:p-10 relative overflow-hidden">
        {/* Subtle decorative background watermark */}
        <span className="material-symbols-outlined absolute -bottom-10 -end-10 text-[200px] text-primary/5 pointer-events-none select-none">
          {info.icon}
        </span>

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="badge badge-primary font-black text-[10px] tracking-widest uppercase px-3 py-2 shadow-xs">
              {info.tier} MODULE
            </span>
            <span className="badge badge-ghost border border-base-300 font-extrabold text-[10px] uppercase text-base-content/70 px-2.5">
              Target Operating System 2.0
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-base-content tracking-tight leading-tight">
            {isRTL ? info.titleAr : info.title}
          </h1>

          <p className="text-sm sm:text-base text-base-content/70 font-medium leading-relaxed">
            {isRTL ? info.taglineAr : info.tagline}
          </p>

          <div className="pt-2 flex flex-wrap gap-3">
            <a
              href={`https://wa.me/${cleanPhone}?text=${waMessage}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary font-extrabold text-xs sm:text-sm rounded-xl px-5 gap-2 shadow-md shadow-primary/25"
            >
              <span className="material-symbols-outlined text-lg">chat</span>
              <span>{isRTL ? 'طلب التفعيل الفوري عبر واتساب' : 'Request Activation via WhatsApp'}</span>
            </a>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="btn btn-ghost border border-base-300 font-bold text-xs sm:text-sm rounded-xl px-4"
            >
              <span className="material-symbols-outlined text-base">dashboard</span>
              <span>{isRTL ? 'العودة للوحة التشغيل' : 'Return to Dashboard'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Feature Teaser / Interactive Preview Canvas ───────────────────── */}
      <div className="bg-base-100 border border-base-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="flex justify-between items-center border-b border-base-200 pb-4">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-primary">
              {isRTL ? 'معاينة تجريبية للنظام' : 'Live Architectural Preview'}
            </span>
            <h2 className="text-lg sm:text-xl font-black text-base-content mt-0.5">
              {isRTL ? 'ما الذي ستحصل عليه شركتك عند التفعيل؟' : 'Unlocked Enterprise Capabilities'}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-black">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span>Ready for Provisioning</span>
          </div>
        </div>

        {/* Dynamic Mockup Card based on preview type */}
        <div className="p-4 sm:p-6 bg-base-200/40 border border-base-300/80 rounded-2xl space-y-4">
          <div className="flex justify-between items-center text-xs text-base-content/60 font-mono pb-2 border-b border-base-300">
            <span className="flex items-center gap-1.5 font-bold">
              <span className="material-symbols-outlined text-sm text-primary">terminal</span>
              target-os / {activeKey} / live-telemetry
            </span>
            <span className="badge badge-warning badge-xs font-bold uppercase">Staging Preview</span>
          </div>

          {/* Interactive Simulation Display */}
          {info.previewType === 'map' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-base-100 rounded-xl border border-base-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-base-content/60">Fleet In Motion</span>
                <span className="text-2xl font-black text-primary font-mono">14 <span className="text-xs font-sans">Trucks</span></span>
                <p className="text-[10px] text-success font-bold">● Kuwait Intl Airport ➔ Shuwaikh</p>
              </div>
              <div className="p-3 bg-base-100 rounded-xl border border-base-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-base-content/60">Geofence Compliance</span>
                <span className="text-2xl font-black text-success font-mono">99.4%</span>
                <p className="text-[10px] text-base-content/60">0 unapproved route deviations</p>
              </div>
              <div className="p-3 bg-base-100 rounded-xl border border-base-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-base-content/60">Avg. Cargo Idle Time</span>
                <span className="text-2xl font-black text-base-content font-mono">11.8 <span className="text-xs font-sans">min</span></span>
                <p className="text-[10px] text-info font-bold">Optimal customs intake</p>
              </div>
            </div>
          )}

          {info.previewType === 'chart' && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-base-100 rounded-xl border border-base-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-base-content/60">DHL vs Aramex Spread</span>
                <span className="text-xl font-black text-primary font-mono">+14.2%</span>
                <p className="text-[10px] text-success font-bold">Dynamic cost arbitrage</p>
              </div>
              <div className="p-3 bg-base-100 rounded-xl border border-base-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-base-content/60">Average Margin / KG</span>
                <span className="text-xl font-black text-success font-mono">1.840 <span className="text-xs">KWD</span></span>
                <p className="text-[10px] text-base-content/60">Net consolidated margin</p>
              </div>
              <div className="p-3 bg-base-100 rounded-xl border border-base-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-base-content/60">Forecasted Vol (Q4)</span>
                <span className="text-xl font-black text-base-content font-mono">8,420 <span className="text-xs">pkgs</span></span>
                <p className="text-[10px] text-primary font-bold">Air cargo peak season</p>
              </div>
              <div className="p-3 bg-base-100 rounded-xl border border-base-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-base-content/60">Export Formats</span>
                <span className="text-xl font-black text-warning font-mono">CSV / PDF</span>
                <p className="text-[10px] text-base-content/60">Customs & audit compliant</p>
              </div>
            </div>
          )}

          {(info.previewType !== 'map' && info.previewType !== 'chart') && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-base-100 rounded-xl border border-base-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-base-content/60">Live Automation</span>
                <span className="text-xl font-black text-primary font-mono">Active</span>
                <p className="text-[10px] text-success font-bold">Automated state transitions</p>
              </div>
              <div className="p-3 bg-base-100 rounded-xl border border-base-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-base-content/60">Security & RBAC</span>
                <span className="text-xl font-black text-success font-mono">ISO 27001</span>
                <p className="text-[10px] text-base-content/60">Granular sub-agent permissions</p>
              </div>
              <div className="p-3 bg-base-100 rounded-xl border border-base-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-base-content/60">Enterprise SLA</span>
                <span className="text-xl font-black text-base-content font-mono">99.9% Uptime</span>
                <p className="text-[10px] text-info font-bold">Dedicated account engineer</p>
              </div>
            </div>
          )}
        </div>

        {/* 4 Feature Capability Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {info.capabilities.map((cap, idx) => (
            <div key={idx} className="p-4 rounded-2xl border border-base-200 bg-base-100 hover:border-primary/40 transition-all flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">{cap.icon}</span>
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-base-content">
                  {cap.title}
                </h3>
                <p className="text-xs text-base-content/60 mt-1 leading-relaxed">
                  {cap.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Organization Account Posture Card ──────────────────────────────── */}
      <div className="bg-base-100 border border-base-200 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">corporate_fare</span>
            <span className="text-xs font-black uppercase tracking-wider text-base-content/60">
              {isRTL ? 'حالة حساب المنظمة' : 'Account Posture'}
            </span>
          </div>
          <h3 className="text-lg font-black text-base-content">
            {orgName}
          </h3>
          <p className="text-xs text-base-content/60 font-medium">
            {isRTL 
              ? 'ترقية باقة شركتك تتيح لك الوصول الفوري لجميع المميزات المتقدمة وتخصيص واجهات برمجة التطبيقات (API).'
              : 'Upgrading your organizational tier provisions instant access, dedicated API keys, and Kuwait Hub SLA support.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <a
            href={`https://wa.me/${cleanPhone}?text=${waMessage}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary font-bold text-xs rounded-xl gap-2 px-6"
          >
            <span className="material-symbols-outlined text-base">verified</span>
            <span>{isRTL ? 'ترقية الحساب الآن' : 'Upgrade Account Tier'}</span>
          </a>
          <button
            type="button"
            onClick={() => navigate('/contact')}
            className="btn btn-outline btn-ghost border-base-300 font-bold text-xs rounded-xl px-5"
          >
            <span>{isRTL ? 'تواصل مع الدعم' : 'Contact Sales'}</span>
          </button>
        </div>
      </div>

    </div>
  );
};

export default EnterprisePaywallPage;
