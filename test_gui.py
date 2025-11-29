#!/usr/bin/env python3
"""
Car Radio UI - NiceGUI Version
A modern car interface using NiceGUI framework
"""
from nicegui import ui, app
from datetime import datetime
import asyncio
import sys
import queue
import numpy as np
from PIL import Image
import io
import base64

# Add uploads directory to path for dongle driver imports
if '/mnt/user-data/uploads' not in sys.path:
    sys.path.insert(0, '/mnt/user-data/uploads')

# Color scheme
COLORS = {
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

# Check if CarPlay modules are available
CARPLAY_AVAILABLE = False
try:
    from carplay_dongle.video_decoder import VideoDecoder
    from carplay_dongle.audio_handler import AudioHandler, AudioFormat
    from carplay_dongle.touch_handler import TouchHandler, TouchAction
    from carplay_dongle.device_finder import DeviceFinder
    from carplay_dongle.stats_tracker import StatsTracker
    from carplay_dongle.dongle_driver import DongleDriver, DEFAULT_CONFIG
    from carplay_dongle.readable import VideoData, AudioData, Plugged, Unplugged, DECODE_TYPE_MAP
    from carplay_dongle.sendable import SendTouch, SendAudio
    CARPLAY_AVAILABLE = True
    print("✓ CarPlay modules loaded successfully")
except ImportError as e:
    print(f"✗ CarPlay modules not available: {e}")
    print("CarPlay functionality will be disabled")


class CarRadioUI:
    def __init__(self):
        self.brightness = 80
        self.volume = 50
        self.brightness_dialog = None
        self.carplay_viewer = None
        self.main_container = None
        self.carplay_container = None
        
        # CarPlay state
        self.carplay_driver = None
        self.carplay_decoder = None
        self.carplay_audio_handler = None
        self.carplay_touch_handler = None
        self.carplay_stats = None
        self.carplay_connected = False
        self.carplay_phone_type = None
        
        # Build UI
        self.build_ui()
        
        # Start time update
        ui.timer(1.0, self.update_time)
    
    def build_ui(self):
        """Build the main UI"""
        # Custom CSS for styling
        ui.add_head_html(f'''
            <style>
                body {{
                    background: {COLORS['bg_main']};
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                }}
                
                .top-bar {{
                    background: {COLORS['bg_secondary']};
                    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
                    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
                }}
                
                .bottom-bar {{
                    background: {COLORS['bg_secondary']};
                    border-top: 1px solid rgba(148, 163, 184, 0.1);
                    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.4);
                }}
                
                .app-tile {{
                    background: {COLORS['bg_tile']};
                    border-radius: 16px;
                    padding: 20px;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border: 1px solid rgba(148, 163, 184, 0.15);
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }}
                
                .app-tile:hover {{
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                }}
                
                .app-tile:active {{
                    transform: scale(0.97);
                }}
                
                .tile-icon {{
                    font-size: 48px;
                    margin-bottom: 12px;
                    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
                }}
                
                .tile-title {{
                    font-size: 16px;
                    font-weight: 700;
                    color: {COLORS['text_primary']};
                    letter-spacing: -0.3px;
                }}
                
                .tile-subtitle {{
                    font-size: 11px;
                    color: {COLORS['text_secondary']};
                    margin-top: 4px;
                }}
                
                .tile-disabled {{
                    opacity: 0.5;
                    cursor: not-allowed;
                }}
                
                .control-btn {{
                    background: rgba(51, 65, 85, 0.8);
                    border: 1px solid rgba(148, 163, 184, 0.2);
                    border-radius: 12px;
                    padding: 10px 15px;
                    cursor: pointer;
                    transition: all 0.2s;
                }}
                
                .control-btn:hover {{
                    background: rgba(71, 85, 105, 0.9);
                    transform: translateY(-1px);
                }}
                
                .time-display {{
                    font-size: 16px;
                    font-weight: 700;
                    color: {COLORS['text_primary']};
                    letter-spacing: -0.3px;
                }}
                
                .temp-display {{
                    background: #2d3748;
                    padding: 5px 10px;
                    border-radius: 8px;
                    font-size: 11px;
                    font-weight: 600;
                    color: {COLORS['accent_blue']};
                }}
                
                .status-badge {{
                    background: rgba(34, 197, 94, 0.3);
                    border: 1px solid rgba(34, 197, 94, 0.5);
                    padding: 4px 10px;
                    border-radius: 8px;
                    font-size: 10px;
                    color: #86efac;
                }}
                
                .volume-container {{
                    background: #2d3748;
                    padding: 8px 16px;
                    border-radius: 12px;
                    border: 1px solid rgba(148, 163, 184, 0.1);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }}
                
                .carplay-container {{
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background: black;
                    z-index: 9999;
                }}
                
                .carplay-exit-btn {{
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    z-index: 10000;
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 8px;
                    padding: 10px 20px;
                    font-size: 14px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.2s;
                }}
                
                .carplay-exit-btn:hover {{
                    background: rgba(0, 0, 0, 0.9);
                    transform: translateY(-1px);
                }}
            </style>
        ''')
        
        # Main container
        self.main_container = ui.column().classes('w-full h-screen')
        with self.main_container:
            # Top bar
            self.create_top_bar()
            
            # Main content area
            self.create_main_content()
            
            # Bottom bar
            self.create_bottom_bar()
    
    def create_top_bar(self):
        """Create top status bar"""
        with ui.row().classes('top-bar w-full items-center justify-between px-5 py-2'):
            # Left side
            with ui.row().classes('items-center gap-3'):
                self.time_label = ui.label('12:34 PM').classes('time-display')
                self.temp_label = ui.label('🌡️ 72°F').classes('temp-display')
            
            # Right side - CarPlay status
            if CARPLAY_AVAILABLE:
                self.carplay_status = ui.label('🎧 CarPlay Ready').classes('status-badge')
    
    def create_main_content(self):
        """Create main grid of app tiles"""
        with ui.element('div').classes('flex-1 p-5 w-full'):
            with ui.grid(columns=3).classes('w-full h-full gap-4').style('grid-template-rows: 1fr 1fr;'):
                # App tiles configuration
                apps = [
                    ("🎵", "Music", COLORS['accent_purple'], True, None),
                    ("📞", "Phone", COLORS['accent_green'], True, None),
                    ("🎧", "CarPlay", COLORS['accent_blue'], CARPLAY_AVAILABLE, 
                     None if CARPLAY_AVAILABLE else "(Unavailable)"),
                    ("📹", "Rear Camera", COLORS['accent_orange'], True, None),
                    ("🏎️", "Dashboard", COLORS['accent_red'], True, None),
                    ("⚙️", "Settings", '#64748b', True, None),
                ]
                
                for icon, title, color, enabled, subtitle in apps:
                    self.create_tile(icon, title, color, enabled, subtitle)
    
    def create_tile(self, icon, title, color, enabled=True, subtitle=None):
        """Create an app tile"""
        tile_class = 'app-tile' if enabled else 'app-tile tile-disabled'
        
        card = ui.card().classes(tile_class).style(f'border-color: {color}')
        with card:
            with ui.column().classes('items-center justify-center gap-2'):
                ui.label(icon).classes('tile-icon')
                ui.label(title).classes('tile-title')
                if subtitle:
                    ui.label(subtitle).classes('tile-subtitle')
        
        # Add click handler if enabled
        if enabled:
            card.on('click', lambda t=title: self.open_app(t))
    
    def create_bottom_bar(self):
        """Create bottom control bar"""
        with ui.row().classes('bottom-bar w-full items-center justify-between px-5 py-3'):
            # Left - Brightness button
            with ui.button('☀️', on_click=self.toggle_brightness).classes('control-btn'):
                pass
            
            # Center - Volume control
            with ui.element('div').classes('volume-container flex-1 mx-5'):
                with ui.row().classes('items-center gap-3 w-full'):
                    ui.label('🔊').style('font-size: 18px')
                    self.volume_slider = ui.slider(
                        min=0, max=100, value=50
                    ).classes('flex-1').on('change', lambda e: self.update_volume(e.value))
                    self.volume_value = ui.label('50').style(
                        f'color: {COLORS["accent_blue"]}; '
                        'font-weight: 600; min-width: 30px; text-align: center;'
                    )
            
            # Right - Settings and Power
            with ui.row().classes('gap-2'):
                ui.button('⚙️', on_click=lambda: self.open_app('Settings')).classes('control-btn')
                ui.button('⏻', on_click=self.show_power_dialog).classes('control-btn')
    
    def update_time(self):
        """Update time display"""
        now = datetime.now()
        time_str = now.strftime("%I:%M %p")
        self.time_label.text = time_str
        
        # Update temperature occasionally (every minute)
        if now.second == 0:
            import random
            temps = [68, 70, 72, 74, 76]
            temp = random.choice(temps)
            self.temp_label.text = f"🌡️ {temp}°F"
    
    def update_volume(self, value):
        """Handle volume changes"""
        self.volume = int(value)
        self.volume_value.text = str(self.volume)
        print(f"[NiceGUI] Setting volume to {self.volume}")
    
    def toggle_brightness(self):
        """Toggle brightness dialog"""
        if self.brightness_dialog:
            self.brightness_dialog.close()
            self.brightness_dialog = None
        else:
            self.show_brightness_dialog()
    
    def show_brightness_dialog(self):
        """Show brightness adjustment dialog"""
        with ui.dialog() as dialog, ui.card().classes('p-6'):
            self.brightness_dialog = dialog
            dialog.open()
            
            with ui.row().classes('items-center gap-4 w-full'):
                ui.label('☀️').style('font-size: 24px')
                brightness_slider = ui.slider(
                    min=20, max=100, value=self.brightness
                ).classes('flex-1').on('change', lambda e: self.update_brightness(e.value))
                self.brightness_value = ui.label(f'{self.brightness}%').style(
                    f'color: {COLORS["accent_yellow"]}; font-weight: 600; min-width: 50px;'
                )
            
            # Auto-close after 5 seconds
            ui.timer(5.0, lambda: dialog.close() if dialog else None, once=True)
    
    def update_brightness(self, value):
        """Handle brightness changes"""
        self.brightness = int(value)
        self.brightness_value.text = f'{self.brightness}%'
        print(f"[NiceGUI] Setting brightness to {self.brightness}%")
    
    def open_app(self, app_name):
        """Handle app opening"""
        print(f"[NiceGUI] Opening {app_name}!")
        
        if app_name == "CarPlay":
            if CARPLAY_AVAILABLE:
                self.launch_carplay()
            else:
                self.show_error_dialog(
                    "CarPlay Unavailable",
                    "CarPlay functionality is not available.\n\nPlease check that all required modules are installed."
                )
        else:
            # Show coming soon dialog for other apps
            self.show_error_dialog(
                "Coming Soon",
                f"{app_name} functionality will be available soon!"
            )
    
    def launch_carplay(self):
        """Launch CarPlay viewer"""
        print("[NiceGUI] Launching CarPlay...")
        
        if not CARPLAY_AVAILABLE:
            self.show_error_dialog(
                "CarPlay Unavailable",
                "CarPlay functionality is not available.\n\nPlease check that all required modules are installed."
            )
            return
        
        # Hide main container
        self.main_container.set_visibility(False)
        
        # Create CarPlay container
        self.carplay_container = ui.column().classes('carplay-container')
        
        with self.carplay_container:
            # Exit button
            ui.button('◀ Back', on_click=self.exit_carplay).classes('carplay-exit-btn')
            
            # Video display area
            self.carplay_video = ui.interactive_image().classes('w-full h-full').style(
                'object-fit: contain; cursor: pointer;'
            )
            
            # Bind touch events
            self.carplay_video.on('mousedown', self.on_carplay_touch_down)
            self.carplay_video.on('mousemove', self.on_carplay_touch_move)
            self.carplay_video.on('mouseup', self.on_carplay_touch_up)
            
            # Status overlay (initially visible)
            with ui.column().classes('w-full h-full items-center justify-center').style(
                'position: absolute; top: 0; left: 0; background: rgba(0,0,0,0.8);'
            ) as self.carplay_status_overlay:
                ui.label('🎧').style('font-size: 64px; color: white;')
                ui.label('Initializing CarPlay...').classes('text-white text-xl mt-4')
                self.carplay_status_label = ui.label('Searching for USB dongle...').classes('text-gray-400 text-sm mt-2')
        
        # Start CarPlay driver
        ui.timer(0.5, self.start_carplay_driver, once=True)
    
    def start_carplay_driver(self):
        """Start the CarPlay driver"""
        try:
            print("[NiceGUI] Searching for USB dongle...")
            self.carplay_status_label.text = "Searching for USB dongle..."
            
            # Initialize components
            self.carplay_decoder = VideoDecoder()
            self.carplay_stats = StatsTracker()
            device_finder = DeviceFinder()
            
            # Find device
            device = device_finder.find_device()
            
            if not device:
                print("[NiceGUI] No compatible USB dongle found!")
                self.carplay_status_label.text = "Error: No USB dongle found"
                ui.notify('No CarPlay dongle detected', type='negative')
                ui.timer(2.0, self.exit_carplay, once=True)
                return
            
            print(f"[NiceGUI] Found device!")
            self.carplay_status_label.text = "Device found! Initializing..."
            
            # Create touch handler
            self.carplay_touch_handler = TouchHandler(send_callback=self.send_touch_event)
            
            # Create audio handler
            self.carplay_audio_handler = AudioHandler(on_audio_data=self.send_audio_to_device)
            
            # Create and initialize driver
            self.carplay_driver = DongleDriver()
            self.carplay_driver.on('message', self.on_carplay_message)
            self.carplay_driver.on('failure', self.on_carplay_failure)
            
            self.carplay_driver.initialize(device)
            
            self.carplay_status_label.text = "Starting driver..."
            self.carplay_driver.start(DEFAULT_CONFIG)
            
            print("[NiceGUI] CarPlay driver started successfully!")
            self.carplay_status_label.text = "Waiting for phone connection..."
            
            ui.notify('CarPlay started - Connect your phone', type='positive')
            
        except Exception as e:
            print(f"[NiceGUI] Error starting CarPlay: {e}")
            import traceback
            traceback.print_exc()
            self.carplay_status_label.text = f"Error: {str(e)}"
            ui.notify('Failed to start CarPlay', type='negative')
            ui.timer(2.0, self.exit_carplay, once=True)
    
    def on_carplay_message(self, message):
        """Handle messages from CarPlay driver"""
        try:
            if isinstance(message, VideoData):
                self.handle_carplay_video(message)
            
            elif isinstance(message, AudioData):
                self.handle_carplay_audio(message)
            
            elif isinstance(message, Plugged):
                self.carplay_connected = True
                self.carplay_phone_type = message.phone_type.name
                print(f"[CarPlay] Phone connected: {self.carplay_phone_type}")
                
                # Schedule UI updates on main thread
                ui.timer(0, lambda: self.update_carplay_connection_ui(True), once=True)
            
            elif isinstance(message, Unplugged):
                self.carplay_connected = False
                self.carplay_phone_type = None
                print("[CarPlay] Phone disconnected")
                
                # Schedule UI updates on main thread
                ui.timer(0, lambda: self.update_carplay_connection_ui(False), once=True)
        
        except Exception as e:
            print(f"[CarPlay] Error handling message: {e}")
            import traceback
            traceback.print_exc()
    
    def update_carplay_connection_ui(self, connected):
        """Update UI for connection status (called from main thread)"""
        if connected:
            # Hide status overlay
            if self.carplay_status_overlay:
                self.carplay_status_overlay.set_visibility(False)
            ui.notify(f'{self.carplay_phone_type} connected!', type='positive')
        else:
            # Show status overlay
            if self.carplay_status_overlay:
                self.carplay_status_overlay.set_visibility(True)
                self.carplay_status_label.text = "Phone disconnected - Please reconnect"
            ui.notify('Phone disconnected', type='warning')
    
    def handle_carplay_video(self, video_data):
        """Handle incoming video frame"""
        try:
            # Decode frame
            decoded_frame = self.carplay_decoder.decode_frame(
                video_data.data,
                video_data.width,
                video_data.height
            )
            
            # Record stats
            self.carplay_stats.record_frame(
                decoded=decoded_frame is not None,
                resolution=(video_data.width, video_data.height),
                data_size=len(video_data.data)
            )
            
            # Display frame if decoded
            if decoded_frame is not None:
                # Convert numpy array to PIL Image
                image = Image.fromarray(decoded_frame)
                
                # Convert to base64 for display
                buffer = io.BytesIO()
                image.save(buffer, format='JPEG', quality=85)
                img_str = base64.b64encode(buffer.getvalue()).decode()
                
                # Update video display
                self.carplay_video.set_source(f'data:image/jpeg;base64,{img_str}')
                
                # Update touch handler with video size
                if self.carplay_touch_handler:
                    # NiceGUI interactive_image normalizes coordinates, so we just need the video size
                    self.carplay_touch_handler.set_display_info(
                        video_size=(video_data.width, video_data.height),
                        display_size=(video_data.width, video_data.height),
                        display_offset=(0, 0)
                    )
        
        except Exception as e:
            print(f"[CarPlay] Error handling video: {e}")
    
    def handle_carplay_audio(self, audio_data):
        """Handle incoming audio data"""
        try:
            if not self.carplay_audio_handler:
                return
                
            if audio_data.decode_type in DECODE_TYPE_MAP:
                audio_format_info = DECODE_TYPE_MAP[audio_data.decode_type]
                audio_format = AudioFormat(
                    audio_format_info.frequency,
                    audio_format_info.channel,
                    audio_format_info.bit_depth
                )
                
                self.carplay_audio_handler.start_output(audio_format)
                
                if audio_data.data is not None and hasattr(self.carplay_audio_handler, 'output_stream') and self.carplay_audio_handler.output_stream:
                    self.carplay_audio_handler.play_audio(audio_data.data)
        
        except Exception as e:
            # Only print occasionally to avoid spam
            if not hasattr(self, '_audio_error_count'):
                self._audio_error_count = 0
            self._audio_error_count += 1
            if self._audio_error_count % 100 == 1:
                print(f"[CarPlay] Error handling audio: {e}")
    
    def on_carplay_touch_down(self, e):
        """Handle touch down event"""
        if not self.carplay_touch_handler or not self.carplay_connected:
            return
        
        # NiceGUI provides normalized coordinates (0-1)
        x = e.args.get('imageX', 0)
        y = e.args.get('imageY', 0)
        
        # Convert to pixel coordinates for touch handler
        if self.carplay_touch_handler.video_size:
            width, height = self.carplay_touch_handler.video_size
            pixel_x = int(x * width)
            pixel_y = int(y * height)
            self.carplay_touch_handler.handle_down(pixel_x, pixel_y)
    
    def on_carplay_touch_move(self, e):
        """Handle touch move event"""
        if not self.carplay_touch_handler or not self.carplay_connected:
            return
        
        x = e.args.get('imageX', 0)
        y = e.args.get('imageY', 0)
        
        if self.carplay_touch_handler.video_size:
            width, height = self.carplay_touch_handler.video_size
            pixel_x = int(x * width)
            pixel_y = int(y * height)
            self.carplay_touch_handler.handle_move(pixel_x, pixel_y)
    
    def on_carplay_touch_up(self, e):
        """Handle touch up event"""
        if not self.carplay_touch_handler or not self.carplay_connected:
            return
        
        x = e.args.get('imageX', 0)
        y = e.args.get('imageY', 0)
        
        if self.carplay_touch_handler.video_size:
            width, height = self.carplay_touch_handler.video_size
            pixel_x = int(x * width)
            pixel_y = int(y * height)
            self.carplay_touch_handler.handle_up(pixel_x, pixel_y)
    
    def send_touch_event(self, x: float, y: float, action):
        """Send touch event to CarPlay device"""
        if self.carplay_driver and self.carplay_connected:
            try:
                touch_msg = SendTouch(x, y, action)
                self.carplay_driver.send(touch_msg)
            except Exception as e:
                print(f"[CarPlay] Error sending touch: {e}")
    
    def send_audio_to_device(self, audio_data):
        """Send microphone audio to CarPlay device"""
        if self.carplay_driver and self.carplay_connected:
            try:
                self.carplay_driver.send(SendAudio(audio_data))
            except Exception as e:
                print(f"[CarPlay] Error sending audio: {e}")
    
    def on_carplay_failure(self):
        """Handle CarPlay driver failure"""
        print("[CarPlay] Driver failed!")
        self.carplay_connected = False
        ui.notify('CarPlay connection failed', type='negative')
        
        if self.carplay_status_overlay:
            self.carplay_status_overlay.set_visibility(True)
            self.carplay_status_label.text = "Connection failed - Please restart"
    
    def exit_carplay(self):
        """Exit CarPlay and return to main menu"""
        print("[NiceGUI] Exiting CarPlay...")
        
        # Cleanup audio handler
        if self.carplay_audio_handler:
            try:
                self.carplay_audio_handler.close()
            except:
                pass
            self.carplay_audio_handler = None
        
        # Cleanup driver
        if self.carplay_driver:
            try:
                self.carplay_driver.close()
            except:
                pass
            self.carplay_driver = None
        
        # Reset state
        self.carplay_connected = False
        self.carplay_phone_type = None
        self.carplay_decoder = None
        self.carplay_touch_handler = None
        self.carplay_stats = None
        
        # Remove CarPlay container
        if self.carplay_container:
            self.carplay_container.clear()
            self.carplay_container.delete()
            self.carplay_container = None
        
        # Show main container
        self.main_container.set_visibility(True)
        
        # Update status
        if hasattr(self, 'carplay_status'):
            self.carplay_status.text = '🎧 CarPlay Ready'
        
        ui.notify('Returned to main menu', type='info')
    
    def show_error_dialog(self, title, message):
        """Show error dialog"""
        with ui.dialog() as dialog, ui.card().classes('p-6 text-center'):
            ui.label('⚠️').style('font-size: 48px')
            ui.label(title).classes('text-xl font-bold mt-4')
            ui.label(message).classes('text-sm text-gray-400 mt-2 whitespace-pre-line')
            
            with ui.row().classes('mt-6 justify-center'):
                ui.button('OK', on_click=dialog.close).classes(
                    'bg-blue-600 text-white px-6 py-2 rounded'
                )
            
            dialog.open()
    
    def show_power_dialog(self):
        """Show power off confirmation"""
        with ui.dialog() as dialog, ui.card().classes('p-6 text-center'):
            ui.label('⏻').style(f'font-size: 48px; color: {COLORS["accent_red"]}')
            ui.label('Power Off System?').classes('text-xl font-bold mt-4')
            
            with ui.row().classes('mt-6 gap-4 justify-center'):
                ui.button('Cancel', on_click=dialog.close).classes(
                    'bg-gray-600 text-white px-6 py-2 rounded'
                )
                ui.button('Power Off', on_click=lambda: [dialog.close(), self.power_off()]).classes(
                    'bg-red-600 text-white px-6 py-2 rounded'
                )
            
            dialog.open()
    
    def power_off(self):
        """Handle power off"""
        print("[NiceGUI] Powering off system...")
        ui.notify('Powering off...', type='warning')
        # TODO: Add actual shutdown logic
        # For now, just close the app
        app.shutdown()


def main():
    """Main entry point"""
    print("=" * 60)
    print("Car Radio UI - NiceGUI Version")
    print("=" * 60)
    print(f"CarPlay Module Available: {CARPLAY_AVAILABLE}")
    
    if CARPLAY_AVAILABLE:
        print("✓ Full CarPlay functionality enabled")
    else:
        print("ℹ CarPlay will show as unavailable")
    
    print("=" * 60)
    print()
    
    # Create the UI
    car_radio = CarRadioUI()
    
    # Run the app
    ui.run(
        title='Car Radio Interface',
        port=8080,
        host='0.0.0.0',
        reload=False,
        show=True,
        dark=True,
        native=False  # Set to True for native window mode
    )


if __name__ == "__main__":
    main()