param (
    [string]$docxPath,
    [string]$pdfPath
)

$resolvedDocx = (Resolve-Path $docxPath).Path
$resolvedPdf = [System.IO.Path]::GetFullPath($pdfPath)

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = [Microsoft.Office.Interop.Word.WdAlertLevel]::wdAlertsNone 2>$null

try {
    $doc = $word.Documents.Open($resolvedDocx, $false, $true)
    # 17 = wdFormatPDF
    $doc.SaveAs([ref]$resolvedPdf, [ref]17)
    $doc.Close([ref]$false)
    Write-Output "CONVERTED_SUCCESS: $resolvedPdf"
} catch {
    Write-Output "CONVERT_ERROR: $($_.Exception.Message)"
} finally {
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}
