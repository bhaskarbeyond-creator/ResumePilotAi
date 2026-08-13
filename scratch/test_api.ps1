$BACKEND = 'https://airesume.projectdemo.guru'

# Step 1: SA Status check
Write-Host '--- Step 1: Service Account Status ---'
try {
    $r = Invoke-WebRequest -Uri "$BACKEND/api/admin/firebase-service-account" -Method GET -UseBasicParsing
    Write-Host "  HTTP $($r.StatusCode)"
    $d = $r.Content | ConvertFrom-Json
    Write-Host "  configured:    $($d.configured)"
    Write-Host "  adminSdkReady: $($d.adminSdkReady)"
    Write-Host "  projectId:     $($d.projectId)"
    Write-Host "  clientEmail:   $($d.clientEmail)"
    Write-Host "  privateKeySet: $($d.privateKeySet)"
} catch {
    Write-Host "  HTTP $($_.Exception.Response.StatusCode.value__)"
    Write-Host "  $($_.Exception.Message)"
}

# Step 2: set-user-password (reset to same password = safe test)
Write-Host ''
Write-Host '--- Step 2: set-user-password (Admin SDK test) ---'
try {
    $body = '{"email":"bhaskar.beyond@gmail.com","newPassword":"Bhaskar002!"}'
    $r = Invoke-WebRequest -Uri "$BACKEND/api/auth/set-user-password" `
        -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing
    Write-Host "  HTTP $($r.StatusCode)"
    $d = $r.Content | ConvertFrom-Json
    Write-Host "  success: $($d.success)"
    Write-Host "  method:  $($d.method)"
    Write-Host "  message: $($d.message)"
    if ($d.error) { Write-Host "  error:   $($d.error)" }
} catch {
    Write-Host "  HTTP $($_.Exception.Response.StatusCode.value__)"
    Write-Host "  $($_.Exception.Message)"
}

# Step 3: custom-password-reset for real email
Write-Host ''
Write-Host '--- Step 3: Custom password reset email for bhaskar.beyond@gmail.com ---'
try {
    $body = '{"email":"bhaskar.beyond@gmail.com"}'
    $r = Invoke-WebRequest -Uri "$BACKEND/api/auth/custom-password-reset" `
        -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing
    Write-Host "  HTTP $($r.StatusCode)"
    $d = $r.Content | ConvertFrom-Json
    Write-Host "  success: $($d.success)"
    Write-Host "  message: $($d.message)"
    if ($d.error) { Write-Host "  error:   $($d.error)" }
} catch {
    Write-Host "  HTTP $($_.Exception.Response.StatusCode.value__)"
    Write-Host "  $($_.Exception.Message)"
}

Write-Host ''
Write-Host '=== DONE ==='
