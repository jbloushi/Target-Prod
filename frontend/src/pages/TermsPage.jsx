import React from 'react';
import PageHeader from '../components/common/PageHeader';

export const TermsPage = () => {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 font-sans">
      <PageHeader
        title="Commercial Terms of Carriage & Service"
        subtitle="Last Updated: February 2026 • Target Logistics Global Express W.L.L."
      />

      <div className="card bg-base-100 border border-base-200 shadow-sm p-6 sm:p-10 space-y-6 text-sm text-base-content/75 leading-relaxed">
        <div className="space-y-2">
          <h2 className="text-base font-black text-base-content uppercase tracking-wider">
            1. Agreement of Carriage
          </h2>
          <p>
            By booking a shipment, generating an Air Waybill (AWB), or accessing the Target Logistics Global platform, the shipper ("Consignor") accepts these Terms and Conditions on behalf of themselves and the receiver ("Consignee"). All airfreight carriage is subject to the Warsaw and Montreal Conventions where applicable.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-black text-base-content uppercase tracking-wider">
            2. Volumetric Weight & Discrepancy Audits
          </h2>
          <p>
            Chargeable weight is calculated based on the greater of actual gross dead weight or volumetric weight (using the standard IATA divisor: <code className="bg-base-200 px-1 py-0.5 rounded font-mono font-bold">L x W x H (cm) / 5000</code>). In the event of a certified scale discrepancy exceeding 0.05 kg identified during warehouse scan-in, Target Logistics reserves the right to re-rate the consignment based on certified dimensions.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-black text-base-content uppercase tracking-wider">
            3. Dangerous Goods & Prohibited Cargo
          </h2>
          <p>
            Shippers booking IATA Dangerous Goods (DGR), including lithium-ion batteries, perfumes, chemicals, and pressurized gases, must declare UN classification codes and supply authentic Material Safety Data Sheets (MSDS). Failure to declare hazardous cargo may result in immediate customs seizure and statutory penalties.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-black text-base-content uppercase tracking-wider">
            4. Cash on Delivery (COD) & Settlement Ledgers
          </h2>
          <p>
            COD collections executed by courier drivers in Kuwait are vaulted and reconciled within 48 hours. B2B corporate client settlements are disbursed in accordance with agreed credit terms and billing schedules.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-black text-base-content uppercase tracking-wider">
            5. Governing Law & Dispute Resolution
          </h2>
          <p>
            These terms are governed exclusively by the commercial and civil laws of the State of Kuwait. Any disputes arising hereunder shall be submitted to the exclusive jurisdiction of the Commercial Courts of Kuwait.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
