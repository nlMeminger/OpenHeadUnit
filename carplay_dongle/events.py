from typing import Callable, Dict, List


class EventEmitter:
    """Simple event emitter implementation similar to Node.js EventEmitter"""
    
    def __init__(self):
        self._events: Dict[str, List[Callable]] = {}
    
    def on(self, event: str, listener: Callable):
        """Add an event listener"""
        if event not in self._events:
            self._events[event] = []
        self._events[event].append(listener)
        return self
    
    def emit(self, event: str, *args, **kwargs):
        """Emit an event to all listeners"""
        if event in self._events:
            for listener in self._events[event]:
                listener(*args, **kwargs)
    
    def remove_listener(self, event: str, listener: Callable):
        """Remove a specific listener"""
        if event in self._events:
            try:
                self._events[event].remove(listener)
            except ValueError:
                pass
    
    def remove_all_listeners(self, event: str = None):
        """Remove all listeners for an event, or all events if none specified"""
        if event:
            self._events[event] = []
        else:
            self._events.clear()
