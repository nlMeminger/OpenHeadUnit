#!/usr/bin/env python3
"""
Car Radio UI with CarPlay Integration
A modern car interface with integrated CarPlay/Android Auto support
"""
import tkinter as tk
from tkinter import ttk
from datetime import datetime
import random
import sys
import queue
from PIL import Image, ImageTk
import numpy as np

# Add uploads directory to path for dongle driver imports
sys.path.insert(0, '/mnt/user-data/uploads')

# Import modular components (will work if files are present)
try:
    from video_decoder import VideoDecoder
    from audio_handler import AudioHandler, AudioFormat
    from touch_handler import TouchHandler, TouchAction
    from device_finder import DeviceFinder
    from stats_tracker import StatsTracker
    from dongle_driver import DongleDriver, DEFAULT_CONFIG
    from readable import VideoData, AudioData, Plugged, Unplugged, DECODE_TYPE_MAP
    from sendable import SendTouch, SendAudio
    CARPLAY_AVAILABLE = True
except ImportError as e:
    print(f"Warning: CarPlay modules not available: {e}")
    CARPLAY_AVAILABLE = False


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
            bg='#1e293b',
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


class CarRadioUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Car Radio Interface")
        self.root.geometry("800x480")
        self.root.configure(bg='#020617')
        
        # Remove window decorations for embedded display
        # Uncomment for fullscreen/frameless mode:
        # self.root.attributes('-fullscreen', True)
        # self.root.overrideredirect(True)
        
        # Color scheme
        self.colors = {
            'bg_main': '#020617',
            'bg_secondary': '#1e293b',
            'bg_tile': '#334155',
            'text_primary': '#f8fafc',
            'text_secondary': '#cbd5e1',
            'accent_blue': '#3b82f6',
            'accent_purple': '#a855f7',
            'accent_green': '#22c55e',
            'accent_orange': '#fb923c',
            'accent_red': '#ef4444',
            'accent_yellow': '#fbbf24'
        }
        
        # State variables
        self.brightness = 80
        self.volume = 50
        self.brightness_popup = None
        self.carplay_viewer = None
        self.main_ui_visible = True
        
        # Build the interface
        self.main_frame = tk.Frame(self.root, bg=self.colors['bg_main'])
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        
        self.create_top_bar()
        self.create_main_content()
        self.create_bottom_bar()
        
        # Start time update
        self.update_time()
        
    def create_top_bar(self):
        """Create the top status bar"""
        top_frame = tk.Frame(self.main_frame, bg=self.colors['bg_secondary'], height=45)
        top_frame.pack(fill=tk.X, padx=0, pady=0)
        top_frame.pack_propagate(False)
        
        # Left side - Time and Temperature
        left_frame = tk.Frame(top_frame, bg=self.colors['bg_secondary'])
        left_frame.pack(side=tk.LEFT, padx=20, pady=5)
        
        self.time_label = tk.Label(
            left_frame, 
            text="12:34 PM", 
            font=("Arial", 16, "bold"),
            bg=self.colors['bg_secondary'],
            fg=self.colors['text_primary']
        )
        self.time_label.pack(side=tk.LEFT, padx=10)
        
        temp_frame = tk.Frame(left_frame, bg='#2d3748', bd=0)
        temp_frame.pack(side=tk.LEFT, padx=5)
        
        self.temp_label = tk.Label(
            temp_frame,
            text="🌡️ 72°F",
            font=("Arial", 11, "bold"),
            bg='#2d3748',
            fg=self.colors['accent_blue'],
            padx=10,
            pady=5
        )
        self.temp_label.pack()
        
    def create_main_content(self):
        """Create the main grid of application tiles"""
        content_frame = tk.Frame(self.main_frame, bg=self.colors['bg_main'])
        content_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        
        # Configure grid weights for equal sizing
        for i in range(2):
            content_frame.grid_rowconfigure(i, weight=1)
        for i in range(3):
            content_frame.grid_columnconfigure(i, weight=1)
        
        # App tiles configuration
        apps = [
            ("🎵", "Music", self.colors['accent_purple'], 0, 0),
            ("📞", "Phone", self.colors['accent_green'], 0, 1),
            ("🎧", "CarPlay", self.colors['accent_blue'], 0, 2),
            ("📹", "Rear Camera", self.colors['accent_orange'], 1, 0),
            ("🏎️", "Dashboard", self.colors['accent_red'], 1, 1),
            ("⚙️", "Settings", '#64748b', 1, 2),
        ]
        
        for icon, title, color, row, col in apps:
            self.create_tile(content_frame, icon, title, color, row, col)
    
    def create_tile(self, parent, icon, title, accent_color, row, col):
        """Create an application tile button"""
        # Create frame for tile
        tile_frame = tk.Frame(
            parent,
            bg=self.colors['bg_tile'],
            highlightbackground=accent_color,
            highlightthickness=1,
            cursor="hand2"
        )
        tile_frame.grid(row=row, column=col, padx=7, pady=7, sticky="nsew")
        
        # Icon
        icon_label = tk.Label(
            tile_frame,
            text=icon,
            font=("Arial", 48),
            bg=self.colors['bg_tile'],
            fg=self.colors['text_primary']
        )
        icon_label.pack(expand=True, pady=(20, 5))
        
        # Title
        title_label = tk.Label(
            tile_frame,
            text=title,
            font=("Arial", 14, "bold"),
            bg=self.colors['bg_tile'],
            fg=self.colors['text_primary']
        )
        title_label.pack(expand=True, pady=(0, 20))
        
        # Bind click events
        for widget in [tile_frame, icon_label, title_label]:
            widget.bind("<Button-1>", lambda e, t=title: self.open_app(t))
            widget.bind("<Enter>", lambda e, f=tile_frame, c=accent_color: self.tile_hover(f, c, True))
            widget.bind("<Leave>", lambda e, f=tile_frame: self.tile_hover(f, None, False))
    
    def tile_hover(self, frame, color, hover):
        """Handle tile hover effects"""
        if hover:
            frame.configure(highlightthickness=2)
        else:
            frame.configure(highlightthickness=1)
    
    def create_bottom_bar(self):
        """Create the bottom control bar"""
        bottom_frame = tk.Frame(self.main_frame, bg=self.colors['bg_secondary'], height=55)
        bottom_frame.pack(fill=tk.X, padx=0, pady=0)
        bottom_frame.pack_propagate(False)
        
        # Left side - Brightness button
        left_frame = tk.Frame(bottom_frame, bg=self.colors['bg_secondary'])
        left_frame.pack(side=tk.LEFT, padx=20, pady=7)
        
        brightness_btn = tk.Button(
            left_frame,
            text="☀️",
            font=("Arial", 16),
            bg=self.colors['bg_tile'],
            fg=self.colors['text_primary'],
            relief=tk.FLAT,
            cursor="hand2",
            width=3,
            height=1,
            command=self.toggle_brightness
        )
        brightness_btn.pack()
        
        # Center - Volume control
        center_frame = tk.Frame(bottom_frame, bg='#2d3748')
        center_frame.pack(side=tk.LEFT, expand=True, padx=20, pady=7)
        
        volume_label = tk.Label(
            center_frame,
            text="🔊",
            font=("Arial", 14),
            bg='#2d3748',
            fg=self.colors['text_primary']
        )
        volume_label.pack(side=tk.LEFT, padx=(10, 5))
        
        self.volume_slider = ttk.Scale(
            center_frame,
            from_=0,
            to=100,
            orient=tk.HORIZONTAL,
            length=200,
            command=self.update_volume
        )
        self.volume_slider.set(self.volume)
        self.volume_slider.pack(side=tk.LEFT, padx=5)
        
        self.volume_value = tk.Label(
            center_frame,
            text=str(self.volume),
            font=("Arial", 11, "bold"),
            bg='#2d3748',
            fg=self.colors['accent_blue'],
            width=3
        )
        self.volume_value.pack(side=tk.LEFT, padx=(5, 10))
        
        # Right side - Settings and Power
        right_frame = tk.Frame(bottom_frame, bg=self.colors['bg_secondary'])
        right_frame.pack(side=tk.RIGHT, padx=20, pady=7)
        
        settings_btn = tk.Button(
            right_frame,
            text="⚙️",
            font=("Arial", 16),
            bg=self.colors['bg_tile'],
            fg=self.colors['text_primary'],
            relief=tk.FLAT,
            cursor="hand2",
            width=3,
            height=1,
            command=lambda: self.open_app("Settings")
        )
        settings_btn.pack(side=tk.LEFT, padx=5)
        
        power_btn = tk.Button(
            right_frame,
            text="⏻",
            font=("Arial", 16),
            bg=self.colors['bg_tile'],
            fg=self.colors['text_primary'],
            relief=tk.FLAT,
            cursor="hand2",
            width=3,
            height=1,
            command=self.show_power_dialog
        )
        power_btn.pack(side=tk.LEFT, padx=5)
    
    def update_time(self):
        """Update the time display"""
        now = datetime.now()
        time_str = now.strftime("%I:%M %p")
        self.time_label.config(text=time_str)
        
        # Update temperature occasionally
        if now.second == 0:
            temps = [68, 70, 72, 74, 76]
            temp = random.choice(temps)
            self.temp_label.config(text=f"🌡️ {temp}°F")
        
        # Schedule next update
        self.root.after(1000, self.update_time)
    
    def update_volume(self, value):
        """Handle volume slider changes"""
        volume = int(float(value))
        self.volume = volume
        self.volume_value.config(text=str(volume))
        print(f"[Python] Setting volume to {volume}")
        # Add actual volume control here (e.g., ALSA commands)
    
    def toggle_brightness(self):
        """Toggle brightness control popup"""
        if self.brightness_popup and self.brightness_popup.winfo_exists():
            self.brightness_popup.destroy()
            self.brightness_popup = None
        else:
            self.show_brightness_popup()
    
    def show_brightness_popup(self):
        """Show brightness adjustment popup"""
        # Create popup window
        self.brightness_popup = tk.Toplevel(self.root)
        self.brightness_popup.title("")
        self.brightness_popup.geometry("300x80+250+320")
        self.brightness_popup.configure(bg=self.colors['bg_secondary'])
        self.brightness_popup.overrideredirect(True)
        
        # Content frame
        content = tk.Frame(self.brightness_popup, bg=self.colors['bg_secondary'])
        content.pack(fill=tk.BOTH, expand=True, padx=20, pady=15)
        
        # Icon
        icon_label = tk.Label(
            content,
            text="☀️",
            font=("Arial", 16),
            bg=self.colors['bg_secondary'],
            fg=self.colors['text_primary']
        )
        icon_label.pack(side=tk.LEFT, padx=5)
        
        # Slider
        brightness_slider = ttk.Scale(
            content,
            from_=20,
            to=100,
            orient=tk.HORIZONTAL,
            length=180,
            command=self.update_brightness
        )
        brightness_slider.set(self.brightness)
        brightness_slider.pack(side=tk.LEFT, padx=10)
        
        # Value label
        self.brightness_value = tk.Label(
            content,
            text=f"{self.brightness}%",
            font=("Arial", 11, "bold"),
            bg=self.colors['bg_secondary'],
            fg=self.colors['accent_yellow'],
            width=4
        )
        self.brightness_value.pack(side=tk.LEFT, padx=5)
        
        # Auto-close after 5 seconds
        self.brightness_popup.after(5000, self.close_brightness_popup)
    
    def update_brightness(self, value):
        """Handle brightness changes"""
        brightness = int(float(value))
        self.brightness = brightness
        if hasattr(self, 'brightness_value'):
            self.brightness_value.config(text=f"{brightness}%")
        
        print(f"[Python] Setting brightness to {brightness}%")
        # Add actual brightness control here
    
    def close_brightness_popup(self):
        """Close the brightness popup"""
        if self.brightness_popup and self.brightness_popup.winfo_exists():
            self.brightness_popup.destroy()
            self.brightness_popup = None
    
    def open_app(self, app_name):
        """Handle app opening"""
        print(f"[Python] Opening {app_name}!")
        
        # Handle CarPlay specially
        if app_name == "CarPlay":
            self.launch_carplay()
        elif app_name == "Music":
            self.launch_music_player()
        elif app_name == "Phone":
            self.launch_phone_app()
        elif app_name == "Rear Camera":
            self.launch_camera()
        elif app_name == "Dashboard":
            self.show_dashboard()
        elif app_name == "Settings":
            self.open_settings()
    
    def launch_carplay(self):
        """Launch CarPlay viewer"""
        if not CARPLAY_AVAILABLE:
            print("[Python] CarPlay modules not available!")
            # Show error dialog
            self.show_error_dialog(
                "CarPlay Not Available",
                "CarPlay modules could not be loaded.\nPlease ensure all required files are present."
            )
            return
        
        print("[Python] Launching CarPlay...")
        
        # Hide main UI
        self.main_frame.pack_forget()
        self.main_ui_visible = False
        
        # Create and show CarPlay viewer
        if not self.carplay_viewer:
            self.carplay_viewer = CarPlayViewer(self.root, self.return_to_main)
        
        self.carplay_viewer.show()
    
    def return_to_main(self):
        """Return to main UI from CarPlay"""
        print("[Python] Returning to main UI")
        
        # Show main UI
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        self.main_ui_visible = True
    
    def show_error_dialog(self, title, message):
        """Show an error dialog"""
        dialog = tk.Toplevel(self.root)
        dialog.title("")
        dialog.geometry("400x200")
        dialog.configure(bg=self.colors['bg_secondary'])
        dialog.transient(self.root)
        dialog.grab_set()
        
        # Center the dialog
        dialog.update_idletasks()
        x = (self.root.winfo_width() // 2) - (400 // 2) + self.root.winfo_x()
        y = (self.root.winfo_height() // 2) - (200 // 2) + self.root.winfo_y()
        dialog.geometry(f"+{x}+{y}")
        
        # Icon
        icon = tk.Label(
            dialog,
            text="⚠️",
            font=("Arial", 48),
            bg=self.colors['bg_secondary'],
            fg=self.colors['accent_orange']
        )
        icon.pack(pady=(20, 10))
        
        # Title
        title_label = tk.Label(
            dialog,
            text=title,
            font=("Arial", 14, "bold"),
            bg=self.colors['bg_secondary'],
            fg=self.colors['text_primary']
        )
        title_label.pack(pady=5)
        
        # Message
        msg_label = tk.Label(
            dialog,
            text=message,
            font=("Arial", 10),
            bg=self.colors['bg_secondary'],
            fg=self.colors['text_secondary'],
            justify=tk.CENTER
        )
        msg_label.pack(pady=10)
        
        # OK button
        ok_btn = tk.Button(
            dialog,
            text="OK",
            font=("Arial", 12, "bold"),
            bg=self.colors['bg_tile'],
            fg=self.colors['text_primary'],
            relief=tk.FLAT,
            cursor="hand2",
            width=10,
            height=2,
            command=dialog.destroy
        )
        ok_btn.pack(pady=10)
    
    def show_power_dialog(self):
        """Show power off confirmation dialog"""
        dialog = tk.Toplevel(self.root)
        dialog.title("")
        dialog.geometry("350x200")
        dialog.configure(bg=self.colors['bg_secondary'])
        dialog.transient(self.root)
        dialog.grab_set()
        
        # Center the dialog
        dialog.update_idletasks()
        x = (self.root.winfo_width() // 2) - (350 // 2) + self.root.winfo_x()
        y = (self.root.winfo_height() // 2) - (200 // 2) + self.root.winfo_y()
        dialog.geometry(f"+{x}+{y}")
        
        # Icon
        icon = tk.Label(
            dialog,
            text="⏻",
            font=("Arial", 48),
            bg=self.colors['bg_secondary'],
            fg=self.colors['accent_red']
        )
        icon.pack(pady=(20, 10))
        
        # Text
        text = tk.Label(
            dialog,
            text="Power Off System?",
            font=("Arial", 14, "bold"),
            bg=self.colors['bg_secondary'],
            fg=self.colors['text_primary']
        )
        text.pack(pady=10)
        
        # Buttons
        button_frame = tk.Frame(dialog, bg=self.colors['bg_secondary'])
        button_frame.pack(pady=20)
        
        cancel_btn = tk.Button(
            button_frame,
            text="Cancel",
            font=("Arial", 12, "bold"),
            bg=self.colors['bg_tile'],
            fg=self.colors['text_primary'],
            relief=tk.FLAT,
            cursor="hand2",
            width=10,
            height=2,
            command=dialog.destroy
        )
        cancel_btn.pack(side=tk.LEFT, padx=10)
        
        confirm_btn = tk.Button(
            button_frame,
            text="Power Off",
            font=("Arial", 12, "bold"),
            bg=self.colors['accent_red'],
            fg=self.colors['text_primary'],
            relief=tk.FLAT,
            cursor="hand2",
            width=10,
            height=2,
            command=lambda: [dialog.destroy(), self.power_off()]
        )
        confirm_btn.pack(side=tk.LEFT, padx=10)
    
    def power_off(self):
        """Handle system power off"""
        print("[Python] Powering off system...")
        
        # Cleanup CarPlay if active
        if self.carplay_viewer:
            self.carplay_viewer.cleanup()
        
        # Add your shutdown logic here
        # For Raspberry Pi: os.system("sudo shutdown -h now")
        self.root.quit()
    
    # App launch methods (stub implementations)
    def launch_music_player(self):
        print("[Python] Launching music player...")
        # os.system("vlc &")
    
    def launch_phone_app(self):
        print("[Python] Launching phone app...")
    
    def launch_camera(self):
        print("[Python] Showing rear camera...")
        # os.system("raspivid -t 0 &")
    
    def show_dashboard(self):
        print("[Python] Showing dashboard...")
    
    def open_settings(self):
        print("[Python] Opening settings...")


def main():
    root = tk.Tk()
    app = CarRadioUI(root)
    
    print("=" * 60)
    print("Car Radio UI with CarPlay Integration")
    print("=" * 60)
    
    if CARPLAY_AVAILABLE:
        print("[✓] CarPlay modules loaded successfully")
    else:
        print("[✗] CarPlay modules not available")
        print("    Place CarPlay driver files in /mnt/user-data/uploads/")
    
    print()
    print("Click the CarPlay tile to launch CarPlay/Android Auto")
    print("Press Ctrl+C in terminal or use Power button to exit")
    print()
    
    root.mainloop()


if __name__ == "__main__":
    main()