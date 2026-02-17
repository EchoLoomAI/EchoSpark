
import React from 'react';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const templates = [
  { id: 1, title: '经典回忆', color: '#7f8fa6', image: 'https://images.pexels.com/photos/256450/pexels-photo-256450.jpeg?auto=compress&cs=tinysrgb&w=400' },
  { id: 2, title: '现代简约', color: '#e1b12c', image: 'https://images.pexels.com/photos/159866/books-book-pages-read-literature-159866.jpeg?auto=compress&cs=tinysrgb&w=400' },
  { id: 3, title: '艺术人生', color: '#c23616', image: 'https://images.pexels.com/photos/1148399/pexels-photo-1148399.jpeg?auto=compress&cs=tinysrgb&w=400' },
];

const OnboardingStep4: React.FC<Props> = ({ onNext, onBack }) => {
  return (
    <div className="h-full flex flex-col justify-between bg-[#FFF5F5] p-6 pb-8 relative overflow-hidden">
      {/* Top Bar */}
      <header className="flex justify-between items-center pt-4">
        <button
          onClick={onBack}
          className="text-[#FF6B6B] text-lg font-bold flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
          <span>返回</span>
        </button>
      </header>

      <main className="flex-1 flex flex-col mt-6 overflow-y-auto pb-4 no-scrollbar">
        <h1 className="text-[32px] font-black text-[#2D3436] text-center leading-tight mb-6">
          个人传记<br />传承家族记忆
        </h1>

        {/* Template Preview Slider */}
        <div className="flex gap-4 overflow-x-auto pb-6 px-2 snap-x">
          {templates.map(t => (
            <div key={t.id} className="snap-center shrink-0 w-[180px] flex flex-col items-center">
              <div className="w-full h-[240px] rounded-r-2xl rounded-l-md shadow-lg bg-white overflow-hidden border-l-8 border-[#2D3436] relative mb-3">
                <img src={t.image} alt={t.title} className="w-full h-full object-cover opacity-90" />
                <div className="absolute bottom-4 left-0 right-0 text-center bg-black/50 text-white py-1 text-sm">
                  {t.title}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Share & Order Demo */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-6 mx-2 border border-[#FF6B6B]/10">
          <div className="flex justify-around items-center text-center">
            <div>
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center text-blue-500 mb-2 mx-auto">
                <span className="material-symbols-outlined text-3xl">share</span>
              </div>
              <div className="text-sm font-bold text-gray-600">一键分享</div>
            </div>
            <div className="w-px h-10 bg-gray-200"></div>
            <div>
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-green-500 mb-2 mx-auto">
                <span className="material-symbols-outlined text-3xl">menu_book</span>
              </div>
              <div className="text-sm font-bold text-gray-600">订购纸质书</div>
            </div>
            <div className="w-px h-10 bg-gray-200"></div>
            <div>
              <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center text-purple-500 mb-2 mx-auto">
                <span className="material-symbols-outlined text-3xl">local_shipping</span>
              </div>
              <div className="text-sm font-bold text-gray-600">送货到家</div>
            </div>
          </div>
        </div>

        {/* Success Stories */}
        <div className="bg-[#FFF0F0] rounded-2xl p-4 mx-2">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-300 overflow-hidden shrink-0">
              <img src="https://images.pexels.com/photos/103123/pexels-photo-103123.jpeg?auto=compress&cs=tinysrgb&w=100" alt="User" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-[#2D3436] text-lg font-medium leading-snug italic">
                "没想到我也能出书！孙子看到这本传记特别喜欢，说这是最珍贵的礼物。"
              </p>
              <div className="mt-2 text-sm text-[#FF6B6B] font-bold">— 张奶奶，82岁</div>
            </div>
          </div>
        </div>
      </main>

      <footer className="flex flex-col items-center gap-6 mt-4 pb-8 shrink-0">
        {/* Progress Dots */}
        <div className="flex gap-3">
          <div className="w-3 h-3 rounded-full bg-[#FF6B6B]"></div>
          <div className="w-3 h-3 rounded-full bg-[#FF6B6B]"></div>
          <div className="w-3 h-3 rounded-full bg-[#FF6B6B]"></div>
          <div className="w-3 h-3 rounded-full bg-[#FF6B6B] ring-4 ring-[#FF6B6B]/20"></div>
        </div>

        <button
          onClick={onNext}
          className="w-full h-[72px] bg-[#FF6B6B] rounded-full flex flex-col items-center justify-center text-white font-bold gap-0 shadow-lg shadow-[#FF6B6B]/30 active:scale-95 transition-all hover:bg-[#ff5252]"
        >
          <div className="flex items-center gap-2">
            <span className="text-[26px]">开启旅程</span>
            <span className="material-symbols-outlined text-[28px]">rocket_launch</span>
          </div>
        </button>
      </footer>
    </div>
  );
};

export default OnboardingStep4;
