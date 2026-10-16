# PowerShell script to create module inventory directories and status files under roo-directives

$root = "D:\xampp\htdocs\IME365"
$rooDirectives = Join-Path $root "roo-directives"

# List of modules to inventory (relative to project root)
$modules = @(
    "src",
    "backend",
    "backend/database",
    "scripts",
    "tests",
    "docs",
    "extension",
    "ops",
    "public",
    "template-lab",
    ".bridge",
    ".agents",
    ".github",
    ".vscode",
    "root"
)

# Ensure roo-directives exists
if (-not (Test-Path $rooDirectives)) {
    New-Item -ItemType Directory -Path $rooDirectives | Out-Null
}

foreach ($module in $modules) {
    # Determine the directory path under roo-directives
    # Replace path separators with underscores for nested directories? 
    # But we want to preserve the hierarchy. We'll create the full path under roo-directives.
    $modulePath = Join-Path $rooDirectives $module
    
    # Create the directory (including any parent directories)
    if (-not (Test-Path $modulePath)) {
        New-Item -ItemType Directory -Path $modulePath -Force | Out-Null
    }
    
    # Create a STATUS.md file in the module directory
    $statusFile = Join-Path $modulePath "STATUS.md"
    
    # Initial classification - we'll set to "unknown" for now and update later
    $classification = "unknown"
    $notes = "Initial inventory created. Classification to be updated after diagnostic suite."
    
    # Write the status file
    @"
# Module Inventory: $module

**Classification:** $classification

**Notes:**
$notes

**Last Updated:** $(Get-Date -Format u)
"@ | Set-Content -Path $statusFile -Encoding UTF8
}

Write-Host "Module inventory created under $rooDirectives"