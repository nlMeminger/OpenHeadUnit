import struct
import json
import numpy as np
from enum import IntEnum
from typing import List, Dict

try:
    from common import MessageType, MessageHeader, CommandMapping
except ImportError:
    from .common import MessageType, MessageHeader, CommandMapping


def clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp a value between min and max"""
    return max(min_val, min(value, max_val))


def get_current_time_in_ms() -> int:
    """Get current time in milliseconds"""
    import time
    return round(time.time())


class SendableMessage:
    """Base class for sendable messages"""
    type: MessageType = None

    def serialize(self) -> bytes:
        """Serialize the message to bytes"""
        return MessageHeader.as_buffer(self.type, 0)


class SendableMessageWithPayload(SendableMessage):
    """Base class for sendable messages with payload"""
    
    def get_payload(self) -> bytes:
        """Get the message payload - must be implemented by subclasses"""
        raise NotImplementedError

    def serialize(self) -> bytes:
        """Serialize the message to bytes"""
        data = self.get_payload()
        byte_length = len(data)
        header = MessageHeader.as_buffer(self.type, byte_length)
        return header + data


class SendCommand(SendableMessageWithPayload):
    """Send a command message"""
    type = MessageType.Command

    def __init__(self, value: str):
        self.value = CommandMapping[value]

    def get_payload(self) -> bytes:
        return struct.pack('<I', self.value)


class TouchAction(IntEnum):
    Down = 14
    Move = 15
    Up = 16


class SendTouch(SendableMessageWithPayload):
    """Send a touch event"""
    type = MessageType.Touch

    def __init__(self, x: float, y: float, action: TouchAction):
        self.x = x
        self.y = y
        self.action = action

    def get_payload(self) -> bytes:
        final_x = int(clamp(10000 * self.x, 0, 10000))
        final_y = int(clamp(10000 * self.y, 0, 10000))
        
        data = struct.pack('<IIII', self.action, final_x, final_y, 0)
        return data


class MultiTouchAction(IntEnum):
    Down = 1
    Move = 2
    Up = 0


class TouchItem:
    """Individual touch item for multi-touch"""
    def __init__(self, x: float, y: float, action: MultiTouchAction, touch_id: int):
        self.x = x
        self.y = y
        self.action = action
        self.id = touch_id

    def get_payload(self) -> bytes:
        return struct.pack('<ffII', self.x, self.y, self.action, self.id)


class SendMultiTouch(SendableMessageWithPayload):
    """Send multi-touch events"""
    type = MessageType.MultiTouch

    def __init__(self, touch_data: List[Dict]):
        self.touches = [
            TouchItem(item['x'], item['y'], item['action'], index)
            for index, item in enumerate(touch_data)
        ]

    def get_payload(self) -> bytes:
        return b''.join(touch.get_payload() for touch in self.touches)


class SendAudio(SendableMessageWithPayload):
    """Send audio data"""
    type = MessageType.AudioData

    def __init__(self, data: np.ndarray):
        self.data = data

    def get_payload(self) -> bytes:
        audio_header = struct.pack('<IfI', 5, 0.0, 3)
        return audio_header + self.data.tobytes()


class FileAddress:
    """File addresses for sending files to device"""
    DPI = '/tmp/screen_dpi'
    NIGHT_MODE = '/tmp/night_mode'
    HAND_DRIVE_MODE = '/tmp/hand_drive_mode'
    CHARGE_MODE = '/tmp/charge_mode'
    BOX_NAME = '/etc/box_name'
    OEM_ICON = '/etc/oem_icon.png'
    AIRPLAY_CONFIG = '/etc/airplay.conf'
    ICON_120 = '/etc/icon_120x120.png'
    ICON_180 = '/etc/icon_180x180.png'
    ICON_250 = '/etc/icon_256x256.png'
    ANDROID_WORK_MODE = '/etc/android_work_mode'


class SendFile(SendableMessageWithPayload):
    """Send a file to the device"""
    type = MessageType.SendFile

    def __init__(self, content: bytes, file_name: str):
        self.content = content
        self.file_name = file_name

    def get_payload(self) -> bytes:
        # File name with null terminator
        file_name_bytes = (self.file_name + '\0').encode('ascii')
        name_length = struct.pack('<I', len(file_name_bytes))
        content_length = struct.pack('<I', len(self.content))
        
        return name_length + file_name_bytes + content_length + self.content


class SendNumber(SendFile):
    """Send a number value to a file"""
    def __init__(self, content: int, file: str):
        message = struct.pack('<I', content)
        super().__init__(message, file)


class SendBoolean(SendNumber):
    """Send a boolean value to a file"""
    def __init__(self, content: bool, file: str):
        super().__init__(int(content), file)


class SendString(SendFile):
    """Send a string value to a file"""
    def __init__(self, content: str, file: str):
        if len(content) > 16:
            print('Warning: string too long')
        message = content.encode('ascii')
        super().__init__(message, file)


class HeartBeat(SendableMessage):
    """Heartbeat message"""
    type = MessageType.HeartBeat


class SendOpen(SendableMessageWithPayload):
    """Send open message with configuration"""
    type = MessageType.Open

    def __init__(self, config):
        self.config = config

    def get_payload(self) -> bytes:
        return struct.pack(
            '<IIIIIII',
            self.config.width,
            self.config.height,
            self.config.fps,
            self.config.format,
            self.config.packet_max,
            self.config.i_box_version,
            self.config.phone_work_mode
        )


class SendBoxSettings(SendableMessageWithPayload):
    """Send box settings"""
    type = MessageType.BoxSettings

    def __init__(self, config, sync_time: int = None):
        self.config = config
        self.sync_time = sync_time

    def get_payload(self) -> bytes:
        settings = {
            'mediaDelay': self.config.media_delay,
            'syncTime': self.sync_time if self.sync_time is not None else get_current_time_in_ms(),
            'androidAutoSizeW': self.config.width,
            'androidAutoSizeH': self.config.height,
        }
        return json.dumps(settings).encode('ascii')


class LogoType(IntEnum):
    HomeButton = 1
    Siri = 2


class SendLogoType(SendableMessageWithPayload):
    """Send logo type"""
    type = MessageType.LogoType

    def __init__(self, logo_type: LogoType):
        self.logo_type = logo_type

    def get_payload(self) -> bytes:
        return struct.pack('<I', self.logo_type)


class SendIconConfig(SendFile):
    """Send icon configuration"""
    def __init__(self, config: Dict):
        value_map = {
            'oemIconVisible': 1,
            'name': 'AutoBox',
            'model': 'Magic-Car-Link-1.00',
            'oemIconPath': FileAddress.OEM_ICON,
        }

        if 'label' in config and config['label']:
            value_map['oemIconLabel'] = config['label']

        file_data = '\n'.join(f'{k} = {v}' for k, v in value_map.items()) + '\n'
        super().__init__(file_data.encode('ascii'), FileAddress.AIRPLAY_CONFIG)


class SendCloseDongle(SendableMessage):
    """Disconnect phone and close dongle"""
    type = MessageType.CloseDongle


class SendDisconnectPhone(SendableMessage):
    """Disconnect phone session"""
    type = MessageType.DisconnectPhone