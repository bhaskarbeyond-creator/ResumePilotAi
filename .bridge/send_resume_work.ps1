Add-Type -ReferencedAssemblies System.Windows.Forms @"
using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class SenderHelper2 {
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
                    Thread.Sleep(300);

                    // Switch out of auto mode if needed
                    SendKeys.SendWait("+{TAB}");
                    Thread.Sleep(200);

                    Clipboard.SetText(text);
                    Thread.Sleep(150);
                    SendKeys.SendWait("^v");
                    Thread.Sleep(200);
                    SendKeys.SendWait("{ENTER}");
                    result = "OK: Sent imperative directive to " + foundTitle;
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

$directiveText = @"
Resume implementation of DIR-003 immediately from where you stopped. Complete all remaining components in sequence without pausing or re-verifying:
1. CoverLetterStudio / CoverLetterBuilderPage: full implementation with Cover1-4 templates, tone selector, /api/generate-content API, and PDF/print export.
2. WebCvStudio / PortfolioBuilderPage: 8 portfolio templates, section reordering, live preview, and MariaDB persistence via /api/portfolios.
3. AI Interview Engine: all 4 modalities - Practice Mode (untimed, free nav), Mock Interview (timed simulation, countdown, scorecard), CBT Examination (strict timer, auto-submit, question palette, keyboard shortcuts A-D/1-4/arrows), and Live Face-to-Face Studio (LiveInterviewSession.jsx with webcam, AI avatar, audio waveform, voice engine).
4. JobApplicationModal (111 KB parity) with AI Quick Pitch generator, and Job Tracker pipeline with optimistic locking (expectedRevision).
5. Run full verification: npm run build (<4s budget) and npx tsc -b (0 errors).
6. Submit evidence via bridge_dev_submit_evidence MCP tool so Lead Gatekeeper can certify DIR-003 and unlock DIR-004.
Do not pause. Start writing the code files now.
"@

$res = [SenderHelper2]::Send($directiveText)
Write-Output $res
