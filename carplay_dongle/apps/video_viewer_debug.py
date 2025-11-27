#!/usr/bin/env python3
"""
Video Viewer with Frame Saving and Multiple Decoder Attempts

This version tries multiple decoding methods and can save raw frames for debugging.
"""

import sys
import os
import usb.core
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk
import numpy as np
import queue
import time

# Add uploads directory to path for imports
sys.path.insert(0, '/mnt/user-data/uploads')

from dongle_driver import DongleDriver, DEFAULT_CONFIG
from readable import VideoData, AudioData, Plugged, Command, Unplugged


class MultiMethodDecoder:
    """Tries multiple methods to decode video frames"""
    
    def __init__(self, save_raw_frames=False):
        self.save_raw_frames = save_raw_frames
        self.frame_save_count = 0
        self.decoders = []
        
        # Create raw_frames directory if saving
        if save_raw_frames:
            os.makedirs('raw_frames', exist_ok=True)
            print("Raw frame saving enabled - frames will be saved to raw_frames/")
        
        # Try to initialize PyAV
        try:
            import av
            self.pyav_codec = av.CodecContext.create('h264', 'r')
            self.decoders.append(('PyAV', self._decode_with_pyav))
            print("✓ PyAV decoder initialized")
        except ImportError:
            print("✗ PyAV not available (pip install av)")
            self.pyav_codec = None
        except Exception as e:
            print(f"✗ PyAV initialization failed: {e}")
            self.pyav_codec = None
        
        # Try to initialize OpenCV
        try:
            import cv2
            self.cv2 = cv2
            self.decoders.append(('OpenCV', self._decode_with_opencv))
            print("✓ OpenCV decoder available")
        except ImportError:
            print("✗ OpenCV not available")
            self.cv2 = None
        
        if not self.decoders:
            print("WARNING: No decoders available! Install PyAV or OpenCV.")
            print("  pip install av")
            print("  or")
            print("  pip install opencv-python")
    
    def _decode_with_pyav(self, data: bytes, width: int, height: int):
        """Decode using PyAV"""
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
            return None
    
    def _decode_with_opencv(self, data: bytes, width: int, height: int):
        """Decode using OpenCV (fallback method)"""
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
            return None
    
    def decode_frame(self, data: bytes, width: int, height: int) -> np.ndarray:
        """
        Try all available decoders to decode a video frame
        Returns a numpy array (RGB image) or None if all methods fail
        """
        # Save raw frame if enabled
        if self.save_raw_frames and self.frame_save_count < 100:  # Limit to 100 frames
            filename = f'raw_frames/frame_{self.frame_save_count:06d}_{width}x{height}.h264'
            try:
                with open(filename, 'wb') as f:
                    f.write(data)
                self.frame_save_count += 1
                if self.frame_save_count in [1, 10, 50, 100]:
                    print(f"Saved {self.frame_save_count} raw frames for analysis")
            except Exception as e:
                print(f"Error saving raw frame: {e}")
        
        # Try each decoder
        for decoder_name, decoder_func in self.decoders:
            result = decoder_func(data, width, height)
            if result is not None:
                return result
        
        return None


class VideoViewerApp:
    def __init__(self, save_raw_frames=False):
        self.root = tk.Tk()
        self.root.title("CarPlay/Android Auto Video Viewer - Debug")
        self.root.geometry("900x800")
        
        # Video frame queue for thread-safe updates
        self.frame_queue = queue.Queue(maxsize=5)
        
        # Decoder
        self.decoder = MultiMethodDecoder(save_raw_frames=save_raw_frames)
        
        # Stats
        self.frame_count = 0
        self.decoded_frame_count = 0
        self.last_resolution = None
        self.phone_type = None
        self.connected = False
        self.fps_counter = []
        self.last_fps_update = time.time()
        self.current_fps = 0
        self.last_frame_data = None
        
        # Driver
        self.driver = None
        self.driver_running = False
        
        # Create UI
        self.setup_ui()
        
        # Start UI update loop
        self.update_display()
        
    def setup_ui(self):
        """Setup the user interface"""
        # Top frame for controls and status
        top_frame = ttk.Frame(self.root, padding="10")
        top_frame.pack(fill=tk.X)
        
        # Status label
        self.status_label = ttk.Label(
            top_frame, 
            text="Status: Not Connected",
            font=("Arial", 10, "bold")
        )
        self.status_label.pack(side=tk.LEFT)
        
        # Stats label
        self.stats_label = ttk.Label(
            top_frame,
            text="Frames: 0 | Decoded: 0 | FPS: 0",
            font=("Arial", 9)
        )
        self.stats_label.pack(side=tk.RIGHT)
        
        # Separator
        ttk.Separator(self.root, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=5)
        
        # Video display frame
        video_frame = ttk.Frame(self.root, padding="10")
        video_frame.pack(fill=tk.BOTH, expand=True)
        
        # Canvas for video display
        self.canvas = tk.Canvas(
            video_frame,
            bg="black",
            highlightthickness=0
        )
        self.canvas.pack(fill=tk.BOTH, expand=True)
        
        # Info label
        self.info_label = ttk.Label(
            video_frame,
            text="Waiting for video frames...",
            foreground="white",
            background="black",
            font=("Arial", 12)
        )
        self.info_label.place(relx=0.5, rely=0.5, anchor=tk.CENTER)
        
        # Bottom frame for additional info
        bottom_frame = ttk.Frame(self.root, padding="10")
        bottom_frame.pack(fill=tk.X)
        
        self.detail_label = ttk.Label(
            bottom_frame,
            text="Waiting for device connection...",
            font=("Arial", 9)
        )
        self.detail_label.pack()
        
        # Debug frame
        debug_frame = ttk.LabelFrame(self.root, text="Frame Debug Info", padding="5")
        debug_frame.pack(fill=tk.X, padx=10, pady=5)
        
        self.debug_label = ttk.Label(
            debug_frame,
            text="No debug info yet",
            font=("Arial", 8),
            justify=tk.LEFT
        )
        self.debug_label.pack(anchor=tk.W)
        
        # NAL info frame
        nal_frame = ttk.LabelFrame(self.root, text="H.264 NAL Info", padding="5")
        nal_frame.pack(fill=tk.X, padx=10, pady=5)
        
        self.nal_label = ttk.Label(
            nal_frame,
            text="Waiting for H.264 data...",
            font=("Arial", 8),
            justify=tk.LEFT
        )
        self.nal_label.pack(anchor=tk.W)
    
    def analyze_h264_data(self, data: bytes) -> str:
        """Analyze H.264 NAL unit data"""
        if len(data) < 5:
            return "Data too short to analyze"
        
        # Look for start codes
        start_code_3 = data[0:3] == b'\x00\x00\x01'
        start_code_4 = data[0:4] == b'\x00\x00\x00\x01'
        
        info = []
        
        if start_code_4:
            info.append("Start code: 00 00 00 01 (4-byte)")
            nal_byte = data[4]
            nal_offset = 4
        elif start_code_3:
            info.append("Start code: 00 00 01 (3-byte)")
            nal_byte = data[3]
            nal_offset = 3
        else:
            info.append("No standard start code found")
            nal_byte = data[0]
            nal_offset = 0
        
        # Parse NAL unit type
        if nal_offset > 0:
            nal_ref_idc = (nal_byte >> 5) & 0x03
            nal_unit_type = nal_byte & 0x1F
            
            nal_types = {
                1: "Non-IDR slice",
                5: "IDR slice (keyframe)",
                6: "SEI",
                7: "SPS (Sequence Parameter Set)",
                8: "PPS (Picture Parameter Set)",
                9: "Access Unit Delimiter",
            }
            
            nal_type_name = nal_types.get(nal_unit_type, f"Unknown ({nal_unit_type})")
            info.append(f"NAL unit type: {nal_type_name}")
            info.append(f"NAL ref idc: {nal_ref_idc}")
        
        return " | ".join(info)
    
    def on_message(self, message):
        """Handle incoming messages from the dongle"""
        try:
            if isinstance(message, VideoData):
                self.handle_video_frame(message)
            elif isinstance(message, Plugged):
                self.phone_type = message.phone_type.name
                self.connected = True
                print(f"Phone plugged: {message.phone_type.name}")
                self.root.after(0, self.update_status)
            elif isinstance(message, Unplugged):
                self.connected = False
                self.phone_type = None
                print("Phone unplugged")
                self.root.after(0, self.update_status)
            elif isinstance(message, AudioData):
                pass  # Silence audio messages
            elif isinstance(message, Command):
                print(f"Received command: {message.value.name}")
            else:
                print(f"Received message: {type(message).__name__}")
                
        except Exception as e:
            print(f"Error handling message: {e}")
            import traceback
            traceback.print_exc()
    
    def handle_video_frame(self, video_data: VideoData):
        """Handle incoming video frame"""
        try:
            self.frame_count += 1
            self.last_resolution = (video_data.width, video_data.height)
            self.last_frame_data = video_data
            
            # Update FPS counter
            current_time = time.time()
            self.fps_counter.append(current_time)
            self.fps_counter = [t for t in self.fps_counter if current_time - t < 1.0]
            
            if current_time - self.last_fps_update >= 1.0:
                self.current_fps = len(self.fps_counter)
                self.last_fps_update = current_time
            
            # Print occasional status
            if self.frame_count % 30 == 0:
                print(f"Received video frame: {video_data.width}x{video_data.height}, "
                      f"{len(video_data.data)} bytes")
            
            # Try to decode the frame
            decoded_frame = self.decoder.decode_frame(
                video_data.data,
                video_data.width,
                video_data.height
            )
            
            if decoded_frame is not None:
                self.decoded_frame_count += 1
                image = Image.fromarray(decoded_frame)
                
                try:
                    self.frame_queue.put_nowait(image)
                except queue.Full:
                    pass
            
            # Update debug info
            debug_text = (
                f"Frame #{self.frame_count}: {video_data.width}x{video_data.height}, "
                f"{len(video_data.data)} bytes\n"
                f"Flags: 0x{video_data.flags:08x} | "
                f"Unknown: 0x{video_data.unknown:08x}\n"
                f"First 32 bytes: {video_data.data[:32].hex()}"
            )
            self.root.after(0, lambda: self.debug_label.config(text=debug_text))
            
            # Analyze H.264 NAL structure
            nal_info = self.analyze_h264_data(video_data.data)
            self.root.after(0, lambda: self.nal_label.config(text=nal_info))
            
            # Update status
            self.root.after(0, self.update_status)
            
        except Exception as e:
            print(f"Error in handle_video_frame: {e}")
            import traceback
            traceback.print_exc()
    
    def update_status(self):
        """Update status labels"""
        if self.connected:
            status_text = f"Status: Connected ({self.phone_type})"
            self.status_label.config(foreground="green")
        else:
            status_text = "Status: Disconnected"
            self.status_label.config(foreground="red")
        
        self.status_label.config(text=status_text)
        
        stats_text = (
            f"Frames: {self.frame_count} | "
            f"Decoded: {self.decoded_frame_count} | "
            f"FPS: {self.current_fps}"
        )
        if self.last_resolution:
            stats_text += f" | {self.last_resolution[0]}x{self.last_resolution[1]}"
        self.stats_label.config(text=stats_text)
        
        if self.connected:
            detail_text = f"Receiving from {self.phone_type}"
            if self.decoded_frame_count > 0:
                decode_rate = (self.decoded_frame_count / self.frame_count) * 100
                detail_text += f" - {decode_rate:.1f}% decode success"
            else:
                detail_text += " - Attempting H.264 decode..."
            self.detail_label.config(text=detail_text)
    
    def update_display(self):
        """Update the video display"""
        try:
            try:
                image = self.frame_queue.get_nowait()
                self.info_label.place_forget()
                
                canvas_width = self.canvas.winfo_width()
                canvas_height = self.canvas.winfo_height()
                
                if canvas_width > 1 and canvas_height > 1:
                    scale_w = canvas_width / image.width
                    scale_h = canvas_height / image.height
                    scale = min(scale_w, scale_h)
                    
                    new_width = int(image.width * scale)
                    new_height = int(image.height * scale)
                    
                    resized_image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
                    photo = ImageTk.PhotoImage(resized_image)
                    
                    self.canvas.delete("all")
                    x = (canvas_width - new_width) // 2
                    y = (canvas_height - new_height) // 2
                    self.canvas.create_image(x, y, anchor=tk.NW, image=photo)
                    self.canvas.image = photo
                    
            except queue.Empty:
                pass
                
        except Exception as e:
            print(f"Error updating display: {e}")
        
        self.root.after(33, self.update_display)
    
    def on_failure(self):
        """Handle driver failure"""
        print("Driver failed!")
        self.connected = False
        self.driver_running = False
        self.root.after(0, self.update_status)
    
    def find_dongle(self):
        """Find a compatible USB dongle"""
        for device_info in DongleDriver.KNOWN_DEVICES:
            device = usb.core.find(
                idVendor=device_info['vendor_id'],
                idProduct=device_info['product_id']
            )
            if device:
                return device
        return None
    
    def start_driver(self):
        """Start the dongle driver"""
        print("Looking for USB dongle...")
        device = self.find_dongle()
        
        if not device:
            print("No compatible USB dongle found!")
            self.detail_label.config(
                text="Error: No USB dongle found. Please connect device and restart."
            )
            return False
        
        print(f"Found device: {device}")
        
        self.driver = DongleDriver()
        self.driver.on('message', self.on_message)
        self.driver.on('failure', self.on_failure)
        
        try:
            print("Initializing driver...")
            self.driver.initialize(device)
            
            config = DEFAULT_CONFIG
            
            print("Starting driver...")
            self.driver.start(config)
            
            print("Driver running!")
            self.driver_running = True
            
            self.detail_label.config(text="Driver started. Waiting for phone connection...")
            return True
            
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            self.detail_label.config(text=f"Error: {str(e)}")
            return False
    
    def on_closing(self):
        """Handle window close event"""
        print("Closing application...")
        self.driver_running = False
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
    print("CarPlay/Android Auto Video Viewer - Debug Version")
    print("=" * 60)
    
    # Check command line args
    save_frames = '--save-frames' in sys.argv or '-s' in sys.argv
    
    if save_frames:
        print("Frame saving enabled - raw H.264 frames will be saved to raw_frames/")
    print()
    
    app = VideoViewerApp(save_raw_frames=save_frames)
    app.run()


if __name__ == '__main__':
    print("\nUsage: python video_viewer_debug.py [--save-frames]")
    print("  --save-frames, -s : Save raw H.264 frames for debugging\n")
    main()