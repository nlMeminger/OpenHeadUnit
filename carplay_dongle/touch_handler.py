"""
Touch Handler Module

Manages touch input for CarPlay/Android Auto displays.
Handles coordinate conversion and touch event dispatching.
"""

from typing import Optional, Callable, Tuple
from enum import IntEnum


class TouchAction(IntEnum):
    """Touch action types"""
    Down = 14
    Move = 15
    Up = 16


class TouchHandler:
    """
    Handle touch input for CarPlay/Android Auto displays
    
    Features:
    - Coordinate transformation (screen to device coordinates)
    - Touch event tracking (down, move, up)
    - Click vs drag detection
    """
    
    def __init__(self, send_callback: Optional[Callable] = None):
        """
        Initialize touch handler
        
        Args:
            send_callback: Function to send touch events
                          Should accept (x: float, y: float, action: TouchAction)
        """
        self.send_callback = send_callback
        self.touch_active = False
        self.last_touch_pos: Optional[Tuple[float, float]] = None
        
        # Display information for coordinate conversion
        self.video_size: Optional[Tuple[int, int]] = None  # Original video size
        self.display_size: Optional[Tuple[int, int]] = None  # Scaled display size
        self.display_offset: Optional[Tuple[int, int]] = None  # Display offset in canvas
    
    def set_display_info(self, 
                        video_size: Tuple[int, int],
                        display_size: Tuple[int, int],
                        display_offset: Tuple[int, int]):
        """
        Update display information for coordinate conversion
        
        Args:
            video_size: Original video dimensions (width, height)
            display_size: Scaled display dimensions (width, height)
            display_offset: Display offset in canvas (x, y)
        """
        self.video_size = video_size
        self.display_size = display_size
        self.display_offset = display_offset
    
    def canvas_to_normalized(self, canvas_x: int, canvas_y: int) -> Optional[Tuple[float, float]]:
        """
        Convert canvas coordinates to normalized device coordinates (0.0 - 1.0)
        
        Args:
            canvas_x: X coordinate in canvas
            canvas_y: Y coordinate in canvas
            
        Returns:
            Tuple of (x, y) in range 0.0-1.0, or None if conversion not possible
        """
        if not all([self.video_size, self.display_size, self.display_offset]):
            return None
        
        display_width, display_height = self.display_size
        offset_x, offset_y = self.display_offset
        
        # Check if point is within display area
        if (canvas_x < offset_x or canvas_x > offset_x + display_width or
            canvas_y < offset_y or canvas_y > offset_y + display_height):
            return None
        
        # Convert to image coordinates
        img_x = canvas_x - offset_x
        img_y = canvas_y - offset_y
        
        # Normalize to 0.0 - 1.0 range
        normalized_x = img_x / display_width
        normalized_y = img_y / display_height
        
        # Clamp to valid range
        normalized_x = max(0.0, min(1.0, normalized_x))
        normalized_y = max(0.0, min(1.0, normalized_y))
        
        return (normalized_x, normalized_y)
    
    def send_touch(self, x: float, y: float, action: TouchAction):
        """
        Send a touch event
        
        Args:
            x: Normalized X coordinate (0.0 - 1.0)
            y: Normalized Y coordinate (0.0 - 1.0)
            action: Touch action type
        """
        if self.send_callback:
            self.send_callback(x, y, action)
            self.last_touch_pos = (x, y)
    
    def handle_down(self, canvas_x: int, canvas_y: int) -> bool:
        """
        Handle touch down event
        
        Args:
            canvas_x: X coordinate in canvas
            canvas_y: Y coordinate in canvas
            
        Returns:
            True if event was handled, False otherwise
        """
        coords = self.canvas_to_normalized(canvas_x, canvas_y)
        if not coords:
            return False
        
        x, y = coords
        self.send_touch(x, y, TouchAction.Down)
        self.touch_active = True
        return True
    
    def handle_move(self, canvas_x: int, canvas_y: int) -> bool:
        """
        Handle touch move event
        
        Args:
            canvas_x: X coordinate in canvas
            canvas_y: Y coordinate in canvas
            
        Returns:
            True if event was handled, False otherwise
        """
        if not self.touch_active:
            return False
        
        coords = self.canvas_to_normalized(canvas_x, canvas_y)
        if not coords:
            return False
        
        x, y = coords
        self.send_touch(x, y, TouchAction.Move)
        return True
    
    def handle_up(self, canvas_x: int, canvas_y: int) -> bool:
        """
        Handle touch up event
        
        Args:
            canvas_x: X coordinate in canvas
            canvas_y: Y coordinate in canvas
            
        Returns:
            True if event was handled, False otherwise
        """
        if not self.touch_active:
            return False
        
        coords = self.canvas_to_normalized(canvas_x, canvas_y)
        if not coords:
            # Still send up event at last known position
            if self.last_touch_pos:
                x, y = self.last_touch_pos
                self.send_touch(x, y, TouchAction.Up)
            self.touch_active = False
            return False
        
        x, y = coords
        self.send_touch(x, y, TouchAction.Up)
        self.touch_active = False
        return True
    
    def cancel_touch(self):
        """Cancel current touch (e.g., when display loses focus)"""
        if self.touch_active and self.last_touch_pos:
            x, y = self.last_touch_pos
            self.send_touch(x, y, TouchAction.Up)
        self.touch_active = False
        self.last_touch_pos = None
    
    def is_active(self) -> bool:
        """Check if touch is currently active"""
        return self.touch_active


class MultiTouchAction(IntEnum):
    """Multi-touch action types (for future multi-touch support)"""
    Down = 1
    Move = 2
    Up = 0


class MultiTouchHandler(TouchHandler):
    """
    Extended touch handler with multi-touch support
    
    Note: Most CarPlay/Android Auto devices only support single touch,
    but this class is provided for devices that support multi-touch.
    """
    
    def __init__(self, send_multitouch_callback: Optional[Callable] = None):
        """
        Initialize multi-touch handler
        
        Args:
            send_multitouch_callback: Function to send multi-touch events
                                     Should accept list of touch data dicts
        """
        super().__init__()
        self.send_multitouch_callback = send_multitouch_callback
        self.active_touches = {}  # touch_id -> (x, y)
    
    def handle_multitouch_down(self, touch_id: int, canvas_x: int, canvas_y: int) -> bool:
        """Handle multi-touch down event"""
        coords = self.canvas_to_normalized(canvas_x, canvas_y)
        if not coords:
            return False
        
        x, y = coords
        self.active_touches[touch_id] = (x, y)
        
        if self.send_multitouch_callback:
            touch_data = [
                {'x': x, 'y': y, 'action': MultiTouchAction.Down}
                for touch_id, (x, y) in self.active_touches.items()
            ]
            self.send_multitouch_callback(touch_data)
        
        return True
    
    def handle_multitouch_move(self, touch_id: int, canvas_x: int, canvas_y: int) -> bool:
        """Handle multi-touch move event"""
        if touch_id not in self.active_touches:
            return False
        
        coords = self.canvas_to_normalized(canvas_x, canvas_y)
        if not coords:
            return False
        
        x, y = coords
        self.active_touches[touch_id] = (x, y)
        
        if self.send_multitouch_callback:
            touch_data = [
                {'x': x, 'y': y, 'action': MultiTouchAction.Move}
                for touch_id, (x, y) in self.active_touches.items()
            ]
            self.send_multitouch_callback(touch_data)
        
        return True
    
    def handle_multitouch_up(self, touch_id: int, canvas_x: int, canvas_y: int) -> bool:
        """Handle multi-touch up event"""
        if touch_id not in self.active_touches:
            return False
        
        coords = self.canvas_to_normalized(canvas_x, canvas_y)
        if coords:
            x, y = coords
            self.active_touches[touch_id] = (x, y)
        
        if self.send_multitouch_callback:
            touch_data = [
                {'x': x, 'y': y, 'action': MultiTouchAction.Up}
                for tid, (x, y) in self.active_touches.items()
                if tid == touch_id
            ]
            self.send_multitouch_callback(touch_data)
        
        del self.active_touches[touch_id]
        return True
