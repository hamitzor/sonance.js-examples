'use strict'

// Echo app. It streams the audio from default input device directly
// to default output device.

// Usage: node simple-cli-echo.mjs

// Note: this script expects that there are default output and input device that
// support 16-bit 48000 Hz playback. If that's not the case, you'll need to
// change `sampleRate` and `format` below.

import { pipeline } from 'stream'
import { AudioInputStream, AudioOutputStream, probeApis, probeDevices, rtAudioVersion, RtAudioFormat } from '@hamitzor/sonance.js'
import { readFileSync } from 'fs'
import consoleClear from 'console-clear'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const apis = probeApis()

if (apis.length < 1) {
  process.stderr.write("No available API found")
  process.exit(1)
}

const api = apis[0] // Use the first api available.

const { defaultOutputDevice, defaultInputDevice } = probeDevices(api.id)

if (!defaultOutputDevice || !defaultInputDevice) {
  process.stderr.write(`No default ${!defaultOutputDevice ? 'processed' : 'input'} device found.`)
  process.exit(1)
}

const sampleRate = 48000 // Hz
const frameSize = 40 // ms

// Create an audio read stream
const audioReadStream = new AudioInputStream({
  api: api.id,
  deviceId: defaultInputDevice.id,
  channels: 1,
  sampleRate: sampleRate,
  bufferFrames: sampleRate / (1000 / frameSize),
  format: RtAudioFormat.RTAUDIO_SINT16,
})

// Crate an audio write stream
const audioWriteStream = new AudioOutputStream({
  api: api.id,
  deviceId: defaultOutputDevice.id,
  channels: 1,
  sampleRate: sampleRate,
  bufferFrames: sampleRate / (1000 / frameSize),
  format: RtAudioFormat.RTAUDIO_SINT16,
})

// Use stream.pipeline to connect them
pipeline(
  audioReadStream,
  audioWriteStream,
  (err) => {
    if (err) {
      console.error('Error while echoing:\n', err)
    }
  },
)

// When the audio write stream closes, i.e. playback finishes, exit.
audioWriteStream.on('close', () => {
  process.exit(0)
})

// On SIGINT, stop the audio read stream, which
// will eventually cause audio write stream to
// close as well. (see Node stream.pipeline API)
process.on('SIGINT', () => {
  audioReadStream.stopAudio()
})

// Extra: print some info and statistics

const version = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'node_modules', '@hamitzor', 'sonance.js', 'package.json'))).version

consoleClear()
console.log(`Echoing audio\n`)
console.log(`sonance.js v${version}`)
console.log(`RtAudio v${rtAudioVersion}\n`)
console.log(`Output device\t\t${defaultOutputDevice.name}`)
console.log(`Input device\t\t${defaultInputDevice.name}`)
console.log(`Native API name\t\t${api.name}`)
console.log(`Sample rate\t\t${sampleRate} Hz`)
console.log(`Frame size\t\t${frameSize}ms\n`)
console.log(`Time\t\t\tMemory usage\t\t\tLatency`)

audioWriteStream.on('api:processed', () => {
  const time = audioWriteStream.time.toFixed(0)
  const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0)
  process.stdout.write(`\r\u001b[2K${time}s\t\t\t${rss} MB\t\t\t(Ctrl+C to exit)`)
})
