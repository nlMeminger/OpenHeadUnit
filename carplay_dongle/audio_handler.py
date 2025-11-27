"""
Audio Handler Module

Provides audio playback and recording capabilities for CarPlay/Android Auto.
Handles multiple audio formats and manages PyAudio streams.
"""

import numpy as np
import threading
from typing import Optional, Callable
from enum import IntEnum


class AudioFormat:
    """Audio format specification"""
    
    def __init__(self, frequency: int, channel: int, bit_depth: int):
        self.frequency = frequency
        self.channel = channel
        self.bit_depth = bit_depth
    
    def __eq__(self, other):
        if not isinstance(other, AudioFormat):
            return False
        return (self.frequency == other.frequency and 
                self.channel == other.channel and 
                self.bit_depth == other.bit_depth)
    
    def __str__(self):
        return f"{self.frequency}Hz, {self.channel}ch, {self.bit_depth}bit"


class AudioHandler:
    """
    Handle audio playback and recording
    
    Supports:
    - Audio output (playback from device)
    - Audio input (microphone to device)
    - Multiple audio formats
    - Automatic stream management
    """
    
    def __init__(self, on_audio_data: Optional[Callable[[np.ndarray], None]] = None):
        """
        Initialize audio handler
        
        Args:
            on_audio_data: Callback function for microphone data
                          Called with numpy array of audio samples
        """
        try:
            import pyaudio
            self.pyaudio = pyaudio.PyAudio()
            self.pyaudio_available = True
            print("✓ PyAudio initialized")
        except ImportError:
            print("✗ PyAudio not available (pip install pyaudio)")
            self.pyaudio = None
            self.pyaudio_available = False
            return
        
        self.on_audio_data = on_audio_data
        
        # Output (playback)
        self.output_stream = None
        self.current_output_format = None
        
        # Input (microphone)
        self.input_stream = None
        self.recording = False
        self.mic_thread = None
        self.mic_sample_count = 0
        
        # Default input format (16kHz mono for voice)
        self.input_format = AudioFormat(16000, 1, 16)
    
    def list_devices(self):
        """List all available audio devices"""
        if not self.pyaudio_available:
            print("PyAudio not available")
            return
        
        device_count = self.pyaudio.get_device_count()
        print(f"\n{'='*60}")
        print(f"Found {device_count} audio devices:")
        print(f"{'='*60}")
        
        for i in range(device_count):
            info = self.pyaudio.get_device_info_by_index(i)
            print(f"\nDevice {i}: {info['name']}")
            print(f"  Max Input Channels: {info['maxInputChannels']}")
            print(f"  Max Output Channels: {info['maxOutputChannels']}")
            print(f"  Default Sample Rate: {info['defaultSampleRate']}")
        
        print()
        
        try:
            default_input = self.pyaudio.get_default_input_device_info()
            print(f"Default INPUT: [{default_input['index']}] {default_input['name']}")
        except:
            print("No default input device")
        
        try:
            default_output = self.pyaudio.get_default_output_device_info()
            print(f"Default OUTPUT: [{default_output['index']}] {default_output['name']}")
        except:
            print("No default output device")
        
        print(f"{'='*60}\n")
    
    def start_output(self, audio_format: AudioFormat):
        """
        Start audio output stream
        
        Args:
            audio_format: Audio format specification
        """
        if not self.pyaudio_available:
            return
        
        # Don't restart if already using same format
        if self.output_stream and self.current_output_format == audio_format:
            return
        
        self.stop_output()
        
        try:
            import pyaudio
            self.current_output_format = audio_format
            self.output_stream = self.pyaudio.open(
                format=pyaudio.paInt16,
                channels=audio_format.channel,
                rate=audio_format.frequency,
                output=True,
                frames_per_buffer=1024
            )
            print(f"✓ Audio output started: {audio_format}")
        except Exception as e:
            print(f"✗ Error starting audio output: {e}")
            self.output_stream = None
            self.current_output_format = None
    
    def stop_output(self):
        """Stop audio output stream"""
        if self.output_stream:
            try:
                self.output_stream.stop_stream()
                self.output_stream.close()
                print("Audio output stopped")
            except:
                pass
            self.output_stream = None
            self.current_output_format = None
    
    def play_audio(self, audio_data: np.ndarray):
        """
        Play audio data
        
        Args:
            audio_data: Audio samples as numpy array (int16)
        """
        if not self.output_stream:
            return
        
        try:
            audio_bytes = audio_data.tobytes()
            self.output_stream.write(audio_bytes)
        except Exception as e:
            print(f"Error playing audio: {e}")
    
    def start_input(self, audio_format: Optional[AudioFormat] = None):
        """
        Start audio input (microphone) stream
        
        Args:
            audio_format: Audio format for input (defaults to 16kHz mono)
        """
        if not self.pyaudio_available:
            print("PyAudio not available")
            return
        
        if self.recording:
            print("Microphone already recording")
            return
        
        if audio_format:
            self.input_format = audio_format
        
        try:
            import pyaudio
            
            print(f"Starting microphone: {self.input_format}")
            
            # List devices for debugging
            try:
                default_input = self.pyaudio.get_default_input_device_info()
                print(f"Using: {default_input['name']}")
            except:
                print("Warning: No default input device found")
            
            self.input_stream = self.pyaudio.open(
                format=pyaudio.paInt16,
                channels=self.input_format.channel,
                rate=self.input_format.frequency,
                input=True,
                frames_per_buffer=1024
            )
            
            self.recording = True
            self.mic_sample_count = 0
            self.mic_thread = threading.Thread(target=self._mic_loop, daemon=True)
            self.mic_thread.start()
            
            print(f"✓ Microphone started: {self.input_format}")
            
        except Exception as e:
            print(f"✗ Error starting microphone: {e}")
            import traceback
            traceback.print_exc()
    
    def stop_input(self):
        """Stop audio input stream"""
        if not self.recording:
            return
        
        self.recording = False
        
        if self.mic_thread:
            self.mic_thread.join(timeout=2)
            self.mic_thread = None
        
        if self.input_stream:
            try:
                self.input_stream.stop_stream()
                self.input_stream.close()
                print("Microphone stopped")
            except:
                pass
            self.input_stream = None
    
    def _mic_loop(self):
        """Microphone recording loop (runs in separate thread)"""
        print("Microphone recording loop started")
        
        while self.recording and self.input_stream:
            try:
                # Read audio data from microphone
                data = self.input_stream.read(1024, exception_on_overflow=False)
                
                # Convert to numpy array
                audio_array = np.frombuffer(data, dtype=np.int16)
                
                self.mic_sample_count += 1
                
                # Log periodically
                if self.mic_sample_count % 50 == 0:
                    print(f"Mic: {self.mic_sample_count} samples captured")
                
                # Send to callback
                if self.on_audio_data:
                    self.on_audio_data(audio_array)
                
            except Exception as e:
                if self.recording:  # Only print if still supposed to be recording
                    print(f"Error in mic loop: {e}")
                    import traceback
                    traceback.print_exc()
                break
        
        print("Microphone recording loop ended")
    
    def is_recording(self) -> bool:
        """Check if microphone is currently recording"""
        return self.recording
    
    def is_playing(self) -> bool:
        """Check if audio output is active"""
        return self.output_stream is not None
    
    def close(self):
        """Clean up audio resources"""
        self.stop_output()
        self.stop_input()
        
        if self.pyaudio_available and self.pyaudio:
            self.pyaudio.terminate()
            print("PyAudio terminated")
