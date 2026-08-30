' ResumePilot AI - Silent Background Service Runner
' Starts the Node.js cluster supervisor silently without opening a terminal window.

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "d:\xampp\htdocs\ai-resume-builder\backend"
WshShell.Run "cmd /c node cluster.js", 0, False
