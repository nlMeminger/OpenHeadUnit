"""
CarPlay Dongle - Python driver for CarPlay/Android Auto USB devices
"""

__version__ = "1.0.0"

# Core driver
from .dongle_driver import (
    DongleDriver,
    DongleConfig,
    DEFAULT_CONFIG,
    HandDriveType,
    DriverStateError,
)

# Modular components
from .video_decoder import VideoDecoder, DecoderBackend, FrameSaver
from .audio_handler import AudioHandler, AudioFormat
from .touch_handler import TouchHandler, TouchAction, MultiTouchHandler
from .device_finder import DeviceFinder, DeviceInfo
from .stats_tracker import StatsTracker, PerformanceMonitor

__all__ = [
    "__version__",
    "DongleDriver",
    "DongleConfig",
    "DEFAULT_CONFIG",
    "HandDriveType",
    "DriverStateError",
    "VideoDecoder",
    "DecoderBackend",
    "FrameSaver",
    "AudioHandler",
    "AudioFormat",
    "TouchHandler",
    "TouchAction",
    "MultiTouchHandler",
    "DeviceFinder",
    "DeviceInfo",
    "StatsTracker",
    "PerformanceMonitor",
]
