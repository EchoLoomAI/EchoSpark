
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { UserProfile } from '../types';

interface Props {
  user: UserProfile;
  onBack: () => void;
}

const InterviewChat: React.FC<Props> = ({ user, onBack }) => {
  const [status, setStatus] = useState<'connecting' | 'active' | 'paused' | 'error'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [aiTranscript, setAiTranscript] = useState("正在准备访谈提纲...");
  const [userTranscript, setUserTranscript] = useState("");
  const [contextImage, setContextImage] = useState<string | null>(null);
  
  // Audio & Session Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);

  // Status Ref to be accessible inside audio callbacks
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  // 工具定义：展示照片
  const displayPhotoTool: FunctionDeclaration = {
    name: 'display_contextual_photo',
    parameters: {
      type: Type.OBJECT,
      description: '当谈话内容涉及到特定的回忆场景（如婚礼、童年、学校、旅行、老房子等）时，调用此函数从用户的知识库中调取相关照片展示给用户。',
      properties: {
        keyword: {
          type: Type.STRING,
          description: '照片的关键词，例如：wedding, school, travel, house, baby, family'
        }
      },
      required: ['keyword']
    }
  };

  const startSession = async () => {
    try {
      setStatus('connecting');
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        setStatus('error');
        setAiTranscript("API Key 未配置");
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Init Audio
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Construct dynamic system instruction based on user profile
      const userContext = `
        用户昵称：${user.nickname || '未设置'}
        年龄：${user.age || '未知'}
        出生地：${user.birthplace || '未知'}
        职业：${user.occupation || '未知'}
        方言偏好：${user.dialect || '普通话'}
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('active');
            
            // Audio Input Processing
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (statusRef.current === 'paused' || isMuted) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // 1. Audio Output
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              playAudio(base64Audio);
            }

            // 2. Transcription Updates
            if (message.serverContent?.outputTranscription) {
               setAiTranscript(message.serverContent.outputTranscription.text);
            }
            if (message.serverContent?.inputTranscription) {
               setUserTranscript(message.serverContent.inputTranscription.text);
            }

            // 3. Tool Calls (Display Photo)
            if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                    if (fc.name === 'display_contextual_photo') {
                        const args = fc.args as { keyword: string };
                        console.log("Displaying photo for:", args.keyword);
                        // 模拟从知识库获取图片
                        setContextImage(`https://placehold.co/800x600/png?text=${args.keyword}`);
                        
                        // Send response back
                        sessionPromise.then(session => session.sendToolResponse({
                            functionResponses: {
                                id: fc.id,
                                name: fc.name,
                                response: { result: "Photo displayed to user." }
                            }
                        }));
                    }
                }
            }

            // 4. Interruption Handling
            if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error(e);
            setStatus('error');
            setAiTranscript("连接中断，请重试");
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: [displayPhotoTool] }],
          systemInstruction: `
            你是一位专业的传记作家和资深访谈主持人。你的任务是采访用户，帮助他们记录人生故事。
            
            当前采访对象资料：
            ${userContext}

            【知识库与图片联动】：
            你拥有访问用户“人生相册知识库”的权限。
            **关键指令**：当用户提到某个具体的场景（例如“我结婚的时候”、“那所小学”、“去北京旅游”）时，请**务必调用** \`display_contextual_photo\` 工具，传入对应的英文关键词（如 wedding, school, beijing），向用户展示那张照片，并基于照片进行追问（如：“是这张照片吗？当时看起来很热闹...”）。

            【访谈原则】：
            1. **循序渐进**：根据用户背景，从童年开始引导。
            2. **主动展示回忆**：不要等用户发图，你要主动根据话题调用工具展示图片来唤起记忆。
            3. **倾听与反馈**：给予简短的共情反馈。
            
            连接建立后，请先做一个简短的开场白，确认用户准备好开始这段回忆之旅。
          `,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } }
        }
      });
      
      sessionPromise.then(sess => {
          sessionRef.current = sess;
      });

      sessionPromise.catch(err => {
        console.error("Connection failed", err);
        setStatus('error');
        setAiTranscript("连接失败，请检查网络");
      });

    } catch (err) {
      console.error(err);
      setStatus('error');
      setAiTranscript("初始化失败，请检查麦克风权限");
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
      
      source.onended = () => {
        sourcesRef.current.delete(source);
      };
    } catch (e) {
      console.error(e);
    }
  };

  const togglePause = () => {
    if (status === 'active') {
        setStatus('paused');
        // Stop any currently playing audio
        sourcesRef.current.forEach(s => s.stop());
        sourcesRef.current.clear();
    } else if (status === 'paused') {
        setStatus('active');
    }
  };

  const handleEndInterview = () => {
    // 这里可以添加生成总结的逻辑
    onBack();
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
                <div key={i} className={`w-1.5 bg-primary/50 rounded-full ${status === 'active' && !isMuted ? 'animate-pulse' : ''}`} style={{ height: '100%', animationDelay: `${i*0.1}s` }}></div>
            ))}
         </div>

         <div className="flex items-center justify-between max-w-xs mx-auto">
            {/* Left: Microphone / Mute */}
            <div className="flex flex-col items-center gap-2">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
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
                  className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all border-4 active:scale-95 ${
                      status === 'active' 
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
      </footer>
    </div>
  );
};

// Audio Utils
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

export default InterviewChat;
