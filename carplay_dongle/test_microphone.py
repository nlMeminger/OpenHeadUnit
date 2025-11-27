#!/usr/bin/env python3
"""
Microphone Test Script

Tests if your microphone and PyAudio are working correctly.
"""

import pyaudio
import numpy as np
import wave
import sys

def test_microphone():
    """Test microphone capture"""
    print("=" * 60)
    print("MICROPHONE TEST")
    print("=" * 60)
    
    # Initialize PyAudio
    p = pyaudio.PyAudio()
    
    print(f"\nPyAudio version: {pyaudio.get_portaudio_version()}")
    print(f"PortAudio version text: {pyaudio.get_portaudio_version_text()}")
    
    # List all audio devices
    print("\n" + "=" * 60)
    print("AVAILABLE AUDIO DEVICES")
    print("=" * 60)
    
    device_count = p.get_device_count()
    print(f"\nFound {device_count} audio devices:\n")
    
    input_devices = []
    output_devices = []
    
    for i in range(device_count):
        info = p.get_device_info_by_index(i)
        print(f"Device {i}: {info['name']}")
        print(f"  Max Input Channels: {info['maxInputChannels']}")
        print(f"  Max Output Channels: {info['maxOutputChannels']}")
        print(f"  Default Sample Rate: {info['defaultSampleRate']}")
        
        if info['maxInputChannels'] > 0:
            input_devices.append(i)
        if info['maxOutputChannels'] > 0:
            output_devices.append(i)
        print()
    
    # Get default devices
    try:
        default_input = p.get_default_input_device_info()
        print(f"Default INPUT device: [{default_input['index']}] {default_input['name']}")
    except:
        print("No default input device found!")
        default_input = None
    
    try:
        default_output = p.get_default_output_device_info()
        print(f"Default OUTPUT device: [{default_output['index']}] {default_output['name']}")
    except:
        print("No default output device found!")
    
    print()
    
    if not input_devices:
        print("❌ ERROR: No input devices found!")
        p.terminate()
        return False
    
    if default_input is None:
        print("❌ ERROR: No default input device!")
        p.terminate()
        return False
    
    # Test recording
    print("=" * 60)
    print("RECORDING TEST")
    print("=" * 60)
    print("\nAttempting to record 3 seconds of audio...")
    print("Please make some noise (speak, clap, etc.)\n")
    
    try:
        # Open stream
        stream = p.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=16000,
            input=True,
            frames_per_buffer=1024
        )
        
        print("✓ Stream opened successfully")
        print("Recording...")
        
        frames = []
        for i in range(0, int(16000 / 1024 * 3)):  # 3 seconds
            data = stream.read(1024, exception_on_overflow=False)
            frames.append(data)
            
            # Show progress
            if i % 10 == 0:
                print(".", end="", flush=True)
        
        print("\n✓ Recording complete!")
        
        # Close stream
        stream.stop_stream()
        stream.close()
        
        # Convert to numpy and check level
        audio_data = b''.join(frames)
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        
        print(f"\nAudio statistics:")
        print(f"  Samples captured: {len(audio_array)}")
        print(f"  Min value: {audio_array.min()}")
        print(f"  Max value: {audio_array.max()}")
        print(f"  Mean: {audio_array.mean():.2f}")
        print(f"  Std dev: {audio_array.std():.2f}")
        
        # Check if we captured any sound
        if audio_array.std() < 10:
            print("\n⚠ WARNING: Very low audio levels detected!")
            print("  The microphone may not be capturing sound properly.")
            print("  Possible issues:")
            print("  - Microphone is muted")
            print("  - Wrong input device selected")
            print("  - Microphone permissions not granted")
        else:
            print("\n✓ Audio levels look good!")
        
        # Save to file
        output_file = "mic_test.wav"
        wf = wave.open(output_file, 'wb')
        wf.setnchannels(1)
        wf.setsampwidth(p.get_sample_size(pyaudio.paInt16))
        wf.setframerate(16000)
        wf.writeframes(audio_data)
        wf.close()
        
        print(f"\n✓ Recording saved to: {output_file}")
        print("  You can play this file to verify the recording worked.")
        
        p.terminate()
        return True
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        p.terminate()
        return False

def main():
    """Main entry point"""
    success = test_microphone()
    
    print("\n" + "=" * 60)
    if success:
        print("✓ Microphone test PASSED")
        print("\nYour microphone is working with PyAudio.")
        print("If the CarPlay viewer still doesn't work, the issue is likely")
        print("with how the audio data is being sent to the device.")
    else:
        print("❌ Microphone test FAILED")
        print("\nTroubleshooting steps:")
        print("1. Check microphone is not muted")
        print("2. Grant microphone permissions to terminal/Python")
        print("3. Test microphone with other applications")
        print("4. Try selecting a different input device")
    print("=" * 60)

if __name__ == '__main__':
    main()