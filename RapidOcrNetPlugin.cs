using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace RapidOcrNetPlugin
{
    [ComVisible(true)]
    [Guid("12345678-1234-1234-1234-123456789012")]
    public class RapidOcrNetPlugin
    {
        private static readonly string LogFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "AAAFinalsApp", "rapidocrnet_plugin.log");
        private static bool isInitialized = false;
        private static bool lobbyEventProcessed = false;

        // OCR.space API configuration
        private const string OcrSpaceApiKey = "K85859077088957"; // Replace with your actual key
        private const string OcrSpaceApiUrl = "https://api.ocr.space/parse/image";
        private const string OutputFolder = "curruntoocrprocess";
        private const string ProcessLogFile = "process_log.txt";

        // Username regions for The Finals (scaled for 1920x1080)
        private static readonly List<Rectangle> UsernameRegions = new List<Rectangle>
        {
            new Rectangle(765, 285, 478, 34),   // Box 0: Top player
            new Rectangle(783, 161, 474, 31),   // Box 1: Middle player  
            new Rectangle(791, 68, 384, 33)     // Box 2: Bottom player
        };

        // P/Invoke declarations for window capture
        [DllImport("user32.dll")]
        private static extern IntPtr GetWindowRect(IntPtr hWnd, ref RECT rect);

        [DllImport("user32.dll")]
        private static extern IntPtr GetClientRect(IntPtr hWnd, ref RECT rect);

        [DllImport("user32.dll")]
        private static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);

        [DllImport("user32.dll")]
        private static extern bool SetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);

        [DllImport("user32.dll")]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("user32.dll")]
        private static extern IntPtr FindWindowEx(IntPtr hWndParent, IntPtr hWndChildAfter, string lpszClass, string lpszWindow);

        [DllImport("user32.dll")]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct WINDOWPLACEMENT
        {
            public int length;
            public int flags;
            public int showCmd;
            public POINT ptMinPosition;
            public POINT ptMaxPosition;
            public RECT rcNormalPosition;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int x;
            public int y;
        }

        private const int SW_HIDE = 0;
        private const int SW_SHOWNORMAL = 1;
        private const int SW_SHOWMINIMIZED = 2;
        private const int SW_SHOWMAXIMIZED = 3;
        private const int SW_SHOWNOACTIVATE = 4;
        private const int SW_SHOW = 5;
        private const int SW_MINIMIZE = 6;
        private const int SW_SHOWMINNOACTIVE = 7;
        private const int SW_SHOWNA = 8;
        private const int SW_RESTORE = 9;
        private const int SW_SHOWDEFAULT = 10;
        private const int SW_FORCEMINIMIZE = 11;

        public RapidOcrNetPlugin()
        {
            try
            {
                Log("=== RapidOcrNetPlugin Constructor ===");
                Log("Plugin DLL version: 2024-07-06-ocrspace-migration-v2-game-window-capture");
                
                // Initialize OCR.space plugin
                InitializeOcrSpace();
                
                isInitialized = true;
                Log("Plugin initialized successfully!");
            }
            catch (Exception ex)
            {
                Log(string.Format("Constructor error: {0}", ex.Message), "ERROR");
            }
        }

        private void InitializeOcrSpace()
        {
            try
            {
                LogAll("Initializing OCR.space plugin...");
                
                // Create output directory if it doesn't exist
                string pluginDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                string outputDir = Path.Combine(pluginDir, OutputFolder);
                
                if (!Directory.Exists(outputDir))
                {
                    Directory.CreateDirectory(outputDir);
                    LogAll("Created output directory: " + outputDir);
                }
                
                LogAll("OCR.space plugin initialized successfully!");
            }
            catch (Exception ex)
            {
                LogAll("OCR.space initialization error: " + ex.Message + "\r\n" + ex.StackTrace);
                throw;
            }
        }

        public void Test(Action<object> callback)
        {
            Log("Test method called");
            if (callback != null) callback(new { success = true, message = "OCR.space plugin is ready" });
        }

        public void ResetLobbyEvent(Action<object> callback)
        {
            LogAll("Resetting lobby event flag");
            lobbyEventProcessed = false;
            if (callback != null) callback(new { success = true, message = "Lobby event flag reset" });
        }

        public void GetGameWindowInfo(Action<object> callback)
        {
            Log("GetGameWindowInfo method called");
            try
            {
                // Get all visible windows that might be game windows
                var gameWindows = new List<object>();
                
                foreach (Process process in System.Diagnostics.Process.GetProcesses())
                {
                    try
                    {
                        if (!string.IsNullOrEmpty(process.MainWindowTitle) && process.MainWindowHandle != IntPtr.Zero)
                        {
                            // Check if window is visible
                            if (IsWindow(process.MainWindowHandle) && IsWindowVisible(process.MainWindowHandle))
                            {
                                var rect = new RECT();
                                GetWindowRect(process.MainWindowHandle, ref rect);
                                
                            gameWindows.Add(new
                            {
                                title = process.MainWindowTitle,
                                handle = process.MainWindowHandle.ToString("X"),
                                processId = process.Id,
                                    processName = process.ProcessName,
                                    width = rect.Right - rect.Left,
                                    height = rect.Bottom - rect.Top,
                                    x = rect.Left,
                                    y = rect.Top
                                });
                            }
                        }
                    }
                    catch
                    {
                        // Skip processes we can't access
                    }
                }

                Log(string.Format("Found {0} potential game windows", gameWindows.Count));
                if (callback != null) callback(new { success = true, windows = gameWindows.ToArray() });
            }
            catch (Exception ex)
            {
                Log(string.Format("GetGameWindowInfo error: {0}", ex.Message), "ERROR");
                if (callback != null) callback(new { success = false, error = ex.Message });
            }
        }

        public void TakeScreenshot(Action<object> callback)
        {
            Log("TakeScreenshot method called");
            try
            {
                string screenshotPath = CaptureScreenshot();
                if (!string.IsNullOrEmpty(screenshotPath))
                {
                    if (callback != null) callback(new { success = true, path = screenshotPath });
                }
                else
                {
                    if (callback != null) callback(new { success = false, error = "Failed to capture screenshot" });
                }
            }
            catch (Exception ex)
            {
                Log(string.Format("Screenshot error: {0}", ex.Message), "ERROR");
                if (callback != null) callback(new { success = false, error = ex.Message });
            }
        }

        public void TakeScreenshotByHandle(string windowHandle, Action<object> callback)
        {
            LogAll("TakeScreenshotByHandle called with handle: " + windowHandle);
            try
            {
                // Parse the window handle
                IntPtr hWnd;
                if (windowHandle.StartsWith("0x"))
                {
                    hWnd = new IntPtr(Convert.ToInt64(windowHandle, 16));
                }
                else
                {
                    hWnd = new IntPtr(Convert.ToInt64(windowHandle, 16));
                }

                LogAll("Parsed window handle: " + hWnd.ToString("X"));

                // Validate the window handle
                if (!IsWindow(hWnd))
                {
                    LogAll("ERROR: Invalid window handle");
                    if (callback != null) callback(new { success = false, error = "Invalid window handle" });
                    return;
                }

                if (!IsWindowVisible(hWnd))
                {
                    LogAll("WARNING: Window is not visible");
                }

                // Capture the window
                string screenshotPath = CaptureWindowScreenshot(hWnd);
                if (!string.IsNullOrEmpty(screenshotPath))
                {
                    LogAll("Window screenshot captured successfully: " + screenshotPath);
                    if (callback != null) callback(new { success = true, path = screenshotPath, handle = windowHandle });
                }
                else
                {
                    LogAll("ERROR: Failed to capture window screenshot");
                    if (callback != null) callback(new { success = false, error = "Failed to capture window screenshot" });
                }
            }
            catch (Exception ex)
            {
                LogAll("TakeScreenshotByHandle error: " + ex.Message + "\r\n" + ex.StackTrace);
                if (callback != null) callback(new { success = false, error = ex.Message });
            }
        }

        public void ScanUsernameRegions(string imagePath, Action<object> callback)
        {
            LogAll("ScanUsernameRegions called with image: " + imagePath);
            if (!isInitialized)
            {
                LogAll("ERROR: Plugin not initialized");
                if (callback != null) callback(new { success = false, error = "Plugin not initialized" });
                return;
            }
            try
            {
                if (!File.Exists(imagePath))
                {
                    LogAll("ERROR: Image file not found: " + imagePath);
                    if (callback != null) callback(new { success = false, error = "Image file not found" });
                    return;
                }
                var results = new List<object>();
                using (var image = new Bitmap(imagePath))
                {
                    LogAll("Image loaded: " + image.Width + "x" + image.Height);
                    for (int i = 0; i < UsernameRegions.Count; i++)
                    {
                        var region = UsernameRegions[i];
                        LogAll("Region " + i + ": " + region.ToString());
                        var scaledRegion = ScaleRegion(region, image.Width, image.Height, 1920, 1080);
                        LogAll("Scaled region " + i + ": " + scaledRegion.ToString());
                        var croppedImage = CropImage(image, scaledRegion);
                        if (croppedImage != null)
                        {
                            LogAll("Cropped image for region " + i + ": " + croppedImage.Width + "x" + croppedImage.Height + " at (" + scaledRegion.X + "," + scaledRegion.Y + ")");
                            try
                            {
                                // Save cropped image to temporary file
                                string tempImagePath = Path.Combine(Path.GetTempPath(), $"region_{i}_{DateTime.Now.Ticks}.png");
                                croppedImage.Save(tempImagePath, ImageFormat.Png);
                                LogAll("Saved cropped image to: " + tempImagePath);
                                
                                // Run OCR.space on the saved image
                                string ocrResult = RunOcrSpace(tempImagePath, OutputFolder, i, DateTime.Now.ToString("yyyyMMdd_HHmmss_fff"));
                                LogAll("OCR result for region " + i + ": " + (ocrResult ?? "null"));
                                
                                if (!string.IsNullOrWhiteSpace(ocrResult))
                                {
                                    results.Add(new
                                    {
                                        text = ocrResult.Trim(),
                                        confidence = 1.0f,
                                        region = i,
                                        imagePath = tempImagePath
                                    });
                                }
                            }
                            catch (Exception ex)
                            {
                                LogAll("Error processing region " + i + ": " + ex.Message);
                            }
                        }
                    }
                }
                
                LogAll("Scan completed. Found " + results.Count + " text regions.");
                if (callback != null) callback(new { success = true, results = results.ToArray() });
            }
            catch (Exception ex)
            {
                LogAll("ScanUsernameRegions error: " + ex.Message + "\r\n" + ex.StackTrace);
                if (callback != null) callback(new { success = false, error = ex.Message });
            }
        }

        public void PerformOcr(string imagePath, int x, int y, int width, int height, Action<object> callback)
        {
            LogAll("PerformOcr called with image: " + imagePath + ", region: (" + x + "," + y + "," + width + "," + height + ")");
            if (!isInitialized)
            {
                LogAll("ERROR: Plugin not initialized");
                if (callback != null) callback(new { success = false, error = "Plugin not initialized" });
                return;
            }
            try
            {
                if (!File.Exists(imagePath))
                {
                    LogAll("ERROR: Image file not found: " + imagePath);
                    if (callback != null) callback(new { success = false, error = "Image file not found" });
                    return;
                }

                using (var image = new Bitmap(imagePath))
                {
                    LogAll("Image loaded: " + image.Width + "x" + image.Height);
                    var region = new Rectangle(x, y, width, height);
                    LogAll("Requested region: " + region.ToString());
                    
                    // Ensure region is within image bounds
                    if (x < 0) x = 0;
                    if (y < 0) y = 0;
                    if (x + width > image.Width) width = image.Width - x;
                    if (y + height > image.Height) height = image.Height - y;
                    
                    var adjustedRegion = new Rectangle(x, y, width, height);
                    LogAll("Adjusted region: " + adjustedRegion.ToString());
                    
                    var croppedImage = CropImage(image, adjustedRegion);
                    if (croppedImage != null)
                    {
                        LogAll("Cropped image: " + croppedImage.Width + "x" + croppedImage.Height);
                        try
                        {
                            // Save cropped image to temporary file
                            string tempImagePath = Path.Combine(Path.GetTempPath(), $"ocr_{DateTime.Now.Ticks}.png");
                            croppedImage.Save(tempImagePath, ImageFormat.Png);
                            LogAll("Saved cropped image to: " + tempImagePath);
                            
                            // Run OCR.space on the saved image
                            string ocrResult = RunOcrSpace(tempImagePath, OutputFolder, -1, DateTime.Now.ToString("yyyyMMdd_HHmmss_fff"));
                            LogAll("OCR result: " + (ocrResult ?? "null"));
                            
                            if (callback != null) callback(new { success = true, text = ocrResult?.Trim() ?? "", confidence = 1.0f });
                        }
                        catch (Exception ex)
                        {
                            LogAll("Error performing OCR: " + ex.Message);
                            if (callback != null) callback(new { success = false, error = ex.Message });
                        }
                    }
                    else
                    {
                        LogAll("ERROR: Failed to crop image");
                        if (callback != null) callback(new { success = false, error = "Failed to crop image" });
                    }
                }
            }
            catch (Exception ex)
            {
                LogAll("PerformOcr error: " + ex.Message + "\r\n" + ex.StackTrace);
                if (callback != null) callback(new { success = false, error = ex.Message });
            }
        }

        public void PerformOcrFromBase64(string base64Image, Action<object> callback)
        {
            LogAll("PerformOcrFromBase64 called");
            if (!isInitialized)
            {
                LogAll("ERROR: Plugin not initialized");
                if (callback != null) callback(new { success = false, error = "Plugin not initialized" });
                return;
            }
            try
            {
                // Decode base64 image
                byte[] imageBytes = Convert.FromBase64String(base64Image);
                using (var stream = new MemoryStream(imageBytes))
                using (var image = new Bitmap(stream))
                {
                    LogAll("Base64 image decoded: " + image.Width + "x" + image.Height);
                    
                    // Save to temporary file
                    string tempImagePath = Path.Combine(Path.GetTempPath(), $"base64_{DateTime.Now.Ticks}.png");
                    image.Save(tempImagePath, ImageFormat.Png);
                    LogAll("Saved base64 image to: " + tempImagePath);
                    
                    // Run OCR.space on the saved image
                    string ocrResult = RunOcrSpace(tempImagePath, OutputFolder, -1, DateTime.Now.ToString("yyyyMMdd_HHmmss_fff"));
                    LogAll("OCR result: " + (ocrResult ?? "null"));
                    
                    if (callback != null) callback(new { success = true, text = ocrResult?.Trim() ?? "", confidence = 1.0f });
                }
            }
            catch (Exception ex)
            {
                LogAll("PerformOcrFromBase64 error: " + ex.Message + "\r\n" + ex.StackTrace);
                if (callback != null) callback(new { success = false, error = ex.Message });
            }
        }

        private Bitmap CropImage(Bitmap source, Rectangle region)
        {
            try
            {
                if (region.Width <= 0 || region.Height <= 0)
                {
                    LogAll("ERROR: Invalid crop region dimensions: " + region.ToString());
                    return null;
                }
                
                if (region.X < 0 || region.Y < 0 || 
                    region.X + region.Width > source.Width || 
                    region.Y + region.Height > source.Height)
                {
                    LogAll("ERROR: Crop region outside image bounds. Image: " + source.Width + "x" + source.Height + ", Region: " + region.ToString());
                    return null;
                }
                
                return source.Clone(region, source.PixelFormat);
            }
            catch (Exception ex)
            {
                LogAll("CropImage error: " + ex.Message);
                return null;
            }
        }

        private Rectangle ScaleRegion(Rectangle region, int actualWidth, int actualHeight, int baseWidth, int baseHeight)
        {
            float scaleX = (float)actualWidth / baseWidth;
            float scaleY = (float)actualHeight / baseHeight;
            
            return new Rectangle(
                (int)(region.X * scaleX),
                (int)(region.Y * scaleY),
                (int)(region.Width * scaleX),
                (int)(region.Height * scaleY)
            );
        }

        private string CaptureScreenshot()
        {
            try
            {
                string pluginDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                string screenshotDir = Path.Combine(pluginDir, "screenshots");
                
                if (!Directory.Exists(screenshotDir))
                {
                    Directory.CreateDirectory(screenshotDir);
                }
                
                string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff");
                string screenshotPath = Path.Combine(screenshotDir, $"screenshot_{timestamp}.png");
                
                // Capture the entire primary screen (fallback method)
                Rectangle bounds = Screen.PrimaryScreen.Bounds;
                using (Bitmap bitmap = new Bitmap(bounds.Width, bounds.Height))
                {
                    using (Graphics g = Graphics.FromImage(bitmap))
                    {
                        g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
                    }
                    bitmap.Save(screenshotPath, ImageFormat.Png);
                }
                
                LogAll("Screenshot saved: " + screenshotPath);
                return screenshotPath;
            }
            catch (Exception ex)
            {
                LogAll("Screenshot error: " + ex.Message);
                return null;
            }
        }

        private string CaptureWindowScreenshot(IntPtr hWnd)
        {
            try
            {
                LogAll("Capturing window screenshot for handle: " + hWnd.ToString("X"));
                
                // Get window rectangle
                var rect = new RECT();
                if (GetWindowRect(hWnd, ref rect) == IntPtr.Zero)
                {
                    LogAll("ERROR: Failed to get window rectangle");
                    return null;
                }
                
                int width = rect.Right - rect.Left;
                int height = rect.Bottom - rect.Top;
                
                LogAll("Window dimensions: " + width + "x" + height + " at (" + rect.Left + "," + rect.Top + ")");
                
                if (width <= 0 || height <= 0)
                {
                    LogAll("ERROR: Invalid window dimensions");
                    return null;
                }
                
                // Create output directory
                string pluginDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                string screenshotDir = Path.Combine(pluginDir, "screenshots");
                if (!Directory.Exists(screenshotDir))
                {
                    Directory.CreateDirectory(screenshotDir);
                }
                
                string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff");
                string screenshotPath = Path.Combine(screenshotDir, $"window_screenshot_{timestamp}.png");
                
                // Capture the specific window region
                using (Bitmap bitmap = new Bitmap(width, height))
                {
                    using (Graphics g = Graphics.FromImage(bitmap))
                    {
                        g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height));
                    }
                    bitmap.Save(screenshotPath, ImageFormat.Png);
                }
                
                LogAll("Window screenshot saved: " + screenshotPath);
                return screenshotPath;
            }
            catch (Exception ex)
            {
                LogAll("Window screenshot error: " + ex.Message + "\r\n" + ex.StackTrace);
                return null;
            }
        }

        private void Log(string message, string level = "LOG")
        {
            try
            {
                string logDir = Path.GetDirectoryName(LogFile);
                if (!Directory.Exists(logDir))
                {
                    Directory.CreateDirectory(logDir);
                }
                
                string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                string logLine = string.Format("[{0}] [{1}] {2}\r\n", timestamp, level, message);
                File.AppendAllText(LogFile, logLine);
            }
            catch
            {
                // Ignore logging errors
            }
        }

        private void LogAll(string message)
        {
            Log(message, "LOG");
        }

        public void HandleLobbyEvent(Action<object> callback)
        {
            LogAll("=== LOBBY EVENT DETECTED ===");
            
            if (lobbyEventProcessed)
            {
                LogAll("Lobby event already processed, skipping");
                if (callback != null) callback(new { success = true, message = "Already processed", results = new object[0] });
                return;
            }
            
            LogAll("Starting lobby event workflow...");
            
            if (!isInitialized)
            {
                LogAll("ERROR: Plugin not initialized");
                if (callback != null) callback(new { success = false, error = "Plugin not initialized" });
                return;
            }
            
            try
            {
                // Wait 10 seconds as requested
                LogAll("Waiting 10 seconds before processing...");
                Thread.Sleep(10000);
                LogAll("10 second wait completed. Starting screenshot capture...");
                
                // Create session folder
                string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff");
                string pluginDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                string sessionFolder = Path.Combine(pluginDir, OutputFolder, $"session_{timestamp}");
                Directory.CreateDirectory(sessionFolder);
                LogAll("Created session folder: " + sessionFolder);
                
                // 1. Take screenshot (using fallback method for now)
                string screenshotPath = Path.Combine(sessionFolder, $"screenshot_{timestamp}.png");
                LogAll("Taking screenshot...");
                CaptureScreenshotTo(sessionFolder, screenshotPath);
                LogAll("Screenshot saved: " + screenshotPath);
                
                // 2. Process each region
                var results = new List<object>();
                for (int i = 0; i < UsernameRegions.Count; i++)
                {
                    LogAll("Processing region " + i + "...");
                    
                    // Crop region
                    string regionPath = Path.Combine(sessionFolder, $"region_{i}_{timestamp}.png");
                    LogAll("Cropping region " + i + " to: " + regionPath);
                    CropImageToFile(screenshotPath, regionPath, UsernameRegions[i]);
                    LogAll("Region " + i + " cropped and saved");
                    
                    // Run OCR.space
                    LogAll("Running OCR.space on region " + i + "...");
                    string ocrResult = RunOcrSpace(regionPath, sessionFolder, i, timestamp);
                    LogAll("OCR.space result for region " + i + ": " + (ocrResult ?? "null"));
                    
                    // Save result as text file
                    string txtPath = Path.Combine(sessionFolder, $"region_{i}_{timestamp}.txt");
                    File.WriteAllText(txtPath, ocrResult ?? "");
                    LogAll("OCR result saved to: " + txtPath);
                    
                    if (!string.IsNullOrWhiteSpace(ocrResult))
                    {
                        results.Add(new
                        {
                            text = ocrResult,
                            confidence = 1.0f,
                            region = i,
                            imagePath = regionPath,
                            textPath = txtPath
                        });
                    }
                }
                
                LogAll("Lobby event workflow completed. Found " + results.Count + " text regions.");
                LogAll("=== LOBBY EVENT WORKFLOW COMPLETE ===");
                
                lobbyEventProcessed = true;
                
                if (callback != null) callback(new { success = true, results = results.ToArray(), sessionFolder = sessionFolder });
            }
            catch (Exception ex)
            {
                LogAll("Lobby event error: " + ex.Message + "\r\n" + ex.StackTrace);
                if (callback != null) callback(new { success = false, error = ex.Message });
            }
        }

        private void CaptureScreenshotTo(string sessionFolder, string outputPath)
        {
            try
            {
                // Capture the entire primary screen (fallback method)
                Rectangle bounds = Screen.PrimaryScreen.Bounds;
                using (Bitmap bitmap = new Bitmap(bounds.Width, bounds.Height))
                {
                    using (Graphics g = Graphics.FromImage(bitmap))
                    {
                        g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
                    }
                    bitmap.Save(outputPath, ImageFormat.Png);
                }
                LogAll("Screenshot captured and saved to: " + outputPath);
            }
            catch (Exception ex)
            {
                LogAll("Screenshot capture error: " + ex.Message);
                throw;
            }
        }

        private void CropImageToFile(string inputPath, string outputPath, Rectangle region)
        {
            try
            {
                using (Bitmap src = new Bitmap(inputPath))
                {
                    // Scale region to match image dimensions
                    var scaledRegion = ScaleRegion(region, src.Width, src.Height, 1920, 1080);
                    LogAll("Original region: " + region.ToString() + ", Scaled region: " + scaledRegion.ToString());
                    
                    using (Bitmap cropped = src.Clone(scaledRegion, src.PixelFormat))
                    {
                        cropped.Save(outputPath, ImageFormat.Png);
                    }
                }
                LogAll("Image cropped and saved to: " + outputPath);
            }
            catch (Exception ex)
            {
                LogAll("Image crop error: " + ex.Message);
                throw;
            }
        }

        private string RunOcrSpace(string imagePath, string sessionFolder, int regionIndex, string timestamp)
        {
            try
            {
                LogAll("Running OCR.space on image: " + imagePath);
                
                if (!File.Exists(imagePath))
                {
                    LogAll("ERROR: Image file not found: " + imagePath);
                    return null;
                }
                
                // Create HTTP request
                using (var client = new WebClient())
                {
                    // Set headers
                    client.Headers.Add("apikey", OcrSpaceApiKey);
                    client.Headers.Add("Content-Type", "application/x-www-form-urlencoded");
                    
                    // Prepare form data
                    var postData = new System.Collections.Specialized.NameValueCollection
                    {
                        { "url", "" }, // We'll use file upload instead of URL
                        { "language", "eng" },
                        { "isOverlayRequired", "false" },
                        { "filetype", "png" },
                        { "detectOrientation", "false" },
                        { "scale", "true" },
                        { "OCREngine", "2" }
                    };
                    
                    // Upload file
                    byte[] responseBytes = client.UploadFile(OcrSpaceApiUrl, imagePath);
                    string response = Encoding.UTF8.GetString(responseBytes);
                    
                    LogAll("OCR.space response: " + response);
                    
                    // Parse JSON response
                    var serializer = new JavaScriptSerializer();
                    var result = serializer.Deserialize<Dictionary<string, object>>(response);
                    
                    if (result.ContainsKey("ParsedResults") && result["ParsedResults"] != null)
                    {
                        var parsedResults = result["ParsedResults"] as object[];
                        if (parsedResults != null && parsedResults.Length > 0)
                        {
                            var firstResult = parsedResults[0] as Dictionary<string, object>;
                            if (firstResult != null && firstResult.ContainsKey("ParsedText"))
                            {
                                string parsedText = firstResult["ParsedText"] as string;
                                LogAll("OCR.space extracted text: " + parsedText);
                                return parsedText;
                            }
                        }
                    }
                    
                    LogAll("OCR.space no text found in response");
                    return null;
                }
            }
            catch (Exception ex)
            {
                LogAll("OCR.space error: " + ex.Message + "\r\n" + ex.StackTrace);
                return null;
            }
        }

        public void ScanPixelColor(int x, int y, Action<object> callback)
        {
            try
            {
                string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                LogAll($"[{timestamp}] [ScanPixelColor] Scanning pixel at ({x},{y})");
                
                // Capture a small region around the pixel
                using (Bitmap bitmap = new Bitmap(1, 1))
                {
                    using (Graphics graphics = Graphics.FromImage(bitmap))
                    {
                        graphics.CopyFromScreen(new Point(x, y), Point.Empty, new Size(1, 1));
                    }
                    
                    Color pixelColor = bitmap.GetPixel(0, 0);
                    int r = pixelColor.R;
                    int g = pixelColor.G;
                    int b = pixelColor.B;
                    int brightness = (r + g + b) / 3;
                    bool isBlack = brightness < 30;
                    LogAll($"[{timestamp}] [ScanPixelColor] Pixel ({x},{y}) - R:{r} G:{g} B:{b} Brightness:{brightness} IsBlack:{isBlack}");
                    
                    if (callback != null) callback(new {
                        success = true,
                        x = x,
                        y = y,
                        r = r,
                        g = g,
                        b = b,
                        brightness = brightness,
                        isBlack = isBlack,
                        timestamp = timestamp,
                        log = $"Pixel ({x},{y}) - R:{r} G:{g} B:{b} Brightness:{brightness} IsBlack:{isBlack}"
                    });
                }
            }
            catch (Exception ex)
            {
                string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                LogAll($"[{timestamp}] [ScanPixelColor] Pixel scan error: {ex.Message}");
                if (callback != null) callback(new { success = false, error = ex.Message, timestamp = timestamp });
            }
        }

        public void StartPixelMonitoring(int x, int y, int intervalMs, Action<object> callback)
        {
            try
            {
                string startTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                LogAll($"[{startTimestamp}] [StartPixelMonitoring] Starting pixel monitoring at ({x},{y}) every {intervalMs}ms");
                
                // Start a background thread for monitoring
                Thread monitoringThread = new Thread(() =>
                {
                    string lastLogTimestamp = "";
                    int checkCount = 0;
                    try
                    {
                        while (true)
                        {
                            string checkTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                            ScanPixelColor(x, y, result =>
                            {
                                // Throttle log output to once every 2 seconds
                                if (lastLogTimestamp == "" || (DateTime.Now - DateTime.Parse(lastLogTimestamp)).TotalSeconds > 2)
                                {
                                    LogAll($"[{checkTimestamp}] [PixelMonitor] Pixel check at ({x},{y}) result: {new JavaScriptSerializer().Serialize(result)}");
                                    lastLogTimestamp = checkTimestamp;
                                }
                                
                                checkCount++;
                                
                                if (result is Dictionary<string, object> dict && dict.ContainsKey("isBlack"))
                                {
                                    bool isBlack = (bool)dict["isBlack"];
                                    
                                    // Trigger if pixel is not black OR after 5 checks (to handle already visible screens)
                                    if (!isBlack || checkCount >= 5)
                                    {
                                        string triggerTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                                        string triggerReason = !isBlack ? "Screen is no longer black" : "Screen already visible after 5 checks";
                                        LogAll($"[{triggerTimestamp}] [PixelMonitor] {triggerReason} at ({x},{y})! Triggering screenshot and OCR.");
                                        callback?.Invoke(new {
                                            success = true,
                                            trigger = "screen_not_black",
                                            pixelData = dict,
                                            timestamp = triggerTimestamp,
                                            log = $"{triggerReason} at ({x},{y}) at {triggerTimestamp}",
                                            checkCount = checkCount
                                        });
                                        return; // Stop monitoring
                                    }
                                }
                            });
                            Thread.Sleep(intervalMs);
                        }
                    }
                    catch (Exception ex)
                    {
                        string errorTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                        LogAll($"[{errorTimestamp}] [PixelMonitor] Monitoring thread error: {ex.Message}");
                        callback?.Invoke(new { success = false, error = ex.Message, timestamp = errorTimestamp });
                    }
                });
                monitoringThread.IsBackground = true;
                monitoringThread.Start();
                LogAll($"[{startTimestamp}] [StartPixelMonitoring] Pixel monitoring thread started");
            }
            catch (Exception ex)
            {
                string errorTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                LogAll($"[{errorTimestamp}] [StartPixelMonitoring] Start pixel monitoring error: {ex.Message}");
                if (callback != null) callback(new { success = false, error = ex.Message, timestamp = errorTimestamp });
            }
        }

        public void StartColorMonitoring(int x, int y, string targetColorHex, int tolerance, int intervalMs, Action<object> callback)
        {
            try
            {
                string startTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                LogAll($"[{startTimestamp}] [StartColorMonitoring] Starting color monitoring at ({x},{y}) for color {targetColorHex} with tolerance {tolerance} every {intervalMs}ms");
                
                // Parse target color
                Color targetColor = ColorTranslator.FromHtml(targetColorHex);
                int targetR = targetColor.R;
                int targetG = targetColor.G;
                int targetB = targetColor.B;
                
                LogAll($"[{startTimestamp}] [StartColorMonitoring] Target color RGB: ({targetR},{targetG},{targetB})");
                
                // Start a background thread for monitoring
                Thread monitoringThread = new Thread(() =>
                {
                    string lastLogTimestamp = "";
                    int checkCount = 0;
                    try
                    {
                        while (true)
                        {
                            string checkTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                            ScanPixelColor(x, y, result =>
                            {
                                checkCount++;
                                
                                if (result is Dictionary<string, object> dict && dict.ContainsKey("r") && dict.ContainsKey("g") && dict.ContainsKey("b"))
                                {
                                    int r = (int)dict["r"];
                                    int g = (int)dict["g"];
                                    int b = (int)dict["b"];
                                    
                                    // Calculate color distance
                                    int colorDistance = (int)Math.Sqrt(
                                        Math.Pow(r - targetR, 2) + 
                                        Math.Pow(g - targetG, 2) + 
                                        Math.Pow(b - targetB, 2)
                                    );
                                    
                                    bool colorMatch = colorDistance <= tolerance;
                                    
                                    // Log every 10th check or when color matches
                                    if (checkCount % 10 == 0 || colorMatch || lastLogTimestamp == "")
                                    {
                                        LogAll($"[{checkTimestamp}] [ColorMonitor] Check {checkCount} at ({x},{y}) - RGB:({r},{g},{b}) Target:({targetR},{targetG},{targetB}) Distance:{colorDistance} Match:{colorMatch}");
                                        lastLogTimestamp = checkTimestamp;
                                    }
                                    
                                    if (colorMatch)
                                    {
                                        string triggerTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                                        LogAll($"[{triggerTimestamp}] [ColorMonitor] TARGET COLOR DETECTED at ({x},{y})! RGB:({r},{g},{b}) Distance:{colorDistance}. Triggering OCR.");
                                        callback?.Invoke(new {
                                            success = true,
                                            trigger = "color_detected",
                                            pixelData = dict,
                                            targetColor = targetColorHex,
                                            colorDistance = colorDistance,
                                            timestamp = triggerTimestamp,
                                            log = $"Target color {targetColorHex} detected at ({x},{y}) at {triggerTimestamp}",
                                            checkCount = checkCount
                                        });
                                        return; // Stop monitoring
                                    }
                                }
                            });
                            Thread.Sleep(intervalMs);
                        }
                    }
                    catch (Exception ex)
                    {
                        string errorTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                        LogAll($"[{errorTimestamp}] [ColorMonitor] Monitoring thread error: {ex.Message}");
                        callback?.Invoke(new { success = false, error = ex.Message, timestamp = errorTimestamp });
                    }
                });
                monitoringThread.IsBackground = true;
                monitoringThread.Start();
                LogAll($"[{startTimestamp}] [StartColorMonitoring] Color monitoring thread started");
            }
            catch (Exception ex)
            {
                string errorTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                LogAll($"[{errorTimestamp}] [StartColorMonitoring] Start color monitoring error: {ex.Message}");
                if (callback != null) callback(new { success = false, error = ex.Message, timestamp = errorTimestamp });
            }
        }

        public void StartRegionColorMonitoring(int centerX, int centerY, int regionWidth, int regionHeight, string targetColorHex, int tolerance, int intervalMs, Action<object> callback)
        {
            try
            {
                string startTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                LogAll($"[{startTimestamp}] [StartRegionColorMonitoring] Starting region color monitoring at center ({centerX},{centerY}) with region {regionWidth}x{regionHeight} for color {targetColorHex} with tolerance {tolerance} every {intervalMs}ms");
                
                // Parse target color
                Color targetColor = ColorTranslator.FromHtml(targetColorHex);
                int targetR = targetColor.R;
                int targetG = targetColor.G;
                int targetB = targetColor.B;
                
                LogAll($"[{startTimestamp}] [StartRegionColorMonitoring] Target color RGB: ({targetR},{targetG},{targetB})");
                LogAll($"[{startTimestamp}] [StartRegionColorMonitoring] Scanning region: X({centerX - regionWidth/2} to {centerX + regionWidth/2}), Y({centerY - regionHeight/2} to {centerY + regionHeight/2})");
                
                // Start a background thread for monitoring
                Thread monitoringThread = new Thread(() =>
                {
                    string lastLogTimestamp = "";
                    int checkCount = 0;
                    try
                    {
                        while (true)
                        {
                            string checkTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                            
                            // Scan the entire region
                            bool colorFound = false;
                            int foundX = 0, foundY = 0;
                            Color foundColor = Color.Black;
                            int minDistance = int.MaxValue;
                            
                            // Calculate region bounds
                            int startX = centerX - regionWidth / 2;
                            int endX = centerX + regionWidth / 2;
                            int startY = centerY - regionHeight / 2;
                            int endY = centerY + regionHeight / 2;
                            
                            // Scan every pixel in the region (sample every few pixels for performance)
                            int sampleStep = Math.Max(1, Math.Min(regionWidth, regionHeight) / 10); // Sample every 10th pixel or every pixel if region is small
                            
                            for (int x = startX; x <= endX; x += sampleStep)
                            {
                                for (int y = startY; y <= endY; y += sampleStep)
                                {
                                    try
                                    {
                                        // Capture pixel color
                                        using (Bitmap bitmap = new Bitmap(1, 1))
                                        {
                                            using (Graphics graphics = Graphics.FromImage(bitmap))
                                            {
                                                graphics.CopyFromScreen(new Point(x, y), Point.Empty, new Size(1, 1));
                                            }
                                            
                                            Color pixelColor = bitmap.GetPixel(0, 0);
                                            int r = pixelColor.R;
                                            int g = pixelColor.G;
                                            int b = pixelColor.B;
                                            
                                            // Calculate color distance
                                            int colorDistance = (int)Math.Sqrt(
                                                Math.Pow(r - targetR, 2) + 
                                                Math.Pow(g - targetG, 2) + 
                                                Math.Pow(b - targetB, 2)
                                            );
                                            
                                            // Track the closest match
                                            if (colorDistance < minDistance)
                                            {
                                                minDistance = colorDistance;
                                                foundX = x;
                                                foundY = y;
                                                foundColor = pixelColor;
                                            }
                                            
                                            // Check if this pixel matches
                                            if (colorDistance <= tolerance)
                                            {
                                                colorFound = true;
                                                foundX = x;
                                                foundY = y;
                                                foundColor = pixelColor;
                                                break; // Found a match, stop scanning
                                            }
                                        }
                                    }
                                    catch (Exception ex)
                                    {
                                        // Skip pixels that can't be captured (off-screen, etc.)
                                        continue;
                                    }
                                }
                                if (colorFound) break; // Found a match, stop scanning
                            }
                            
                            checkCount++;
                            
                            // Log every 5th check or when color is found
                            if (checkCount % 5 == 0 || colorFound || lastLogTimestamp == "")
                            {
                                string logMessage = colorFound 
                                    ? $"Check {checkCount} - COLOR FOUND at ({foundX},{foundY}) RGB:({foundColor.R},{foundColor.G},{foundColor.B}) Distance:{minDistance}"
                                    : $"Check {checkCount} - No match found. Closest: ({foundX},{foundY}) RGB:({foundColor.R},{foundColor.G},{foundColor.B}) Distance:{minDistance}";
                                
                                LogAll($"[{checkTimestamp}] [RegionColorMonitor] {logMessage}");
                                lastLogTimestamp = checkTimestamp;
                            }
                            
                            if (colorFound)
                            {
                                string triggerTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                                LogAll($"[{triggerTimestamp}] [RegionColorMonitor] TARGET COLOR DETECTED in region! Found at ({foundX},{foundY}) RGB:({foundColor.R},{foundColor.G},{foundColor.B}) Distance:{minDistance}. Triggering OCR.");
                                callback?.Invoke(new {
                                    success = true,
                                    trigger = "color_detected",
                                    foundX = foundX,
                                    foundY = foundY,
                                    foundColor = ColorTranslator.ToHtml(foundColor),
                                    colorDistance = minDistance,
                                    targetColor = targetColorHex,
                                    regionCenter = new { x = centerX, y = centerY },
                                    regionSize = new { width = regionWidth, height = regionHeight },
                                    timestamp = triggerTimestamp,
                                    log = $"Target color {targetColorHex} detected at ({foundX},{foundY}) in region at {triggerTimestamp}",
                                    checkCount = checkCount
                                });
                                return; // Stop monitoring
                            }
                            
                            Thread.Sleep(intervalMs);
                        }
                    }
                    catch (Exception ex)
                    {
                        string errorTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                        LogAll($"[{errorTimestamp}] [RegionColorMonitor] Monitoring thread error: {ex.Message}");
                        callback?.Invoke(new { success = false, error = ex.Message, timestamp = errorTimestamp });
                    }
                });
                monitoringThread.IsBackground = true;
                monitoringThread.Start();
                LogAll($"[{startTimestamp}] [StartRegionColorMonitoring] Region color monitoring thread started");
            }
            catch (Exception ex)
            {
                string errorTimestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
                LogAll($"[{errorTimestamp}] [StartRegionColorMonitoring] Start region color monitoring error: {ex.Message}");
                if (callback != null) callback(new { success = false, error = ex.Message, timestamp = errorTimestamp });
            }
        }
    }
}