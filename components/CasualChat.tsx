
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, X, Settings2 } from 'lucide-react';
import { useAgoraVoiceAgent } from '../hooks/useAgoraVoiceAgent';
import { getAgentConfig } from '../services/agentService';

interface Props {
  onBack: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  isFinal: boolean;
}

const CasualChat: React.FC<Props> = ({ onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentAiChunk, setCurrentAiChunk] = useState("");
  const [currentUserChunk, setCurrentUserChunk] = useState("");
  const [showSubtitles, setShowSubtitles] = useState(true);

  // Agent State
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Helper to map hook state to component state
  const [agentState, setAgentState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');

  const {
    connectionStatus: hookStatus,
    startSession: startAgentSession,
    stopSession: stopAgentSession,
    interrupt: interruptAgent,
    setMute: setAgentMute,
  } = useAgoraVoiceAgent({
    onTranscript: (text, role, isFinal) => {
      if (role === 'user') {
        if (isFinal) {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text, isFinal: true }]);
          setCurrentUserChunk("");
        } else {
          setCurrentUserChunk(text);
        }
      } else {
        if (isFinal) {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text, isFinal: true }]);
          setCurrentAiChunk("");
        } else {
          setCurrentAiChunk(text);
        }
      }
    },
    onAgentStateChange: (state) => {
      if (state === 'listening' || state === 'thinking' || state === 'speaking') {
        setAgentState(state);
      } else {
        setAgentState('idle');
      }
    }
  });

  const connectionStatus = hookStatus === 'connecting' ? 'connecting' :
    hookStatus === 'error' ? 'error' :
      (hookStatus === 'idle' ? 'idle' : 'connected');

  const scrollRef = useRef<HTMLDivElement>(null);

  const startSession = async () => {
    try {
      if (hookStatus !== 'idle' && hookStatus !== 'error') return;

      setErrorMsg(null);

      const config = await getAgentConfig('casual', 'casual');
      if (!config) {
        setErrorMsg("未找到聊天智能体配置");
        return;
      }

      const uid = Math.floor(Math.random() * 100000) + 100000;
      const channelName = `casual_${uid}_${Date.now()}`;

      await startAgentSession(uid, channelName, { agentId: config.agent_id });

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
  }, [messages, currentAiChunk, currentUserChunk]);

  // Orb Animation
  const getOrbStyle = () => {
    switch (agentState) {
      case 'speaking':
        return 'scale-110 shadow-[0_0_80px_rgba(59,130,246,0.6)] bg-blue-500';
      case 'thinking':
        return 'scale-90 shadow-[0_0_40px_rgba(234,179,8,0.4)] bg-yellow-400 animate-pulse';
      case 'listening':
        return 'scale-100 shadow-[0_0_60px_rgba(59,130,246,0.3)] bg-blue-400';
      default:
        return 'scale-95 opacity-50 bg-slate-500';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-white relative overflow-hidden font-sans">
      {/* Header */}
      <header className="flex-shrink-0 px-6 pt-6 flex justify-between items-center z-20">
        <button onClick={handleHangup} className="p-2 rounded-full bg-slate-800/50 hover:bg-slate-800 transition-colors">
          <X className="w-6 h-6 text-slate-300" />
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50">
          <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
          <span className="text-xs font-medium text-slate-300">
            {connectionStatus === 'connected' ? '已连接' : connectionStatus === 'connecting' ? '连接中' : '离线'}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center relative w-full h-full">
        {/* Orb */}
        <div className="relative mb-12">
          <div className={`w-48 h-48 rounded-full transition-all duration-500 ${getOrbStyle()} blur-sm`}></div>
          <div className={`absolute inset-0 w-48 h-48 rounded-full transition-all duration-500 ${getOrbStyle()} mix-blend-overlay`}></div>

          {/* Simple Ripple if speaking */}
          {agentState === 'speaking' && (
            <>
              <div className="absolute inset-0 w-48 h-48 rounded-full border border-blue-400/30 animate-ping"></div>
              <div className="absolute inset-0 w-48 h-48 rounded-full border border-blue-400/20 animate-ping animation-delay-500"></div>
            </>
          )}
        </div>

        {/* Subtitles */}
        {showSubtitles && (
          <div className="absolute bottom-32 left-0 right-0 px-6 text-center space-y-4 max-h-48 overflow-y-auto scrollbar-hide" ref={scrollRef}>
            {messages.map((msg) => (
              <div key={msg.id} className={`text-lg font-medium ${msg.role === 'ai' ? 'text-blue-200' : 'text-slate-300'}`}>
                {msg.text}
              </div>
            ))}
            {currentUserChunk && <div className="text-lg font-medium text-slate-300 opacity-70">{currentUserChunk}</div>}
            {currentAiChunk && <div className="text-lg font-medium text-blue-200 opacity-70">{currentAiChunk}</div>}
          </div>
        )}
      </main>

      {/* Control Bar */}
      <div className="absolute bottom-8 left-0 right-0 z-30 flex items-center justify-center gap-6">
        <button
          onClick={() => setShowSubtitles(!showSubtitles)}
          className={`p-4 rounded-full transition-all ${showSubtitles ? 'bg-slate-700 text-white' : 'bg-slate-800/50 text-slate-400'}`}
        >
          <Settings2 className="w-6 h-6" />
        </button>

        <button
          onClick={toggleMute}
          className={`p-6 rounded-full transition-all ${isMuted ? 'bg-red-500/20 text-red-500 border border-red-500/50' : 'bg-white text-slate-900 shadow-lg shadow-blue-900/20'}`}
        >
          {isMuted ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
        </button>

        <button
          onClick={handleHangup}
          className="p-4 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-colors"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>

      {/* Error Toast */}
      {errorMsg && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-lg text-sm shadow-lg backdrop-blur-sm">
          {errorMsg}
        </div>
      )}
    </div>
  );
};

// Audio Utils (Removed)
export default CasualChat;
