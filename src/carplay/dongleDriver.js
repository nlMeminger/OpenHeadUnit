// ============================================================================
// DongleDriver.js - Updated with Carlinkit 5.0 Support
// ============================================================================
import { EventEmitter } from './eventEmitter.js';

import { MessageHeader, HeaderBuildError } from './messages/common.js'
import {
  SendableMessage,
  SendNumber,
  FileAddress,
  SendOpen,
  SendBoolean,
  SendString,
  SendBoxSettings,
  SendCommand,
  HeartBeat,
} from './messages/sendable.js'

const CONFIG_NUMBER = 1
const MAX_ERROR_COUNT = 5

export const HandDriveType = {
  LHD: 0,
  RHD: 1,
}

export const DEFAULT_CONFIG = {
  width: 800,
  height: 640,
  fps: 20,
  dpi: 160,
  format: 5,
  iBoxVersion: 2,
  phoneWorkMode: 2,
  packetMax: 49152,
  boxName: 'nodePlay',
  nightMode: false,
  hand: HandDriveType.LHD,
  mediaDelay: 300,
  audioTransferMode: false,
  wifiType: '5ghz',
  micType: 'os',
  phoneConfig: {
    3: { // PhoneType.CarPlay
      frameInterval: 5000,
    },
    5: { // PhoneType.AndroidAuto
      frameInterval: null,
    },
  },
}

export class DriverStateError extends Error {}

export class DongleDriver extends EventEmitter {
  constructor() {
    super()
    this._heartbeatInterval = null
    this._device = null
    this._inEP = null
    this._outEP = null
    this.errorCount = 0
  }

  static knownDevices = [
    // Original devices
    { vendorId: 0x1314, productId: 0x1520 },
    { vendorId: 0x1314, productId: 0x1521 },
    // Carlinkit 5.0 (appears as Apple device)
    { vendorId: 0x05ac, productId: 0x12a8 },
  ]

  initialise = async (device) => {
    if (this._device) {
      return
    }

    try {
      this._device = device

      console.debug('initializing')
      if (!device.opened) {
        throw new DriverStateError('Illegal state - device not opened')
      }
      await this._device.selectConfiguration(CONFIG_NUMBER)

      if (!this._device.configuration) {
        throw new DriverStateError(
          'Illegal state - device has no configuration',
        )
      }

      console.debug('getting interface')
      const {
        interfaceNumber,
        alternate: { endpoints },
      } = this._device.configuration.interfaces[0]

      console.debug('Interface details:', {
        interfaceNumber,
        endpoints: endpoints.map(e => ({
          direction: e.direction,
          endpointNumber: e.endpointNumber,
          packetSize: e.packetSize
        }))
      })

      const inEndpoint = endpoints.find(e => e.direction === 'in')
      const outEndpoint = endpoints.find(e => e.direction === 'out')

      if (!inEndpoint) {
        throw new DriverStateError('Illegal state - no IN endpoint found')
      }

      if (!outEndpoint) {
        throw new DriverStateError('Illegal state - no OUT endpoint found')
      }
      this._inEP = inEndpoint
      this._outEP = outEndpoint

      console.debug('Endpoint details - IN:', inEndpoint.endpointNumber, 'OUT:', outEndpoint.endpointNumber)
      console.debug('claiming interface', interfaceNumber)
      await this._device.claimInterface(interfaceNumber)
      console.debug('interface claimed successfully')

      console.debug(this._device)
    } catch (err) {
      this.close()
      throw err
    }
  }

  send = async (message) => {
    if (!this._device?.opened) {
      return null
    }

    try {
      const payload = message.serialise()
      const transferResult = await this._device?.transferOut(
        this._outEP.endpointNumber,
        payload,
      )
      if (transferResult.status !== 'ok') {
        console.error(transferResult)
        return false
      }
      return true
    } catch (err) {
      console.error('Failure sending message to dongle', err)
      return false
    }
  }

  readLoop = async () => {
    console.log('ReadLoop started, device opened:', this._device?.opened)
    while (this._device?.opened) {
      if (this.errorCount >= MAX_ERROR_COUNT) {
        this.close()
        this.emit('failure')
        return
      }

      try {
        console.log('Waiting for header data...')
        const headerData = await this._device?.transferIn(
          this._inEP.endpointNumber,
          MessageHeader.dataLength,
        )
        console.log('Received header data:', headerData)
        const data = headerData?.data?.buffer
        if (!data) {
          throw new HeaderBuildError('Failed to read header data')
        }
        const header = MessageHeader.fromBuffer(Buffer.from(data))
        let extraData = undefined
        if (header.length) {
          const extraDataRes = (
            await this._device?.transferIn(
              this._inEP.endpointNumber,
              header.length,
            )
          )?.data?.buffer
          if (!extraDataRes) {
            console.error('Failed to read extra data')
            return
          }
          extraData = Buffer.from(extraDataRes)
        }

        const message = header.toMessage(extraData)
        console.log('Parsed message:', message?.constructor?.name)
        if (message) this.emit('message', message)
      } catch (error) {
        if (error instanceof HeaderBuildError) {
          console.error(`Error parsing header for data`, error)
        } else {
          console.error(`Unexpected Error parsing header for data`, error)
        }
        this.errorCount++
      }
    }
  }

  start = async (config) => {
    if (!this._device) {
      throw new DriverStateError('No device set - call initialise first')
    }
    if (!this._device?.opened) {
      return
    }

    this.errorCount = 0
    const {
      dpi: _dpi,
      nightMode: _nightMode,
      boxName: _boxName,
      audioTransferMode,
      wifiType,
      micType,
    } = config
    console.log('Starting driver with config:', config)
    const initMessages = [
      new SendNumber(_dpi, FileAddress.DPI),
      new SendOpen(config),
      new SendBoolean(_nightMode, FileAddress.NIGHT_MODE),
      new SendNumber(config.hand, FileAddress.HAND_DRIVE_MODE),
      new SendBoolean(true, FileAddress.CHARGE_MODE),
      new SendString(_boxName, FileAddress.BOX_NAME),
      new SendBoxSettings(config),
      new SendCommand('wifiEnable'),
      new SendCommand(wifiType === '5ghz' ? 'wifi5g' : 'wifi24g'),
      new SendCommand(micType === 'box' ? 'boxMic' : 'mic'),
      new SendCommand(
        audioTransferMode ? 'audioTransferOn' : 'audioTransferOff',
      ),
    ]
    if (config.androidWorkMode) {
      initMessages.push(
        new SendBoolean(config.androidWorkMode, FileAddress.ANDROID_WORK_MODE),
      )
    }
    console.log('Sending', initMessages.length, 'initialization messages')
    await Promise.all(initMessages.map(this.send))
    console.log('Init messages sent, scheduling wifiConnect...')
    setTimeout(() => {
      console.log('Sending wifiConnect command')
      this.send(new SendCommand('wifiConnect'))
    }, 1000)

    console.log('Starting readLoop...')
    this.readLoop()

    this._heartbeatInterval = setInterval(() => {
      this.send(new HeartBeat())
    }, 2000)
  }

  close = async () => {
    if (!this._device) {
      return
    }
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval)
      this._heartbeatInterval = null
    }
    await this._device.close()
    this._device = null
    this._inEP = null
    this._outEP = null
  }
}