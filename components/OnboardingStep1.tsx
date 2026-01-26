
import React from 'react';

interface Props {
  onNext: () => void;
}

const OnboardingStep1: React.FC<Props> = ({ onNext }) => {
  return (
    <div className="h-full flex flex-col justify-between bg-background-light p-6 pb-12">
      <header className="flex justify-end pt-8">
        <button className="flex items-center gap-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm border border-primary/10 transition-all hover:bg-white">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[20px] leading-none">mic</span>
          </div>
          <span className="font-bold text-slate-800">语音助手</span>
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center -mt-10">
        <div className="relative mb-12">
          {/* 外发光 */}
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl scale-125"></div>
          
          {/* 主形象 */}
          <div className="relative w-64 h-64 rounded-full border-[6px] border-white shadow-2xl overflow-hidden z-10 bg-[#f9e8d4]">
            <img 
              src="https://placehold.co/400x400/png?text=AI+Assistant" 
              alt="AI 助手" 
              className="w-full h-full object-cover"
            />
          </div>

          {/* 波形框 */}
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-white px-8 py-3 rounded-full shadow-xl z-20 flex items-end gap-1.5 h-12">
            <div className="waveform-bar w-1.5 bg-primary rounded-full h-2"></div>
            <div className="waveform-bar w-1.5 bg-primary rounded-full h-6"></div>
            <div className="waveform-bar w-1.5 bg-primary rounded-full h-4"></div>
            <div className="waveform-bar w-1.5 bg-primary rounded-full h-7"></div>
            <div className="waveform-bar w-1.5 bg-primary rounded-full h-3"></div>
          </div>
        </div>

        <h1 className="text-[32px] font-black text-slate-900 text-center leading-tight tracking-tight px-4 mt-4">
          只需说话，AI帮您记录<br/>人生故事
        </h1>
      </main>

      <footer className="flex flex-col items-center gap-8">
        <div className="flex gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-primary/20"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-slate-200"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-slate-200"></div>
        </div>
        
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

export default OnboardingStep1;
