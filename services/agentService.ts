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
  const url = `${API_TOKEN}${query}`
  const data = {
    request_id: genUUID(),
    uid: userId,
    channel_name: channel ?? ''
  }

  const resp = await api.post(url, data)
  const resData = localResSchema.parse(resp.data)
  return resData
}

export const startAgent = async (
  payload: z.infer<
    | typeof localStartAgentPropertiesSchema
    | typeof localOpensourceStartAgentPropertiesSchema
  >
) => {
  const url = API_AGENT
  const data = (payload as z.infer<typeof localStartAgentPropertiesSchema>)
    ?.preset_name
    ? localStartAgentPropertiesSchema.parse(payload)
    : localOpensourceStartAgentPropertiesSchema.parse(payload)

  try {
    const opensourceData = data as z.infer<
      typeof localOpensourceStartAgentPropertiesSchema
    >
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
  payload: z.infer<typeof remoteAgentStopSettingsSchema>,
  options?: TDevModeQuery
) => {
  const { devMode } = options ?? {}
  const query = generateDevModeQuery({ devMode })
  const url = `${API_AGENT_STOP}${query}`
  const data = remoteAgentStopSettingsSchema.parse(payload)

  const resp = await api.post(url, data)
  const respData = resp.data

  const remoteRespSchema = basicRemoteResSchema.extend({
    data: z.any().optional()
  })
  const remoteResp = remoteRespSchema.parse(respData)
  return remoteResp
}

const pingAgentReqSchema = remoteAgentPingReqSchema.omit({ app_id: true })
export const pingAgent = async (
  payload: z.infer<typeof pingAgentReqSchema>,
  options?: TDevModeQuery
) => {
  const { devMode } = options ?? {}
  const query = generateDevModeQuery({ devMode })
  const url = `${API_AGENT_PING}${query}`
  const data = pingAgentReqSchema.parse(payload)

  const resp = await api.post(url, data)
  const respData = resp.data

  const remoteRespSchema = basicRemoteResSchema.extend({
    data: z.any().optional()
  })
  const remoteResp = remoteRespSchema.parse(respData)
  return remoteResp.data
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

  const resp = await api.post(API_UPLOAD_IMAGE, formData, {
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
  const url = `${API_UPLOAD_LOG}`
  const resp = await api.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  const respData = resp.data
  return respData
}
