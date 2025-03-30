'use strict'

// Playback app

// Usage: node playback-app.mjs [INPUT_FILE]

// The INPUT_FILE is assumed to contain continuous raw 16-bit 48000 Hz PCM data.
// node recording-app.mjs can be used to create such file.

// Note: this script expects that there is a default output device that
// supports 16-bit 48000 Hz playback. If that's not the case, you'll need to
// change `sampleRate` and `format` below.

import { pipeline } from 'stream'
import { AudioOutputStream, probeDevices, } from '@hamitzor/sonance.js'
import { createReadStream, } from 'fs'

const filename = process.argv[2]

if (!filename) {
  process.stderr.write('No filename provided')
  process.exit(1)
}

// Crate a file read stream
const fileReadStream = createReadStream(filename)

// Crate an audio write stream
const audioWriteStream = new AudioOutputStream({
  deviceId: probeDevices().defaultOutputDevice.id,
  channels: 1,
  sampleRate: 48000,
  bufferFrames: 48000 / (1000 / 40),
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