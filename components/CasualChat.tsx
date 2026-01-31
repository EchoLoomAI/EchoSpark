
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, X, Globe, User, Settings2 } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { getGeminiApiKey } from '../utils/config';

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
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [agentState, setAgentState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [vad, setVad] = useState(50); // Volume threshold
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Audio & Session Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  
  // Status Ref
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Helper to update agent state
  const updateAgentState = () => {
    if (sourcesRef.current.size > 0) {
      setAgentState('speaking');
    } else {
      setAgentState('listening');
    }
  };

  const playAudio = async (base64Audio: string) => {
    if (!outputAudioContextRef.current) return;
    const ctx = outputAudioContextRef.current;
    try {
      const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      
      sourcesRef.current.add(source);
      updateAgentState();
      
      source.onended = () => {
        sourcesRef.current.delete(source);
        updateAgentState();
      };
    } catch (e) {
      console.error(e);
    }
  };

  const startSession = async () => {
    try {
      if (connectionStatus === 'connected' || connectionStatus === 'connecting') return;
      
      setConnectionStatus('connecting');
      setAgentState('idle');
      setErrorMsg(null);

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        setConnectionStatus('error');
        setErrorMsg("API Key 未配置");
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Init Audio
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setConnectionStatus('connected');
            setAgentState('listening');
            
            // Audio Input
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (isMutedRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              const level = Math.min(100, Math.max(0, Math.round(rms * 200)));
              
              if (level < vad) return;
              
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Audio Output
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              playAudio(base64Audio);
            }

            // Transcription
            if (message.serverContent?.outputTranscription) {
               setCurrentAiChunk(message.serverContent.outputTranscription.text);
            }
            
            if (message.serverContent?.turnComplete) {
               setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: currentAiChunk, isFinal: true }]);
               setCurrentAiChunk("");
            }

            if (message.serverContent?.inputTranscription) {
               setCurrentUserChunk(message.serverContent.inputTranscription.text);
            }
            
            // Interruption
            if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                setAgentState('listening');
            }
          },
          onerror: (e) => {
            console.error(e);
            setConnectionStatus('error');
            setErrorMsg("连接中断");
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: "你是EchoSpark的智能助手，请用简短、亲切的语言与用户交谈。" }] },
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } }
        }
      });
      
      sessionPromise.then(sess => {
          sessionRef.current = sess;
      });

    } catch (err) {
      console.error(err);
      setConnectionStatus('error');
      setErrorMsg("初始化失败");
    }
  };

  const stopSession = () => {
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    sessionRef.current?.close();
    
    setConnectionStatus('idle');
    setAgentState('idle');
    sourcesRef.current.clear();
  };
  
  const interrupt = () => {
     sourcesRef.current.forEach(s => s.stop());
     sourcesRef.current.clear();
     nextStartTimeRef.current = 0;
     setAgentState('listening');
  };

  const toggleMute = () => setIsMuted(!isMuted);

  const handleHangup = () => {
    stopSession();
    onBack();
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

// Audio Utils (Duplicated for now, could be moved to utils/audio)
function createBlob(data: Float32Array): any {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

export default CasualChat;
