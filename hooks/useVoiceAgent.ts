import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ConversationalAIAPI,
  EConversationalAIAPIEvents,
  ETranscriptHelperMode,
  IChatMessageText,
  EChatMessageType,
  EChatMessagePriority,
  EMessageType,
} from '../conversational-ai-api';
import { ERTCCustomEvents } from '../conversational-ai-api/type';
import { RTCHelper } from '../conversational-ai-api/helper/rtc';
import { RTMHelper } from '../conversational-ai-api/helper/rtm';
import { genChannelName } from '../lib/utils';
import { startAgent, stopAgent, heartbeat } from '../services/agentService';
import { HEARTBEAT_INTERVAL, FIRST_START_TIMEOUT } from '../constants/agent';

export interface UseVoiceAgentOptions {
  onMessage?: (message: any) => void;
  onAgentStateChange?: (state: string) => void;
  onUserJoined?: (user: any) => void;
  onUserLeft?: (user: any) => void;
  onError?: (error: any) => void;
  enableLog?: boolean;
}

export const useVoiceAgent = (options: UseVoiceAgentOptions = {}) => {
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [agentState, setAgentState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [channelName, setChannelName] = useState<string>('');

  const isMutedRef = useRef(false);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const agentStartedRef = useRef<boolean>(false);
  const agentIdRef = useRef<string>('');
  const agentUserIdRef = useRef<string>(''); // The RTM/RTC UID of the agent
  const myUserIdRef = useRef<string>('');
  const startupAttemptRef = useRef<string>('');
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const agentStartTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback((agentId: string, channel: string) => {
    clearHeartbeat();
    const sendPing = async () => {
      try {
        await heartbeat({
          agent_id: agentId,
          channel_name: channel,
          preset_name: 'default'
        });
      } catch (error) {
        console.warn('Heartbeat failed', error);
      }
    };
    
    // Send immediate ping
    sendPing();

    // Start interval
    heartbeatRef.current = setInterval(sendPing, HEARTBEAT_INTERVAL);
  }, [clearHeartbeat]);

  const stopSession = useCallback(async (options?: { retainStatus?: boolean }) => {
    // Invalidate any ongoing startup attempt
    startupAttemptRef.current = '';

    // Clear timers
    clearHeartbeat();
    if (agentStartTimeoutRef.current) {
      clearTimeout(agentStartTimeoutRef.current);
      agentStartTimeoutRef.current = null;
    }

    try {
      if (agentStartedRef.current && agentIdRef.current && channelName) {
        await stopAgent({
          channel_name: channelName,
          preset_name: 'default',
          agent_id: agentIdRef.current
        });
      }

      const rtcHelper = RTCHelper.getInstance();
      const rtmHelper = RTMHelper.getInstance();

      try {
        const conversationalAIAPI = ConversationalAIAPI.getInstance();
        conversationalAIAPI?.unsubscribe();
        conversationalAIAPI?.destroy();
      } catch (e) {
        // Ignore if not init
      }

      await rtcHelper.exitAndCleanup();
      if (rtmHelper.client) {
        await rtmHelper.exitAndCleanup();
      }

      agentStartedRef.current = false;
      agentIdRef.current = '';

      if (!options?.retainStatus) {
        setConnectionStatus('idle');
        setAgentState('idle');
      }

    } catch (err) {
      console.error("Stop session error", err);
      // Even if stop fails, we probably want to reset state unless retainStatus is true
      if (!options?.retainStatus) {
        setConnectionStatus('idle');
        setAgentState('idle');
      }
      // We don't call onError here to avoid loops if onError calls stopSession
    }
  }, [channelName, clearHeartbeat]);

  const startSession = useCallback(async (systemInstruction: string, userId?: string) => {
    if (agentStartedRef.current) return;

    // Generate unique ID for this startup attempt
    const attemptId = Math.random().toString(36).substring(7);
    startupAttemptRef.current = attemptId;

    try {
      setConnectionStatus('connecting');
      const rtcHelper = RTCHelper.getInstance();
      const rtmHelper = RTMHelper.getInstance();

      // Use a pure numeric UID to ensure compatibility with backend agents that require Int UIDs
      // We use current timestamp + random part to ensure uniqueness within int32 range (roughly)
      // Max safe integer is 9e15, but Agora UID (int) is uint32 (0 to 4294967295)
      // So we use a smaller random number.
      const numericId = Math.floor(Math.random() * 100000000) + 1;
      const uid = userId ? userId : String(numericId);
      const channel = genChannelName();

      myUserIdRef.current = uid;
      setChannelName(channel);

      // Check cancellation
      if (startupAttemptRef.current !== attemptId) return;

      // 1. Get Token
      await rtcHelper.retrieveToken(uid, channel);

      // Check cancellation
      if (startupAttemptRef.current !== attemptId) return;

      // 2. Init RTM
      if (rtcHelper.appId && rtcHelper.token) {
        rtmHelper.initClient({ app_id: rtcHelper.appId, user_id: uid });
        await rtmHelper.login(rtcHelper.rtmToken || rtcHelper.token);

        // Check cancellation
        if (startupAttemptRef.current !== attemptId) return;

        await rtmHelper.join(channel);
      } else {
        throw new Error('Failed to retrieve token');
      }

      // Check cancellation
      if (startupAttemptRef.current !== attemptId) return;

      // 3. Init ConversationalAIAPI
      if (!rtcHelper.client || !rtmHelper.client) {
        throw new Error('RTC or RTM client not initialized');
      }

      const conversationalAIAPI = ConversationalAIAPI.init({
        rtcEngine: rtcHelper.client,
        rtmEngine: rtmHelper.client,
        renderMode: ETranscriptHelperMode.TEXT,
        enableLog: options.enableLog
      });

      // 4. Subscribe events
      conversationalAIAPI.on(EConversationalAIAPIEvents.TRANSCRIPT_UPDATED, (items) => {
        options.onMessage?.(items);
      });

      conversationalAIAPI.on(EConversationalAIAPIEvents.AGENT_STATE_CHANGED, (uid, state) => {
        setAgentState(state.state as any);
        options.onAgentStateChange?.(state.state);
      });

      rtcHelper.on(ERTCCustomEvents.REMOTE_USER_JOINED, (user) => {
        // Clear timeout on agent join
        if (agentStartTimeoutRef.current) {
          clearTimeout(agentStartTimeoutRef.current);
          agentStartTimeoutRef.current = null;
        }
        setConnectionStatus('connected');
        options.onUserJoined?.(user);
      });

      rtcHelper.on(ERTCCustomEvents.REMOTE_USER_LEFT, (user) => {
        options.onUserLeft?.(user);
      });

      conversationalAIAPI.subscribeMessage(channel);

      // 5. Join RTC
      await rtcHelper.createTracks();

      // Check cancellation
      if (startupAttemptRef.current !== attemptId) return;

      // Ensure we join with a numeric UID (aligned with type: 1 token)
      const numericUid = Number(uid);
      const joinUid = !isNaN(numericUid) ? numericUid : uid;

      // If we are forced to use numeric UID but have a string UID that can't be parsed,
      // this might fail if the token is strictly numeric.
      // But we just generated a numeric UID above, so it should be fine.
      await rtcHelper.join({ channel: channel, userId: joinUid });
      await rtcHelper.publishTracks();

      // Ensure track mute state matches isMutedRef (in case user muted during startup)
      if (isMutedRef.current && rtcHelper.localTracks.audioTrack) {
        await rtcHelper.localTracks.audioTrack.setEnabled(false);
      }

      // Check cancellation
      if (startupAttemptRef.current !== attemptId) return;

      // 6. Start Agent
      // Use numeric UID for agent to match backend requirements
      const numericUserId = Number(uid);
      // If user UID is numeric, Agent UID is usually userUID + 1 or similar convention, 
      // or we can pass a large random number.
      // But agentService usually expects `agent_rtc_uid` as string in JSON, but value should be numeric string.
      const agentRtcUid = !isNaN(numericUserId) ? String(numericUserId + 1) : `${uid}-agent`;

      agentUserIdRef.current = agentRtcUid;

      // Set timeout for agent start
      agentStartTimeoutRef.current = setTimeout(() => {
        if (startupAttemptRef.current === attemptId) {
          console.error("Agent start timed out");
          stopSession({ retainStatus: true });
          setConnectionStatus('error');
          options.onError?.(new Error("Agent start timed out"));
        }
      }, FIRST_START_TIMEOUT);

      const startData = await startAgent({
        channel: channel,
        token: rtcHelper.token ?? undefined,
        agent_rtc_uid: agentRtcUid,
        remote_rtc_uids: [uid],
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

      // Check cancellation before marking as started
      if (startupAttemptRef.current !== attemptId) {
        // If aborted after startAgent, we might want to stop it?
        // But stopSession() should handle it.
        return;
      }

      agentIdRef.current = startData.agent_id;
      agentStartedRef.current = true;

      // Start heartbeat
      startHeartbeat(startData.agent_id, channel);

    } catch (err) {
      // If error occurred but we were already aborted, ignore the error
      if (startupAttemptRef.current !== attemptId) {
        console.log("Session startup aborted, ignoring error:", err);
        return;
      }

      console.error("Failed to start voice session", err);
      // Clean up first, but retain error status
      await stopSession({ retainStatus: true });
      setConnectionStatus('error');
      options.onError?.(err);
    }
  }, [options, stopSession, startHeartbeat]);

  const interrupt = useCallback(async () => {
    try {
      const conversationalAIAPI = ConversationalAIAPI.getInstance();
      const agentUid = agentUserIdRef.current;
      if (agentUid) {
        await conversationalAIAPI.interrupt(agentUid);
      }
    } catch (e) {
      console.warn("Interrupt failed", e);
    }
  }, []);

  const sendText = useCallback(async (text: string) => {
    try {
      const conversationalAIAPI = ConversationalAIAPI.getInstance();
      const agentUid = agentUserIdRef.current;
      if (agentUid) {
        await conversationalAIAPI.chat(agentUid, {
          messageType: EChatMessageType.TEXT,
          priority: EChatMessagePriority.INTERRUPTED,
          responseInterruptable: true,
          text: text
        } as IChatMessageText);
      }
    } catch (e) {
      console.warn("Send text failed", e);
    }
  }, []);

  const toggleMute = useCallback(async () => {
    const rtcHelper = RTCHelper.getInstance();
    if (isMuted) {
      await rtcHelper.localTracks.audioTrack?.setEnabled(true);
      setIsMuted(false);
    } else {
      await rtcHelper.localTracks.audioTrack?.setEnabled(false);
      setIsMuted(true);
    }
  }, [isMuted]);

  return {
    startSession,
    stopSession,
    interrupt,
    sendText,
    toggleMute,
    connectionStatus,
    agentState,
    isMuted,
    channelName
  };
};
