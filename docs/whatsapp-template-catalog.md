# Target Logistics — Official Meta WhatsApp Template Catalog

**Version:** 1.0.0  
**Effective Date:** 2026-10-24  
**Status:** Authoritative Production Catalog  
**Channels:** Meta Cloud API WhatsApp & Chatwoot Single-Channel Inbox (`inbox.mawthook.io`)  

---

## 1. Overview & Guidelines

- **Meta Categories**:
  - All automated milestone and operational notifications use the **UTILITY** category.
  - Authentication codes (2FA / OTP) use the **AUTHENTICATION** category.
- **Bilingual Coverage**:
  - All 17 templates are fully bilingual: English (`en_US`) and Kuwait Arabic (`ar`).
- **Variable Placeholders**:
  - Parameter placeholders in message bodies use sequential indexes starting at `{{1}}` without gaps.
  - Dynamic URL buttons that take a single variable use `{{1}}` representing the URL suffix or security token.
- **Buttons**:
  - Interactive call-to-action (CTA) buttons include Dynamic URL buttons, Static URL buttons, Quick Reply buttons, and Copy Code buttons (for OTP).

---

## 2. Template Specifications

### 1. `target_shipment_created`
- **Category:** `UTILITY`
- **Events:** `shipment_created`, `new_shipment_created`
- **Recipients:** Shipper (`sender`), Consignee (`receiver`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Your shipment with Target Logistics has been created.

  📦 Tracking: {{2}}
  📄 Reference: {{3}}
  🚚 Route: {{4}}
  📅 Estimated Delivery: {{5}}

  Track your shipment live using the button below.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  تم إنشاء شحنتك بنجاح مع تارجت للخدمات اللوجستية.

  📦 رقم التتبع: {{2}}
  📄 رقم الفاتورة/المرجع: {{3}}
  🚚 خط السير: {{4}}
  📅 موعد التوصيل المتوقع: {{5}}

  يمكنك تتبع شحنتك مباشرة عبر الزر أدناه.
  ```
- **Variables:**
  1. `{{1}}`: Recipient Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Invoice / Bill Reference
  4. `{{4}}`: Route (e.g. `Kuwait City, KW → Dubai, AE`)
  5. `{{5}}`: Estimated Delivery Date
- **Button:** URL -> `https://target-kw.com/track/{{1}}` ("Track Shipment" / "تتبع الشحنة")

---

### 2. `target_pickup_scheduled`
- **Category:** `UTILITY`
- **Events:** `pickup_scheduled`
- **Recipients:** Shipper (`sender`)
- **Header:** Text `{{1}}` (Pickup Reference)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Our courier has been scheduled for parcel pickup.

  📋 Pickup Ref: {{2}}
  ⏰ Time Window: {{3}}
  👤 Courier: {{4}}
  📍 Location: {{5}}

  Please have your parcels ready with printed labels.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  تمت جدولة مندوب تارجت لاستلام الشحنة.

  📋 رقم الاستلام: {{2}}
  ⏰ الموعد المتوقع: {{3}}
  👤 اسم المندوب: {{4}}
  📍 الموقع: {{5}}

  يرجى تجهيز الطرود مع ملصقات الشحن.
  ```
- **Variables:**
  1. `{{1}}`: Shipper Name
  2. `{{2}}`: Pickup Reference
  3. `{{3}}`: Pickup Window
  4. `{{4}}`: Driver Name
  5. `{{5}}`: Address
- **Button:** Quick Reply ("Ready for Pickup" / "جاهز للاستلام")

---

### 3. `target_received_at_hub`
- **Category:** `UTILITY`
- **Events:** `received_at_hub`
- **Recipients:** Shipper (`sender`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Your shipment {{2}} has been safely received at our central hub:

  🏢 Facility: {{3}}
  🕒 Ingested At: {{4}}

  It is now undergoing sorting, weighing, and export clearance.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  تم استلام شحنتك رقم {{2}} في مركز الفرز اللوجستي الرئيسي:

  🏢 المركز: {{3}}
  🕒 وقت الاستلام: {{4}}

  يجري الآن فرز الشحنة وإعدادها للشحن.
  ```
- **Variables:**
  1. `{{1}}`: Recipient Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Hub Facility Name
  4. `{{4}}`: Ingestion Timestamp
- **Button:** URL -> `https://target-kw.com/track/{{1}}` ("View Status" / "عرض الحالة")

---

### 4. `target_verified_dispatched`
- **Category:** `UTILITY`
- **Events:** `verified_and_dispatched`
- **Recipients:** Shipper (`sender`), Consignee (`receiver`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Your shipment {{2}} has been verified and dispatched to {{3}}.

  ✈️ Carrier AWB: {{4}}
  📍 Destination: {{5}}
  📅 Estimated Delivery: {{6}}
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  تم فحص وتأكيد شحنتك رقم {{2}} وتم تحويلها إلى ناقل الشحن {{3}}.

  ✈️ بوليصة الشحن: {{4}}
  📍 الوجهة: {{5}}
  📅 موعد التوصيل المتوقع: {{6}}
  ```
- **Variables:**
  1. `{{1}}`: Recipient Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Carrier Name
  4. `{{4}}`: Carrier AWB
  5. `{{5}}`: Destination City
  6. `{{6}}`: ETA
- **Button:** URL -> `https://target-kw.com/track/{{1}}` ("Track Live" / "تتبع الشحنة")

---

### 5. `target_shipment_out_for_delivery`
- **Category:** `UTILITY`
- **Events:** `out_for_delivery`
- **Recipients:** Consignee (`receiver`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Your Target Logistics shipment {{2}} is out for delivery today!

  📍 Destination: {{3}}
  🚗 Courier: {{4}}
  ⏰ Estimated Window: {{5}}

  To ensure swift arrival, please confirm your delivery map pin using the button below.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  شحنتك رقم {{2}} مع تارجت للخدمات اللوجستية قيد التوصيل اليوم!

  📍 العنوان: {{3}}
  🚗 المندوب: {{4}}
  ⏰ موعد التوصيل المتوقع: {{5}}

  لضمان سرعة الوصول، يرجى تأكيد موقعك الجغرافي على الخريطة عبر الزر أدناه.
  ```
- **Variables:**
  1. `{{1}}`: Consignee Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: City & Area
  4. `{{4}}`: Courier / Driver Name
  5. `{{5}}`: Delivery Window
- **Button:** Dynamic URL -> `https://target-kw.com/location/{{1}}` ("Confirm Delivery Pin" / "تأكيد موقع التوصيل") where variable `{{1}}` is `locationToken`.

---

### 6. `target_delivery_attempt`
- **Category:** `UTILITY`
- **Events:** `delivery_attempt`
- **Recipients:** Consignee (`receiver`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  We attempted to deliver your shipment {{2}} on {{3}}, but were unable to complete delivery.

  ⚠️ Reason: {{4}}

  Please confirm your location or reschedule your delivery below.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  حاول مندوبنا تسليم شحنتك رقم {{2}} في {{3}}، ولكن تعذر إتمام التوصيل.

  ⚠️ السبب: {{4}}

  يرجى تأكيد موقعك أو إعادة جدولة موعد التوصيل عبر الزر أدناه.
  ```
- **Variables:**
  1. `{{1}}`: Consignee Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Attempt Timestamp
  4. `{{4}}`: Failure Reason
- **Button:** Dynamic URL -> `https://target-kw.com/location/{{1}}` ("Reschedule / Pin" / "إعادة الجدولة وتأكيد الموقع") where variable `{{1}}` is `locationToken`.

---

### 7. `target_shipment_delivered`
- **Category:** `UTILITY`
- **Events:** `delivered`
- **Recipients:** Shipper (`sender`), Consignee (`receiver`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Your Target Logistics shipment {{2}} has been successfully delivered!

  🕒 Delivered: {{3}}
  ✍️ Received By: {{4}}
  📍 Location: {{5}}

  Thank you for choosing Target Logistics. You can review your proof of delivery below.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  تم تسليم شحنتك رقم {{2}} بنجاح!

  🕒 وقت التوصيل: {{3}}
  ✍️ المستلم: {{4}}
  📍 الموقع: {{5}}

  شكراً لاختيارك تارجت للخدمات اللوجستية. يمكنك استعراض إثبات التوصيل عبر الرابط أدناه.
  ```
- **Variables:**
  1. `{{1}}`: Recipient Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Delivery Timestamp AST
  4. `{{4}}`: Signee Name
  5. `{{5}}`: Delivery Address / City
- **Button:** URL -> `https://target-kw.com/track/{{1}}` ("View Proof of Delivery" / "عرض إثبات التوصيل")

---

### 8. `target_customs_exception_hold`
- **Category:** `UTILITY`
- **Events:** `on_hold_customs_issue`
- **Recipients:** Shipper (`sender`), Consignee (`receiver`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Important Notice regarding shipment {{1}}:

  Dear {{2}},
  Your parcel is temporarily on hold at customs inspection.

  ⚠️ Reason: {{3}}
  📋 Action Required: {{4}}

  Please visit our resolution portal or reply to this message for immediate assistance.
  ```
- **Arabic Body (`ar`):**
  ```text
  تنبيه هام بشأن الشحنة رقم {{1}}:

  عزيزي {{2}}،
  شحنتك معلقة مؤقتاً لدى الجمارك للتفتيش.

  ⚠️ السبب: {{3}}
  📋 الإجراء المطلوب: {{4}}

  يرجى الضغط على الرابط أدناه لرفع المطلوب أو الرد على هذه المحادثة لمساعدتك.
  ```
- **Variables:**
  1. `{{1}}`: Tracking Number
  2. `{{2}}`: Consignee Name
  3. `{{3}}`: Hold Reason
  4. `{{4}}`: Required Action
- **Button:** URL -> `https://target-kw.com/track/{{1}}` ("Resolve Customs" / "حل إجراءات الجمارك")

---

### 9. `target_documents_needed`
- **Category:** `UTILITY`
- **Events:** `documents_needed`
- **Recipients:** Shipper (`sender`), Consignee (`receiver`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Additional documents are required to clear shipment {{2}}.

  📄 Documents Needed: {{3}}
  ⏰ Deadline: {{4}}

  Please upload the required documents through our secure portal to prevent return.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  مطلوب مستندات إضافية لفسح الشحنة رقم {{2}}.

  📄 المستندات المطلوبة: {{3}}
  ⏰ الموعد النهائي: {{4}}

  يرجى رفع المستندات المطلوبة عبر بوابتنا الإلكترونية لتجنب إعادة الشحنة.
  ```
- **Variables:**
  1. `{{1}}`: Recipient Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Documents List
  4. `{{4}}`: Deadline Note
- **Button:** URL -> `https://target-kw.com/track/{{1}}` ("Upload Documents" / "رفع المستندات")

---

### 10. `target_payment_confirmed`
- **Category:** `UTILITY`
- **Events:** `payment_confirmed`
- **Recipients:** Shipper (`sender`), Consignee (`receiver`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Payment has been confirmed for shipment {{2}}.

  💰 Amount Settled: {{3}}
  💳 Reference: {{4}}

  Your receipt is available at the link below.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  تم استلام وتأكيد سداد شحنتك رقم {{2}}.

  💰 المبلغ المسدد: {{3}}
  💳 رقم العملية: {{4}}

  يمكنك تحميل إيصال السداد عبر الرابط أدناه.
  ```
- **Variables:**
  1. `{{1}}`: Recipient Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Amount Settled KWD
  4. `{{4}}`: Reference
- **Button:** URL -> `https://target-kw.com/pay/receipt/{{1}}` ("View Receipt" / "عرض الإيصال")

---

### 11. `target_rto_in_transit`
- **Category:** `UTILITY`
- **Events:** `rto_in_transit`
- **Recipients:** Shipper (`sender`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Shipment {{2}} is being returned to origin.

  ⚠️ Return Reason: {{3}}
  📅 Expected Arrival: {{4}}

  Our team will notify you upon arrival at the central facility.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  الشحنة رقم {{2}} قيد الإرجاع إلى المصدر.

  ⚠️ سبب الإرجاع: {{3}}
  📅 تاريخ الوصول المتوقع: {{4}}

  سيتم إشعارك فور وصول الطرد إلى المركز الرئيسي.
  ```
- **Variables:**
  1. `{{1}}`: Shipper Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Return Reason
  4. `{{4}}`: Expected Arrival Date
- **Button:** URL -> `https://target-kw.com/track/{{1}}` ("Track Return" / "تتبع الإرجاع")

---

### 12. `target_shipment_returned`
- **Category:** `UTILITY`
- **Events:** `returned`
- **Recipients:** Shipper (`sender`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Returned shipment {{2}} has arrived at the origin facility.

  🕒 Handover Timestamp: {{3}}
  📦 Handed to: {{4}}

  Please review return closure and final reconciliation.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  تم تسليم الشحنة المرتجعة رقم {{2}} إلى مستودع المصدر.

  🕒 وقت التسليم: {{3}}
  📦 تم التسليم إلى: {{4}}

  يرجى مراجعة تفاصيل الإرجاع والتسوية النهائية.
  ```
- **Variables:**
  1. `{{1}}`: Shipper Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Handover Timestamp
  4. `{{4}}`: Handed to Reference
- **Button:** URL -> `https://target-kw.com/track/{{1}}` ("View Details" / "تفاصيل الإرجاع")

---

### 13. `payment_request_v1`
- **Category:** `UTILITY`
- **Events:** `payment_link_ready`, `manual_payment_request`
- **Recipients:** Consignee (`receiver`), Shipper (`sender`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Payment request for shipment {{2}}.

  💰 Amount Due: {{3}}
  📅 Issue Date: {{4}}

  Please complete secure payment via K-Net / Credit Card using the button below.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  طلب سداد مستحقات الشحنة رقم {{2}}.

  💰 المبلغ المستحق: {{3}}
  📅 تاريخ الطلب: {{4}}

  يرجى إتمام عملية الدفع الإلكتروني الآمن (كي نت / بطاقة ائتمان) عبر الزر أدناه.
  ```
- **Variables:**
  1. `{{1}}`: Recipient Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Amount Due KWD
  4. `{{4}}`: Issue Date
- **Button:** Dynamic URL -> `{{1}}` ("Pay Now" / "ادفع الآن") where variable `{{1}}` is Checkout URL.

---

### 14. `location_request_v1`
- **Category:** `UTILITY`
- **Events:** `location_request`, `manual_location_request`
- **Recipients:** Consignee (`receiver`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Target Logistics courier needs your exact delivery coordinates for shipment {{2}} ({{3}}).

  Please tap the button below to confirm your building, street, and GPS pin on Google Maps.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  مندوب تارجت للخدمات اللوجستية بحاجة لتأكيد موقع توصيل الشحنة رقم {{2}} ({{3}}).

  يرجى الضغط على الزر أدناه لتحديد المبنى والشارع وموقعك على خرائط جوجل.
  ```
- **Variables:**
  1. `{{1}}`: Consignee Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Delivery Window / Note
- **Button:** Dynamic URL -> `{{1}}` ("Pin Location" / "حدد موقعك على الخريطة") where variable `{{1}}` is Location URL.

---

### 15. `customer_inquiry_start`
- **Category:** `UTILITY`
- **Events:** `customer_engagement`, `reopen_session`, `customer_inquiry`
- **Recipients:** Consignee (`receiver`), Shipper (`sender`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  This is Target Logistics Customer Care ({{3}}) regarding your shipment {{2}}.

  How can we assist you today? Please tap a response below or reply to this message.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  معك خدمة عملاء تارجت للخدمات اللوجستية ({{3}}) بخصوص شحنتك رقم {{2}}.

  كيف يمكننا مساعدتك اليوم؟ يرجى اختيار أحد الردود أدناه أو كتابة استفسارك مباشرة.
  ```
- **Variables:**
  1. `{{1}}`: Customer Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Support Agent / Team
- **Buttons:**
  1. Quick Reply ("Shipment Inquiry" / "استفسار عن الشحنة")
  2. Quick Reply ("Speak to Agent" / "التحدث مع موظف")

---

### 16. `return_portal_v1`
- **Category:** `UTILITY`
- **Events:** `return_portal`, `return_portal_request`
- **Recipients:** Consignee (`receiver`), Shipper (`sender`)
- **Header:** Text `{{1}}` (Tracking Number)
- **English Body (`en_US`):**
  ```text
  Hello {{1}},

  Your return request has been initiated for shipment {{2}} (valid until {{3}}).

  Please access our return portal below to generate your return label and schedule handover.
  ```
- **Arabic Body (`ar`):**
  ```text
  مرحباً {{1}}،

  تم فتح طلب إرجاع للشحنة رقم {{2}} (صالح حتى {{3}}).

  يرجى الدخول لبوابة الإرجاع عبر الزر أدناه لإصدار بوليصة الإرجاع وجدولة التسليم.
  ```
- **Variables:**
  1. `{{1}}`: Customer Name
  2. `{{2}}`: Tracking Number
  3. `{{3}}`: Return Window / Validity
- **Button:** URL -> `https://target-kw.com/returns/{{1}}` ("Return Portal" / "بوابة الإرجاع")

---

### 17. `otptargetlogin`
- **Category:** `AUTHENTICATION`
- **Events:** `auth_otp_login`
- **Recipients:** User / Staff / Customer (`individual`)
- **Header:** None
- **English Body (`en_US`):**
  ```text
  {{1}} is your Target Logistics verification code. For security, do not share this code.
  ```
- **Arabic Body (`ar`):**
  ```text
  {{1}} هو رمز التحقق الخاص بك لمنصة تارجت للخدمات اللوجستية. لدواعي الأمان لا تشارك هذا الرمز مع أحد.
  ```
- **Variables:**
  1. `{{1}}`: 6-digit numeric OTP
- **Button:** Copy Code Button ("Copy Code" / "نسخ الرمز")

---

## 3. Programmatic Specification (Machine-Readable JSON)

```json
{
  "version": "1.0.0",
  "generated_at": "2026-10-24T18:00:00Z",
  "templates": [
    {
      "name": "target_shipment_created",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["shipment_created", "new_shipment_created"],
      "recipient_roles": ["sender", "receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nYour shipment with Target Logistics has been created.\n\n📦 Tracking: {{2}}\n📄 Reference: {{3}}\n🚚 Route: {{4}}\n📅 Estimated Delivery: {{5}}\n\nTrack your shipment live using the button below.",
        "button": { "type": "URL", "text": "Track Shipment", "url": "https://target-kw.com/track/{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nتم إنشاء شحنتك بنجاح مع تارجت للخدمات اللوجستية.\n\n📦 رقم التتبع: {{2}}\n📄 رقم الفاتورة/المرجع: {{3}}\n🚚 خط السير: {{4}}\n📅 موعد التوصيل المتوقع: {{5}}\n\nيمكنك تتبع شحنتك مباشرة عبر الزر أدناه.",
        "button": { "type": "URL", "text": "تتبع الشحنة", "url": "https://target-kw.com/track/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "recipientName", "description": "Customer/Recipient Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "invoiceNumber", "description": "Invoice or Bill Reference" },
        { "index": 4, "field": "route", "description": "Route origin to destination" },
        { "index": 5, "field": "estimatedDeliveryDate", "description": "Estimated Delivery Date" }
      ]
    },
    {
      "name": "target_pickup_scheduled",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["pickup_scheduled"],
      "recipient_roles": ["sender"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nOur courier has been scheduled for parcel pickup.\n\n📋 Pickup Ref: {{2}}\n⏰ Time Window: {{3}}\n👤 Courier: {{4}}\n📍 Location: {{5}}\n\nPlease have your parcels ready with printed labels.",
        "button": { "type": "QUICK_REPLY", "text": "Ready for Pickup" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nتمت جدولة مندوب تارجت لاستلام الشحنة.\n\n📋 رقم الاستلام: {{2}}\n⏰ الموعد المتوقع: {{3}}\n👤 اسم المندوب: {{4}}\n📍 الموقع: {{5}}\n\nيرجى تجهيز الطرود مع ملصقات الشحن.",
        "button": { "type": "QUICK_REPLY", "text": "جاهز للاستلام" }
      },
      "variables": [
        { "index": 1, "field": "shipperName", "description": "Shipper Name" },
        { "index": 2, "field": "pickupReference", "description": "Pickup Reference Number" },
        { "index": 3, "field": "pickupWindow", "description": "Pickup Time Window" },
        { "index": 4, "field": "driverName", "description": "Driver / Courier Name" },
        { "index": 5, "field": "location", "description": "Pickup Address Location" }
      ]
    },
    {
      "name": "target_received_at_hub",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["received_at_hub"],
      "recipient_roles": ["sender"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nYour shipment {{2}} has been safely received at our central hub:\n\n🏢 Facility: {{3}}\n🕒 Ingested At: {{4}}\n\nIt is now undergoing sorting, weighing, and export clearance.",
        "button": { "type": "URL", "text": "View Status", "url": "https://target-kw.com/track/{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nتم استلام شحنتك رقم {{2}} في مركز الفرز اللوجستي الرئيسي:\n\n🏢 المركز: {{3}}\n🕒 وقت الاستلام: {{4}}\n\nيجري الآن فرز الشحنة وإعدادها للشحن.",
        "button": { "type": "URL", "text": "عرض الحالة", "url": "https://target-kw.com/track/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "recipientName", "description": "Recipient Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "facilityName", "description": "Hub Facility Name" },
        { "index": 4, "field": "ingestedAt", "description": "Ingestion Timestamp" }
      ]
    },
    {
      "name": "target_verified_dispatched",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["verified_and_dispatched"],
      "recipient_roles": ["sender", "receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nYour shipment {{2}} has been verified and dispatched to {{3}}.\n\n✈️ Carrier AWB: {{4}}\n📍 Destination: {{5}}\n📅 Estimated Delivery: {{6}}",
        "button": { "type": "URL", "text": "Track Live", "url": "https://target-kw.com/track/{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nتم فحص وتأكيد شحنتك رقم {{2}} وتم تحويلها إلى ناقل الشحن {{3}}.\n\n✈️ بوليصة الشحن: {{4}}\n📍 الوجهة: {{5}}\n📅 موعد التوصيل المتوقع: {{6}}",
        "button": { "type": "URL", "text": "تتبع الشحنة", "url": "https://target-kw.com/track/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "recipientName", "description": "Recipient Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "carrierName", "description": "Carrier Name" },
        { "index": 4, "field": "carrierAwb", "description": "Carrier AWB Number" },
        { "index": 5, "field": "destinationCity", "description": "Destination City" },
        { "index": 6, "field": "estimatedDeliveryDate", "description": "Estimated Delivery Date" }
      ]
    },
    {
      "name": "target_shipment_out_for_delivery",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["out_for_delivery"],
      "recipient_roles": ["receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nYour Target Logistics shipment {{2}} is out for delivery today!\n\n📍 Destination: {{3}}\n🚗 Courier: {{4}}\n⏰ Estimated Window: {{5}}\n\nTo ensure swift arrival, please confirm your delivery map pin using the button below.",
        "button": { "type": "URL", "text": "Confirm Delivery Pin", "url": "https://target-kw.com/location/{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nشحنتك رقم {{2}} مع تارجت للخدمات اللوجستية قيد التوصيل اليوم!\n\n📍 العنوان: {{3}}\n🚗 المندوب: {{4}}\n⏰ موعد التوصيل المتوقع: {{5}}\n\nلضمان سرعة الوصول، يرجى تأكيد موقعك الجغرافي على الخريطة عبر الزر أدناه.",
        "button": { "type": "URL", "text": "تأكيد موقع التوصيل", "url": "https://target-kw.com/location/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "recipientName", "description": "Consignee Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "destinationArea", "description": "City and Area" },
        { "index": 4, "field": "courierName", "description": "Courier / Driver Name" },
        { "index": 5, "field": "deliveryWindow", "description": "Delivery Window" }
      ]
    },
    {
      "name": "target_delivery_attempt",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["delivery_attempt"],
      "recipient_roles": ["receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nWe attempted to deliver your shipment {{2}} on {{3}}, but were unable to complete delivery.\n\n⚠️ Reason: {{4}}\n\nPlease confirm your location or reschedule your delivery below.",
        "button": { "type": "URL", "text": "Reschedule / Pin", "url": "https://target-kw.com/location/{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nحاول مندوبنا تسليم شحنتك رقم {{2}} في {{3}}، ولكن تعذر إتمام التوصيل.\n\n⚠️ السبب: {{4}}\n\nيرجى تأكيد موقعك أو إعادة جدولة موعد التوصيل عبر الزر أدناه.",
        "button": { "type": "URL", "text": "إعادة الجدولة وتأكيد الموقع", "url": "https://target-kw.com/location/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "recipientName", "description": "Consignee Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "attemptTimestamp", "description": "Attempt Timestamp" },
        { "index": 4, "field": "failureReason", "description": "Delivery Failure Reason" }
      ]
    },
    {
      "name": "target_shipment_delivered",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["delivered"],
      "recipient_roles": ["sender", "receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nYour Target Logistics shipment {{2}} has been successfully delivered!\n\n🕒 Delivered: {{3}}\n✍️ Received By: {{4}}\n📍 Location: {{5}}\n\nThank you for choosing Target Logistics. You can review your proof of delivery below.",
        "button": { "type": "URL", "text": "View Proof of Delivery", "url": "https://target-kw.com/track/{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nتم تسليم شحنتك رقم {{2}} بنجاح!\n\n🕒 وقت التوصيل: {{3}}\n✍️ المستلم: {{4}}\n📍 الموقع: {{5}}\n\nشكراً لاختيارك تارجت للخدمات اللوجستية. يمكنك استعراض إثبات التوصيل عبر الرابط أدناه.",
        "button": { "type": "URL", "text": "عرض إثبات التوصيل", "url": "https://target-kw.com/track/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "recipientName", "description": "Recipient Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "deliveredTimestamp", "description": "Delivery Timestamp AST" },
        { "index": 4, "field": "signeeName", "description": "Signee Name" },
        { "index": 5, "field": "deliveryLocation", "description": "Delivery Location" }
      ]
    },
    {
      "name": "target_customs_exception_hold",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["on_hold_customs_issue"],
      "recipient_roles": ["sender", "receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Important Notice regarding shipment {{1}}:\n\nDear {{2}},\nYour parcel is temporarily on hold at customs inspection.\n\n⚠️ Reason: {{3}}\n📋 Action Required: {{4}}\n\nPlease visit our resolution portal or reply to this message for immediate assistance.",
        "button": { "type": "URL", "text": "Resolve Customs", "url": "https://target-kw.com/track/{{1}}" }
      },
      "ar": {
        "body": "تنبيه هام بشأن الشحنة رقم {{1}}:\n\nعزيزي {{2}}،\nشحنتك معلقة مؤقتاً لدى الجمارك للتفتيش.\n\n⚠️ السبب: {{3}}\n📋 الإجراء المطلوب: {{4}}\n\nيرجى الضغط على الرابط أدناه لرفع المطلوب أو الرد على هذه المحادثة لمساعدتك.",
        "button": { "type": "URL", "text": "حل إجراءات الجمارك", "url": "https://target-kw.com/track/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 2, "field": "recipientName", "description": "Consignee Name" },
        { "index": 3, "field": "holdReason", "description": "Customs Hold Reason" },
        { "index": 4, "field": "actionRequired", "description": "Action Required" }
      ]
    },
    {
      "name": "target_documents_needed",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["documents_needed"],
      "recipient_roles": ["sender", "receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nAdditional documents are required to clear shipment {{2}}.\n\n📄 Documents Needed: {{3}}\n⏰ Deadline: {{4}}\n\nPlease upload the required documents through our secure portal to prevent return.",
        "button": { "type": "URL", "text": "Upload Documents", "url": "https://target-kw.com/track/{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nمطلوب مستندات إضافية لفسح الشحنة رقم {{2}}.\n\n📄 المستندات المطلوبة: {{3}}\n⏰ الموعد النهائي: {{4}}\n\nيرجى رفع المستندات المطلوبة عبر بوابتنا الإلكترونية لتجنب إعادة الشحنة.",
        "button": { "type": "URL", "text": "رفع المستندات", "url": "https://target-kw.com/track/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "recipientName", "description": "Recipient Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "documentsList", "description": "Documents Needed" },
        { "index": 4, "field": "deadline", "description": "Deadline Date / Note" }
      ]
    },
    {
      "name": "target_payment_confirmed",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["payment_confirmed"],
      "recipient_roles": ["sender", "receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nPayment has been confirmed for shipment {{2}}.\n\n💰 Amount Settled: {{3}}\n💳 Reference: {{4}}\n\nYour receipt is available at the link below.",
        "button": { "type": "URL", "text": "View Receipt", "url": "https://target-kw.com/pay/receipt/{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nتم استلام وتأكيد سداد شحنتك رقم {{2}}.\n\n💰 المبلغ المسدد: {{3}}\n💳 رقم العملية: {{4}}\n\nيمكنك تحميل إيصال السداد عبر الرابط أدناه.",
        "button": { "type": "URL", "text": "عرض الإيصال", "url": "https://target-kw.com/pay/receipt/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "recipientName", "description": "Recipient Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "amountSettled", "description": "Amount Settled KWD" },
        { "index": 4, "field": "reference", "description": "Payment Reference" }
      ]
    },
    {
      "name": "target_rto_in_transit",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["rto_in_transit"],
      "recipient_roles": ["sender"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nShipment {{2}} is being returned to origin.\n\n⚠️ Return Reason: {{3}}\n📅 Expected Arrival: {{4}}\n\nOur team will notify you upon arrival at the central facility.",
        "button": { "type": "URL", "text": "Track Return", "url": "https://target-kw.com/track/{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nالشحنة رقم {{2}} قيد الإرجاع إلى المصدر.\n\n⚠️ سبب الإرجاع: {{3}}\n📅 تاريخ الوصول المتوقع: {{4}}\n\nسيتم إشعارك فور وصول الطرد إلى المركز الرئيسي.",
        "button": { "type": "URL", "text": "تتبع الإرجاع", "url": "https://target-kw.com/track/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "shipperName", "description": "Shipper Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "returnReason", "description": "Return Reason" },
        { "index": 4, "field": "expectedArrival", "description": "Expected Arrival Date" }
      ]
    },
    {
      "name": "target_shipment_returned",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["returned"],
      "recipient_roles": ["sender"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nReturned shipment {{2}} has arrived at the origin facility.\n\n🕒 Handover Timestamp: {{3}}\n📦 Handed to: {{4}}\n\nPlease review return closure and final reconciliation.",
        "button": { "type": "URL", "text": "View Details", "url": "https://target-kw.com/track/{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nتم تسليم الشحنة المرتجعة رقم {{2}} إلى مستودع المصدر.\n\n🕒 وقت التسليم: {{3}}\n📦 تم التسليم إلى: {{4}}\n\nيرجى مراجعة تفاصيل الإرجاع والتسوية النهائية.",
        "button": { "type": "URL", "text": "تفاصيل الإرجاع", "url": "https://target-kw.com/track/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "shipperName", "description": "Shipper Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "handoverTimestamp", "description": "Handover Timestamp" },
        { "index": 4, "field": "handedTo", "description": "Handed to Reference" }
      ]
    },
    {
      "name": "payment_request_v1",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["payment_link_ready", "manual_payment_request"],
      "recipient_roles": ["sender", "receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nPayment request for shipment {{2}}.\n\n💰 Amount Due: {{3}}\n📅 Issue Date: {{4}}\n\nPlease complete secure payment via K-Net / Credit Card using the button below.",
        "button": { "type": "URL", "text": "Pay Now", "url": "{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nطلب سداد مستحقات الشحنة رقم {{2}}.\n\n💰 المبلغ المستحق: {{3}}\n📅 تاريخ الطلب: {{4}}\n\nيرجى إتمام عملية الدفع الإلكتروني الآمن (كي نت / بطاقة ائتمان) عبر الزر أدناه.",
        "button": { "type": "URL", "text": "ادفع الآن", "url": "{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "recipientName", "description": "Recipient Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "amountDue", "description": "Amount Due KWD" },
        { "index": 4, "field": "issueDate", "description": "Issue Date" }
      ]
    },
    {
      "name": "location_request_v1",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["location_request", "manual_location_request"],
      "recipient_roles": ["receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nTarget Logistics courier needs your exact delivery coordinates for shipment {{2}} ({{3}}).\n\nPlease tap the button below to confirm your building, street, and GPS pin on Google Maps.",
        "button": { "type": "URL", "text": "Pin Location", "url": "{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nمندوب تارجت للخدمات اللوجستية بحاجة لتأكيد موقع توصيل الشحنة رقم {{2}} ({{3}}).\n\nيرجى الضغط على الزر أدناه لتحديد المبنى والشارع وموقعك على خرائط جوجل.",
        "button": { "type": "URL", "text": "حدد موقعك على الخريطة", "url": "{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "recipientName", "description": "Consignee Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "deliveryNote", "description": "Delivery Window / Note" }
      ]
    },
    {
      "name": "customer_inquiry_start",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["customer_engagement", "reopen_session", "customer_inquiry"],
      "recipient_roles": ["sender", "receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nThis is Target Logistics Customer Care ({{3}}) regarding your shipment {{2}}.\n\nHow can we assist you today? Please tap a response below or reply to this message.",
        "button": { "type": "QUICK_REPLY", "text": "Shipment Inquiry" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nمعك خدمة عملاء تارجت للخدمات اللوجستية ({{3}}) بخصوص شحنتك رقم {{2}}.\n\nكيف يمكننا مساعدتك اليوم؟ يرجى اختيار أحد الردود أدناه أو كتابة استفسارك مباشرة.",
        "button": { "type": "QUICK_REPLY", "text": "استفسار عن الشحنة" }
      },
      "variables": [
        { "index": 1, "field": "customerName", "description": "Customer Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "supportTeam", "description": "Support Team / Agent" }
      ]
    },
    {
      "name": "return_portal_v1",
      "category": "UTILITY",
      "languages": ["en_US", "ar"],
      "events": ["return_portal", "return_portal_request"],
      "recipient_roles": ["sender", "receiver"],
      "header": { "type": "TEXT", "parameter": "{{1}}" },
      "en_US": {
        "body": "Hello {{1}},\n\nYour return request has been initiated for shipment {{2}} (valid until {{3}}).\n\nPlease access our return portal below to generate your return label and schedule handover.",
        "button": { "type": "URL", "text": "Return Portal", "url": "https://target-kw.com/returns/{{1}}" }
      },
      "ar": {
        "body": "مرحباً {{1}}،\n\nتم فتح طلب إرجاع للشحنة رقم {{2}} (صالح حتى {{3}}).\n\nيرجى الدخول لبوابة الإرجاع عبر الزر أدناه لإصدار بوليصة الإرجاع وجدولة التسليم.",
        "button": { "type": "URL", "text": "بوابة الإرجاع", "url": "https://target-kw.com/returns/{{1}}" }
      },
      "variables": [
        { "index": 1, "field": "customerName", "description": "Customer Name" },
        { "index": 2, "field": "trackingNumber", "description": "Tracking Number" },
        { "index": 3, "field": "validityWindow", "description": "Return Window / Validity" }
      ]
    },
    {
      "name": "otptargetlogin",
      "category": "AUTHENTICATION",
      "languages": ["en_US", "ar"],
      "events": ["auth_otp_login"],
      "recipient_roles": ["individual"],
      "header": null,
      "en_US": {
        "body": "{{1}} is your Target Logistics verification code. For security, do not share this code.",
        "button": { "type": "COPY_CODE", "text": "Copy Code" }
      },
      "ar": {
        "body": "{{1}} هو رمز التحقق الخاص بك لمنصة تارجت للخدمات اللوجستية. لدواعي الأمان لا تشارك هذا الرمز مع أحد.",
        "button": { "type": "COPY_CODE", "text": "نسخ الرمز" }
      },
      "variables": [
        { "index": 1, "field": "otpCode", "description": "6-digit OTP verification code" }
      ]
    }
  ]
}
```
