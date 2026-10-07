$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'
$packages = Join-Path (Split-Path $PSScriptRoot -Parent) 'work\python-packages'
if (Test-Path $packages) { $env:PYTHONPATH = $packages }
node (Join-Path $PSScriptRoot 'preview.cjs')
