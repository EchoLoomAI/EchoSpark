import React, { useState, useEffect } from 'react';

const SkeletonLoading: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const delay = Number(import.meta.env.VITE_SKELETON_DELAY) || 1000;
    const timer = setTimeout(() => {
      setShow(true);
    }, delay);

    return () => clearTimeout(timer);
  }, []);

  if (!show) {
    return null;
  }

  return (
    <div className="w-full h-full flex flex-col p-6 space-y-6 animate-pulse bg-white">
      {/* Header Skeleton */}
      <div className="w-full flex justify-between items-center mb-4">
        <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
        <div className="h-6 w-32 bg-slate-200 rounded"></div>
        <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 flex flex-col space-y-8 mt-8">
        {/* Large Hero Block */}
        <div className="h-48 w-full bg-slate-200 rounded-2xl"></div>

        {/* Text Lines */}
        <div className="space-y-4 px-2">
          <div className="h-4 w-3/4 bg-slate-200 rounded"></div>
          <div className="h-4 w-full bg-slate-200 rounded"></div>
          <div className="h-4 w-5/6 bg-slate-200 rounded"></div>
        </div>

        {/* Grid Block */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="h-32 bg-slate-200 rounded-xl"></div>
          <div className="h-32 bg-slate-200 rounded-xl"></div>
        </div>
      </div>

      {/* Footer/Button Skeleton */}
      <div className="h-14 w-full bg-slate-200 rounded-full mt-auto mb-8"></div>
    </div>
  );
};

export default SkeletonLoading;
