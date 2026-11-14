<# Checks an exported MP4 without modifying the video or project. #>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Video,
    [double]$ExpectedDuration = 0,
    [int]$ExpectedWidth = 1920,
    [int]$ExpectedHeight = 1080,
    [double]$ExpectedFps = 60,
    [string]$ReferenceVideo
)
$ErrorActionPreference = 'Stop'
if ($ExpectedDuration -lt 0 -or $ExpectedWidth -le 0 -or $ExpectedHeight -le 0 -or $ExpectedFps -le 0) {
    throw 'Duration must be nonnegative; dimensions and FPS must be positive.'
}
foreach ($program in @('ffprobe', 'ffmpeg')) {
    if (-not (Get-Command $program -ErrorAction SilentlyContinue)) { throw "$program is required on PATH." }
}
$videoPath = (Resolve-Path -LiteralPath $Video).Path
if (-not (Test-Path -LiteralPath $videoPath -PathType Leaf)) { throw 'Video must be a file.' }
$probeOutput = & ffprobe -v error -show_streams -show_format -of json $videoPath
if ($LASTEXITCODE -ne 0) { throw 'ffprobe failed.' }
$probe = ($probeOutput -join "`n") | ConvertFrom-Json
$v = @($probe.streams | Where-Object { $_.codec_type -eq 'video' })
$a = @($probe.streams | Where-Object { $_.codec_type -eq 'audio' })
if ($v.Count -ne 1 -or $a.Count -ne 1) { throw 'Expected one video stream and one audio stream.' }
$rate = $v[0].avg_frame_rate.Split('/')
if ($rate.Count -ne 2 -or [double]$rate[1] -eq 0) { throw 'Invalid average frame rate.' }
$fps = [double]$rate[0] / [double]$rate[1]
$duration = [double]::Parse($probe.format.duration, [Globalization.CultureInfo]::InvariantCulture)
if ($v[0].codec_name -ne 'h264' -or $a[0].codec_name -ne 'aac') { throw 'Expected H.264 video and AAC audio.' }
if ($v[0].width -ne $ExpectedWidth -or $v[0].height -ne $ExpectedHeight) { throw "Unexpected dimensions: $($v[0].width)x$($v[0].height)." }
if ([math]::Abs($fps - $ExpectedFps) -gt 0.001) { throw "Unexpected FPS: $fps." }
if ($ExpectedDuration -gt 0) {
    if ([math]::Abs($duration - $ExpectedDuration) -gt (1 / $ExpectedFps + 0.001)) { throw "Unexpected duration: $duration seconds." }
    $expectedFrames = [math]::Round($ExpectedDuration * $ExpectedFps)
    if (-not $v[0].nb_frames -or [long]$v[0].nb_frames -ne $expectedFrames) { throw "Expected $expectedFrames frames; found $($v[0].nb_frames)." }
}
& ffmpeg -nostdin -hide_banner -loglevel error -xerror -i $videoPath -map 0:v:0 -map 0:a:0 -f null -
if ($LASTEXITCODE -ne 0) { throw 'Full audio/video decode failed.' }
$audioIdentical = $null
if ($ReferenceVideo) {
    $referencePath = (Resolve-Path -LiteralPath $ReferenceVideo).Path
    $audioHashes = foreach ($inputVideo in @($videoPath, $referencePath)) {
        $result = & ffmpeg -nostdin -hide_banner -loglevel error -i $inputVideo -map 0:a:0 -c copy -f hash -hash sha256 -
        if ($LASTEXITCODE -ne 0) { throw "Audio hashing failed for $inputVideo." }
        $hash = ($result -join '').Trim()
        if ($hash -notmatch '^SHA256=[0-9a-fA-F]{64}$') { throw 'Unexpected audio hash output.' }
        $hash
    }
    $audioIdentical = $audioHashes[0] -eq $audioHashes[1]
    if (-not $audioIdentical) { throw 'Encoded audio differs from reference. This does not by itself diagnose an audible change.' }
}
[pscustomobject]@{
    Video = $videoPath
    DurationSeconds = $duration
    Dimensions = "$($v[0].width)x$($v[0].height)"
    Fps = $fps
    Frames = $v[0].nb_frames
    VideoCodec = $v[0].codec_name
    AudioCodec = $a[0].codec_name
    SampleRate = $a[0].sample_rate
    Channels = $a[0].channels
    FullDecodePassed = $true
    ReferenceAudioIdentical = $audioIdentical
}
