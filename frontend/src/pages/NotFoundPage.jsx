import React from 'react';
import { useNavigate } from 'react-router-dom';

export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="card bg-base-100 border border-base-200 shadow-sm max-w-lg w-full p-8 sm:p-12 text-center space-y-5">
        <div className="w-20 h-20 rounded-3xl bg-error/10 text-error flex items-center justify-center mx-auto text-4xl shadow-sm">
          <span className="material-symbols-outlined text-5xl">warning</span>
        </div>
        <div className="space-y-1">
          <div className="font-mono font-black text-4xl text-primary">404</div>
          <h1 className="text-2xl font-black text-base-content tracking-tight">Waybill Route Not Found</h1>
          <p className="text-xs sm:text-sm text-base-content/60 leading-relaxed max-w-sm mx-auto">
            The consignment dossier, dashboard route, or system tool you are looking for does not exist or has been archived.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn btn-outline border-base-300 w-full sm:w-auto font-bold text-xs"
          >
            &larr; Go Back
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="btn btn-primary w-full sm:w-auto font-bold text-xs shadow-md shadow-primary/20 gap-2"
          >
            <span className="material-symbols-outlined text-base">dashboard</span>
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
