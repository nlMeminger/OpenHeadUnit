"""
Video Decoder Module

Provides flexible video decoding with multiple decoder backends (PyAV, OpenCV).
Supports H.264 and other video formats with automatic fallback.
"""

import numpy as np
from typing import Optional, List, Tuple, Callable
from enum import IntEnum


class DecoderBackend(IntEnum):
    """Available decoder backends"""
    PYAV = 1
    OPENCV = 2


class VideoDecoder:
    """
    Multi-backend video decoder with automatic fallback
    
    Attempts to decode video frames using multiple methods:
    1. PyAV (preferred for H.264)
    2. OpenCV (fallback, supports JPEG and RGB565)
    """
    
    def __init__(self, preferred_backend: Optional[DecoderBackend] = None):
        """
        Initialize the decoder
        
        Args:
            preferred_backend: Preferred decoder backend to try first
        """
        self.decoders: List[Tuple[str, Callable]] = []
        self.frame_count = 0
        self.decode_success_count = 0
        self.decode_error_count = 0
        self.preferred_backend = preferred_backend
        
        # Initialize decoders
        self._init_pyav()
        self._init_opencv()
        
        if not self.decoders:
            print("WARNING: No decoders available! Install PyAV or OpenCV.")
            print("  pip install av")
            print("  or")
            print("  pip install opencv-python")
    
    def _init_pyav(self):
        """Initialize PyAV decoder"""
        try:
            import av
            self.pyav_codec = av.CodecContext.create('h264', 'r')
            self.pyav_codec.options = {'flags2': '+export_mvs'}
            
            if self.preferred_backend == DecoderBackend.PYAV:
                self.decoders.insert(0, ('PyAV', self._decode_with_pyav))
            else:
                self.decoders.append(('PyAV', self._decode_with_pyav))
            
            print("✓ PyAV decoder initialized")
        except ImportError:
            print("✗ PyAV not available (pip install av)")
            self.pyav_codec = None
        except Exception as e:
            print(f"✗ PyAV initialization failed: {e}")
            self.pyav_codec = None
    
    def _init_opencv(self):
        """Initialize OpenCV decoder"""
        try:
            import cv2
            self.cv2 = cv2
            
            if self.preferred_backend == DecoderBackend.OPENCV:
                self.decoders.insert(0, ('OpenCV', self._decode_with_opencv))
            else:
                self.decoders.append(('OpenCV', self._decode_with_opencv))
            
            print("✓ OpenCV decoder available")
        except ImportError:
            print("✗ OpenCV not available (pip install opencv-python)")
            self.cv2 = None
    
    def _decode_with_pyav(self, data: bytes, width: int, height: int) -> Optional[np.ndarray]:
        """
        Decode using PyAV (best for H.264)
        
        Args:
            data: Raw video frame data
            width: Expected frame width
            height: Expected frame height
            
        Returns:
            RGB image as numpy array or None if decoding fails
        """
        if not self.pyav_codec:
            return None
        
        try:
            import av
            packet = av.packet.Packet(data)
            frames = self.pyav_codec.decode(packet)
            
            for frame in frames:
                return frame.to_ndarray(format='rgb24')
            return None
        except Exception as e:
            # Only print occasionally to avoid spam
            if self.frame_count % 30 == 0:
                print(f"PyAV decode error: {e}")
            return None
    
    def _decode_with_opencv(self, data: bytes, width: int, height: int) -> Optional[np.ndarray]:
        """
        Decode using OpenCV (supports JPEG and RGB565)
        
        Args:
            data: Raw video frame data
            width: Expected frame width
            height: Expected frame height
            
        Returns:
            RGB image as numpy array or None if decoding fails
        """
        if not self.cv2:
            return None
        
        try:
            # Try to decode as JPEG first
            img = self.cv2.imdecode(np.frombuffer(data, dtype=np.uint8), self.cv2.IMREAD_COLOR)
            if img is not None:
                return self.cv2.cvtColor(img, self.cv2.COLOR_BGR2RGB)
            
            # Try as raw RGB565
            expected_size_rgb565 = width * height * 2
            if len(data) == expected_size_rgb565:
                img_565 = np.frombuffer(data, dtype=np.uint16).reshape((height, width))
                r = ((img_565 & 0xF800) >> 11) << 3
                g = ((img_565 & 0x07E0) >> 5) << 2
                b = (img_565 & 0x001F) << 3
                return np.stack([r, g, b], axis=2).astype(np.uint8)
            
            return None
        except Exception as e:
            if self.frame_count % 30 == 0:
                print(f"OpenCV decode error: {e}")
            return None
    
    def decode_frame(self, data: bytes, width: int, height: int) -> Optional[np.ndarray]:
        """
        Decode a video frame using all available decoders
        
        Args:
            data: Raw video frame data
            width: Expected frame width
            height: Expected frame height
            
        Returns:
            RGB image as numpy array or None if all decoders fail
        """
        self.frame_count += 1
        
        # Try each decoder in order
        for decoder_name, decoder_func in self.decoders:
            result = decoder_func(data, width, height)
            if result is not None:
                self.decode_success_count += 1
                return result
        
        # All decoders failed
        self.decode_error_count += 1
        return None
    
    def get_stats(self) -> dict:
        """
        Get decoder statistics
        
        Returns:
            Dictionary with decoder stats
        """
        success_rate = 0.0
        if self.frame_count > 0:
            success_rate = (self.decode_success_count / self.frame_count) * 100
        
        return {
            'total_frames': self.frame_count,
            'successful_decodes': self.decode_success_count,
            'failed_decodes': self.decode_error_count,
            'success_rate': success_rate,
            'available_decoders': [name for name, _ in self.decoders]
        }
    
    def reset_stats(self):
        """Reset decoder statistics"""
        self.frame_count = 0
        self.decode_success_count = 0
        self.decode_error_count = 0


class FrameSaver:
    """
    Utility to save raw video frames to disk for debugging
    """
    
    def __init__(self, output_dir: str = 'raw_frames', max_frames: int = 100):
        """
        Initialize frame saver
        
        Args:
            output_dir: Directory to save frames
            max_frames: Maximum number of frames to save
        """
        import os
        self.output_dir = output_dir
        self.max_frames = max_frames
        self.frame_count = 0
        
        os.makedirs(output_dir, exist_ok=True)
        print(f"Frame saver initialized: {output_dir}/ (max {max_frames} frames)")
    
    def save_frame(self, data: bytes, width: int, height: int, extension: str = 'h264') -> bool:
        """
        Save a raw frame to disk
        
        Args:
            data: Raw frame data
            width: Frame width
            height: Frame height
            extension: File extension
            
        Returns:
            True if frame was saved, False if limit reached
        """
        if self.frame_count >= self.max_frames:
            return False
        
        filename = f'{self.output_dir}/frame_{self.frame_count:06d}_{width}x{height}.{extension}'
        
        try:
            with open(filename, 'wb') as f:
                f.write(data)
            
            self.frame_count += 1
            
            # Print milestones
            if self.frame_count in [1, 10, 50, 100]:
                print(f"Saved {self.frame_count} raw frames")
            
            return True
        except Exception as e:
            print(f"Error saving frame: {e}")
            return False
