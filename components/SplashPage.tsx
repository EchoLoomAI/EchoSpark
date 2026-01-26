
import React from 'react';

const SplashPage: React.FC = () => {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-white relative overflow-hidden">
      {/* Background Decorative Element */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-primary/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-5%] left-[-5%] w-80 h-80 bg-secondary/5 rounded-full blur-3xl"></div>

      <div className="flex flex-col items-center animate-in fade-in zoom-in duration-1000">
        {/* Animated Logo Icon */}
        <div className="relative mb-8">
          <div className="w-24 h-24 bg-primary rounded-3xl rotate-12 flex items-center justify-center shadow-xl shadow-primary/20 relative z-10">
            <span className="material-symbols-outlined text-white text-5xl -rotate-12" style={{ fontVariationSettings: "'FILL' 1" }}>
              waves
            </span>
          </div>
          {/* Echo Circles */}
          <div className="absolute inset-0 bg-primary/20 rounded-3xl animate-ping opacity-75"></div>
          <div className="absolute inset-0 bg-primary/10 rounded-3xl animate-ping opacity-50" style={{ animationDelay: '0.5s' }}></div>
        </div>

        {/* Text Brand */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
            回声灵犀
          </h1>
          <div className="flex items-center justify-center gap-2">
            <span className="h-[1px] w-4 bg-slate-300"></span>
            <span className="text-primary font-display font-bold tracking-[0.2em] text-xs uppercase">EchoSpark</span>
            <span className="h-[1px] w-4 bg-slate-300"></span>
          </div>
        </div>
      </div>

      {/* Slogan at Bottom */}
      <div className="absolute bottom-16 left-0 right-0 text-center animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500 fill-mode-both">
        <p className="text-slate-400 font-medium tracking-[0.3em] text-sm">
          珍藏岁月 · 声声不息
        </p>
        <div className="mt-4 flex justify-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-primary/20"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-primary/10"></div>
        </div>
      </div>
    </div>
  );
};

export default SplashPage;
