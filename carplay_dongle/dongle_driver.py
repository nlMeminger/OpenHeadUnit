import usb.core
import usb.util
import threading
import time
from typing import Optional, Dict, Any
from enum import IntEnum

try:
    from events import EventEmitter
    from common import MessageHeader, HeaderBuildError
    from readable import PhoneType
    from sendable import (
        SendableMessage,
        SendNumber,
        FileAddress,
        SendOpen,
        SendBoolean,
        SendString,
        SendBoxSettings,
        SendCommand,
        HeartBeat,
    )
except ImportError:
    from .events import EventEmitter
    from common import MessageHeader, HeaderBuildError
    from readable import PhoneType
    from sendable import (
        SendableMessage,
        SendNumber,
        FileAddress,
        SendOpen,
        SendBoolean,
        SendString,
        SendBoxSettings,
        SendCommand,
        HeartBeat,
    )

CONFIG_NUMBER = 1
MAX_ERROR_COUNT = 5


class HandDriveType(IntEnum):
    LHD = 0
    RHD = 1


class PhoneTypeConfig:
    def __init__(self, frame_interval: Optional[int] = None):
        self.frame_interval = frame_interval


class DongleConfig:
    def __init__(
        self,
        android_work_mode: Optional[bool] = None,
        width: int = 800,
        height: int = 640,
        fps: int = 20,
        dpi: int = 160,
        format: int = 5,
        i_box_version: int = 2,
        packet_max: int = 49152,
        phone_work_mode: int = 2,
        night_mode: bool = False,
        box_name: str = 'nodePlay',
        hand: HandDriveType = HandDriveType.LHD,
        media_delay: int = 300,
        audio_transfer_mode: bool = False,
        wifi_type: str = '5ghz',
        mic_type: str = 'os',
        phone_config: Optional[Dict[PhoneType, PhoneTypeConfig]] = None
    ):
        self.android_work_mode = android_work_mode
        self.width = width
        self.height = height
        self.fps = fps
        self.dpi = dpi
        self.format = format
        self.i_box_version = i_box_version
        self.packet_max = packet_max
        self.phone_work_mode = phone_work_mode
        self.night_mode = night_mode
        self.box_name = box_name
        self.hand = hand
        self.media_delay = media_delay
        self.audio_transfer_mode = audio_transfer_mode
        self.wifi_type = wifi_type
        self.mic_type = mic_type
        
        if phone_config is None:
            self.phone_config = {
                PhoneType.CarPlay: PhoneTypeConfig(frame_interval=5000),
                PhoneType.AndroidAuto: PhoneTypeConfig(frame_interval=None),
            }
        else:
            self.phone_config = phone_config


DEFAULT_CONFIG = DongleConfig()


class DriverStateError(Exception):
    pass


class DongleDriver(EventEmitter):
    KNOWN_DEVICES = [
        {'vendor_id': 0x1314, 'product_id': 0x1520},
        {'vendor_id': 0x1314, 'product_id': 0x1521},
    ]

    def __init__(self):
        super().__init__()
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._read_thread: Optional[threading.Thread] = None
        self._device: Optional[usb.core.Device] = None
        self._in_ep: Optional[usb.core.Endpoint] = None
        self._out_ep: Optional[usb.core.Endpoint] = None
        self.error_count = 0
        self._running = False
        self._heartbeat_running = False

    def initialize(self, device: usb.core.Device):
        """Initialize the USB device"""
        if self._device:
            return

        try:
            self._device = device
            print('Initializing device')

            # Set configuration
            self._device.set_configuration(CONFIG_NUMBER)
            cfg = self._device.get_active_configuration()

            if cfg is None:
                raise DriverStateError('Illegal state - device has no configuration')

            print('Getting interface')
            interface = cfg[(0, 0)]

            # Find endpoints
            in_endpoint = None
            out_endpoint = None

            for ep in interface:
                if usb.util.endpoint_direction(ep.bEndpointAddress) == usb.util.ENDPOINT_IN:
                    in_endpoint = ep
                elif usb.util.endpoint_direction(ep.bEndpointAddress) == usb.util.ENDPOINT_OUT:
                    out_endpoint = ep

            if not in_endpoint:
                raise DriverStateError('Illegal state - no IN endpoint found')

            if not out_endpoint:
                raise DriverStateError('Illegal state - no OUT endpoint found')

            self._in_ep = in_endpoint
            self._out_ep = out_endpoint

            print(f'Device initialized: {self._device}')

        except Exception as err:
            self.close()
            raise err

    def send(self, message: SendableMessage) -> Optional[bool]:
        """Send a message to the device"""
        if not self._device:
            return None

        try:
            payload = message.serialize()
            bytes_written = self._out_ep.write(payload)
            return bytes_written == len(payload)
        except Exception as err:
            print(f'Failure sending message to dongle: {err}')
            return False

    def _read_loop(self):
        """Read loop for receiving messages from device"""
        while self._running and self._device:
            # If we error out - stop loop, emit failure
            if self.error_count >= MAX_ERROR_COUNT:
                self.close()
                self.emit('failure')
                return

            try:
                # Read header
                header_data = self._in_ep.read(MessageHeader.DATA_LENGTH, timeout=1000)
                if not header_data:
                    raise HeaderBuildError('Failed to read header data')

                header = MessageHeader.from_buffer(bytes(header_data))
                
                extra_data = None
                if header.length:
                    extra_data_raw = self._in_ep.read(header.length, timeout=1000)
                    if not extra_data_raw:
                        print('Failed to read extra data')
                        continue
                    extra_data = bytes(extra_data_raw)

                message = header.to_message(extra_data)
                if message:
                    self.emit('message', message)

            except usb.core.USBError as error:
                if error.errno == 110:  # Timeout
                    continue
                print(f'USB Error in read loop: {error}')
                self.error_count += 1
            except HeaderBuildError as error:
                print(f'Error parsing header: {error}')
                self.error_count += 1
            except Exception as error:
                print(f'Unexpected error parsing header: {error}')
                self.error_count += 1

    def _heartbeat_loop(self):
        """Send heartbeat messages periodically"""
        while self._heartbeat_running:
            self.send(HeartBeat())
            time.sleep(2)

    def start(self, config: DongleConfig):
        """Start the driver with the given configuration"""
        if not self._device:
            raise DriverStateError('No device set - call initialize first')

        self.error_count = 0
        self._running = True
        self._heartbeat_running = True

        # Send initialization messages
        init_messages = [
            SendNumber(config.dpi, FileAddress.DPI),
            SendOpen(config),
            SendBoolean(config.night_mode, FileAddress.NIGHT_MODE),
            SendNumber(config.hand, FileAddress.HAND_DRIVE_MODE),
            SendBoolean(True, FileAddress.CHARGE_MODE),
            SendString(config.box_name, FileAddress.BOX_NAME),
            SendBoxSettings(config),
            SendCommand('wifiEnable'),
            SendCommand('wifi5g' if config.wifi_type == '5ghz' else 'wifi24g'),
            SendCommand('boxMic' if config.mic_type == 'box' else 'mic'),
            SendCommand('audioTransferOn' if config.audio_transfer_mode else 'audioTransferOff'),
        ]

        if config.android_work_mode is not None:
            init_messages.append(
                SendBoolean(config.android_work_mode, FileAddress.ANDROID_WORK_MODE)
            )

        for msg in init_messages:
            self.send(msg)

        # Delayed wifi connect
        time.sleep(1)
        self.send(SendCommand('wifiConnect'))

        # Start read thread
        self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
        self._read_thread.start()

        # Start heartbeat thread
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()

    def close(self):
        """Close the device and clean up"""
        if not self._device:
            return

        self._running = False
        self._heartbeat_running = False

        # Wait for threads to finish (but don't join from within the thread itself)
        current_thread = threading.current_thread()
        
        if self._heartbeat_thread and self._heartbeat_thread != current_thread:
            self._heartbeat_thread.join(timeout=3)
            self._heartbeat_thread = None

        if self._read_thread and self._read_thread != current_thread:
            self._read_thread.join(timeout=3)
            self._read_thread = None

        try:
            usb.util.dispose_resources(self._device)
        except:
            pass

        self._device = None
        self._in_ep = None
        self._out_ep = None