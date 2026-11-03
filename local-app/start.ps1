$ErrorActionPreference = 'Stop'
$env:SHERPA_OPENROUTER_KEY = [Environment]::GetEnvironmentVariable('2_AI_Sherpa(openroter)', 'User')
if (-not $env:SHERPA_OPENROUTER_KEY) { throw '사용자 환경 변수 2_AI_Sherpa(openroter)를 확인해 주세요.' }
Set-Location -LiteralPath $PSScriptRoot
node server.mjs
