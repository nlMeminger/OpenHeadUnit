#!/usr/bin/env python3
"""
Modular Video Viewer Application

A CarPlay/Android Auto viewer built using modular components:
- video_decoder: Video frame decoding
- audio_handler: Audio playback and recording
- touch_handler: Touch input management
- device_finder: USB device discovery
- stats_tracker: Performance and statistics tracking

This demonstrates how to use the modular components to build applications.
"""

import sys
import os
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk
import queue
import numpy as np

# Add uploads directory to path for dongle driver imports
sys.path.insert(0, '/mnt/user-data/uploads')

# Import modular components
from video_decoder import VideoDecoder, FrameSaver
from audio_handler import AudioHandler, AudioFormat
from touch_handler import TouchHandler, TouchAction
from device_finder import DeviceFinder
from stats_tracker import StatsTracker

# Import dongle driver components
from dongle_driver import DongleDriver, DEFAULT_CONFIG
from readable import VideoData, AudioData, Plugged, Unplugged, DECODE_TYPE_MAP
from sendable import SendTouch, SendAudio


class ModularVideoViewer:
    """
    Video viewer application built with modular components
    """
    
    def __init__(self, enable_frame_saver: bool = False, fullscreen: bool = True):
        """
        Initialize the viewer
        
        Args:
            enable_frame_saver: Whether to save raw frames for debugging
            fullscreen: Whether to start in fullscreen mode
        """
        # Create main window
        self.root = tk.Tk()
        self.root.title("CarPlay/Android Auto Viewer (Modular)")
        
        # Set fullscreen mode
        self.fullscreen = fullscreen
        if self.fullscreen:
            self.root.attributes('-fullscreen', True)
            # Bind Escape key to exit fullscreen
            self.root.bind('<Escape>', self.toggle_fullscreen)
            self.root.bind('<F11>', self.toggle_fullscreen)
        else:
            self.root.geometry("1200x900")
        
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
        
        # UI components
        self.frame_queue = queue.Queue(maxsize=5)
        self.show_controls = True
        self.setup_ui()
        
        # Start UI update loop
        self.update_display()
    
    def toggle_fullscreen(self, event=None):
        """Toggle fullscreen mode"""
        self.fullscreen = not self.fullscreen
        self.root.attributes('-fullscreen', self.fullscreen)
        return "break"  # Prevent event propagation
    
    def toggle_controls(self, event=None):
        """Toggle visibility of control panels (press 'h' to hide/show)"""
        self.show_controls = not self.show_controls
        
        if self.show_controls:
            self.control_frame.pack(fill=tk.X, before=self.separator)
            self.separator.pack(fill=tk.X, pady=5, before=self.video_frame)
            self.info_frame.pack(fill=tk.X)
        else:
            self.control_frame.pack_forget()
            self.separator.pack_forget()
            self.info_frame.pack_forget()
    
    def setup_ui(self):
        """Setup the user interface"""
        # Top control bar
        self.control_frame = ttk.Frame(self.root, padding="10")
        self.control_frame.pack(fill=tk.X)
        
        # Status indicator
        self.status_label = ttk.Label(
            self.control_frame,
            text="● Not Connected",
            font=("Arial", 11, "bold"),
            foreground="red"
        )
        self.status_label.pack(side=tk.LEFT, padx=5)
        
        # Stats display
        self.stats_label = ttk.Label(
            self.control_frame,
            text="Frames: 0 | FPS: 0 | Decode: 0%",
            font=("Arial", 10)
        )
        self.stats_label.pack(side=tk.LEFT, padx=20)
        
        # Microphone toggle button
        self.mic_button = ttk.Button(
            self.control_frame,
            text="🎤 Enable Mic",
            command=self.toggle_microphone
        )
        self.mic_button.pack(side=tk.RIGHT, padx=5)
        
        # Help text
        help_label = ttk.Label(
            self.control_frame,
            text="ESC/F11: Fullscreen | H: Toggle Controls",
            font=("Arial", 9),
            foreground="gray"
        )
        help_label.pack(side=tk.RIGHT, padx=20)
        
        # Separator
        self.separator = ttk.Separator(self.root, orient=tk.HORIZONTAL)
        self.separator.pack(fill=tk.X, pady=5)
        
        # Video display area (takes all available space)
        self.video_frame = ttk.Frame(self.root)
        self.video_frame.pack(fill=tk.BOTH, expand=True, padx=0, pady=0)
        
        # Canvas for video (maximized - no padding)
        self.canvas = tk.Canvas(
            self.video_frame,
            bg="black",
            highlightthickness=0
        )
        self.canvas.pack(fill=tk.BOTH, expand=True)
        
        # Placeholder text
        self.placeholder_label = ttk.Label(
            self.video_frame,
            text="Waiting for connection...\n\nConnect your phone via USB\n\n(Press ESC or F11 to exit fullscreen)",
            font=("Arial", 14),
            foreground="white",
            background="black"
        )
        self.placeholder_label.place(relx=0.5, rely=0.5, anchor=tk.CENTER)
        
        # Bind touch events
        self.canvas.bind("<Button-1>", self._on_mouse_down)
        self.canvas.bind("<B1-Motion>", self._on_mouse_move)
        self.canvas.bind("<ButtonRelease-1>", self._on_mouse_up)
        
        # Bind keyboard shortcuts
        self.root.bind('<h>', self.toggle_controls)
        self.root.bind('<H>', self.toggle_controls)
        
        # Bottom info bar
        self.info_frame = ttk.Frame(self.root, padding="5")
        self.info_frame.pack(fill=tk.X)
        
        self.info_label = ttk.Label(
            self.info_frame,
            text="Ready to connect",
            font=("Arial", 9),
            foreground="gray"
        )
        self.info_label.pack()
    
    def _send_touch_event(self, x: float, y: float, action: TouchAction):
        """Send touch event to driver"""
        if not self.driver or not self.connected:
            return
        
        try:
            touch_msg = SendTouch(x, y, action)
            self.driver.send(touch_msg)
        except Exception as e:
            print(f"Error sending touch: {e}")
    
    def _on_mouse_down(self, event):
        """Handle mouse down (touch down)"""
        self.touch_handler.handle_down(event.x, event.y)
    
    def _on_mouse_move(self, event):
        """Handle mouse move (touch move)"""
        self.touch_handler.handle_move(event.x, event.y)
    
    def _on_mouse_up(self, event):
        """Handle mouse up (touch up)"""
        self.touch_handler.handle_up(event.x, event.y)
    
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
            print("Audio handler not initialized")
            return
        
        if self.audio_handler.is_recording():
            self.audio_handler.stop_input()
            self.mic_button.config(text="🎤 Enable Mic")
            self.info_label.config(text="Microphone disabled")
        else:
            self.audio_handler.start_input()
            self.mic_button.config(text="🎤 Disable Mic")
            self.info_label.config(text="Microphone enabled")
    
    def on_message(self, message):
        """Handle messages from the dongle driver"""
        try:
            if isinstance(message, VideoData):
                self.handle_video_frame(message)
            
            elif isinstance(message, AudioData):
                self.handle_audio_data(message)
            
            elif isinstance(message, Plugged):
                self.connected = True
                self.phone_type = message.phone_type.name
                print(f"Phone connected: {self.phone_type}")
                self.root.after(0, self.update_ui_state)
            
            elif isinstance(message, Unplugged):
                self.connected = False
                self.phone_type = None
                print("Phone disconnected")
                self.root.after(0, self.update_ui_state)
            
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
                image = Image.fromarray(decoded_frame)
                try:
                    self.frame_queue.put_nowait(image)
                except queue.Full:
                    pass  # Drop frame if queue is full
            
            # Update UI (throttled)
            if self.stats.total_frames % 10 == 0:
                self.root.after(0, self.update_ui_state)
        
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
    
    def update_ui_state(self):
        """Update UI based on current state"""
        # Update status indicator
        if self.connected:
            self.status_label.config(
                text=f"● Connected ({self.phone_type})",
                foreground="green"
            )
            self.placeholder_label.place_forget()
        else:
            self.status_label.config(
                text="● Not Connected",
                foreground="red"
            )
        
        # Update stats
        stats = self.stats.get_stats_dict()
        stats_text = (
            f"Frames: {stats['total_frames']} | "
            f"FPS: {stats['current_fps']:.1f} | "
            f"Decode: {stats['decode_rate']:.1f}%"
        )
        if stats['current_resolution']:
            w, h = stats['current_resolution']
            stats_text += f" | {w}x{h}"
        
        self.stats_label.config(text=stats_text)
    
    def update_display(self):
        """Update video display (called periodically)"""
        try:
            # Try to get a frame from queue
            try:
                image = self.frame_queue.get_nowait()
                
                # Get canvas dimensions
                canvas_width = self.canvas.winfo_width()
                canvas_height = self.canvas.winfo_height()
                
                if canvas_width > 1 and canvas_height > 1:
                    # Calculate scaling to maximize display while maintaining aspect ratio
                    scale_w = canvas_width / image.width
                    scale_h = canvas_height / image.height
                    scale = min(scale_w, scale_h)
                    
                    new_width = int(image.width * scale)
                    new_height = int(image.height * scale)
                    
                    # Resize and display
                    resized_image = image.resize(
                        (new_width, new_height),
                        Image.Resampling.LANCZOS
                    )
                    photo = ImageTk.PhotoImage(resized_image)
                    
                    self.canvas.delete("all")
                    # Center the image
                    x = (canvas_width - new_width) // 2
                    y = (canvas_height - new_height) // 2
                    self.canvas.create_image(x, y, anchor=tk.NW, image=photo)
                    self.canvas.image = photo  # Keep reference
                    
                    # Update touch handler with display info
                    self.touch_handler.set_display_info(
                        video_size=(image.width, image.height),
                        display_size=(new_width, new_height),
                        display_offset=(x, y)
                    )
            
            except queue.Empty:
                pass
        
        except Exception as e:
            print(f"Error updating display: {e}")
        
        # Schedule next update
        self.root.after(33, self.update_display)  # ~30 FPS
    
    def start_driver(self):
        """Start the dongle driver"""
        print("Searching for USB dongle...")
        
        # Find device
        device = self.device_finder.find_device()
        
        if not device:
            print("No compatible USB dongle found!")
            self.info_label.config(
                text="Error: No USB dongle found. Please connect and restart."
            )
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
            self.info_label.config(text="Waiting for phone connection...")
            return True
        
        except Exception as e:
            print(f"Error starting driver: {e}")
            import traceback
            traceback.print_exc()
            self.info_label.config(text=f"Error: {str(e)}")
            return False
    
    def on_failure(self):
        """Handle driver failure"""
        print("Driver failed!")
        self.connected = False
        self.root.after(0, self.update_ui_state)
    
    def on_closing(self):
        """Handle window close"""
        print("Closing application...")
        
        if self.audio_handler:
            self.audio_handler.close()
        
        if self.driver:
            self.driver.close()
        
        self.root.destroy()
    
    def run(self):
        """Run the application"""
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        self.root.after(500, self.start_driver)
        self.root.mainloop()


def main():
    """Main entry point"""
    print("=" * 60)
    print("Modular CarPlay/Android Auto Video Viewer")
    print("=" * 60)
    print()
    
    # Check for command line options
    enable_frame_saver = '--save-frames' in sys.argv or '-s' in sys.argv
    windowed = '--windowed' in sys.argv or '-w' in sys.argv
    
    if enable_frame_saver:
        print("Frame saving enabled - raw frames will be saved to raw_frames/")
        print()
    
    if windowed:
        print("Starting in windowed mode")
        fullscreen = False
    else:
        print("Starting in fullscreen mode")
        print("Press ESC or F11 to toggle fullscreen")
        print("Press H to hide/show controls")
        fullscreen = True
    
    print()
    
    # Create and run application
    app = ModularVideoViewer(
        enable_frame_saver=enable_frame_saver,
        fullscreen=fullscreen
    )
    app.run()


if __name__ == '__main__':
    print("\nUsage: python video_viewer_modular.py [options]")
    print("Options:")
    print("  --save-frames, -s : Save raw frames for debugging")
    print("  --windowed, -w    : Start in windowed mode (default: fullscreen)")
    print("\nKeyboard shortcuts:")
    print("  ESC or F11        : Toggle fullscreen mode")
    print("  H                 : Hide/show control panels")
    print()
    main()