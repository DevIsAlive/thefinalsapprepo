using System;
using System.IO;
using System.Runtime.InteropServices;
using Tesseract;

class Program
{
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr LoadLibrary(string lpFileName);
    
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint GetLastError();

    static void Main(string[] args)
    {
        Console.WriteLine("=== Standalone Tesseract Test ===");
        Console.WriteLine($"Is64BitProcess: {Environment.Is64BitProcess}");
        
        // Get the main app directory (one level up from the test executable)
        string appDirectory = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."));
        Console.WriteLine($"Main app directory: {appDirectory}");
        
        // Check if required files exist
        string[] requiredFiles = {
            "leptonica-1.82.0.dll",
            "tesseract50.dll",
            "tessdata/eng.traineddata"
        };
        
        foreach (var file in requiredFiles)
        {
            string filePath = Path.Combine(appDirectory, file);
            if (File.Exists(filePath))
            {
                var fileInfo = new FileInfo(filePath);
                Console.WriteLine($"✓ {file} exists (size: {fileInfo.Length} bytes)");
            }
            else
            {
                Console.WriteLine($"✗ {file} NOT FOUND at {filePath}");
            }
        }
        
        // Try to load DLLs manually
        Console.WriteLine("\n=== Testing DLL Loading ===");
        string[] dllsToTest = {
            "leptonica-1.82.0.dll",
            "tesseract50.dll"
        };
        
        foreach (var dllName in dllsToTest)
        {
            string dllPath = Path.Combine(appDirectory, dllName);
            if (File.Exists(dllPath))
            {
                Console.WriteLine($"Attempting to load: {dllName}");
                IntPtr handle = LoadLibrary(dllPath);
                if (handle != IntPtr.Zero)
                {
                    Console.WriteLine($"✓ Successfully loaded: {dllName}");
                }
                else
                {
                    uint error = GetLastError();
                    Console.WriteLine($"✗ Failed to load: {dllName}, Error: {error}");
                }
            }
        }
        
        // Try to initialize Tesseract
        Console.WriteLine("\n=== Testing Tesseract Initialization ===");
        try
        {
            string tessdataPath = Path.Combine(appDirectory, "tessdata");
            Console.WriteLine($"Tessdata path: {tessdataPath}");
            
            using (var engine = new TesseractEngine(tessdataPath, "eng", EngineMode.Default))
            {
                Console.WriteLine("✓ TesseractEngine initialized successfully!");
                
                // Test OCR on a simple image if available
                string testImagePath = Path.Combine(appDirectory, "test.png");
                if (File.Exists(testImagePath))
                {
                    using (var img = Pix.LoadFromFile(testImagePath))
                    using (var page = engine.Process(img))
                    {
                        string text = page.GetText();
                        Console.WriteLine($"OCR Test Result: {text}");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"✗ Tesseract initialization failed: {ex.Message}");
            if (ex.InnerException != null)
            {
                Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
            }
        }
        
        Console.WriteLine("\nPress any key to exit...");
        Console.ReadKey();
    }
} 