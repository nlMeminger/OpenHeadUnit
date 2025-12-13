import struct
import json
import numpy as np
from enum import IntEnum
from typing import Optional, Dict, Any


from .common import MessageHeader, CommandMapping


class AudioCommand(IntEnum):
    AudioOutputStart = 1
    AudioOutputStop = 2
    AudioInputConfig = 3
    AudioPhonecallStart = 4
    AudioPhonecallStop = 5
    AudioNaviStart = 6
    AudioNaviStop = 7
    AudioSiriStart = 8
    AudioSiriStop = 9
    AudioMediaStart = 10
    AudioMediaStop = 11
    AudioAlertStart = 12
    AudioAlertStop = 13


class PhoneType(IntEnum):
    AndroidMirror = 1
    CarPlay = 3
    iPhoneMirror = 4
    AndroidAuto = 5
    HiCar = 6


class Message:
    def __init__(self, header: MessageHeader):
        self.header = header


class Command(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        command_value = struct.unpack('<I', data[0:4])[0]
        
        try:
            self.value = CommandMapping(command_value)
            print(f'📩 COMMAND: {self.value.name} ({command_value})')
        except ValueError:
            # Unknown command
            self.value = None
            print(f'⚠️  UNKNOWN COMMAND: {command_value} (0x{command_value:08x})')
            print(f'    Known commands range: 0-{max(CommandMapping).value}')
            
            # Show data if there's more
            if len(data) > 4:
                print(f'    Extra data length: {len(data) - 4} bytes')
                print(f'    Extra data (hex): {data[4:].hex()}')
            
            # Suggest possible command category
            if command_value < 100:
                print(f'    Category: Likely basic control command')
            elif 100 <= command_value < 200:
                print(f'    Category: Likely navigation/UI command')
            elif 200 <= command_value < 300:
                print(f'    Category: Likely media control command')
            elif 300 <= command_value < 400:
                print(f'    Category: Likely phone control command')
            elif command_value >= 1000:
                print(f'    Category: Likely wireless/connectivity command')
            
            # List similar known commands
            nearby_commands = [
                (name, val) for name, val in CommandMapping.__members__.items()
                if abs(val - command_value) <= 10
            ]
            if nearby_commands:
                print(f'    Nearby known commands:')
                for name, val in sorted(nearby_commands, key=lambda x: abs(x[1] - command_value)):
                    print(f'      - {name}: {val} (diff: {command_value - val:+d})')


class ManufacturerInfo(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.a = struct.unpack('<I', data[0:4])[0]
        self.b = struct.unpack('<I', data[4:8])[0]


class SoftwareVersion(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.version = data.decode('ascii')


class BluetoothAddress(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.address = data.decode('ascii')


class BluetoothPIN(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.pin = data.decode('ascii')


class BluetoothDeviceName(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.name = data.decode('ascii')


class WifiDeviceName(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.name = data.decode('ascii')


class HiCarLink(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.link = data.decode('ascii')


class BluetoothPairedList(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.data = data.decode('ascii')


class Plugged(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        wifi_avail = len(data) == 8
        
        if wifi_avail:
            self.phone_type = PhoneType(struct.unpack('<I', data[0:4])[0])
            self.wifi = struct.unpack('<I', data[4:8])[0]
            print(f'📱 PHONE PLUGGED: {self.phone_type.name}, WiFi available: {self.wifi}')
        else:
            self.phone_type = PhoneType(struct.unpack('<I', data[0:4])[0])
            self.wifi = None
            print(f'📱 PHONE PLUGGED: {self.phone_type.name}, WiFi not available')


class Unplugged(Message):
    def __init__(self, header: MessageHeader):
        super().__init__(header)
        print(f'📱 PHONE UNPLUGGED')


class AudioFormat:
    def __init__(self, frequency: int, channel: int, bit_depth: int, 
                 format_str: str = None, mime_type: str = None):
        self.frequency = frequency
        self.channel = channel
        self.bit_depth = bit_depth
        self.format = format_str
        self.mime_type = mime_type


DECODE_TYPE_MAP: Dict[int, AudioFormat] = {
    1: AudioFormat(44100, 2, 16, "S16LE", "audio/L16; rate=44100; channels=2"),
    2: AudioFormat(44100, 2, 16, "S16LE", "audio/L16; rate=44100; channels=2"),
    3: AudioFormat(8000, 1, 16, "S16LE", "audio/L16; rate=8000; channels=1"),
    4: AudioFormat(48000, 2, 16, "S16LE", "audio/L16; rate=48000; channels=2"),
    5: AudioFormat(16000, 1, 16, "S16LE", "audio/L16; rate=16000; channels=1"),
    6: AudioFormat(24000, 1, 16, "S16LE", "audio/L16; rate=24000; channels=1"),
    7: AudioFormat(16000, 2, 16, "S16LE", "audio/L16; rate=16000; channels=2"),
}


class AudioData(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.decode_type = struct.unpack('<I', data[0:4])[0]
        self.volume = struct.unpack('<f', data[4:8])[0]
        self.audio_type = struct.unpack('<I', data[8:12])[0]
        
        amount = len(data) - 12
        self.command = None
        self.volume_duration = None
        self.data = None
        
        if amount == 1:
            cmd_val = struct.unpack('<b', data[12:13])[0]
            try:
                self.command = AudioCommand(cmd_val)
            except ValueError:
                print(f'⚠️  UNKNOWN AUDIO COMMAND: {cmd_val}')
                print(f'    Known audio commands: {[c.name for c in AudioCommand]}')
        elif amount == 4:
            self.volume_duration = struct.unpack('<f', data[12:16])[0]
        else:
            # Convert to int16 array
            self.data = np.frombuffer(data[12:], dtype=np.int16)


class VideoData(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.width = struct.unpack('<I', data[0:4])[0]
        self.height = struct.unpack('<I', data[4:8])[0]
        self.flags = struct.unpack('<I', data[8:12])[0]
        self.length = struct.unpack('<I', data[12:16])[0]
        self.unknown = struct.unpack('<I', data[16:20])[0]
        self.data = data[20:]


class MediaType(IntEnum):
    Data = 1
    AlbumCover = 3


class MediaData(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        media_type = struct.unpack('<I', data[0:4])[0]
        
        self.payload = None
        
        if media_type == MediaType.AlbumCover:
            import base64
            image_data = data[4:]
            self.payload = {
                'type': MediaType.AlbumCover,
                'base64Image': base64.b64encode(image_data).decode('ascii')
            }
        elif media_type == MediaType.Data:
            media_data = data[4:-1]
            self.payload = {
                'type': MediaType.Data,
                'media': json.loads(media_data.decode('utf-8'))
            }
        else:
            print(f'⚠️  UNEXPECTED MEDIA TYPE: {media_type}')
            print(f'    Known media types: {[t.name for t in MediaType]}')


class Opened(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.width = struct.unpack('<I', data[0:4])[0]
        self.height = struct.unpack('<I', data[4:8])[0]
        self.fps = struct.unpack('<I', data[8:12])[0]
        self.format = struct.unpack('<I', data[12:16])[0]
        self.packet_max = struct.unpack('<I', data[16:20])[0]
        self.i_box = struct.unpack('<I', data[20:24])[0]
        self.phone_mode = struct.unpack('<I', data[24:28])[0]
        print(f'📺 SESSION OPENED: {self.width}x{self.height} @ {self.fps}fps')


class BoxInfo(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.settings = json.loads(data.decode('utf-8'))


class Phase(Message):
    def __init__(self, header: MessageHeader, data: bytes):
        super().__init__(header)
        self.phase = struct.unpack('<I', data[0:4])[0]
        print(f'🔄 PHASE CHANGE: {self.phase}')