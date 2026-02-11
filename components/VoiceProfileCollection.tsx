
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile } from '../types';
import {
  User,
  Globe,
  Mic,
  MicOff,
  X,
  ChevronUp
} from 'lucide-react';
import { VoiceVisualizer } from './VoiceVisualizer';
import { useAgoraVoiceAgent, AgentState } from '../hooks/useAgoraVoiceAgent';
import { genUserId } from '@/lib/utils';
import { matchAgent } from '../services/agentService';

interface Props {
  onComplete: (profile: Partial<UserProfile>) => void;
}

interface ChatMessage {
  id: string;
  role: 'ai' | 'user';
  text: string;
}

const VoiceProfileCollection: React.FC<Props> = ({ onComplete }) => {
  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);

  const [collectedData, setCollectedData] = useState<Partial<UserProfile>>({});
  const [mode, setMode] = useState<'voice' | 'manual'>('voice');
  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState<Partial<UserProfile>>({});

  // Voice Agent State
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [timeMode, setTimeMode] = useState<'specific' | 'approx'>('specific');

  const scrollRef = useRef<HTMLDivElement>(null);

  // Use the Agora Voice Agent Hook
  const {
    connectionStatus,
    volumeLevel,
    localVolumeLevel,
    getFrequencyBands,
    startSession: startAgoraSession,
    stopSession: stopAgoraSession,
    interrupt: agoraInterrupt,
    sendText: agoraSendText,
    setMute
  } = useAgoraVoiceAgent({
    onTranscript: (text, role, isFinal) => {
      // Parse PROFILE_UPDATE from assistant messages
      if (role === 'assistant') {
        const globalRegex = /\$\$PROFILE_UPDATE\$\$ (\{.*?\}) \$\$/g;
        let match;
        let cleanText = text;

        while ((match = globalRegex.exec(text)) !== null) {
          try {
            const data = JSON.parse(match[1]);
            if (data.key && data.value !== undefined) {
              setCollectedData((prev) => {
                if (prev[data.key as keyof UserProfile] === data.value) return prev;
                return { ...prev, [data.key]: data.value };
              });
            }
          } catch (e) {
            console.error('JSON parse error', e);
          }
        }
        cleanText = cleanText.replace(globalRegex, '').trim();

        if (cleanText) {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: cleanText }]);
        }
      } else {
        if (isFinal) {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text }]);
        }
      }
    },
    onAgentStateChange: (state) => {
      setAgentState(state);
    }
  });

  const startSession = async () => {
    // Use stored string UID if available (Standard Mode), otherwise generate random number (Guest Mode)
    const uidStr = localStorage.getItem('uid');
    const uid = uidStr || genUserId();

    // Ensure channel name is deterministic based on scenario and user ID
    const scenarioName = 'voice-profile';
    const channelName = `${scenarioName}-${uid}`;

    // Protocol instruction to ensure the agent outputs data in the format frontend expects
    const protocolInstruction = `
      【重要数据记录协议】：
      每当获得用户的【昵称、年龄、性别、出生地、职业、常用方言】信息时，请务必在回复中包含以下格式的JSON数据（直接输出，不要使用markdown）：
      $$PROFILE_UPDATE$$ {"key": "字段名", "value": "值"} $$
      
      支持的key包括：nickname, age (数字), gender (男/女), birthplace, occupation, dialect。
      例如：$$PROFILE_UPDATE$$ {"key": "nickname", "value": "张大爷"} $$
    `;

    // Try to match a dynamic agent from backend
    let agentId: string | undefined;
    let finalSystemPrompt = protocolInstruction;
    let agentChannel = channelName;
    let agentAppId: string | undefined;
    let agentAppCert: string | undefined;
    let agentProperties: any | undefined;
    let agentModelId: string | undefined;

    try {
      const agent = await matchAgent({
        userId: uid.toString(),
        scenario: 'PROFILING',
        agentType: 'CONVERSATIONAL',
        userType: 'free' // Default or fetch from user context
      });

      if (agent) {
        agentId = agent.id;
        agentModelId = (agent as any).model_id || agent.modelId;
        // Robustly extract properties: try top-level properties first, then config.properties
        agentProperties = (agent as any).properties || agent.config?.properties;
        console.log('[VoiceProfile] Matched Agent:', agent.name);
        console.log('[VoiceProfile] Extracted Properties:', agentProperties ? Object.keys(agentProperties) : 'None');

        // Extract config for token generation
        // channel and numericUid corresponds to config object's channel and agent_rtc_uid
        // but for token generation we use the channel from config and the User's UID (uid)
        if (agent.config?.properties?.channel) {
          agentChannel = agent.config.properties.channel;
        }

        // Extract AppID and AppCert from common
        if (agent.config?.properties?.common) {
          agentAppId = agent.config.properties.common.agora_app_id;
          agentAppCert = agent.config.properties.common.agora_app_certificate;
        }

        // Extract system prompt from agent config
        // Assuming structure: agent.config.properties.llm.system_messages[0].content
        const messages = agent.config?.properties?.llm?.system_messages;
        if (Array.isArray(messages) && messages.length > 0 && messages[0].content) {
          const fetchedPrompt = messages[0].content;
          if (!fetchedPrompt.includes('$$PROFILE_UPDATE$$')) {
            finalSystemPrompt = `${fetchedPrompt}\n\n${protocolInstruction}`;
          } else {
            finalSystemPrompt = fetchedPrompt;
          }
        }
      }
    } catch (err) {
      console.warn('[VoiceProfile] Failed to match agent, using default fallback', err);
    }

    // Generate Token using the extracted credentials if available
    // We need to pass these to startAgoraSession -> useAgoraVoiceAgent -> rtcHelper.retrieveToken
    // But useAgoraVoiceAgent/rtcHelper might not accept custom appId/cert directly in `options`.
    // However, rtcHelper.retrieveToken calls `/v1/token`.
    // We can pass `appId` and `appCertificate` in the `options` object if we modify the hook,
    // OR we can rely on the fact that `matchAgent` returned the config, so we can manualy call token API here
    // and pass the token to `startAgoraSession`.
    // Let's assume `startAgoraSession` can accept a pre-generated token or we modify the hook to accept custom credentials.
    // Given the constraints, passing `token` to `startAgoraSession` is cleanest if supported.
    // Checking useAgoraVoiceAgent: startSession(uid, channel, options). Options can have `token`.

    let token: string | undefined;
    let appId: string | undefined;

    if (agentAppId && agentAppCert) {
      try {
        // Manually call BFF token endpoint with custom credentials
        const authToken = localStorage.getItem('token');
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/v1/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
          },
          body: JSON.stringify({
            channel: agentChannel,
            uid: uid,
            appId: agentAppId,
            appCertificate: agentAppCert
          })
        });
        const data = await res.json();
        if (data.code === 0 && data.data?.token) {
          token = data.data.token;
          appId = data.data.appId;
          console.log('[VoiceProfile] Generated custom token using agent config');
        }
      } catch (e) {
        console.error('[VoiceProfile] Failed to generate custom token', e);
      }
    }

    // Pass scenario='profile' to trigger dynamic matching in the hook
    // Cast to any to bypass strict type check until hook types are updated
    await startAgoraSession(uid, agentChannel, {
      systemPrompt: finalSystemPrompt,
      // @ts-ignore
      scenario: 'profile',
      agentId: agentId,
      token: token, // Pass pre-generated token if available
      appId: appId,  // Pass appId if available
      properties: agentProperties, // Pass full properties to hook
      modelId: agentModelId // Pass modelId to ensure correct LLM config resolution
    });
  };

  const stopSession = () => {
    stopAgoraSession();
  };

  const interrupt = async () => {
    await agoraInterrupt();
  };

  const sendText = async (text: string) => {
    await agoraSendText(text);
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    setMute(newMutedState);
  };

  // Lifecycle
  useEffect(() => {
    if (mode === 'voice') {
      startSession();
    } else {
      stopSession();
    }
    return () => {
      stopSession();
    };
  }, [mode]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Sync collected data
  useEffect(() => {
    setFormData(prev => ({ ...prev, ...collectedData }));
  }, [collectedData]);

  // Manual Mode Logic
  const manualSteps = [
    { key: 'nickname' as const, title: '怎么称呼您？', description: '请填写您的具体称呼，例如“谢爷爷”或“李奶奶”。' },
    { key: 'age' as const, title: '您的年龄是？', description: '请输入您的周岁年龄，我们将自动推算出生年份。' },
    { key: 'birthTime' as const, title: '您的出生时间？', description: '请完善您的出生日期和时间。' },
    { key: 'birthplace' as const, title: '您是哪里人？', description: '请填写您的具体家乡或出生地。' },
    { key: 'occupation' as const, title: '您退休前的职业是？', description: '填写您退休前的主要工作。' },
    { key: 'dialect' as const, title: '您的常用语言？', description: '选择您平时最常使用的语言或方言。' },
  ];

  const goNextStep = () => {
    if (stepIndex < manualSteps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onComplete(formData);
    }
  };

  const goPrevStep = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  };

  const getStatusText = () => {
    if (connectionStatus === 'connecting') return '加载中...';
    if (connectionStatus === 'error') return '连接失败';
    if (connectionStatus === 'idle') return '准备就绪';

    switch (agentState) {
      case 'listening': return '灵犀听着呢';
      case 'thinking': return '我在思考...';
      case 'speaking': return '我在说话...';
      default: return '灵犀听着呢';
    }
  };

  const fields = [
    { key: 'nickname', label: '昵称' },
    { key: 'age', label: '年龄' },
    { key: 'birthplace', label: '出生地' },
    { key: 'birthTime', label: '出生时间' },
    { key: 'occupation', label: '职业' },
    { key: 'dialect', label: '语言' }
  ];

  return (
    <div className="h-full flex flex-col bg-slate-950 text-white relative overflow-hidden font-sans">
      {/* Background Gradient for Voice Mode */}
      {mode === 'voice' && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-0 pointer-events-none" />
      )}

      {/* Header */}
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
        @keyframes music-bar {
          0%, 100% { height: 8px; }
          50% { height: 24px; }
        }
        .animate-music-bar {
          animation: music-bar 0.5s ease-in-out infinite alternate;
        }
      `}</style>
      <header className="flex-shrink-0 px-6 pt-10 pb-6 flex justify-end items-center z-20">
        <div className="flex bg-slate-900/80 rounded-xl p-1 border border-slate-800">
          <button
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${mode === 'voice' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            onClick={() => setMode('voice')}
          >
            语音
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${mode === 'manual' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            onClick={() => setMode('manual')}
          >
            手动
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto relative z-10 flex flex-col">
        {/* Progress Chips */}
        <div className="absolute top-0 left-0 right-0 z-20 px-6 pointer-events-none">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2 pointer-events-auto justify-center">
            {fields.map((field) => {
              const isCollected = !!(collectedData as any)[field.key];
              if (!isCollected) return null;
              return (
                <div key={field.key} className="bg-green-500/20 backdrop-blur-md px-3 py-1 rounded-full border border-green-500/30 flex items-center gap-1.5 text-xs font-bold text-green-300 shadow-sm whitespace-nowrap animate-in fade-in zoom-in duration-300">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  {field.label}
                </div>
              );
            })}
          </div>
        </div>

        {mode === 'voice' ? (
          <div className="flex-1 flex flex-col items-center relative w-full h-full overflow-hidden">
            {/* Title */}
            <div className="ag-custom-gradient-title font-semibold text-2xl text-transparent leading-none md:mt-12 md:text-[40px] fade-in animate-in flex items-center justify-center gap-2 transition-[height,opacity] duration-500 bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 h-20 min-h-20 opacity-100 z-10">
              <span>{getStatusText()}</span>
            </div>

            {/* The Orb - ChatGPT Style with Visualizer */}
            <div className="flex-1 flex items-center justify-center w-full transition-opacity duration-500">
              <div className="relative w-72 h-72 flex items-center justify-center mb-12">
                <div className={`relative w-full h-full transition-all duration-500 ${agentState === 'speaking' ? 'scale-110' :
                  agentState === 'listening' ? 'scale-105' :
                    'scale-100'
                  }`}>
                  {/* Background Glow Blobs */}
                  <div className="absolute top-0 -left-4 w-60 h-60 bg-purple-600 rounded-full mix-blend-screen filter blur-[50px] opacity-40 animate-blob"></div>
                  <div className="absolute top-0 -right-4 w-60 h-60 bg-cyan-600 rounded-full mix-blend-screen filter blur-[50px] opacity-40 animate-blob animation-delay-2000"></div>
                  <div className="absolute -bottom-8 left-10 w-60 h-60 bg-blue-600 rounded-full mix-blend-screen filter blur-[50px] opacity-40 animate-blob animation-delay-4000"></div>

                  {/* Main Morphing Orb */}
                  <div className="absolute inset-0 m-auto w-56 h-56 flex items-center justify-center">
                    {/* Core */}
                    <div className={`w-full h-full bg-gradient-to-br from-white via-blue-100 to-indigo-200 animate-morph shadow-[0_0_50px_rgba(255,255,255,0.4)] transition-all duration-500 ${agentState === 'speaking' ? 'scale-110 opacity-100' :
                      agentState === 'thinking' ? 'scale-90 opacity-90 animate-pulse' :
                        agentState === 'listening' ? 'scale-105 opacity-100' :
                          'scale-95 opacity-80'
                      }`}></div>

                    {/* Visualizer Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <VoiceVisualizer
                        state={agentState}
                        barCount={6}
                        barColor="#3b82f6"
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
            </div>

            {/* Status Text (Error Only) */}
            <div className="text-center space-y-2 z-10 mb-24 absolute top-24 left-0 right-0 pointer-events-none">
              {connectionStatus === 'error' && (
                <div className="space-y-3 bg-black/50 p-4 rounded-xl backdrop-blur-md pointer-events-auto inline-block">
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => startSession()}
                      className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-200 border border-red-500/30 text-sm hover:bg-red-500/30 active:scale-95 transition-all"
                    >
                      重试连接
                    </button>
                    <button
                      onClick={() => setMode('manual')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800/80 text-slate-200 border border-slate-700 text-sm hover:bg-slate-800 active:scale-95 transition-all"
                    >
                      切换到手动模式
                    </button>
                  </div>
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
                              <User className="w-5 h-5 text-blue-400" />
                            </>
                          ) : (
                            <>
                              <Globe className="w-5 h-5 text-purple-400" />
                              <span className="text-slate-400 text-sm">Agent</span>
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

            {/* Control Bar */}
            <div className="absolute bottom-8 left-0 right-0 z-30 flex items-center justify-center gap-6 pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-6">
                {/* Transcript Toggle */}
                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className={`flex items-center justify-center w-14 h-14 rounded-full transition-all duration-200 ${showTranscript ? 'bg-white text-slate-900' : 'bg-[#1e293b] text-white hover:bg-[#334155]'}`}
                >
                  <svg width="24" height="24" viewBox="0 0 34 31" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="subtitle-cn-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#00C2FF" />
                        <stop offset="64.5%" stopColor="#00FFA2" />
                        <stop offset="98.5%" stopColor="#FFFFFF" />
                      </linearGradient>
                    </defs>
                    <path fillRule="evenodd" clipRule="evenodd" d="M6.66667 0C2.98477 0 0 2.98477 0 6.66667V18.3333C0 22.0152 2.98477 25 6.66667 25H9.5C9.9479 25 10.2796 25.4163 10.1795 25.8529L9 31L18.3722 25.4461C18.865 25.1541 19.4272 25 20 25H27.3333C31.0152 25 34 22.0152 34 18.3333V6.66667C34 2.98477 31.0152 0 27.3333 0H6.66667ZM4.15376 6.93202V9.85046H5.79454V11.3837H11.3356C10.9455 11.8544 10.5286 12.3251 10.0982 12.7958H4.00582V14.4904H9.70822V16.8036H7.67741V18.5117H11.4835V14.4904H16.1234V12.7958H12.1963C12.9763 11.8678 13.7026 10.886 14.3347 9.85046H15.962V6.93202H10.9455V6.13852H9.17025V6.93202H4.15376ZM14.2136 9.74287H5.90213V8.5997H14.2136V9.74287ZM20.2119 8.69384H18.4367V12.5941H22.6328V13.0917H17.4011V14.5845H18.9074C18.5173 15.1225 17.9794 15.5125 17.2531 15.7949V17.4895C18.0466 17.2071 18.7056 16.844 19.257 16.4002V18.3503H20.9516V16.8978H22.6462V18.5789H24.3677V16.8978H26.0623V18.3503H27.7568V16.4002C28.3083 16.844 28.9673 17.2071 29.7608 17.4895V15.7949C29.0345 15.5125 28.4965 15.1225 28.1065 14.5845H29.6128V13.0917H24.3811V12.5941H28.5772V8.69384H26.802V8.18278H29.3573V6.73028H26.802V6.24612H25.0536V6.73028H21.9603V6.24612H20.2119V6.73028H17.6566V8.18278H20.2119V8.69384ZM22.6462 15.4856H20.1312C20.333 15.2032 20.5078 14.9073 20.6557 14.5845H26.3581C26.5061 14.9073 26.6809 15.2032 26.8827 15.4856H24.3677V14.7863H22.6462V15.4856ZM26.8289 11.5181H20.185V11.1281H26.8289V11.5181ZM26.8289 10.1463H20.185V9.74287H26.8289V10.1463ZM25.0536 8.69384H21.9603V8.18278H25.0536V8.69384Z" fill="currentColor" />
                  </svg>
                </button>

                {/* Center Pill: Mic & Visualizer */}
                <div className="h-16 rounded-full bg-[#1e293b] flex items-center px-2 gap-4 border border-slate-700/50 shadow-lg backdrop-blur-sm">
                  {/* Mic Toggle */}
                  <button
                    onClick={toggleMute}
                    className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${isMuted ? 'text-red-500' : 'text-white hover:text-blue-400'}`}
                  >
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </button>

                  {/* Visualizer or Interrupt */}
                  <VoiceVisualizer
                    state={agentState}
                    barColor={isMuted ? '#ef4444' : '#3b82f6'}
                    onInterrupt={interrupt}
                    getFrequencyBands={getFrequencyBands}
                  />

                  {/* Device Switch Chevron */}
                  <button className="flex items-center justify-center w-10 h-10 rounded-full text-slate-400 hover:text-white transition-colors">
                    <ChevronUp className="w-6 h-6" />
                  </button>
                </div>

                {/* End Call */}
                <button
                  onClick={() => onComplete(formData)}
                  className="flex items-center justify-center w-14 h-14 rounded-full bg-[#1e293b] text-red-500 hover:bg-[#334155] transition-all duration-200 border border-slate-700/50"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full p-6 pb-48 space-y-6 overflow-y-auto">
            <div>
              <div className="text-sm text-slate-300 mb-2">第 {stepIndex + 1} / {manualSteps.length} 步</div>
              <div className="text-3xl font-black text-white mb-2">{manualSteps[stepIndex].title}</div>
              <div className="text-lg text-slate-200">{manualSteps[stepIndex].description}</div>
            </div>
            <div className="space-y-5">
              {manualSteps[stepIndex].key === 'nickname' && (
                <div className="space-y-4">
                  <div>
                    <div className="text-base text-slate-300 mb-2">请填写您的具体称呼</div>
                    <input
                      type="text"
                      value={formData.nickname ?? ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                      placeholder="例如：谢爷爷、张奶奶"
                      className="w-full h-14 rounded-2xl px-4 text-2xl font-bold text-slate-900 bg-white placeholder:text-slate-400"
                    />
                  </div>
                </div>
              )}
              {manualSteps[stepIndex].key === 'age' && (
                <div className="space-y-4">
                  <div>
                    <div className="text-base text-slate-300 mb-2">请输入您的周岁年龄</div>
                    <input
                      type="number"
                      value={formData.age ?? ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, age: parseInt(e.target.value) || undefined }))}
                      placeholder="例如：75"
                      className="w-full h-14 rounded-2xl px-4 text-2xl font-bold text-slate-900 bg-white placeholder:text-slate-400"
                      autoFocus
                    />
                  </div>
                </div>
              )}
              {manualSteps[stepIndex].key === 'birthTime' && (
                <div className="space-y-6">
                  {/* Year Display */}
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="text-sm text-slate-400 mb-1">出生年份 (由年龄推算)</div>
                    <div className="text-2xl font-bold text-white">
                      {formData.age ? new Date().getFullYear() - formData.age : '未填写年龄'} 年
                    </div>
                  </div>

                  {/* Date Input */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-base text-slate-300 mb-2">月份</div>
                      <select
                        className="w-full h-14 rounded-2xl px-4 text-xl font-bold text-slate-900 bg-white appearance-none"
                        value={formData.birthTime ? (formData.birthTime.split(/[-T\s]/)[1] || '') : ''}
                        onChange={(e) => {
                          const month = e.target.value.padStart(2, '0');
                          const year = formData.age ? new Date().getFullYear() - formData.age : new Date().getFullYear();
                          const currentDay = formData.birthTime ? (formData.birthTime.split(/[-T\s]/)[2] || '01') : '01';
                          const currentTime = formData.birthTime ? (formData.birthTime.includes('T') ? formData.birthTime.split('T')[1] : (formData.birthTime.includes(' ') ? formData.birthTime.split(' ')[1] : '00:00')) : '00:00';
                          const separator = timeMode === 'specific' ? 'T' : ' ';
                          setFormData(prev => ({ ...prev, birthTime: `${year}-${month}-${currentDay}${separator}${currentTime}` }));
                        }}
                      >
                        <option value="">选择</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                          <option key={m} value={m.toString().padStart(2, '0')}>{m}月</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="text-base text-slate-300 mb-2">日期</div>
                      <select
                        className="w-full h-14 rounded-2xl px-4 text-xl font-bold text-slate-900 bg-white appearance-none"
                        value={formData.birthTime ? (formData.birthTime.split(/[-T\s]/)[2] || '') : ''}
                        onChange={(e) => {
                          const day = e.target.value.padStart(2, '0');
                          const year = formData.age ? new Date().getFullYear() - formData.age : new Date().getFullYear();
                          const currentMonth = formData.birthTime ? (formData.birthTime.split(/[-T\s]/)[1] || '01') : '01';
                          const currentTime = formData.birthTime ? (formData.birthTime.includes('T') ? formData.birthTime.split('T')[1] : (formData.birthTime.includes(' ') ? formData.birthTime.split(' ')[1] : '00:00')) : '00:00';
                          const separator = timeMode === 'specific' ? 'T' : ' ';
                          setFormData(prev => ({ ...prev, birthTime: `${year}-${currentMonth}-${day}${separator}${currentTime}` }));
                        }}
                      >
                        <option value="">选择</option>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                          <option key={d} value={d.toString().padStart(2, '0')}>{d}日</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Time Input */}
                  <div>
                    <div className="flex gap-4 mb-4 bg-white/5 p-1 rounded-xl">
                      <button
                        onClick={() => setTimeMode('specific')}
                        className={`flex-1 py-2 rounded-lg font-bold transition-all ${timeMode === 'specific' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'}`}
                      >
                        具体时间
                      </button>
                      <button
                        onClick={() => setTimeMode('approx')}
                        className={`flex-1 py-2 rounded-lg font-bold transition-all ${timeMode === 'approx' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'}`}
                      >
                        大概时间
                      </button>
                    </div>

                    {timeMode === 'specific' ? (
                      <input
                        type="time"
                        value={formData.birthTime && formData.birthTime.includes('T') ? formData.birthTime.split('T')[1] : ''}
                        onChange={(e) => {
                          const time = e.target.value;
                          const year = formData.age ? new Date().getFullYear() - formData.age : new Date().getFullYear();
                          const currentMonth = formData.birthTime ? (formData.birthTime.split(/[-T\s]/)[1] || '01') : '01';
                          const currentDay = formData.birthTime ? (formData.birthTime.split(/[-T\s]/)[2] || '01') : '01';
                          setFormData(prev => ({ ...prev, birthTime: `${year}-${currentMonth}-${currentDay}T${time}` }));
                        }}
                        className="w-full h-16 rounded-2xl px-4 text-xl font-bold text-slate-900 bg-white"
                      />
                    ) : (
                      <div className="grid grid-cols-3 gap-3">
                        {['凌晨', '早上', '中午', '下午', '晚上', '深夜'].map(t => (
                          <button
                            key={t}
                            className={`h-14 rounded-2xl text-lg font-bold transition-all ${formData.birthTime && formData.birthTime.includes(' ') && formData.birthTime.split(' ')[1] === t ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
                            onClick={() => {
                              const year = formData.age ? new Date().getFullYear() - formData.age : new Date().getFullYear();
                              const currentMonth = formData.birthTime ? (formData.birthTime.split(/[-T\s]/)[1] || '01') : '01';
                              const currentDay = formData.birthTime ? (formData.birthTime.split(/[-T\s]/)[2] || '01') : '01';
                              setFormData(prev => ({ ...prev, birthTime: `${year}-${currentMonth}-${currentDay} ${t}` }));
                            }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {manualSteps[stepIndex].key === 'birthplace' && (
                <div className="space-y-4">
                  <div>
                    <div className="text-base text-slate-300 mb-2">请填写具体的城市或地区</div>
                    <input
                      type="text"
                      value={formData.birthplace ?? ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, birthplace: e.target.value }))}
                      placeholder="例如：北京市海淀区"
                      className="w-full h-14 rounded-2xl px-4 text-2xl font-bold text-slate-900 bg-white placeholder:text-slate-400"
                    />
                  </div>
                </div>
              )}
              {manualSteps[stepIndex].key === 'dialect' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {['普通话', '粤语', '四川话', '东北话', '上海话', '客家话'].map(d => (
                      <button
                        key={d}
                        className={`h-14 rounded-2xl text-xl font-bold ${formData.dialect === d ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
                        onClick={() => setFormData(prev => ({ ...prev, dialect: d }))}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {manualSteps[stepIndex].key === 'occupation' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {['公务员', '教师', '医生', '工人', '个体经营'].map((label) => (
                      <button
                        key={label}
                        className={`h-14 rounded-2xl text-xl font-bold ${formData.occupation === label ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
                        onClick={() => setFormData(prev => ({ ...prev, occupation: label }))}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      className={`h-14 rounded-2xl text-xl font-bold ${formData.occupation !== undefined && !['公务员', '教师', '医生', '工人', '个体经营'].includes(formData.occupation) ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
                      onClick={() => setFormData(prev => ({ ...prev, occupation: '' }))}
                    >
                      其他
                    </button>
                  </div>
                  {formData.occupation !== undefined && !['公务员', '教师', '医生', '工人', '个体经营'].includes(formData.occupation) && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="text-base text-slate-300 mb-2">请输入您的具体职业</div>
                      <input
                        type="text"
                        value={formData.occupation ?? ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, occupation: e.target.value }))}
                        placeholder="例如：工程师"
                        className="w-full h-14 rounded-2xl px-4 text-2xl font-bold text-slate-900 bg-white placeholder:text-slate-400"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {mode === 'manual' && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-6 bg-gradient-to-t from-slate-900 via-slate-900/90 to-transparent flex flex-col items-center">
          <div className="flex items-center justify-center gap-8 mb-4">
            <button
              onClick={goPrevStep}
              disabled={stepIndex === 0}
              className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-3xl">arrow_back</span>
            </button>

            <button
              onClick={goNextStep}
              className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-white shadow-xl active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-4xl">arrow_forward</span>
            </button>
          </div>

          <div className="text-center h-6 text-slate-400 text-sm font-medium">
            第 {stepIndex + 1} / {manualSteps.length} 步
          </div>
        </div>
      )}

      <style>{`
        @keyframes wave {
            0%, 100% { height: 20%; opacity: 0.5; }
            50% { height: 100%; opacity: 1; }
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default VoiceProfileCollection;
