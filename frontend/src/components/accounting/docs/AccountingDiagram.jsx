import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../../../context/LanguageContext';

/**
 * Account definitions for the interactive Accounting Equation diagram
 */
const ACCOUNT_TIERS = [
  {
    categoryKey: 'assets',
    title: { en: 'Assets (1xxx)', ar: 'الأصول (1xxx)' },
    normalBalance: 'DR',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    borderClass: 'border-emerald-500/30 hover:border-emerald-500',
    equationSide: 'left',
    accounts: [
      {
        code: '1010',
        name: { en: 'Bank Current Operating Account', ar: 'الحساب الجاري لدى البنك' },
        drCr: 'DR',
        example: {
          en: 'Debit when receiving customer payments; Credit when settling carrier bills.',
          ar: 'مدين عند تحصيل مبالغ العملاء؛ دائن عند سداد فواتير شركات الشحن.'
        }
      },
      {
        code: '1020',
        name: { en: 'Cash in Transit - Drivers Fleet', ar: 'نقدية قيد التحصيل - المناديب' },
        drCr: 'DR',
        example: {
          en: 'Debit when driver collects COD from consignee; Credit upon hub handover.',
          ar: 'مدين عند استلام المندوب الكاش من المستلم؛ دائن عند التوريد لخزينة الفرع.'
        }
      },
      {
        code: '1030',
        name: { en: 'Hub Vault Safe (Shuwaikh HQ)', ar: 'خزينة الفرع الرئيسية (الشويخ)' },
        drCr: 'DR',
        example: {
          en: 'Debit when cashier accepts driver cash bag; Credit when deposited to bank.',
          ar: 'مدين عند استلام الكاش من المندوب بالفرع؛ دائن عند إيداعه بالحساب البنكي.'
        }
      },
      {
        code: '1100',
        name: { en: 'Accounts Receivable - Clients', ar: 'ذمم مدينة - العملاء والمتاجر' },
        drCr: 'DR',
        example: {
          en: 'Debit when booking shipment invoice; Credit when payment or COD offset occurs.',
          ar: 'مدين عند إصدار فاتورة الشحنة؛ دائن عند السداد أو المقاصة من تحصيلات COD.'
        }
      },
      {
        code: '1150',
        name: { en: 'Prepaid Expenses & Float', ar: 'مصروفات مدفوعة مقدماً وتأمينات' },
        drCr: 'DR',
        example: {
          en: 'Debit when pre-funding carrier deposit accounts; Credit as statements settle.',
          ar: 'مدين عند إيداع تأمينات حسابات شركات الشحن؛ دائن عند تسوية فواتيرها الدورية.'
        }
      }
    ]
  },
  {
    categoryKey: 'liabilities',
    title: { en: 'Liabilities (2xxx)', ar: 'الخصوم (2xxx)' },
    normalBalance: 'CR',
    color: 'amber',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    borderClass: 'border-amber-500/30 hover:border-amber-500',
    equationSide: 'right',
    accounts: [
      {
        code: '2010',
        name: { en: 'Carrier Payables (DHL/OTE/Aramex)', ar: 'مستحقات شركات الشحن' },
        drCr: 'CR',
        example: {
          en: 'Credit upon booking waybill cost accrual; Debit when bank disbursement clears.',
          ar: 'دائن عند استحقاق تكلفة الشحنة بالمنظومة؛ مدين عند سداد الحوالة البنكية.'
        }
      },
      {
        code: '2020',
        name: { en: 'Trade & Vendor Bills Payable', ar: 'ذمم دائنة - فواتير الموردين' },
        drCr: 'CR',
        example: {
          en: 'Credit when supplier bill is entered; Debit when supplier is paid.',
          ar: 'دائن عند قيد فاتورة مستلزمات أو إيجار؛ مدين عند صرف المستحقات للمورد.'
        }
      },
      {
        code: '2100',
        name: { en: 'Merchant COD Escrow Liability', ar: 'أمانات تحصيل المتاجر (COD Escrow)' },
        drCr: 'CR',
        example: {
          en: 'Credit when cash is collected for merchant; Debit when paying merchant net wire.',
          ar: 'دائن عند تحصيل مبالغ البضاعة للتاجر؛ مدين عند التحويل البنكي الصافي للتاجر.'
        }
      }
    ]
  },
  {
    categoryKey: 'equity',
    title: { en: 'Equity (3xxx)', ar: 'حقوق الملكية (3xxx)' },
    normalBalance: 'CR',
    color: 'indigo',
    badgeClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    borderClass: 'border-indigo-500/30 hover:border-indigo-500',
    equationSide: 'right',
    accounts: [
      {
        code: '3010',
        name: { en: 'Paid-In Capital', ar: 'رأس المال المدفوع' },
        drCr: 'CR',
        example: {
          en: 'Initial shareholder investment funding platform infrastructure.',
          ar: 'رأس مال الشركاء المخصص لتمويل البنية التحتية للمنصة وأسطول النقل.'
        }
      },
      {
        code: '3020',
        name: { en: 'Retained Earnings', ar: 'الأرباح المبقاة والمرحلة' },
        drCr: 'CR',
        example: {
          en: 'Cumulative net profit from prior operating periods retained for growth.',
          ar: 'الأرباح التراكمية الصافية المحققة من الفترات السابقة والمرحلة لتطوير العمليات.'
        }
      }
    ]
  }
];

export const AccountingDiagram = ({
  diagramType = 'THREE_WAY_MATCH',
  lang: propLang,
  isRTL: propIsRTL,
  className = '',
  interactive = true
}) => {
  // Defensive language resolution with context fallback
  let lang = propLang;
  let isRTL = propIsRTL;
  try {
    const langCtx = useLanguage();
    if (!lang && langCtx) lang = langCtx.lang;
    if (isRTL === undefined && langCtx) isRTL = langCtx.isRTL;
  } catch {
    // Graceful fallback outside LanguageProvider
  }
  lang = lang || 'en';
  isRTL = isRTL !== undefined ? isRTL : (lang === 'ar');

  const [selectedAccount, setSelectedAccount] = useState(null);

  /**
   * 1. 3-WAY MATCH DIAGRAM
   */
  const renderThreeWayMatch = () => (
    <div className="w-full bg-base-100 rounded-2xl border border-base-200 p-4 sm:p-6 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-base-200 pb-3">
        <div>
          <h4 className="text-sm sm:text-base font-black text-base-content flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">fact_check</span>
            <span>
              {lang === 'ar' ? 'المطابقة الثلاثية لفواتير الشحن والناقلين' : '3-Way Match Verification Flow'}
            </span>
          </h4>
          <p className="text-xs text-base-content/60 mt-0.5">
            {lang === 'ar'
              ? 'مقارنة لقطة تكلفة الشحن مع فاتورة الناقل قبل الصرف البنكي'
              : 'Audit pipeline comparing Waybill Snapshots vs Carrier Invoices before bank disbursement'}
          </p>
        </div>
        <span className="badge badge-primary badge-sm font-bold font-mono">
          {lang === 'ar' ? 'معيار التدقيق' : 'Audit Protocol'}
        </span>
      </div>

      {/* 3 Pillars Flow */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pillar 1 */}
        <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 dark:bg-blue-950/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="badge badge-info badge-xs font-bold">1. Booking Snapshot</span>
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-lg">
                bookmark_added
              </span>
            </div>
            <h5 className="text-xs font-bold text-base-content">
              {lang === 'ar' ? 'لقطة تعرفة الحجز المعتمدة' : 'Rate Card Snapshot'}
            </h5>
            <p className="text-[11px] text-base-content/70 mt-1 leading-relaxed">
              {lang === 'ar'
                ? 'سعر التكلفة المتوقع (costPrice) المحسوب آلياً عند إصدار بوليصة الشحن.'
                : 'Expected wholesale cost (costPrice) computed automatically when waybill is booked.'}
            </p>
          </div>
          <div className="mt-3 p-2 bg-base-100 rounded-lg border border-base-200 font-mono text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
            CR 2010 Carrier AP (Accrual)
          </div>
        </div>

        {/* Pillar 2 */}
        <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 dark:bg-purple-950/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="badge badge-secondary badge-xs font-bold">2. Carrier Invoice</span>
              <span className="material-symbols-outlined text-purple-600 dark:text-purple-400 text-lg">
                receipt
              </span>
            </div>
            <h5 className="text-xs font-bold text-base-content">
              {lang === 'ar' ? 'فاتورة الناقل الإلكترونية (CSV)' : 'Carrier Statement (EDI / CSV)'}
            </h5>
            <p className="text-[11px] text-base-content/70 mt-1 leading-relaxed">
              {lang === 'ar'
                ? 'المطالبة الرسمية من شركة الشحن (DHL، أرامكس، لوجستكس) متضمنة الأوزان الفعلية.'
                : 'Billed amount claimed by courier partner per tracking number with volumetric audits.'}
            </p>
          </div>
          <div className="mt-3 p-2 bg-base-100 rounded-lg border border-base-200 font-mono text-[11px] text-purple-600 dark:text-purple-400 font-semibold">
            Billed AWB Line Amount
          </div>
        </div>

        {/* Pillar 3 */}
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="badge badge-success badge-xs font-bold">3. Physical Delivery</span>
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-lg">
                verified
              </span>
            </div>
            <h5 className="text-xs font-bold text-base-content">
              {lang === 'ar' ? 'إثبات التسليم الفعلي (POD)' : 'Proof of Delivery (POD)'}
            </h5>
            <p className="text-[11px] text-base-content/70 mt-1 leading-relaxed">
              {lang === 'ar'
                ? 'تأكيد التسليم النهائي والأوزان المقاسة لمنع سداد شحنات معلقة أو ملغاة.'
                : 'Confirmation of delivery checkpoint preventing payment on cancelled/undelivered cargo.'}
            </p>
          </div>
          <div className="mt-3 p-2 bg-base-100 rounded-lg border border-base-200 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
            Status: DELIVERED
          </div>
        </div>
      </div>

      {/* Audit Engine Central Junction */}
      <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-xl">tune</span>
          </div>
          <div>
            <h5 className="text-xs font-bold text-base-content">
              {lang === 'ar' ? 'محرك فحص التفاوت والسماح الآلي' : 'Automated Tolerance Match Engine'}
            </h5>
            <p className="text-[11px] text-base-content/70">
              {lang === 'ar'
                ? 'فحص التفاوت: ±0.050 د.ك لكل بوليصة. الفروقات ترحل حصراً لحساب تكلفة الشحن 5010.'
                : 'Tolerance: ±0.050 KWD per waybill. Variances post strictly to COGS (5010) vs AP (2010).'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="badge badge-success badge-sm font-semibold gap-1">
            <span className="material-symbols-outlined text-xs">check_circle</span>
            {lang === 'ar' ? 'مطابق: يصرف بنكياً' : 'Matched: Disburse'}
          </span>
          <span className="badge badge-warning badge-sm font-semibold gap-1">
            <span className="material-symbols-outlined text-xs">warning</span>
            {lang === 'ar' ? 'فرق: قيد تسوية' : 'Variance: Adjust'}
          </span>
        </div>
      </div>

      {/* Isolation Guard Banner */}
      <div className="p-3 bg-base-200/60 rounded-xl border border-base-200 flex items-center gap-3 text-xs text-base-content/70">
        <span className="material-symbols-outlined text-primary text-lg shrink-0">verified_user</span>
        <span>
          <strong>{lang === 'ar' ? 'حصانة حسابات العملاء:' : 'Client Ledger Isolation:'}</strong>{' '}
          {lang === 'ar'
            ? 'فروقات مطابقة فواتير شركات الشحن تؤثر فقط على أرباح المنصة ومستحقات الناقل، ولا تغير أبداً فواتير أو أرصدة المتاجر الشاحنة.'
            : 'Carrier reconciliation variances affect only platform Carrier AP (2010) and COGS (5010). Customer merchant invoices are never mutated.'}
        </span>
      </div>
    </div>
  );

  /**
   * 2. ACCOUNTING EQUATION DIAGRAM
   */
  const renderAccountingEquation = () => (
    <div className="w-full bg-base-100 rounded-2xl border border-base-200 p-4 sm:p-6 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-base-200 pb-3">
        <div>
          <h4 className="text-sm sm:text-base font-black text-base-content flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">balance</span>
            <span>
              {lang === 'ar' ? 'معادلة الميزانية العمومية المتوازنة' : 'The Balanced Accounting Equation'}
            </span>
          </h4>
          <p className="text-xs text-base-content/60 mt-0.5">
            {lang === 'ar'
              ? 'الأصول (1xxx) = الخصوم (2xxx) + حقوق الملكية (3xxx)'
              : 'Assets (1xxx) = Liabilities (2xxx) + Equity (3xxx)'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="badge badge-success badge-sm font-mono font-bold">
            SUM(DR) == SUM(CR)
          </span>
        </div>
      </div>

      {/* Visual Balance Scale Header */}
      <div className="p-4 bg-base-200/40 rounded-xl border border-base-200 text-center space-y-2">
        <div className="inline-flex items-center gap-2 sm:gap-4 px-4 py-2 bg-base-100 rounded-xl border border-base-300 shadow-xs font-mono font-black text-sm sm:text-lg">
          <span className="text-emerald-600 dark:text-emerald-400">
            {lang === 'ar' ? 'الأصول' : 'Assets'} (1xxx)
          </span>
          <span className="text-base-content/40">=</span>
          <span className="text-amber-600 dark:text-amber-400">
            {lang === 'ar' ? 'الخصوم' : 'Liabilities'} (2xxx)
          </span>
          <span className="text-base-content/40">+</span>
          <span className="text-indigo-600 dark:text-indigo-400">
            {lang === 'ar' ? 'الملكية' : 'Equity'} (3xxx)
          </span>
        </div>
        <p className="text-[11px] text-base-content/60">
          {lang === 'ar'
            ? 'انقر على أي كارت حساب أدناه لمعرفة طبيعته (مدين/دائن) ومثال على قيد اليومية'
            : 'Click any account card below to view its normal balance rule and sample journal entry'}
        </p>
      </div>

      {/* Account Code Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ACCOUNT_TIERS.map((tier) => (
          <div
            key={tier.categoryKey}
            className={`p-3.5 rounded-xl border ${tier.borderClass} bg-base-100/50 flex flex-col justify-between`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={`badge badge-xs font-bold ${tier.badgeClass}`}>
                  {tier.title[lang] || tier.title.en}
                </span>
                <span className="text-[10px] font-mono font-bold text-base-content/60">
                  Normal: <strong className="text-primary">{tier.normalBalance}</strong>
                </span>
              </div>

              <div className="space-y-1.5 mt-2">
                {tier.accounts.map((acc) => {
                  const isSelected = selectedAccount?.code === acc.code;
                  return (
                    <button
                      type="button"
                      key={acc.code}
                      onClick={() => interactive && setSelectedAccount(acc)}
                      className={`w-full text-start p-2 rounded-lg border text-xs transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-xs'
                          : 'border-base-200 hover:border-base-300 bg-base-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-bold text-primary">{acc.code}</span>
                        <span className="badge badge-ghost badge-xs font-mono">{acc.drCr}</span>
                      </div>
                      <p className="text-[11px] text-base-content/80 truncate mt-0.5 font-medium">
                        {acc.name[lang] || acc.name.en}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Selected Account Drilldown Card */}
      {selectedAccount && (
        <div className="p-4 bg-primary/5 rounded-xl border border-primary/30 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm text-primary">
                  {selectedAccount.code}
                </span>
                <span className="badge badge-primary badge-xs font-bold">
                  {selectedAccount.drCr === 'DR' ? 'Normal Debit (DR)' : 'Normal Credit (CR)'}
                </span>
              </div>
              <h5 className="text-xs font-bold text-base-content mt-1">
                {selectedAccount.name[lang] || selectedAccount.name.en}
              </h5>
              <p className="text-[11px] text-base-content/70 mt-1 leading-relaxed">
                {selectedAccount.example[lang] || selectedAccount.example.en}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAccount(null)}
              className="btn btn-ghost btn-xs btn-square text-base-content/60"
              aria-label="Dismiss account drilldown"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  /**
   * 3. COD FIDUCIARY LIFECYCLE DIAGRAM
   */
  const renderCodLifecycle = () => (
    <div className="w-full bg-base-100 rounded-2xl border border-base-200 p-4 sm:p-6 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-base-200 pb-3">
        <div>
          <h4 className="text-sm sm:text-base font-black text-base-content flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500 text-xl">shield</span>
            <span>
              {lang === 'ar' ? 'سلسلة عهدة وأمانات الدفع عند الاستلام (COD)' : 'COD Fiduciary Chain of Custody'}
            </span>
          </h4>
          <p className="text-xs text-base-content/60 mt-0.5">
            {lang === 'ar'
              ? 'تتبع النقدية من عهدة المندوب إلى خزينة الفرع حتى التسوية البنكية للتاجر'
              : 'Tracking physical cash flow from driver transit to vault safe and net wire payout'}
          </p>
        </div>
        <span className="badge badge-warning badge-sm font-bold font-mono">
          Fiduciary Loop
        </span>
      </div>

      {/* 4 Pipeline Stages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Stage 1 */}
        <div className="p-3.5 rounded-xl border border-base-200 bg-base-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="badge badge-xs font-bold bg-blue-500/10 text-blue-600">Stage 1</span>
              <span className="material-symbols-outlined text-blue-500 text-lg">local_shipping</span>
            </div>
            <h5 className="text-xs font-bold text-base-content">
              {lang === 'ar' ? 'تحصيل المندوب (الاستلام)' : 'Doorstep Collection'}
            </h5>
            <p className="text-[11px] text-base-content/70 mt-1">
              {lang === 'ar' ? 'المندوب يستلم الكاش ويسجل إثبات التسليم POD.' : 'Courier collects currency upon physical parcel delivery.'}
            </p>
          </div>
          <div className="mt-3 p-2 bg-base-200/60 rounded-lg text-[10px] font-mono">
            <div className="text-emerald-600 font-bold">DR 1020 Cash in Transit</div>
            <div className="text-amber-600 font-bold">CR 2100 Merchant Escrow</div>
          </div>
        </div>

        {/* Stage 2 */}
        <div className="p-3.5 rounded-xl border border-base-200 bg-base-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="badge badge-xs font-bold bg-amber-500/10 text-amber-600">Stage 2</span>
              <span className="material-symbols-outlined text-amber-500 text-lg">security</span>
            </div>
            <h5 className="text-xs font-bold text-base-content">
              {lang === 'ar' ? 'توريد خزينة الفرع' : 'Hub Vault Remittance'}
            </h5>
            <p className="text-[11px] text-base-content/70 mt-1">
              {lang === 'ar' ? 'أمين الصندوق يستلم النقدية ويبرئ ذمة السائق.' : 'Cashier verifies physical banknotes and clears driver.'}
            </p>
          </div>
          <div className="mt-3 p-2 bg-base-200/60 rounded-lg text-[10px] font-mono">
            <div className="text-emerald-600 font-bold">DR 1030 Hub Vault Safe</div>
            <div className="text-base-content/60">CR 1020 Driver Cleared</div>
          </div>
        </div>

        {/* Stage 3 */}
        <div className="p-3.5 rounded-xl border border-base-200 bg-base-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="badge badge-xs font-bold bg-indigo-500/10 text-indigo-600">Stage 3</span>
              <span className="material-symbols-outlined text-indigo-500 text-lg">savings</span>
            </div>
            <h5 className="text-xs font-bold text-base-content">
              {lang === 'ar' ? 'أمانات التاجر والمقاصة' : 'Merchant Escrow Audit'}
            </h5>
            <p className="text-[11px] text-base-content/70 mt-1">
              {lang === 'ar' ? 'تدقيق مبالغ الأمانة وتحديد استقطاعات الشحن والعمولة.' : 'Escrow balance audited against unpaid freight invoices.'}
            </p>
          </div>
          <div className="mt-3 p-2 bg-base-200/60 rounded-lg text-[10px] font-mono">
            <div className="text-amber-600 font-bold">Balance in Acct 2100</div>
            <div className="text-blue-600 font-bold">Netting AR Deductions</div>
          </div>
        </div>

        {/* Stage 4 */}
        <div className="p-3.5 rounded-xl border border-base-200 bg-base-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="badge badge-xs font-bold bg-emerald-500/10 text-emerald-600">Stage 4</span>
              <span className="material-symbols-outlined text-emerald-500 text-lg">price_check</span>
            </div>
            <h5 className="text-xs font-bold text-base-content">
              {lang === 'ar' ? 'التحويل البنكي الصافي' : 'Net Bank Wire Payout'}
            </h5>
            <p className="text-[11px] text-base-content/70 mt-1">
              {lang === 'ar' ? 'تحويل بنكي لآيبان المتجر بعد خصم الشحن والعمولة.' : 'Wire transfer clearing gross escrow minus shipping & fee.'}
            </p>
          </div>
          <div className="mt-3 p-2 bg-base-200/60 rounded-lg text-[10px] font-mono">
            <div className="text-purple-600 font-bold">DR 2100 Gross Escrow</div>
            <div className="text-emerald-600 font-bold">CR 1010 Bank Net Payout</div>
          </div>
        </div>
      </div>

      {/* Netting Formula Pill */}
      <div className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
        <span className="text-base-content font-bold">
          {lang === 'ar' ? 'معادلة التحويل الصافي:' : 'Net Payout Formula:'}
        </span>
        <span className="text-amber-700 dark:text-amber-300 font-bold text-center">
          Net Wire (1010) = Gross Escrow (2100) - Unpaid Freight AR (1100) - COD Fee (4040)
        </span>
      </div>
    </div>
  );

  /**
   * 4. T-ACCOUNT DIAGRAM
   */
  const renderTAccount = () => (
    <div className="w-full bg-base-100 rounded-2xl border border-base-200 p-4 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-base-200 pb-3">
        <h4 className="text-sm sm:text-base font-black text-base-content flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">reorder</span>
          <span>{lang === 'ar' ? 'طبيعة الحسابات وقاعدة القيد المزدوج (T-Account)' : 'T-Account Normal Balance Rules'}</span>
        </h4>
        <span className="badge badge-primary badge-sm font-bold">Double-Entry</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Assets & Expenses */}
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20">
          <div className="text-center font-bold text-xs pb-2 border-b-2 border-emerald-500 text-emerald-700 dark:text-emerald-300">
            {lang === 'ar' ? 'الأصول والمصروفات (Assets & Expenses)' : 'Assets (1xxx) & Expenses/COGS (5xxx, 6xxx)'}
          </div>
          <div className="grid grid-cols-2 text-center text-xs divide-x rtl:divide-x-reverse divide-emerald-500/30 pt-3">
            <div className="p-2">
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block text-sm">
                DEBIT (DR)
              </span>
              <span className="badge badge-success badge-xs font-bold mt-1">+ Increase</span>
              <p className="text-[10px] text-base-content/60 mt-1">Normal Balance</p>
            </div>
            <div className="p-2">
              <span className="font-mono font-bold text-base-content/50 block text-sm">
                CREDIT (CR)
              </span>
              <span className="badge badge-ghost badge-xs font-bold mt-1">- Decrease</span>
              <p className="text-[10px] text-base-content/60 mt-1">Reductions</p>
            </div>
          </div>
        </div>

        {/* Liabilities, Equity & Revenue */}
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20">
          <div className="text-center font-bold text-xs pb-2 border-b-2 border-amber-500 text-amber-700 dark:text-amber-300">
            {lang === 'ar' ? 'الخصوم والملكية والإيرادات' : 'Liabilities (2xxx), Equity (3xxx), Revenue (4xxx)'}
          </div>
          <div className="grid grid-cols-2 text-center text-xs divide-x rtl:divide-x-reverse divide-amber-500/30 pt-3">
            <div className="p-2">
              <span className="font-mono font-bold text-base-content/50 block text-sm">
                DEBIT (DR)
              </span>
              <span className="badge badge-ghost badge-xs font-bold mt-1">- Decrease</span>
              <p className="text-[10px] text-base-content/60 mt-1">Settlements</p>
            </div>
            <div className="p-2">
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400 block text-sm">
                CREDIT (CR)
              </span>
              <span className="badge badge-warning badge-xs font-bold mt-1">+ Increase</span>
              <p className="text-[10px] text-base-content/60 mt-1">Normal Balance</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`w-full ${className}`}
      dir={isRTL ? 'rtl' : 'ltr'}
      data-testid="accounting-diagram"
      data-diagram-type={diagramType}
    >
      {diagramType === 'THREE_WAY_MATCH' && renderThreeWayMatch()}
      {diagramType === 'ACCOUNTING_EQUATION' && renderAccountingEquation()}
      {diagramType === 'COD_FIDUCIARY_LIFECYCLE' && renderCodLifecycle()}
      {diagramType === 'T_ACCOUNT' && renderTAccount()}
    </div>
  );
};

AccountingDiagram.propTypes = {
  diagramType: PropTypes.oneOf([
    'THREE_WAY_MATCH',
    'ACCOUNTING_EQUATION',
    'COD_FIDUCIARY_LIFECYCLE',
    'T_ACCOUNT'
  ]),
  lang: PropTypes.string,
  isRTL: PropTypes.bool,
  className: PropTypes.string,
  interactive: PropTypes.bool
};

export default AccountingDiagram;
