#!/usr/bin/env python3
"""
Diagnostic version of Car Radio UI
Helps identify why you might be seeing a white screen
"""
import sys
from PyQt5.QtCore import QUrl, Qt, pyqtSlot, QObject
from PyQt5.QtWidgets import QApplication
from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEnginePage
from PyQt5.QtWebChannel import QWebChannel
import os

class DebugWebPage(QWebEnginePage):
    """Custom web page that prints console messages"""
    def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
        print(f"[JS Console] Line {lineNumber}: {message}")

class PythonBridge(QObject):
    """Bridge to expose Python methods to JavaScript"""
    
    @pyqtSlot(str)
    def openApp(self, appName):
        print(f"[Python] ✓ Opening {appName}!")
    
    @pyqtSlot(int)
    def setVolume(self, volume):
        print(f"[Python] ✓ Setting volume to {volume}")
    
    @pyqtSlot(int)
    def setBrightness(self, brightness):
        print(f"[Python] ✓ Setting brightness to {brightness}%")
    
    @pyqtSlot()
    def powerOff(self):
        print("[Python] ✓ Powering off system...")
        QApplication.quit()

class CarRadio(QWebEngineView):
    def __init__(self):
        super().__init__()
        
        # Use debug page to see JavaScript console
        debug_page = DebugWebPage(self)
        self.setPage(debug_page)
        
        # Remove window title bar and make frameless
        self.setWindowFlags(Qt.FramelessWindowHint)
        
        # Set window size to 800x480
        self.resize(800, 480)
        
        # Create the bridge object
        self.bridge = PythonBridge()
        
        # Set up the web channel
        self.channel = QWebChannel()
        self.channel.registerObject('pyBridge', self.bridge)
        self.page().setWebChannel(self.channel)
        
        # Get the HTML file path
        current_working_directory = os.getcwd()
        html_path = os.path.join(current_working_directory, 'car_radio_ui.html')
        
        print("\n" + "="*60)
        print("DIAGNOSTIC INFORMATION")
        print("="*60)
        print(f"Current directory: {current_working_directory}")
        print(f"Looking for HTML at: {html_path}")
        print(f"HTML file exists: {os.path.exists(html_path)}")
        
        if os.path.exists(html_path):
            print(f"HTML file size: {os.path.getsize(html_path)} bytes")
        
        # List files in current directory
        print("\nFiles in current directory:")
        for f in os.listdir(current_working_directory):
            if f.endswith('.html') or f.endswith('.py'):
                print(f"  - {f}")
        
        print("="*60 + "\n")
        
        # Check if file exists
        if not os.path.exists(html_path):
            print(f"❌ ERROR: Could not find {html_path}")
            print("Please make sure car_radio_ui.html is in the same directory as this script.")
            sys.exit(1)
        
        # Convert the file path to a QUrl
        html_url = QUrl.fromLocalFile(html_path)
        print(f"Loading URL: {html_url.toString()}")
        
        # Connect signals to debug loading
        self.loadStarted.connect(lambda: print("[WebEngine] Load started..."))
        self.loadProgress.connect(lambda p: print(f"[WebEngine] Load progress: {p}%"))
        self.loadFinished.connect(self.on_load_finished)
        
        self.load(html_url)
        
        print("\n[Python] Python bridge initialized and ready!")
        print("[Python] Watch for JavaScript console messages above")
        print("[Python] If you see a white screen, check the messages above\n")
    
    def on_load_finished(self, success):
        if success:
            print("[WebEngine] ✓ Page loaded successfully!")
        else:
            print("[WebEngine] ❌ Page failed to load!")
            print("[WebEngine] This is why you see a white screen.")
            print("\nPossible causes:")
            print("1. HTML file has syntax errors")
            print("2. Resources (images) are missing")
            print("3. JavaScript errors preventing render")
            print("\nTrying to get more info...")

def main():
    app = QApplication(sys.argv)
    
    print("\n" + "="*60)
    print("CAR RADIO UI - DIAGNOSTIC MODE")
    print("="*60)
    print("This version will show detailed debug information")
    print("to help identify why you might see a white screen.")
    print("="*60 + "\n")
    
    radio = CarRadio()
    radio.show()
    
    print("[Python] Window displayed. Check the window and this terminal.")
    print("[Python] Press Ctrl+C in this terminal to quit.\n")
    
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()