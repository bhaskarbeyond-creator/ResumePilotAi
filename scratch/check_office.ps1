try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $v = $word.Version
    Write-Output "MICROSOFT_WORD_AVAILABLE: Version $v"
    $word.Quit()
} catch {
    Write-Output "MICROSOFT_WORD_NOT_AVAILABLE: $($_.Exception.Message)"
}

$loPaths = @(
    "C:\Program Files\LibreOffice\program\soffice.exe",
    "C:\Program Files (x86)\LibreOffice\program\soffice.exe"
)
foreach ($p in $loPaths) {
    if (Test-Path $p) {
        Write-Output "LIBREOFFICE_AVAILABLE: $p"
    }
}
