
// ============================================================================
// messages/sendable.js
// ============================================================================
import {
  MessageType,
  MessageHeader,
  CommandMapping,
} from './common.js'
import { clamp, getCurrentTimeInMs } from './utils.js'

export class SendableMessage {
  serialise() {
    return MessageHeader.asBuffer(this.type, 0)
  }
}

export class SendableMessageWithPayload extends SendableMessage {
  serialise() {
    const data = this.getPayload()
    const byteLength = Buffer.byteLength(data)
    const header = MessageHeader.asBuffer(this.type, byteLength)
    return Buffer.concat([header, data])
  }
}

export class SendCommand extends SendableMessageWithPayload {
  constructor(value) {
    super()
    this.type = MessageType.Command
    this.value = CommandMapping[value]
  }

  getPayload() {
    const data = Buffer.alloc(4)
    data.writeUInt32LE(this.value)
    return data
  }
}

export const TouchAction = {
  Down: 14,
  Move: 15,
  Up: 16,
}

export class SendTouch extends SendableMessageWithPayload {
  constructor(x, y, action) {
    super()
    this.type = MessageType.Touch
    this.x = x
    this.y = y
    this.action = action
  }

  getPayload() {
    const actionB = Buffer.alloc(4)
    const xB = Buffer.alloc(4)
    const yB = Buffer.alloc(4)
    const flags = Buffer.alloc(4)
    actionB.writeUInt32LE(this.action)

    const finalX = clamp(10000 * this.x, 0, 10000)
    const finalY = clamp(10000 * this.y, 0, 10000)

    xB.writeUInt32LE(finalX)
    yB.writeUInt32LE(finalY)
    const data = Buffer.concat([actionB, xB, yB, flags])
    return data
  }
}

export const MultiTouchAction = {
  Down: 1,
  Move: 2,
  Up: 0,
}

class TouchItem {
  constructor(x, y, action, id) {
    this.x = x
    this.y = y
    this.action = action
    this.id = id
  }

  getPayload() {
    const actionB = Buffer.alloc(4)
    const xB = Buffer.alloc(4)
    const yB = Buffer.alloc(4)
    const idB = Buffer.alloc(4)
    actionB.writeUInt32LE(this.action)
    idB.writeUInt32LE(this.id)

    xB.writeFloatLE(this.x)
    yB.writeFloatLE(this.y)
    const data = Buffer.concat([xB, yB, actionB, idB])
    return data
  }
}

export class SendMultiTouch extends SendableMessageWithPayload {
  constructor(touchData) {
    super()
    this.type = MessageType.MultiTouch
    this.touches = touchData.map(({ x, y, action }, index) => {
      return new TouchItem(x, y, action, index)
    })
  }

  getPayload() {
    const data = Buffer.concat(this.touches.map(i => i.getPayload()))
    return data
  }
}

export class SendAudio extends SendableMessageWithPayload {
  constructor(data) {
    super()
    this.type = MessageType.AudioData
    this.data = data
  }

  getPayload() {
    const audioData = Buffer.alloc(12)
    audioData.writeUInt32LE(5, 0)
    audioData.writeFloatLE(0.0, 4)
    audioData.writeUInt32LE(3, 8)
    return Buffer.concat([audioData, Buffer.from(this.data.buffer)])
  }
}

export class SendFile extends SendableMessageWithPayload {
  constructor(content, fileName) {
    super()
    this.type = MessageType.SendFile
    this.content = content
    this.fileName = fileName
  }

  getFileName(name) {
    return Buffer.from(name + '\0', 'ascii')
  }

  getLength(data) {
    const buffer = Buffer.alloc(4)
    buffer.writeUInt32LE(Buffer.byteLength(data))
    return buffer
  }

  getPayload() {
    const newFileName = this.getFileName(this.fileName)
    const nameLength = this.getLength(newFileName)
    const contentLength = this.getLength(this.content)
    const message = [nameLength, newFileName, contentLength, this.content]
    const data = Buffer.concat(message)
    return data
  }
}

export const FileAddress = {
  DPI: '/tmp/screen_dpi',
  NIGHT_MODE: '/tmp/night_mode',
  HAND_DRIVE_MODE: '/tmp/hand_drive_mode',
  CHARGE_MODE: '/tmp/charge_mode',
  BOX_NAME: '/etc/box_name',
  OEM_ICON: '/etc/oem_icon.png',
  AIRPLAY_CONFIG: '/etc/airplay.conf',
  ICON_120: '/etc/icon_120x120.png',
  ICON_180: '/etc/icon_180x180.png',
  ICON_250: '/etc/icon_256x256.png',
  ANDROID_WORK_MODE: '/etc/android_work_mode',
}

export class SendNumber extends SendFile {
  constructor(content, file) {
    const message = Buffer.alloc(4)
    message.writeUInt32LE(content)
    super(message, file)
  }
}

export class SendBoolean extends SendNumber {
  constructor(content, file) {
    super(Number(content), file)
  }
}

export class SendString extends SendFile {
  constructor(content, file) {
    if (content.length > 16) {
      console.error('string too long')
    }
    const message = Buffer.from(content, 'ascii')
    super(message, file)
  }
}

export class HeartBeat extends SendableMessage {
  constructor() {
    super()
    this.type = MessageType.HeartBeat
  }
}

export class SendOpen extends SendableMessageWithPayload {
  constructor(config) {
    super()
    this.type = MessageType.Open
    this.config = config
  }

  getPayload() {
    const { config } = this
    const width = Buffer.alloc(4)
    width.writeUInt32LE(config.width)
    const height = Buffer.alloc(4)
    height.writeUInt32LE(config.height)
    const fps = Buffer.alloc(4)
    fps.writeUInt32LE(config.fps)
    const format = Buffer.alloc(4)
    format.writeUInt32LE(config.format)
    const packetMax = Buffer.alloc(4)
    packetMax.writeUInt32LE(config.packetMax)
    const iBox = Buffer.alloc(4)
    iBox.writeUInt32LE(config.iBoxVersion)
    const phoneMode = Buffer.alloc(4)
    phoneMode.writeUInt32LE(config.phoneWorkMode)
    return Buffer.concat([
      width,
      height,
      fps,
      format,
      packetMax,
      iBox,
      phoneMode,
    ])
  }
}

export class SendBoxSettings extends SendableMessageWithPayload {
  constructor(config, syncTime = null) {
    super()
    this.type = MessageType.BoxSettings
    this.config = config
    this.syncTime = syncTime
  }

  getPayload() {
    return Buffer.from(
      JSON.stringify({
        mediaDelay: this.config.mediaDelay,
        syncTime: this.syncTime ?? getCurrentTimeInMs(),
        androidAutoSizeW: this.config.width,
        androidAutoSizeH: this.config.height,
      }),
      'ascii',
    )
  }
}

export const LogoType = {
  HomeButton: 1,
  Siri: 2,
}

export class SendLogoType extends SendableMessageWithPayload {
  constructor(logoType) {
    super()
    this.type = MessageType.LogoType
    this.logoType = logoType
  }

  getPayload() {
    const data = Buffer.alloc(4)
    data.writeUInt32LE(this.logoType)
    return data
  }
}

export class SendIconConfig extends SendFile {
  constructor(config) {
    const valueMap = {
      oemIconVisible: 1,
      name: 'AutoBox',
      model: 'Magic-Car-Link-1.00',
      oemIconPath: FileAddress.OEM_ICON,
    }

    if (config.label) {
      valueMap.oemIconLabel = config.label
    }

    const fileData = Object.entries(valueMap)
      .map(e => `${e[0]} = ${e[1]}`)
      .join('\n')

    super(Buffer.from(fileData + '\n', 'ascii'), FileAddress.AIRPLAY_CONFIG)
  }
}

export class SendCloseDongle extends SendableMessage {
  constructor() {
    super()
    this.type = MessageType.CloseDongle
  }
}

export class SendDisconnectPhone extends SendableMessage {
  constructor() {
    super()
    this.type = MessageType.DisconnectPhone
  }
}