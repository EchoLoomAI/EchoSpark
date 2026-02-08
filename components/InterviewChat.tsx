
import React, { useState, useEffect } from 'react';
import { useAgoraVoiceAgent } from '../hooks/useAgoraVoiceAgent';
import { getAgentConfig } from '../services/agentService';
import { UserProfile } from '../types';

interface Props {
  user: UserProfile;
  onBack: () => void;
}

const InterviewChat: React.FC<Props> = ({ user, onBack }) => {
  const [status, setStatus] = useState<'connecting' | 'active' | 'paused' | 'error'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [vad, setVad] = useState(50);
  const [aiTranscript, setAiTranscript] = useState("正在准备访谈提纲...");
  const [userTranscript, setUserTranscript] = useState("");
  const [contextImage, setContextImage] = useState<string | null>(null);

  const {
    connectionStatus: hookStatus,
    startSession: startAgentSession,
    stopSession: stopAgentSession,
    setMute: setAgentMute,
  } = useAgoraVoiceAgent({
    onTranscript: (text, role, isFinal) => {
      if (role === 'user') {
        setUserTranscript(text);
      } else {
        // Parse $$DISPLAY_PHOTO: keyword$$
        const photoMatch = text.match(/\$\$DISPLAY_PHOTO:\s*(.+?)\$\$/);
        if (photoMatch) {
          const keyword = photoMatch[1].trim();
          console.log("Displaying photo for:", keyword);
          setContextImage(`https://placehold.co/800x600/png?text=${keyword}`);
          // Clean text
          const cleanText = text.replace(photoMatch[0], '').trim();
          if (cleanText) setAiTranscript(cleanText);
        } else {
          setAiTranscript(text);
        }
      }
    },
    onAgentStateChange: (state) => {
      if (state === 'connecting') setStatus('connecting');
      else if (state === 'error') setStatus('error');
      else if (state === 'idle') setStatus('paused');
      else setStatus('active');
    }
  });

  const startSession = async () => {
    try {
      setStatus('connecting');

      const config = await getAgentConfig('interview', 'interview');
      if (!config) {
        setStatus('error');
        setAiTranscript("未找到访谈智能体配置");
        return;
      }

      // Construct dynamic system instruction based on user profile
      const userContext = `
        用户昵称：${user.nickname || '未设置'}
        年龄：${user.age || '未知'}
        出生地：${user.birthplace || '未知'}
        职业：${user.occupation || '未知'}
        方言偏好：${user.dialect || '普通话'}
      `;

      const uid = Math.floor(Math.random() * 100000) + 100000;
      const channelName = `interview_${uid}_${Date.now()}`;

      // Inject user context. 
      // Note: This appends to or overrides the agent's system prompt depending on backend implementation.
      // We send it to ensure the agent knows the user.
      const prompt = `
        当前采访对象资料：
        ${userContext}
        
        请在访谈中自然地使用 $$DISPLAY_PHOTO: keyword$$ 指令来展示照片。
      `;

      await startAgentSession(uid, channelName, {
        agentId: config.agent_id,
        systemPrompt: prompt
      });

    } catch (err) {
      console.error(err);
      setStatus('error');
      setAiTranscript("初始化失败");
    }
  };

  const togglePause = () => {
    if (status === 'active') {
      // Logic to pause (mute or stop)
      // Since useAgoraVoiceAgent doesn't have a 'pause' method that keeps session alive but stops processing,
      // we can just mute for now or stop session. 
      // The original implementation stopped audio sources but kept session open? 
      // Actually original toggled 'paused' state which blocked audio processing.
      // We can just mute the mic.
      setAgentMute(true);
      setStatus('paused');
    } else if (status === 'paused') {
      setAgentMute(false);
      setStatus('active');
    }
  };

  const handleEndInterview = () => {
    stopAgentSession();
    onBack();
  };

  useEffect(() => {
    startSession();
    return () => {
      stopAgentSession();
    };
  }, []);

  // Sync mute state
  const handleToggleMute = () => {
    const newMute = !isMuted;
    setIsMuted(newMute);
    setAgentMute(newMute);
  };

  return (
    <div className="h-full flex flex-col bg-background-dark text-white relative overflow-hidden font-sans">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-black pointer-events-none"></div>
      <div className={`absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none`}></div>

      {/* Header */}
      <header className="px-6 pt-8 pb-4 flex justify-between items-center z-20">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-red-500 animate-pulse' : status === 'paused' ? 'bg-yellow-500' : 'bg-slate-500'}`}></div>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {status === 'active' ? '录制中' : status === 'paused' ? '已暂停' : '离线'}
          </span>
        </div>
        {/* Top right is now empty or can hold a small logo/indicator */}
        <div className="text-xs text-slate-600 font-mono opacity-50">MEMO-REC-001</div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 relative z-10 gap-8">

        {/* Dynamic Context Image (From AI Knowledge Base) */}
        {contextImage ? (
          <div className="relative w-full max-w-xs aspect-[4/3] bg-black rounded-2xl border-2 border-white/20 overflow-hidden shadow-2xl animate-in zoom-in duration-700">
            <img src={contextImage} alt="Memory Context" className="w-full h-full object-cover opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-white text-sm">auto_awesome</span>
              <span className="text-xs text-white/90 font-medium tracking-wide">AI 联想记忆</span>
            </div>
          </div>
        ) : (
          <div className="relative w-full max-w-xs aspect-[4/3] bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center justify-center text-slate-500 gap-2">
            <span className="material-symbols-outlined text-4xl opacity-50">photo_library</span>
            <span className="text-xs">提及回忆场景自动展示照片</span>
          </div>
        )}

        {/* AI Transcription (The Interviewer) */}
        <div className="w-full max-w-sm text-center space-y-4">
          <p className="text-primary text-xs font-black uppercase tracking-[0.2em] mb-2">访谈提纲 / AI 提问</p>
          <h2 className="text-2xl md:text-3xl font-serif font-medium leading-relaxed text-slate-100 min-h-[100px] drop-shadow-lg">
            “{aiTranscript}”
          </h2>
        </div>

        {/* User Transcription (The Narrator) */}
        <div className={`w-full max-w-sm text-center transition-opacity duration-500 ${userTranscript ? 'opacity-100' : 'opacity-0'}`}>
          <div className="inline-block bg-white/10 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/5 shadow-inner">
            <p className="text-slate-300 text-lg font-light leading-relaxed">
              {userTranscript}
            </p>
          </div>
        </div>

      </main>

      {/* Footer Controls */}
      <footer className="px-6 pb-12 pt-6 z-20">
        {/* Visualizer (Simple) */}
        <div className="flex justify-center gap-1 h-8 mb-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`w-1.5 bg-primary/50 rounded-full ${status === 'active' && !isMuted ? 'animate-pulse' : ''}`} style={{ height: '100%', animationDelay: `${i * 0.1}s` }}></div>
          ))}
        </div>

        <div className="flex items-center justify-between max-w-xs mx-auto">
          {/* Left: Microphone / Mute */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleToggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all ${!isMuted ? 'bg-white/10 border-white/20 text-white' : 'bg-red-500/20 border-red-500/50 text-red-400'}`}
            >
              <span className="material-symbols-outlined text-2xl">
                {isMuted ? 'mic_off' : 'mic'}
              </span>
            </button>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              {isMuted ? '已静音' : '麦克风'}
            </span>
          </div>

          {/* Center: Main Pause/Resume Toggle */}
          <div className="flex flex-col items-center gap-2 -mt-8">
            <button
              onClick={togglePause}
              className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all border-4 active:scale-95 ${status === 'active'
                ? 'bg-primary border-primary/30 shadow-primary/40 text-white'
                : 'bg-yellow-500 border-yellow-500/30 shadow-yellow-500/40 text-black'
                }`}
            >
              <span className="material-symbols-outlined text-4xl font-bold">
                {status === 'active' ? 'pause' : 'play_arrow'}
              </span>
            </button>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              {status === 'active' ? '点击暂停' : '继续访谈'}
            </span>
          </div>

          {/* Right: End Interview (Previously Upload) */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleEndInterview}
              className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-white border border-red-400 shadow-lg shadow-red-900/50 active:scale-90 transition-all"
            >
              <span className="material-symbols-outlined text-2xl">stop</span>
            </button>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">结束</span>
          </div>
        </div>
        <div className="max-w-xs mx-auto mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">VAD 灵敏度</span>
            <span className="text-xs text-slate-200">{vad}</span>
          </div>
          <input type="range" min={0} max={100} value={vad} onChange={(e) => setVad(Number(e.target.value))} className="w-full" />
        </div>
      </footer>
    </div>
  );
};

// Audio Utils (Removed)
export default InterviewChat;
