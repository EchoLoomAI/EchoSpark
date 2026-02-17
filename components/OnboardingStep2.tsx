
import React, { useState, useRef, useEffect } from 'react';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const dialects = [
  { id: 'sc', name: '四川话', region: '西南', color: '#FF9F43', char: '川' },
  { id: 'gd', name: '粤语', region: '华南', color: '#EE5253', char: '粤' },
  { id: 'sh', name: '上海话', region: '华东', color: '#54A0FF', char: '沪' },
  { id: 'bj', name: '北京话', region: '华北', color: '#1DD1A1', char: '京' },
  { id: 'db', name: '东北话', region: '东北', color: '#9333EA', char: '整' },
  { id: 'sx', name: '陕西话', region: '西北', color: '#F97316', char: '秦' },
];

const OnboardingStep2: React.FC<Props> = ({ onNext, onBack }) => {
  const [activeDialect, setActiveDialect] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlay = (id: string) => {
    if (isPlaying === id) {
      // Stop playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsPlaying(null);
    } else {
      // Stop previous
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      setIsPlaying(id);
      
      // Try playing from public folder
      const audio = new Audio(`/audio/dialects/${id}.mp3`);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(null);
        audioRef.current = null;
      };

      audio.onerror = () => {
        console.warn(`Audio file not found: /audio/dialects/${id}.mp3. Using mock duration.`);
        // Fallback to mock behavior if file not found
        setTimeout(() => {
            setIsPlaying(current => current === id ? null : current);
        }, 3000);
      };

      audio.play().catch(err => {
        console.log('Audio playback failed or file missing, using mock.', err);
         setTimeout(() => {
            setIsPlaying(current => current === id ? null : current);
        }, 3000);
      });
    }
  };

  return (
    <div className="h-full flex flex-col justify-between bg-[#F0F8FF] p-6 pb-8 relative">
      {/* Top Bar */}
      <header className="flex justify-between items-center pt-4">
        <button
          onClick={onBack}
          className="text-[#54A0FF] text-lg font-bold flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
          <span>返回</span>
        </button>
      </header>

      <main className="flex-1 flex flex-col mt-4 px-2 overflow-hidden min-h-0">
        <h1 className="text-[28px] font-black text-[#2D3436] text-center leading-tight mb-4 shrink-0">
          家乡话<br />倍感亲切
        </h1>



        {/* Dialect Selection Grid */}
        <div className="grid grid-cols-2 gap-3 flex-1 min-h-0 content-start">
          {dialects.map((dialect) => (
            <div
              key={dialect.id}
              onClick={() => setActiveDialect(dialect.id)}
              className={`relative flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all cursor-pointer ${activeDialect === dialect.id
                ? 'bg-white border-[#54A0FF] shadow-md scale-[1.02]'
                : 'bg-white/60 border-transparent hover:bg-white/80'
                }`}
            >
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-sm mb-2`} style={{ backgroundColor: dialect.color }}>
                {dialect.char}
              </div>

              <div className="text-lg font-bold text-[#2D3436] mb-1">{dialect.name}</div>

              <button
                onClick={(e) => { e.stopPropagation(); handlePlay(dialect.id); }}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-colors ${isPlaying === dialect.id ? 'bg-[#54A0FF] text-white' : 'bg-gray-100 text-[#54A0FF]'
                  }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {isPlaying === dialect.id ? 'pause' : 'volume_up'}
                </span>
                <span>试听</span>
              </button>

              {/* Selection Checkmark */}
              {activeDialect === dialect.id && (
                <div className="absolute top-2 right-2 text-[#54A0FF]">
                  <span className="material-symbols-outlined text-xl">check_circle</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* My Dialect Setting - REMOVED per request */}
      </main>

      <footer className="flex flex-col items-center gap-6 mt-4 pb-8 shrink-0">
        {/* Progress Dots */}
        <div className="flex gap-3">
          <div className="w-3 h-3 rounded-full bg-[#54A0FF]"></div>
          <div className="w-3 h-3 rounded-full bg-[#54A0FF] ring-4 ring-[#54A0FF]/20"></div>
          <div className="w-3 h-3 rounded-full bg-[#E0E0E0]"></div>
          <div className="w-3 h-3 rounded-full bg-[#E0E0E0]"></div>
        </div>

        <button
          onClick={onNext}
          className="w-full h-[72px] bg-[#54A0FF] rounded-full flex items-center justify-center text-white text-[28px] font-bold gap-3 shadow-lg shadow-[#54A0FF]/30 active:scale-95 transition-all hover:bg-[#2e86de]"
        >
          <span>下一步</span>
          <span className="material-symbols-outlined text-[32px]">arrow_forward</span>
        </button>
      </footer>
    </div>
  );
};

export default OnboardingStep2;
