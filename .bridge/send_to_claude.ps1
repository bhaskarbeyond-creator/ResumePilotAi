Add-Type -ReferencedAssemblies System.Windows.Forms @"
using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class SenderHelper {
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

    public static string Send(string text) {
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
                    Thread.Sleep(400);

                    Clipboard.SetText(text);
                    Thread.Sleep(150);
                    SendKeys.SendWait("^v");
                    Thread.Sleep(200);
                    SendKeys.SendWait("{ENTER}");
                    result = "OK: Sent to " + foundTitle;
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

$msg = "Execute DIR-003 act phase now. Implement CoverLetterBuilderPage, PortfolioBuilderPage, and LiveInterviewSession with all 4 modes. Run npm run build and npx tsc -b, then submit evidence."
$res = [SenderHelper]::Send($msg)
Write-Output $res
