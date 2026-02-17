
import React, { useState, useEffect } from 'react';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const OnboardingStep3: React.FC<Props> = ({ onNext, onBack }) => {
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const features = [
    {
      title: '智能修复',
      desc: '一键还原模糊老照片，重现清晰容颜',
      icon: 'auto_fix_high',
      color: '#FF6B6B'
    },
    {
      title: 'AI 讲述',
      desc: '自动识别画面内容，生成生动解说词',
      icon: 'record_voice_over',
      color: '#4ECDC4'
    },
    {
      title: '情境还原',
      desc: '重构拍摄时的历史场景与氛围',
      icon: 'theater_comedy',
      color: '#FFD93D'
    }
  ];

  return (
    <div className="h-full flex flex-col justify-between bg-[#FFF5F5] p-6 pb-8 relative overflow-hidden">
      {/* Top Bar */}
      <header className="flex justify-between items-center pt-4 relative z-10">
        <button 
          onClick={onBack}
          className="text-[#FF6B6B] text-lg font-bold flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
          <span>返回</span>
        </button>
      </header>

      <main className="flex-1 flex flex-col mt-6 relative z-10 overflow-y-auto no-scrollbar">
        <h1 className="text-[32px] font-black text-[#2D3436] text-center leading-tight mb-8 shrink-0">
          智能家庭<br/>影像馆
        </h1>

        {/* AI Photo Analysis Demo */}
        <div className="relative w-full aspect-[4/3] bg-white p-2 rounded-3xl shadow-xl mb-8 border-4 border-[#FF6B6B]/10 shrink-0">
           <div className="relative w-full h-full rounded-2xl overflow-hidden group">
             {/* Before/After Effect using CSS clip-path or simple overlay */}
             <img src="https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&auto=format&fit=crop&q=60" alt="Old Photo" className="w-full h-full object-cover filter sepia-[.5] contrast-75 blur-[1px] transition-all duration-1000 group-hover:filter-none" />
             
             {/* Scanning Line Animation */}
             <div className="absolute top-0 left-0 w-full h-1 bg-[#FF6B6B] shadow-[0_0_15px_#FF6B6B] animate-[scan_3s_ease-in-out_infinite] opacity-80"></div>

             {/* AI Analysis Overlay */}
             <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md rounded-xl p-3 text-white transform transition-all duration-500">
               <div className="flex items-center gap-2 mb-1">
                 <span className="material-symbols-outlined text-[#FF6B6B] animate-pulse">auto_awesome</span>
                 <span className="text-sm font-bold text-[#FF6B6B]">AI 正在识别...</span>
               </div>
               <p className="text-sm leading-relaxed opacity-90">
                 "检测到1985年的家庭合影。背景是老式照相馆，充满温馨的节日氛围。建议修复人物面部细节，增强色彩饱和度。"
               </p>
             </div>
           </div>
        </div>

        {/* Feature Highlights */}
        <div className="flex-1 space-y-4 px-2">
          {features.map((f, index) => (
            <div 
              key={index}
              className={`flex items-center gap-4 p-4 rounded-2xl transition-all duration-500 border-2 ${
                activeFeature === index 
                  ? 'bg-white border-[#FF6B6B]/20 shadow-md scale-105' 
                  : 'bg-white/40 border-transparent opacity-60'
              }`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm shrink-0`} style={{ backgroundColor: f.color }}>
                <span className="material-symbols-outlined text-2xl">{f.icon}</span>
              </div>
              <div>
                <div className="text-lg font-bold text-[#2D3436]">{f.title}</div>
                <div className="text-sm text-gray-500 leading-tight">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="flex flex-col items-center gap-6 mt-6 relative z-10 pb-8 shrink-0">
        {/* Progress Dots */}
        <div className="flex gap-3">
          <div className="w-3 h-3 rounded-full bg-[#FF6B6B]"></div>
          <div className="w-3 h-3 rounded-full bg-[#FF6B6B]"></div>
          <div className="w-3 h-3 rounded-full bg-[#FF6B6B] ring-4 ring-[#FF6B6B]/20"></div>
          <div className="w-3 h-3 rounded-full bg-[#E0E0E0]"></div>
        </div>
        
        <button 
          onClick={onNext}
          className="w-full h-[72px] bg-[#FF6B6B] rounded-full flex items-center justify-center text-white text-[28px] font-bold gap-3 shadow-lg shadow-[#FF6B6B]/30 active:scale-95 transition-all hover:bg-[#ff5252]"
        >
          <span>下一步</span>
          <span className="material-symbols-outlined text-[32px]">arrow_forward</span>
        </button>
      </footer>
    </div>
  );
};

export default OnboardingStep3;
