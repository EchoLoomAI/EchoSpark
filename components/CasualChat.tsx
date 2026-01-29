
import React, { useState, useEffect, useRef } from 'react';
import { useVoiceAgent } from '../hooks/useVoiceAgent';
import { EMessageType, ETurnStatus } from '../conversational-ai-api';
import { Mic, MicOff, PhoneOff, X, Globe, User, Settings2 } from 'lucide-react';

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

  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    startSession,
    stopSession,
    interrupt,
    toggleMute,
    connectionStatus,
    agentState,
    isMuted
  } = useVoiceAgent({
    onMessage: (items) => {
      const userItems = items.filter((item: any) => {
        const metadata = item.metadata as | { object?: EMessageType } | null | undefined;
        return metadata?.object === EMessageType.USER_TRANSCRIPTION;
      });
      const agentItems = items.filter((item: any) => {
        const metadata = item.metadata as | { object?: EMessageType } | null | undefined;
        if (metadata && typeof metadata.object !== 'undefined') {
          return metadata.object === EMessageType.AGENT_TRANSCRIPTION;
        }
        return true;
      });

      const latestUser = userItems[userItems.length - 1];
      const latestAgent = agentItems[agentItems.length - 1];

      if (latestUser) {
        if (latestUser.status === ETurnStatus.IN_PROGRESS) {
          setCurrentUserChunk(latestUser.text);
          // Auto-interrupt agent when user starts speaking
          if (agentState === 'speaking') {
            interrupt();
          }
        } else {
          setCurrentUserChunk("");
          setMessages(prev => {
            const id = `user-${latestUser.turn_id}`;
            if (prev.some(m => m.id === id)) return prev;
            return [...prev, { id, role: 'user', text: latestUser.text, isFinal: true }];
          });
        }
      }

      if (latestAgent) {
        if (latestAgent.status === ETurnStatus.IN_PROGRESS) {
          setCurrentAiChunk(latestAgent.text);
        } else {
          setCurrentAiChunk("");
          setMessages(prev => {
            const id = `ai-${latestAgent.turn_id}`;
            if (prev.some(m => m.id === id)) return prev;
            return [...prev, { id, role: 'ai', text: latestAgent.text, isFinal: true }];
          });
        }
      }
    },
    onAgentStateChange: (state) => {
      // console.log("Agent state:", state);
    }
  });

  useEffect(() => {
    startSession("你是EchoSpark的智能助手，请用简短、亲切的语言与用户交谈。");
    return () => {
      stopSession();
    };
  }, [startSession, stopSession]);

  const handleHangup = () => {
    stopSession();
    onBack();
  };

  // Orb Animation based on agentState
  const getOrbStyle = () => {
    switch (agentState) {
      case 'listening':
        return 'animate-pulse scale-110 border-blue-400 bg-blue-500/20 shadow-[0_0_60px_rgba(59,130,246,0.6)]';
      case 'thinking':
        return 'animate-bounce scale-100 border-yellow-400 bg-yellow-500/20 shadow-[0_0_40px_rgba(234,179,8,0.6)]';
      case 'speaking':
        return 'animate-[ping_2s_ease-in-out_infinite] scale-125 border-green-400 bg-green-500/30 shadow-[0_0_80px_rgba(34,197,94,0.6)]';
      default: // idle
        return 'scale-100 border-gray-400 bg-gray-500/10 shadow-[0_0_30px_rgba(107,114,128,0.4)]';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden relative">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-0 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between p-4 px-6 border-b border-slate-800/50 bg-slate-900/30 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : connectionStatus === 'error' ? 'bg-red-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`} />
          <h2 className="text-lg font-semibold tracking-wide text-slate-200">EchoSpark</h2>
          {connectionStatus === 'error' && (
            <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded border border-red-500/20">Connection Failed</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSubtitles(!showSubtitles)}
            className={`p-2 rounded-full transition-colors ${showSubtitles ? 'bg-slate-800 text-blue-400' : 'hover:bg-slate-800 text-slate-400'}`}
            title="Toggle Subtitles"
          >
            <Settings2 className="w-5 h-5" />
          </button>
          <button onClick={handleHangup} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content - Orb & Visualization */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 w-full max-w-4xl mx-auto">

        {/* Status Text (Optional, minimalistic) */}
        <div className="absolute top-8 text-xs font-mono text-slate-500 tracking-widest uppercase opacity-70">
          {agentState}
        </div>

        {/* The Orb */}
        <div className="relative w-72 h-72 flex items-center justify-center">
          {/* Outer Glow / Ripple */}
          <div className={`absolute inset-0 rounded-full border-2 transition-all duration-700 opacity-60 ${getOrbStyle()}`} />

          {/* Inner Core */}
          <div className={`w-40 h-40 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-inner border border-white/10 backdrop-blur-3xl transition-all duration-500 ${agentState === 'speaking' ? 'scale-110 brightness-110' : 'scale-100 brightness-100'}`} />

          {/* Center Icon/Indicator (Optional) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {isMuted && <MicOff className="w-12 h-12 text-white/50" />}
          </div>
        </div>

        {/* Subtitles Overlay */}
        {showSubtitles && (
          <div className="absolute bottom-12 w-full px-8 flex flex-col items-center gap-6 text-center">
            {currentUserChunk && (
              <div className="bg-slate-900/60 px-6 py-3 rounded-2xl backdrop-blur-md border border-slate-700/50 max-w-3xl animate-in fade-in slide-in-from-bottom-4 shadow-xl">
                <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-center gap-1 uppercase tracking-wider font-bold">
                  <User className="w-3 h-3" /> You
                </div>
                <p className="text-xl text-slate-100 font-light leading-relaxed">{currentUserChunk}</p>
              </div>
            )}

            {(currentAiChunk || agentState === 'speaking') && (
              <div className="bg-indigo-950/60 px-6 py-3 rounded-2xl backdrop-blur-md border border-indigo-500/30 max-w-3xl animate-in fade-in slide-in-from-bottom-4 shadow-xl shadow-indigo-500/10">
                <div className="text-[10px] text-indigo-300 mb-1 flex items-center justify-center gap-1 uppercase tracking-wider font-bold">
                  <Globe className="w-3 h-3" /> EchoSpark
                </div>
                <p className="text-xl text-indigo-50 font-light leading-relaxed">{currentAiChunk || "..."}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="p-8 pb-12 flex justify-center items-center gap-10 bg-gradient-to-t from-black via-slate-950 to-transparent z-20">
        <button
          onClick={toggleMute}
          className={`p-5 rounded-full transition-all duration-300 transform hover:scale-105 ${isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 shadow-lg'}`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
        </button>

        <button
          onClick={handleHangup}
          className="p-6 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-[0_0_30px_rgba(220,38,38,0.5)] transform hover:scale-110 transition-all duration-300 ring-4 ring-red-900/30"
          title="End Conversation"
        >
          <PhoneOff className="w-9 h-9" />
        </button>
      </div>
    </div>
  );
};

export default CasualChat;
