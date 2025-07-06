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

        public RapidOcrNetPlugin()
        {
            try
            {
                Log("=== RapidOcrNetPlugin Constructor ===");
                Log("Plugin DLL version: 2024-07-06-ocrspace-migration-v1");
                
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
                            gameWindows.Add(new
                            {
                                title = process.MainWindowTitle,
                                handle = process.MainWindowHandle.ToString("X"),
                                processId = process.Id,
                                processName = process.ProcessName
                            });
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
                                    var confidence = 1.0f; // OCR.space doesn't provide confidence scores
                                    LogAll("Found text in region " + i + ": '" + ocrResult + "' (confidence: " + confidence.ToString("F2") + ")");
                                    results.Add(new
                                    {
                                        text = ocrResult,
                                        confidence = confidence,
                                        region = i
                                    });
                                }
                                else
                                {
                                    LogAll("No text detected in region " + i);
                                }
                                
                                // Clean up temporary file
                                try { File.Delete(tempImagePath); } catch { }
                            }
                            catch (Exception ex)
                            {
                                LogAll("OCR error for region " + i + ": " + ex.Message);
                            }
                        }
                        else
                        {
                            LogAll("Failed to crop region " + i);
                        }
                    }
                }
                LogAll("Scan complete. Found " + results.Count + " text regions.");
                if (callback != null) callback(new { success = true, results = results.ToArray() });
            }
            catch (Exception ex)
            {
                LogAll("ScanUsernameRegions error: " + ex.Message);
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
                    
                    var croppedImage = CropImage(image, region);
                    if (croppedImage != null)
                    {
                        LogAll("Cropped image: " + croppedImage.Width + "x" + croppedImage.Height);
                        try
                        {
                            // Save cropped image to temporary file
                            string tempImagePath = Path.Combine(Path.GetTempPath(), $"ocr_region_{DateTime.Now.Ticks}.png");
                            croppedImage.Save(tempImagePath, ImageFormat.Png);
                            LogAll("Saved cropped image to: " + tempImagePath);
                            
                            // Run OCR.space on the saved image
                            string ocrResult = RunOcrSpace(tempImagePath, OutputFolder, -1, DateTime.Now.ToString("yyyyMMdd_HHmmss_fff"));
                            LogAll("OCR result: " + (ocrResult ?? "null"));
                            
                            if (!string.IsNullOrWhiteSpace(ocrResult))
                            {
                                var confidence = 1.0f;
                                LogAll("Found text: '" + ocrResult + "' (confidence: " + confidence.ToString("F2") + ")");
                                if (callback != null) callback(new { success = true, text = ocrResult, confidence = confidence });
                            }
                            else
                            {
                                LogAll("No text detected");
                                if (callback != null) callback(new { success = true, text = "", confidence = 0.0f });
                            }
                            
                            // Clean up temporary file
                            try { File.Delete(tempImagePath); } catch { }
                        }
                        catch (Exception ex)
                        {
                            LogAll("OCR error: " + ex.Message);
                            if (callback != null) callback(new { success = false, error = ex.Message });
                        }
                    }
                    else
                    {
                        LogAll("Failed to crop image");
                        if (callback != null) callback(new { success = false, error = "Failed to crop image" });
                    }
                }
            }
            catch (Exception ex)
            {
                LogAll("PerformOcr error: " + ex.Message);
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
                string tempImagePath = Path.Combine(Path.GetTempPath(), $"base64_ocr_{DateTime.Now.Ticks}.png");
                
                File.WriteAllBytes(tempImagePath, imageBytes);
                LogAll("Saved base64 image to: " + tempImagePath);
                
                try
                {
                    // Run OCR.space on the saved image
                    string ocrResult = RunOcrSpace(tempImagePath, OutputFolder, -1, DateTime.Now.ToString("yyyyMMdd_HHmmss_fff"));
                    LogAll("OCR result: " + (ocrResult ?? "null"));
                    
                    if (!string.IsNullOrWhiteSpace(ocrResult))
                    {
                        var confidence = 1.0f;
                        LogAll("Found text: '" + ocrResult + "' (confidence: " + confidence.ToString("F2") + ")");
                        if (callback != null) callback(new { success = true, text = ocrResult, confidence = confidence });
                    }
                    else
                    {
                        LogAll("No text detected");
                        if (callback != null) callback(new { success = true, text = "", confidence = 0.0f });
                    }
                }
                finally
                {
                    // Clean up temporary file
                    try { File.Delete(tempImagePath); } catch { }
                }
            }
            catch (Exception ex)
            {
                LogAll("PerformOcrFromBase64 error: " + ex.Message);
                if (callback != null) callback(new { success = false, error = ex.Message });
            }
        }

        private Bitmap CropImage(Bitmap source, Rectangle region)
        {
            try
            {
                // Ensure region is within image bounds
                if (region.X < 0) region.X = 0;
                if (region.Y < 0) region.Y = 0;
                if (region.X + region.Width > source.Width) region.Width = source.Width - region.X;
                if (region.Y + region.Height > source.Height) region.Height = source.Height - region.Y;
                
                if (region.Width <= 0 || region.Height <= 0)
                {
                    LogAll("Invalid crop region: " + region.ToString());
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
                
                // Capture the entire primary screen
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
                
                // 1. Take screenshot
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
                // Capture the entire primary screen
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
                LogAll("Sending image to OCR.space: " + imagePath);
                
                string boundary = "---------------------------" + DateTime.Now.Ticks.ToString("x");
                byte[] fileData = File.ReadAllBytes(imagePath);

                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(OcrSpaceApiUrl);
                request.Method = "POST";
                request.ContentType = $"multipart/form-data; boundary={boundary}";
                request.Headers.Add("apikey", OcrSpaceApiKey);

                using (Stream requestStream = request.GetRequestStream())
                {
                    // Write form data
                    string formTemplate = $"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{Path.GetFileName(imagePath)}\"\r\nContent-Type: image/png\r\n\r\n";
                    byte[] formBytes = Encoding.UTF8.GetBytes(formTemplate);
                    requestStream.Write(formBytes, 0, formBytes.Length);
                    requestStream.Write(fileData, 0, fileData.Length);

                    string formFooter = $"\r\n--{boundary}--\r\n";
                    byte[] footerBytes = Encoding.UTF8.GetBytes(formFooter);
                    requestStream.Write(footerBytes, 0, footerBytes.Length);
                }

                LogAll("OCR.space request sent, waiting for response...");

                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    string json = reader.ReadToEnd();
                    LogAll("OCR.space response received: " + json);

                    // Parse JSON
                    var serializer = new JavaScriptSerializer();
                    dynamic result = serializer.DeserializeObject(json);
                    
                    if (result != null && result.ContainsKey("ParsedResults"))
                    {
                        var parsedResults = result["ParsedResults"] as object[];
                        if (parsedResults != null && parsedResults.Length > 0)
                        {
                            var firstResult = parsedResults[0] as System.Collections.Generic.Dictionary<string, object>;
                            if (firstResult != null && firstResult.ContainsKey("ParsedText"))
                            {
                                string parsedText = firstResult["ParsedText"] as string;
                                LogAll("ParsedText extracted: " + parsedText);
                                return parsedText;
                            }
                        }
                    }
                    
                    LogAll("No ParsedText found in OCR.space response");
                    return null;
                }
            }
            catch (Exception ex)
            {
                LogAll("OCR.space error: " + ex.Message + "\r\n" + ex.StackTrace);
                return null;
            }
        }
    }
}