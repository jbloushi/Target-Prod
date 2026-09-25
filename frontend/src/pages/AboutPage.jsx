import React from 'react';
import PageHeader from '../components/common/PageHeader';

export const AboutPage = () => {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-8 font-sans">
      <PageHeader
        title="About Target Logistics Global"
        subtitle="Autonomous freight intelligence, Middle East GCC linehauls, and worldwide express air cargo."
      />

      {/* Hero Overview Card */}
      <div className="card bg-base-100 border border-base-200 shadow-sm p-6 sm:p-10 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
              <span className="material-symbols-outlined text-sm">rocket_launch</span>
              <span>Next-Gen Logistics Operating System</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-base-content tracking-tight">
              Simplifying Global Trade from Kuwait to Over 200 Countries
            </h2>
            <p className="text-sm text-base-content/70 leading-relaxed">
              Target Logistics Global Express W.L.L. was architected to eliminate friction from cross-border freight forwarding. By bridging direct carrier APIs (DHL Express, LogesTechs GCC, OTE) with real-time customs automation, certified weight discrepancy checks, and mobile Proof of Delivery, we empower corporate shippers with total supply chain transparency.
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <div className="badge badge-neutral font-bold text-xs p-3">Headquarters: Kuwait City</div>
              <div className="badge badge-primary badge-outline font-bold text-xs p-3">IATA DGR Certified</div>
              <div className="badge badge-success badge-outline font-bold text-xs p-3">256-Bit Encrypted Data</div>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            <div className="card bg-base-200/50 border border-base-200 p-4 text-center space-y-1">
              <div className="text-3xl font-black text-primary font-mono">200+</div>
              <div className="text-[11px] font-bold text-base-content/60 uppercase">Destinations</div>
            </div>
            <div className="card bg-base-200/50 border border-base-200 p-4 text-center space-y-1">
              <div className="text-3xl font-black text-secondary font-mono">99.4%</div>
              <div className="text-[11px] font-bold text-base-content/60 uppercase">On-Time SLA</div>
            </div>
            <div className="card bg-base-200/50 border border-base-200 p-4 text-center space-y-1">
              <div className="text-3xl font-black text-accent font-mono">6/6</div>
              <div className="text-[11px] font-bold text-base-content/60 uppercase">Kuwait Governorates</div>
            </div>
            <div className="card bg-base-200/50 border border-base-200 p-4 text-center space-y-1">
              <div className="text-3xl font-black text-success font-mono">&lt; 1s</div>
              <div className="text-[11px] font-bold text-base-content/60 uppercase">Barcode Laser HUD</div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Pillars Grid */}
      <div className="space-y-4">
        <h3 className="text-xl font-black text-base-content tracking-tight">Our Core Operating Pillars</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card bg-base-100 border border-base-200 p-6 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-2xl">
              <span className="material-symbols-outlined text-2xl">flight_takeoff</span>
            </div>
            <h4 className="font-extrabold text-base text-base-content">Worldwide Air Cargo</h4>
            <p className="text-xs text-base-content/60 leading-relaxed">
              Real-time rate calculation, dimensional tare checks, and priority linehauls via authorized DHL Express air routes.
            </p>
          </div>

          <div className="card bg-base-100 border border-base-200 p-6 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center text-2xl">
              <span className="material-symbols-outlined text-2xl">local_shipping</span>
            </div>
            <h4 className="font-extrabold text-base text-base-content">GCC Overland Corridors</h4>
            <p className="text-xs text-base-content/60 leading-relaxed">
              Seamless cross-border customs manifests across Kuwait, Saudi Arabia, UAE, Bahrain, Qatar, and Oman.
            </p>
          </div>

          <div className="card bg-base-100 border border-base-200 p-6 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center text-2xl">
              <span className="material-symbols-outlined text-2xl">verified_user</span>
            </div>
            <h4 className="font-extrabold text-base text-base-content">Digital Customs & Duty</h4>
            <p className="text-xs text-base-content/60 leading-relaxed">
              Automated HS-Code classification, IATA Dangerous Goods packaging checks, and paperless customs releases.
            </p>
          </div>

          <div className="card bg-base-100 border border-base-200 p-6 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-xl bg-success/10 text-success flex items-center justify-center text-2xl">
              <span className="material-symbols-outlined text-2xl">draw</span>
            </div>
            <h4 className="font-extrabold text-base text-base-content">Contactless POD</h4>
            <p className="text-xs text-base-content/60 leading-relaxed">
              HTML5 mobile signature canvas, GPS coordinates tagging, and Meta WhatsApp instant delivery receipts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
