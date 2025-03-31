'use strict'

// Recording app
//
// Usage: node server.js
//
// Note: this script expects that there is a default input device that
// supports 16-bit 48000 Hz streaming. If that's not the case, you'll need to
// change `sampleRate` and `format` below.

const { pipeline, Transform } = require('node:stream')
const { AudioInputStream, probeApis, probeDevices, rtAudioVersion } = require('@hamitzor/sonance.js')
const { createWriteStream } = require('node:fs')
const { OpusEncoder } = require('@discordjs/opus')

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

const encoder = new OpusEncoder(sampleRate, 1);

const audioReadStream = new AudioInputStream({
  api: api.id,
  deviceId: defaultInputDevice.id,
  channels: 1,
  sampleRate: sampleRate,
  bufferFrames: sampleRate / (1000 / frameSize),
})

const encodeTransform = new Transform({
  transform: (buffer, _encoding, cb) => {
    const time = audioReadStream.time.toFixed(0)
    const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0)
    const encoded = encoder.encode(buffer)
    process.stdout.write(`\r\u001b[2K${time}s\t\t${rss} MB\t\t${100 - (encoded.byteLength / buffer.byteLength * 100).toFixed(2)}%\t\t(Ctrl+C to save and exit)`)
    cb(null, encoded)
  }
})

const writeStream = createWriteStream('./opus.data')

// Use stream.pipeline to connect them
pipeline(
  audioReadStream,
  encodeTransform,
  writeStream,
  (err) => {
    if (err) {
      console.error('error:', err ? err : '')
      process.exit(1)
    }
    process.exit(0)
  },
)

// On SIGINT, stop the audio read stream, which
// will eventually cause socket to
// close as well. (see Node stream.pipeline API)
process.on('SIGINT', () => {
  audioReadStream.stopAudio()
})

console.log(`RtAudio v${rtAudioVersion}\n`)
console.log(`Input device\t\t${defaultInputDevice.name}`)
console.log(`Sample rate\t\t${sampleRate} Hz`)
console.log(`Time\t\tMemory usage\tCompression`)
