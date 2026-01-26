
import React from 'react';
import { UserProfile } from '../types';

interface Props {
  user: UserProfile;
  onNavigate: (mode: 'casual' | 'interview' | 'gallery' | 'profile') => void;
}

const Dashboard: React.FC<Props> = ({ user, onNavigate }) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5) return '夜深了';
    if (hour < 12) return '早上好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  const displayName = user.nickname || user.phoneNumber?.slice(-4) || '朋友';

  // 模拟进度与成就数据 (Mock Psychological Data)
  const totalMinutes = 126;
  const goalMinutes = 300;
  const progressPercent = Math.min(100, Math.round((totalMinutes / goalMinutes) * 100));
  
  // 心理激励数据计算
  const estimatedWords = totalMinutes * 120; // 假设每分钟语速120字
  const userRank = 88; // 模拟排名
  const familyRecordings = 15; // 模拟已保存给家人的片段

  return (
    <div className="h-full flex flex-col bg-background-light relative overflow-hidden font-sans">
      {/* Background Ambience */}
      <div className="absolute top-[-20%] right-[-20%] w-[80%] h-[50%] bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-secondary/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="px-6 pt-10 pb-4 flex justify-between items-center z-10 flex-shrink-0">
        <button 
            onClick={() => onNavigate('gallery')}
            className="w-12 h-12 rounded-2xl bg-white shadow-md flex items-center justify-center text-primary active:scale-95 transition-transform border border-slate-100"
            title="家庭影像"
        >
            <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
        </button>

        <button 
          onClick={() => onNavigate('profile')}
          className="group flex items-center gap-3 active:opacity-80 transition-opacity bg-white/80 backdrop-blur-md pr-2 pl-5 py-1.5 rounded-full border border-white shadow-sm"
        >
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">当前用户</span>
            <span className="text-lg font-black text-slate-800">{displayName}</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-md overflow-hidden relative flex items-center justify-center">
             {user.gender === '女' ? (
                <span className="material-symbols-outlined text-pink-400 text-[26px]">face_3</span>
             ) : (
                <span className="material-symbols-outlined text-slate-400 text-[26px]">face</span>
             )}
          </div>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 flex flex-col z-10 overflow-hidden relative">
        
        {/* Greeting */}
        <div className="mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700 flex-shrink-0">
          <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-[1.2]">
            {getGreeting()}，<br/>
            <span className="text-primary/90">今天想聊点什么？</span>
          </h1>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 gap-4 flex-shrink-0 relative z-20">
          {/* Casual Chat Card */}
          <button 
            onClick={() => onNavigate('casual')}
            className="group relative w-full h-40 bg-white rounded-[2rem] shadow-lg shadow-slate-200/50 border-4 border-white overflow-hidden flex flex-row items-center px-6 py-4 text-left transition-all hover:shadow-xl active:scale-[0.98]"
          >
             <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-2xl -mr-8 -mt-8"></div>
             
             <div className="flex-1 z-10 relative">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-2">
                  <span className="material-symbols-outlined text-3xl">forum</span>
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-0.5">随便聊聊</h3>
                <p className="text-slate-500 text-base font-bold">自由对话 · 捕捉灵感</p>
             </div>

             <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center ml-2 z-10">
                <span className="material-symbols-outlined text-primary/5 text-[80px] absolute right-[-15px] bottom-[-15px] rotate-[-15deg] group-hover:scale-110 transition-transform duration-500 pointer-events-none">graphic_eq</span>
                <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30 group-hover:scale-110 transition-transform duration-300 relative">
                   <span className="material-symbols-outlined text-white text-2xl">mic</span>
                </div>
             </div>
          </button>

          {/* Interview Card */}
          <button 
            onClick={() => onNavigate('interview')}
            className="group relative w-full h-40 bg-white rounded-[2rem] shadow-lg shadow-slate-200/50 border-4 border-white overflow-hidden flex flex-row items-center px-6 py-4 text-left transition-all hover:shadow-xl active:scale-[0.98]"
          >
             <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-secondary/10 to-transparent rounded-full blur-2xl -mr-8 -mt-8"></div>
             
             <div className="flex-1 z-10 relative">
                <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary mb-2">
                  <span className="material-symbols-outlined text-3xl">history_edu</span>
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-0.5">访谈叙事</h3>
                <p className="text-slate-500 text-base font-bold">循序渐进 · 人生传记</p>
             </div>

             <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center ml-2 z-10">
                <span className="material-symbols-outlined text-secondary/5 text-[80px] absolute right-[-15px] bottom-[-15px] rotate-[-15deg] group-hover:scale-110 transition-transform duration-500 pointer-events-none">auto_stories</span>
                <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center shadow-lg shadow-secondary/30 group-hover:scale-110 transition-transform duration-300 relative">
                   <span className="material-symbols-outlined text-white text-2xl">play_arrow</span>
                </div>
             </div>
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1 min-h-[1rem]"></div>

        {/* Interactive Progress Sphere Section */}
        <div className="mb-10 w-full flex justify-center flex-shrink-0 relative group">
           
           {/* Legacy Insight Popup (Appears on Hover/Active) */}
           <div className="absolute bottom-[110%] left-1/2 -translate-x-1/2 w-[85%] bg-white/90 backdrop-blur-xl rounded-3xl border border-cyan-100 shadow-[0_20px_50px_rgba(43,173,238,0.2)] p-6 z-50 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:translate-y-[-10px] transition-all duration-500 transform translate-y-0">
              <div className="flex flex-col gap-4">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600">
                       <span className="material-symbols-outlined">menu_book</span>
                    </div>
                    <div>
                       <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">已转化文字</p>
                       <p className="text-xl font-black text-slate-800 tracking-tight">约 {estimatedWords.toLocaleString()} 字</p>
                    </div>
                 </div>

                 <div className="h-px bg-slate-100 w-full"></div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                       <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">社群排名</p>
                       <p className="text-lg font-black text-cyan-600">超越 {userRank}%</p>
                    </div>
                    <div className="flex flex-col">
                       <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">给家人的话</p>
                       <p className="text-lg font-black text-secondary">{familyRecordings} 段录音</p>
                    </div>
                 </div>

                 <div className="bg-cyan-50 rounded-2xl p-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-cyan-500 text-sm">stars</span>
                    <p className="text-[11px] font-bold text-cyan-700">距离完成《童年章节》还差 14 分钟</p>
                 </div>
              </div>
              
              {/* Tooltip Arrow */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/90 border-r border-b border-cyan-100 rotate-45"></div>
           </div>

           {/* The Original Sphere Container */}
           <div className="relative w-44 h-44 cursor-pointer active:scale-95 transition-transform">
              
              {/* Sphere Ambient Glow */}
              <div className="absolute inset-0 bg-cyan-400/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>

              {/* Sphere Container */}
              <div className="w-full h-full rounded-full bg-white border-[6px] border-white shadow-[0_20px_40px_-5px_rgba(0,0,0,0.1)] overflow-hidden relative isolate transform translate-z-0">
                  
                  {/* Inner Shadow for Depth */}
                  <div className="absolute inset-0 rounded-full shadow-[inset_0_4px_10px_rgba(0,0,0,0.05)] z-20 pointer-events-none"></div>

                  {/* Liquid Fill Waves */}
                  <div 
                    className="absolute left-[-50%] bottom-0 w-[200%] h-[200%] rounded-[40%] bg-cyan-400/80 animate-[wave-rotate_6s_linear_infinite] transition-all duration-1000 ease-out z-10 group-hover:duration-[4s]"
                    style={{ bottom: `calc(${progressPercent}% - 200% + 12%)` }} 
                  ></div>
                  <div 
                    className="absolute left-[-50%] bottom-0 w-[200%] h-[200%] rounded-[42%] bg-cyan-300 animate-[wave-rotate_9s_linear_infinite] transition-all duration-1000 ease-out z-0 group-hover:duration-[6s]"
                    style={{ bottom: `calc(${progressPercent}% - 200% + 15%)` }} 
                  ></div>

                  {/* Content Overlay */}
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center drop-shadow-md">
                      <span className="text-4xl font-black text-slate-800 drop-shadow-sm tracking-tight">{progressPercent}<span className="text-xl align-top font-bold">%</span></span>
                      <div className="h-1 w-10 bg-slate-800/20 rounded-full my-1.5"></div>
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{totalMinutes} 分钟</span>
                  </div>

                  {/* Glass Reflection Highlight */}
                  <div className="absolute top-[10%] left-[20%] w-[15%] h-[10%] bg-white/40 rounded-full blur-[2px] z-20 pointer-events-none"></div>
              </div>
           </div>
        </div>

      </main>
      
      <style>{`
        @keyframes wave-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
