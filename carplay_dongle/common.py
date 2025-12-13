import struct
from enum import IntEnum
from typing import Optional


class CommandMapping(IntEnum):
    invalid = 0
    startRecordAudio = 1
    stopRecordAudio = 2
    requestHostUI = 3
    siri = 5
    mic = 7
    boxMic = 15
    enableNightMode = 16
    disableNightMode = 17
    wifi24g = 24
    wifi5g = 25
    left = 100
    right = 101
    frame = 12
    audioTransferOn = 22
    audioTransferOff = 23
    selectDown = 104
    selectUp = 105
    back = 106
    up = 113
    down = 114
    home = 200
    play = 201
    pause = 202
    playOrPause = 203
    next = 204
    prev = 205
    acceptPhone = 300
    rejectPhone = 301
    requestVideoFocus = 500
    releaseVideoFocus = 501
    wifiEnable = 1000
    autoConnetEnable = 1001
    wifiConnect = 1002
    scanningDevice = 1003
    deviceFound = 1004
    deviceNotFound = 1005
    connectDeviceFailed = 1006
    btConnected = 1007
    btDisconnected = 1008
    wifiConnected = 1009
    wifiDisconnected = 1010
    btPairStart = 1011
    wifiPair = 1012


class MessageType(IntEnum):
    requestHostUI = 0x00
    Open = 0x01
    Plugged = 0x02
    Phase = 0x03
    Unplugged = 0x04
    Touch = 0x05
    VideoData = 0x06
    AudioData = 0x07
    Command = 0x08
    LogoType = 0x09
    DisconnectPhone = 0x0f
    CloseDongle = 0x15
    BluetoothAddress = 0x0a
    BluetoothPIN = 0x0c
    BluetoothDeviceName = 0x0d
    WifiDeviceName = 0x0e
    BluetoothPairedList = 0x12
    ManufacturerInfo = 0x14
    MultiTouch = 0x17
    HiCarLink = 0x18
    BoxSettings = 0x19
    MediaData = 0x2a
    Unknown = 0x26
    SendFile = 0x99
    HeartBeat = 0xaa
    SoftwareVersion = 0xcc


class HeaderBuildError(Exception):
    pass


class MessageHeader:
    DATA_LENGTH = 16
    MAGIC = 0x55aa55aa

    def __init__(self, length: int, msg_type: MessageType):
        self.length = length
        self.type = msg_type

    @classmethod
    def from_buffer(cls, data: bytes) -> 'MessageHeader':
        """Parse a message header from bytes"""
        if len(data) != 16:
            raise HeaderBuildError(f'Invalid buffer size - Expecting 16, got {len(data)}')

        magic = struct.unpack('<I', data[0:4])[0]
        if magic != cls.MAGIC:
            raise HeaderBuildError(f'Invalid magic number, received {magic}')

        length = struct.unpack('<I', data[4:8])[0]
        msg_type_raw = struct.unpack('<I', data[8:12])[0]
        
        # Try to convert to MessageType, or use raw value if unknown
        try:
            msg_type = MessageType(msg_type_raw)
        except ValueError:
            print(f'⚠️  UNKNOWN MESSAGE TYPE: 0x{msg_type_raw:02x} ({msg_type_raw})')
            print(f'    Data length: {length} bytes')
            # Create a dynamic enum value for unknown types
            msg_type = msg_type_raw
            
        type_check = struct.unpack('<I', data[12:16])[0]

        expected_check = ((msg_type_raw ^ -1) & 0xffffffff)
        if type_check != expected_check:
            raise HeaderBuildError(f'Invalid type check, received {type_check}')

        return cls(length, msg_type)

    @classmethod
    def as_buffer(cls, message_type: MessageType, byte_length: int) -> bytes:
        """Create a message header as bytes"""
        magic = struct.pack('<I', cls.MAGIC)
        data_len = struct.pack('<I', byte_length)
        msg_type = struct.pack('<I', message_type)
        type_check = struct.pack('<I', ((message_type ^ -1) & 0xffffffff))
        return magic + data_len + msg_type + type_check

    def to_message(self, data: Optional[bytes] = None):
        """Convert header to appropriate message type"""
        try:
            # Try package-style import first
            from .readable import (
                Message,
                AudioData,
                VideoData,
                MediaData,
                BluetoothAddress,
                BluetoothDeviceName,
                BluetoothPIN,
                ManufacturerInfo,
                SoftwareVersion,
                Command,
                Plugged,
                WifiDeviceName,
                HiCarLink,
                BluetoothPairedList,
                Opened,
                BoxInfo,
                Unplugged,
                Phase,
            )
        except ImportError:
            # Fall back to direct import
            import readable
            Message = readable.Message
            AudioData = readable.AudioData
            VideoData = readable.VideoData
            MediaData = readable.MediaData
            BluetoothAddress = readable.BluetoothAddress
            BluetoothDeviceName = readable.BluetoothDeviceName
            BluetoothPIN = readable.BluetoothPIN
            ManufacturerInfo = readable.ManufacturerInfo
            SoftwareVersion = readable.SoftwareVersion
            Command = readable.Command
            Plugged = readable.Plugged
            WifiDeviceName = readable.WifiDeviceName
            HiCarLink = readable.HiCarLink
            BluetoothPairedList = readable.BluetoothPairedList
            Opened = readable.Opened
            BoxInfo = readable.BoxInfo
            Unplugged = readable.Unplugged
            Phase = readable.Phase

        # Handle unknown MessageType enums
        if not isinstance(self.type, MessageType):
            # Unknown message type (raw int)
            print(f'⚠️  UNKNOWN MESSAGE TYPE: 0x{self.type:02x} ({self.type})')
            print(f'    Data length: {self.length} bytes')
            if data:
                print(f'    First 32 bytes (hex): {data[:32].hex()}')
                print(f'    First 32 bytes (ascii): {self._safe_ascii(data[:32])}')
                
                # Try to parse as different common structures
                if len(data) >= 4:
                    int_val = struct.unpack('<I', data[0:4])[0]
                    print(f'    First 4 bytes as uint32: {int_val} (0x{int_val:08x})')
                
                if len(data) >= 8:
                    int_val2 = struct.unpack('<I', data[4:8])[0]
                    print(f'    Next 4 bytes as uint32: {int_val2} (0x{int_val2:08x})')
            else:
                print(f'    (No data payload)')
            return None

        if data:
            message_map = {
                MessageType.AudioData: AudioData,
                MessageType.VideoData: VideoData,
                MessageType.MediaData: MediaData,
                MessageType.BluetoothAddress: BluetoothAddress,
                MessageType.BluetoothDeviceName: BluetoothDeviceName,
                MessageType.BluetoothPIN: BluetoothPIN,
                MessageType.ManufacturerInfo: ManufacturerInfo,
                MessageType.SoftwareVersion: SoftwareVersion,
                MessageType.Command: Command,
                MessageType.Plugged: Plugged,
                MessageType.WifiDeviceName: WifiDeviceName,
                MessageType.HiCarLink: HiCarLink,
                MessageType.BluetoothPairedList: BluetoothPairedList,
                MessageType.Open: Opened,
                MessageType.BoxSettings: BoxInfo,
                MessageType.Phase: Phase,
            }

            message_class = message_map.get(self.type)
            if message_class:
                return message_class(self, data)
            else:
                print(f'⚠️  UNHANDLED MESSAGE TYPE: {self.type.name} (0x{self.type:02x})')
                print(f'    Data length: {len(data)} bytes')
                print(f'    First 32 bytes (hex): {data[:32].hex()}')
                print(f'    First 32 bytes (ascii): {self._safe_ascii(data[:32])}')
                return None
        else:
            if self.type == MessageType.Unplugged:
                return Unplugged(self)
            else:
                print(f'⚠️  MESSAGE WITHOUT DATA: {self.type.name} (0x{self.type:02x})')
                return None
    
    @staticmethod
    def _safe_ascii(data: bytes) -> str:
        """Convert bytes to safe ASCII representation"""
        return ''.join(chr(b) if 32 <= b < 127 else f'\\x{b:02x}' for b in data)