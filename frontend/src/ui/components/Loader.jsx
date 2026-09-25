import React from 'react';

const Loader = ({ size, centered, fullPage, text }) => {
  const sizeClass = size === 'sm' ? 'loading-sm' : size === 'lg' ? 'loading-lg' : 'loading-md';

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${
      fullPage ? 'fixed inset-0 bg-base-100/80 backdrop-blur-md z-[10000]' : centered ? 'h-full w-full min-h-[200px]' : ''
    }`}>
      <span className={`loading loading-spinner text-primary ${sizeClass}`} />
      {text && (
        <span className="text-primary font-bold text-xs uppercase tracking-wider">
          {text}
        </span>
      )}
    </div>
  );
};

export default Loader;
