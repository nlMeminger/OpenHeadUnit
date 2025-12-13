#!/usr/bin/env python3
import os

def get_backlight_devices():
    """Get list of available backlight devices with their current settings"""
    backlight_path = "/sys/class/backlight"
    
    # Check if backlight directory exists
    if not os.path.exists(backlight_path):
        print("No backlight devices found")
        return []
    
    # List all backlight devices
    devices = os.listdir(backlight_path)
    return_devices = []
    
    for device in devices:
        device_path = os.path.join(backlight_path, device)
        temp_device = {}
        
        # Read current and max brightness
        try:
            with open(os.path.join(device_path, "brightness")) as f:
                current = f.read().strip()
            with open(os.path.join(device_path, "max_brightness")) as f:
                max_brightness = f.read().strip()
            
            temp_device['name'] = device
            temp_device['path'] = device_path
            temp_device['current_brightness'] = int(current)
            temp_device['max_brightness'] = int(max_brightness)
            return_devices.append(temp_device)
        except Exception as e:
            print(f"Error reading device {device}: {e}")
            continue
    
    return return_devices


def set_backlight_brightness(percentage):
    """
    Set screen brightness to a percentage (0-100)
    Returns True if successful, False otherwise
    """
    try:
        # Get available devices
        devices = get_backlight_devices()
        
        if not devices:
            print("No backlight devices available")
            return False
        
        # Use the first available device
        device = devices[0]
        brightness_file = os.path.join(device['path'], "brightness")
        
        # Calculate brightness value based on percentage
        max_brightness = device['max_brightness']
        brightness_value = int((percentage / 100.0) * max_brightness)
        
        # Clamp value between 0 and max
        brightness_value = max(0, min(brightness_value, max_brightness))
        
        print(f"Setting brightness to {percentage}% ({brightness_value}/{max_brightness}) on {device['name']}")
        
        # Write to brightness file
        with open(brightness_file, 'w') as f:
            f.write(str(brightness_value))
        
        return True
        
    except PermissionError:
        print("Permission denied: Run with sudo or set proper permissions")
        print("You can add a udev rule to allow brightness control without sudo:")
        print('  sudo sh -c "echo \'SUBSYSTEM==\\"backlight\\", ACTION==\\"add\\", RUN+=\\"/bin/chmod 666 /sys/class/backlight/%k/brightness\\"\' > /etc/udev/rules.d/backlight.rules"')
        return False
    except Exception as e:
        print(f"Error setting brightness: {e}")
        import traceback
        traceback.print_exc()
        return False


def get_current_brightness_percentage():
    """Get current brightness as a percentage (0-100)"""
    try:
        devices = get_backlight_devices()
        if not devices:
            return 50  # Default fallback
        
        device = devices[0]
        current = device['current_brightness']
        max_val = device['max_brightness']
        
        percentage = int((current / max_val) * 100)
        return percentage
        
    except Exception as e:
        print(f"Error getting current brightness: {e}")
        return 50  # Default fallback