import React from 'react';

/**
 * Paywall & Enterprise Feature Upgrade Modal
 */
const PaywallModal = ({ isOpen, onClose, featureName = 'Fleet Management Pro' }) => {
  if (!isOpen) return null;

  const features = [
    {
      icon: 'map',
      title: 'Kuwait Zone & PACI Auto-Clustering',
      desc: 'Automatically group shipments by governorate and PACI blocks into optimized delivery runs.'
    },
    {
      icon: 'smartphone',
      title: 'Driver Mobile Cockpit (PWA)',
      desc: 'Stop-by-stop sequencing, 1-tap WhatsApp recipient dialer, and direct Google Maps navigation.'
    },
    {
      icon: 'draw',
      title: 'Digital Signature & Photo POD',
      desc: 'Capture customer screen signatures and doorstep delivery photos with automated instant WhatsApp proof.'
    },
    {
      icon: 'payments',
      title: 'Live Driver COD Vault & Auto-Ledger',
      desc: 'Real-time driver cash collection tally with 1-click cashier settlement into the general ledger.'
    }
  ];

  const handleContactSales = () => {
    const text = encodeURIComponent(`Hello Target Logistics Team, I am interested in upgrading to the ${featureName} Enterprise plan for our organization.`);
    window.open(`https://wa.me/96599999999?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header Gradient */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 p-8 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition text-white"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
          
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold uppercase tracking-wider mb-3">
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            Enterprise Module
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl">local_shipping</span>
            {featureName}
          </h2>
          <p className="mt-2 text-blue-100 text-sm sm:text-base">
            Power your own last-mile logistics with Target's complete automated fleet dispatch, driver cockpit, and COD vault system.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((f, i) => (
              <div key={i} className="flex gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700">
                <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 h-fit flex items-center justify-center">
                  <span className="material-symbols-outlined text-xl">{f.icon}</span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{f.title}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Pricing Banner */}
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider">Merchant Add-on Available</span>
              <p className="text-sm text-amber-900 dark:text-amber-200 font-medium">Ready to dispatch your own vans & drivers?</p>
            </div>
            <button
              onClick={handleContactSales}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-md transition-all whitespace-nowrap cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">chat</span>
              Upgrade via WhatsApp
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium text-sm transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaywallModal;
