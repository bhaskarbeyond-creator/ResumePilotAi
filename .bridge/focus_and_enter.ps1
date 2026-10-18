Add-Type -ReferencedAssemblies System.Windows.Forms @"
using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class TerminalClicker {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, int dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static string ClickAndEnter() {
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

                if (ideHwnd != IntPtr.Zero) {
                    SetForegroundWindow(ideHwnd);
                    Thread.Sleep(300);

                    RECT rect;
                    GetWindowRect(ideHwnd, out rect);

                    // Terminal prompt is at roughly X = 300, Y = bottom - 120
                    int clickX = rect.Left + 350;
                    int clickY = rect.Bottom - 120;

                    SetCursorPos(clickX, clickY);
                    Thread.Sleep(100);
                    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                    Thread.Sleep(50);
                    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    Thread.Sleep(300);

                    SendKeys.SendWait("{ENTER}");
                    result = "OK: Clicked at (" + clickX + "," + clickY + ") and sent ENTER to " + foundTitle;
                } else {
                    result = "Error: Antigravity IDE window not found";
                }

                CloseDesktop(hDesk);
            } catch (Exception ex) {
                result = "Exception: " + ex.Message;
            }
        });
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();
        return result;
    }
}
"@

$res = [TerminalClicker]::ClickAndEnter()
Write-Output $res
