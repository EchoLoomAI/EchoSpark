import { toast } from 'sonner'
import * as z from 'zod'
import {
  API_AGENT,
  API_AGENT_CUSTOM_PRESET,
  API_AGENT_PING,
  API_AGENT_PRESETS,
  API_AGENT_STOP,
  API_TOKEN,
  API_UPLOAD_FILE,
  API_UPLOAD_IMAGE,
  API_UPLOAD_LOG,
  ERROR_CODE,
  ERROR_MESSAGE,
  REMOTE_CONVOAI_AGENT_START,
  REMOTE_CONVOAI_AGENT_STOP,
  REMOTE_CONVOAI_AGENT_PING,
  REMOTE_CONVOAI_AGENT_PRESETS,
  REMOTE_CONVOAI_GET_CUSTOM_PRESET,
  REMOTE_TOKEN_GENERATE,
  REMOTE_UPLOAD_IMAGE,
  REMOTE_UPLOAD_LOG,
  localOpensourceStartAgentPropertiesSchema,
  localStartAgentPropertiesSchema,
  remoteAgentCustomPresetItem,
  remoteAgentFileUploadSchema,
  remoteAgentPingReqSchema,
  remoteAgentStartRespDataDevSchema,
  remoteAgentStartRespDataSchema,
  remoteAgentStopSettingsSchema,
  basicRemoteResSchema,
  localResSchema,
  type SIP_ERROR_CODE
} from '../constants'
import { generateDevModeQuery } from '../lib/dev'
import { genUUID } from '../lib/utils'
import type {
  IAgentPreset,
  IUploadLogInput,
  IUserInfoInput
} from '../type/agent'
import type { TDevModeQuery } from '../type/dev'
import api from './api'

export class ResourceLimitError extends Error {
  public readonly code: ERROR_CODE | SIP_ERROR_CODE

  constructor(code: ERROR_CODE, message?: string) {
    super(message)
    this.name = 'ResourceLimitError'
    this.code = code
  }
}

// Helper to handle API response parsing
const parseResponse = <T>(response: any, schema: z.ZodType<T>) => {
  return schema.parse(response)
}

export const getAgentPresets = async (options?: TDevModeQuery) => {
  const { devMode, accountUid } = options ?? {}
  const query = generateDevModeQuery({ devMode })
  const baseURL = (import.meta as any)?.env?.VITE_API_BASE_URL || ''
  const isRemoteToolbox = baseURL.includes('service.apprtc.cn')

  if (isRemoteToolbox) {
    const resp = await api.get(REMOTE_CONVOAI_AGENT_PRESETS)
    const respData = resp.data
    // Remote returns { code: 0, data: [...], msg: "success" }
    if (respData.code !== 0) {
      console.error('Failed to fetch presets:', respData)
      return []
    }
    return respData.data as IAgentPreset[]
  }

  const url = `${API_AGENT_PRESETS}${query}`

  if (!accountUid) return null;

  const resp = await api.get(url)
  return resp.data as IAgentPreset[]
}

export const getAgentToken = async (
  userId: string | number,
  channel?: string,
  options?: TDevModeQuery
) => {
  const { devMode } = options ?? {}
  const query = generateDevModeQuery({ devMode })
  const baseURL = (import.meta as any)?.env?.VITE_API_BASE_URL || ''
  const isRemoteToolbox = baseURL.includes('service.apprtc.cn')

  // Check if we have an auth token.
  // NOTE: For EchoSpark integration with VoiceAgent (Port 3001), we MUST use the VoiceAgent BFF endpoint (/api/token).
  // The authenticated EchoHub endpoint (/api/sessions) is NOT available via the VoiceAgent proxy.
  // Therefore, we force the "Guest/Remote" logic path which uses /api/token.
  const authToken = localStorage.getItem('token');
  const isGuest = !authToken;
  const forceVoiceAgentBFF = true;

  if (isRemoteToolbox || isGuest || forceVoiceAgentBFF) {
    const appId =
      (import.meta as any)?.env?.VITE_AGORA_APP_ID ||
      (import.meta as any)?.env?.AGORA_APP_ID ||
      'bfe2d1894795467e8fbc81cdd61fe329'
    if (!appId) {
      throw new Error('AGORA AppId 未配置')
    }

    // If local guest or forced BFF, we need to route through /api proxy (or /v2 if configured)
    // REMOTE_TOKEN_GENERATE is /v2/convoai/token/generate
    // We have a proxy rule for /v2 in vite.config.ts, so we don't need /api prefix
    const endpoint = REMOTE_TOKEN_GENERATE;
    const remoteUrl = `${endpoint}${query}`

    const numericUid = Number(userId);
    const isIntUid = !isNaN(numericUid);

    // VoiceAgent /api/token expects snake_case, but EchoHub BFF /v2 expects camelCase
    const resp = await api.post(remoteUrl, {
      request_id: genUUID(),
      channelName: channel ?? '', // Fixed for EchoHub BFF /v2 endpoint
      channel_name: channel ?? '', // Kept for compatibility if needed
      uid: String(userId),
      // Optional fields for direct EchoHub (if bypassing VoiceAgent)
      appId: appId,
      type: isIntUid ? 1 : 0,
      src: 'Web',
      ts: Date.now().toString()
    });

    const respData = resp.data
    console.log('Token Response:', respData);

    const token = respData?.data?.token
    let rtmToken = respData?.data?.rtmToken;

    // Fallback if no separate RTM token
    if (!rtmToken) {
      rtmToken = token;
    }

    if (!token) {
      throw new Error('Token 生成失败')
    }

    // Prefer server-returned AppID if available to ensure consistency
    const effectiveAppId = respData?.data?.appId || appId;

    return {
      code: respData.code,
      msg: respData.msg,
      data: {
        token,
        rtmToken, // Return explicit RTM token
        sessionId: respData?.data?.sessionId,
        appId: effectiveAppId,
        uid: respData?.data?.uid // Return server-assigned UID
      }
    }
  } else {
    // Unreachable code kept for reference if needed later for direct EchoHub integration
    // Direct EchoHub logic (Authenticated)
    const url = `${API_TOKEN}${query}` // API_TOKEN is now /api/sessions -> /v1/sessions

    const numericUid = Number(userId);
    const requestUid = !isNaN(numericUid) ? numericUid : `${userId}`;

    const echoHubPayload = {
      channel: channel ?? '',
      creator: requestUid,
      tenantId: '1'
    }

    const resp = await api.post(url, echoHubPayload)
    const respData = resp.data

    // EchoHub Response: { code: 0, data: { agoraToken, session: { id } } }
    if (respData.code !== 0 && respData.code !== 200 && respData.code !== 'OK') {
      throw new Error(respData.message || 'Failed to retrieve token from EchoHub')
    }

    const token = respData.data?.agoraToken
    let rtmToken = respData.data?.rtmToken
    const sessionId = respData.data?.session?.id
    // Prefer the explicitly returned numeric UID (for Agent compatibility), fallback to creator ID
    const authorizedUid = respData.data?.uid || respData.data?.session?.creator

    // Try to get App ID from response, otherwise fallback to env
    const responseAppId = respData.data?.appId || respData.data?.app_id;
    const envAppId = (import.meta as any)?.env?.VITE_AGORA_APP_ID || (import.meta as any)?.env?.AGORA_APP_ID || 'bfe2d1894795467e8fbc81cdd61fe329';
    const appId = responseAppId || envAppId;

    if (responseAppId && responseAppId !== envAppId) {
      console.warn('[getAgentToken] Server returned AppID differs from local env AppID', { server: responseAppId, local: envAppId });
    }

    // If RTM token is missing, try to fetch it explicitly (Type 0 for String UID)
    if (!rtmToken && token) {
      // Validate RTC Token format (sanity check)
      if (token.startsWith('{') || token.startsWith('ey')) {
        console.error('[getAgentToken] CRITICAL ERROR: RTC Token appears to be a JSON string or JWT, NOT an Agora Token! Server is misbehaving.', token.substring(0, 50));
      }

      try {
        const rtmUrl = `/api${REMOTE_TOKEN_GENERATE}${query}`
        console.log('[getAgentToken] Fetching separate RTM token for authenticated user...', { uid: String(userId), appId });
        const rtmResp = await api.post(rtmUrl, {
          appId,
          channelName: channel ?? '',
          uid: String(userId),
          type: 0, // RTM Token
          src: 'Web',
          ts: Date.now().toString()
        })

        console.log('[getAgentToken] Raw RTM Fetch Response:', rtmResp.data);

        if (rtmResp.data?.code === 0 && rtmResp.data?.data?.token) {
          const candidateToken = rtmResp.data.data.token;
          // Sanity check for RTM token too
          if (typeof candidateToken === 'string' && !candidateToken.startsWith('{') && !candidateToken.includes('channel')) {
            rtmToken = candidateToken
            console.log('[getAgentToken] Fetched separate RTM token successfully')
          } else {
            console.error('[getAgentToken] Fetched RTM token is INVALID (looks like JSON/Request Body):', candidateToken);
          }
        } else {
          console.warn('[getAgentToken] RTM token fetch returned error', rtmResp.data);
        }
      } catch (e) {
        console.warn('[getAgentToken] Failed to fetch separate RTM token, will fallback to RTC token', e)
      }
    }

    // Fallback to RTC token if RTM fetch failed
    if (!rtmToken) {
      rtmToken = token
    }

    if (!token) {
      throw new Error('Token missing in EchoHub response')
    }

    return {
      code: 0,
      msg: 'success',
      data: {
        token,
        appId,
        rtmToken,
        sessionId,
        uid: authorizedUid // Return the actual UID used for token generation
      }
    }
  }
}

// Authenticated EchoHub: attach agent to an existing session
export const createEchoHubSessionAgent = async (
  sessionId: string,
  body: {
    name?: string
    remoteRtcUids?: (string | number)[]
    asr?: any
    tts?: any
    llm?: any
    modelId?: string
  }
) => {
  const url = `/api/sessions/${sessionId}/agent`
  const payload = {
    ...body,
    remoteRtcUids: (body.remoteRtcUids || []).map((u) => String(u))
  }
  const resp = await api.post(url, payload)
  return resp.data
}

export const startAgent = async (
  payload: z.infer<
    | typeof localStartAgentPropertiesSchema
    | typeof localOpensourceStartAgentPropertiesSchema
  >
) => {
  const baseURL = (import.meta as any)?.env?.VITE_API_BASE_URL || ''
  const isRemoteToolbox = baseURL.includes('service.apprtc.cn')

  const data = (payload as z.infer<typeof localStartAgentPropertiesSchema>)?.preset_name
    ? localStartAgentPropertiesSchema.parse(payload)
    : localOpensourceStartAgentPropertiesSchema.parse(payload)

  let opensourceData = data as z.infer<
    typeof localOpensourceStartAgentPropertiesSchema
  >

  try {
    const llm_system_messages = opensourceData.llm?.system_messages?.trim()
      ? JSON.parse(opensourceData.llm.system_messages)
      : undefined
    if (llm_system_messages) {
      opensourceData.llm.system_messages = llm_system_messages
    }
    const llm_params = opensourceData?.llm.params?.trim()
      ? JSON.parse(opensourceData.llm.params.trim())
      : undefined
    if (llm_params) {
      opensourceData.llm.params = llm_params
    }
    const tts_params = opensourceData?.tts?.params?.trim()
      ? JSON.parse(opensourceData.tts.params.trim())
      : undefined
    if (tts_params) {
      opensourceData.tts.params = tts_params
    }
  } catch (error) {
    console.error(error, '[FullAgentSettingsForm] JSON parse error')
    throw new Error('JSON parse error in agent settings')
  }

  try {
    if (isRemoteToolbox) {
      const appId =
        (import.meta as any)?.env?.VITE_AGORA_APP_ID ||
        (import.meta as any)?.env?.AGORA_APP_ID
      if (!appId) {
        throw new Error('AGORA AppId 未配置')
      }

      const basicAuthUsername =
        (import.meta as any)?.env?.VITE_AGENT_BASIC_AUTH_KEY ||
        (import.meta as any)?.env?.AGENT_BASIC_AUTH_KEY ||
        undefined
      const basicAuthPassword =
        (import.meta as any)?.env?.VITE_AGENT_BASIC_AUTH_SECRET ||
        (import.meta as any)?.env?.AGENT_BASIC_AUTH_SECRET ||
        undefined

      const llmSystemMessages =
        (opensourceData?.llm?.system_messages &&
          typeof opensourceData.llm.system_messages !== 'string')
          ? opensourceData.llm.system_messages
          : opensourceData?.llm?.system_messages
            ? JSON.parse(opensourceData.llm.system_messages as unknown as string)
            : undefined

      const convoaiBody = {
        properties: {
          channel: data.channel,
          token: data.token,
          agent_rtc_uid: data.agent_rtc_uid,
          remote_rtc_uids: data.remote_rtc_uids,
          enable_string_uid: false,
          advanced_features: (data as any).advanced_features,
          asr: (data as any).asr,
          llm: {
            ...(opensourceData.llm || {}),
            system_messages: llmSystemMessages
          },
          tts: (data as any).tts,
          avatar: (data as any).avatar,
          vad: (data as any).vad,
          sal: (data as any).sal,
          parameters: (data as any).parameters
        }
      }

      const remotePayload = {
        app_id: appId,
        basic_auth_username: basicAuthUsername,
        basic_auth_password: basicAuthPassword,
        preset_name: (data as any).preset_name || '',
        convoai_body: convoaiBody
      }

      console.log('[startAgent] Sending start request to BFF...', {
        url: REMOTE_CONVOAI_AGENT_START,
        payloadSummary: {
          appId,
          preset: remotePayload.preset_name,
          channel: convoaiBody.properties.channel,
          agentUid: convoaiBody.properties.agent_rtc_uid,
          remoteUids: convoaiBody.properties.remote_rtc_uids,
          tokenPrefix: convoaiBody.properties.token?.substring(0, 10) + '...'
        }
      });

      const resp = await api.post(REMOTE_CONVOAI_AGENT_START, remotePayload)
      console.log('[startAgent] Response:', resp.data);
      const respData = resp.data
      const remoteRespSchema = basicRemoteResSchema.extend({
        data: remoteAgentStartRespDataSchema
      })
      const remoteResp = remoteRespSchema.parse(respData)
      return remoteResp.data
    }

    const url = API_AGENT
    const resp = await api.post(url, data)
    const respData = resp.data

    const remoteRespSchema = basicRemoteResSchema.extend({
      data: remoteAgentStartRespDataSchema
    })

    if (respData.code === ERROR_CODE.RESOURCE_LIMIT_EXCEEDED) {
      toast.error('resource quota limit exceeded')
      throw new ResourceLimitError(
        ERROR_CODE.RESOURCE_LIMIT_EXCEEDED,
        ERROR_MESSAGE.RESOURCE_LIMIT_EXCEEDED
      )
    } else if (respData.code === ERROR_CODE.AVATAR_LIMIT_EXCEEDED) {
      throw new ResourceLimitError(
        ERROR_CODE.AVATAR_LIMIT_EXCEEDED,
        'Agent start failed'
      )
    }

    const remoteResp = remoteRespSchema.parse(respData)
    return remoteResp.data
  } catch (error) {
    console.error('Start agent error:', error)
    throw error
  }
}

export const startAgentDev = async (
  payload: z.infer<typeof localStartAgentPropertiesSchema>,
  options?: TDevModeQuery
) => {
  const { devMode } = options ?? {}
  const query = generateDevModeQuery({ devMode })
  const url = `${API_AGENT}${query}`
  const data = localStartAgentPropertiesSchema.parse(payload)

  const resp = await api.post(url, data)
  const respData = resp.data

  const remoteRespSchema = basicRemoteResSchema.extend({
    data: remoteAgentStartRespDataDevSchema
  })
  const remoteResp = remoteRespSchema.parse(respData)
  return remoteResp.data
}

export const stopAgent = async (
  payload: z.infer<typeof remoteAgentStopSettingsSchema>
) => {
  const baseURL = (import.meta as any)?.env?.VITE_API_BASE_URL || ''
  const isRemoteToolbox = baseURL.includes('service.apprtc.cn')

  if (isRemoteToolbox) {
    const remoteUrl = REMOTE_CONVOAI_AGENT_STOP
    const resp = await api.post(remoteUrl, payload)
    const respData = basicRemoteResSchema.parse(resp.data)
    if (respData.code !== 0) {
      throw new Error(respData.msg)
    }
    return respData
  } else {
    const url = API_AGENT_STOP
    const resp = await api.post(url, payload)
    const resData = localResSchema.parse(resp.data)
    return resData
  }
}

export const pingAgent = async (
  payload: z.infer<typeof remoteAgentPingReqSchema>
) => {
  const baseURL = (import.meta as any)?.env?.VITE_API_BASE_URL || ''
  const isRemoteToolbox = baseURL.includes('service.apprtc.cn')

  if (isRemoteToolbox) {
    const appId =
      (import.meta as any)?.env?.VITE_AGORA_APP_ID ||
      (import.meta as any)?.env?.AGORA_APP_ID
    if (!appId) {
      throw new Error('AGORA AppId 未配置')
    }
    const remoteUrl = REMOTE_CONVOAI_AGENT_PING
    const resp = await api.post(remoteUrl, {
      ...payload,
      app_id: appId
    })
    const respData = basicRemoteResSchema.parse(resp.data)
    if (respData.code !== 0) {
      throw new Error(respData.msg)
    }
    return respData
  } else {
    const url = API_AGENT_PING
    const resp = await api.post(url, payload)
    const resData = basicRemoteResSchema.parse(resp.data)
    return resData
  }
}

export const uploadImage = async ({
  image,
  channel_name
}: {
  image: File
  channel_name: string
}) => {
  const formData = new FormData()
  if (!image || !channel_name) {
    throw new Error('Image and channel_name are required')
  }
  const imageName = encodeURIComponent(image.name)
  formData.append('image', image, imageName)
  formData.append('channel_name', channel_name)
  formData.append('request_id', genUUID())

  const baseURL = (import.meta as any)?.env?.VITE_API_BASE_URL || ''
  const isRemoteToolbox = baseURL.includes('service.apprtc.cn')
  const url = isRemoteToolbox ? REMOTE_UPLOAD_IMAGE : API_UPLOAD_IMAGE

  const resp = await api.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  const respData = resp.data

  const imgObjectStorageUrl = respData?.data?.img_url as string
  if (!imgObjectStorageUrl) {
    throw new Error('Image upload failed')
  }
  return imgObjectStorageUrl
}

export const uploadFile = async (
  file: Blob,
  channel_name: string,
  appId: string
) => {
  if (!appId) {
    throw new Error('App ID is not set')
  }
  const formData = new FormData()
  formData.append('file', file)
  formData.append('src', 'web')
  formData.append('app_id', appId)
  formData.append('channel_name', channel_name)
  formData.append('request_id', genUUID())

  const resp = await api.post(API_UPLOAD_FILE, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  const respData = resp.data

  const resData = remoteAgentFileUploadSchema.parse(respData)
  const fileUrl = resData?.data?.file_url as string
  if (!fileUrl) {
    throw new Error('File upload failed')
  }
  return resData.data
}

export const retrievePresetById = async (id: string) => {
  const baseURL = (import.meta as any)?.env?.VITE_API_BASE_URL || ''
  const isRemoteToolbox = baseURL.includes('service.apprtc.cn')

  if (isRemoteToolbox) {
    const url = `${REMOTE_CONVOAI_GET_CUSTOM_PRESET}?customPresetIds=${id}`
    const resp = await api.get(url)
    const respData = resp.data

    if (respData.code === ERROR_CODE.PRESET_DEPRECATED) {
      throw new Error(ERROR_MESSAGE.PRESET_DEPRECATED)
    }

    const remoteRespSchema = basicRemoteResSchema.extend({
      data: z.array(remoteAgentCustomPresetItem)
    })
    const remoteResp = remoteRespSchema.parse(respData)
    return remoteResp.data
  }

  const url = `${API_AGENT_CUSTOM_PRESET}?customPresetIds=${id}`
  const resp = await api.get(url)
  const respData = resp.data

  if (respData.code === ERROR_CODE.PRESET_DEPRECATED) {
    throw new Error(ERROR_MESSAGE.PRESET_DEPRECATED)
  }

  const remoteRespSchema = basicRemoteResSchema.extend({
    data: z.array(remoteAgentCustomPresetItem)
  })
  const remoteResp = remoteRespSchema.parse(respData)
  return remoteResp.data
}

export const uploadLog = async ({ content, file }: IUploadLogInput) => {
  const formData = new FormData()
  if (file) {
    formData.append('file', file, file.name)
  }
  formData.append('content', JSON.stringify(content))

  const baseURL = (import.meta as any)?.env?.VITE_API_BASE_URL || ''
  const isRemoteToolbox = baseURL.includes('service.apprtc.cn')
  const url = isRemoteToolbox ? REMOTE_UPLOAD_LOG : API_UPLOAD_LOG

  const resp = await api.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  const respData = resp.data
  return respData
}
