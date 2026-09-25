import React, { useState } from 'react';
import PageHeader from '../components/common/PageHeader';

const CONTACT_REASONS = [
  'General Consignment Inquiry',
  'Commercial B2B Rates & Contracts',
  'Kuwait Customs Clearance Exception',
  'Airfreight Cargo Booking',
  'Dangerous Goods (IATA DGR)',
  'API & Webhook Integration Support',
];

export const ContactPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    reason: CONTACT_REASONS[0],
    message: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      setFormData({
        name: '',
        email: '',
        phone: '',
        reason: CONTACT_REASONS[0],
        message: '',
      });
    }, 1000);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-8 font-sans">
      <PageHeader
        title="Contact Target Logistics Global"
        subtitle="Our Kuwait operations desk and GCC regional support team are available 24/7."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Contact Info & Support Channels */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card bg-base-100 border border-base-200 shadow-sm p-6 space-y-6">
            <div>
              <h3 className="text-lg font-black text-base-content tracking-tight">Kuwait Central Operations Hub</h3>
              <p className="text-xs text-base-content/60 mt-1">
                Target Logistics Global Express W.L.L.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-base">location_on</span>
                </div>
                <div>
                  <div className="font-bold text-base-content">Headquarters & Intake Warehouse</div>
                  <div className="text-base-content/60 mt-0.5">
                    Shuwaikh Industrial Area 2, Street 18, Building 45, Kuwait City
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-success/10 text-success flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-base">chat</span>
                </div>
                <div>
                  <div className="font-bold text-base-content">Meta WhatsApp Dispatch Support</div>
                  <div className="font-mono text-base-content/60 mt-0.5">+965 2200 8899</div>
                  <a
                    href="https://wa.me/96522008899"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-primary font-bold text-[11px] block mt-0.5"
                  >
                    Open Live WhatsApp Chat &rarr;
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-info/10 text-info flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-base">mail</span>
                </div>
                <div>
                  <div className="font-bold text-base-content">Enterprise Email Desk</div>
                  <div className="font-mono text-base-content/60 mt-0.5">ops@target-kw.com</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-base">schedule</span>
                </div>
                <div>
                  <div className="font-bold text-base-content">Operations Schedule</div>
                  <div className="text-base-content/60 mt-0.5">
                    Sunday – Thursday: 07:00 – 21:00 (Kuwait AST)
                  </div>
                  <div className="text-base-content/60">
                    24/7 Air Cargo Gateway Intake & Linehaul Tracking
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Message Form */}
        <div className="lg:col-span-7 card bg-base-100 border border-base-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div>
            <h3 className="text-xl font-black text-base-content tracking-tight">Send Us a Direct Message</h3>
            <p className="text-xs text-base-content/60 mt-1">
              Fill in your inquiry details and our logistics coordinators will reply within 30 minutes.
            </p>
          </div>

          {submitted ? (
            <div className="p-8 text-center bg-success/10 border border-success/30 rounded-2xl space-y-3">
              <div className="w-14 h-14 rounded-full bg-success text-white flex items-center justify-center mx-auto text-3xl">
                ✓
              </div>
              <h4 className="text-lg font-black text-base-content">Inquiry Dispatched!</h4>
              <p className="text-xs text-base-content/70 max-w-sm mx-auto">
                Thank you for contacting Target Logistics. Our client operations desk has received your request.
              </p>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="btn btn-outline btn-sm font-bold text-xs"
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Bader Al-Ahmad"
                    className="input input-bordered w-full text-xs font-medium focus:input-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Work Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="name@company.com"
                    className="input input-bordered w-full text-xs font-medium focus:input-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+965 9000 0000"
                    className="input input-bordered w-full font-mono text-xs focus:input-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Inquiry Category *</label>
                  <select
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    className="select select-bordered w-full text-xs font-medium focus:select-primary"
                  >
                    {CONTACT_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-base-content/70 uppercase">Message & Details *</label>
                <textarea
                  rows={4}
                  required
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Provide tracking references, consignment weights, or specific routing questions..."
                  className="textarea textarea-bordered w-full text-xs font-medium focus:textarea-primary"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary font-bold text-xs shadow-md shadow-primary/20 gap-2 px-6"
                >
                  {submitting ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      <span>Sending Message...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">send</span>
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactPage;