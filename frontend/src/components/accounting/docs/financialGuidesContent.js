/**
 * financialGuidesContent.js
 * 
 * Authoritative financial documentation catalog for Target Logistics 3PL Accounting.
 * Covers:
 *  - Accounts Payable (AP) & Supplier/Carrier Invoicing (3-Way Matching, Carrier vs Vendor Bills, Account Codes)
 *  - Financial Statements (Balance Sheet, Income Statement P&L, Trial Balance, Accounting Equation A = L + E)
 *  - Financial Reports & Auditing (Shipment Profitability, Carrier Reconciliation, COD Fiduciary Loop, FX Engine)
 */

export const FINANCIAL_CATEGORIES = [
  { id: 'all', label: { en: 'All Guides', ar: 'جميع الأدلة' }, icon: 'menu_book' },
  { id: 'ap', label: { en: 'Accounts Payable', ar: 'مستحقات الموردين والناقلين' }, icon: 'assignment_returned' },
  { id: 'statements', label: { en: 'Financial Statements', ar: 'القوائم المالية والتقارير' }, icon: 'account_balance' },
  { id: 'reports', label: { en: 'Reports & Auditing', ar: 'التقارير والمطابقة وتصفية COD' }, icon: 'analytics' }
];

export const FINANCIAL_GUIDES = [
  {
    id: 'accounts-payable',
    category: 'ap',
    icon: 'assignment_returned',
    badge: { en: 'Core Accounting SOP', ar: 'إجراءات تشغيل قياسية' },
    title: {
      en: 'Accounts Payable (AP) & Carrier Bill Ingestion',
      ar: 'إدارة مستحقات الموردين وفواتير شركات الشحن (AP)'
    },
    summary: {
      en: 'Standard Operating Procedures for carrier cost accrual, vendor operating bills, 3-way reconciliation, account code allocations (5010/6020/1150/2010/2020), and bank disbursements.',
      ar: 'دليل الإجراءات القياسية لاستحقاق تكاليف الشحن، فواتير الموردين، المطابقة الثلاثية، ترميز الحسابات المحاسبية، وصرف المستحقات عبر البنوك.'
    },
    tourId: 'TOUR_ACCOUNTS_PAYABLE',
    targetTab: 'ap',
    diagramType: 'THREE_WAY_MATCH',
    keyAccounts: [
      {
        code: '2010',
        name: { en: 'Accounts Payable - Carrier Partners', ar: 'ذمم دائنة - شركات الشحن' },
        type: 'LIABILITY',
        drCrNormal: 'CR',
        description: {
          en: 'Accrues wholesale shipping liabilities for DHL Express, LogesTechs/OTE, Aramex, and FedEx upon booking.',
          ar: 'يقيد التزامات الشحن بالجملة للناقلين (DHL، لوجستكس، أرامكس، فيديكس) فور تأكيد الحجز.'
        }
      },
      {
        code: '2020',
        name: { en: 'Accounts Payable - Trade & OpEx Vendors', ar: 'ذمم دائنة - موردون تجاريون ومصروفات' },
        type: 'LIABILITY',
        drCrNormal: 'CR',
        description: {
          en: 'Tracks operational liabilities for warehouse packaging, customs brokers, equipment leases, and utilities.',
          ar: 'يتتبع التزامات التوريد لمواد التغليف والتخزين، مخلصي الجمارك، وعقود الصيانة.'
        }
      },
      {
        code: '5010',
        name: { en: 'Direct Freight Shipping Cost (COGS)', ar: 'تكلفة الشحن المباشر (تكلفة البضاعة المباعة)' },
        type: 'EXPENSE',
        drCrNormal: 'DR',
        description: {
          en: 'Direct Cost of Goods Sold recognized simultaneously with shipment billing revenue for accurate gross margins.',
          ar: 'تكلفة المبيعات المباشرة للشحن المعترف بها بالتزامن مع إيراد الشحنة لاحتساب مجمل الربح بدقة.'
        }
      },
      {
        code: '6020',
        name: { en: 'Warehouse & Shipping Supplies OpEx', ar: 'مصروفات مستلزمات المستودع والتغليف' },
        type: 'EXPENSE',
        drCrNormal: 'DR',
        description: {
          en: 'Consumables, barcode labels, thermal rolls, and bubble mailers not directly tied to a single waybill.',
          ar: 'المستهلكات وملصقات الباركود وأدوات التغليف التي لا ترتبط مباشرة ببوليصة شحن واحدة.'
        }
      },
      {
        code: '1150',
        name: { en: 'Prepaid Expenses & Carrier Deposits', ar: 'مصروفات مدفوعة مقدماً وتأمينات الناقلين' },
        type: 'ASSET',
        drCrNormal: 'DR',
        description: {
          en: 'Advance float balances and security deposits deposited with carrier accounts before invoice reconciliation.',
          ar: 'الأرصدة المودعة مقدماً والتأمينات المودعة لدى شركات الشحن قبل إصدار الفواتير الدورية.'
        }
      },
      {
        code: '1010',
        name: { en: 'Bank Current Operating Account', ar: 'الحساب الجاري لدى البنك' },
        type: 'ASSET',
        drCrNormal: 'DR',
        description: {
          en: 'Primary corporate checking account used for wire transfers and settlements of verified vendor vouchers.',
          ar: 'الحساب البنكي التجاري الرئيسي المستخدم في التحويلات وسداد فواتير الموردين المعتمدة.'
        }
      }
    ],
    flowSteps: [
      {
        step: 1,
        title: { en: 'Consignment Cost Accrual', ar: 'استحقاق تكلفة الشحنة' },
        description: {
          en: 'Upon shipment creation/Phenix import, platform atomically records CARRIER_PAYABLE (CR 2010) and Freight COGS (DR 5010).',
          ar: 'عند إنشاء الشحنة أو سحبها من فينيكس، يسجل النظام آلياً استحقاق الناقل (دائن 2010) وتكلفة الشحن (مدين 5010).'
        },
        icon: 'receipt_long'
      },
      {
        step: 2,
        title: { en: 'Vendor Bill Ingestion', ar: 'تسجيل فاتورة المورد' },
        description: {
          en: 'Formalize periodic carrier statements or supplier invoices into system Vendor Bills with due dates and line-item allocations.',
          ar: 'تحويل كشوف حساب الناقل الدورية أو فواتير الموردين إلى فواتير شراء معتمدة بآجال استحقاق وبنود تفصيلية.'
        },
        icon: 'post_add'
      },
      {
        step: 3,
        title: { en: '3-Way Match Verification', ar: 'المطابقة الثلاثية الآلية' },
        description: {
          en: 'System compares Bill Line amounts against Shipment costPrice snapshots and original Rate Card tariffs to flag variances.',
          ar: 'مقارنة بنود الفاتورة آلياً مع سعر التكلفة المسجل وتعرفات عقود الشحن المعتمدة لاكتشاف أي فروقات.'
        },
        icon: 'fact_check'
      },
      {
        step: 4,
        title: { en: 'Voucher Approval & Disbursement', ar: 'الاعتماد والصرف البنكي' },
        description: {
          en: 'Authorized disbursement issues payment (CR 1010, DR 2010/2020), clearing the AP voucher and logging an audit stamp.',
          ar: 'صرف مستحقات الفاتورة عبر البنك (دائن 1010، مدين 2010/2020) مع إقفال قيد الاستحقاق وتوثيق الاعتماد.'
        },
        icon: 'payments'
      }
    ],
    sections: [
      {
        id: 'carrier-vs-vendor',
        heading: { en: '1. Carrier Direct Liabilities vs. Trade Vendor Bills', ar: '١. التزامات الناقلين المباشرة مقابل فواتير الموردين التجاريين' },
        icon: 'compare_arrows',
        body: {
          en: 'Target Logistics handles two distinct accounts payable tracks: Carrier Freight Payables (Account 2010) and General Trade Vendor Bills (Account 2020). Carrier payables are generated on a per-shipment basis directly linked to carrier AWB tracking numbers, while trade bills represent recurring operational costs like warehouse rent, packaging supplies, and customs brokerage.',
          ar: 'تتعامل تارجت اللوجستية مع مسارين منفصلين للذمم الدائنة: مستحقات شركات الشحن (حساب 2010) وفواتير الموردين التجاريين (حساب 2020). تُنشأ مستحقات الشحن لكل بوليصة شحن وترتبط مباشرة برقم التتبع AWB، بينما تمثل فواتير الموردين مصروفات التشغيل الدورية مثل مستلزمات التغليف وإيجار المستودعات والتخليص الجمركي.'
        },
        bulletPoints: [
          {
            en: 'Carrier Payables (2010) are credited automatically during booking and tied to internal costPrice snapshots.',
            ar: 'تُقيد مستحقات الناقلين (2010) آلياً عند حجز الشحنة وترتبط بلقطة سعر التكلفة المعتمدة.'
          },
          {
            en: 'Trade Bills (2020) require manual voucher entry or CSV batch ingestion with GL allocation lines to 6020 or 1150.',
            ar: 'تتطلب فواتير الموردين (2020) تسجيلاً يدوياً أو استيراداً مع تخصيص البنود لمصروفات التشغيل 6020 أو الأصول المتداولة 1150.'
          },
          {
            en: 'Platform prevents cross-contamination: Carrier bill discrepancies NEVER mutate customer merchant AR balances.',
            ar: 'يمنع النظام التداخل: أي فروقات في فواتير الناقل لا تمس إطلاقاً أرصدة وحسابات العملاء الشاحنين.'
          }
        ]
      },
      {
        id: 'three-way-matching',
        heading: { en: '2. The 3-Way Match Verification Rule', ar: '٢. قاعدة التدقيق بالمطابقة الثلاثية (3-Way Matching)' },
        icon: 'find_in_page',
        body: {
          en: 'Before approving any carrier disbursement voucher, the system executes an automated 3-way match across three independent records: (A) The Shipment Booking Rate Card Snapshot, (B) The Carrier Electronic Billing Invoice (EDI/CSV), and (C) The Actual Delivery & Volumetric Weight confirmation.',
          ar: 'قبل اعتماد أي سند صرف لشركة شحن، ينفذ النظام مطابقة ثلاثية آلية بين ثلاثة مصادر مستقلة: (أ) لقطة تعرفة الشحن المعتمدة عند الحجز، (ب) الفاتورة الإلكترونية الصادرة من شركة الشحن، و(ج) إثبات التسليم وأوزان الطرود الفعلية.'
        },
        bulletPoints: [
          {
            en: 'Tolerances: A variance of ±0.050 KWD per consignment is flagged for supervisor review before voucher approval.',
            ar: 'نسب السماح: يتم تعليق أي تفاوت يزيد عن ±0.050 د.ك لكل بوليصة لمراجعة المشرف المالي قبل الصرف.'
          },
          {
            en: 'Volumetric Discrepancies: If DHL/Aramex re-weighed a parcel higher than declared, the variance is logged to Carrier Reconciliation.',
            ar: 'فروقات الوزن الحجمي: في حال أثبت الناقل وزناً حجمياً أعلى، يقيد الفرق في سجل مطابقة الناقل لتحديد المسؤولية.'
          },
          {
            en: 'Variance Posting: Approved discrepancies debit 5010 (Cost Adjustment) and credit 2010 (Carrier AP) without altering merchant billing.',
            ar: 'ترحيل الفروقات: الفروقات المعتمدة ترحل كقيد تسوية (مدين 5010 ودائن 2010) مع ثبات أسعار بيع العملاء.'
          }
        ],
        warning: {
          en: 'Never mark a carrier bill as PAID before executing the 3-Way Match tool. Unmatched bills risk overpayment on cancelled or redirected waybills.',
          ar: 'تنبيه: لا تقم أبداً بتسوية فاتورة الناقل كـ "مدفوعة" قبل تشغيل أداة المطابقة الثلاثية لتجنب السداد المزدوج لشحنات ملغاة.'
        }
      },
      {
        id: 'disbursement-workflow',
        heading: { en: '3. Disbursement Execution & Double-Entry Posting', ar: '٣. تنفيذ الصرف والترحيل المحاسبي المزدوج' },
        icon: 'account_balance_wallet',
        body: {
          en: 'Settling a verified vendor bill triggers an immutable Double-Entry Journal Entry in the General Ledger. The payment record references the specific Bill ID, bank transaction confirmation number, and payment method (KNET, Bank Wire, or Cash Voucher).',
          ar: 'يؤدي سداد فاتورة المورد المعتمدة إلى إنشاء قيد يومية آلي غير قابل للتعديل في دفتر الأستاذ العام. يوثق سند السداد رقم الفاتورة ومرجع التحويل البنكي وطريقة الدفع (كي نت، تحويل بنكي، أو شيك).'
        },
        bulletPoints: [
          {
            en: 'Debit: Accounts Payable (Account 2010 or 2020) — decreases platform liability.',
            ar: 'مدين: حساب ذمم الموردين والناقلين (2010 أو 2020) — تخفيض الالتزام المالي على المنصة.'
          },
          {
            en: 'Credit: Bank Current Account (Account 1010) — decreases cash/bank asset.',
            ar: 'دائن: حساب البنك الجاري (حساب 1010) — تخفيض رصيد النقدية بالبنك.'
          },
          {
            en: 'Status Transition: Bill status advances from APPROVED → PAID (or PARTIALLY_PAID if installment).',
            ar: 'تحديث الحالة: تنتقل حالة الفاتورة من "معتمدة" إلى "مدفوعة" (أو "مدفوعة جزئياً" في حال الدفعات المجزأة).'
          }
        ]
      }
    ],
    checklists: [
      {
        id: 'ap-voucher-audit',
        title: { en: 'AP Voucher Pre-Disbursement Checklist', ar: 'قائمة تدقيق فواتير الشراء قبل الصرف' },
        items: [
          { en: 'Confirm all waybill tracking numbers in the carrier invoice exist in Target DB.', ar: 'التأكد من وجود أرقام بوالص التتبع المسجلة بفاتورة الناقل داخل قاعدة بيانات تارجت.' },
          { en: 'Run 3-Way Match tool to highlight weight or rate card variances.', ar: 'تشغيل أداة المطابقة الثلاثية لحصر فروقات الأوزان أو بنود الرسوم الإضافية.' },
          { en: 'Verify payment bank IBAN matches vendor approved vendor master file.', ar: 'التحقق من مطابقة الحساب البنكي والآيبان للبيانات المعتمدة في سجل المورد.' },
          { en: 'Ensure accounting period is OPEN for the payment execution date.', ar: 'التأكد من أن الفترة المالية مفتوحة ومتاحة لترحيل القيود بتاريخ السداد.' }
        ]
      }
    ],
    keyTakeaways: [
      {
        en: 'Carrier payables (2010) are segregated from trade vendor payables (2020) for strict operational clarity.',
        ar: 'فصل مستحقات شركات الشحن (2010) عن فواتير الموردين التجاريين (2020) لضمان دقة الرقابة المالية.'
      },
      {
        en: 'Carrier bill reconciliations adjust only COGS (5010) and never distort merchant customer balances.',
        ar: 'فروقات مطابقة فواتير الشحن تؤثر فقط على تكلفة المبيعات (5010) ولا تمس حسابات العملاء أبداً.'
      },
      {
        en: 'Every disbursement voucher is supported by an immutable double-entry journal entry.',
        ar: 'كل سند صرف بنكي يدعمه قيد يومية مزدوج غير قابل للتعديل في الأستاذ العام.'
      }
    ]
  },
  {
    id: 'financial-statements',
    category: 'statements',
    icon: 'account_balance',
    badge: { en: 'Double-Entry Core', ar: 'معايير القيد المزدوج' },
    title: {
      en: 'Financial Statements (Balance Sheet, P&L & Trial Balance)',
      ar: 'القوائم المالية (الميزانية العمومية، الأرباح والخسائر، وميزان المراجعة)'
    },
    summary: {
      en: 'Comprehensive reference for Target Logistics double-entry financial statements, real-time balance-check invariants (Assets = Liabilities + Equity), P&L margin structures, and debit/credit normal balance rules.',
      ar: 'مرجع شامل للقوائم المالية لمنظومة تارجت اللوجستية، التحقق اللحظي من توازن الميزانية (الأصول = الخصوم + حقوق الملكية)، هيكل أرباح الشحن، وقواعد طبيعة الحسابات.'
    },
    tourId: 'TOUR_FINANCIAL_STATEMENTS',
    targetTab: 'statements',
    diagramType: 'ACCOUNTING_EQUATION',
    keyAccounts: [
      {
        code: '1xxx',
        name: { en: 'Assets (Cash, AR, Vault Safe, Float)', ar: 'الأصول (النقدية، الذمم المدينة، الخزينة، العهد)' },
        type: 'ASSET',
        drCrNormal: 'DR',
        description: {
          en: 'Current economic resources owned by Target Logistics. Debits increase (+), Credits decrease (-). Includes 1010 Bank, 1020 Cash in Transit, 1030 Hub Vault, 1100 Customer AR.',
          ar: 'الموارد الاقتصادية المملوكة للمنصة. تزيد بالمدين (+) وتنقص بالدائن (-). تشمل البنك 1010، نقدية المناديب 1020، الخزينة 1030، والمدينون 1100.'
        }
      },
      {
        code: '2xxx',
        name: { en: 'Liabilities (Carrier AP, COD Escrow, Taxes)', ar: 'الخصوم (مستحقات الشحن، أمانات COD، الموردين)' },
        type: 'LIABILITY',
        drCrNormal: 'CR',
        description: {
          en: 'External obligations owed to carriers and merchants. Credits increase (+), Debits decrease (-). Includes 2010 Carrier AP, 2020 Vendor AP, 2100 Merchant COD Escrow.',
          ar: 'الالتزامات المستحقة لشركات الشحن والتجار. تزيد بالدائن (+) وتنقص بالمدين (-). تشمل مستحقات الناقلين 2010 وأمانات التحصيل 2100.'
        }
      },
      {
        code: '3xxx',
        name: { en: 'Equity (Paid-In Capital & Retained Earnings)', ar: 'حقوق الملكية (رأس المال، الأرباح المبقاة)' },
        type: 'EQUITY',
        drCrNormal: 'CR',
        description: {
          en: 'Net residual interest in the platform. Credits increase (+), Debits decrease (-). Incorporates net operating income from current and prior periods.',
          ar: 'صافي حقوق الملاك والشركاء. تزيد بالدائن (+) وتنقص بالمدين (-). تتضمن صافي أرباح الفترات الحالية والسابقة.'
        }
      },
      {
        code: '4xxx',
        name: { en: 'Operating Revenues (Freight Billing & COD Fees)', ar: 'الإيرادات التشغيلية (رسوم الشحن، عمولات التحصيل)' },
        type: 'REVENUE',
        drCrNormal: 'CR',
        description: {
          en: 'Revenues earned from client shipping fees (4010), express air surcharges (4020), and COD fiduciary collection fees (4040). Credits increase (+).',
          ar: 'الإيرادات المحققة من رسوم شحن الطرود (4010)، رسوم الشحن السريع (4020)، وعمولات إدارة الدفع عند الاستلام (4040).'
        }
      },
      {
        code: '5xxx',
        name: { en: 'Direct Cost of Sales / COGS (Carrier Costs)', ar: 'تكلفة المبيعات المباشرة (تكاليف الناقلين)' },
        type: 'EXPENSE',
        drCrNormal: 'DR',
        description: {
          en: 'Wholesale carrier waybill costs (5010) directly attributable to delivered cargo. Debits increase (+), reducing Gross Profit.',
          ar: 'تكاليف بوالص الشحن بالجملة (5010) المنسوبة مباشرة للشحنات المنفذة، وتخصم من الإيراد لاحتساب مجمل الربح.'
        }
      },
      {
        code: '6xxx',
        name: { en: 'Operating Expenses (Warehousing, Supplies, Admin)', ar: 'المصروفات التشغيلية والإدارية' },
        type: 'EXPENSE',
        drCrNormal: 'DR',
        description: {
          en: 'Overhead expenses including hub facility rent (6010), packaging supplies (6020), fleet fuel (6030), and IT hosting. Debits increase (+).',
          ar: 'المصروفات العامة والإدارية تشمل إيجار المستودعات (6010)، أدوات التغليف (6020)، ووقود الأسطول (6030).'
        }
      }
    ],
    flowSteps: [
      {
        step: 1,
        title: { en: 'Journal Entry Validation', ar: 'التحقق من توازن القيد' },
        description: {
          en: 'Every operational event enforces BaseDebit == BaseCredit and verifies that the active financial period is open.',
          ar: 'التأكد من تطابق المدين مع الدائن بدقة وتأكيد أن الفترة المالية الحالية مفتوحة قبل الترحيل.'
        },
        icon: 'rule'
      },
      {
        step: 2,
        title: { en: 'Trial Balance Verification', ar: 'مراجعة ميزان المراجعة' },
        description: {
          en: 'Aggregates ending balances for all active accounts. Total Debits must match Total Credits across the entire Chart of Accounts.',
          ar: 'تجميع الأرصدة الختامية لجميع الحسابات، مع اشتراط تطابق إجمالي المدين مع إجمالي الدائن تماماً.'
        },
        icon: 'balance'
      },
      {
        step: 3,
        title: { en: 'P&L Statement Calculation', ar: 'احتساب قائمة الدخل' },
        description: {
          en: 'Revenues (4xxx) minus Carrier COGS (5xxx) yields Gross Profit; subtracting OpEx (6xxx) determines Net Operating Income.',
          ar: 'خصم تكلفة الشحن (5xxx) من الإيرادات (4xxx) يحدد مجمل الربح، وبخصم المصروفات (6xxx) يُحسب صافي الدخل.'
        },
        icon: 'trending_up'
      },
      {
        step: 4,
        title: { en: 'Balance Sheet Equilibrium', ar: 'توازن الميزانية العمومية' },
        description: {
          en: 'Verifies the fundamental equation: Total Assets == Total Liabilities + Total Equity (including period retained earnings).',
          ar: 'التحقق اللحظي من المعادلة الذهبية: إجمالي الأصول = إجمالي الخصوم + حقوق الملكية (متضمنة أرباح الفترة).'
        },
        icon: 'account_balance'
      }
    ],
    sections: [
      {
        id: 'accounting-equation',
        heading: { en: '1. The Fundamental Accounting Invariant (Assets = Liabilities + Equity)', ar: '١. المعادلة المحاسبية الأساسية (الأصول = الخصوم + حقوق الملكية)' },
        icon: 'scale',
        body: {
          en: 'At any point in time, the platform evaluates the balance sheet equation: Total Assets (1xxx) must precisely equal Total Liabilities (2xxx) plus Total Equity (3xxx). If an imbalance of even 0.001 KWD is detected, the UI displays an alert badge and prevents financial period closure until reconciled.',
          ar: 'يقوم النظام لحظياً بمطابقة معادلة المركز المالي: إجمالي الأصول (1xxx) يجب أن يعادل تماماً إجمالي الخصوم (2xxx) مضافاً إليها حقوق الملكية (3xxx). في حال وجود أي فرق ولو بمقدار 0.001 د.ك، يظهر تنبيه فوري ويُمنع إقفال الفترة المالية حتى تصحيح الخلل.'
        },
        bulletPoints: [
          {
            en: 'Assets: Cash in Bank (1010), Drivers in Transit (1020), Hub Safe (1030), Client Receivables (1100).',
            ar: 'الأصول: نقدية البنك (1010)، عهد المناديب (1020)، خزينة الفرع (1030)، ومديونيات العملاء (1100).'
          },
          {
            en: 'Liabilities: Carrier Payables (2010), Vendor Payables (2020), Merchant COD Escrow (2100).',
            ar: 'الخصوم: مستحقات الناقلين (2010)، فواتير الموردين (2020)، وأمانات تحصيل المتاجر (2100).'
          },
          {
            en: 'Equity: Paid-In Capital (3010) + Retained Earnings (3020) + Current Period Net Profit.',
            ar: 'حقوق الملكية: رأس المال (3010) + الأرباح المبقاة (3020) + صافي أرباح الفترة الجارية.'
          }
        ]
      },
      {
        id: 'pnl-margin-tiers',
        heading: { en: '2. Multi-Tier Income Statement (P&L) Architecture', ar: '٢. هيكل قائمة الدخل والأرباح متعدد المراحل' },
        icon: 'query_stats',
        body: {
          en: 'The Income Statement is structured specifically for 3PL operations, dividing performance into clear operational tiers: Freight Gross Margin, COD Handling Margin, and Operating Net Income.',
          ar: 'صُممت قائمة الدخل خصيصاً لشركات الخدمات اللوجستية 3PL عبر تقسيم النتائج إلى مستويات واضحة: مجمل ربح الشحن، عائد إدارة التحصيل COD، وصافي الدخل التشغيلي.'
        },
        bulletPoints: [
          {
            en: 'Freight Revenue (4010) minus Carrier COGS (5010) = Freight Gross Margin (Target: 22–35%).',
            ar: 'إيراد الشحن (4010) ناقص تكلفة الناقل (5010) = مجمل ربح الشحن (المستهدف: 22–35%).'
          },
          {
            en: 'COD Handling Fees (4040) add 100% gross margin income directly to operating profitability.',
            ar: 'عمولات تحصيل COD (حساب 4040) تُمثل إيراداً تشغيلياً خالصاً بدون تكلفة بضاعة مباشرة.'
          },
          {
            en: 'Operating Expenses (6010 Facility, 6020 Supplies, 6030 Tech) deduct from Gross Profit to compute Net Income.',
            ar: 'تُخصم مصروفات التشغيل (إيجار 6010، مواد تغليف 6020، واستضافة 6030) من مجمل الربح للوصول لصافي الربح.'
          }
        ]
      },
      {
        id: 'trial-balance-rules',
        heading: { en: '3. Trial Balance Verification & Normal Balances', ar: '٣. تدقيق ميزان المراجعة وطبيعة الحسابات' },
        icon: 'check_box',
        body: {
          en: 'The Trial Balance lists every account code with its respective debit or credit balance. By definition, sum(BaseDebit) == sum(BaseCredit). The system highlights abnormal balances (e.g., negative cash or credit balance on an asset) for immediate supervisor remediation.',
          ar: 'يسرد ميزان المراجعة كافة حسابات دليل الحسابات مع أرصدتها المدينة والدائنة. بالتعريف المحاسبي، يجب أن يتساوى إجمالي المدين مع إجمالي الدائن. يُبرز النظام أي أرصدة شاذة (مثل رصيد بنكي دائن أو أصل برصيد سالب) لتصحيحها فوراً.'
        },
        bulletPoints: [
          {
            en: 'Asset accounts (1xxx) & Expense accounts (5xxx, 6xxx) have NORMAL DEBIT balances.',
            ar: 'حسابات الأصول (1xxx) والمصروفات والتكلفة (5xxx, 6xxx) طبيعتها مدينة (DEBIT).'
          },
          {
            en: 'Liability accounts (2xxx), Equity accounts (3xxx), & Revenue (4xxx) have NORMAL CREDIT balances.',
            ar: 'حسابات الخصوم (2xxx) والملكية (3xxx) والإيرادات (4xxx) طبيعتها دائنة (CREDIT).'
          }
        ]
      }
    ],
    checklists: [
      {
        id: 'statements-closing-check',
        title: { en: 'Month-End Financial Statement Audit Checklist', ar: 'قائمة تدقيق القوائم المالية عند الإقفال الشهري' },
        items: [
          { en: 'Confirm Balance Sheet Equation is fully balanced (imbalance = 0.000 KWD).', ar: 'التحقق من توازن الميزانية العمومية بالكامل (فارق المعادلة = 0.000 د.ك).' },
          { en: 'Inspect Trial Balance for any accounts with abnormal inverted balances.', ar: 'فحص ميزان المراجعة والتأكد من خلوه من أي حسابات ذات أرصدة شاذة أو معكوسة.' },
          { en: 'Verify that all completed waybills have matching COGS (5010) posted.', ar: 'التأكد من ترحيل تكلفة الشحن (5010) لجميع بوالص الشحن المنفذة والمكتملة.' },
          { en: 'Reconcile bank current account balance (1010) against physical bank statement.', ar: 'مطابقة رصيد حساب البنك الدفتري (1010) مع كشف الحساب البنكي الفعلي.' }
        ]
      }
    ],
    keyTakeaways: [
      {
        en: 'The equation Assets = Liabilities + Equity is an inviolable system invariant enforced on every screen.',
        ar: 'معادلة الأصول = الخصوم + حقوق الملكية قاعدة أساسية غير قابلة للكسر وتُفحص في كل شاشة.'
      },
      {
        en: 'Gross Profit clearly isolates wholesale carrier costs (5010) from operating overhead (6xxx).',
        ar: 'يعزل مجمل الربح تكاليف الشحن بالجملة (5010) بوضوح عن المصروفات الإدارية والتشغيلية (6xxx).'
      },
      {
        en: 'Period closing requires a verified, balanced Trial Balance with zero unallocated suspense entries.',
        ar: 'يتطلب إقفال الفترة المالية ميزان مراجعة معتمداً ومتوازناً وخالياً من أي قيود معلقة.'
      }
    ]
  },
  {
    id: 'financial-reports',
    category: 'reports',
    icon: 'analytics',
    badge: { en: 'Audit & Telemetry', ar: 'التدقيق والرقابة المالية' },
    title: {
      en: 'Financial Reports, Reconciliation & COD Fiduciary Clearing',
      ar: 'التقارير المالية، مطابقة الناقلين، وتصفية أمانات COD'
    },
    summary: {
      en: 'Comprehensive operational guide for shipment unit economics, wholesale carrier statement reconciliation, the 4-stage Driver COD fiduciary chain of custody, client statements, and multi-currency exchange rates.',
      ar: 'دليل تشغيلي متكامل لتحليل ربحية الشحنات، مطابقة كشوف حسابات الشحن بالجملة، إدارة المراحل الأربع لتحصيلات COD وأمانات المتاجر، وكشوف الحسابات المعتمدة، وأسعار الصرف.'
    },
    tourId: 'TOUR_FINANCIAL_REPORTS',
    targetTab: 'reports',
    diagramType: 'COD_FIDUCIARY_LIFECYCLE',
    keyAccounts: [
      {
        code: '1020',
        name: { en: 'Cash in Transit - Drivers Fleet', ar: 'نقدية قيد التحصيل - عهدة المناديب' },
        type: 'ASSET',
        drCrNormal: 'DR',
        description: {
          en: 'Physical currency collected by couriers at customer doorsteps. Debited upon successful delivery POD.',
          ar: 'النقدية المستلمة فعلياً من قبل مندوب التوصيل عند باب العميل. تُقيد مديناً عند إثبات التسليم.'
        }
      },
      {
        code: '1030',
        name: { en: 'Hub Vault Safe (Shuwaikh HQ)', ar: 'خزينة الفرع الرئيسية (مستودع الشويخ)' },
        type: 'ASSET',
        drCrNormal: 'DR',
        description: {
          en: 'Physical safe custody account where couriers deposit daily cash collections after route completion.',
          ar: 'حساب الخزينة الفعلي حيث يورد المناديب مبالغ التحصيلات اليومية بعد انتهاء جولات التوصيل.'
        }
      },
      {
        code: '2100',
        name: { en: 'Merchant COD Escrow Liability', ar: 'أمانات تحصيل المتاجر (COD Escrow)' },
        type: 'LIABILITY',
        drCrNormal: 'CR',
        description: {
          en: 'Fiduciary liability owed to e-commerce merchants for funds collected on their behalf awaiting bank remittance.',
          ar: 'أمانة مالية مستحقة لمتاجر التجارة الإلكترونية للمبالغ المحصلة نيابة عنهم وبانتظار التحويل البنكي.'
        }
      },
      {
        code: '4040',
        name: { en: 'COD Handling Fee Operating Revenue', ar: 'إيراد عمولة إدارة التحصيل النقدي' },
        type: 'REVENUE',
        drCrNormal: 'CR',
        description: {
          en: 'Platform service commission charged to merchants for cash handling, insurance, and doorstep clearing.',
          ar: 'عمولة المنصة المقتطعة من المتاجر مقابل خدمات تحصيل الكاش والتأمين والتسوية البنكية.'
        }
      },
      {
        code: '1100',
        name: { en: 'Accounts Receivable - Clients & Merchants', ar: 'ذمم مدينة - العملاء والمتاجر' },
        type: 'ASSET',
        drCrNormal: 'DR',
        description: {
          en: 'Unpaid freight charges billed to merchants, eligible for automatic offset against merchant COD escrow payouts.',
          ar: 'رسوم الشحن غير المسددة على المتاجر، والتي يمكن مقاصتها آلياً وخصمها من تسوية أمانات COD.'
        }
      }
    ],
    flowSteps: [
      {
        step: 1,
        title: { en: 'Driver Cash Collection', ar: 'تحصيل المندوب للنقدية' },
        description: {
          en: 'Courier collects physical cash upon delivery. System posts: DR 1020 (Cash in Transit) and CR 2100 (Merchant Escrow).',
          ar: 'يستلم المندوب النقدية عند التسليم. يقيد النظام: مدين 1020 (عهدة مندوب) ودائن 2100 (أمانة تاجر).'
        },
        icon: 'local_shipping'
      },
      {
        step: 2,
        title: { en: 'Hub Vault Handover', ar: 'توريد خزينة الفرع' },
        description: {
          en: 'Courier counts and hands over cash to hub cashier. Cashier confirms: DR 1030 (Hub Safe) and CR 1020 (Clearing Driver).',
          ar: 'يورد المندوب الكاش لأمين الخزينة. يؤكد المحاسب الاستلام: مدين 1030 (الخزينة) ودائن 1020 (إخلاء عهدة المندوب).'
        },
        icon: 'security'
      },
      {
        step: 3,
        title: { en: 'Escrow Settlement Audit', ar: 'تدقيق أمانة التاجر' },
        description: {
          en: 'Finance team reviews verified escrow funds in Account 2100 and computes deductions for unpaid shipping fees.',
          ar: 'يدقق الفريق المالي مبالغ الأمانات في حساب 2100 ويحتسب استقطاعات رسوم الشحن المستحقة على المتجر.'
        },
        icon: 'savings'
      },
      {
        step: 4,
        title: { en: 'Net Wire Payout & AR Offset', ar: 'التحويل الصافي والمقاصة' },
        description: {
          en: 'Bank wire transfers net payout (CR 1010) while netting gross escrow (DR 2100), unpaid freight (CR 1100), and COD fee (CR 4040).',
          ar: 'تحويل صافي المستحقات بنكياً (دائن 1010) مع تسوية الأمانة (مدين 2100) وخصم الشحن (دائن 1100) والعمولة (دائن 4040).'
        },
        icon: 'price_check'
      }
    ],
    sections: [
      {
        id: 'cod-fiduciary-lifecycle',
        heading: { en: '1. The 4-Stage COD Fiduciary Chain of Custody', ar: '١. سلسلة الرقابة على عهدة وأمانات الدفع عند الاستلام (COD)' },
        icon: 'lock',
        body: {
          en: 'Handling cash-on-delivery requires stringent fiduciary controls to prevent leakage, unremitted collections, and merchant balance desynchronization. Target Logistics enforces a strict 4-stage custody loop where money is tracked at every transition.',
          ar: 'تتطلب إدارة مبالغ الدفع عند الاستلام رقابة مالية صارمة لمنع تسرب النقدية أو تأخر توريد العهد أو اختلال حسابات المتاجر. تطبق تارجت سلسلة من أربع مراحل تضمن تتبع النقدية في كل انتقال.'
        },
        bulletPoints: [
          {
            en: 'Stage 1 (Doorstep): Driver collects cash -> DR 1020 (Cash in Transit) vs CR 2100 (Merchant Escrow).',
            ar: 'المرحلة ١ (التسليم): تحصيل المندوب -> مدين 1020 (نقدية مع المندوب) ودائن 2100 (أمانات تاجر).'
          },
          {
            en: 'Stage 2 (Hub Handover): Cashier verifies physical bank notes -> DR 1030 (Hub Safe) vs CR 1020 (Driver Cleared).',
            ar: 'المرحلة ٢ (التوريد للمستودع): استلام وعد النقدية في الخزينة -> مدين 1030 (الخزينة) ودائن 1020 (إبراء ذمة المندوب).'
          },
          {
            en: 'Stage 3 (Settlement Calculation): Net Payout = Gross Escrow - Unpaid Freight AR (1100) - COD Fee (4040).',
            ar: 'المرحلة ٣ (احتساب التسوية): صافي الحوالة = إجمالي الأمانة - رسوم الشحن غير المسددة (1100) - عمولة COD (4040).'
          },
          {
            en: 'Stage 4 (Bank Wire): Bank transfer to merchant IBAN -> DR 2100 vs CR 1010 (Bank), CR 1100 (AR), CR 4040 (Fee).',
            ar: 'المرحلة ٤ (التحويل البنكي): التحويل لحساب التجر -> مدين 2100 ودائن 1010 (البنك) ودائن 1100 ودائن 4040.'
          }
        ]
      },
      {
        id: 'carrier-csv-reconciliation',
        heading: { en: '2. Carrier Billing CSV Reconciliation & Tolerance Engine', ar: '٢. مطابقة فواتير الشحن الشهرية وآلية معالجة الفروقات' },
        icon: 'table_view',
        body: {
          en: 'Carrier billing statements from DHL Express, Aramex, and LogesTechs can be uploaded via CSV. The reconciliation engine matches AWB numbers, compares expected vs billed amounts, and automatically identifies discrepancies.',
          ar: 'يمكن استيراد كشوف فواتير شركات الشحن (DHL، أرامكس، لوجستكس) عبر ملفات CSV. يقوم محرك المطابقة بمقارنة أرقام البوالص، وفحص المبالغ المتوقعة مقابل المفوترة، واكتشاف أي فروق سعرية أو أوزان حجمية زائدة.'
        },
        bulletPoints: [
          {
            en: 'Match Statuses: MATCHED (within tolerance), DISCREPANCY (rate/weight mismatch), UNMATCHED (AWB not found in DB).',
            ar: 'حالات المطابقة: مطابق (ضمن هامش السماح)، يوجد فرق (اختلاف سعر أو وزن)، غير مسجل (بوليصة غير موجودة بالنظام).'
          },
          {
            en: 'Post Adjustments: Approved variances debit 5010 (Carrier COGS) and credit 2010 (Carrier AP).',
            ar: 'تسجيل التسوية: الفروقات المعتمدة ترحل محاسبياً كـ مدين 5010 (تكلفة الشحن) ودائن 2010 (مستحقات الناقل).'
          },
          {
            en: 'Client Account Immunity: Carrier reconciliation adjustments strictly affect platform COGS and NEVER mutate merchant invoices.',
            ar: 'حصانة حسابات العملاء: تسويات مطابقة الناقل تؤثر فقط على أرباح المنصة ولا تعدل فواتير العملاء إطلاقاً.'
          }
        ]
      },
      {
        id: 'shipment-profitability-kpis',
        heading: { en: '3. Shipment Unit Economics & Margin Telemetry', ar: '٣. مؤشرات ربحية الشحنات وهامش المساهمة الفردي' },
        icon: 'insights',
        body: {
          en: 'The Profitability report tracks real-time gross margin per consignment: Billed Revenue minus Wholesale Carrier Cost equals Gross Profit. Enables filtering by carrier trade lane, corporate account, and date range.',
          ar: 'يتتبع تقرير الربحية هامش الربح الإجمالي لكل شحنة بالوقت الفعلي: الإيراد المفوتر ناقص تكلفة الناقل بالجملة = مجمل الربح. يتيح التقرير التصفية حسب خط سير الشحن، حساب الشركة، والنطاق الزمني.'
        },
        bulletPoints: [
          {
            en: 'Wholesale Cost Price: Sourced from contract rate card tariffs or Phenix bill_detailCustomField_11.',
            ar: 'سعر التكلفة بالجملة: يُستمد من تعرفة العقد أو الحقل المخصص 11 بفواتير نظام فينيكس.'
          },
          {
            en: 'Markup Engine: Calculates margin percentage ((Revenue - Cost) / Revenue * 100) and flags low-margin routes.',
            ar: 'محرك هوامش الربح: يحسب النسبة المئوية للربح وينبه إلى المسارات ذات العائد المنخفض لاتخاذ إجراء تسعيري.'
          }
        ]
      },
      {
        id: 'fx-engine-parity',
        heading: { en: '4. Multi-Currency Exchange Rates & Kuwaiti Dinar Parity', ar: '٤. محرك أسعار صرف العملات والتعادل بالدينار الكويتي' },
        icon: 'currency_exchange',
        body: {
          en: 'Kuwaiti Dinar (KWD) is the single base reference currency. All international carrier liabilities (USD, EUR, SAR, AED) and cross-border customer billing are dynamically converted using official Central Bank of Kuwait parity rates.',
          ar: 'الدينار الكويتي (د.ك) هو العملة المرجعية الأساسية للمنصة. كافة التزامات الشحن الدولي (دولار، يورو، ريال سعودي، درهم إماراتي) وفواتير العملاء تُحول لحظياً وفق أسعار الصرف الرسمية لبنك الكويت المركزي.'
        }
      }
    ],
    checklists: [
      {
        id: 'reports-audit-checklist',
        title: { en: 'Carrier Reconciliation & COD Settlement Audit', ar: 'قائمة تدقيق مطابقة فواتير الشحن وتسوية COD' },
        items: [
          { en: 'Audit all pending driver remittances in Account 1020 before approving route closeout.', ar: 'تدقيق كافة عهد المناديب المعلقة في حساب 1020 قبل اعتماد إغلاق خط السير اليومي.' },
          { en: 'Confirm hub safe physical cash inventory matches Account 1030 general ledger balance.', ar: 'مطابقة رصيد النقدية الفعلي في خزينة الفرع مع رصيد حساب 1030 في الأستاذ العام.' },
          { en: 'Review carrier CSV discrepancy log to challenge unjustified courier weight penalties.', ar: 'مراجعة فروقات فواتير الناقل للاعتراض على أي غرامات أوزان حجمية غير مبررة.' },
          { en: 'Ensure merchant bank IBAN is active and verified before dispatching wire settlement.', ar: 'التحقق من صحة ورقم الآيبان البنكي للمتجر قبل اعتماد أمر التحويل البنكي.' }
        ]
      }
    ],
    keyTakeaways: [
      {
        en: 'The 4-stage COD loop guarantees physical cash and ledger liabilities move in lockstep.',
        ar: 'تضمن سلسلة مراحل COD الأربع حركة متزامنة وموثقة بين النقدية الفعلية والقيود المحاسبية.'
      },
      {
        en: 'Carrier statement reconciliation never mutates customer merchant billing balances.',
        ar: 'تسويات مطابقة فواتير الناقلين لا تمس أبداً أرصدة أو فواتير عملاء المنصة.'
      },
      {
        en: 'Kuwaiti Dinar (KWD) anchors all multi-currency conversions and gross margin analytics.',
        ar: 'الدينار الكويتي (د.ك) هو المرجع الأساسي لكافة تحويلات العملات وتحليلات هوامش الربح.'
      }
    ]
  }
];

/**
 * Filter guides by category and search query
 */
export const getFilteredGuides = (guides, category = 'all', searchQuery = '', lang = 'en') => {
  if (!Array.isArray(guides)) return [];

  const query = (searchQuery || '').trim().toLowerCase();

  return guides.filter((guide) => {
    // 1. Category filter
    if (category && category !== 'all' && guide.category !== category) {
      return false;
    }

    // 2. Search query filter
    if (!query) return true;

    const titleEn = (guide.title?.en || '').toLowerCase();
    const titleAr = (guide.title?.ar || '').toLowerCase();
    const summaryEn = (guide.summary?.en || '').toLowerCase();
    const summaryAr = (guide.summary?.ar || '').toLowerCase();

    // Check account codes
    const matchesAccount = (guide.keyAccounts || []).some((acc) => {
      const code = (acc.code || '').toLowerCase();
      const nameEn = (acc.name?.en || '').toLowerCase();
      const nameAr = (acc.name?.ar || '').toLowerCase();
      return code.includes(query) || nameEn.includes(query) || nameAr.includes(query);
    });

    // Check section headings
    const matchesSection = (guide.sections || []).some((sec) => {
      const headingEn = (sec.heading?.en || '').toLowerCase();
      const headingAr = (sec.heading?.ar || '').toLowerCase();
      const bodyEn = (sec.body?.en || '').toLowerCase();
      const bodyAr = (sec.body?.ar || '').toLowerCase();
      return headingEn.includes(query) || headingAr.includes(query) || bodyEn.includes(query) || bodyAr.includes(query);
    });

    return (
      titleEn.includes(query) ||
      titleAr.includes(query) ||
      summaryEn.includes(query) ||
      summaryAr.includes(query) ||
      matchesAccount ||
      matchesSection
    );
  });
};

export default FINANCIAL_GUIDES;
