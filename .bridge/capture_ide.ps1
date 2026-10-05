Add-Type -ReferencedAssemblies System.Drawing @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Threading;
using System.Text;
using System.Runtime.InteropServices;

public class IdeCapturer {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, int dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static string Capture(string outputPath) {
        string result = "";
        Thread t = new Thread(() => {
            try {
                uint access = 0x01FF;
                IntPtr hDesk = OpenDesktop("Default", 0, false, access);
                if (hDesk == IntPtr.Zero) {
                    result = "Error: OpenDesktop failed";
                    return;
                }
                if (!SetThreadDesktop(hDesk)) {
                    result = "Error: SetThreadDesktop failed";
                    CloseDesktop(hDesk);
                    return;
                }

                IntPtr ideHwnd = IntPtr.Zero;
                string foundTitle = "";

                EnumWindows((hWnd, lParam) => {
                    if (IsWindowVisible(hWnd)) {
                        StringBuilder sb = new StringBuilder(256);
                        GetWindowText(hWnd, sb, 256);
                        string tTitle = sb.ToString();
                        if (tTitle.IndexOf("Antigravity IDE", StringComparison.OrdinalIgnoreCase) >= 0) {
                            ideHwnd = hWnd;
                            foundTitle = tTitle;
                            return false;
                        }
                    }
                    return true;
                }, IntPtr.Zero);

                int screenWidth = GetSystemMetrics(0);
                int screenHeight = GetSystemMetrics(1);

                if (ideHwnd != IntPtr.Zero) {
                    SetForegroundWindow(ideHwnd);
                    Thread.Sleep(300);
                    RECT r;
                    GetWindowRect(ideHwnd, out r);
                    int w = r.Right - r.Left;
                    int h = r.Bottom - r.Top;
                    if (w > 200 && h > 200) {
                        using (Bitmap bmp = new Bitmap(w, h)) {
                            using (Graphics g = Graphics.FromImage(bmp)) {
                                IntPtr hdcDest = g.GetHdc();
                                IntPtr hdcSrc = GetDC(IntPtr.Zero);
                                BitBlt(hdcDest, 0, 0, w, h, hdcSrc, r.Left, r.Top, 0x00CC0020);
                                ReleaseDC(IntPtr.Zero, hdcSrc);
                                g.ReleaseHdc(hdcDest);
                            }
                            bmp.Save(outputPath, ImageFormat.Png);
                        }
                        result = "OK: IDE window captured";
                        CloseDesktop(hDesk);
                        return;
                    }
                }

                // Fallback: capture full desktop
                using (Bitmap bmp = new Bitmap(screenWidth, screenHeight)) {
                    using (Graphics g = Graphics.FromImage(bmp)) {
                        IntPtr hdcDest = g.GetHdc();
                        IntPtr hdcSrc = GetDC(IntPtr.Zero);
                        BitBlt(hdcDest, 0, 0, screenWidth, screenHeight, hdcSrc, 0, 0, 0x00CC0020);
                        ReleaseDC(IntPtr.Zero, hdcSrc);
                        g.ReleaseHdc(hdcDest);
                    }
                    bmp.Save(outputPath, ImageFormat.Png);
                }
                result = "OK: Full desktop captured";
                CloseDesktop(hDesk);
            } catch (Exception ex) {
                result = "Exception: " + ex.Message;
            }
        });
        t.Start();
        t.Join();
        return result;
    }
}
"@

$out = "D:\xampp\htdocs\IME365\.bridge\ide_ss.png"
if ($args.Count -gt 0) {
    $out = $args[0]
}
$res = [IdeCapturer]::Capture($out)
Write-Output $res
