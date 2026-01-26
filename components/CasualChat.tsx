
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

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
  const [status, setStatus] = useState<'connecting' | 'listening' | 'speaking' | 'error'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  
  // Chat History State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [currentOutput, setCurrentOutput] = useState("");

  // Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<any>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentInput, currentOutput]);

  const startSession = async () => {
    try {
      setStatus('connecting');
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        setStatus('error');
        setMessages(prev => [...prev, { id: 'err', role: 'ai', text: "API Key 未配置", isFinal: true }]);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Init Audio
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      analyserRef.current = outputAudioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 32;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('listening');
            // Audio Input Stream
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (isMuted) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // 1. Handle Audio Output
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
              setStatus('speaking');
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              playAudio(base64Audio);
            }

            // 2. Handle Transcriptions
            if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                setCurrentOutput(prev => prev + text);
            }
            if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                setCurrentInput(prev => prev + text);
            }

            // 3. Handle Turn Complete (Commit text to history)
            if (message.serverContent?.turnComplete) {
              setStatus('listening');
              
              // Commit User Text if exists
              setCurrentInput(prev => {
                if (prev.trim()) {
                    setMessages(curr => [...curr, { id: Date.now() + 'u', role: 'user', text: prev, isFinal: true }]);
                }
                return "";
              });

              // Commit AI Text if exists
              setCurrentOutput(prev => {
                if (prev.trim()) {
                    setMessages(curr => [...curr, { id: Date.now() + 'a', role: 'ai', text: prev, isFinal: true }]);
                }
                return "";
              });
            }

            // 4. Handle Interruption
            if (message.serverContent?.interrupted) {
                // Stop audio
                sourcesRef.current.forEach(s => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                setStatus('listening');

                // Commit whatever AI said so far
                setCurrentOutput(prev => {
                    if (prev.trim()) {
                        setMessages(curr => [...curr, { id: Date.now() + 'a_int', role: 'ai', text: prev, isFinal: true }]);
                    }
                    return "";
                });
            }
          },
          onerror: (e) => {
            console.error(e);
            setStatus('error');
          },
          onclose: () => {
            console.log("Session closed");
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `
            你是一个轻松、幽默、富有同理心的聊天伙伴，名字叫“灵犀”。
            
            【关键指令】：
            1. 连接建立后，你必须**立刻**主动向用户打招呼，例如：“嘿，我是灵犀！今天心情怎么样？或者想聊聊什么有趣的事？”
            2. 就像老朋友一样聊天，回答简短自然，口语化，不要长篇大论。
            3. 如果用户沉默，你可以主动抛出轻松的话题（如美食、旅行、梦想）。
          `,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
        }
      });

      sessionPromise.then(sess => {
        sessionRef.current = sess;
      });

      sessionPromise.catch(err => {
        console.error("Connection failed", err);
        setStatus('error');
      });

    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  const playAudio = async (base64Audio: string) => {
    if (!outputAudioContextRef.current) return;
    const ctx = outputAudioContextRef.current;
    
    try {
      const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      
      if (analyserRef.current) {
        source.connect(analyserRef.current);
        analyserRef.current.connect(ctx.destination);
      } else {
        source.connect(ctx.destination);
      }

      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      sourcesRef.current.add(source);
      
      source.onended = () => {
        sourcesRef.current.delete(source);
        if (sourcesRef.current.size === 0) {
            setTimeout(() => setStatus(prev => prev === 'speaking' ? 'listening' : prev), 200);
        }
      };
    } catch (e) {
      console.error("Audio play error", e);
    }
  };

  // Visualization Loop
  useEffect(() => {
    const updateVolume = () => {
      if (analyserRef.current && status === 'speaking') {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setVolume(avg);
      } else {
         const time = Date.now() / 1000;
         setVolume(20 + Math.sin(time * 2) * 5); 
      }
      animationFrameRef.current = requestAnimationFrame(updateVolume);
    };
    updateVolume();
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, [status]);

  useEffect(() => {
    startSession();
    return () => {
      inputAudioContextRef.current?.close();
      outputAudioContextRef.current?.close();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      sessionRef.current?.close();
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden font-sans">
      {/* Header */}
      <header className="flex-shrink-0 px-6 pt-6 pb-4 flex justify-between items-center bg-white/80 backdrop-blur-sm z-20 shadow-sm">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-600 border border-slate-200 active:scale-90 transition-transform"
        >
          <span className="material-symbols-outlined">keyboard_arrow_down</span>
        </button>
        <div className="flex flex-col items-center">
             <span className="text-sm font-bold text-slate-800 tracking-wider uppercase">随心聊</span>
             <span className={`text-[10px] font-medium ${status === 'error' ? 'text-red-500' : 'text-green-500'} flex items-center gap-1`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status === 'error' ? 'bg-red-500' : 'bg-green-500'} ${status !== 'error' ? 'animate-pulse' : ''}`}></span>
                {status === 'connecting' ? '连接中...' : status === 'error' ? '连接断开' : '在线'}
             </span>
        </div>
        <div className="w-10"></div>
      </header>

      {/* Chat History Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 relative z-10" ref={scrollRef}>
        {messages.length === 0 && !currentOutput && (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                {status === 'connecting' ? '正在呼叫灵犀...' : '等待对话开始...'}
            </div>
        )}
        
        {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                    ? 'bg-primary text-white rounded-tr-none' 
                    : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'
                }`}>
                    {msg.text}
                </div>
            </div>
        ))}

        {/* Real-time output (AI) */}
        {currentOutput && (
            <div className="flex justify-start">
                <div className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed bg-white text-slate-700 rounded-tl-none border border-slate-100 shadow-sm flex items-center gap-2">
                    {currentOutput}
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse"></span>
                </div>
            </div>
        )}

        {/* Real-time input (User) */}
        {currentInput && (
            <div className="flex justify-end">
                <div className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed bg-primary/80 text-white rounded-tr-none shadow-sm flex items-center gap-2">
                     {currentInput}
                     <span className="w-1.5 h-1.5 bg-white/70 rounded-full animate-pulse"></span>
                </div>
            </div>
        )}
        
        {/* Spacer for bottom area */}
        <div className="h-2"></div>
      </main>

      {/* Bottom Visualizer & Controls */}
      <footer className="flex-shrink-0 bg-white border-t border-slate-100 p-6 pb-12 z-20 flex flex-col items-center relative">
        {/* Gradient Fade Top */}
        <div className="absolute top-[-40px] left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>

        {/* The Orb (Scaled down) */}
        <div className="relative w-20 h-20 mb-6 flex items-center justify-center flex-shrink-0">
            {/* Core */}
            <div 
                className={`w-14 h-14 rounded-full bg-gradient-to-tr from-primary to-blue-400 shadow-[0_0_30px_rgba(43,173,238,0.4)] transition-all duration-75 ease-out`}
                style={{ transform: `scale(${1 + (volume / 255) * 0.8})` }}
            ></div>
            {/* Outer Rings */}
            <div className={`absolute inset-0 rounded-full border border-primary/20 scale-110 opacity-50 ${status === 'speaking' ? 'animate-ping' : ''}`} style={{ animationDuration: '2s' }}></div>
        </div>
        
        {/* Controls */}
        <div className="w-full flex items-center justify-center gap-12">
           <button 
             onClick={() => setIsMuted(!isMuted)}
             className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-slate-100 text-slate-400' : 'bg-white border border-slate-100 text-slate-600 shadow-sm active:bg-slate-50'}`}
           >
             <span className="material-symbols-outlined text-2xl">{isMuted ? 'mic_off' : 'mic'}</span>
           </button>

           <button 
             onClick={onBack}
             className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-red-200 shadow-xl active:scale-95 transition-transform ring-4 ring-red-50"
           >
             <span className="material-symbols-outlined text-3xl">call_end</span>
           </button>

            {/* Placeholder for symmetry or future feature (e.g. keyboard) */}
           <button 
             className="w-14 h-14 rounded-full flex items-center justify-center bg-white border border-slate-100 text-slate-300 cursor-not-allowed"
           >
             <span className="material-symbols-outlined text-2xl">keyboard</span>
           </button>
        </div>
      </footer>
    </div>
  );
};

// Utils
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
