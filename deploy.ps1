# Usage: ./deploy.ps1 "commit message"
param(
    [Parameter(Mandatory=$true)]
    [string]$Message
)

Write-Host "Running lint..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "Lint failed. Fix errors before pushing." -ForegroundColor Red
    exit 1
}

Write-Host "Running build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. Fix errors before pushing." -ForegroundColor Red
    exit 1
}

Write-Host "Checks passed. Committing and pushing..." -ForegroundColor Green
git add -A
git commit -m "$Message"
git push origin main

Write-Host "Pushed to GitHub. Lovable will sync shortly." -ForegroundColor Green
