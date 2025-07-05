using System;
using Tesseract;
using System.IO;

class Program
{
    static void Main(string[] args)
    {
        Console.WriteLine($"Is64BitProcess: {Environment.Is64BitProcess}");
        string appDirectory = AppDomain.CurrentDomain.BaseDirectory;
        string tessdataPath = Path.Combine(appDirectory, "tessdata");
        Console.WriteLine($"App directory: {appDirectory}");
        Console.WriteLine($"tessdata path: {tessdataPath}");
        if (!Directory.Exists(tessdataPath))
        {
            Console.WriteLine($"tessdata directory does not exist: {tessdataPath}");
            return;
        }
        string engDataPath = Path.Combine(tessdataPath, "eng.traineddata");
        if (!File.Exists(engDataPath))
        {
            Console.WriteLine($"eng.traineddata not found at: {engDataPath}");
            return;
        }
        try
        {
            using (var engine = new TesseractEngine(tessdataPath, "eng", EngineMode.TesseractAndLstm))
            {
                engine.SetVariable("tessedit_char_whitelist", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-.");
                Console.WriteLine("Tesseract engine initialized successfully!");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to initialize Tesseract: {ex.Message}");
            if (ex.InnerException != null)
                Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
        }
    }
} 