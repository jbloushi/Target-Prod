/**
 * Financial Tour Step Definitions
 *
 * Comprehensive declarative step catalog for interactive guided walkthroughs
 * covering Accounts Payable, Financial Statements, Financial Reports, and Full Tour.
 *
 * Each step specifies:
 * - id: Unique string identifier
 * - targetSelector: Primary CSS selector (with fallback selectors)
 * - title: Bilingual title { en, ar }
 * - description: Bilingual explanatory copy { en, ar }
 * - requiredTab: Finance subtab required for this step ('overview' | 'ap' | 'statements' | 'reports' | 'cod' | 'gl')
 * - placement: Preferred popover placement ('bottom' | 'top' | 'left' | 'right')
 * - calloutBadge: Step category/tag badge { en, ar }
 * - icon: Material Symbols Outlined icon name
 * - hint: Contextual accounting tip or account reference { en, ar }
 */

export const TOUR_IDS = {
    AP_TOUR: 'ap_tour',
    STATEMENTS_TOUR: 'statements_tour',
    REPORTS_TOUR: 'reports_tour',
    FULL_TOUR: 'full_finance_tour'
};

// Common aliases for backwards compatibility and easy integration
export const TOUR_ALIASES = {
    TOUR_ACCOUNTS_PAYABLE: TOUR_IDS.AP_TOUR,
    TOUR_FINANCIAL_STATEMENTS: TOUR_IDS.STATEMENTS_TOUR,
    TOUR_FINANCIAL_REPORTS: TOUR_IDS.REPORTS_TOUR,
    TOUR_FULL_FINANCE: TOUR_IDS.FULL_TOUR,
    ap: TOUR_IDS.AP_TOUR,
    statements: TOUR_IDS.STATEMENTS_TOUR,
    reports: TOUR_IDS.REPORTS_TOUR,
    full: TOUR_IDS.FULL_TOUR
};

/**
 * Accounts Payable Tour Steps
 * Flow: Overview KPI cards -> 3-Way Match Tool -> Record Vendor Bill -> Carrier Bills Table -> Payment Disbursement
 */
export const AP_TOUR_STEPS = [
    {
        id: 'ap-overview-kpi',
        targetSelector: '[data-tour="ap-kpi-outstanding"], [data-tour="ap-kpi-bar"]',
        title: {
            en: 'Accounts Payable Overview & Accruals',
            ar: 'نظرة عامة على الذمم الدائنة والمستحقات'
        },
        description: {
            en: 'Monitor total outstanding carrier liabilities and settled disbursements. Every booked shipment automatically accrues platform carrier payables under Account 2010.',
            ar: 'متابعة إجمالي مستحقات شركات الشحن والمدفوعات المسددة. كل شحنة محجوزة تسجل آلياً استحقاقاً لصالح الناقل في حساب 2010.'
        },
        requiredTab: 'ap',
        placement: 'bottom',
        calloutBadge: {
            en: 'Liability Accrual',
            ar: 'استحقاق الذمم'
        },
        icon: 'assignment_returned',
        hint: {
            en: 'GL Accounts: 2010 (Carrier AP) & 2020 (Trade Vendor AP)',
            ar: 'حسابات الأستاذ: 2010 (ذمم الشحن) و 2020 (ذمم الموردين)'
        }
    },
    {
        id: 'ap-3way-match',
        targetSelector: '[data-tour="ap-action-3way-match"], [data-tour="ap-btn-3way-match"]',
        title: {
            en: '3-Way Match Verification Tool',
            ar: 'أداة المطابقة الثلاثية الذكية'
        },
        description: {
            en: 'Compare vendor billing statements against platform shipment cost snapshots (costPrice) to catch and reconcile invoice discrepancies before approving payment vouchers.',
            ar: 'مقارنة فواتير الناقلين المرفوعة مع تكلفة الشحنات المسجلة بالنظام لكشف أي فروقات في التسعير وتعديلها قبل اعتماد الصرف.'
        },
        requiredTab: 'ap',
        placement: 'bottom',
        calloutBadge: {
            en: 'Critical Audit',
            ar: 'تدقيق حرج'
        },
        icon: 'find_replace',
        hint: {
            en: 'Tolerances: Discrepancies post strictly to COGS (5010) vs AP (2010)',
            ar: 'الفروقات ترحل حصراً لحساب تكلفة الشحن 5010 مقابل ذمم الناقلين 2010'
        }
    },
    {
        id: 'ap-new-bill',
        targetSelector: '[data-tour="ap-action-new-bill"], [data-tour="ap-btn-new-bill"]',
        title: {
            en: 'Record Vendor & Carrier Bills',
            ar: 'تسجيل فاتورة مورد أو ناقل'
        },
        description: {
            en: 'Generate formal vendor bills with due dates, reference numbers, and multi-line expense distributions, defaulting direct shipping charges to COGS Account 5010.',
            ar: 'إنشاء فاتورة رسمية للمورد مع تحديد تاريخ الاستحقاق وتوزيع بنود التكلفة المباشرة إلى حساب تكلفة الشحن 5010.'
        },
        requiredTab: 'ap',
        placement: 'bottom',
        calloutBadge: {
            en: 'Bill Ingestion',
            ar: 'إدخال الفاتورة'
        },
        icon: 'receipt_long',
        hint: {
            en: 'Supports multi-currency conversion with automatic realized FX calculations',
            ar: 'يدعم الفواتير متعددة العملات مع حساب فروق أسعار الصرف آلياً'
        }
    },
    {
        id: 'ap-bills-table',
        targetSelector: '[data-tour="ap-bills-table"], [data-tour="ap-table-bills"]',
        title: {
            en: 'Carrier Bills & Aging Table',
            ar: 'جدول فواتير الناقلين والأعمار'
        },
        description: {
            en: 'Inspect all draft, approved, and partially paid carrier invoices, track remaining balances, and review associated waybills.',
            ar: 'استعراض فواتير الناقلين وحالاتها (مسودة، معتمدة، مسددة جزئياً) وتتبع الرصيد المتبقي والشحنات المرتبطة.'
        },
        requiredTab: 'ap',
        placement: 'top',
        calloutBadge: {
            en: 'Audit Ledger',
            ar: 'سجل المراجعة'
        },
        icon: 'table_chart',
        hint: {
            en: 'Filter by vendor, date range, or payment status (DRAFT / PAID)',
            ar: 'إمكانية التصفية حسب المورد، النطاق الزمني، أو حالة السداد'
        }
    },
    {
        id: 'ap-disbursement',
        targetSelector: '[data-tour="ap-action-pay"], [data-tour="ap-btn-pay"]',
        title: {
            en: 'Disbursement & GL Payment Posting',
            ar: 'صرف الدفعات والترحيل للدفاتر'
        },
        description: {
            en: 'Settle vendor bills via bank transfer or cash. Automatically generates double-entry entries: Cr Bank (1010) and Dr Accounts Payable (2010).',
            ar: 'سداد فواتير الموردين عبر التحويل البنكي أو الخزينة. ينشئ النظام قيداً مزدوجاً: دائن البنك 1010 ومدين الموردين 2010.'
        },
        requiredTab: 'ap',
        placement: 'left',
        calloutBadge: {
            en: 'GL Disbursement',
            ar: 'صرف وترحيل'
        },
        icon: 'payments',
        hint: {
            en: 'Strict idempotency protects against duplicate disbursement posting',
            ar: 'حماية متقدمة تمنع تكرار قيود الصرف لنفس الفاتورة'
        }
    }
];

/**
 * Financial Statements Tour Steps
 * Flow: Statement type selector -> Date filter deck -> Balance Sheet KPIs -> Accounting Equation check -> P&L breakdown -> Trial Balance DR/CR equality
 */
export const STATEMENTS_TOUR_STEPS = [
    {
        id: 'statements-type-selector',
        targetSelector: '[data-tour="statements-type-selector"], [data-tour="statements-selector"]',
        title: {
            en: 'Financial Statement Selector',
            ar: 'محدد نوع القائمة المالية'
        },
        description: {
            en: 'Toggle seamlessly between the Balance Sheet (financial position), Income Statement (P&L performance), and Trial Balance (general ledger equality).',
            ar: 'التبديل بين الميزانية العمومية (المركز المالي)، وقائمة الدخل (الأرباح والخسائر)، وميزان المراجعة (توازن الأستاذ العام).'
        },
        requiredTab: 'statements',
        placement: 'bottom',
        calloutBadge: {
            en: 'Navigation',
            ar: 'التنقل'
        },
        icon: 'account_balance',
        hint: {
            en: 'Real-time calculation derived directly from double-entry journal lines',
            ar: 'حساب لحظي مباشر من قيود اليومية المزدوجة'
        }
    },
    {
        id: 'statements-date-filter',
        targetSelector: '[data-tour="statements-date-filter"], [data-tour="statements-date-controls"]',
        title: {
            en: 'Accounting Period & Date Filter Deck',
            ar: 'لوحة التحكم في التواريخ والفترات'
        },
        description: {
            en: 'Select point-in-time "As of Date" for cumulative balance sheets or custom date ranges for period performance statements.',
            ar: 'تحديد تاريخ محدد "حتى تاريخه" للميزانية التراكمية، أو نطاق زمني مخصص لقوائم الدخل وميزان المراجعة.'
        },
        requiredTab: 'statements',
        placement: 'bottom',
        calloutBadge: {
            en: 'Period Deck',
            ar: 'الفترة المالية'
        },
        icon: 'calendar_month',
        hint: {
            en: 'Supports preset shortcuts: Today, Past 7 Days, This Month, and All-Time',
            ar: 'يدعم الاختصارات السريعة: اليوم، آخر 7 أيام، هذا الشهر، وكامل السجل'
        }
    },
    {
        id: 'statements-kpis',
        targetSelector: '[data-tour="statements-kpis"], [data-tour="statements-assets-card"]',
        title: {
            en: 'Balance Sheet KPI Deck',
            ar: 'مؤشرات المركز المالي الرئيسية'
        },
        description: {
            en: 'Review current balances for Liquid Assets (Bank 1010, Transit 1020, Vault Safe 1030), Customer AR (1100), and Platform Liabilities (2010).',
            ar: 'استعراض الأرصدة الحالية: الأصول المتداولة (البنك 1010، عهد النقل 1020، الخزينة 1030)، الذمم المدينة 1100، والتزامات الشحن 2010.'
        },
        requiredTab: 'statements',
        placement: 'bottom',
        calloutBadge: {
            en: 'Ledger Balances',
            ar: 'أرصدة الأستاذ'
        },
        icon: 'insights',
        hint: {
            en: 'Active accounts: 1000-1999 (Assets), 2000-2999 (Liabilities), 3000-3999 (Equity)',
            ar: 'دليل الحسابات: 1000-1999 (أصول)، 2000-2999 (خصوم)، 3000-3999 (ملكية)'
        }
    },
    {
        id: 'statements-equation-check',
        targetSelector: '[data-tour="statements-equation-check"], [data-tour="statements-equation-kpi"]',
        title: {
            en: 'Accounting Equation Invariant (A = L + E)',
            ar: 'معادلة الميزانية (الأصول = الخصوم + الملكية)'
        },
        description: {
            en: 'Ensures Assets strictly equal Liabilities plus Equity at all times. Displays green badge when balanced, or warns of discrepancies in red.',
            ar: 'التحقق الآلي المستمر من تطابق الأصول مع مجموع الخصوم وحقوق الملكية. تظهر شارة خضراء عند التوازن وتنبيه أحمر في حال وجود فارق.'
        },
        requiredTab: 'statements',
        placement: 'top',
        calloutBadge: {
            en: 'Core Invariant',
            ar: 'التوازن الأساسي'
        },
        icon: 'balance',
        hint: {
            en: 'Formula: Assets == Liabilities + Equity + Retained Net Income',
            ar: 'المعادلة: الأصول == الخصوم + حقوق الملكية + صافي الدخل المحتجز'
        }
    },
    {
        id: 'statements-pnl-breakdown',
        targetSelector: '[data-tour="statements-pnl-breakdown"]',
        title: {
            en: 'Income Statement (P&L) Structure',
            ar: 'هيكل قائمة الدخل والأرباح والخسائر'
        },
        description: {
            en: 'Examine Freight Revenue (4010) and COD Fees (4040) against Direct Carrier COGS (5010) to monitor true gross shipping margins.',
            ar: 'تحليل إيرادات الشحن 4010 وعمولات التحصيل 4040 مقابل تكلفة الشحن المباشر 5010 لحساب هامش الربح الإجمالي الفعلي.'
        },
        requiredTab: 'statements',
        placement: 'top',
        calloutBadge: {
            en: 'Margin Structure',
            ar: 'هيكل الهوامش'
        },
        icon: 'trending_up',
        hint: {
            en: 'Gross Profit = Freight Revenue - Direct Carrier Costs (COGS)',
            ar: 'مجمل الربح = إيراد الشحن - التكلفة المباشرة للناقلين'
        }
    },
    {
        id: 'statements-trial-balance',
        targetSelector: '[data-tour="statements-trial-balance"], [data-tour="statements-liabilities-equity-card"]',
        title: {
            en: 'Trial Balance Debit / Credit Equality',
            ar: 'تطابق ميزان المراجعة للمدين والدائن'
        },
        description: {
            en: 'Verifies SUM(Debits) equals SUM(Credits) across all active general ledger accounts, ensuring double-entry posting integrity.',
            ar: 'التأكد من تساوي مجموع الحركات المدينة مع الدائنة لكافة حسابات دليل الحسابات لضمان سلامة القيود المزدوجة.'
        },
        requiredTab: 'statements',
        placement: 'top',
        calloutBadge: {
            en: 'DR = CR Equality',
            ar: 'تطابق المدين والدائن'
        },
        icon: 'rule',
        hint: {
            en: 'Zero net delta guarantees general ledger equilibrium',
            ar: 'الفارق الصفري يضمن التوازن المطلق لدفاتر الأستاذ العام'
        }
    }
];

/**
 * Financial Reports Tour Steps
 * Flow: Reports subnav -> Profitability margins -> Carrier Reconciliation CSV audit -> Driver COD clearing & Escrow -> Client Statements
 */
export const REPORTS_TOUR_STEPS = [
    {
        id: 'reports-subnav',
        targetSelector: '[data-tour="reports-subnav"], [data-tour="reports-nav-tabs"]',
        title: {
            en: 'Financial Reports Navigation Deck',
            ar: 'لوحة تبويبات التقارير المالية'
        },
        description: {
            en: 'Access targeted operational reports: Shipment Profitability, Carrier Statement Reconciliation, Driver COD Clearing, and FX Rates.',
            ar: 'الوصول إلى التقارير المالية والتشغيلية المتخصصة: ربحية الشحنات، مطابقة كشوف الناقلين، تصفية عهد السائقين، وأسعار الصرف.'
        },
        requiredTab: 'reports',
        placement: 'bottom',
        calloutBadge: {
            en: 'Sub-Navigation',
            ar: 'التنقل الفرعي'
        },
        icon: 'analytics',
        hint: {
            en: 'Each report provides focused audit tools and downloadable spreadsheet data',
            ar: 'كل تقرير يوفر أدوات تدقيق مخصصة وتصدير مباشر للبيانات'
        }
    },
    {
        id: 'reports-profitability-kpi',
        targetSelector: '[data-tour="reports-profitability-kpi"], [data-tour="reports-profitability-summary"]',
        title: {
            en: 'Shipment Profitability & Gross Margins',
            ar: 'ربحية الشحنات وهوامش الربح'
        },
        description: {
            en: 'Analyze billing revenue versus carrier cost per waybill. Filter by carrier or client to pinpoint negative-margin routes.',
            ar: 'تحليل الإيرادات المحصلة مقابل تكلفة الناقل لكل بوليصة شحن، مع إمكانية التصفية بحسب شركة الشحن أو العميل لكشف المسارات الخاسرة.'
        },
        requiredTab: 'reports',
        placement: 'bottom',
        calloutBadge: {
            en: 'Unit Economics',
            ar: 'اقتصاديات الوحدة'
        },
        icon: 'pie_chart',
        hint: {
            en: 'Tracks Customer Price vs Carrier Cost vs Margin Percentage',
            ar: 'تتبع سعر العميل مقابل تكلفة الناقل ونسبة هامش الربح'
        }
    },
    {
        id: 'reports-recon-uploader',
        targetSelector: '[data-tour="reports-recon-uploader"], [data-tour="reports-reconciliation-upload"]',
        title: {
            en: 'Carrier Reconciliation CSV Audit',
            ar: 'تدقيق ومطابقة كشوف الناقلين CSV'
        },
        description: {
            en: 'Upload external carrier invoices to calculate variance against internal cost snapshots. Variances post only to platform AP (2010) and COGS (5010).',
            ar: 'رفع كشوف الفواتير الخارجية لمقارنتها بتكاليف الشحنات المسجلة. أي فروقات ترحل فقط لحساب ذمم الناقلين 2010 وتكلفة الشحن 5010.'
        },
        requiredTab: 'reports',
        placement: 'top',
        calloutBadge: {
            en: 'CSV Reconciliation',
            ar: 'مطابقة الكشوف'
        },
        icon: 'upload_file',
        hint: {
            en: 'Supports automated parsing for DHL, Aramex, FedEx, and LogesTechs',
            ar: 'يدعم المعالجة الآلية لفواتير DHL وأرامكس وفيديكس ولوجستكس'
        }
    },
    {
        id: 'reports-cod-clearing',
        targetSelector: '[data-tour="reports-cod-clearing"]',
        title: {
            en: 'Driver COD Clearing & Vault Remittance',
            ar: 'تصفية عهد السائقين وتوريد الخزينة'
        },
        description: {
            en: 'Monitor the 4-stage fiduciary chain: Driver Transit (1020) -> Hub Vault Safe (1030) -> Merchant Escrow (2100) -> Net Payout Settlement (1010).',
            ar: 'متابعة دورة أمانات الدفع عند الاستلام: عهدة السائق 1020 -> خزينة الفرع 1030 -> أمانات التاجر 2100 -> الصرف البنكي الصافي 1010.'
        },
        requiredTab: 'reports',
        placement: 'top',
        calloutBadge: {
            en: 'Fiduciary Flow',
            ar: 'سلسلة العهدة'
        },
        icon: 'security',
        hint: {
            en: 'Net merchant settlement deducts unpaid freight AR from gross COD',
            ar: 'صرف مستحقات المتاجر يخصم ذمم الشحن غير المسددة من إجمالي التحصيل'
        }
    },
    {
        id: 'reports-export-actions',
        targetSelector: '[data-tour="reports-export-actions"]',
        title: {
            en: 'Audit-Ready Statement Exports',
            ar: 'تصدير كشوف الحسابات المعتمدة'
        },
        description: {
            en: 'Generate formal PDF merchant statements, carrier reconciliation spreadsheets, and general ledger exports for accounting audits.',
            ar: 'تصدير كشوف حسابات العملاء الرسمية PDF وكشوف مطابقة الشحن وملفات الأستاذ العام للاعتماد المحاسبي.'
        },
        requiredTab: 'reports',
        placement: 'left',
        calloutBadge: {
            en: 'Audit Exports',
            ar: 'تصدير للتدقيق'
        },
        icon: 'download',
        hint: {
            en: 'Statements adhere to standard GAAP & IFRS presentation formats',
            ar: 'الكشوف مطابقة للمعايير المحاسبية المعتمدة'
        }
    }
];

/**
 * Full Finance Walkthrough Tour Steps
 * Master tour traversing all key domains
 */
export const FULL_FINANCE_TOUR_STEPS = [
    {
        id: 'finance-header',
        targetSelector: '[data-tour="finance-header"]',
        title: {
            en: 'Welcome to Target Financials & Accounting',
            ar: 'مرحباً بك في النظام المالي والمحاسبي'
        },
        description: {
            en: 'The financial engine powers double-entry accounting, customer billing, carrier settlements, and COD escrow workflows.',
            ar: 'المحرك المالي لمنصة تارجت يدير القيود المزدوجة وفواتير العملاء ومستحقات الناقلين وأمانات الدفع عند الاستلام.'
        },
        requiredTab: 'overview',
        placement: 'bottom',
        calloutBadge: {
            en: 'Finance Hub',
            ar: 'مركز المالية'
        },
        icon: 'wallet',
        hint: {
            en: 'Single-operator 3PL financial suite tailored for logistics operations',
            ar: 'نظام مالي متكامل مصمم خصيصاً للعمليات اللوجستية والشحن'
        }
    },
    {
        id: 'finance-suite-selector',
        targetSelector: '[data-tour="finance-suite-selector"]',
        title: {
            en: 'Three Integrated Financial Suites',
            ar: 'ثلاثة أجنحة مالية متكاملة'
        },
        description: {
            en: 'Easily navigate between Customer AR & Invoicing, Driver COD Vault Clearing, and Corporate ERP Ledgers & Statements.',
            ar: 'تنقل بسلاسة بين قسم العملاء والفوترة (AR)، وخزينة تحصيل السائقين (COD)، والأستاذ العام والقوائم المالية (ERP).'
        },
        requiredTab: 'overview',
        placement: 'bottom',
        calloutBadge: {
            en: 'Workspace Suites',
            ar: 'أجنحة العمل'
        },
        icon: 'domain',
        hint: {
            en: 'Tier-1 suites isolate customer, fleet vault, and corporate ledgers',
            ar: 'الأجنحة الرئيسية تفصل بين حسابات العملاء، عهد السائقين، والأستاذ العام'
        }
    },
    {
        id: 'ap-overview-kpi',
        targetSelector: '[data-tour="ap-kpi-outstanding"], [data-tour="ap-kpi-bar"]',
        title: {
            en: 'Accounts Payable & Carrier Settlements',
            ar: 'مستحقات الناقلين وفواتير الموردين'
        },
        description: {
            en: 'Review outstanding liabilities accrued automatically from shipments, run 3-way matching, and disburse bank payments.',
            ar: 'متابعة الالتزامات المستحقة للناقلين الناتجة آلياً عن الشحنات، وتشغيل المطابقة الثلاثية، وصرف الحوالات البنكية.'
        },
        requiredTab: 'ap',
        placement: 'bottom',
        calloutBadge: {
            en: 'Accounts Payable',
            ar: 'مستحقات الموردين'
        },
        icon: 'assignment_returned',
        hint: {
            en: 'Carrier liability accrues at the moment of shipment booking',
            ar: 'يتم استحقاق ذمة الناقل فور تأكيد حجز الشحنة'
        }
    },
    {
        id: 'statements-equation-check',
        targetSelector: '[data-tour="statements-equation-check"], [data-tour="statements-equation-kpi"]',
        title: {
            en: 'Real-Time Balance Sheet & Equation Check',
            ar: 'الميزانية اللحظية والتحقق من التوازن'
        },
        description: {
            en: 'Inspect live double-entry trial balances and automated verification of Assets = Liabilities + Equity.',
            ar: 'استعراض ميزان المراجعة اللحظي والتحقق الآلي الدائم من معادلة الأصول = الخصوم + حقوق الملكية.'
        },
        requiredTab: 'statements',
        placement: 'top',
        calloutBadge: {
            en: 'Statements',
            ar: 'القوائم المالية'
        },
        icon: 'balance',
        hint: {
            en: 'Double-entry engine guarantees balanced ledger postings',
            ar: 'محرك القيد المزدوج يضمن سلامة وتوازن القيود دائماً'
        }
    },
    {
        id: 'reports-subnav',
        targetSelector: '[data-tour="reports-subnav"], [data-tour="reports-nav-tabs"]',
        title: {
            en: 'Financial Reports & Profitability Analytics',
            ar: 'التقارير المالية وتحليلات الربحية'
        },
        description: {
            en: 'Track shipment unit margins, upload carrier invoices for automated CSV audits, and monitor COD clearing pipelines.',
            ar: 'تتبع هوامش ربحية الشحنات، ومطابقة فواتير الناقلين عبر ملفات CSV، ومراقبة تصفية عهد السائقين.'
        },
        requiredTab: 'reports',
        placement: 'bottom',
        calloutBadge: {
            en: 'Reports & Audits',
            ar: 'التقارير والتدقيق'
        },
        icon: 'analytics',
        hint: {
            en: 'Unit economics track gross margin per shipment and client',
            ar: 'تحليل اقتصادي دقيق لهامش ربح كل شحنة وعميل'
        }
    }
];

/**
 * Map of all available tour configurations
 */
export const FINANCIAL_TOUR_CONFIGS = {
    [TOUR_IDS.AP_TOUR]: AP_TOUR_STEPS,
    [TOUR_IDS.STATEMENTS_TOUR]: STATEMENTS_TOUR_STEPS,
    [TOUR_IDS.REPORTS_TOUR]: REPORTS_TOUR_STEPS,
    [TOUR_IDS.FULL_TOUR]: FULL_FINANCE_TOUR_STEPS,
    // Aliases
    TOUR_ACCOUNTS_PAYABLE: AP_TOUR_STEPS,
    TOUR_FINANCIAL_STATEMENTS: STATEMENTS_TOUR_STEPS,
    TOUR_FINANCIAL_REPORTS: REPORTS_TOUR_STEPS,
    TOUR_FULL_FINANCE: FULL_FINANCE_TOUR_STEPS,
    ap: AP_TOUR_STEPS,
    statements: STATEMENTS_TOUR_STEPS,
    reports: REPORTS_TOUR_STEPS,
    full: FULL_FINANCE_TOUR_STEPS
};

/**
 * Tour metadata for UI launchers, cards, and descriptions
 */
export const FINANCIAL_TOUR_METADATA = {
    [TOUR_IDS.AP_TOUR]: {
        id: TOUR_IDS.AP_TOUR,
        title: {
            en: 'Accounts Payable (AP) Walkthrough',
            ar: 'جولة مستحقات الموردين والناقلين'
        },
        description: {
            en: 'Carrier liability accruals, 3-way invoice matching, vendor bill entry, and payment disbursement.',
            ar: 'استحقاق تكاليف الشحن، المطابقة الثلاثية للفواتير، إدخال فواتير الموردين، وصرف المدفوعات.'
        },
        icon: 'assignment_returned',
        badge: '5 Steps',
        badgeAr: '5 خطوات',
        estimatedMinutes: 3,
        targetTab: 'ap'
    },
    [TOUR_IDS.STATEMENTS_TOUR]: {
        id: TOUR_IDS.STATEMENTS_TOUR,
        title: {
            en: 'Financial Statements Walkthrough',
            ar: 'جولة القوائم المالية'
        },
        description: {
            en: 'Balance Sheet, P&L revenue vs COGS breakdown, accounting equation checks, and Trial Balance equilibrium.',
            ar: 'الميزانية العمومية، تحليل الأرباح والخسائر، التحقق من معادلة الميزانية، وتوازن ميزان المراجعة.'
        },
        icon: 'account_balance',
        badge: '6 Steps',
        badgeAr: '6 خطوات',
        estimatedMinutes: 4,
        targetTab: 'statements'
    },
    [TOUR_IDS.REPORTS_TOUR]: {
        id: TOUR_IDS.REPORTS_TOUR,
        title: {
            en: 'Financial Reports & Auditing Walkthrough',
            ar: 'جولة التقارير المالية والتدقيق'
        },
        description: {
            en: 'Shipment unit economics, carrier statement reconciliation, driver COD clearing, and official exports.',
            ar: 'ربحية الشحنات، مطابقة كشوف الناقلين، تصفية عهد السائقين، وتصدير التقارير الرسمية.'
        },
        icon: 'analytics',
        badge: '5 Steps',
        badgeAr: '5 خطوات',
        estimatedMinutes: 3,
        targetTab: 'reports'
    },
    [TOUR_IDS.FULL_TOUR]: {
        id: TOUR_IDS.FULL_TOUR,
        title: {
            en: 'Master Finance Overview Tour',
            ar: 'الجولة المالية الشاملة'
        },
        description: {
            en: 'High-level traversal across all core financial suites, ledgers, and reporting decks.',
            ar: 'جولة تعريفية شاملة تمر بكافة الأجنحة المالية ودفاتر الأستاذ وأدوات التقارير.'
        },
        icon: 'explore',
        badge: '5 Steps',
        badgeAr: '5 خطوات',
        estimatedMinutes: 4,
        targetTab: 'overview'
    }
};

/**
 * Resolves a tourId to its configured steps array
 * @param {string} tourId - Tour ID or alias
 * @returns {Array} Array of step configurations
 */
export const getTourSteps = (tourId) => {
    if (!tourId) return [];
    if (FINANCIAL_TOUR_CONFIGS[tourId]) {
        return FINANCIAL_TOUR_CONFIGS[tourId];
    }
    const resolvedId = TOUR_ALIASES[tourId];
    if (resolvedId && FINANCIAL_TOUR_CONFIGS[resolvedId]) {
        return FINANCIAL_TOUR_CONFIGS[resolvedId];
    }
    return [];
};

/**
 * Resolves a tourId to its metadata
 * @param {string} tourId - Tour ID or alias
 * @returns {Object|null} Tour metadata object
 */
export const getTourMetadata = (tourId) => {
    if (!tourId) return null;
    const resolvedId = TOUR_ALIASES[tourId] || tourId;
    return FINANCIAL_TOUR_METADATA[resolvedId] || null;
};
