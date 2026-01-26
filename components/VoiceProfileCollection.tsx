
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { UserProfile } from '../types';

interface Props {
  onComplete: (profile: Partial<UserProfile>) => void;
}

interface ChatMessage {
  id: string;
  role: 'ai' | 'user';
  text: string;
}

const VoiceProfileCollection: React.FC<Props> = ({ onComplete }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentAiChunk, setCurrentAiChunk] = useState("");
  const [currentUserChunk, setCurrentUserChunk] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  
  // Progress tracking state
  const [collectedData, setCollectedData] = useState<Partial<UserProfile>>({});
  
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Audio contexts and Session
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentAiChunk, currentUserChunk]);

  const profileFunction: FunctionDeclaration = {
    name: 'save_user_info',
    parameters: {
      type: Type.OBJECT,
      description: '保存用户的个人档案信息。',
      properties: {
        nickname: { type: Type.STRING, description: '用户的昵称' },
        age: { type: Type.NUMBER, description: '用户的年龄' },
        gender: { type: Type.STRING, description: '用户的性别' },
        birthplace: { type: Type.STRING, description: '用户的出生地点' },
        birthTime: { type: Type.STRING, description: '用户的出生具体时间' },
        occupation: { type: Type.STRING, description: '用户的职业' },
        dialect: { type: Type.STRING, description: '用户的常用方言' },
      }
    }
  };

  const startSession = async () => {
    try {
      setConnectionStatus('connecting');
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        setMessages(prev => [...prev, { id: 'sys', role: 'ai', text: "API Key 未配置" }]);
        setConnectionStatus('error');
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Initialize Audio Contexts
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: async () => {
            setConnectionStatus('connected');
            
            // 关键修改：发送明确的“开始”指令，触发 AI 开场白
            // 使用 setTimeout 稍微延迟，确保连接稳定
            setTimeout(() => {
                sessionPromise.then(session => {
                    session.sendRealtimeInput({
                        clientContent: {
                            turns: [{ role: 'user', parts: [{ text: "你好，我已经准备好了，请开始向我提问。" }] }],
                            turnComplete: true
                        }
                    } as any);
                });
            }, 100);
            
            // Setup Audio Streaming
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // 1. Handle Transcriptions
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              setCurrentAiChunk(prev => prev + text);
              
              // If AI starts speaking, user turn is done
              setCurrentUserChunk(prev => {
                  if (prev.trim()) {
                      setMessages(curr => [...curr, { id: Date.now() + 'u', role: 'user', text: prev }]);
                      return "";
                  }
                  return prev;
              });
            }
            
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              setCurrentUserChunk(prev => prev + text);
            }

            // 2. Handle Turn Complete
            if (message.serverContent?.turnComplete) {
               setCurrentAiChunk(prev => {
                   if (prev.trim()) {
                       setMessages(curr => [...curr, { id: Date.now() + 'a', role: 'ai', text: prev }]);
                       return "";
                   }
                   return prev;
               });
            }

            // 3. Handle Function Calls
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'save_user_info') {
                  const args = fc.args as Partial<UserProfile>;
                  setCollectedData(prev => ({ ...prev, ...args }));
                  
                  // Check completeness
                  const required: (keyof UserProfile)[] = ['nickname', 'age', 'gender', 'birthplace', 'occupation', 'dialect'];
                  const currentData = { ...collectedData, ...args };
                  const missing = required.filter(k => !currentData[k]);
                  
                  let result = "ok";
                  if (missing.length === 0) {
                    result = "所有信息已采集完毕。请感谢用户，并告知即将进入主页。";
                    setTimeout(() => onComplete(currentData), 4000);
                  }
                  
                  sessionPromise.then(session => session.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result } }
                  }));
                }
              }
            }

            // 4. Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              const audioCtx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
              
              try {
                const buffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
                const source = audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(audioCtx.destination);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                sourcesRef.current.add(source);
                source.onended = () => sourcesRef.current.delete(source);
              } catch (decodeErr) {
                console.error("Audio decode error", decodeErr);
              }
            }
          },
          onerror: (e) => {
            console.error("会话错误:", e);
            setConnectionStatus('error');
            setMessages(prev => [...prev, { id: 'err', role: 'ai', text: "连接断开，请检查网络后重试" }]);
          },
          onclose: () => {
             setConnectionStatus('idle');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: [profileFunction] }],
          systemInstruction: `
            你是回声灵犀的AI引导助手。
            
            【重要任务】：
            1. **必须主动开口**：当用户说“准备好了”时，请立即热情地打招呼。
            2. **开场白**：“您好呀！我是灵犀。很高兴能为您记录故事。咱们先认识一下，请问您怎么称呼？”
            3. **适老化对话**：语速要慢，语气要亲切、耐心，像和长辈聊天一样。
            4. **信息采集**：通过自然对话收集用户的：昵称、年龄、性别、出生地、职业、常用方言。
            5. **单次单问**：一次只问一个问题，不要让用户感到压力。
          `,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });

      sessionPromise.then(sess => {
        sessionRef.current = sess;
      });

      sessionPromise.catch(err => {
        console.error("Connection failed", err);
        setConnectionStatus('error');
      });

    } catch (err) {
      console.error("启动语音会话失败", err);
      setConnectionStatus('error');
    }
  };

  const handleChipClick = (text: string) => {
    // Add to UI immediately
    setMessages(prev => [...prev, { id: Date.now() + 'u', role: 'user', text: text }]);
    
    // Send to Gemini Live
    if (sessionRef.current) {
        sessionRef.current.sendRealtimeInput({
            clientContent: {
                turns: [{ role: 'user', parts: [{ text: text }] }],
                turnComplete: true
            }
        } as any);
    }
  };

  // 根据当前缺少的资料生成建议选项
  const getSuggestions = () => {
      const suggestions: string[] = [];
      const d = collectedData as any;

      if (!d.gender) suggestions.push("我是男士", "我是女士");
      if (!d.age) suggestions.push("50后", "60后", "70后", "80后");
      if (!d.dialect) suggestions.push("讲普通话", "讲四川话", "讲粤语");
      if (!d.occupation) suggestions.push("已退休", "我是教师", "我是工人", "我是医生");
      
      suggestions.push("没听清，请再说一遍", "这个问题先跳过");
      return suggestions;
  };

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

  const fields = [
      { key: 'nickname', label: '昵称' },
      { key: 'age', label: '年龄' },
      { key: 'gender', label: '性别' },
      { key: 'birthplace', label: '出生地' },
      { key: 'occupation', label: '职业' },
      { key: 'dialect', label: '方言' }
  ];

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white relative overflow-hidden font-sans">
      {/* 顶部状态栏 - 更大更清晰 */}
      <header className="flex-shrink-0 px-6 pt-10 pb-6 flex justify-between items-center bg-black/40 backdrop-blur-md z-20 border-b border-white/10">
        <div className="flex items-center gap-3">
           <div className={`w-4 h-4 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]' : connectionStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
           <span className="text-xl font-black tracking-widest text-white">
              {connectionStatus === 'connected' ? '灵犀听着呢' : connectionStatus === 'connecting' ? '正在连接...' : '离线'}
           </span>
        </div>
      </header>

      {/* 聊天内容区域 - 适老化大字体 */}
      <main className="flex-1 overflow-y-auto p-6 space-y-8 relative z-10 scroll-smooth" ref={scrollRef}>
          {/* 历史消息 */}
          {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                  <div className={`max-w-[90%] px-6 py-5 rounded-[2rem] text-2xl font-bold leading-relaxed shadow-lg ${
                      msg.role === 'user' 
                      ? 'bg-primary text-white rounded-tr-sm' 
                      : 'bg-white text-slate-900 rounded-tl-sm border-2 border-white/20'
                  }`}>
                      {msg.text}
                  </div>
              </div>
          ))}

          {/* 正在生成的 AI 回复 */}
          {currentAiChunk && (
              <div className="flex justify-start animate-in fade-in">
                  <div className="max-w-[90%] px-6 py-5 rounded-[2rem] text-2xl font-bold leading-relaxed bg-white text-slate-900 rounded-tl-sm flex items-center gap-2 shadow-lg">
                      {currentAiChunk}
                      <span className="w-3 h-3 bg-slate-400 rounded-full animate-pulse"></span>
                  </div>
              </div>
          )}

          {/* 正在识别的用户输入 */}
          {currentUserChunk && (
              <div className="flex justify-end animate-in fade-in">
                  <div className="max-w-[90%] px-6 py-5 rounded-[2rem] text-2xl font-bold leading-relaxed bg-primary/80 text-white rounded-tr-sm flex items-center gap-2">
                      {currentUserChunk}
                      <span className="w-3 h-3 bg-white/70 rounded-full animate-pulse"></span>
                  </div>
              </div>
          )}
          
          <div className="h-4"></div>
      </main>

      {/* 底部区域：进度 + 快捷选项 */}
      <footer className="flex-shrink-0 bg-slate-800 border-t border-white/10 pt-4 pb-8 z-20 flex flex-col gap-5 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
        
        {/* 采集进度指示器 */}
        <div className="w-full overflow-x-auto scrollbar-hide px-6">
            <div className="flex gap-3 min-w-max">
                {fields.map((field) => {
                    const isCollected = !!(collectedData as any)[field.key];
                    return (
                        <div 
                            key={field.key} 
                            className={`px-4 py-2 rounded-xl border-2 text-base font-bold transition-all duration-500 ${
                                isCollected 
                                ? 'bg-green-600 border-green-500 text-white shadow-lg' 
                                : 'bg-white/5 border-white/10 text-slate-400'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                {isCollected ? <span className="material-symbols-outlined text-base">check_circle</span> : <span className="material-symbols-outlined text-base text-slate-500">radio_button_unchecked</span>}
                                {field.label}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* 智能选项建议区 (替代打字) */}
        <div className="flex flex-col gap-4">
             {/* 语音状态提示 */}
             <div className="flex items-center justify-center gap-2 h-6">
                {connectionStatus === 'connected' ? (
                    <>
                        <span className="text-primary font-bold animate-pulse text-base">正在聆听...</span>
                        <div className="flex gap-1 h-full items-end pb-1">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="w-1 bg-primary rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ height: '60%', animationDelay: `${i*0.1}s` }}></div>
                            ))}
                        </div>
                    </>
                ) : (
                    <span className="text-slate-500 font-bold">连接中...</span>
                )}
             </div>

             {/* 快捷回复 Chips */}
             <div className="w-full overflow-x-auto scrollbar-hide px-6 pb-2">
                 <div className="flex gap-3 min-w-max">
                     {getSuggestions().map((suggestion, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleChipClick(suggestion)}
                            className="h-14 px-6 rounded-2xl bg-white/10 border border-white/20 text-white text-xl font-bold active:bg-primary active:border-primary active:scale-95 transition-all shadow-sm whitespace-nowrap"
                        >
                            {suggestion}
                        </button>
                     ))}
                 </div>
             </div>
        </div>
      </footer>

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

// 辅助音频函数
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

export default VoiceProfileCollection;
