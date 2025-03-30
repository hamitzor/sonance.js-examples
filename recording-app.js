'use strict'

// Recording app
//
// Usage: node recording-app.mjs [OUTPUT_FILE]
//
// The OUTPUT_FILE will contain continuous raw 16-bit 48000 Hz PCM data.
// node playback-app.mjs can be used to play this file.

// Note: this script expects that there is a default input device that
// supports 16-bit 48000 Hz streaming. If that's not the case, you'll need to
// change `sampleRate` and `format` below.

import { pipeline } from 'stream'
import { AudioInputStream, probeApis, probeDevices, rtAudioVersion } from '@hamitzor/sonance.js'
import { createWriteStream, readFileSync } from 'fs'
import consoleClear from 'console-clear'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const filename = process.argv[2]

if (!filename) {
  process.stderr.write('No filename provided')
  process.exit(1)
}

const apis = probeApis()

if (apis.length < 1) {
  process.stderr.write('No available API found')
  process.exit(1)
}

const api = apis[0] // Use the first api available.

const { defaultInputDevice } = probeDevices(api.id)

if (!defaultInputDevice) {
  process.stderr.write('No default input device found.')
  process.exit(1)
}

const sampleRate = 48000 // Hz
const frameSize = 40 // ms

// Crate an audio read stream
const audioReadStream = new AudioInputStream({
  api: api.id,
  deviceId: defaultInputDevice.id,
  channels: 1,
  sampleRate: sampleRate,
  bufferFrames: sampleRate / (1000 / frameSize),
})

// Create a file write stream
const fileWriteStream = createWriteStream(filename, { flags: 'w' })

// Use stream.pipeline to connect them
pipeline(
  audioReadStream,
  fileWriteStream,
  (err) => {
    if (err) {
      console.error('Pipeline failed.', err)
      process.exit(1)
    }
  },
)

// When the file write stream closes, exit.
fileWriteStream.on('close', () => {
  clearInterval(stats)
  process.exit(0)
})

// On SIGINT, stop the audio read stream, which
// will eventually cause file write stream to
// close as well. (see Node stream.pipeline API)
process.on('SIGINT', () => {
  audioReadStream.stopAudio()
})

// Print some info and statistics

const version = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'node_modules', '@hamitzor', 'sonance.js', 'package.json'))).version

consoleClear()
console.log(`Saving into ${filename}\n`)
console.log(`sonance.js v${version}`)
console.log(`RtAudio v${rtAudioVersion}\n`)
console.log(`Input device\t\t${defaultInputDevice.name}`)
console.log(`Native API name\t\t${api.name}`)
console.log(`Sample rate\t\t${sampleRate} Hz`)
console.log(`Frame size\t\t${frameSize}ms\n`)
console.log(`Time\t\tWritten\t\tMemory usage`)

const stats = setInterval(() => {
  const time = audioReadStream.time.toFixed(0)
  const bytesWritten = (fileWriteStream.bytesWritten / 1024 / 1024).toFixed(1)
  const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0)
  process.stdout.write(`\r\u001b[2K${time}s\t\t${bytesWritten} MB\t\t${rss} MB\t\t\t(Ctrl+C to save and exit)`)
}, 300)
