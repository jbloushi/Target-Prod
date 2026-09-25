import React from 'react';
import PageHeader from '../components/common/PageHeader';

export const PrivacyPage = () => {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 font-sans">
      <PageHeader
        title="Privacy Policy & Data Protection"
        subtitle="Last Updated: February 2026 • State of Kuwait Regulatory Compliance"
      />

      <div className="card bg-base-100 border border-base-200 shadow-sm p-6 sm:p-10 space-y-6 text-sm text-base-content/75 leading-relaxed">
        <p>
          Target Logistics Global Express W.L.L. ("Target Logistics", "we", "us", or "our") operates the Target Logistics Global platform and mobile dispatch applications. This Privacy Policy informs corporate consignors, clients, and recipients of our policies regarding the collection, transmission, and protection of personal data and consignment telemetry.
        </p>

        <div className="space-y-2">
          <h2 className="text-base font-black text-base-content uppercase tracking-wider">
            1. Information Collection & Telemetry
          </h2>
          <p>
            To process airway bills, execute certified tare weight checks, and facilitate digital customs clearances across Kuwait and GCC border ports, we collect the following data categories:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
            <li><strong>Shipper & Consignee Identifiers:</strong> Legal entity, contact person, verified phone number, email address, physical delivery address, and Kuwait PACI identifier.</li>
            <li><strong>Consignment & Customs Data:</strong> Commercial invoice line items, declared values, HS Codes, IATA Dangerous Goods (DGR) classifications, and certified tare weights.</li>
            <li><strong>Optical & Telemetry Records:</strong> Barcode laser scan timestamps, driver GPS delivery stamps, and HTML5 digital Proof of Delivery signatures.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-black text-base-content uppercase tracking-wider">
            2. Purpose & Use of Data
          </h2>
          <p>We process collected consignment data exclusively to:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
            <li>Issue official carrier Air Waybills with DHL Express, LogesTechs GCC, and OTE.</li>
            <li>Transmit mandatory border manifests to the Kuwait General Administration of Customs and regional GCC authorities.</li>
            <li>Send automated dispatch notifications and tracking web links via official Meta WhatsApp Business Cloud APIs.</li>
            <li>Reconcile Cash-on-Delivery (COD) ledgers and generate commercial VAT invoices.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-black text-base-content uppercase tracking-wider">
            3. Data Security & Storage
          </h2>
          <p>
            All data in transit is encrypted using TLS 1.3 with 256-bit encryption. Rest-state records, webhook payload logs, and digital signature canvases are stored in encrypted databases complying with regional security standards.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-black text-base-content uppercase tracking-wider">
            4. Governing Jurisdiction
          </h2>
          <p>
            This policy and all data handling practices are governed by and construed in accordance with the laws of the State of Kuwait.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;
