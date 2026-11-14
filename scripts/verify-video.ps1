<#
.SYNOPSIS
Checks a rendered Hyperframes export without modifying it.

.DESCRIPTION
Windows wrapper around verify-video.mjs (same folder), so both entry points apply
identical checks. Requires Node.js 18+, ffprobe, and ffmpeg on PATH. Returns the
result as an object; throws on any failed check.

Width, height, and FPS are enforced only when passed. Run with -Help for the
full option list of the underlying script.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Video,
    [ValidateSet('auto', 'mp4', 'webm', 'mov', 'gif', 'hls', 'png-sequence')][string]$Format = 'auto',
    [double]$ExpectedDuration = 0,
    [int]$ExpectedWidth = 0,
    [int]$ExpectedHeight = 0,
    [string]$ExpectedFps,
    [string]$ReferenceVideo,
    [switch]$NoAudio,
    [switch]$Alpha,
    [double]$MaxAudioDrift = 0.25,
    [string]$VideoCodec,
    [string]$AudioCodec
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'node (Node.js 18+) is required on PATH.' }
$script = Join-Path $PSScriptRoot 'verify-video.mjs'
$inv = [Globalization.CultureInfo]::InvariantCulture
$arguments = @($script, '--video', $Video, '--format', $Format, '--json',
    '--max-audio-drift', $MaxAudioDrift.ToString($inv))
if ($ExpectedDuration -gt 0) { $arguments += @('--expected-duration', $ExpectedDuration.ToString($inv)) }
if ($ExpectedWidth -gt 0) { $arguments += @('--width', "$ExpectedWidth") }
if ($ExpectedHeight -gt 0) { $arguments += @('--height', "$ExpectedHeight") }
if ($ExpectedFps) { $arguments += @('--fps', $ExpectedFps) }
if ($ReferenceVideo) { $arguments += @('--reference', $ReferenceVideo) }
if ($NoAudio) { $arguments += '--no-audio' }
if ($Alpha) { $arguments += '--alpha' }
if ($VideoCodec) { $arguments += @('--video-codec', $VideoCodec) }
if ($AudioCodec) { $arguments += @('--audio-codec', $AudioCodec) }

# PowerShell 5.1 turns native stderr into error records; collect them instead of throwing.
$ErrorActionPreference = 'Continue'
$all = & node @arguments 2>&1
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
$output = @($all | Where-Object { $_ -isnot [Management.Automation.ErrorRecord] })
$errorText = (@($all | Where-Object { $_ -is [Management.Automation.ErrorRecord] } | ForEach-Object { $_.Exception.Message }) -join "`n").Trim()
if ($code -ne 0) {
    $message = if ($errorText) { $errorText -replace '^Error:\s*', '' } else { "verify-video.mjs exited with code $code." }
    Write-Error -Message $message -ErrorAction Continue
    exit 1
}
($output -join "`n") | ConvertFrom-Json
