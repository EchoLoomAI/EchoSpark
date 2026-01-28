
import React, { useState, useEffect, useRef } from 'react';
import { getGeminiApiKey } from '../utils/config';
import { UserProfile } from '../types';
import {
  ConversationalAIAPI,
  EConversationalAIAPIEvents,
  ETranscriptHelperMode,
  IChatMessageText,
  EMessageType,
  ETurnStatus
} from '../conversational-ai-api';
import { RTCHelper } from '../conversational-ai-api/helper/rtc';
import { RTMHelper } from '../conversational-ai-api/helper/rtm';
import { genChannelName, genUUID } from '../lib/utils';
import { startAgent, stopAgent } from '../services/agentService';

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

  const [collectedData, setCollectedData] = useState<Partial<UserProfile>>({});
  const [mode, setMode] = useState<'voice' | 'manual'>('voice');
  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState<Partial<UserProfile>>({});
  const [vad, setVad] = useState(50); // Added VAD sensitivity state

  const scrollRef = useRef<HTMLDivElement>(null);

  // Agora refs
  const channelNameRef = useRef<string>('');
  const userIdRef = useRef<string>('');
  const agentStartedRef = useRef<boolean>(false);
  const agentIdRef = useRef<string>(''); // Store agent ID

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentAiChunk, currentUserChunk]);

  const startSession = async () => {
    try {
      if (agentStartedRef.current) return;

      setConnectionStatus('connecting');
      const rtcHelper = RTCHelper.getInstance();
      const rtmHelper = RTMHelper.getInstance();

      const userId = Math.floor(Math.random() * 1000000); // Use numeric ID for Agora compatibility
      const channelName = genChannelName();

      channelNameRef.current = channelName;
      userIdRef.current = String(userId);

      // 1. Get Token
      await rtcHelper.retrieveToken(userId, channelName);

      // 2. Init RTM
      if (rtcHelper.appId && rtcHelper.token) {
        rtmHelper.initClient({ app_id: rtcHelper.appId, user_id: userId });
        await rtmHelper.login(rtcHelper.token);
        await rtmHelper.join(channelName);
      } else {
        throw new Error('Failed to retrieve token');
      }

      // 3. Init ConversationalAIAPI
      if (!rtcHelper.client || !rtmHelper.client) {
        throw new Error('RTC or RTM client not initialized');
      }

      const conversationalAIAPI = ConversationalAIAPI.init({
        rtcEngine: rtcHelper.client,
        rtmEngine: rtmHelper.client,
        renderMode: ETranscriptHelperMode.TEXT
      });

      // 4. Subscribe events
      conversationalAIAPI.on(
        EConversationalAIAPIEvents.TRANSCRIPT_UPDATED,
        (items) => {
          const userItems = items.filter((item) => {
            const metadata = item.metadata as
              | { object?: EMessageType }
              | null
              | undefined;
            return metadata?.object === EMessageType.USER_TRANSCRIPTION;
          });
          const agentItems = items.filter((item) => {
            const metadata = item.metadata as
              | { object?: EMessageType }
              | null
              | undefined;
            if (metadata && typeof metadata.object !== 'undefined') {
              return metadata.object === EMessageType.AGENT_TRANSCRIPTION;
            }
            return true;
          });

          const latestUser = userItems[userItems.length - 1];
          const latestAgent = agentItems[agentItems.length - 1];

          if (latestUser) {
            const isFinalUser = latestUser.status !== ETurnStatus.IN_PROGRESS;
            if (isFinalUser) {
              setCurrentUserChunk('');
              setMessages((prev) => {
                const id = `user-${latestUser.turn_id}`;
                if (prev.some((m) => m.id === id)) return prev;
                return [
                  ...prev,
                  {
                    id,
                    role: 'user',
                    text: latestUser.text
                  }
                ];
              });
            } else {
              setCurrentUserChunk(latestUser.text);
            }
          }

          if (latestAgent) {
            let displayText = latestAgent.text;
            const globalRegex = /\$\$PROFILE_UPDATE\$\$ (\{.*?\}) \$\$/g;
            let match;

            while ((match = globalRegex.exec(latestAgent.text)) !== null) {
              try {
                const data = JSON.parse(match[1]);
                if (data.key && data.value !== undefined) {
                  setCollectedData((prev) => {
                    if (prev[data.key as keyof UserProfile] === data.value) {
                      return prev;
                    }
                    return { ...prev, [data.key]: data.value };
                  });
                }
              } catch (e) {
                console.error('JSON parse error', e);
              }
            }
            displayText = displayText.replace(globalRegex, '').trim();

            const isFinalAgent =
              latestAgent.status !== ETurnStatus.IN_PROGRESS;
            if (isFinalAgent) {
              setCurrentAiChunk('');
              setMessages((prev) => {
                const id = `agent-${latestAgent.turn_id}`;
                if (prev.some((m) => m.id === id)) return prev;
                return [
                  ...prev,
                  {
                    id,
                    role: 'ai',
                    text: displayText
                  }
                ];
              });
            } else {
              setCurrentAiChunk(displayText);
            }
          }
        }
      );

      conversationalAIAPI.on(EConversationalAIAPIEvents.AGENT_STATE_CHANGED, (uid, state) => {
        console.log('Agent state:', state);
        if (state.state === 'speaking') {
          // Agent is speaking
        }
      });

      conversationalAIAPI.subscribeMessage(channelName);

      // 5. Join RTC
      // await rtcHelper.initDenoiserProcessor(); // Optional
      await rtcHelper.createTracks();
      await rtcHelper.join({ channel: channelName, userId: Number(userId) || userId }); // Check if userId needs to be number
      await rtcHelper.publishTracks();

      // 6. Start Agent
      // System instruction with JSON output requirement
      const systemInstruction = `
        你是回声灵犀的AI引导助手。
        【重要任务】：
        1. **必须主动开口**：当用户说“准备好了”时，请立即热情地打招呼。
        2. **开场白**：“您好呀！我是灵犀。很高兴能为您记录故事。咱们先认识一下，请问您怎么称呼？”
        3. **适老化对话**：语速要慢，语气要亲切、耐心，像和长辈聊天一样。
        4. **信息采集**：通过自然对话收集用户的：昵称、年龄、性别、出生地、职业、常用方言。
        5. **单次单问**：一次只问一个问题，不要让用户感到压力。
        6. **数据记录**：每当你获得用户的某个信息时，请务必在回复中包含以下格式的JSON数据（不要使用markdown代码块，直接输出）：
           $$PROFILE_UPDATE$$ {"key": "nickname", "value": "..."} $$
           支持的key包括：nickname, age (数字), gender (男/女), birthplace, occupation, dialect。
           例如：
           - 用户说“叫我张大爷”，回复：“好的张大爷... $$PROFILE_UPDATE$$ {"key": "nickname", "value": "张大爷"} $$”
           - 用户说“今年75了”，回复：“75岁身子骨还很硬朗呢... $$PROFILE_UPDATE$$ {"key": "age", "value": 75} $$”
      `;

      const numericUserId = Number(userId);
      const agentRtcUid = Number.isNaN(numericUserId)
        ? `${userId}-agent`
        : String(numericUserId + 1);

      const startData = await startAgent({
        channel: channelName,
        token: rtcHelper.token ?? undefined,
        agent_rtc_uid: agentRtcUid,
        remote_rtc_uids: [String(userId)],
        preset_name: 'default',
        advanced_features: {
          enable_bhvs: true,
          enable_aivad: false,
          enable_rtm: true,
          enable_sal: false
        },
        parameters: {},
        llm: {
          system_messages: JSON.stringify([
            { role: 'system', content: systemInstruction }
          ])
        }
      });

      agentIdRef.current = startData.agent_id;

      agentStartedRef.current = true;
      setConnectionStatus('connected');

    } catch (err) {
      console.error("启动语音会话失败", err);
      setConnectionStatus('error');
    }
  };

  const stopSession = async () => {
    try {
      if (agentStartedRef.current && agentIdRef.current) {
        await stopAgent({
          channel_name: channelNameRef.current,
          preset_name: 'default',
          agent_id: agentIdRef.current
        });
      }

      const rtcHelper = RTCHelper.getInstance();
      const rtmHelper = RTMHelper.getInstance();

      await rtcHelper.exitAndCleanup();
      if (rtmHelper.client) {
        await rtmHelper.exitAndCleanup();
      }

      agentStartedRef.current = false;
      agentIdRef.current = '';
      setConnectionStatus('idle');
      setMessages([]);
    } catch (err) {
      console.error("Stop session error", err);
    }
  };

  const getSuggestions = () => {
    switch (stepIndex) {
      case 0: return ["张三", "李四", "王五"];
      case 1: return ["60", "65", "70", "75"];
      case 2: return ["男", "女"];
      case 3: return ["北京", "上海", "广州"];
      case 4: return ["退休工人", "教师", "医生"];
      case 5: return ["普通话", "北京话", "四川话"];
      default: return [];
    }
  };

  const handleChipClick = (val: string) => {
    if (mode === 'manual') {
      const field = ['nickname', 'age', 'gender', 'birthplace', 'occupation', 'dialect'][stepIndex] as keyof UserProfile;
      setFormData(prev => ({ ...prev, [field]: val }));
    } else {
      // In voice mode, maybe send as text message or just hint
      // For now, let's treat it as manual input for that field to help progress
      const field = ['nickname', 'age', 'gender', 'birthplace', 'occupation', 'dialect'][stepIndex] as keyof UserProfile;
      setCollectedData(prev => ({ ...prev, [field]: val }));
    }
  };

  // Handle manual input logic (kept same as before)
  const manualSteps = [
    { key: 'nickname' as const, title: '怎么称呼您？', description: '可以选择称谓，也可以填写昵称。' },
    { key: 'age' as const, title: '您的年龄大约？', description: '选择一个年龄段，更轻松。' },
    { key: 'gender' as const, title: '我们该怎么称呼您？', description: '选择先生或女士。' },
    { key: 'birthplace' as const, title: '您是哪里人？', description: '请选择或填写家乡。' },
    { key: 'dialect' as const, title: '您平时常说哪种方言？', description: '可以多选中最常用的。' },
    { key: 'occupation' as const, title: '现在主要在做什么工作或已经退休？', description: '选择最接近的一项。' },
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

  useEffect(() => {
    setFormData(prev => ({ ...prev, ...collectedData }));
  }, [collectedData]);

  // Render ...


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
      <header className="flex-shrink-0 px-6 pt-10 pb-6 flex justify-between items-center bg-black/40 backdrop-blur-md z-20 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className={`w-4 h-4 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]' : connectionStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
          <span className="text-xl font-black tracking-widest text-white">
            {connectionStatus === 'connected' ? '灵犀听着呢' : connectionStatus === 'connecting' ? '正在连接...' : '离线'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            className={`px-4 py-2 rounded-2xl text-base font-black ${mode === 'voice' ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
            onClick={() => setMode('voice')}
          >
            语音采集
          </button>
          <button
            className={`px-4 py-2 rounded-2xl text-base font-black ${mode === 'manual' ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
            onClick={() => setMode('manual')}
          >
            手动填写
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto relative z-10">
        {mode === 'voice' ? (
          <div className="h-full p-6 space-y-8 scroll-smooth" ref={scrollRef}>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                <div className={`max-w-[90%] px-6 py-5 rounded-[2rem] text-2xl font-bold leading-relaxed shadow-lg ${msg.role === 'user'
                  ? 'bg-primary text-white rounded-tr-sm'
                  : 'bg-white text-slate-900 rounded-tl-sm border-2 border-white/20'
                  }`}>
                  {msg.text}
                </div>
              </div>
            ))}

            {currentAiChunk && (
              <div className="flex justify-start animate-in fade-in">
                <div className="max-w-[90%] px-6 py-5 rounded-[2rem] text-2xl font-bold leading-relaxed bg-white text-slate-900 rounded-tl-sm flex items-center gap-2 shadow-lg">
                  {currentAiChunk}
                  <span className="w-3 h-3 bg-slate-400 rounded-full animate-pulse"></span>
                </div>
              </div>
            )}

            {currentUserChunk && (
              <div className="flex justify-end animate-in fade-in">
                <div className="max-w-[90%] px-6 py-5 rounded-[2rem] text-2xl font-bold leading-relaxed bg-primary/80 text-white rounded-tr-sm flex items-center gap-2">
                  {currentUserChunk}
                  <span className="w-3 h-3 bg-white/70 rounded-full animate-pulse"></span>
                </div>
              </div>
            )}

            <div className="h-4"></div>
          </div>
        ) : (
          <div className="h-full p-6 space-y-6 overflow-y-auto">
            <div>
              <div className="text-sm text-slate-300 mb-2">第 {stepIndex + 1} / {manualSteps.length} 步</div>
              <div className="text-3xl font-black text-white mb-2">{manualSteps[stepIndex].title}</div>
              <div className="text-lg text-slate-200">{manualSteps[stepIndex].description}</div>
            </div>
            <div className="space-y-5">
              {manualSteps[stepIndex].key === 'nickname' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {['爷爷', '奶奶', '外公', '外婆'].map((label) => (
                      <button
                        key={label}
                        className={`h-14 rounded-2xl text-xl font-bold ${formData.nickname === label ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
                        onClick={() => setFormData(prev => ({ ...prev, nickname: label }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="text-base text-slate-300 mb-2">也可以由家人帮忙填写称呼或昵称</div>
                    <input
                      type="text"
                      value={formData.nickname ?? ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                      className="w-full h-14 rounded-2xl px-4 text-2xl font-bold text-slate-900 bg-white"
                    />
                  </div>
                </div>
              )}
              {manualSteps[stepIndex].key === 'age' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {['50后', '60后', '70后', '80后', '90后'].map((label, idx) => (
                      <button
                        key={label}
                        className={`h-14 rounded-2xl text-xl font-bold ${formData.age === (50 + idx * 10) ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
                        onClick={() => setFormData(prev => ({ ...prev, age: 50 + idx * 10 }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {manualSteps[stepIndex].key === 'gender' && (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <button
                      className={`flex-1 h-16 rounded-2xl text-2xl font-bold ${formData.gender === '男' ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
                      onClick={() => setFormData(prev => ({ ...prev, gender: '男' }))}
                    >
                      先生
                    </button>
                    <button
                      className={`flex-1 h-16 rounded-2xl text-2xl font-bold ${formData.gender === '女' ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
                      onClick={() => setFormData(prev => ({ ...prev, gender: '女' }))}
                    >
                      女士
                    </button>
                  </div>
                </div>
              )}
              {manualSteps[stepIndex].key === 'birthplace' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {['本地人', '外地人', '老家在北方', '老家在南方'].map((label) => (
                      <button
                        key={label}
                        className={`h-14 rounded-2xl text-xl font-bold ${formData.birthplace === label ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
                        onClick={() => setFormData(prev => ({ ...prev, birthplace: label }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="text-base text-slate-300 mb-2">也可以填写更具体的城市或地区</div>
                    <input
                      type="text"
                      value={formData.birthplace ?? ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, birthplace: e.target.value }))}
                      className="w-full h-14 rounded-2xl px-4 text-2xl font-bold text-slate-900 bg-white"
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
                    {['已退休', '教师', '医生', '工人', '个体经营', '其他'].map((label) => (
                      <button
                        key={label}
                        className={`h-14 rounded-2xl text-xl font-bold ${formData.occupation === label ? 'bg-primary text-white' : 'bg-white/10 text-slate-200'}`}
                        onClick={() => setFormData(prev => ({ ...prev, occupation: label }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="flex-shrink-0 bg-slate-800 border-t border-white/10 pt-4 pb-8 z-20 flex flex-col gap-5 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
        {mode === 'voice' ? (
          <>
            <div className="w-full overflow-x-auto scrollbar-hide px-6">
              <div className="flex gap-3 min-w-max">
                {fields.map((field) => {
                  const isCollected = !!(collectedData as any)[field.key];
                  return (
                    <div
                      key={field.key}
                      className={`px-4 py-2 rounded-xl border-2 text-base font-bold transition-all duration-500 ${isCollected
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

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-center gap-2 h-6">
                {connectionStatus === 'connected' ? (
                  <>
                    <span className="text-primary font-bold animate-pulse text-base">正在聆听...</span>
                    <div className="flex gap-1 h-full items-end pb-1">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-1 bg-primary rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ height: '60%', animationDelay: `${i * 0.1}s` }}></div>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="text-slate-500 font-bold">连接中...</span>
                )}
              </div>

              <div className="w-full overflow-x-auto scrollbar-hide px-6 pb-2">
                <div className="flex gap-3 min-w-max">
                  {getSuggestions().map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleChipClick(suggestion)}
                      className="h-14 px-6 rounded-2xl bg白/10 border border-white/20 text-white text-xl font-bold active:bg-primary active:border-primary active:scale-95 transition-all shadow-sm whitespace-nowrap"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-6">
                <div className="max-w-xs mx-auto">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400">VAD 灵敏度</span>
                    <span className="text-xs text-slate-200">{vad}</span>
                  </div>
                  <input type="range" min={0} max={100} value={vad} onChange={(e) => setVad(Number(e.target.value))} className="w-full" />
                </div>
              </div>

              <div className="px-6 pb-4">
                <button
                  onClick={() => onComplete(formData)}
                  className="w-full h-14 rounded-2xl bg-green-600 text-white text-xl font-bold flex items-center justify-center active:scale-95 transition-all shadow-lg"
                >
                  完成采集，进入主页
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="px-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={goPrevStep}
                disabled={stepIndex === 0}
                className="h-14 px-6 rounded-2xl bg-white/10 text-slate-200 text-lg font-bold disabled:opacity-40 disabled:bg-transparent"
              >
                上一步
              </button>
              <button
                onClick={goNextStep}
                className="flex-1 h-14 rounded-2xl bg-primary text-white text-2xl font-black flex items-center justify-center active:scale-95 transition-all"
              >
                {stepIndex === manualSteps.length - 1 ? '保存资料，进入主页' : '下一步'}
              </button>
            </div>
            <p className="text-center text-sm text-slate-300">
              这些信息以后可以在「个人中心」里随时修改或补充。
            </p>
          </div>
        )}
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
