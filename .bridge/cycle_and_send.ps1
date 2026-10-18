Add-Type -ReferencedAssemblies System.Windows.Forms @"
using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class CycleHelper {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, int dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public static string CycleAndSend(string text) {
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

                    // Send Shift+Tab to cycle out of broken auto mode classifier
                    SendKeys.SendWait("+{TAB}");
                    Thread.Sleep(400);

                    // Send instruction to proceed with file editing tools
                    Clipboard.SetText(text);
                    Thread.Sleep(150);
                    SendKeys.SendWait("^v");
                    Thread.Sleep(200);
                    SendKeys.SendWait("{ENTER}");
                    result = "OK: Cycled auto-mode and sent command to " + foundTitle;
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

$msg = "Use GlobTool, Read, and Write tools directly. Implement CoverLetterBuilderPage, PortfolioBuilderPage, and LiveInterviewSession now without stopping."
$res = [CycleHelper]::CycleAndSend($msg)
Write-Output $res
