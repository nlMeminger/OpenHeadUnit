"""
Stats Tracker Module

Track video frame statistics, FPS, and performance metrics.
"""

import time
from typing import Optional, Dict, Any
from collections import deque


class StatsTracker:
    """
    Track statistics for video streaming
    
    Features:
    - Frame counting
    - FPS calculation
    - Decode success rate
    - Resolution tracking
    - Performance metrics
    """
    
    def __init__(self, fps_window: float = 1.0):
        """
        Initialize stats tracker
        
        Args:
            fps_window: Time window in seconds for FPS calculation
        """
        self.fps_window = fps_window
        
        # Frame counts
        self.total_frames = 0
        self.decoded_frames = 0
        self.dropped_frames = 0
        
        # FPS tracking
        self.frame_timestamps = deque()
        self.current_fps = 0
        self.last_fps_update = time.time()
        
        # Resolution tracking
        self.current_resolution: Optional[tuple] = None
        self.resolution_history = []
        
        # Timing
        self.start_time = time.time()
        self.last_frame_time = None
        
        # Data tracking
        self.total_bytes = 0
        self.last_frame_bytes = 0
    
    def record_frame(self, 
                     decoded: bool = True,
                     resolution: Optional[tuple] = None,
                     data_size: Optional[int] = None):
        """
        Record a new frame
        
        Args:
            decoded: Whether frame was successfully decoded
            resolution: Frame resolution (width, height)
            data_size: Frame data size in bytes
        """
        current_time = time.time()
        
        self.total_frames += 1
        if decoded:
            self.decoded_frames += 1
        else:
            self.dropped_frames += 1
        
        # Track FPS
        self.frame_timestamps.append(current_time)
        
        # Remove old timestamps outside the window
        cutoff_time = current_time - self.fps_window
        while self.frame_timestamps and self.frame_timestamps[0] < cutoff_time:
            self.frame_timestamps.popleft()
        
        # Update FPS periodically
        if current_time - self.last_fps_update >= 0.5:  # Update every 0.5 seconds
            self.current_fps = len(self.frame_timestamps) / self.fps_window
            self.last_fps_update = current_time
        
        # Track resolution
        if resolution:
            if resolution != self.current_resolution:
                self.resolution_history.append({
                    'resolution': resolution,
                    'timestamp': current_time,
                    'frame_number': self.total_frames
                })
                self.current_resolution = resolution
        
        # Track data size
        if data_size:
            self.total_bytes += data_size
            self.last_frame_bytes = data_size
        
        self.last_frame_time = current_time
    
    def get_fps(self) -> float:
        """Get current FPS"""
        return self.current_fps
    
    def get_decode_rate(self) -> float:
        """
        Get decode success rate as percentage
        
        Returns:
            Decode rate (0.0 - 100.0)
        """
        if self.total_frames == 0:
            return 0.0
        return (self.decoded_frames / self.total_frames) * 100.0
    
    def get_uptime(self) -> float:
        """Get uptime in seconds"""
        return time.time() - self.start_time
    
    def get_average_fps(self) -> float:
        """Get average FPS over entire session"""
        uptime = self.get_uptime()
        if uptime == 0:
            return 0.0
        return self.decoded_frames / uptime
    
    def get_bitrate(self) -> float:
        """
        Get average bitrate in Mbps
        
        Returns:
            Bitrate in megabits per second
        """
        uptime = self.get_uptime()
        if uptime == 0:
            return 0.0
        bits = self.total_bytes * 8
        return (bits / uptime) / 1_000_000  # Convert to Mbps
    
    def get_stats_dict(self) -> Dict[str, Any]:
        """
        Get all statistics as a dictionary
        
        Returns:
            Dictionary with all stats
        """
        return {
            'total_frames': self.total_frames,
            'decoded_frames': self.decoded_frames,
            'dropped_frames': self.dropped_frames,
            'current_fps': self.current_fps,
            'average_fps': self.get_average_fps(),
            'decode_rate': self.get_decode_rate(),
            'current_resolution': self.current_resolution,
            'uptime': self.get_uptime(),
            'total_bytes': self.total_bytes,
            'last_frame_bytes': self.last_frame_bytes,
            'bitrate_mbps': self.get_bitrate(),
        }
    
    def get_stats_string(self) -> str:
        """
        Get formatted statistics string
        
        Returns:
            Human-readable stats string
        """
        stats = self.get_stats_dict()
        
        lines = [
            f"Frames: {stats['total_frames']} ({stats['decoded_frames']} decoded, {stats['dropped_frames']} dropped)",
            f"FPS: {stats['current_fps']:.1f} (avg: {stats['average_fps']:.1f})",
            f"Decode Rate: {stats['decode_rate']:.1f}%",
        ]
        
        if stats['current_resolution']:
            w, h = stats['current_resolution']
            lines.append(f"Resolution: {w}x{h}")
        
        if stats['bitrate_mbps'] > 0:
            lines.append(f"Bitrate: {stats['bitrate_mbps']:.2f} Mbps")
        
        lines.append(f"Uptime: {stats['uptime']:.1f}s")
        
        return "\n".join(lines)
    
    def reset(self):
        """Reset all statistics"""
        self.total_frames = 0
        self.decoded_frames = 0
        self.dropped_frames = 0
        self.frame_timestamps.clear()
        self.current_fps = 0
        self.last_fps_update = time.time()
        self.current_resolution = None
        self.resolution_history.clear()
        self.start_time = time.time()
        self.last_frame_time = None
        self.total_bytes = 0
        self.last_frame_bytes = 0


class PerformanceMonitor:
    """
    Monitor performance of different operations
    
    Useful for identifying bottlenecks and optimization opportunities.
    """
    
    def __init__(self):
        self.operation_times = {}  # operation_name -> list of durations
        self.operation_counts = {}  # operation_name -> count
    
    def start_operation(self, name: str) -> float:
        """
        Start timing an operation
        
        Args:
            name: Operation name
            
        Returns:
            Start timestamp
        """
        return time.time()
    
    def end_operation(self, name: str, start_time: float):
        """
        End timing an operation
        
        Args:
            name: Operation name
            start_time: Start timestamp from start_operation
        """
        duration = time.time() - start_time
        
        if name not in self.operation_times:
            self.operation_times[name] = []
            self.operation_counts[name] = 0
        
        self.operation_times[name].append(duration)
        self.operation_counts[name] += 1
        
        # Keep only last 100 samples to avoid memory growth
        if len(self.operation_times[name]) > 100:
            self.operation_times[name].pop(0)
    
    def get_average_time(self, name: str) -> Optional[float]:
        """
        Get average time for an operation
        
        Args:
            name: Operation name
            
        Returns:
            Average duration in seconds, or None if no data
        """
        if name not in self.operation_times or not self.operation_times[name]:
            return None
        return sum(self.operation_times[name]) / len(self.operation_times[name])
    
    def get_total_time(self, name: str) -> float:
        """
        Get total time spent on an operation
        
        Args:
            name: Operation name
            
        Returns:
            Total duration in seconds
        """
        if name not in self.operation_times:
            return 0.0
        return sum(self.operation_times[name])
    
    def get_count(self, name: str) -> int:
        """
        Get count of an operation
        
        Args:
            name: Operation name
            
        Returns:
            Number of times operation was performed
        """
        return self.operation_counts.get(name, 0)
    
    def get_report(self) -> str:
        """
        Get performance report
        
        Returns:
            Formatted performance report string
        """
        if not self.operation_times:
            return "No performance data"
        
        lines = ["Performance Report:", "=" * 60]
        
        for name in sorted(self.operation_times.keys()):
            avg_time = self.get_average_time(name)
            total_time = self.get_total_time(name)
            count = self.get_count(name)
            
            lines.append(f"{name}:")
            lines.append(f"  Count: {count}")
            lines.append(f"  Avg Time: {avg_time*1000:.2f} ms")
            lines.append(f"  Total Time: {total_time:.2f} s")
        
        lines.append("=" * 60)
        return "\n".join(lines)
    
    def reset(self):
        """Reset all performance data"""
        self.operation_times.clear()
        self.operation_counts.clear()
