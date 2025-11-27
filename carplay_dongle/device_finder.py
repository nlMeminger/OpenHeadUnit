"""
Device Finder Module

Discovers and manages USB dongles for CarPlay/Android Auto.
Provides device enumeration and automatic detection.
"""

import usb.core
from typing import Optional, List, Dict


class DeviceInfo:
    """USB device information"""
    
    def __init__(self, vendor_id: int, product_id: int, description: str = ""):
        self.vendor_id = vendor_id
        self.product_id = product_id
        self.description = description
    
    def __str__(self):
        desc = f" ({self.description})" if self.description else ""
        return f"VID:0x{self.vendor_id:04x} PID:0x{self.product_id:04x}{desc}"


class DeviceFinder:
    """
    Find and manage USB dongles for CarPlay/Android Auto
    
    Supports automatic detection of known devices and custom device registration.
    """
    
    # Known CarPlay/Android Auto dongles
    KNOWN_DEVICES = [
        DeviceInfo(0x1314, 0x1520, "CarPlay Dongle Type A"),
        DeviceInfo(0x1314, 0x1521, "CarPlay Dongle Type B"),
    ]
    
    def __init__(self, custom_devices: Optional[List[DeviceInfo]] = None):
        """
        Initialize device finder
        
        Args:
            custom_devices: Additional device IDs to search for
        """
        self.devices = self.KNOWN_DEVICES.copy()
        if custom_devices:
            self.devices.extend(custom_devices)
    
    def add_device(self, vendor_id: int, product_id: int, description: str = ""):
        """
        Add a custom device to search for
        
        Args:
            vendor_id: USB Vendor ID
            product_id: USB Product ID
            description: Optional device description
        """
        device_info = DeviceInfo(vendor_id, product_id, description)
        self.devices.append(device_info)
        print(f"Added device: {device_info}")
    
    def find_device(self) -> Optional[usb.core.Device]:
        """
        Find a compatible USB dongle
        
        Returns:
            USB device if found, None otherwise
        """
        for device_info in self.devices:
            device = usb.core.find(
                idVendor=device_info.vendor_id,
                idProduct=device_info.product_id
            )
            if device:
                print(f"Found device: {device_info}")
                return device
        return None
    
    def find_all_devices(self) -> List[usb.core.Device]:
        """
        Find all compatible USB dongles
        
        Returns:
            List of USB devices found
        """
        found_devices = []
        for device_info in self.devices:
            device = usb.core.find(
                idVendor=device_info.vendor_id,
                idProduct=device_info.product_id
            )
            if device:
                found_devices.append(device)
                print(f"Found device: {device_info}")
        return found_devices
    
    def list_known_devices(self):
        """Print list of known devices"""
        print("\nKnown CarPlay/Android Auto Devices:")
        print("=" * 60)
        for i, device_info in enumerate(self.devices, 1):
            print(f"{i}. {device_info}")
        print("=" * 60)
    
    @staticmethod
    def list_all_usb_devices():
        """List all USB devices connected to the system"""
        print("\nAll USB Devices:")
        print("=" * 60)
        
        devices = usb.core.find(find_all=True)
        device_list = list(devices)
        
        if not device_list:
            print("No USB devices found")
            return
        
        for device in device_list:
            try:
                print(f"VID:0x{device.idVendor:04x} PID:0x{device.idProduct:04x}")
                try:
                    print(f"  Manufacturer: {usb.util.get_string(device, device.iManufacturer)}")
                except:
                    pass
                try:
                    print(f"  Product: {usb.util.get_string(device, device.iProduct)}")
                except:
                    pass
                print()
            except:
                print(f"Device at bus {device.bus} address {device.address}")
                print()
        
        print("=" * 60)
    
    @staticmethod
    def get_device_info_string(device: usb.core.Device) -> str:
        """
        Get detailed information string for a USB device
        
        Args:
            device: USB device
            
        Returns:
            Formatted device information string
        """
        info_lines = [
            f"USB Device Information:",
            f"  Vendor ID: 0x{device.idVendor:04x}",
            f"  Product ID: 0x{device.idProduct:04x}",
            f"  Bus: {device.bus}",
            f"  Address: {device.address}",
        ]
        
        try:
            manufacturer = usb.util.get_string(device, device.iManufacturer)
            info_lines.append(f"  Manufacturer: {manufacturer}")
        except:
            pass
        
        try:
            product = usb.util.get_string(device, device.iProduct)
            info_lines.append(f"  Product: {product}")
        except:
            pass
        
        try:
            serial = usb.util.get_string(device, device.iSerialNumber)
            info_lines.append(f"  Serial: {serial}")
        except:
            pass
        
        return "\n".join(info_lines)


def find_carplay_dongle() -> Optional[usb.core.Device]:
    """
    Convenience function to find a CarPlay/Android Auto dongle
    
    Returns:
        USB device if found, None otherwise
    """
    finder = DeviceFinder()
    return finder.find_device()


def main():
    """Test the device finder"""
    print("CarPlay/Android Auto Device Finder")
    print("=" * 60)
    
    finder = DeviceFinder()
    
    # List known devices
    finder.list_known_devices()
    
    # Search for devices
    print("\nSearching for compatible devices...")
    device = finder.find_device()
    
    if device:
        print("\n✓ Found compatible device!")
        print(DeviceFinder.get_device_info_string(device))
    else:
        print("\n✗ No compatible devices found")
        print("\nListing all USB devices for debugging:")
        DeviceFinder.list_all_usb_devices()


if __name__ == '__main__':
    main()
