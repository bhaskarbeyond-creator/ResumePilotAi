$BACKEND = 'https://airesume.projectdemo.guru'

Write-Host '============================================'
Write-Host '  PRODUCTION SMOKE TEST - POST DEPLOY'
Write-Host '============================================'
Write-Host ''

$pass = 0
$fail = 0

function Test-Endpoint {
    param($name, $method, $uri, $body)
    try {
        if ($method -eq 'GET') {
            $r = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing
        } else {
            $r = Invoke-WebRequest -Uri $uri -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing
        }
        $d = $r.Content | ConvertFrom-Json
        $ok = $r.StatusCode -eq 200 -and ($d.success -eq $true -or $d.configured -ne $null)
        if ($ok) {
            Write-Host "  ✅ PASS  $name (HTTP $($r.StatusCode))"
            $script:pass++
        } else {
            Write-Host "  ⚠️  WARN  $name (HTTP $($r.StatusCode)) - success=$($d.success)"
        }
        return $d
    } catch {
        Write-Host "  ❌ FAIL  $name - HTTP $($_.Exception.Response.StatusCode.value__)"
        $script:fail++
        return $null
    }
}

# 1. SA Status
Write-Host '--- Firebase Admin SDK ---'
$sa = Test-Endpoint 'GET /api/admin/firebase-service-account' 'GET' "$BACKEND/api/admin/firebase-service-account" $null
if ($sa) {
    Write-Host "         projectId:     $($sa.projectId)"
    Write-Host "         adminSdkReady: $($sa.adminSdkReady)"
    Write-Host "         privateKeySet: $($sa.privateKeySet)"
}

# 2. set-user-password
Write-Host ''
Write-Host '--- Password Reset Flow ---'
Test-Endpoint 'POST /api/auth/set-user-password' 'POST' "$BACKEND/api/auth/set-user-password" '{"email":"bhaskar.beyond@gmail.com","newPassword":"Bhaskar002!"}' | Out-Null

# 3. custom-password-reset (email)
Test-Endpoint 'POST /api/auth/custom-password-reset' 'POST' "$BACKEND/api/auth/custom-password-reset" '{"email":"bhaskar.beyond@gmail.com"}' | Out-Null

# 4. Site reachability
Write-Host ''
Write-Host '--- Frontend ---'
try {
    $r = Invoke-WebRequest -Uri "$BACKEND" -Method GET -UseBasicParsing
    if ($r.StatusCode -eq 200 -and $r.Content -like '*root*') {
        Write-Host "  ✅ PASS  GET / (SPA index.html served, HTTP 200)"
        $pass++
    } else {
        Write-Host "  ⚠️  WARN  GET / (HTTP $($r.StatusCode))"
    }
} catch {
    Write-Host "  ❌ FAIL  GET / - $($_.Exception.Message)"
    $fail++
}

# 5. notify/password-changed endpoint
Write-Host ''
Write-Host '--- Notification Endpoints ---'
Test-Endpoint 'POST /api/notify/password-changed' 'POST' "$BACKEND/api/notify/password-changed" '{"userEmail":"bhaskar.beyond@gmail.com","userName":"Bhaskar"}' | Out-Null

Write-Host ''
Write-Host '============================================'
Write-Host "  RESULTS: $pass PASSED | $fail FAILED"
Write-Host '============================================'
