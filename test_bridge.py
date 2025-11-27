#!/usr/bin/env python3
"""
Test script to verify QWebChannel bridge functionality
Run this to ensure Python-JavaScript communication is working
"""
import sys
from PyQt5.QtCore import QUrl, Qt, pyqtSlot, QObject
from PyQt5.QtWidgets import QApplication
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtWebChannel import QWebChannel

class TestBridge(QObject):
    """Simple test bridge to verify functionality"""
    
    @pyqtSlot(str)
    def testMethod(self, message):
        print(f"✓ Python received message from JavaScript: '{message}'")
        print("✓ QWebChannel bridge is working correctly!")
        return "Success!"
    
    @pyqtSlot(int, int, result=int)
    def addNumbers(self, a, b):
        result = a + b
        print(f"✓ Python calculated: {a} + {b} = {result}")
        return result

class TestWindow(QWebEngineView):
    def __init__(self):
        super().__init__()
        
        self.setWindowTitle("QWebChannel Test")
        self.resize(600, 400)
        
        # Create and register bridge
        self.bridge = TestBridge()
        self.channel = QWebChannel()
        self.channel.registerObject('testBridge', self.bridge)
        self.page().setWebChannel(self.channel)
        
        # Create test HTML
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Bridge Test</title>
            <script src="qrc:///qtwebchannel/qwebchannel.js"></script>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 40px;
                    background: #1e293b;
                    color: #f8fafc;
                }
                button {
                    padding: 12px 24px;
                    margin: 10px;
                    font-size: 16px;
                    background: #3b82f6;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                }
                button:hover {
                    background: #2563eb;
                }
                #output {
                    margin-top: 20px;
                    padding: 20px;
                    background: #334155;
                    border-radius: 8px;
                    min-height: 100px;
                }
                .success {
                    color: #86efac;
                }
                .error {
                    color: #fca5a5;
                }
            </style>
        </head>
        <body>
            <h1>🔧 QWebChannel Bridge Test</h1>
            <p>Click the buttons below to test Python-JavaScript communication:</p>
            
            <button onclick="testBasicCall()">Test 1: Basic Call</button>
            <button onclick="testWithParameter()">Test 2: Send Message</button>
            <button onclick="testMath()">Test 3: Math Function</button>
            
            <div id="output">
                <p><i>Waiting for tests...</i></p>
            </div>
            
            <script>
                let testBridge = null;
                let output = document.getElementById('output');
                
                function log(message, isSuccess = true) {
                    const color = isSuccess ? 'success' : 'error';
                    output.innerHTML += `<p class="${color}">✓ ${message}</p>`;
                    console.log(message);
                }
                
                function error(message) {
                    output.innerHTML += `<p class="error">✗ ${message}</p>`;
                    console.error(message);
                }
                
                // Initialize the bridge
                new QWebChannel(qt.webChannelTransport, function(channel) {
                    testBridge = channel.objects.testBridge;
                    log("JavaScript connected to Python bridge!");
                    output.innerHTML = '<p class="success">✓ Bridge initialized successfully!</p>';
                });
                
                function testBasicCall() {
                    if (!testBridge) {
                        error("Bridge not ready!");
                        return;
                    }
                    log("Sending test message to Python...");
                    testBridge.testMethod("Hello from JavaScript!");
                }
                
                function testWithParameter() {
                    if (!testBridge) {
                        error("Bridge not ready!");
                        return;
                    }
                    const message = "This is a test message with timestamp: " + new Date().toLocaleTimeString();
                    log("Sending: " + message);
                    testBridge.testMethod(message);
                }
                
                function testMath() {
                    if (!testBridge) {
                        error("Bridge not ready!");
                        return;
                    }
                    const a = Math.floor(Math.random() * 100);
                    const b = Math.floor(Math.random() * 100);
                    log(`Asking Python to calculate: ${a} + ${b}`);
                    testBridge.addNumbers(a, b);
                }
            </script>
        </body>
        </html>
        """
        
        self.setHtml(html)
        print("\n" + "="*60)
        print("QWebChannel Bridge Test Started")
        print("="*60)
        print("Instructions:")
        print("1. Wait for the window to load")
        print("2. Click the test buttons")
        print("3. Watch this terminal for Python output")
        print("4. Check the browser window for JavaScript output")
        print("="*60 + "\n")

def main():
    app = QApplication(sys.argv)
    window = TestWindow()
    window.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()