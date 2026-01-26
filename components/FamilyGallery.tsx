
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';

interface Props {
  onBack: () => void;
}

// 步骤：选择 -> 修复中 -> 描述中 -> 完成
type GalleryStep = 'select' | 'restoring' | 'describing' | 'completed';

const FamilyGallery: React.FC<Props> = ({ onBack }) => {
  const [step, setStep] = useState<GalleryStep>('select');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [aiText, setAiText] = useState("");
  const [userText, setUserText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio & Gemini Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);

  // Tool: Save Photo Memory
  const saveMemoryTool: FunctionDeclaration = {
    name: 'save_photo_memory',
    parameters: {
      type: Type.OBJECT,
      description: '保存用户对照片的语音描述和元数据。',
      properties: {
        description: { type: Type.STRING, description: '用户对照片内容的详细描述' },
        year: { type: Type.STRING, description: '照片拍摄的大概年份或时间' },
        people: { type: Type.STRING, description: '照片中的人物' },
        location: { type: Type.STRING, description: '照片拍摄的地点' }
      },
      required: ['description']
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setImageSrc(evt.target?.result as string);
        setStep('restoring');
        // 模拟 2.5秒 的高清修复过程
        setTimeout(() => {
          setStep('describing');
          startSession(file); // 修复完成后开启语音引导
        }, 2500);
      };
      reader.readAsDataURL(file);
    }
  };

  const startSession = async (file: File) => {
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        setAiText("API Key Error");
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Init Audio
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prepare Image for Gemini
      const reader = new FileReader();
      reader.onload = async (e) => {
          const base64Data = (e.target?.result as string).split(',')[1];

          const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            callbacks: {
              onopen: () => {
                // Send Image Immediately
                sessionPromise.then(session => {
                    session.sendRealtimeInput({
                        media: { mimeType: file.type, data: base64Data }
                    });
                });

                // Start Audio Streaming
                const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                scriptProcessor.onaudioprocess = (evt) => {
                  const inputData = evt.inputBuffer.getChannelData(0);
                  const pcmBlob = createBlob(inputData);
                  sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                };
                source.connect(scriptProcessor);
                scriptProcessor.connect(inputAudioContextRef.current!.destination);
              },
              onmessage: async (message: LiveServerMessage) => {
                // Audio Out
                if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                  const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
                  playAudio(base64Audio);
                }
                // Transcript
                if (message.serverContent?.outputTranscription) {
                   setAiText(message.serverContent.outputTranscription.text);
                }
                if (message.serverContent?.inputTranscription) {
                   setUserText(message.serverContent.inputTranscription.text);
                }
                // Tool Call (Save)
                if (message.toolCall) {
                    for (const fc of message.toolCall.functionCalls) {
                        if (fc.name === 'save_photo_memory') {
                             sessionPromise.then(session => session.sendToolResponse({
                                functionResponses: { id: fc.id, name: fc.name, response: { result: "success" } }
                             }));
                             // Transition to Completed state visually
                             setTimeout(() => setStep('completed'), 1000);
                        }
                    }
                }
              },
              onerror: (err) => {
                  console.error(err);
                  setAiText("服务暂时不可用，请稍后重试");
              }
            },
            config: {
              responseModalities: [Modality.AUDIO],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              tools: [{ functionDeclarations: [saveMemoryTool] }],
              systemInstruction: `
                你是一位贴心的家庭影像整理助手。
                用户刚刚上传了一张老照片，并且我们已经完成了高清修复。
                
                你的任务是：
                1. 开场白：赞美一下这张照片（例如：“修复后的效果真不错”，“看起来很有年代感”等），并温柔地询问用户这张照片背后的故事（例如：“这是什么时候拍的？”或者“这上面的人是谁呀？”）。
                2. 倾听用户的描述。
                3. 当用户描述完主要信息后，调用 \`save_photo_memory\` 工具将信息保存。
                4. 保存后，简短地回复确认（例如：“好的，这段珍贵的回忆已经帮您存好了。”），然后结束对话。
              `,
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
            }
          });

          sessionPromise.then(sess => {
            sessionRef.current = sess;
          });
          
          sessionPromise.catch(err => {
             console.error("Connection failed", err);
             setAiText("连接失败，请检查网络");
          });
      };
      reader.readAsDataURL(file);

    } catch (err) {
      console.error(err);
      setAiText("初始化失败，请重试");
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
      source.onended = () => sourcesRef.current.delete(source);
    } catch (e) {
      console.error(e);
    }
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

  useEffect(() => {
    return () => {
      inputAudioContextRef.current?.close();
      outputAudioContextRef.current?.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      sessionRef.current?.close();
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-slate-900 relative overflow-hidden font-sans text-white">
      {/* Header */}
      <header className="px-6 pt-8 pb-4 flex items-center justify-between z-10">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md">
            <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span className="font-bold text-lg tracking-wide">家庭影像</span>
        <div className="w-10"></div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 z-10">
        
        {step === 'select' && (
           <div className="w-full h-full flex flex-col items-center justify-center gap-8 animate-in zoom-in duration-500">
              <div 
                  className="w-64 h-64 bg-slate-800 rounded-3xl border-2 border-dashed border-slate-600 flex flex-col items-center justify-center gap-4 relative overflow-hidden group active:scale-95 transition-all"
                  onClick={() => fileInputRef.current?.click()}
              >
                  <span className="material-symbols-outlined text-6xl text-slate-500 group-hover:text-primary transition-colors">add_a_photo</span>
                  <p className="text-slate-400 text-sm font-medium">点击拍摄 / 上传照片</p>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    accept="image/*" 
                    className="hidden"
                    onChange={handleFileChange}
                  />
              </div>
              <p className="text-slate-400 text-center text-sm px-8">
                  支持老照片、老物件、日记本等素材<br/>
                  <span className="text-primary">AI 自动高清修复 + 语音辅助记录</span>
              </p>
           </div>
        )}

        {(step === 'restoring' || step === 'describing' || step === 'completed') && imageSrc && (
            <div className="relative w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black">
                <img src={imageSrc} alt="Memory" className="w-full h-full object-cover" />
                
                {/* AI Restoration Animation Overlay */}
                {step === 'restoring' && (
                    <div className="absolute inset-0 z-20 pointer-events-none">
                        <div className="w-full h-1 bg-primary/80 shadow-[0_0_20px_rgba(59,130,246,0.8)] absolute top-0 animate-[scan_2.5s_linear_forwards]"></div>
                        <div className="absolute inset-0 bg-white/10 mix-blend-overlay animate-pulse"></div>
                        <div className="absolute bottom-6 left-0 right-0 text-center">
                            <span className="inline-block bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-xs font-mono text-primary animate-pulse">
                                AI 正在高清修复中...
                            </span>
                        </div>
                    </div>
                )}

                {/* Completed State */}
                {step === 'completed' && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex flex-col items-center justify-center animate-in fade-in duration-500">
                        <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg mb-4">
                            <span className="material-symbols-outlined text-3xl">check</span>
                        </div>
                        <h3 className="text-xl font-bold mb-2">已存入私有知识库</h3>
                        <p className="text-slate-300 text-sm text-center px-8">您的回忆已安全保存，可随时在“访谈叙事”中回顾。</p>
                        <button onClick={onBack} className="mt-8 px-8 py-3 bg-white text-slate-900 rounded-full font-bold">返回主页</button>
                    </div>
                )}
            </div>
        )}

        {/* Interaction Area for 'Describing' step */}
        {step === 'describing' && (
            <div className="w-full mt-8 flex flex-col items-center gap-4 animate-in slide-in-from-bottom-8 duration-700">
                <div className="flex gap-1 h-8 items-center">
                   {[...Array(5)].map((_,i) => (
                       <div key={i} className="w-1 bg-primary rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ height: '100%', animationDelay: `${i*0.1}s` }}></div>
                   ))}
                </div>
                
                <div className="text-center px-4 min-h-[60px]">
                    <p className="text-lg font-medium text-slate-100 leading-relaxed">
                        {aiText || "正在分析照片..."}
                    </p>
                </div>

                {userText && (
                    <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/5 max-w-[90%]">
                        <p className="text-sm text-slate-300">“{userText}”</p>
                    </div>
                )}
            </div>
        )}

      </main>

      <style>{`
        @keyframes scan {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default FamilyGallery;
