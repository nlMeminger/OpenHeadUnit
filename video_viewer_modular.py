#!/usr/bin/env python3
"""
NiceGUI Video Viewer Application

A modern CarPlay/Android Auto viewer built with NiceGUI and modular components.
Features a clean web-based interface with real-time updates.

Requirements:
    pip install nicegui pillow numpy pyusb av pyaudio
"""

import sys
import os
import asyncio
import io
import base64
from typing import Optional
from PIL import Image
import numpy as np

# NiceGUI imports
from nicegui import ui, app

# Add uploads directory to path for dongle driver imports
sys.path.insert(0, '/mnt/user-data/uploads')

# Import modular components
from carplay_dongle.video_decoder import VideoDecoder, FrameSaver
from carplay_dongle.audio_handler import AudioHandler, AudioFormat
from carplay_dongle.touch_handler import TouchHandler, TouchAction
from carplay_dongle.device_finder import DeviceFinder
from carplay_dongle.stats_tracker import StatsTracker

# Import dongle driver components
from carplay_dongle.dongle_driver import DongleDriver, DEFAULT_CONFIG
from carplay_dongle.readable import VideoData, AudioData, Plugged, Unplugged, DECODE_TYPE_MAP
from carplay_dongle.sendable import SendTouch, SendAudio


class NiceGUIVideoViewer:
    """
    Modern video viewer application built with NiceGUI
    """
    
    def __init__(self, enable_frame_saver: bool = False):
        """
        Initialize the viewer
        
        Args:
            enable_frame_saver: Whether to save raw frames for debugging
        """
        # Initialize modular components
        self.decoder = VideoDecoder()
        self.stats = StatsTracker()
        self.device_finder = DeviceFinder()
        
        # Frame saver (optional)
        self.frame_saver = FrameSaver() if enable_frame_saver else None
        
        # Audio handler (initialized after driver is created)
        self.audio_handler = None
        
        # Touch handler
        self.touch_handler = TouchHandler(send_callback=self._send_touch_event)
        
        # Driver and connection state
        self.driver = None
        self.connected = False
        self.phone_type = None
        
        # Current frame data
        self.current_frame: Optional[Image.Image] = None
        self.current_frame_base64: Optional[str] = None
        
        # UI elements (will be set when page is created)
        self.video_image = None
        self.status_label = None
        self.stats_label = None
        self.info_label = None
        self.mic_button = None
        self.controls_visible = True
        
        # Track previous state for notifications
        self.prev_connected = False
        self.prev_phone_type = None
        self.driver_failed = False
    
    def _send_touch_event(self, x: float, y: float, action: TouchAction):
        """Send touch event to driver"""
        if not self.driver or not self.connected:
            return
        
        try:
            touch_msg = SendTouch(x, y, action)
            self.driver.send(touch_msg)
        except Exception as e:
            print(f"Error sending touch: {e}")
    
    def _send_audio_to_device(self, audio_data: np.ndarray):
        """Callback for audio handler to send mic data to device"""
        if self.driver and self.connected:
            try:
                self.driver.send(SendAudio(audio_data))
            except Exception as e:
                print(f"Error sending audio: {e}")
    
    def toggle_microphone(self):
        """Toggle microphone on/off"""
        if not self.audio_handler:
            ui.notify("Audio handler not initialized", type='warning')
            return
        
        if self.audio_handler.is_recording():
            self.audio_handler.stop_input()
            if self.mic_button:
                self.mic_button.props('label="🎤 Enable Mic" color=primary')
            if self.info_label:
                self.info_label.set_text("Microphone disabled")
            ui.notify("Microphone disabled", type='info')
        else:
            self.audio_handler.start_input()
            if self.mic_button:
                self.mic_button.props('label="🎤 Disable Mic" color=red')
            if self.info_label:
                self.info_label.set_text("Microphone enabled")
            ui.notify("Microphone enabled", type='positive')
    
    def on_message(self, message):
        """Handle messages from the dongle driver (called from background thread)"""
        try:
            if isinstance(message, VideoData):
                self.handle_video_frame(message)
            
            elif isinstance(message, AudioData):
                self.handle_audio_data(message)
            
            elif isinstance(message, Plugged):
                self.connected = True
                self.phone_type = message.phone_type.name
                print(f"Phone connected: {self.phone_type}")
            
            elif isinstance(message, Unplugged):
                self.connected = False
                self.phone_type = None
                print("Phone disconnected")
        
        except Exception as e:
            print(f"Error handling message: {e}")
            import traceback
            traceback.print_exc()
    
    def handle_video_frame(self, video_data: VideoData):
        """Handle incoming video frame"""
        try:
            # Save raw frame if enabled
            if self.frame_saver:
                self.frame_saver.save_frame(
                    video_data.data,
                    video_data.width,
                    video_data.height
                )
            
            # Decode frame
            decoded_frame = self.decoder.decode_frame(
                video_data.data,
                video_data.width,
                video_data.height
            )
            
            # Record stats
            self.stats.record_frame(
                decoded=decoded_frame is not None,
                resolution=(video_data.width, video_data.height),
                data_size=len(video_data.data)
            )
            
            # Display frame if decoded
            if decoded_frame is not None:
                self.current_frame = Image.fromarray(decoded_frame)
                self.update_video_display()
        
        except Exception as e:
            print(f"Error handling video frame: {e}")
    
    def handle_audio_data(self, audio_data: AudioData):
        """Handle incoming audio data"""
        try:
            # Start audio output if needed
            if audio_data.decode_type in DECODE_TYPE_MAP:
                audio_format_info = DECODE_TYPE_MAP[audio_data.decode_type]
                audio_format = AudioFormat(
                    audio_format_info.frequency,
                    audio_format_info.channel,
                    audio_format_info.bit_depth
                )
                
                if self.audio_handler:
                    self.audio_handler.start_output(audio_format)
                    
                    # Play audio data
                    if audio_data.data is not None:
                        self.audio_handler.play_audio(audio_data.data)
        
        except Exception as e:
            print(f"Error handling audio: {e}")
    
    def image_to_base64(self, image: Image.Image, max_width: int = 1920) -> str:
        """Convert PIL Image to base64 string for display"""
        # Resize if too large
        if image.width > max_width:
            ratio = max_width / image.width
            new_height = int(image.height * ratio)
            image = image.resize((max_width, new_height), Image.Resampling.LANCZOS)
        
        # Convert to base64
        buffered = io.BytesIO()
        image.save(buffered, format="JPEG", quality=85)
        img_str = base64.b64encode(buffered.getvalue()).decode()
        return f"data:image/jpeg;base64,{img_str}"
    
    def update_video_display(self):
        """Update the video display with current frame"""
        if self.current_frame and self.video_image:
            try:
                self.current_frame_base64 = self.image_to_base64(self.current_frame)
                self.video_image.set_source(self.current_frame_base64)
            except Exception as e:
                # Silently ignore errors (might happen during shutdown)
                pass
    
    def update_ui_state(self):
        """Update UI based on current state (safe to call from UI thread)"""
        try:
            # Check for driver failure
            if self.driver_failed:
                ui.notify("Driver connection failed", type='negative')
                self.driver_failed = False
            
            # Check for connection state changes
            if self.connected != self.prev_connected:
                if self.connected:
                    ui.notify(f"Phone connected: {self.phone_type}", type='positive')
                else:
                    ui.notify("Phone disconnected", type='warning')
                self.prev_connected = self.connected
                self.prev_phone_type = self.phone_type
            
            # Update status indicator
            if self.status_label:
                if self.connected:
                    self.status_label.set_text(f"● Connected ({self.phone_type})")
                    self.status_label.classes(remove='text-red-500', add='text-green-500')
                else:
                    self.status_label.set_text("● Not Connected")
                    self.status_label.classes(remove='text-green-500', add='text-red-500')
            
            # Update stats
            if self.stats_label:
                stats = self.stats.get_stats_dict()
                stats_text = (
                    f"Frames: {stats['total_frames']} | "
                    f"FPS: {stats['current_fps']:.1f} | "
                    f"Decode: {stats['decode_rate']:.1f}%"
                )
                if stats['current_resolution']:
                    w, h = stats['current_resolution']
                    stats_text += f" | {w}x{h}"
                
                self.stats_label.set_text(stats_text)
        except Exception as e:
            # Silently ignore UI update errors
            pass
    
    def handle_touch(self, e, action: str):
        """Handle touch/mouse events with proper coordinate calculation"""
        if not self.connected or not self.current_frame:
            return
        
        try:
            # Get bounding rectangle and mouse position from event args
            # NiceGUI passes args as a list, not a dict
            if not e.args or len(e.args) < 3:
                print(f"Invalid event args: {e.args}")
                return
                
            rect = e.args[0]
            client_x = e.args[1]
            client_y = e.args[2]
            
            if not rect or not isinstance(rect, dict):
                print(f"Invalid rect data: {rect}")
                return
            
            # For mouse move, check if button is pressed
            if action == 'move':
                buttons = e.args[3] if len(e.args) > 3 else 0
                if buttons != 1:  # Left button not pressed
                    return
            
            # Calculate position within image
            x = client_x - rect.get('left', 0)
            y = client_y - rect.get('top', 0)
            
            # Normalize to 0-1 range
            width = rect.get('width', 1)
            height = rect.get('height', 1)
            
            if width <= 0 or height <= 0:
                print(f"Invalid dimensions: {width}x{height}")
                return
            
            norm_x = max(0.0, min(1.0, x / width))
            norm_y = max(0.0, min(1.0, y / height))
            
            # Send touch event
            if action == 'down':
                print(f"Touch DOWN at ({norm_x:.3f}, {norm_y:.3f})")
                self._send_touch_event(norm_x, norm_y, TouchAction.Down)
                self.touch_handler.touch_active = True
            elif action == 'move':
                self._send_touch_event(norm_x, norm_y, TouchAction.Move)
            elif action == 'up':
                print(f"Touch UP at ({norm_x:.3f}, {norm_y:.3f})")
                self._send_touch_event(norm_x, norm_y, TouchAction.Up)
                self.touch_handler.touch_active = False
        except Exception as e:
            print(f"Error handling touch: {e}")
            import traceback
            traceback.print_exc()
    
    async def start_driver_async(self):
        """Start the dongle driver (async)"""
        print("Searching for USB dongle...")
        
        # Find device
        device = self.device_finder.find_device()
        
        if not device:
            print("No compatible USB dongle found!")
            ui.notify("No USB dongle found. Please connect and restart.", type='negative')
            if self.info_label:
                self.info_label.set_text("Error: No USB dongle found")
            return False
        
        print(f"Found device!")
        print(DeviceFinder.get_device_info_string(device))
        
        # Create driver
        self.driver = DongleDriver()
        
        # Create audio handler with callback
        self.audio_handler = AudioHandler(
            on_audio_data=self._send_audio_to_device
        )
        
        # Setup event handlers
        self.driver.on('message', self.on_message)
        self.driver.on('failure', self.on_failure)
        
        try:
            # Initialize and start driver
            print("Initializing driver...")
            self.driver.initialize(device)
            
            print("Starting driver...")
            self.driver.start(DEFAULT_CONFIG)
            
            print("Driver started successfully!")
            ui.notify("Driver started - waiting for phone connection", type='positive')
            if self.info_label:
                self.info_label.set_text("Waiting for phone connection...")
            return True
        
        except Exception as e:
            print(f"Error starting driver: {e}")
            import traceback
            traceback.print_exc()
            ui.notify(f"Error: {str(e)}", type='negative')
            if self.info_label:
                self.info_label.set_text(f"Error: {str(e)}")
            return False
    
    def on_failure(self):
        """Handle driver failure (called from background thread)"""
        print("Driver failed!")
        self.connected = False
        self.driver_failed = True
    
    def create_ui(self):
        """Create the NiceGUI interface"""
        
        # Custom CSS
        ui.add_head_html('''
            <style>
                .video-container {
                    width: 100%;
                    height: calc(100vh - 180px);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: #000;
                }
                .video-container img {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                    cursor: pointer;
                }
                .control-panel {
                    background: #1e1e1e;
                    border-bottom: 2px solid #333;
                }
                .info-panel {
                    background: #1e1e1e;
                    border-top: 2px solid #333;
                }
            </style>
        ''')
        
        # Top control panel
        with ui.header().classes('control-panel'):
            with ui.row().classes('w-full items-center justify-between px-4 py-2'):
                with ui.row().classes('items-center gap-4'):
                    self.status_label = ui.label('● Not Connected').classes(
                        'text-lg font-bold text-red-500'
                    )
                    self.stats_label = ui.label(
                        'Frames: 0 | FPS: 0 | Decode: 0%'
                    ).classes('text-sm text-gray-300')
                
                with ui.row().classes('items-center gap-2'):
                    ui.label('ESC: Fullscreen | H: Toggle UI').classes(
                        'text-xs text-gray-500'
                    )
                    self.mic_button = ui.button(
                        '🎤 Enable Mic',
                        on_click=self.toggle_microphone
                    ).props('color=primary size=sm')
        
        # Main video display area
        with ui.element('div').classes('video-container'):
            self.video_image = ui.image().props('fit=contain').classes('w-full h-full')
            
            # Prevent default drag/select behaviors using CSS
            self.video_image.style('user-select: none; -webkit-user-drag: none;')
            
            # Mouse events - pass getBoundingClientRect(), clientX, clientY, buttons
            # The .prevent suffix in NiceGUI events prevents default behavior
            self.video_image.on('mousedown.prevent', 
                lambda e: self.handle_touch(e, 'down'),
                ['event.target.getBoundingClientRect()', 'event.clientX', 'event.clientY'])
            self.video_image.on('mousemove',
                lambda e: self.handle_touch(e, 'move'),
                ['event.target.getBoundingClientRect()', 'event.clientX', 'event.clientY', 'event.buttons'])
            self.video_image.on('mouseup',
                lambda e: self.handle_touch(e, 'up'),
                ['event.target.getBoundingClientRect()', 'event.clientX', 'event.clientY'])
            
            # Touch events for mobile
            self.video_image.on('touchstart.prevent',
                lambda e: self.handle_touch(e, 'down'),
                ['event.target.getBoundingClientRect()', 'event.touches[0].clientX', 'event.touches[0].clientY'])
            self.video_image.on('touchmove.prevent',
                lambda e: self.handle_touch(e, 'move'),
                ['event.target.getBoundingClientRect()', 'event.touches[0].clientX', 'event.touches[0].clientY', '1'])
            self.video_image.on('touchend',
                lambda e: (setattr(self.touch_handler, 'touch_active', False), None)[1])
            
            # Placeholder
            with ui.element('div').classes('absolute inset-0 flex items-center justify-center'):
                ui.label('Waiting for connection...').classes(
                    'text-white text-2xl text-center'
                ).bind_visibility_from(self, 'current_frame', lambda f: f is None)
        
        # Bottom info panel
        with ui.footer().classes('info-panel'):
            with ui.row().classes('w-full items-center justify-center px-4 py-2'):
                self.info_label = ui.label('Ready to connect').classes(
                    'text-sm text-gray-400'
                )
        
        # Keyboard shortcuts
        ui.keyboard(on_key=self.handle_keyboard)
        
        # Start periodic UI updates
        ui.timer(0.1, self.update_ui_state)
    
    def handle_keyboard(self, e):
        """Handle keyboard shortcuts"""
        if e.key == 'Escape' or e.key == 'F11':
            ui.run_javascript('document.documentElement.requestFullscreen()')
        elif e.key.lower() == 'h':
            self.toggle_controls()
    
    def toggle_controls(self):
        """Toggle control visibility"""
        # Placeholder for future implementation
        pass
    
    def cleanup(self):
        """Cleanup resources on shutdown"""
        print("Cleaning up...")
        
        if self.audio_handler:
            self.audio_handler.close()
        
        if self.driver:
            self.driver.close()


# Global viewer instance
viewer = None


@ui.page('/')
def main_page():
    """Main page setup"""
    global viewer
    
    viewer = NiceGUIVideoViewer(
        enable_frame_saver='--save-frames' in sys.argv or '-s' in sys.argv
    )
    
    viewer.create_ui()
    
    # Start driver after UI is ready
    ui.timer(1.0, viewer.start_driver_async, once=True)


def main():
    """Main entry point"""
    print("=" * 60)
    print("NiceGUI CarPlay/Android Auto Video Viewer")
    print("=" * 60)
    print()
    
    # Check for command line options
    enable_frame_saver = '--save-frames' in sys.argv or '-s' in sys.argv
    
    if enable_frame_saver:
        print("Frame saving enabled - raw frames will be saved to raw_frames/")
    
    print("\nStarting web server...")
    print("Open your browser to: http://localhost:8080")
    print("\nKeyboard shortcuts:")
    print("  ESC or F11 : Toggle fullscreen mode")
    print("  H          : Toggle control panels")
    print()
    
    # Setup cleanup on shutdown
    app.on_shutdown(lambda: viewer.cleanup() if viewer else None)
    
    # Run the application
    ui.run(
        title='CarPlay/Android Auto Viewer',
        port=8080,
        reload=False,
        show=True,
        dark=True,
    )


if __name__ == '__main__':
    print("\nUsage: python video_viewer_nicegui.py [options]")
    print("Options:")
    print("  --save-frames, -s : Save raw frames for debugging")
    print()
    main()