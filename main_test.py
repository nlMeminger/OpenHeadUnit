#!/usr/bin/env python3
"""
Car Radio UI with CarPlay Integration - NiceGUI Version
A modern car interface with integrated CarPlay/Android Auto support
"""
from nicegui import ui, app
from datetime import datetime
import asyncio
import random
import sys
import os

# Add uploads directory to path for dongle driver imports
if '/mnt/user-data/uploads' not in sys.path:
    sys.path.insert(0, '/mnt/user-data/uploads')

# Import CarPlay module
try:
    from carplay import CarPlayViewer
    import tkinter as tk
    CARPLAY_AVAILABLE = True
    print("✓ CarPlay module loaded successfully")
except ImportError as e:
    print(f"✗ CarPlay module not available: {e}")
    print("CarPlay functionality will be disabled")
    CARPLAY_AVAILABLE = False


class CarRadioUI:
    def __init__(self):
        # State variables
        self.brightness = 80
        self.volume = 50
        self.carplay_window = None
        self.carplay_viewer = None
        
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
        
        self.setup_styles()
        self.build_ui()
        
        # Start time update loop
        ui.timer(1.0, self.update_time)
    
    def setup_styles(self):
        """Setup custom CSS styles"""
        ui.add_head_html('''
        <style>
            * {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            }
            
            .app-tile {
                transition: all 0.2s ease;
                cursor: pointer;
            }
            
            .app-tile:hover {
                transform: translateY(-4px);
                box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
            }
            
            .app-tile:active {
                transform: translateY(-2px);
            }
            
            .app-tile.disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .app-tile.disabled:hover {
                transform: none;
                box-shadow: none;
            }
            
            .control-button {
                transition: all 0.15s ease;
            }
            
            .control-button:hover {
                transform: scale(1.05);
            }
            
            .control-button:active {
                transform: scale(0.95);
            }
            
            .brightness-popup {
                animation: slideUp 0.2s ease;
            }
            
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .fade-in {
                animation: fadeIn 0.3s ease;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
        </style>
        ''')
    
    def build_ui(self):
        """Build the main UI"""
        # Main container
        with ui.column().classes('w-full h-screen').style(f'background: {self.colors["bg_main"]}'):
            # Top bar
            self.create_top_bar()
            
            # Main content
            with ui.column().classes('flex-grow px-6 py-6'):
                self.create_main_content()
            
            # Bottom bar
            self.create_bottom_bar()
    
    def create_top_bar(self):
        """Create the top status bar"""
        with ui.row().classes('w-full items-center justify-between px-6 py-4').style(
            f'background: {self.colors["bg_secondary"]}; height: 60px'
        ):
            # Left side - Time and Temperature
            with ui.row().classes('items-center gap-4'):
                self.time_label = ui.label('12:34 PM').classes('text-xl font-bold').style(
                    f'color: {self.colors["text_primary"]}'
                )
                
                with ui.card().classes('px-3 py-1').style(
                    f'background: #2d3748; border: none'
                ):
                    self.temp_label = ui.label('🌡️ 72°F').classes('text-sm font-bold').style(
                        f'color: {self.colors["accent_blue"]}'
                    )
            
            # Right side - CarPlay status
            if CARPLAY_AVAILABLE:
                self.carplay_status = ui.label('🎧 CarPlay Ready').classes('text-sm font-bold').style(
                    f'color: {self.colors["accent_green"]}'
                )
    
    def create_main_content(self):
        """Create the main grid of application tiles"""
        apps = [
            ("🎵", "Music", self.colors['accent_purple'], True, self.launch_music_player),
            ("📞", "Phone", self.colors['accent_green'], True, self.launch_phone_app),
            ("🎧", "CarPlay", self.colors['accent_blue'], CARPLAY_AVAILABLE, self.launch_carplay),
            ("📹", "Rear Camera", self.colors['accent_orange'], True, self.launch_camera),
            ("🎯", "Dashboard", self.colors['accent_red'], True, self.show_dashboard),
            ("⚙️", "Settings", '#64748b', True, self.open_settings),
        ]
        
        # Create 2x3 grid
        with ui.grid(columns=3).classes('w-full gap-4 flex-grow'):
            for icon, title, color, enabled, callback in apps:
                self.create_tile(icon, title, color, enabled, callback)
    
    def create_tile(self, icon, title, accent_color, enabled, callback):
        """Create an application tile button"""
        tile_classes = 'app-tile flex flex-col items-center justify-center rounded-lg p-6'
        if not enabled:
            tile_classes += ' disabled'
            tile_bg = '#1e293b'
            icon_color = '#64748b'
            text_color = '#64748b'
        else:
            tile_bg = self.colors['bg_tile']
            icon_color = self.colors['text_primary']
            text_color = self.colors['text_primary']
        
        with ui.card().classes(tile_classes).style(
            f'background: {tile_bg}; border: 2px solid {accent_color}; min-height: 160px'
        ):
            # Icon
            ui.label(icon).classes('text-6xl').style(f'color: {icon_color}')
            
            # Title
            ui.label(title).classes('text-lg font-bold mt-2').style(f'color: {text_color}')
            
            # Disabled indicator
            if title == "CarPlay" and not enabled:
                ui.label('(Unavailable)').classes('text-xs mt-1').style('color: #64748b')
            
            # Click handler
            if enabled:
                ui.element('div').classes('absolute inset-0 cursor-pointer').on('click', callback)
    
    def create_bottom_bar(self):
        """Create the bottom control bar"""
        with ui.row().classes('w-full items-center justify-between px-6 py-3').style(
            f'background: {self.colors["bg_secondary"]}; height: 70px'
        ):
            # Left side - Brightness button
            with ui.button(icon='light_mode', on_click=self.toggle_brightness).classes(
                'control-button'
            ).style(
                f'background: {self.colors["bg_tile"]}; color: {self.colors["text_primary"]}'
            ):
                pass
            
            # Center - Volume control
            with ui.card().classes('px-6 py-2').style(
                'background: #2d3748; border: none; min-width: 300px'
            ):
                with ui.row().classes('items-center gap-3 w-full'):
                    ui.label('🔊').classes('text-xl')
                    
                    self.volume_slider = ui.slider(
                        min=0, max=100, value=self.volume, step=1
                    ).classes('flex-grow').on('change', self.update_volume)
                    
                    self.volume_value = ui.label(str(self.volume)).classes('text-sm font-bold w-8').style(
                        f'color: {self.colors["accent_blue"]}'
                    )
            
            # Right side - Settings and Power
            with ui.row().classes('gap-2'):
                ui.button(icon='settings', on_click=self.open_settings).classes(
                    'control-button'
                ).style(
                    f'background: {self.colors["bg_tile"]}; color: {self.colors["text_primary"]}'
                )
                
                ui.button(icon='power_settings_new', on_click=self.show_power_dialog).classes(
                    'control-button'
                ).style(
                    f'background: {self.colors["bg_tile"]}; color: {self.colors["text_primary"]}'
                )
    
    async def update_time(self):
        """Update the time display"""
        now = datetime.now()
        self.time_label.text = now.strftime("%I:%M %p")
        
        # Update temperature occasionally
        if now.second == 0:
            temps = [68, 70, 72, 74, 76]
            temp = random.choice(temps)
            self.temp_label.text = f"🌡️ {temp}°F"
    
    def update_volume(self, e):
        """Handle volume slider changes"""
        self.volume = int(e.value)
        self.volume_value.text = str(self.volume)
        print(f"[Main UI] Setting volume to {self.volume}")
    
    def toggle_brightness(self):
        """Toggle brightness control popup"""
        with ui.dialog() as dialog, ui.card().classes('brightness-popup p-6').style(
            f'background: {self.colors["bg_secondary"]}; min-width: 350px'
        ):
            with ui.row().classes('items-center gap-4 w-full'):
                ui.label('☀️').classes('text-2xl')
                
                brightness_slider = ui.slider(
                    min=20, max=100, value=self.brightness, step=1
                ).classes('flex-grow').on('change', lambda e: self.update_brightness(e, brightness_value))
                
                brightness_value = ui.label(f'{self.brightness}%').classes('text-sm font-bold w-12').style(
                    f'color: {self.colors["accent_yellow"]}'
                )
        
        dialog.open()
        
        # Auto-close after 5 seconds
        async def auto_close():
            await asyncio.sleep(5)
            dialog.close()
        
        asyncio.create_task(auto_close())
    
    def update_brightness(self, e, label):
        """Handle brightness changes"""
        self.brightness = int(e.value)
        label.text = f'{self.brightness}%'
        print(f"[Main UI] Setting brightness to {self.brightness}%")
    
    def launch_carplay(self):
        """Launch CarPlay viewer"""
        if not CARPLAY_AVAILABLE:
            self.show_error_dialog(
                "CarPlay Unavailable",
                "CarPlay functionality is not available.\n\nPlease check that all required modules are installed."
            )
            return
        
        print("[Main UI] Launching CarPlay...")
        
        # Update status
        if hasattr(self, 'carplay_status'):
            self.carplay_status.text = "🎧 Starting..."
            self.carplay_status.style(f'color: {self.colors["accent_orange"]}')
        
        # Launch CarPlay in separate tkinter window
        def launch_tk_carplay():
            root = tk.Tk()
            root.title("CarPlay")
            root.geometry("800x480")
            
            viewer = CarPlayViewer(root, lambda: root.quit())
            viewer.show()
            
            try:
                root.mainloop()
            finally:
                viewer.cleanup()
                if hasattr(self, 'carplay_status'):
                    self.carplay_status.text = "🎧 CarPlay Ready"
                    self.carplay_status.style(f'color: {self.colors["accent_green"]}')
        
        import threading
        threading.Thread(target=launch_tk_carplay, daemon=True).start()
    
    def show_error_dialog(self, title, message):
        """Show an error dialog"""
        with ui.dialog() as dialog, ui.card().classes('p-6').style(
            f'background: {self.colors["bg_secondary"]}; min-width: 400px'
        ):
            with ui.column().classes('items-center gap-4'):
                ui.label('⚠️').classes('text-6xl').style(f'color: {self.colors["accent_orange"]}')
                ui.label(title).classes('text-xl font-bold').style(f'color: {self.colors["text_primary"]}')
                ui.label(message).classes('text-sm text-center').style(f'color: {self.colors["text_secondary"]}')
                
                ui.button('OK', on_click=dialog.close).classes('mt-4').style(
                    f'background: {self.colors["bg_tile"]}; color: {self.colors["text_primary"]}; padding: 12px 32px'
                )
        
        dialog.open()
    
    def show_power_dialog(self):
        """Show power off confirmation dialog"""
        with ui.dialog() as dialog, ui.card().classes('p-6').style(
            f'background: {self.colors["bg_secondary"]}; min-width: 400px'
        ):
            with ui.column().classes('items-center gap-4'):
                ui.label('⏻').classes('text-6xl').style(f'color: {self.colors["accent_red"]}')
                ui.label('Power Off System?').classes('text-xl font-bold').style(
                    f'color: {self.colors["text_primary"]}'
                )
                
                with ui.row().classes('gap-4 mt-4'):
                    ui.button('Cancel', on_click=dialog.close).style(
                        f'background: {self.colors["bg_tile"]}; color: {self.colors["text_primary"]}; padding: 12px 24px'
                    )
                    
                    ui.button('Power Off', on_click=lambda: [dialog.close(), self.power_off()]).style(
                        f'background: {self.colors["accent_red"]}; color: {self.colors["text_primary"]}; padding: 12px 24px'
                    )
        
        dialog.open()
    
    def power_off(self):
        """Handle system power off"""
        print("[Main UI] Powering off system...")
        ui.notify('System shutting down...', type='warning')
        # Add your shutdown logic here
        # For Raspberry Pi: os.system("sudo shutdown -h now")
    
    # App launch methods
    def launch_music_player(self):
        """Launch music player application"""
        print("[Main UI] Launching music player...")
        ui.notify('Music player coming soon!', type='info')
    
    def launch_phone_app(self):
        """Launch phone application"""
        print("[Main UI] Launching phone app...")
        ui.notify('Phone functionality coming soon!', type='info')
    
    def launch_camera(self):
        """Show rear camera"""
        print("[Main UI] Showing rear camera...")
        ui.notify('Rear camera coming soon!', type='info')
    
    def show_dashboard(self):
        """Show vehicle dashboard"""
        print("[Main UI] Showing dashboard...")
        ui.notify('Dashboard coming soon!', type='info')
    
    def open_settings(self):
        """Open settings menu"""
        print("[Main UI] Opening settings...")
        ui.notify('Settings menu coming soon!', type='info')


def main():
    """Main entry point"""
    print("=" * 60)
    print("Car Radio UI with CarPlay Integration - NiceGUI")
    print("=" * 60)
    print(f"CarPlay Module Available: {CARPLAY_AVAILABLE}")
    
    if CARPLAY_AVAILABLE:
        print("✓ Full CarPlay functionality enabled")
    else:
        print("ℹ CarPlay will show as unavailable")
    
    print("=" * 60)
    print()
    
    # Configure NiceGUI
    app.native.window_args['resizable'] = False
    app.native.start_args['debug'] = False
    
    # Create UI
    CarRadioUI()
    
    # Run the app
    ui.run(
        title='Car Radio Interface',
        port=8080,
        reload=False,
        show=True,
        native=True,  # Run as native app
        window_size=(800, 480),
        fullscreen=False,
        frameless=False,
        dark=None  # Use custom dark theme
    )


if __name__ == '__main__':
    main()