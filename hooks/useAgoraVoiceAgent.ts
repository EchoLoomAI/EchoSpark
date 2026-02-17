import { useEffect, useRef, useState, useCallback } from 'react';
import {
    IMicrophoneAudioTrack,
    IRemoteAudioTrack,
    UID,
} from 'agora-rtc-sdk-ng';
import { useMultibandTrackVolume } from './useMultibandTrackVolume';
import { getAgentToken, startAgent, stopAgent, createEchoHubSessionAgent, pingAgent, getAgentPresets, matchAgent } from '../services/agentService';
import { toast } from 'sonner';
import { RTCHelper } from '../conversational-ai-api/helper/rtc';
import { RTMHelper } from '../conversational-ai-api/helper/rtm';
import { ConversationalAIAPI } from '../conversational-ai-api';
import {
    EConversationalAIAPIEvents,
    ETranscriptHelperMode,
    EChatMessagePriority,
    EChatMessageType,
    EMessageType,
    ETurnStatus,
    type ITranscriptHelperItem,
    type IUserTranscription,
    type IAgentTranscription
} from '../conversational-ai-api/type';

// Define types locally since we can't import from voice-agent-sdk
export type AgentState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

interface UseAgoraVoiceAgentProps {
    onTranscript?: (text: string, role: 'user' | 'assistant', isFinal: boolean) => void;
    onAgentStateChange?: (state: AgentState) => void;
}

const HEARTBEAT_INTERVAL = 10000; // 10s
const CONNECTION_TIMEOUT = 30000; // 30s

export const useAgoraVoiceAgent = ({ onTranscript, onAgentStateChange }: UseAgoraVoiceAgentProps = {}) => {
    const [connectionStatus, setConnectionStatus] = useState<AgentState>('idle');
    const [volumeLevel, setVolumeLevel] = useState(0);
    const [localVolumeLevel, setLocalVolumeLevel] = useState(0);
    const [activeAudioTrack, setActiveAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
    const [remoteAudioTrack, setRemoteAudioTrack] = useState<IRemoteAudioTrack | null>(null);

    const trackToVisualize = connectionStatus === 'speaking' ? remoteAudioTrack : activeAudioTrack;
    const getFrequencyBands = useMultibandTrackVolume(trackToVisualize, 6);

    // Random Int UID generation to match VoiceAgent pattern (ensures RTC/RTM compatibility)
    const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const channelRef = useRef<string>('');
    const uidRef = useRef<number | string>('');
    const agentIdRef = useRef<string>('');
    const appIdRef = useRef<string>('');
    // Use random Int for Agent UID (range 10000-99999) to match VoiceAgent
    const agentUidRef = useRef<string>(String(getRandomInt(10000, 99999)));
    const heartBeatRef = useRef<NodeJS.Timeout | null>(null);
    const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const presetNameRef = useRef<string>('');
    const attemptIdRef = useRef<string>('');

    // Initialize Helpers on mount (idempotent due to singletons)
    useEffect(() => {
        return () => {
            stopSession();
        };
    }, []);

    const clearHeartBeat = () => {
        if (heartBeatRef.current) {
            clearInterval(heartBeatRef.current);
            heartBeatRef.current = null;
        }
    };

    const startHeartBeat = (channelName: string) => {
        clearHeartBeat();
        heartBeatRef.current = setInterval(async () => {
            try {
                if (!agentIdRef.current) return;
                await pingAgent({
                    app_id: appIdRef.current,
                    channel_name: channelName,
                    preset_name: presetNameRef.current
                });
            } catch (error) {
                console.warn("Heartbeat failed:", error);
            }
        }, HEARTBEAT_INTERVAL);
    };

    const clearConnectionTimeout = () => {
        if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
        }
    };

    const startSession = useCallback(async (
        uid: number | string,
        channelName: string,
        configOrSystemPrompt?: string | { systemPrompt?: string, agentId?: string, scenario?: string, userType?: string, token?: string, appId?: string, properties?: any, modelId?: string }
    ) => {
        let systemPrompt: string | undefined;
        let agentId: string | undefined;
        let properties: any | undefined;
        let configModelId: string | undefined;

        if (typeof configOrSystemPrompt === 'string') {
            systemPrompt = configOrSystemPrompt;
        } else if (configOrSystemPrompt) {
            systemPrompt = configOrSystemPrompt.systemPrompt;
            agentId = configOrSystemPrompt.agentId;
            properties = configOrSystemPrompt.properties;
            configModelId = configOrSystemPrompt.modelId;
        }
        const currentAttemptId = Date.now().toString() + Math.random().toString().slice(2);
        attemptIdRef.current = currentAttemptId;

        try {
            if (connectionStatus === 'connecting' || connectionStatus === 'listening') {
                // Allow retry if we are just connecting, but maybe we should stop previous?
                // For now, if status is reflecting active state, we might want to respect it,
                // BUT if we are in a race where status hasn't updated yet, ID check saves us.
                // If status IS connecting, it means a previous attempt succeeded in setting state.
                // We should probably allow the new attempt to override.
                // So we continue.
            }

            setConnectionStatus('connecting');
            onAgentStateChange?.('connecting');

            // 1. Determine Effective UID
            // Priority: Argument UID > LocalStorage UID > Error
            let effectiveUid = uid;
            if (!effectiveUid) {
                const storedUid = localStorage.getItem('uid');
                if (storedUid) {
                    effectiveUid = storedUid;
                } else {
                    throw new Error("User ID is required. Please ensure you are logged in.");
                }
            }

            uidRef.current = effectiveUid;
            channelRef.current = channelName;

            // Start Connection Timeout
            clearConnectionTimeout();
            connectionTimeoutRef.current = setTimeout(() => {
                console.error("Connection timed out");
                toast.error("连接超时，请重试");
                stopSession();
            }, CONNECTION_TIMEOUT);

            // 2. Match Agent (EchoHub)
            console.log('[useAgoraVoiceAgent] 2. Matching Agent for UID:', effectiveUid);
            let matchedAgentId: string | undefined = agentId;
            try {
                const accountUid = String(effectiveUid);

                const configObj = typeof configOrSystemPrompt === 'object' ? configOrSystemPrompt : {};
                const rawScenario = ((configObj as any).scenario || 'chat').toLowerCase();
                const userType = (configObj as any).userType || 'free';

                let subType = 'CHAT';
                if (rawScenario.includes('interview')) subType = 'INTERVIEW';
                else if (rawScenario.includes('profile') || rawScenario.includes('profiling')) subType = 'PROFILING';

                if (!matchedAgentId) {
                    const agent = await matchAgent({
                        userId: accountUid,
                        scenario: subType,
                        agentType: 'CONVERSATIONAL',
                        userType: userType
                    });
                    if (agent) {
                        matchedAgentId = agent.id;
                        console.log('[useAgoraVoiceAgent] Matched Agent:', agent.name, agent.id);
                        agentIdRef.current = agent.id;
                    }
                }
            } catch (configErr) {
                console.warn('[useAgoraVoiceAgent] Failed to match agent, proceeding with defaults...', configErr);
            }

            // 3. Initialize Helpers
            console.log('[useAgoraVoiceAgent] 3. Initializing Helpers...');
            const rtcHelper = RTCHelper.getInstance();
            const rtmHelper = RTMHelper.getInstance();

            // Check abort before expensive async ops
            if (attemptIdRef.current !== currentAttemptId) {
                console.warn('[useAgoraVoiceAgent] Session aborted before token retrieval');
                return;
            }

            // 4. Retrieve Token
            console.log(`[useAgoraVoiceAgent] 4. Retrieving Token for UID: ${effectiveUid}, Channel: ${channelName}`);
            // Note: retrieveToken in RTCHelper uses getAgentToken internally
            const tokenData = await rtcHelper.retrieveToken(effectiveUid, channelName, false, { agentId: matchedAgentId });

            if (attemptIdRef.current !== currentAttemptId) {
                console.warn('[useAgoraVoiceAgent] Session aborted after token retrieval');
                return;
            }

            const sessionId = tokenData?.sessionId;
            console.log('[useAgoraVoiceAgent] Token retrieved successfully', { sessionId });

            // Sync local refs with helper data
            const appId = rtcHelper.appId!;
            const token = rtcHelper.token!;
            appIdRef.current = appId;
            const rtmToken = rtcHelper.rtmToken;
            const finalUid = rtcHelper.userId || uid;
            uidRef.current = finalUid;

            console.log('[useAgoraVoiceAgent] Token Info:', {
                appId,
                uid: finalUid,
                hasRtmToken: !!rtmToken,
                tokenPrefix: token?.substring(0, 10) + '...'
            });

            // 5. Initialize RTM
            console.log('[useAgoraVoiceAgent] 5. Initializing RTM with AppID:', appId, 'UID:', finalUid);
            rtmHelper.initClient({
                app_id: appId,
                user_id: String(finalUid)
            });
            const finalRtmToken = rtmToken || token;
            console.log('[useAgoraVoiceAgent] Logging into RTM with token type:', rtmToken ? 'RTM-Specific (Type 0)' : 'RTC-Fallback (Type 1)');

            if (attemptIdRef.current !== currentAttemptId) {
                console.warn('[useAgoraVoiceAgent] Session aborted before RTM login');
                return;
            }

            const rtmEngine = await rtmHelper.login(finalRtmToken);
            console.log('[useAgoraVoiceAgent] RTM Login successful');

            if (attemptIdRef.current !== currentAttemptId) {
                console.warn('[useAgoraVoiceAgent] Session aborted after RTM login');
                // Cleanup RTM if we aborted right after login
                await rtmHelper.exitAndCleanup();
                return;
            }

            // 6. Initialize ConversationalAIAPI
            console.log('[useAgoraVoiceAgent] 6. Initializing ConversationalAIAPI');
            const conversationalAIAPI = ConversationalAIAPI.init({
                rtcEngine: rtcHelper.client,
                rtmEngine: rtmEngine,
                enableLog: true, // Enable logs for debugging
                renderMode: ETranscriptHelperMode.TEXT // Use text mode for subtitles
            });

            // 7. Bind Events
            console.log('[useAgoraVoiceAgent] 7. Binding Events');
            conversationalAIAPI.on(
                EConversationalAIAPIEvents.TRANSCRIPT_UPDATED,
                (chatHistory: ITranscriptHelperItem<Partial<IUserTranscription | IAgentTranscription>>[]) => {
                    // Get the latest item
                    const latest = chatHistory[chatHistory.length - 1];
                    if (latest) {
                        const text = latest.text || '';
                        const isUser = latest.metadata?.object === EMessageType.USER_TRANSCRIPTION;
                        const role = isUser ? 'user' : 'assistant';
                        let isFinal = true;
                        if (latest.metadata && isUser) {
                            isFinal = (latest.metadata as IUserTranscription).final;
                        } else if (latest.status === ETurnStatus.IN_PROGRESS) {
                            isFinal = false;
                        }
                        if (text) {
                            onTranscript?.(text, role, isFinal);
                        }
                    }
                }
            );

            conversationalAIAPI.on(
                EConversationalAIAPIEvents.AGENT_STATE_CHANGED,
                (agentUserId, event) => {
                    console.log(`[useAgoraVoiceAgent] Agent State Changed: ${event.state}`, event);
                    // Map generic states if necessary, or pass through
                    // Assuming event.state matches AgentState or similar
                    // event.state could be 'listening', 'speaking', 'thinking'
                    // Normalize to lower case just in case
                    const rawState = String(event.state).toLowerCase();
                    const state = rawState as AgentState;
                    setConnectionStatus(state);
                    onAgentStateChange?.(state);
                }
            );

            // Listen for volume indicators
            rtcHelper.client.enableAudioVolumeIndicator();
            rtcHelper.client.on("volume-indicator", (volumes) => {
                volumes.forEach((vol) => {
                    // Local user
                    if (vol.uid === finalUid || vol.uid === 0) {
                        setLocalVolumeLevel(Math.min(100, Math.round(vol.level)));
                    } 
                    // Remote agent (approximate check)
                    else {
                        setVolumeLevel(Math.min(100, Math.round(vol.level)));
                    }
                });
            });

            // Listen for internal debug logs from ConversationalAIAPI
            conversationalAIAPI.on(
                EConversationalAIAPIEvents.DEBUG_LOG,
                (message) => {
                    console.log(`[ConversationalAIAPI Debug] ${message}`);
                }
            );

            conversationalAIAPI.on(
                EConversationalAIAPIEvents.AGENT_ERROR,
                (agentUserId, error) => {
                    console.error(`[ConversationalAIAPI Error] Agent: ${agentUserId}, Error:`, error);
                }
            );

            // Subscribe to channel messages (handles PTS sync internally via CovSubRenderController)
            console.log('[useAgoraVoiceAgent] Subscribing to channel messages');
            conversationalAIAPI.subscribeMessage(channelName);

            // 8. Setup Audio & Join RTC
            console.log('[useAgoraVoiceAgent] 8. Setting up Audio & Joining RTC');
            // Temporarily disable denoiser to rule out WASM/AudioContext issues causing ICE timeout
            // await rtcHelper.initDenoiserProcessor();
            const tracks = await rtcHelper.createTracks();
            localAudioTrack.current = tracks.audioTrack || null;
            setActiveAudioTrack(tracks.audioTrack || null);

            // Subscribe to connection state changes
            rtcHelper.client.on('connection-state-change', (curState, revState, reason) => {
                console.log(`[useAgoraVoiceAgent] Connection State Changed: ${revState} -> ${curState}, Reason: ${reason}`);
                if (curState === 'DISCONNECTED' && reason !== 'LEAVE') {
                    setConnectionStatus('error');
                    onAgentStateChange?.('error');
                    toast.error(`语音连接中断: ${reason}`);
                }
            });

            // Subscribe to remote users
            rtcHelper.client.on('user-published', async (user, mediaType) => {
                console.log('[useAgoraVoiceAgent] User Published:', user.uid, mediaType);
                await rtcHelper.client.subscribe(user, mediaType);
                if (mediaType === 'audio') {
                    user.audioTrack?.play();
                    setRemoteAudioTrack(user.audioTrack || null);
                    console.log('[useAgoraVoiceAgent] Remote Audio Track playing for user:', user.uid);
                }
            });

            rtcHelper.client.on('user-unpublished', (user) => {
                console.log('[useAgoraVoiceAgent] User Unpublished:', user.uid);
                if (user.audioTrack) {
                    user.audioTrack.stop();
                    if (remoteAudioTrack?.getTrackId() === user.audioTrack.getTrackId()) {
                        setRemoteAudioTrack(null);
                    }
                }
            });

            if (attemptIdRef.current !== currentAttemptId) {
                console.warn('[useAgoraVoiceAgent] Session aborted before RTC join');
                // Cleanup potential partial setups
                await rtmHelper.exitAndCleanup();
                return;
            }

            await rtmHelper.join(channelName);
            console.log('[useAgoraVoiceAgent] RTM Joined Channel:', channelName);

            await rtcHelper.join({
                channel: channelName,
                userId: finalUid,
                options: { devMode: false }
            });
            console.log('[useAgoraVoiceAgent] RTC Joined Channel:', channelName);

            await rtcHelper.publishTracks();
            console.log('[useAgoraVoiceAgent] Local tracks published');

            if (attemptIdRef.current !== currentAttemptId) {
                console.warn('[useAgoraVoiceAgent] Session aborted before Agent start');
                // Full cleanup required
                stopSession(); // This is safe as it just clears flags and cleans up
                return;
            }

            // 9. Start Agent Backend
            // Use random Agent UID to match VoiceAgent pattern
            const targetAgentUid = agentUidRef.current;
            console.log('[useAgoraVoiceAgent] 9. Starting Agent with Target UID:', targetAgentUid);

            // Note: We use the User's RTC Token (Type 1) for the startAgent payload
            // This aligns with VoiceAgent's behavior where it passes the token used for joining.
            const userToken = rtcHelper.token;

            // Parse Env Config for TTS/ASR/LLM
            const ttsVendor = import.meta.env.NEXT_PUBLIC_CUSTOM_TTS_VENDOR || 'cosyvoice';
            let ttsParams = { voice: 'female', speed: 0.9, volume: 1.0 };
            try {
                const envTtsParams = import.meta.env.NEXT_PUBLIC_CUSTOM_TTS_PARAMS;
                if (envTtsParams) {
                    const parsed = JSON.parse(envTtsParams);
                    ttsParams = { ...ttsParams, ...parsed };
                }
            } catch (e) {
                console.warn('[useAgoraVoiceAgent] Failed to parse TTS params from env', e);
            }

            const asrLang = import.meta.env.NEXT_PUBLIC_CUSTOM_ASR_LANG || 'zh-CN';

            let modelId: string | undefined = configModelId || agentId;
            let llmParams: Record<string, any> = {};
            let llmUrl: string | undefined = undefined;
            let llmKey: string | undefined = undefined;
            let llmSystemMessages: any[] | undefined = undefined;

            try {
                const envLlmParams = import.meta.env.NEXT_PUBLIC_CUSTOM_LLM_PARAMS;
                if (envLlmParams) {
                    const parsed = JSON.parse(envLlmParams);
                    if (parsed.model) {
                        modelId = parsed.model;
                    }
                    llmParams = parsed;
                }

                llmUrl = import.meta.env.NEXT_PUBLIC_CUSTOM_LLM_URL;
                llmKey = import.meta.env.NEXT_PUBLIC_CUSTOM_LLM_KEY;

                const envSystemMessages = import.meta.env.NEXT_PUBLIC_CUSTOM_LLM_SYSTEM_MESSAGES;
                if (envSystemMessages) {
                    const parsed = JSON.parse(envSystemMessages);
                    if (Array.isArray(parsed)) {
                        llmSystemMessages = parsed;
                    }
                }
            } catch (e) {
                console.warn('[useAgoraVoiceAgent] Failed to parse LLM params from env', e);
            }

            // Combine system prompt with env system messages if needed
            // Priority: systemPrompt (arg) > envSystemMessages > default
            let finalSystemMessages = [{ role: 'system', content: systemPrompt || '' }];
            if (llmSystemMessages && llmSystemMessages.length > 0) {
                // If env provides system messages, we might want to use them.
                // However, systemPrompt is usually dynamic. 
                // Strategy: If systemPrompt is empty, use env. If both exist, prepend env?
                // For now, let's append systemPrompt to env messages if both exist, or just use systemPrompt if env is empty.
                if (systemPrompt) {
                    finalSystemMessages = [...llmSystemMessages, { role: 'user', content: systemPrompt }]; // Treat systemPrompt as user instruction? Or system?
                    // Actually, usually systemPrompt IS the system instruction.
                    // If the user configured a specific persona in .env, we should probably respect it.
                    // Let's just use env messages if available, and ignore systemPrompt if it conflicts?
                    // Or better: Use systemPrompt as the primary system message, and env as fallback?
                    // Let's stick to: Use systemPrompt if provided. If not, use env.
                } else {
                    finalSystemMessages = llmSystemMessages;
                }
            }

            // Simplified strategy: Just pass what we have. 
            // If llmUrl is provided, we pass it to bypass model-service lookup.

            let startRes;
            if (sessionId) {
                console.log('[useAgoraVoiceAgent] Using EchoHub Session Agent flow', { sessionId });

                // Construct base payload
                const sessionAgentPayload: any = {
                    name: `agent-${sessionId}`,
                    remoteRtcUids: [String(finalUid)],
                    modelId
                };

                // If properties provided (from matchAgent), use them as source of truth.
                // Session Service will handle the merge logic (baseProps = properties).
                if (properties) {
                    console.log('[useAgoraVoiceAgent] Using provided properties for agent configuration');
                    sessionAgentPayload.properties = properties;
                    // We intentionally omit top-level llm/tts/asr here to allow properties to take precedence via Session Service logic
                    // However, we still need to pass remoteRtcUids as it is required/merged.
                } else {
                    // Fallback to legacy construction if no properties provided
                    const llmPayload: any = {
                        system_messages: finalSystemMessages,
                        params: llmParams
                    };

                    if (llmUrl) {
                        llmPayload.url = llmUrl;
                        llmPayload.vendor = 'custom';
                    }
                    if (llmKey) {
                        llmPayload.api_key = llmKey;
                    }

                    sessionAgentPayload.llm = llmPayload;
                    sessionAgentPayload.tts = {
                        vendor: ttsVendor,
                        params: ttsParams
                    };
                    sessionAgentPayload.asr = {
                        lang: asrLang
                    };
                    sessionAgentPayload.advanced_features = {
                        enable_rtm: true,
                        enable_bhvs: false,
                        enable_aivad: false
                    };
                }

                startRes = await createEchoHubSessionAgent(sessionId, sessionAgentPayload);
            } else {
                console.log('[useAgoraVoiceAgent] Using Legacy VoiceAgent flow');
                startRes = await startAgent({
                    channel: channelName,
                    token: userToken || '',
                    preset_name: presetNameRef.current,
                    agent_rtc_uid: targetAgentUid,
                    remote_rtc_uids: [String(finalUid)],
                    advanced_features: {
                        enable_bhvs: false,
                        enable_aivad: false,
                        enable_rtm: true,
                        enable_sal: false
                    },
                    parameters: {
                        audio_scenario: 'default'
                    },
                    llm: {
                        system_messages: JSON.stringify([{ role: 'system', content: systemPrompt || '' }])
                    }
                });
            }

            console.log('[useAgoraVoiceAgent] startAgent response:', startRes);
            if (startRes) {
                // EchoHub returns { data: { agent: { agent_id: ... } } } or similar structure?
                // createEchoHubSessionAgent returns resp.data. 
                // EchoHub BFF returns: { code: 0, data: { agent: result } } where result has agent_id.
                // startAgent returns: remoteResp.data (which has agent_id).

                // We need to normalize the response or handle both.
                // EchoHub: startRes.data?.agent?.agent_id || startRes.data?.agent_id || startRes.agent_id
                const agentData = startRes.data?.agent || startRes.data || startRes;
                agentIdRef.current = agentData.agent_id || '';

                // Sync Agent RTC UID from backend response to ensure interrupt/sendText works with the correct target
                if (agentData.agent_rtc_uid) {
                    agentUidRef.current = String(agentData.agent_rtc_uid);
                    console.log('[useAgoraVoiceAgent] Updated agentUidRef to backend UID:', agentUidRef.current);
                }

                if (agentIdRef.current) startHeartBeat(channelName);

                console.log('[useAgoraVoiceAgent] Agent Started successfully, ID:', agentIdRef.current);
            }

            // Connection established successfully
            clearConnectionTimeout();

            setConnectionStatus('listening');
            onAgentStateChange?.('listening');

        } catch (err: any) {
            if (attemptIdRef.current !== currentAttemptId) {
                console.warn('[useAgoraVoiceAgent] Session aborted during error handling');
                return;
            }
            console.error("Failed to start session:", err);
            setConnectionStatus('error');
            onAgentStateChange?.('error');

            if (err.message?.includes("token")) {
                toast.error("鉴权失败，请重试");
            } else {
                toast.error(`语音服务连接失败: ${err.message || '未知错误'}`);
            }
            stopSession();
        }
    }, [connectionStatus, onAgentStateChange]);

    const stopSession = useCallback(async () => {
        attemptIdRef.current = ''; // Invalidate any running startup attempts
        try {
            const rtcHelper = RTCHelper.getInstance();
            const rtmHelper = RTMHelper.getInstance();

            try {
                const conversationalAIAPI = ConversationalAIAPI.getInstance();
                conversationalAIAPI.unsubscribe();
                conversationalAIAPI.removeAllEventListeners();
            } catch (e) {
                // ConversationalAIAPI might not be initialized if session failed early or wasn't started
                // We can safely ignore this error during cleanup
            }

            // We don't destroy singleton instances completely as they might be reused, 
            // but for EchoSpark (which likely unmounts), we should probably clean up.
            // VoiceAgent uses `exitAndCleanup`.

            clearHeartBeat();
            clearConnectionTimeout();

            await rtcHelper.exitAndCleanup();
            await rtmHelper.exitAndCleanup();
            // conversationalAIAPI.destroy(); // Optional, but good for full reset

            if (agentIdRef.current) {
                await stopAgent({
                    agent_id: agentIdRef.current,
                    channel_name: channelRef.current,
                    preset_name: presetNameRef.current
                });
                agentIdRef.current = '';
            }

            setConnectionStatus('idle');
            onAgentStateChange?.('idle');
            setActiveAudioTrack(null);
        } catch (err) {
            console.error("Error stopping session:", err);
        }
    }, []);

    const interrupt = useCallback(async () => {
        if (!agentIdRef.current) return;
        try {
            // Use ConversationalAIAPI interrupt
            const conversationalAIAPI = ConversationalAIAPI.getInstance();
            await conversationalAIAPI.interrupt(agentUidRef.current);
            onAgentStateChange?.('listening');
        } catch (e) {
            console.error("Failed to send interrupt:", e);
        }
    }, [onAgentStateChange]);

    const sendText = useCallback(async (text: string) => {
        try {
            const conversationalAIAPI = ConversationalAIAPI.getInstance();
            await conversationalAIAPI.sendText(String(agentUidRef.current), {
                text: text,
                priority: EChatMessagePriority.INTERRUPTED,
                responseInterruptable: true,
                messageType: EChatMessageType.TEXT
            });
            onTranscript?.(text, 'user', true);
        } catch (e) {
            console.error("Failed to send text:", e);
        }
    }, [onTranscript]);

    const setMute = useCallback((muted: boolean) => {
        if (localAudioTrack.current) {
            localAudioTrack.current.setEnabled(!muted);
        }
    }, []);

    return {
        connectionStatus,
        volumeLevel,
        localVolumeLevel,
        getFrequencyBands,
        startSession,
        stopSession,
        interrupt,
        sendText,
        setMute
    };
};
