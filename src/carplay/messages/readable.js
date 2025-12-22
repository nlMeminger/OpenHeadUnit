// ============================================================================
// messages/readable.js
// ============================================================================
import { MessageHeader, CommandMapping } from './common.js'

export const AudioCommand = {
  AudioOutputStart: 1,
  AudioOutputStop: 2,
  AudioInputConfig: 3,
  AudioPhonecallStart: 4,
  AudioPhonecallStop: 5,
  AudioNaviStart: 6,
  AudioNaviStop: 7,
  AudioSiriStart: 8,
  AudioSiriStop: 9,
  AudioMediaStart: 10,
  AudioMediaStop: 11,
  AudioAlertStart: 12,
  AudioAlertStop: 13,
}

export class Message {
  constructor(header) {
    this.header = header
  }
}

export class Command extends Message {
  constructor(header, data) {
    super(header)
    this.value = data.readUInt32LE(0)
  }
}

export class ManufacturerInfo extends Message {
  constructor(header, data) {
    super(header)
    this.a = data.readUInt32LE(0)
    this.b = data.readUInt32LE(4)
  }
}

export class SoftwareVersion extends Message {
  constructor(header, data) {
    super(header)
    this.version = data.toString('ascii')
  }
}

export class BluetoothAddress extends Message {
  constructor(header, data) {
    super(header)
    this.address = data.toString('ascii')
  }
}

export class BluetoothPIN extends Message {
  constructor(header, data) {
    super(header)
    this.pin = data.toString('ascii')
  }
}

export class BluetoothDeviceName extends Message {
  constructor(header, data) {
    super(header)
    this.name = data.toString('ascii')
  }
}

export class WifiDeviceName extends Message {
  constructor(header, data) {
    super(header)
    this.name = data.toString('ascii')
  }
}

export class HiCarLink extends Message {
  constructor(header, data) {
    super(header)
    this.link = data.toString('ascii')
  }
}

export class BluetoothPairedList extends Message {
  constructor(header, data) {
    super(header)
    this.data = data.toString('ascii')
  }
}

export const PhoneType = {
  AndroidMirror: 1,
  CarPlay: 3,
  iPhoneMirror: 4,
  AndroidAuto: 5,
  HiCar: 6,
}

export class Plugged extends Message {
  constructor(header, data) {
    super(header)
    const wifiAvail = Buffer.byteLength(data) === 8
    if (wifiAvail) {
      this.phoneType = data.readUInt32LE(0)
      this.wifi = data.readUInt32LE(4)
      console.debug(
        'wifi avail, phone type: ',
        Object.keys(PhoneType).find(k => PhoneType[k] === this.phoneType),
        ' wifi: ',
        this.wifi,
      )
    } else {
      this.phoneType = data.readUInt32LE(0)
      console.debug('no wifi avail, phone type: ', Object.keys(PhoneType).find(k => PhoneType[k] === this.phoneType))
    }
  }
}

export class Unplugged extends Message {
  constructor(header) {
    super(header)
  }
}

export const decodeTypeMap = {
  1: {
    frequency: 44100,
    channel: 2,
    bitDepth: 16,
    format: "S16LE",
    mimeType: "audio/L16; rate=44100; channels=2"
  },
  2: {
    frequency: 44100,
    channel: 2,
    bitDepth: 16,
    format: "S16LE",
    mimeType: "audio/L16; rate=44100; channels=2"
  },
  3: {
    frequency: 8000,
    channel: 1,
    bitDepth: 16,
    format: "S16LE",
    mimeType:  "audio/L16; rate=8000; channels=1"
  },
  4: {
    frequency: 48000,
    channel: 2,
    bitDepth: 16,
    format: "S16LE",
    mimeType:  "audio/L16; rate=48000; channels=2"
  },
  5: {
    frequency: 16000,
    channel: 1,
    bitDepth: 16,
    format: "S16LE",
    mimeType:  "audio/L16; rate=16000; channels=1"
  },
  6: {
    frequency: 24000,
    channel: 1,
    bitDepth: 16,
    format: "S16LE",
    mimeType:  "audio/L16; rate=24000; channels=1"
  },
  7: {
    frequency: 16000,
    channel: 2,
    bitDepth: 16,
    format: "S16LE",
    mimeType:  "audio/L16; rate=16000; channels=2"
  },
}

export class AudioData extends Message {
  constructor(header, data) {
    super(header)
    this.decodeType = data.readUInt32LE(0)
    this.volume = data.readFloatLE(4)
    this.audioType = data.readUInt32LE(8)
    const amount = data.length - 12
    if (amount === 1) {
      this.command = data.readInt8(12)
    } else if (amount === 4) {
      this.volumeDuration = data.readFloatLE(12)
    } else {
      this.data = new Int16Array(data.buffer, 12)
    }
  }
}

export class VideoData extends Message {
  constructor(header, data) {
    super(header)
    this.width = data.readUInt32LE(0)
    this.height = data.readUInt32LE(4)
    this.flags = data.readUInt32LE(8)
    this.length = data.readUInt32LE(12)
    this.unknown = data.readUInt32LE(16)
    this.data = data.subarray(20)
  }
}

const MediaType = {
  Data: 1,
  AlbumCover: 3,
}

export class MediaData extends Message {
  constructor(header, data) {
    super(header)
    const type = data.readUInt32LE(0)
    if (type === MediaType.AlbumCover) {
      const imageData = data.subarray(4)
      this.payload = {
        type,
        base64Image: imageData.toString('base64'),
      }
    } else if (type === MediaType.Data) {
      const mediaData = data.subarray(4, data.length - 1)
      this.payload = {
        type,
        media: JSON.parse(mediaData.toString('utf8')),
      }
    } else {
      console.info(`Unexpected media type: ${type}`)
    }
  }
}

export class Opened extends Message {
  constructor(header, data) {
    super(header)
    this.width = data.readUInt32LE(0)
    this.height = data.readUInt32LE(4)
    this.fps = data.readUInt32LE(8)
    this.format = data.readUInt32LE(12)
    this.packetMax = data.readUInt32LE(16)
    this.iBox = data.readUInt32LE(20)
    this.phoneMode = data.readUInt32LE(24)
  }
}

export class BoxInfo extends Message {
  constructor(header, data) {
    super(header)
    this.settings = JSON.parse(data.toString())
  }
}

export class Phase extends Message {
  constructor(header, data) {
    super(header)
    this.phase = data.readUInt32LE(0)
  }
}
