using System;
using System.Drawing;
using System.IO;
using Tesseract;

namespace overwolf.plugins
{
    public class OcrPlugin
    {
        private static readonly string LogPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "OcrPlugin.log");

        public OcrPlugin() { }

        // filePath: path to the screenshot image
        // x, y, width, height: crop rectangle
        // callback: JS callback to receive OCR result
        public void OcrRegion(string filePath, int x, int y, int width, int height, Action<object> callback)
        {
            try
            {
                if (!File.Exists(filePath))
                {
                    LogError($"File not found: {filePath}");
                    callback("ERROR: File not found");
                    return;
                }

                using (var img = new Bitmap(filePath))
                {
                    Rectangle cropRect = new Rectangle(x, y, width, height);
                    using (var cropped = img.Clone(cropRect, img.PixelFormat))
                    {
                        using (var engine = new TesseractEngine(@"./tessdata", "eng", EngineMode.Default))
                        {
                            using (var pix = PixConverter.ToPix(cropped))
                            {
                                using (var page = engine.Process(pix))
                                {
                                    string text = page.GetText().Trim();
                                    callback(text);
                                    return;
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                LogError($"Exception: {ex.Message}\nStackTrace: {ex.StackTrace}\nInner: {ex.InnerException}");
                callback("ERROR: " + ex.Message);
            }
        }

        private void LogError(string message)
        {
            try
            {
                File.AppendAllText(LogPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}\n");
            }
            catch { /* Ignore logging errors */ }
        }
    }
} 