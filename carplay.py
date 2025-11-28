# Import modular components (will work if files are present)
from carplay_dongle.video_decoder import VideoDecoder
from carplay_dongle.audio_handler import AudioHandler, AudioFormat
from carplay_dongle.touch_handler import TouchHandler, TouchAction
from carplay_dongle.device_finder import DeviceFinder
from carplay_dongle.stats_tracker import StatsTracker
from carplay_dongle.dongle_driver import DongleDriver, DEFAULT_CONFIG
from carplay_dongle.readable import VideoData, AudioData, Plugged, Unplugged, DECODE_TYPE_MAP
from carplay_dongle.sendable import SendTouch, SendAudio

import tkinter as tk
from tkinter import ttk
from datetime import datetime
import random
import sys
import queue
from PIL import Image, ImageTk
import numpy as np

class CarPlayViewer:
    """CarPlay video viewer component"""
    
    def __init__(self, parent, on_exit):
        """
        Initialize CarPlay viewer
        
        Args:
            parent: Parent tkinter window
            on_exit: Callback function when exiting CarPlay
        """
        self.parent = parent
        self.on_exit = on_exit
        
        # Create fullscreen frame
        self.frame = tk.Frame(parent, bg='black')
        
        # Initialize modular components
        self.decoder = VideoDecoder()
        self.stats = StatsTracker()
        self.device_finder = DeviceFinder()
        
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
        self.setup_ui()
        
        # Start UI update loop
        self.update_display()
    
    def setup_ui(self):
        """Setup the CarPlay viewer UI"""
        # Exit button (top-left corner)
        exit_btn = tk.Button(
            self.frame,
            text="◀ Back",
            font=("Arial", 14, "bold"),
            fg='white',
            relief=tk.FLAT,
            cursor="hand2",
            command=self.exit_carplay,
            padx=20,
            pady=10
        )
        exit_btn.place(x=10, y=10)
        
        # Video canvas
        self.canvas = tk.Canvas(
            self.frame,
            bg="black",
            highlightthickness=0
        )
        self.canvas.pack(fill=tk.BOTH, expand=True)
        
        # Status label
        self.status_label = tk.Label(
            self.frame,
            text="Initializing CarPlay...",
            font=("Arial", 16, "bold"),
            bg="black",
            fg="white"
        )
        self.status_label.place(relx=0.5, rely=0.5, anchor=tk.CENTER)
        
        # Bind touch events
        self.canvas.bind("<Button-1>", self._on_mouse_down)
        self.canvas.bind("<B1-Motion>", self._on_mouse_move)
        self.canvas.bind("<ButtonRelease-1>", self._on_mouse_up)
    
    def show(self):
        """Show the CarPlay viewer"""
        self.frame.pack(fill=tk.BOTH, expand=True)
        self.start_driver()
    
    def hide(self):
        """Hide the CarPlay viewer"""
        self.frame.pack_forget()
    
    def exit_carplay(self):
        """Exit CarPlay and return to main menu"""
        self.cleanup()
        self.hide()
        self.on_exit()
    
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
                self.parent.after(0, self.update_ui_state)
            
            elif isinstance(message, Unplugged):
                self.connected = False
                self.phone_type = None
                print("Phone disconnected")
                self.parent.after(0, self.update_ui_state)
        
        except Exception as e:
            print(f"Error handling message: {e}")
    
    def handle_video_frame(self, video_data: VideoData):
        """Handle incoming video frame"""
        try:
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
        if self.connected:
            self.status_label.config(text=f"Connected: {self.phone_type}")
            # Hide status label after connection
            self.parent.after(2000, lambda: self.status_label.place_forget())
        else:
            self.status_label.config(text="Waiting for phone connection...")
            self.status_label.place(relx=0.5, rely=0.5, anchor=tk.CENTER)
    
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
                    
                    new_width = canvas_width
                    new_height = canvas_height

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
        if self.frame.winfo_exists():
            self.parent.after(33, self.update_display)  # ~30 FPS
    
    def start_driver(self):
        """Start the dongle driver"""
        print("Searching for USB dongle...")
        
        # Find device
        device = self.device_finder.find_device()
        
        if not device:
            print("No compatible USB dongle found!")
            self.status_label.config(
                text="Error: No USB dongle found\nPlease connect and try again"
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
            self.status_label.config(text="Waiting for phone connection...")
            return True
        
        except Exception as e:
            print(f"Error starting driver: {e}")
            import traceback
            traceback.print_exc()
            self.status_label.config(text=f"Error: {str(e)}")
            return False
    
    def on_failure(self):
        """Handle driver failure"""
        print("Driver failed!")
        self.connected = False
        self.parent.after(0, self.update_ui_state)
    
    def cleanup(self):
        """Cleanup resources"""
        print("Cleaning up CarPlay viewer...")
        
        if self.audio_handler:
            self.audio_handler.close()
        
        if self.driver:
            self.driver.close()
