import React from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';

export const InConstructionPage = ({
  title = 'Under Construction',
  description = 'We are working hard to bring this feature to life in the next deployment cycle.',
}) => {
  const navigate = useNavigate();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={title}
        subtitle="This operational module is actively undergoing staging and system testing."
      />

      <EmptyState
        title={`${title} Coming Soon`}
        description={description}
        icon={<span className="material-symbols-outlined text-4xl">construction</span>}
        action={
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="btn btn-primary font-bold text-xs shadow-md shadow-primary/20 gap-2"
          >
            <span className="material-symbols-outlined text-base">dashboard</span>
            <span>Return to Dashboard</span>
          </button>
        }
      />
    </div>
  );
};

export default InConstructionPage;
