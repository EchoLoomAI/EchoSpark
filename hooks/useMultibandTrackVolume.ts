import type { IMicrophoneAudioTrack, IRemoteAudioTrack } from 'agora-rtc-sdk-ng'
import * as React from 'react'
import { normalizeFrequencies } from '../lib/utils'

export const useMultibandTrackVolume = (
    track?: IMicrophoneAudioTrack | IRemoteAudioTrack | MediaStreamTrack | null,
    bands: number = 5,
    loPass: number = 100,
    hiPass: number = 600
) => {
    const analyserRef = React.useRef<AnalyserNode | null>(null)
    const dataArrayRef = React.useRef<Float32Array | null>(null)

    React.useEffect(() => {
        if (!track) {
            analyserRef.current = null
            return
        }

        const ctx = new AudioContext()
        const finTrack =
            track instanceof MediaStreamTrack ? track : track.getMediaStreamTrack()
        const mediaStream = new MediaStream([finTrack])
        const source = ctx.createMediaStreamSource(mediaStream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 2048

        source.connect(analyser)

        analyserRef.current = analyser
        dataArrayRef.current = new Float32Array(analyser.frequencyBinCount)

        return () => {
            source.disconnect()
            ctx.close()
            analyserRef.current = null
        }
    }, [track])

    const getFrequencyBands = React.useCallback(() => {
        const analyser = analyserRef.current
        const dataArray = dataArrayRef.current

        if (!analyser || !dataArray) {
            return []
        }

        analyser.getFloatFrequencyData(dataArray as any)
        let frequencies: Float32Array = new Float32Array(dataArray.length)
        for (let i = 0; i < dataArray.length; i++) {
            frequencies[i] = dataArray[i]
        }
        frequencies = frequencies.slice(loPass, hiPass)

        const normalizedFrequencies = normalizeFrequencies(frequencies)
        const chunkSize = Math.ceil(normalizedFrequencies.length / bands)
        const chunks: Float32Array[] = []
        for (let i = 0; i < bands; i++) {
            chunks.push(
                normalizedFrequencies.slice(i * chunkSize, (i + 1) * chunkSize)
            )
        }
        return chunks
    }, [bands, loPass, hiPass])

    return getFrequencyBands
}
