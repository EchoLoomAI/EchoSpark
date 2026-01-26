
import React from 'react';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const OnboardingStep2: React.FC<Props> = ({ onNext, onBack }) => {
  return (
    <div className="h-full flex flex-col bg-background-light p-6 pb-12 relative overflow-hidden">
      {/* 装饰圆环 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] aspect-square border border-primary/10 rounded-full pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] aspect-square border border-primary/5 rounded-full pointer-events-none"></div>

      <header className="flex justify-between items-center pt-8">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-600 shadow-sm border border-slate-100 active:scale-90 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
        </button>
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-primary/20"></div>
           <div className="w-8 h-2 rounded-full bg-primary"></div>
           <div className="w-2 h-2 rounded-full bg-primary/20"></div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center mt-8">
        <div className="text-center z-10 mb-12">
          <h1 className="text-[36px] font-black text-slate-900 tracking-tight mb-2">支持多种方言</h1>
          <p className="text-slate-500 text-xl leading-relaxed">
            无需担心口音问题，<br/>回声灵犀听得懂您的乡音
          </p>
        </div>

        <div className="flex-1 w-full relative flex items-center justify-center">
          {/* 浮动方言标签 */}
          <div className="absolute top-[-10px] left-1/2 -translate-x-1/2 z-20 animate-float">
            <div className="bg-primary text-white px-8 py-3 rounded-full shadow-lg flex items-center gap-2 rotate-[-3deg]">
              <span className="text-xl font-bold">普通话</span>
              <span className="material-symbols-outlined text-[20px]">record_voice_over</span>
            </div>
          </div>

          <div className="absolute bottom-[20%] left-4 animate-float" style={{ animationDelay: '1s' }}>
            <div className="bg-white px-6 py-4 rounded-2xl rounded-tr-none shadow-md border border-primary/5 rotate-[5deg]">
              <span className="text-xl font-bold text-primary">粤语</span>
            </div>
          </div>

          <div className="absolute bottom-[20%] right-4 animate-float" style={{ animationDelay: '2s' }}>
            <div className="bg-white px-6 py-4 rounded-2xl rounded-tl-none shadow-md border border-primary/5 rotate-[-5deg]">
              <span className="text-xl font-bold text-primary">四川话</span>
            </div>
          </div>

          {/* 中心麦克风图标 */}
          <div className="relative w-36 h-36 bg-white rounded-full flex items-center justify-center shadow-xl border border-primary/10 z-10">
            <span className="material-symbols-outlined text-primary text-[72px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
            <div className="absolute inset-0 rounded-full bg-primary/5 animate-ping opacity-75"></div>
          </div>
        </div>
      </main>

      <footer className="mt-auto flex flex-col items-center gap-6 relative z-10">
        <button 
          onClick={onNext}
          className="w-full h-[72px] bg-primary rounded-full flex items-center justify-center text-white text-2xl font-bold gap-2 shadow-lg shadow-primary/30 active:scale-95 transition-all"
        >
          <span>下一步</span>
          <span className="material-symbols-outlined text-[28px]">arrow_forward</span>
        </button>
      </footer>
    </div>
  );
};

export default OnboardingStep2;
