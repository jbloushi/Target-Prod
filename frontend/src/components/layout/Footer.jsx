import React from 'react';
import { Link } from 'react-router-dom';

const Footer = ({ compact = false }) => {
  const currentYear = new Date().getFullYear();

  if (compact) {
    return (
      <footer className="bg-base-100 border-t border-base-200 py-4 px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">local_shipping</span>
            <span className="font-extrabold text-sm tracking-tight text-base-content">
              TARGET <span className="text-primary">LOGISTICS</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-base-content/60">
            <Link to="/track" className="hover:text-primary transition-colors">Track</Link>
            <Link to="/contact" className="hover:text-primary transition-colors">Contact</Link>
            <Link to="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-primary transition-colors">Terms</Link>
          </div>

          <div className="text-xs text-base-content/50 font-medium">
            © {currentYear} Target Logistics Global.
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="bg-base-100 border-t border-base-200 py-10 px-6 mt-auto">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-2xl">local_shipping</span>
              <span className="font-black text-lg tracking-tight text-base-content">
                TARGET <span className="text-primary">LOGISTICS</span>
              </span>
            </div>
            <p className="text-xs text-base-content/60 leading-relaxed max-w-sm">
              State-of-the-art multi-carrier freight management, express GCC road transport, and certified IATA Dangerous Goods handling. Operating across Kuwait and worldwide.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-circle btn-xs text-base-content/70 hover:text-primary"
                aria-label="Facebook"
              >
                <span className="material-symbols-outlined text-base">public</span>
              </a>
              <a
                href="https://wa.me/96599554433"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-circle btn-xs text-base-content/70 hover:text-success"
                aria-label="WhatsApp"
              >
                <span className="material-symbols-outlined text-base">chat</span>
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-circle btn-xs text-base-content/70 hover:text-primary"
                aria-label="LinkedIn"
              >
                <span className="material-symbols-outlined text-base">domain</span>
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-base-content/80">Navigation</h4>
            <ul className="space-y-1.5 text-xs text-base-content/60">
              <li><Link to="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link></li>
              <li><Link to="/shipments" className="hover:text-primary transition-colors">Shipments</Link></li>
              <li><Link to="/track" className="hover:text-primary transition-colors">Public Tracking</Link></li>
              <li><Link to="/returns" className="hover:text-primary transition-colors">Return Portal</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-base-content/80">Company</h4>
            <ul className="space-y-1.5 text-xs text-base-content/60">
              <li><Link to="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link to="/contact" className="hover:text-primary transition-colors">Contact Desk</Link></li>
              <li><Link to="/api-docs" className="hover:text-primary transition-colors">API Docs</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-base-content/80">Regulatory</h4>
            <ul className="space-y-1.5 text-xs text-base-content/60">
              <li><Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-primary transition-colors">Terms of Carriage</Link></li>
              <li><span className="badge badge-sm badge-outline text-[10px] font-mono">IATA DGR Compliant</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-base-200 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-base-content/50">
          <div>© {currentYear} Target Logistics Global. All rights reserved. State of Kuwait.</div>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:underline">Privacy</Link>
            <Link to="/terms" className="hover:underline">Terms</Link>
            <Link to="/contact" className="hover:underline">Support</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
