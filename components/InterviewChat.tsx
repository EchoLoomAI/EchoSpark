
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, ChevronUp, User, Globe, Image as ImageIcon } from 'lucide-react';
import { useAgoraVoiceAgent, AgentState } from '../hooks/useAgoraVoiceAgent';
import { getAgentConfig } from '../services/agentService';
import { UserProfile } from '../types';
import { VoiceVisualizer } from './VoiceVisualizer';

interface Props {
  user: UserProfile;
  onBack: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

const InterviewChat: React.FC<Props> = ({ user, onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');

  // State
  const [isMuted, setIsMuted] = useState(false);
  const [contextImage, setContextImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState>('idle');

  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    connectionStatus,
    startSession: startAgentSession,
    stopSession: stopAgentSession,
    interrupt: interruptAgent,
    setMute: setAgentMute,
    volumeLevel,
    localVolumeLevel,
    getFrequencyBands
  } = useAgoraVoiceAgent({
    onTranscript: (text, role, isFinal) => {
      if (!text) return;
      let content = text;

      if (role === 'assistant') {
        // Parse $$DISPLAY_PHOTO: keyword$$
        const photoMatch = text.match(/\$\$DISPLAY_PHOTO:\s*(.+?)\$\$/);
        if (photoMatch) {
          const keyword = photoMatch[1].trim();
          console.log("Displaying photo for:", keyword);
          setContextImage(`https://placehold.co/800x600/png?text=${keyword}`);
          // Clean text
          content = text.replace(photoMatch[0], '').trim();
        }
      }

      setLiveTranscript(content);

      if (isFinal && content) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: role === 'assistant' ? 'ai' : 'user',
            text: content
          }
        ]);
        setLiveTranscript('');
      }
    },
    onAgentStateChange: (state) => {
      setAgentState(state);
    }
  });

  const startSession = async () => {
    try {
      if (connectionStatus !== 'idle' && connectionStatus !== 'error') return;

      setErrorMsg(null);

      // 调用 getAgentConfig，传入场景 'INTERVIEW'，agentType 'CONVERSATIONAL'
      // 同时传入 userType 'INTERVIEW_USER'（示例），与 CasualChat 保持一致的模式
      let config = await getAgentConfig('CONVERSATIONAL', 'INTERVIEW', 'INTERVIEW_USER');

      if (!config) {
        // 降级查找
        config = await getAgentConfig('CONVERSATIONAL', 'INTERVIEW');
      }

      if (!config) {
        setErrorMsg("未找到访谈智能体配置");
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
      setErrorMsg("初始化失败");
    }
  };

  const stopSession = () => {
    stopAgentSession();
  };

  const handleHangup = () => {
    stopSession();
    onBack();
  };

  const toggleMute = () => {
    const newMute = !isMuted;
    setIsMuted(newMute);
    setAgentMute(newMute);
  };

  const interrupt = async () => {
    await interruptAgent();
  };

  useEffect(() => {
    startSession();
    return () => {
      stopSession();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getStatusText = () => {
    if (connectionStatus === 'connecting') return '连接中...';
    if (connectionStatus === 'error') return '连接失败';

    switch (agentState) {
      case 'listening': return '我在听...';
      case 'thinking': return '回忆中...';
      case 'speaking': return '访谈中...';
      default: return '准备就绪';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-white relative overflow-hidden font-sans">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-0 pointer-events-none" />

      {/* Styles for Animations */}
      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes morph {
          0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
          50% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
          100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animate-morph {
          animation: morph 8s ease-in-out infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center relative w-full h-full overflow-hidden z-10">
        {/* Title */}
        <div className="ag-custom-gradient-title font-semibold text-2xl text-transparent leading-none md:mt-12 md:text-[40px] fade-in animate-in flex items-center justify-center gap-2 transition-[height,opacity] duration-500 bg-clip-text bg-gradient-to-r from-amber-200 via-orange-300 to-rose-300 h-20 min-h-20 opacity-100 z-10">
          <span>{getStatusText()}</span>
        </div>

        {/* Center Visual: Orb OR Image */}
        <div className="flex-1 flex items-center justify-center w-full transition-opacity duration-500">
          {contextImage ? (
            <div className="relative w-80 h-60 md:w-[600px] md:h-[450px] animate-in zoom-in duration-700 flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/20 to-purple-500/20 rounded-2xl blur-xl"></div>
              <img
                src={contextImage}
                alt="Context Memory"
                className="relative w-full h-full object-cover rounded-2xl border-2 border-white/10 shadow-2xl z-10"
              />
              <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                <ImageIcon className="w-4 h-4 text-amber-300" />
                <span className="text-xs text-amber-100 font-medium">AI 联想记忆</span>
              </div>
              {/* Overlay Visualizer when image is present */}
              <div className="absolute -bottom-16 left-0 right-0 h-12 flex items-center justify-center">
                <VoiceVisualizer
                  state={agentState}
                  barCount={20}
                  barColor="#fbbf24"
                  volume={(agentState === 'speaking' ? volumeLevel : localVolumeLevel) / 100}
                  getFrequencyBands={getFrequencyBands}
                  onInterrupt={interrupt}
                />
              </div>
            </div>
          ) : (
            <div className="relative w-72 h-72 flex items-center justify-center mb-12">
              <div className={`relative w-full h-full transition-all duration-500 ${agentState === 'speaking' ? 'scale-110' :
                agentState === 'listening' ? 'scale-105' :
                  'scale-100'
                }`}>
                {/* Background Glow Blobs - Warmer tones for Interview */}
                <div className="absolute top-0 -left-4 w-60 h-60 bg-amber-600 rounded-full mix-blend-screen filter blur-[50px] opacity-30 animate-blob"></div>
                <div className="absolute top-0 -right-4 w-60 h-60 bg-rose-600 rounded-full mix-blend-screen filter blur-[50px] opacity-30 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-10 w-60 h-60 bg-orange-600 rounded-full mix-blend-screen filter blur-[50px] opacity-30 animate-blob animation-delay-4000"></div>

                {/* Main Morphing Orb */}
                <div className="absolute inset-0 m-auto w-56 h-56 flex items-center justify-center">
                  {/* Core */}
                  <div className={`w-full h-full bg-gradient-to-br from-amber-100 via-orange-200 to-rose-200 animate-morph shadow-[0_0_50px_rgba(255,200,100,0.3)] transition-all duration-500 ${agentState === 'speaking' ? 'scale-110 opacity-100' :
                    agentState === 'thinking' ? 'scale-90 opacity-90 animate-pulse' :
                      agentState === 'listening' ? 'scale-105 opacity-100' :
                        'scale-95 opacity-80'
                    }`}></div>

                  {/* Visualizer Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <VoiceVisualizer
                      state={agentState}
                      barCount={6}
                      barColor="#d97706"
                      volume={(agentState === 'speaking' ? volumeLevel : localVolumeLevel) / 100}
                      getFrequencyBands={getFrequencyBands}
                    />
                  </div>

                  {/* Inner Rings/Detail */}
                  <div className="absolute inset-0 w-full h-full animate-morph border-2 border-white/50 opacity-50 scale-90 pointer-events-none"></div>
                  <div className="absolute inset-0 w-full h-full animate-morph border border-white/30 opacity-30 scale-110 animation-delay-2000 pointer-events-none"></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {liveTranscript && (
          <div className="mt-4 px-6 max-w-2xl text-center text-sm text-slate-100/90">
            {liveTranscript}
          </div>
        )}

        {/* Status Text (Error Only) */}
        <div className="text-center space-y-2 z-10 mb-24 absolute top-24 left-0 right-0 pointer-events-none">
          {errorMsg && (
            <div className="space-y-3 bg-red-500/90 p-4 rounded-xl backdrop-blur-md pointer-events-auto inline-block text-white shadow-lg">
              {errorMsg}
              <button onClick={startSession} className="block mt-2 text-xs underline">重试</button>
            </div>
          )}
        </div>

        {/* Transcript Overlay */}
        {showTranscript && (
          <div className="backdrop-blur-lg absolute top-0 right-0 bottom-24 left-0 h-full w-full bg-slate-950/80 z-20 animate-in fade-in">
            <div className="relative overflow-hidden h-full w-full rounded-md p-4">
              <div ref={scrollRef} className="h-full w-full overflow-y-auto scrollbar-hide space-y-4 px-4 pb-24">
                {messages.map((msg) => (
                  <div key={msg.id} className={`w-full flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2">
                      {msg.role === 'user' ? (
                        <>
                          <span className="text-slate-400 text-sm">你</span>
                          <User className="w-5 h-5 text-amber-400" />
                        </>
                      ) : (
                        <>
                          <Globe className="w-5 h-5 text-rose-400" />
                          <span className="text-slate-400 text-sm">访谈助手</span>
                        </>
                      )}
                    </div>
                    <div className={`rounded-md py-2 px-4 max-w-[80%] ${msg.role === 'user' ? 'bg-slate-800 text-white' : 'bg-slate-900 text-slate-200'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Control Bar */}
      <div className="absolute bottom-8 left-0 right-0 z-30 flex items-center justify-center pointer-events-none px-4">
        <div className="pointer-events-auto flex items-center justify-center gap-2 sm:gap-6 w-full max-w-lg">
          {/* Transcript Toggle */}
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className={`flex-shrink-0 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full transition-all duration-200 ${showTranscript ? 'bg-white text-slate-900' : 'bg-[#1e293b] text-white hover:bg-[#334155]'}`}
          >
            <svg width="24" height="24" viewBox="0 0 34 31" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 sm:w-6 sm:h-6">
              <path fillRule="evenodd" clipRule="evenodd" d="M6.66667 0C2.98477 0 0 2.98477 0 6.66667V18.3333C0 22.0152 2.98477 25 6.66667 25H9.5C9.9479 25 10.2796 25.4163 10.1795 25.8529L9 31L18.3722 25.4461C18.865 25.1541 19.4272 25 20 25H27.3333C31.0152 25 34 22.0152 34 18.3333V6.66667C34 2.98477 31.0152 0 27.3333 0H6.66667ZM4.15376 6.93202V9.85046H5.79454V11.3837H11.3356C10.9455 11.8544 10.5286 12.3251 10.0982 12.7958H4.00582V14.4904H9.70822V16.8036H7.67741V18.5117H11.4835V14.4904H16.1234V12.7958H12.1963C12.9763 11.8678 13.7026 10.886 14.3347 9.85046H15.962V6.93202H10.9455V6.13852H9.17025V6.93202H4.15376ZM14.2136 9.74287H5.90213V8.5997H14.2136V9.74287ZM20.2119 8.69384H18.4367V12.5941H22.6328V13.0917H17.4011V14.5845H18.9074C18.5173 15.1225 17.9794 15.5125 17.2531 15.7949V17.4895C18.0466 17.2071 18.7056 16.844 19.257 16.4002V18.3503H20.9516V16.8978H22.6462V18.5789H24.3677V16.8978H26.0623V18.3503H27.7568V16.4002C28.3083 16.844 28.9673 17.2071 29.7608 17.4895V15.7949C29.0345 15.5125 28.4965 15.1225 28.1065 14.5845H29.6128V13.0917H24.3811V12.5941H28.5772V8.69384H26.802V8.18278H29.3573V6.73028H26.802V6.24612H25.0536V6.73028H21.9603V6.24612H20.2119V6.73028H17.6566V8.18278H20.2119V8.69384ZM22.6462 15.4856H20.1312C20.333 15.2032 20.5078 14.9073 20.6557 14.5845H26.3581C26.5061 14.9073 26.6809 15.2032 26.8827 15.4856H24.3677V14.7863H22.6462V15.4856ZM26.8289 11.5181H20.185V11.1281H26.8289V11.5181ZM26.8289 10.1463H20.185V9.74287H26.8289V10.1463ZM25.0536 8.69384H21.9603V8.18278H25.0536V8.69384Z" fill="currentColor" />
            </svg>
          </button>

          {/* Center Pill: Mic & Visualizer */}
          <div className="relative flex-1 min-w-0 h-16 sm:h-20 px-3 sm:px-6 rounded-full bg-slate-900/90 flex items-center justify-between gap-2 sm:gap-6 border border-slate-700/50 shadow-[0_0_20px_rgba(0,0,0,0.3)] backdrop-blur-md overflow-hidden">
            {/* Tech Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 pointer-events-none" />

            {/* Mic Toggle */}
            <button
              onClick={toggleMute}
              className={`relative z-10 flex-shrink-0 flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all duration-300 ${isMuted ? 'bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-slate-800 text-white hover:bg-slate-700 shadow-inner border border-slate-700'}`}
            >
              {isMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Visualizer or Interrupt */}
            <div className="flex-1 h-10 flex items-center justify-center relative z-10 min-w-0 overflow-hidden">
              <VoiceVisualizer
                state={agentState}
                barCount={12}
                barColor={isMuted ? '#ef4444' : '#fbbf24'}
                onInterrupt={interrupt}
                getFrequencyBands={getFrequencyBands}
              />
            </div>

            {/* Device Switch Chevron (Placeholder for now) */}
            <button className="relative z-10 flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full text-slate-400 hover:text-white transition-colors hover:bg-white/5">
              <ChevronUp className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          {/* End Call */}
          <button
            onClick={handleHangup}
            className="flex-shrink-0 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#1e293b] text-red-500 hover:bg-[#334155] transition-all duration-200 border border-slate-700/50"
          >
            <X className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InterviewChat;
