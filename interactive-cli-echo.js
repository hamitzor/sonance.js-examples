'use strict'

// Interactive echo app. It allows configuring the streams.

// It streams the audio from default input device directly
// to default output device.

// Usage: node interactive-cli-echo.mjs

// Note: this script expects that there are default output and input device that
// support 16-bit 48000 Hz playback. If that's not the case, you'll need to
// change `sampleRate` and `format` below.

import inquirer from 'inquirer'
import { AudioInputStream, AudioOutputStream, rtAudioVersion, RtAudioFormat, probeApis, probeDevices } from '@hamitzor/sonance.js'
import consoleClear from 'console-clear'
import ansi from 'ansi'
import { Transform, pipeline, finished } from 'stream'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const version = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'node_modules', '@hamitzor', 'sonance.js', 'package.json'))).version

const cursor = ansi(process.stdout)

const getLoudnessBarString = (loudness) => {

  const replaceAt = (str, index, replacement) => {
    return str.substring(0, index) + replacement + str.substring(index + replacement.length)
  }

  const maxBarWidth = 80

  let str = [...Array(maxBarWidth).keys()].map(() => '\u2591').join('')

  const barWidth = Math.floor(loudness / 5) > maxBarWidth ? maxBarWidth : Math.floor(loudness / 5)
  for (let i = 0; i < barWidth; i++) {
    str = replaceAt(str, i, '\u2588')
  }

  return str
}

const getTypedArray = (buffer, format) => {
  switch (format) {
    case RtAudioFormat.RTAUDIO_FLOAT32:
      return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.buffer.byteLength / 4)
    case RtAudioFormat.RTAUDIO_FLOAT64:
      return new Float64Array(buffer.buffer, buffer.byteOffset, buffer.buffer.byteLength / 8)
    case RtAudioFormat.RTAUDIO_SINT16:
      return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.buffer.byteLength / 2)
    case RtAudioFormat.RTAUDIO_SINT32:
      return new Int32Array(buffer.buffer, buffer.byteOffset, buffer.buffer.byteLength / 4)
    case RtAudioFormat.RTAUDIO_SINT8:
      return new Int8Array(buffer.buffer, buffer.byteOffset, buffer.buffer.byteLength)
    default:
      return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.buffer.byteLength / 2)
  }
}

const getParameters = async () => {
  const { api } = await inquirer.prompt(
    {
      name: 'api',
      message: 'Select native audio API to use',
      type: 'list',
      choices: probeApis().map(({ id, name }) => ({ name: name, value: id })),
      loop: false,
      default: 0
    })

  const { devices, defaultInputDevice, defaultOutputDevice } = probeDevices(api)

  const { inputDevId } = await inquirer.prompt(
    {
      name: 'inputDevId',
      message: 'Select input device',
      type: 'list',
      loop: false,
      choices: devices.filter(({ inputChannels }) => inputChannels > 0).map(({ id, name }) => ({
        name,
        value: id
      })),
      default: devices.findIndex(({ id }) => defaultInputDevice === id)
    },
  )

  const { outputDevId } = await inquirer.prompt(
    {
      name: 'outputDevId',
      message: 'Select output device',
      type: 'list',
      loop: false,
      choices: devices.filter(({ outputChannels }) => outputChannels > 0).map(({ id, name }) => ({
        name,
        value: id
      })),
      default: devices.findIndex(({ id }) => defaultOutputDevice === id)
    },
  )

  const inputDev = devices.find(({ id }) => id === inputDevId)
  const outputDev = devices.find(({ id }) => id === outputDevId)

  const { outputChannelNumber } = await inquirer.prompt(
    {
      name: 'outputChannelNumber',
      message: 'Select the number of channels for output',
      type: 'list',
      loop: false,
      choices: Array.from(Array(outputDev.outputChannels).keys()).reverse().map(n => ({
        value: n + 1,
        name: `${n + 1}`,
      }))
    },
  )

  let inputChannelNumber = 1

  if (Array.from(Array(inputDev.outputChannels).keys()).length > 1) {
    inputChannelNumber = (await inquirer.prompt(
      {
        name: 'inputChannelNumber',
        message: 'Select the number of channels for input',
        type: 'list',
        loop: false,
        choices: Array.from(Array(input.outputChannels).keys()).reverse().map(n => ({
          value: n + 1,
          name: `${n + 1}`,
        }))
      },
    )).inputChannelNumber
  }

  const commonSampleRates = inputDev.sampleRates.filter(function (n) {
    return outputDev.sampleRates.indexOf(n) !== -1
  })

  if (commonSampleRates.length < 1) {
    console.log('Selected devices do not have a common supported sampling rate!')
    return getParameters()
  }

  const { sampleRate } = await inquirer.prompt(
    {
      name: 'sampleRate',
      message: 'Sample rate',
      type: 'list',
      loop: false,
      choices: commonSampleRates.map((val) => ({
        value: val,
        name: `${val}`
      })),
      default: commonSampleRates.findIndex(val => val === 32000 || val === 48000)
    },
  )

  const { format } = await inquirer.prompt(
    {
      name: 'format',
      message: 'Format (bit depth)',
      type: 'list',
      loop: false,
      choices: [
        { value: RtAudioFormat.RTAUDIO_SINT8, name: '8 bit' },
        { value: RtAudioFormat.RTAUDIO_SINT16, name: '16 bits' },
        { value: RtAudioFormat.RTAUDIO_SINT32, name: '32 bits' },
        { value: RtAudioFormat.RTAUDIO_FLOAT32, name: '32 bits (float)' },
        { value: RtAudioFormat.RTAUDIO_FLOAT64, name: '64 bits (float)' },
      ],
      default: () => 1
    },
  )

  return {
    api,
    inputDev,
    outputDev,
    outputChannelNumber,
    inputChannelNumber,
    sampleRate,
    format,
  }
}

let echoPipeline = null
let audioReadStream = null
let audioWriteStream = null
let keyPressHandler = null

let loudness = 0

const printPlaybackStatus = () => {
  cursor.hide().reset()
  cursor.horizontalAbsolute(0).eraseLine()

  cursor
    .reset().write('(press p to play/pause and r start to a new stream)')
    .nextLine()
    .nextLine()

  if (!audioReadStream.isAudioPaused) {
    cursor.green()
  } else {
    cursor.grey()
  }

  cursor.write(`\u{1F551} ${audioWriteStream.time.toFixed(1)}s latency=${audioWriteStream.latency}ms `)

  if (!audioReadStream.isAudioPaused) {
    cursor.green().bold().write('(Running)')
  } else {
    cursor.grey().bold().write('(Stopped)')
  }


  cursor
    .nextLine()
    .nextLine()

  if (!audioReadStream.isAudioPaused) {
    cursor.green()
  } else {
    cursor.grey()
  }

  cursor.write(getLoudnessBarString(audioReadStream.isAudioPaused ? 0 : loudness))
    .previousLine()
    .previousLine()
    .previousLine()
    .previousLine()
}

const main = async () => {
  const app = async () => {
    consoleClear()
    cursor.reset().write('')
    cursor.bold().write('sonance.js ').reset().brightYellow().write(version).reset().nextLine()
    cursor.bold().write('rtaudio.js ').reset().brightYellow().write(`${rtAudioVersion}`).nextLine().nextLine()

    const {
      api,
      inputDev,
      outputDev,
      outputChannelNumber,
      inputChannelNumber,
      sampleRate,
      format,
    } = await getParameters()

    cursor.nextLine()

    const frameSize = 40 // ms

    // Create an audio read stream
    audioReadStream = new AudioInputStream({
      api: api,
      deviceId: inputDev.id,
      channels: inputChannelNumber,
      sampleRate: sampleRate,
      bufferFrames: sampleRate / (1000 / frameSize),
      format,
    })

    // Crate an audio write stream
    audioWriteStream = new AudioOutputStream({
      api: api,
      deviceId: outputDev.id,
      channels: outputChannelNumber,
      sampleRate: sampleRate,
      bufferFrames: sampleRate / (1000 / frameSize),
      format,
    })

    const printStats = new Transform({
      transform: (chunk, _encoding, cb) => {
        const arr = getTypedArray(chunk, format)
        loudness = Math.sqrt(arr.reduce((acc, v) => acc + Math.pow(v / (arr.BYTES_PER_ELEMENT * 8), 2), 0) / chunk.length)
        printPlaybackStatus()
        cb(null, chunk)
      }
    })

    // Use stream.pipeline to connect all
    echoPipeline = pipeline(
      audioReadStream,
      printStats,
      audioWriteStream,
      (err) => {
        if (err) {
          consoleClear()
          cursor.reset().write('')
          process.stdin.pause()
          process.stdin.setRawMode(false)
          console.error('Error while echoing:\n', err)
          process.exit(1)
        }
      },
    )

    loudness = 0

    keyPressHandler = (key) => {
      if (key.toString('utf-8') === '\u0003') {
        audioReadStream.stopAudio()

        finished(echoPipeline, (err) => {
          if (!err) {
            consoleClear()
            cursor.reset().write('')
            process.stdin.removeListener('data', keyPressHandler)
            process.exit(0)
          }
        })
      }

      if (key.toString('utf-8') === 'p') {
        if (!audioReadStream.isAudioPaused) {
          audioReadStream.pauseAudio()
          printPlaybackStatus()
        } else {
          audioReadStream.resumeAudio()
        }
      }

      if (key.toString('utf-8') === 'r') {
        finished(echoPipeline, () => {
          process.stdin.removeListener('data', keyPressHandler)
          app()
        })

        audioReadStream.stopAudio()
      }
    }

    process.stdin.setRawMode(true)

    process.stdin.resume()

    process.stdin.setEncoding('utf8')

    process.stdin.addListener('data', keyPressHandler)
  }

  app()
}

main()

