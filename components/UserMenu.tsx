
import React, { useState, useRef, useEffect } from 'react';
import { UserProfile } from '../types';
import { getGeminiApiKey, setGeminiApiKey } from '../utils/config';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';

interface Props {
  user: UserProfile;
  onBack: () => void;
  onLogout: () => void;
}

interface GalleryItem {
  id: string;
  imageUrl: string;
  category: string;
  summary: string;
  description: string; // 新增：详细描述
  date: string;
}

type SubView = 'main' | 'profile' | 'gallery' | 'biography' | 'settings';
type GalleryMode = 'grid' | 'uploading' | 'ai-chat' | 'success';

const UserMenu: React.FC<Props> = ({ user, onBack, onLogout }) => {
  const [currentView, setCurrentView] = useState<SubView>('main');
  const [localProfile, setLocalProfile] = useState<UserProfile>(user);
  const [keyInput, setKeyInput] = useState<string>('');
  const [keyStatus, setKeyStatus] = useState<'unset' | 'set'>(getGeminiApiKey() ? 'set' : 'unset');

  // Gallery Data State
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([
    {
      id: '1',
      imageUrl: 'https://placehold.co/300x400/png?text=Childhood',
      category: '童年往事',
      summary: '老家院子里的嬉戏时光',
      description: '这是一张在老家院子里拍的照片，那时候我大概才五六岁。依然记得那个夏天非常热，知了在树上叫个不停。爷爷手里拿着蒲扇坐在旁边笑呵呵地看着我，我正在追着一只小花猫跑。院子里的那棵老枣树现在已经不在了，但看到这张照片，仿佛还能闻到那时的枣香味。虽然照片已经泛黄，但那份无忧无虑的快乐至今难忘。',
      date: '2024-12-01'
    },
    {
      id: '2',
      imageUrl: 'https://placehold.co/300x400/png?text=Youth',
      category: '青春岁月',
      summary: '大学毕业典礼合影',
      description: '2024年夏天的毕业典礼，那天阳光特别刺眼，大家穿着学士服，脸上洋溢着对未来的憧憬，也有即将分别的不舍。左边第二个是我的室友老张，他现在去了上海发展。我们当时约定好，无论以后在哪里，每五年都要聚一次。这张照片定格了我们最意气风发的时刻，也是学生时代完美的句号。',
      date: '2024-11-15'
    },
    {
      id: '3',
      imageUrl: 'https://placehold.co/300x400/png?text=Family',
      category: '家庭聚会',
      summary: '春节全家福',
      description: '这是今年春节的全家福，难得大家都凑齐了。爸爸妈妈坐在中间，精神头看起来不错。小侄子手里还拿着红包，笑得眼睛都眯成了一条缝。那天晚上我们包了好多饺子，还放了烟花。随着年龄增长，越来越觉得一家人整整齐齐在一起吃饭，就是最大的幸福。',
      date: '2025-01-02'
    },
    {
      id: '4',
      imageUrl: 'https://picsum.photos/seed/mem4/300/400',
      category: '童年往事',
      summary: '第一次骑自行车的照片',
      description: '那是一辆红色的儿童自行车，后面还有两个辅助轮。爸爸在后面扶着车座，我紧张得手心出汗，死死抓住车把。记得当时是在公园的小广场上，练习了一下午，最后终于敢自己蹬几圈了。那份学会新技能的成就感，现在想起来还觉得很自豪。',
      date: '2025-01-10'
    },
  ]);
  const [activeCategory, setActiveCategory] = useState<string>('全部');

  // State for viewing detailed photo
  const [viewingItem, setViewingItem] = useState<GalleryItem | null>(null);

  // Gallery AI Interaction States
  const [galleryMode, setGalleryMode] = useState<GalleryMode>('grid');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [aiText, setAiText] = useState("");
  const [userText, setUserText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);

  const displayName = localProfile.nickname || localProfile.phoneNumber?.slice(-4) || '尊贵用户';
  const progressPercent = 42;

  // Cleanup on unmount or view change
  useEffect(() => {
    return () => stopAiSession();
  }, []);

  const stopAiSession = () => {
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    sessionRef.current?.close();
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();

    // Reset refs to null to allow re-initialization
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    streamRef.current = null;
    sessionRef.current = null;
  };

  // --- AI Gallery Logic ---

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Initialize Audio and Stream immediately within the user gesture event handler
      try {
        if (!inputAudioContextRef.current || inputAudioContextRef.current.state === 'closed') {
          inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        }
        if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
          outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }

        if (inputAudioContextRef.current.state === 'suspended') await inputAudioContextRef.current.resume();
        if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch (err) {
        console.error("Audio initialization failed:", err);
        alert("无法访问麦克风，请检查权限设置。");
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        const base64 = evt.target?.result as string;
        setSelectedImage(base64);
        setGalleryMode('uploading');
        // Simulate restoration
        setTimeout(() => {
          setGalleryMode('ai-chat');
          startGalleryAiSession(file, base64);
        }, 2000);
      };
      reader.readAsDataURL(file);
    }
  };

  const startGalleryAiSession = async (file: File, base64Full: string) => {
    try {
      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        console.error("API Key missing");
        return;
      }

      const ai = new GoogleGenAI({ apiKey });

      if (!streamRef.current || !inputAudioContextRef.current || !outputAudioContextRef.current) {
        console.error("Audio resources not ready");
        return;
      }

      const stream = streamRef.current;
      const base64Data = base64Full.split(',')[1];
      const mimeType = file.type || 'image/jpeg';

      const saveMemoryTool: FunctionDeclaration = {
        name: 'save_photo_memory',
        parameters: {
          type: Type.OBJECT,
          description: '保存用户对照片的语音描述和整理后的回忆。',
          properties: {
            summary: { type: Type.STRING, description: '照片内容的AI摘要（标题）' },
            userDescription: { type: Type.STRING, description: '用户提供的详细回忆描述，结合画面内容和用户讲述的故事。' },
            category: { type: Type.STRING, description: '自动生成的分类标签，例如：童年往事、青春岁月、家庭聚会、旅行足迹、工作生涯、老物件。' }
          },
          required: ['summary', 'userDescription', 'category']
        }
      };

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            sessionPromise.then(session => {
              session.sendRealtimeInput({ media: { mimeType, data: base64Data } });
            });

            if (!inputAudioContextRef.current) return;

            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (evt) => {
              const inputData = evt.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
              playAudio(message.serverContent.modelTurn.parts[0].inlineData.data);
            }
            if (message.serverContent?.outputTranscription) setAiText(message.serverContent.outputTranscription.text);
            if (message.serverContent?.inputTranscription) setUserText(message.serverContent.inputTranscription.text);

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'save_photo_memory') {
                  const args = fc.args as any;
                  const newItem: GalleryItem = {
                    id: Date.now().toString(),
                    imageUrl: base64Full,
                    category: args.category || '未分类',
                    summary: args.summary || '新的回忆',
                    description: args.userDescription || '（暂无详细描述）',
                    date: new Date().toLocaleDateString('zh-CN')
                  };

                  // Update state using functional update to ensure we have latest state
                  setGalleryItems(prev => [newItem, ...prev]);
                  setActiveCategory(newItem.category); // Switch to the new category

                  sessionPromise.then(session => session.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result: "Memory categorized and saved." } }
                  }));

                  setTimeout(() => {
                    setGalleryMode('success');
                    stopAiSession();
                  }, 1500);
                }
              }
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: [saveMemoryTool] }],
          systemInstruction: `
            你是回声灵犀的影像整理师。
            用户刚刚上传了一张照片，AI已经识别了其中的内容。
            
            任务流程：
            1. 根据图像内容，先给出一个简短的识别摘要。
            2. 用温暖的声音引导用户说出这张照片背后的故事。
            3. 耐心聆听并记录用户的回忆。
            4. 当收集到足够信息后，分析语意并**自动生成一个分类标签**（如：童年往事、青春岁月、家庭聚会等），提取一个**简短标题（摘要）**以及**详细的描述内容**，然后调用 save_photo_memory 保存。
          `,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Connection failed:", err);
    }
  };

  const playAudio = async (base64: string) => {
    const ctx = outputAudioContextRef.current;
    if (!ctx) return;
    try {
      const buffer = await decodeAudioData(decode(base64), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += buffer.duration;
      sourcesRef.current.add(source);
      source.onended = () => sourcesRef.current.delete(source);
    } catch (e) { }
  };

  // --- Helpers ---
  function createBlob(data: Float32Array): any {
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }
  function decode(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
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

  // --- Sub-components (Aging-Friendly Updates) ---

  const SubPageHeader = ({ title, onBackToMain }: { title: string, onBackToMain: () => void }) => (
    <header className="sticky top-0 px-6 pt-10 pb-6 flex justify-between items-center z-50 bg-background-light/95 backdrop-blur-lg border-b border-slate-200">
      <button
        onClick={onBackToMain}
        className="w-14 h-14 rounded-full bg-white shadow-md flex items-center justify-center text-slate-700 active:scale-90 transition-transform border border-slate-100"
      >
        <span className="material-symbols-outlined text-3xl">arrow_back_ios_new</span>
      </button>
      <span className="text-2xl font-black text-slate-900 tracking-tight">{title}</span>
      <div className="w-14"></div>
    </header>
  );

  const MenuSection = ({ title, children }: { title: string, children?: React.ReactNode }) => (
    <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h3 className="px-4 text-base font-black text-slate-500 uppercase tracking-widest mb-4 ml-2">{title}</h3>
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden mx-2">
        {children}
      </div>
    </div>
  );

  const MenuItem = ({ icon, title, subtitle, color = "primary", onClick }: {
    icon: string,
    title: string,
    subtitle?: string,
    color?: string,
    onClick?: () => void
  }) => (
    <button
      onClick={onClick}
      className="w-full px-6 py-6 flex items-center gap-5 hover:bg-slate-50 active:bg-slate-100 transition-colors border-b border-slate-100 last:border-0 text-left"
    >
      <div className={`w-16 h-16 rounded-3xl flex items-center justify-center bg-${color}/10 text-${color} flex-shrink-0`}>
        <span className="material-symbols-outlined text-4xl">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xl font-black text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis">{title}</p>
        {subtitle && <p className="text-base text-slate-500 font-bold mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{subtitle}</p>}
      </div>
      <span className="material-symbols-outlined text-slate-300 text-2xl flex-shrink-0">arrow_forward_ios</span>
    </button>
  );

  // --- Views ---

  const renderMainView = () => (
    <div className="animate-in fade-in duration-300 h-full overflow-y-auto pb-12">
      <header className="sticky top-0 px-6 pt-10 pb-6 flex justify-between items-center z-50 bg-background-light/95 backdrop-blur-lg">
        <button
          onClick={onBack}
          className="w-14 h-14 rounded-full bg-white shadow-md flex items-center justify-center text-slate-700 active:scale-90 transition-transform border border-slate-200"
        >
          <span className="material-symbols-outlined text-3xl">close</span>
        </button>
        <span className="text-2xl font-black text-slate-900">个人中心</span>
        <div className="w-14"></div>
      </header>

      {/* User Card - Larger */}
      <div className="px-6 py-4 mb-4">
        <div className="bg-white rounded-[3rem] p-8 shadow-xl shadow-slate-200/50 relative overflow-hidden flex flex-col items-center border border-slate-100">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
          <div className="w-28 h-28 rounded-full bg-slate-50 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center mb-5 relative">
            {localProfile.gender === '女' ? (
              <span className="material-symbols-outlined text-pink-400 text-7xl">face_3</span>
            ) : (
              <span className="material-symbols-outlined text-slate-400 text-7xl">face</span>
            )}
            <div className="absolute bottom-0 right-0 w-10 h-10 bg-secondary rounded-full border-4 border-white flex items-center justify-center text-white shadow-md">
              <span className="material-symbols-outlined text-base">verified</span>
            </div>
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2">{displayName}</h2>
          <p className="text-slate-500 font-bold text-lg mb-8 tracking-wider">{localProfile.phoneNumber}</p>

          <div className="w-full bg-slate-50 rounded-[2rem] p-6 flex items-center justify-between border border-slate-100">
            <div className="flex-1">
              <div className="flex justify-between items-end mb-3">
                <span className="text-sm font-black text-slate-500 uppercase tracking-widest">传记进度</span>
                <span className="text-xl font-black text-primary">{progressPercent}%</span>
              </div>
              <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>
            <div className="ml-6 w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-primary shadow-sm border border-slate-100">
              <span className="material-symbols-outlined text-3xl">auto_stories</span>
            </div>
          </div>
        </div>
      </div>

      <main className="px-4">
        <MenuSection title="账号管理">
          <MenuItem icon="badge" title="个人基本资料" subtitle="修改昵称、职业等信息" color="primary" onClick={() => setCurrentView('profile')} />
          <MenuItem icon="phonelink_setup" title="手机号绑定" subtitle={localProfile.phoneNumber} color="primary" />
        </MenuSection>

        <MenuSection title="我的数字资产">
          <MenuItem icon="photo_library" title="数字影像馆" subtitle="老照片修复与故事记录" color="primary" onClick={() => setCurrentView('gallery')} />
        </MenuSection>

        <MenuSection title="人生传记创作">
          <MenuItem icon="import_contacts" title="我的传记书目" subtitle="查看书目与打印服务" color="secondary" onClick={() => setCurrentView('biography')} />
          <MenuItem icon="print" title="印制服务" subtitle="定制您的实体回忆录" color="secondary" />
        </MenuSection>

        <MenuSection title="偏好设置">
          <MenuItem icon="translate" title="方言与音色" subtitle="设置家乡话与助手声音" color="slate-500" onClick={() => setCurrentView('settings')} />
          <MenuItem icon="security" title="隐私与授权" subtitle="家人共享与数据权限" color="slate-500" />
          <MenuItem icon="help" title="帮助与客服" subtitle="联系我们解决问题" color="slate-500" />
        </MenuSection>

        <div className="px-4 mt-12 mb-8 space-y-6">
          <button onClick={onLogout} className="w-full h-20 rounded-[2rem] bg-white border-2 border-red-50 text-red-500 font-black text-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-sm">
            <span className="material-symbols-outlined text-3xl">logout</span>
            <span>退出当前账号</span>
          </button>
          <div className="text-center py-4">
            <p className="text-slate-400 font-serif italic text-base">“ 每一句嘱托，都是留给未来最好的礼物 ”</p>
            <p className="text-xs text-slate-300 font-bold uppercase tracking-[0.3em] mt-4">EchoSpark v1.0.4 适老版</p>
          </div>
        </div>
      </main>
    </div>
  );

  const renderProfileView = () => (
    <div className="animate-in slide-in-from-right duration-300 bg-background-light h-full overflow-y-auto">
      <SubPageHeader title="个人基本资料" onBackToMain={() => setCurrentView('main')} />
      <div className="p-6 space-y-8">
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm space-y-6 border border-slate-100">
          <div>
            <label className="block text-base font-black text-slate-500 uppercase tracking-widest mb-3 ml-2">昵称</label>
            <input
              type="text"
              value={localProfile.nickname || ''}
              onChange={e => setLocalProfile({ ...localProfile, nickname: e.target.value })}
              className="w-full h-20 bg-slate-50 border-2 border-transparent focus:border-primary/30 focus:bg-white rounded-3xl px-6 text-xl text-slate-900 font-bold transition-all placeholder:text-slate-300"
              placeholder="请输入您的昵称"
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-base font-black text-slate-500 uppercase tracking-widest mb-3 ml-2">性别</label>
              <select
                value={localProfile.gender}
                onChange={e => setLocalProfile({ ...localProfile, gender: e.target.value })}
                className="w-full h-20 bg-slate-50 border-2 border-transparent focus:border-primary/30 focus:bg-white rounded-3xl px-6 text-xl text-slate-900 font-bold transition-all appearance-none"
              >
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </div>
            <div>
              <label className="block text-base font-black text-slate-500 uppercase tracking-widest mb-3 ml-2">年龄</label>
              <input
                type="number"
                value={localProfile.age || ''}
                onChange={e => setLocalProfile({ ...localProfile, age: parseInt(e.target.value) })}
                className="w-full h-20 bg-slate-50 border-2 border-transparent focus:border-primary/30 focus:bg-white rounded-3xl px-6 text-xl text-slate-900 font-bold transition-all placeholder:text-slate-300"
                placeholder="岁"
              />
            </div>
          </div>
          <div>
            <label className="block text-base font-black text-slate-500 uppercase tracking-widest mb-3 ml-2">出生时间</label>
            <input
              type="datetime-local"
              value={localProfile.birthTime || ''}
              onChange={e => setLocalProfile({ ...localProfile, birthTime: e.target.value })}
              className="w-full h-20 bg-slate-50 border-2 border-transparent focus:border-primary/30 focus:bg-white rounded-3xl px-6 text-xl text-slate-900 font-bold transition-all appearance-none"
            />
          </div>
          <div>
            <label className="block text-base font-black text-slate-500 uppercase tracking-widest mb-3 ml-2">退休前职业</label>
            <input
              type="text"
              value={localProfile.occupation || ''}
              onChange={e => setLocalProfile({ ...localProfile, occupation: e.target.value })}
              className="w-full h-20 bg-slate-50 border-2 border-transparent focus:border-primary/30 focus:bg-white rounded-3xl px-6 text-xl text-slate-900 font-bold transition-all placeholder:text-slate-300"
              placeholder="例如：教师、工人"
            />
          </div>
          <div>
            <label className="block text-base font-black text-slate-500 uppercase tracking-widest mb-3 ml-2">出生地</label>
            <input
              type="text"
              value={localProfile.birthplace || ''}
              onChange={e => setLocalProfile({ ...localProfile, birthplace: e.target.value })}
              className="w-full h-20 bg-slate-50 border-2 border-transparent focus:border-primary/30 focus:bg-white rounded-3xl px-6 text-xl text-slate-900 font-bold transition-all placeholder:text-slate-300"
              placeholder="省/市/县"
            />
          </div>
        </div>
        <button
          onClick={() => setCurrentView('main')}
          className="w-full h-24 bg-primary text-white text-2xl font-black rounded-3xl shadow-xl shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-3"
        >
          <span className="material-symbols-outlined text-4xl">save</span>
          保存信息
        </button>
      </div>
    </div>
  );

  const renderGalleryView = () => {
    // Determine unique categories
    const categories = ['全部', ...Array.from(new Set(galleryItems.map(i => i.category)))];

    // Filter items based on active category
    const filteredItems = activeCategory === '全部'
      ? galleryItems
      : galleryItems.filter(i => i.category === activeCategory);

    return (
      <div className="animate-in slide-in-from-right duration-300 bg-background-light h-full overflow-y-auto pb-12 flex flex-col relative">
        <SubPageHeader title="数字影像馆" onBackToMain={() => {
          setCurrentView('main');
          setGalleryMode('grid');
          stopAiSession();
        }} />

        {galleryMode === 'grid' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Category Filter - Larger text, horizontal scroll */}
            <div className="flex gap-4 px-6 py-4 overflow-x-auto scrollbar-hide flex-shrink-0 w-full">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-8 py-3 rounded-full text-lg font-black whitespace-nowrap transition-all shadow-sm flex-shrink-0 ${activeCategory === cat
                      ? 'bg-primary text-white shadow-primary/30'
                      : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="p-6 grid grid-cols-2 gap-6 flex-1 overflow-y-auto">
              {/* Add New Button - Larger */}
              <button
                onClick={handleUploadClick}
                className="bg-primary/5 rounded-[2rem] border-4 border-dashed border-primary/20 flex flex-col items-center justify-center aspect-[3/4] gap-4 active:scale-95 transition-all"
              >
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-5xl text-primary">add_a_photo</span>
                </div>
                <span className="text-lg font-black text-primary tracking-widest">新增影像</span>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              </button>

              {filteredItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setViewingItem(item)}
                  className="bg-white p-3 rounded-[2rem] shadow-sm border border-slate-100 animate-in fade-in flex flex-col active:scale-95 transition-transform text-left"
                >
                  <div className="aspect-[3/4] rounded-[1.5rem] overflow-hidden bg-slate-100 mb-3 relative w-full">
                    <img src={item.imageUrl} alt="Memory" className="w-full h-full object-cover" />
                    {/* Category Tag Overlay */}
                    <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-xl">
                      <p className="text-xs font-bold text-white tracking-wide whitespace-nowrap">{item.category}</p>
                    </div>
                  </div>
                  <p className="text-base font-black text-slate-800 px-1 whitespace-nowrap overflow-hidden text-ellipsis mb-1 w-full">{item.summary}</p>
                  <p className="text-sm text-slate-500 px-1 font-bold whitespace-nowrap w-full">{item.date}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Photo Details Modal (Lightbox style) */}
        {viewingItem && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-in fade-in duration-300">
            {/* Top Bar */}
            <div className="flex justify-between items-center p-6 z-10">
              <span className="text-white/60 font-bold text-sm tracking-widest uppercase">影像回忆</span>
              <button
                onClick={() => setViewingItem(null)}
                className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white active:bg-white/30 transition-all"
              >
                <span className="material-symbols-outlined text-3xl">close</span>
              </button>
            </div>

            {/* Image Area */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
              <img
                src={viewingItem.imageUrl}
                alt={viewingItem.summary}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* Info Sheet */}
            <div className="flex-shrink-0 bg-slate-900/80 backdrop-blur-xl border-t border-white/10 rounded-t-[2.5rem] p-8 pb-12 max-h-[45vh] flex flex-col animate-in slide-in-from-bottom-10 duration-500">
              <div className="flex justify-between items-start mb-4 flex-shrink-0">
                <div className="pr-4">
                  <h3 className="text-2xl font-black text-white leading-tight mb-2">{viewingItem.summary}</h3>
                  <div className="flex items-center gap-3">
                    <span className="bg-primary px-3 py-1 rounded-lg text-xs font-bold text-white">{viewingItem.category}</span>
                    <span className="text-slate-400 text-sm font-bold">{viewingItem.date}</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-white text-2xl">auto_awesome</span>
                </div>
              </div>

              {/* Scrollable Description Area */}
              <div className="overflow-y-auto pr-2 custom-scrollbar">
                <p className="text-lg text-slate-200 leading-relaxed font-medium">
                  {viewingItem.description}
                </p>
              </div>
            </div>
          </div>
        )}

        {galleryMode === 'uploading' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in zoom-in duration-500">
            <div className="w-full max-w-sm aspect-[3/4] rounded-[2rem] overflow-hidden shadow-2xl relative">
              <img src={selectedImage!} alt="upload" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-primary/10 animate-pulse"></div>
              <div className="absolute top-0 left-0 w-full h-2 bg-primary/80 shadow-[0_0_25px_rgba(43,173,238,0.8)] animate-[scan_2s_linear_infinite]"></div>
            </div>
            <p className="mt-12 text-2xl font-black text-primary animate-pulse tracking-widest text-center">AI 正在<br />高清修复中...</p>
          </div>
        )}

        {galleryMode === 'ai-chat' && (
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <div className="flex-shrink-0 flex justify-center mb-8">
              <div className="w-full max-w-xs aspect-[3/4] rounded-[2rem] overflow-hidden shadow-xl border-4 border-white">
                <img src={selectedImage!} alt="Target" className="w-full h-full object-cover" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 text-center flex flex-col items-center justify-center">
              <div className="bg-primary/10 rounded-full px-6 py-2 flex items-center gap-3 mb-2">
                <span className="w-3 h-3 rounded-full bg-primary animate-ping"></span>
                <span className="text-sm font-black text-primary uppercase tracking-widest">正在语音导览</span>
              </div>

              <h3 className="text-3xl font-black text-slate-800 leading-relaxed px-4">
                “{aiText || "正在分析照片..."}”
              </h3>

              {userText && (
                <div className="bg-white px-8 py-6 rounded-[2rem] border-2 border-slate-100 shadow-sm animate-in slide-in-from-bottom-2 w-full">
                  <p className="text-xl font-bold text-slate-600 italic">“ {userText} ”</p>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 pt-10 flex flex-col items-center gap-6">
              <div className="flex gap-2 h-10">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="w-2.5 bg-primary/40 rounded-full animate-pulse" style={{ height: '100%', animationDelay: `${i * 0.1}s` }}></div>
                ))}
              </div>
              <button onClick={() => { setGalleryMode('grid'); stopAiSession(); }} className="w-full h-16 rounded-2xl border-2 border-slate-200 text-slate-500 font-black text-lg">取消上传</button>
            </div>
          </div>
        )}

        {galleryMode === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
            <div className="w-32 h-32 rounded-full bg-green-500 flex items-center justify-center shadow-lg mb-8">
              <span className="material-symbols-outlined text-white text-6xl">check_circle</span>
            </div>
            <h2 className="text-4xl font-black text-slate-900 mb-4">故事已存好</h2>
            <p className="text-slate-500 text-center font-bold text-xl mb-12 leading-relaxed">系统已根据您的描述完成分类，<br />内容已加入您的传记库。</p>
            <button
              onClick={() => setGalleryMode('grid')}
              className="w-full h-24 bg-primary text-white text-2xl font-black rounded-[2rem] shadow-xl active:scale-95 transition-all"
            >知道了</button>
          </div>
        )}

        <style>{`
        @keyframes scan {
            0% { top: 0%; opacity: 0; }
            5% { opacity: 1; }
            95% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
        .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: rgba(255,255,255,0.2);
            border-radius: 4px;
        }
      `}</style>
      </div>
    )
  };

  const renderBiographyView = () => (
    <div className="animate-in slide-in-from-right duration-300 bg-background-light h-full overflow-y-auto">
      <SubPageHeader title="我的传记书目" onBackToMain={() => setCurrentView('main')} />
      <div className="p-6 space-y-6">
        {[
          { name: "第一卷：童年往事", status: "已完成", icon: "child_care", color: "primary" },
          { name: "第二卷：青春岁月", status: "进行中", icon: "school", color: "secondary" },
          { name: "第三卷：成家立业", status: "待开启", icon: "work", color: "slate-300" }
        ].map((chapter, i) => (
          <div key={i} className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100 flex items-center gap-6">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center bg-${chapter.color === 'primary' ? 'primary' : chapter.color === 'secondary' ? 'secondary' : 'slate-100'} text-${chapter.color === 'slate-300' ? 'slate-300' : 'white'} flex-shrink-0`}>
              <span className="material-symbols-outlined text-4xl">{chapter.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xl font-black text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis">{chapter.name}</h4>
              <div className="flex items-center gap-2 mt-2">
                <span className={`w-3 h-3 rounded-full ${chapter.status === '已完成' ? 'bg-green-500' : chapter.status === '进行中' ? 'bg-secondary animate-pulse' : 'bg-slate-300'}`}></span>
                <span className="text-base text-slate-500 font-bold whitespace-nowrap">{chapter.status}</span>
              </div>
            </div>
            {chapter.status === '已完成' && <span className="material-symbols-outlined text-primary text-3xl flex-shrink-0">visibility</span>}
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettingsView = () => (
    <div className="animate-in slide-in-from-right duration-300 bg-background-light h-full overflow-y-auto">
      <SubPageHeader title="偏好设置" onBackToMain={() => setCurrentView('main')} />
      <div className="p-6 space-y-8">
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm space-y-8 border border-slate-100">
          <div>
            <label className="block text-base font-black text-slate-500 uppercase tracking-widest mb-4 ml-2">识别方言</label>
            <div className="grid grid-cols-2 gap-4">
              {['普通话', '粤语', '四川话', '东北话'].map(d => (
                <button key={d} className={`h-16 rounded-2xl text-lg font-bold transition-all ${localProfile.dialect === d ? 'bg-primary text-white shadow-lg' : 'bg-slate-50 text-slate-600 border border-slate-200'}`} onClick={() => setLocalProfile({ ...localProfile, dialect: d })}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="h-px bg-slate-100 w-full"></div>
          <div>
            <label className="block text-base font-black text-slate-500 uppercase tracking-widest mb-4 ml-2">灵犀助手音色</label>
            <div className="space-y-4">
              {[
                { id: 'Kore', name: '亲切女声 (Kore)', desc: '温婉大方，像个贴心小辈' },
                { id: 'Puck', name: '磁性男声 (Puck)', desc: '幽默风趣，像个老友聊天' },
                { id: 'Fenrir', name: '厚重长者 (Fenrir)', desc: '沉稳睿智，富有生活阅历' }
              ].map(v => (
                <button key={v.id} className={`w-full p-6 rounded-[2rem] border-2 text-left transition-all ${v.id === 'Kore' ? 'border-primary bg-primary/5' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xl font-bold text-slate-900">{v.name}</span>
                    {v.id === 'Kore' && <span className="material-symbols-outlined text-primary text-2xl">check_circle</span>}
                  </div>
                  <p className="text-base text-slate-500">{v.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="h-px bg-slate-100 w-full"></div>
          <div>
            <label className="block text-base font-black text-slate-500 uppercase tracking-widest mb-4 ml-2">Gemini API 密钥</label>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="password"
                  placeholder={keyStatus === 'set' ? '已设置（出于安全不显示）' : '请输入以 sk- 开头的密钥'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="flex-1 h-14 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => {
                    if (!keyInput.trim()) return;
                    setGeminiApiKey(keyInput.trim());
                    setKeyInput('');
                    setKeyStatus('set');
                  }}
                  className="h-14 px-6 rounded-2xl bg-primary text-white font-bold shadow-sm active:scale-95 transition-transform"
                >
                  保存
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500 font-bold">
                  使用本地存储保存，仅用于本机调用 Gemini Live API。
                </p>
                {keyStatus === 'set' && (
                  <button
                    onClick={() => {
                      setGeminiApiKey('');
                      setKeyStatus('unset');
                    }}
                    className="text-sm text-secondary font-bold"
                  >
                    清除密钥
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full bg-background-light flex flex-col font-sans">
      {currentView === 'main' && renderMainView()}
      {currentView === 'profile' && renderProfileView()}
      {currentView === 'gallery' && renderGalleryView()}
      {currentView === 'biography' && renderBiographyView()}
      {currentView === 'settings' && renderSettingsView()}

      <style>{`
        .bg-primary/10 { background-color: rgba(43, 173, 238, 0.1); }
        .bg-secondary/10 { background-color: rgba(238, 140, 43, 0.1); }
        .bg-slate-500/10 { background-color: rgba(100, 116, 139, 0.1); }
        .text-primary { color: #2badee; }
        .text-secondary { color: #ee8c2b; }
        .text-slate-300 { color: #cbd5e1; }
        .bg-slate-300 { background-color: #cbd5e1; }
      `}</style>
    </div>
  );
};

export default UserMenu;
