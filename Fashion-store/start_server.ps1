$securePassword = Read-Host "Choisissez un mot de passe admin (12 caractères minimum)" -AsSecureString
if ($securePassword.Length -lt 12) {
    Write-Error "Le mot de passe doit contenir au moins 12 caractères."
    exit 1
}

$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if (-not $env:PORT) {
        $env:PORT = "4173"
    }
    python (Join-Path $PSScriptRoot "server.py")
}
finally {
    $env:ADMIN_PASSWORD = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
