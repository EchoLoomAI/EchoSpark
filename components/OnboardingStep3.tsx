
import React from 'react';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const OnboardingStep3: React.FC<Props> = ({ onNext, onBack }) => {
  return (
    <div className="h-full flex flex-col justify-between bg-background-light p-6 pb-12">
      <header className="flex justify-between items-center pt-8">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-600 shadow-sm border border-slate-100 active:scale-90 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
        </button>
        <div className="flex gap-2">
           <div className="w-2 h-2 rounded-full bg-secondary/20"></div>
           <div className="w-2 h-2 rounded-full bg-secondary/20"></div>
           <div className="w-8 h-2 rounded-full bg-secondary"></div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center -mt-10">
        <div className="relative mb-12">
          {/* 背景光效 */}
          <div className="absolute inset-0 bg-secondary/20 rounded-full blur-3xl scale-125"></div>
          
          {/* 核心视觉：一本精美的书的插画感布局 */}
          <div className="relative w-64 h-80 bg-white rounded-2xl shadow-2xl border-[4px] border-white overflow-hidden z-10 flex flex-col">
            <div className="h-2/3 bg-[#fdf5ed] relative flex items-center justify-center">
              <img 
                src="https://placehold.co/400x500/png?text=Biography" 
                alt="人生传记封面" 
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent"></div>
              <div className="absolute top-4 right-4 bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20">
                <span className="text-[10px] font-black text-secondary tracking-widest">珍藏版</span>
              </div>
            </div>
            <div className="flex-1 p-4 flex flex-col justify-center">
               <div className="w-12 h-1 bg-secondary/20 mb-3"></div>
               <h3 className="text-xl font-black text-slate-800 leading-tight">我的一生故事</h3>
               <p className="text-slate-400 text-xs mt-1">记录于 2025年 灵犀助手</p>
            </div>
          </div>

          {/* 浮动饰品 */}
          <div className="absolute -top-6 -right-6 w-20 h-20 bg-white rounded-full shadow-lg z-20 flex items-center justify-center animate-float">
            <span className="material-symbols-outlined text-secondary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>menu_book</span>
          </div>
          
          <div className="absolute bottom-10 -left-6 w-16 h-16 bg-white rounded-2xl shadow-lg z-20 flex items-center justify-center animate-float" style={{ animationDelay: '1.5s' }}>
            <span className="material-symbols-outlined text-secondary text-3xl">auto_awesome</span>
          </div>
        </div>

        <div className="text-center px-4">
          <h1 className="text-[32px] font-black text-slate-900 leading-tight tracking-tight mb-3">
            岁月如歌，纸墨留香
          </h1>
          <p className="text-slate-500 text-lg leading-relaxed">
            AI为您自动整理，<br/>支持印制成册，传承家族故事
          </p>
        </div>
      </main>

      <footer className="flex flex-col items-center gap-8">
        <button 
          onClick={onNext}
          className="w-full h-[72px] bg-secondary rounded-full flex items-center justify-center text-white text-2xl font-bold gap-2 shadow-lg shadow-secondary/30 active:scale-95 transition-all"
        >
          <span>立即体验</span>
          <span className="material-symbols-outlined text-[28px]">rocket_launch</span>
        </button>
      </footer>
    </div>
  );
};

export default OnboardingStep3;
