'use strict'

// Playback app

// Usage: node playback-app.mjs [INPUT_FILE]

// The INPUT_FILE is assumed to contain continuous raw 16-bit 48000 Hz PCM data.
// node recording-app.mjs can be used to create such file.

// Note: this script expects that there is a default output device that
// supports 16-bit 48000 Hz playback. If that's not the case, you'll need to
// change `sampleRate` and `format` below.

import { pipeline } from 'stream'
import { AudioOutputStream, probeApis, probeDevices, rtAudioVersion } from '@hamitzor/sonance.js'
import { createReadStream, readFileSync } from 'fs'
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

const { defaultOutputDevice } = probeDevices(api.id)

if (!defaultOutputDevice) {
  process.stderr.write('No default output device found.')
  process.exit(1)
}

// Crate a file read stream
const fileReadStream = createReadStream(filename)

const sampleRate = 48000 // Hz
const frameSize = 40 // ms

// Crate an audio write stream
const audioWriteStream = new AudioOutputStream({
  api: api.id,
  deviceId: defaultOutputDevice.id,
  channels: 1,
  sampleRate: sampleRate,
  bufferFrames: sampleRate / (1000 / frameSize),
})

// Use stream.pipeline to connect them
pipeline(
  fileReadStream,
  audioWriteStream,
  (err) => {
    if (err) {
      console.error('Error while playback:\n', err)
      process.exit(1)
    }
  },
)

// When the audio write stream closes, i.e. playback finishes, exit.
audioWriteStream.on('close', () => {
  process.exit(0)
})

// Extra: print some info and statistics

const version = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'node_modules', '@hamitzor', 'sonance.js', 'package.json'))).version

consoleClear()
console.log(`Playing ${filename}\n`)
console.log(`sonance.js ${version}`)
console.log(`rtaudio.js ${rtAudioVersion}\n`)
console.log(`Output device\t\t${defaultOutputDevice.name}`)
console.log(`Native API name\t\t${api.name}`)
console.log(`Sample rate\t\t${sampleRate} Hz`)
console.log(`Frame size\t\t${frameSize}ms\n`)
console.log(`Time\t\tRead\t\tMemory usage`)

audioWriteStream.on('api:processed', () => {
  const time = audioWriteStream.time.toFixed(0)
  const bytesRead = (fileReadStream.bytesRead / 1024 / 1024).toFixed(1)
  const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0)
  process.stdout.write(`\r\u001b[2K${time}s\t\t${bytesRead} MB\t\t${rss} MB\t\t\t(Ctrl+C to exit)`)
})
