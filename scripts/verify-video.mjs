#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const USAGE = `Checks a rendered Hyperframes export without modifying it.

Usage:
  node verify-video.mjs --video <path> [options]

<path> may be a video file (.mp4, .webm, .mov, .gif), an HLS playlist (.m3u8),
or a directory of PNG frames (--format png-sequence output). An HLS output
directory is also accepted; its .m3u8 playlist is used.

Options:
  --video <path>              Export to inspect (required)
  --format <name>             auto|mp4|webm|mov|gif|hls|png-sequence (default: auto, from the path)
  --expected-duration <sec>   Expected duration in seconds; also checks the frame count (default: skip)
  --fps <rate>                Expected frame rate, e.g. 30, 60, 30000/1001 (default: report only)
  --width <px>                Expected width (default: report only)
  --height <px>               Expected height (default: report only)
  --alpha                     Require a transparent (alpha) channel (MOV, WebM, PNG)
  --no-audio                  Expect no audio stream
  --max-audio-drift <sec>     Allowed audio/video length difference (default: 0.25)
  --reference <path>          Another export whose encoded audio must be byte-identical
  --video-codec <list>        Override accepted video codecs, comma-separated
  --audio-codec <list>        Override accepted audio codecs, comma-separated
  --json                      Print the result as JSON
  --help, -h                  Show this help

Pass --fps, --width and --height matching the render command or the composition's
data-fps/data-width/data-height to enforce them. Requires ffprobe and ffmpeg on
PATH. Exits 0 on success, 1 on failure.
`;

const FORMATS = {
  mp4: { video: ['h264', 'hevc'], audio: ['aac'], audioCapable: true },
  webm: { video: ['vp9', 'vp8', 'av1'], audio: ['opus', 'vorbis'], audioCapable: true },
  mov: { video: ['prores', 'h264', 'hevc'], audio: ['aac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le'], audioCapable: true },
  hls: { video: ['h264'], audio: ['aac'], audioCapable: true },
  gif: { video: ['gif'], audio: [], audioCapable: false },
  'png-sequence': { video: ['png'], audio: [], audioCapable: false },
};
const EXTENSIONS = { '.mp4': 'mp4', '.m4v': 'mp4', '.webm': 'webm', '.mov': 'mov', '.gif': 'gif', '.m3u8': 'hls' };
const ALPHA_PIX_FMT = /^(yuva|rgba|bgra|argb|abgr|gbrap|ya\d)/;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseRate(value, label) {
  const text = String(value);
  const parts = text.split('/');
  const rate = parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : Number(text);
  if (!Number.isFinite(rate) || rate <= 0) fail(`${label} must be a positive number or ratio.`);
  return rate;
}

function parseArgs(argv) {
  const options = {
    video: undefined,
    format: 'auto',
    expectedDuration: 0,
    fps: undefined,
    width: undefined,
    height: undefined,
    alpha: false,
    noAudio: false,
    maxAudioDrift: 0.25,
    reference: undefined,
    videoCodecs: undefined,
    audioCodecs: undefined,
    json: false,
    help: false,
  };
  const withValue = new Set([
    '--video', '--format', '--expected-duration', '--fps', '--width', '--height',
    '--max-audio-drift', '--reference', '--video-codec', '--audio-codec',
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    let arg = argv[i];
    let value;
    const equals = arg.indexOf('=');
    if (arg.startsWith('--') && equals !== -1) {
      value = arg.slice(equals + 1);
      arg = arg.slice(0, equals);
    }
    if (withValue.has(arg) && value === undefined) {
      value = argv[i + 1];
      if (value === undefined) fail(`${arg} requires a value.`);
      i += 1;
    }
    const number = () => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) fail(`${arg} must be a number.`);
      return parsed;
    };
    const list = () => value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);

    switch (arg) {
      case '--video': options.video = value; break;
      case '--format': options.format = value.toLowerCase(); break;
      case '--expected-duration': options.expectedDuration = number(); break;
      case '--fps': options.fps = parseRate(value, '--fps'); break;
      case '--width': options.width = number(); break;
      case '--height': options.height = number(); break;
      case '--max-audio-drift': options.maxAudioDrift = number(); break;
      case '--reference': options.reference = value; break;
      case '--video-codec': options.videoCodecs = list(); break;
      case '--audio-codec': options.audioCodecs = list(); break;
      case '--alpha': options.alpha = true; break;
      case '--no-audio': options.noAudio = true; break;
      case '--json': options.json = true; break;
      case '--help': case '-h': options.help = true; break;
      default: fail(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }
  return options;
}

function requireProgram(program) {
  const result = spawnSync(program, ['-version'], { encoding: 'utf8', windowsHide: true });
  if (result.error && result.error.code === 'ENOENT') fail(`${program} is required on PATH.`);
  if (result.error) fail(`Could not run ${program}: ${result.error.message}`);
  if (result.status !== 0) fail(`${program} failed to report its version.`);
}

function run(program, args, description) {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  if (result.error) fail(`Could not run ${program}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || '').trim().split(/\r?\n/).slice(-5).join('\n');
    fail(`${description}${detail ? `: ${detail}` : '.'}`);
  }
  return result.stdout || '';
}

function statOrFail(target, label) {
  try {
    return statSync(target);
  } catch {
    return fail(`${label} not found: ${target}`);
  }
}

function resolveInput(inputPath, format) {
  const resolved = path.resolve(inputPath);
  const stats = statOrFail(resolved, 'Export');
  if (stats.isDirectory()) {
    const entries = readdirSync(resolved);
    const playlists = entries.filter((name) => name.toLowerCase().endsWith('.m3u8'));
    const pngs = entries.filter((name) => name.toLowerCase().endsWith('.png'));
    if ((format === 'auto' || format === 'hls') && playlists.length > 0) {
      const preferred = playlists.find((name) => /^(index|master|playlist)\.m3u8$/i.test(name)) ?? playlists.sort()[0];
      return { target: path.join(resolved, preferred), format: 'hls' };
    }
    if ((format === 'auto' || format === 'png-sequence') && pngs.length > 0) {
      return { target: resolved, format: 'png-sequence', pngs };
    }
    return fail(`Directory has no .m3u8 playlist or .png frames: ${resolved}`);
  }
  if (!stats.isFile()) fail(`Export must be a file or directory: ${resolved}`);
  const detected = format === 'auto' ? EXTENSIONS[path.extname(resolved).toLowerCase()] : format;
  if (!detected || !FORMATS[detected]) fail(`Cannot detect the format of ${resolved}; pass --format.`);
  if (detected === 'png-sequence') fail('--format png-sequence expects a directory of frames.');
  return { target: resolved, format: detected };
}

function pngSequencePattern(directory, pngs) {
  const numbered = pngs
    .map((name) => ({ name, match: /^(.*?)(\d+)\.png$/i.exec(name) }))
    .filter((item) => item.match);
  if (numbered.length !== pngs.length) fail('Every PNG frame name must end in a frame number.');
  const prefixes = new Set(numbered.map((item) => item.match[1]));
  if (prefixes.size !== 1) fail(`PNG frames use more than one name prefix: ${[...prefixes].join(', ')}`);
  const digits = new Set(numbered.map((item) => item.match[2].length));
  const numbers = numbered.map((item) => Number(item.match[2])).sort((a, b) => a - b);
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] !== numbers[i - 1] + 1) fail(`PNG sequence has a gap after frame ${numbers[i - 1]}.`);
  }
  const prefix = [...prefixes][0];
  const pattern = digits.size === 1 ? `${prefix}%0${[...digits][0]}d.png` : `${prefix}%d.png`;
  return { pattern: path.join(directory, pattern), start: numbers[0], count: numbers.length };
}

function fpsMatches(actual, expected, format) {
  if (format === 'gif') {
    // GIF stores frame delays in whole centiseconds, so 15 fps is written as 6 or 7 cs
    // (16.67 or 14.29 fps) depending on the encoder's rounding.
    const exact = 100 / expected;
    const delays = [Math.floor(exact), Math.ceil(exact)].filter((delay) => delay >= 1);
    return [expected, ...delays.map((delay) => 100 / delay)].some((rate) => Math.abs(actual - rate) < 0.05);
  }
  return Math.abs(actual - expected) <= 0.001 * Math.max(1, expected / 30);
}

function readDuration(stream) {
  const direct = Number(stream.duration);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const tag = stream.tags && (stream.tags.DURATION || stream.tags.duration);
  const match = tag && /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(tag);
  if (match) return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return null;
}

function hasAlpha(stream) {
  const tags = stream.tags || {};
  if (String(tags.alpha_mode ?? tags.ALPHA_MODE ?? '') === '1') return true;
  return ALPHA_PIX_FMT.test(String(stream.pix_fmt || ''));
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}
if (!options.video) fail(`--video is required.\n\n${USAGE}`);
if (options.format !== 'auto' && !FORMATS[options.format]) fail(`Unknown --format: ${options.format}`);
if (options.expectedDuration < 0) fail('--expected-duration must be nonnegative.');
if (options.maxAudioDrift < 0) fail('--max-audio-drift must be nonnegative.');
if ((options.width ?? 1) <= 0 || (options.height ?? 1) <= 0) fail('Dimensions must be positive.');
if (options.noAudio && options.reference) fail('--reference cannot be combined with --no-audio.');

requireProgram('ffprobe');
requireProgram('ffmpeg');

const input = resolveInput(options.video, options.format);
const format = input.format;
const spec = FORMATS[format];
const acceptedVideo = options.videoCodecs ?? spec.video;
const acceptedAudio = options.audioCodecs ?? spec.audio;
const expectAudio = spec.audioCapable && !options.noAudio;
if (options.reference && !expectAudio) fail(`--reference needs an audio track; ${format} has none.`);

let video;
let audio = null;
let containerDuration = null;
let frames = null;
let duration;
let fps;

if (format === 'png-sequence') {
  const sequence = pngSequencePattern(input.target, input.pngs);
  // Decodes every frame, so this is also the full-decode check.
  const raw = run(
    'ffprobe',
    ['-v', 'error', '-f', 'image2', '-start_number', String(sequence.start), '-i', sequence.pattern,
      '-show_entries', 'frame=width,height,pix_fmt', '-of', 'csv=p=0'],
    'Decoding the PNG sequence failed',
  );
  const rows = raw.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length !== sequence.count) fail(`Decoded ${rows.length} of ${sequence.count} PNG frames.`);
  const shapes = new Set(rows.map((row) => row.split(',').slice(0, 2).join('x')));
  if (shapes.size !== 1) fail(`PNG frames have mixed dimensions: ${[...shapes].join(', ')}`);
  const [width, height, pixFmt] = rows[0].split(',');
  video = { codec_name: 'png', width: Number(width), height: Number(height), pix_fmt: pixFmt };
  frames = sequence.count;
  fps = options.fps ?? null;
  duration = fps ? frames / fps : null;
} else {
  const probe = JSON.parse(
    run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', input.target], 'ffprobe failed'),
  );
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const videoStreams = streams.filter((stream) => stream.codec_type === 'video' && !(stream.disposition && stream.disposition.attached_pic));
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');
  if (videoStreams.length !== 1) fail(`Expected one video stream; found ${videoStreams.length}.`);
  const expectedAudio = expectAudio ? 1 : 0;
  if (audioStreams.length !== expectedAudio) {
    const hint = audioStreams.length === 0 && expectAudio ? ' Pass --no-audio if this export is meant to be silent.' : '';
    fail(`Expected ${expectedAudio} audio stream(s); found ${audioStreams.length}.${hint}`);
  }
  video = videoStreams[0];
  audio = audioStreams[0] ?? null;

  fps = parseRate(video.avg_frame_rate && video.avg_frame_rate !== '0/0' ? video.avg_frame_rate : video.r_frame_rate, 'Video frame rate');
  containerDuration = Number(probe.format && probe.format.duration);
  if (!Number.isFinite(containerDuration)) containerDuration = null;

  frames = video.nb_frames == null ? null : Number(video.nb_frames);
  if (!Number.isFinite(frames) || frames <= 0) {
    const counted = run(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', input.target],
      'Counting video frames failed',
    );
    frames = Number(counted.trim().split(/\r?\n/)[0]);
    if (!Number.isFinite(frames) || frames <= 0) frames = null;
  }
  // The container duration includes AAC priming/padding, so judge length by the picture.
  duration = readDuration(video) ?? (frames ? frames / fps : containerDuration);
  if (!Number.isFinite(duration)) fail('Could not read the video duration.');
}

if (!acceptedVideo.includes(String(video.codec_name).toLowerCase())) {
  fail(`Expected ${format} video codec ${acceptedVideo.join('/')}; found ${video.codec_name}.`);
}
if (options.width !== undefined && Number(video.width) !== options.width) fail(`Unexpected width: ${video.width} (expected ${options.width}).`);
if (options.height !== undefined && Number(video.height) !== options.height) fail(`Unexpected height: ${video.height} (expected ${options.height}).`);
if (options.fps !== undefined && fps !== null && !fpsMatches(fps, options.fps, format)) {
  fail(`Unexpected frame rate: ${fps.toFixed(3)} (expected ${options.fps}).`);
}
// The GIF decoder always outputs BGRA, so its pixel format says nothing about transparency.
const alpha = format === 'gif' ? null : hasAlpha(video);
if (options.alpha && format === 'gif') fail('--alpha cannot be checked for GIF; use MOV, WebM, or PNG for transparency.');
if (options.alpha && !alpha) fail(`Expected an alpha channel; pixel format is ${video.pix_fmt}.`);

let audioDrift = null;
if (audio) {
  if (!acceptedAudio.includes(String(audio.codec_name).toLowerCase())) {
    fail(`Expected ${format} audio codec ${acceptedAudio.join('/')}; found ${audio.codec_name}.`);
  }
  const audioDuration = readDuration(audio);
  if (audioDuration !== null && duration !== null) {
    audioDrift = audioDuration - duration;
    if (Math.abs(audioDrift) > options.maxAudioDrift) {
      fail(`Audio and video lengths differ by ${audioDrift.toFixed(3)} s (limit ${options.maxAudioDrift} s).`);
    }
  }
}

if (options.expectedDuration > 0) {
  if (duration === null) fail('Pass --fps to check the duration of a PNG sequence.');
  const frameTime = 1 / (options.fps ?? fps);
  const tolerance = format === 'gif' ? Math.max(0.1, 2 * frameTime) : frameTime + 0.001;
  if (Math.abs(duration - options.expectedDuration) > tolerance) {
    fail(`Unexpected duration: ${duration} s (expected ${options.expectedDuration} s).`);
  }
  if (format !== 'gif') {
    const expectedFrames = Math.round(options.expectedDuration * (options.fps ?? fps));
    if (frames === null || Math.abs(frames - expectedFrames) > 1) {
      fail(`Expected ${expectedFrames} frames; found ${frames ?? 'unknown'}.`);
    }
  }
}

if (format !== 'png-sequence') {
  run(
    'ffmpeg',
    ['-nostdin', '-hide_banner', '-loglevel', 'error', '-xerror', '-i', input.target, '-map', '0:v:0',
      ...(audio ? ['-map', '0:a:0'] : []), '-f', 'null', '-'],
    'Full decode failed',
  );
}

let referenceAudioIdentical = null;
if (options.reference) {
  const reference = resolveInput(options.reference, 'auto');
  const hashes = [input.target, reference.target].map((target) => {
    const output = run(
      'ffmpeg',
      ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', target, '-map', '0:a:0', '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'],
      `Audio hashing failed for ${target}`,
    );
    const match = output.trim().split(/\r?\n/).find((line) => /^SHA256=[0-9a-fA-F]{64}$/.test(line));
    if (!match) fail('Unexpected audio hash output.');
    return match;
  });
  referenceAudioIdentical = hashes[0] === hashes[1];
  if (!referenceAudioIdentical) {
    fail('Encoded audio differs from reference. This does not by itself diagnose an audible change.');
  }
}

const result = {
  Video: input.target,
  Format: format,
  DurationSeconds: duration,
  ContainerDurationSeconds: containerDuration,
  AudioDriftSeconds: audioDrift,
  Dimensions: `${video.width}x${video.height}`,
  Fps: fps,
  Frames: frames,
  VideoCodec: video.codec_name,
  PixelFormat: video.pix_fmt ?? null,
  Alpha: alpha,
  AudioCodec: audio ? audio.codec_name : null,
  SampleRate: audio ? Number(audio.sample_rate) : null,
  Channels: audio ? Number(audio.channels) : null,
  FullDecodePassed: true,
  ReferenceAudioIdentical: referenceAudioIdentical,
};

if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const note = (enforced) => (enforced ? '' : ' (not enforced)');
  console.log(`Export: ${result.Video}`);
  console.log(`Format: ${format}`);
  console.log(`Duration: ${duration === null ? 'unknown (pass --fps)' : `${duration} s`}`);
  console.log(`Dimensions: ${result.Dimensions}${note(options.width !== undefined || options.height !== undefined)}`);
  console.log(`FPS: ${fps === null ? 'n/a' : `${Number(fps.toFixed(3))}${note(options.fps !== undefined)}`}`);
  console.log(`Frames: ${frames ?? 'unknown'}`);
  console.log(`Video: ${video.codec_name} ${video.pix_fmt ?? ''}${alpha ? ' (alpha)' : ''}`.trimEnd());
  console.log(audio ? `Audio: ${audio.codec_name} (${result.SampleRate} Hz, ${result.Channels} ch)` : 'Audio: none');
  if (audioDrift !== null) console.log(`Audio drift: ${audioDrift.toFixed(3)} s`);
  console.log('Full decode: passed');
  console.log(`Reference audio identical: ${referenceAudioIdentical === null ? 'not checked' : 'yes'}`);
}
