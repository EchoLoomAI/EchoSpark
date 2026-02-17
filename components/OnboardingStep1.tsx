
import React, { useState, useEffect } from 'react';

interface Props {
  onNext: () => void;
}

const OnboardingStep1: React.FC<Props> = ({ onNext }) => {
  const [messages, setMessages] = useState<{role: 'ai' | 'user', text: string}[]>([]);

  useEffect(() => {
    // Dynamic demo animation
    const sequence = [
      { role: 'ai', text: '您好！我是灵犀。能跟我讲讲您小时候最难忘的一件事吗？', delay: 500 },
      { role: 'user', text: '那是1960年的夏天...', delay: 2000 },
      { role: 'ai', text: '听起来很有趣，当时发生了什么？', delay: 4000 }
    ];

    let timeouts: NodeJS.Timeout[] = [];

    sequence.forEach(({ role, text, delay }) => {
      const timeout = setTimeout(() => {
        setMessages(prev => [...prev, { role: role as 'ai' | 'user', text }]);
      }, delay);
      timeouts.push(timeout);
    });

    return () => timeouts.forEach(clearTimeout);
  }, []);

  return (
    <div className="h-full flex flex-col justify-between bg-[#FFF5F5] p-6 pb-8 relative">
      {/* Top Bar */}
      <header className="flex justify-between items-center pt-4">
        <button className="text-[#FF6B6B] text-lg font-bold px-4 py-2 border-2 border-[#FF6B6B] rounded-full opacity-0 pointer-events-none">
          返回
        </button>
        {/* Removed extra buttons */}
      </header>

      <main className="flex-1 flex flex-col mt-6">
        <h1 className="text-[32px] font-black text-[#2D3436] text-center leading-tight mb-8">
          智能对话<br/>记录人生故事
        </h1>

        {/* Dynamic Demo Area */}
        <div className="flex-1 bg-white rounded-3xl shadow-xl p-4 mb-6 border-4 border-[#FF6B6B]/10 overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white to-transparent z-10"></div>
          <div className="space-y-4 pt-4">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}
              >
                <div 
                  className={`max-w-[85%] px-5 py-3 rounded-2xl text-[20px] font-medium leading-snug shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-[#FF6B6B] text-white rounded-tr-none' 
                      : 'bg-[#F0F4F8] text-[#2D3436] rounded-tl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {messages.length === 3 && (
               <div className="flex justify-center pt-2">
                 <div className="flex gap-1 animate-pulse">
                   <div className="w-2 h-2 bg-[#FF6B6B] rounded-full"></div>
                   <div className="w-2 h-2 bg-[#FF6B6B] rounded-full animation-delay-200"></div>
                   <div className="w-2 h-2 bg-[#FF6B6B] rounded-full animation-delay-400"></div>
                 </div>
               </div>
            )}
          </div>
        </div>

        {/* Voice Interaction Hint */}
        <div className="flex items-center justify-center gap-3 text-[#FF6B6B] mb-4">
           <span className="material-symbols-outlined text-3xl animate-pulse">mic</span>
           <span className="text-[20px] font-bold">AI 正在倾听...</span>
        </div>
      </main>

      <footer className="flex flex-col items-center gap-6 relative pb-8 shrink-0">
        {/* Progress Dots */}
        <div className="flex gap-3">
          <div className="w-3 h-3 rounded-full bg-[#FF6B6B] ring-4 ring-[#FF6B6B]/20"></div>
          <div className="w-3 h-3 rounded-full bg-[#E0E0E0]"></div>
          <div className="w-3 h-3 rounded-full bg-[#E0E0E0]"></div>
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

export default OnboardingStep1;
