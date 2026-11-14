#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';

const USAGE = `Checks an exported MP4 without modifying the video or project.

Usage:
  node verify-video.mjs --video <file.mp4> [options]

Options:
  --video <path>              Video to inspect (required)
  --expected-duration <sec>   Expected duration in seconds (default: 0 = skip)
  --width <px>                Expected video width (default: 1920)
  --height <px>               Expected video height (default: 1080)
  --fps <rate>                Expected average frame rate (default: 60)
  --reference <path>          Second video whose encoded audio must match
  --json                      Print the result as JSON
  --help, -h                  Show this help

Requires ffprobe and ffmpeg on PATH. Exits 0 on success, 1 on failure.
`;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    video: undefined,
    expectedDuration: 0,
    width: 1920,
    height: 1080,
    fps: 60,
    reference: undefined,
    json: false,
    help: false,
  };
  const numeric = {
    '--expected-duration': 'expectedDuration',
    '--width': 'width',
    '--height': 'height',
    '--fps': 'fps',
  };

  for (let i = 0; i < argv.length; i += 1) {
    let arg = argv[i];
    let value;
    const equals = arg.indexOf('=');
    if (equals !== -1) {
      value = arg.slice(equals + 1);
      arg = arg.slice(0, equals);
    }

    if (arg === '--video' || arg === '--reference') {
      if (value === undefined) {
        value = argv[i + 1];
        if (value === undefined) fail(`${arg} requires a value.`);
        i += 1;
      }
      options[arg === '--video' ? 'video' : 'reference'] = value;
    } else if (Object.hasOwn(numeric, arg)) {
      if (value === undefined) {
        value = argv[i + 1];
        if (value === undefined) fail(`${arg} requires a value.`);
        i += 1;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) fail(`${arg} must be a number.`);
      options[numeric[arg]] = parsed;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      fail(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }

  return options;
}

function requireProgram(program) {
  const result = spawnSync(program, ['-version'], { encoding: 'utf8', windowsHide: true });
  if (result.error && result.error.code === 'ENOENT') {
    fail(`${program} is required on PATH.`);
  }
  if (result.error) fail(`Could not run ${program}: ${result.error.message}`);
  if (result.status !== 0) fail(`${program} failed to report its version.`);
}

function run(program, args, description) {
  const result = spawnSync(program, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) fail(`Could not run ${program}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || '').trim();
    fail(`${description}${detail ? `: ${detail}` : '.'}`);
  }
  return result.stdout || '';
}

function resolveFile(filePath, label) {
  const resolved = path.resolve(filePath);
  let stats;
  try {
    stats = statSync(resolved);
  } catch {
    fail(`${label} not found: ${resolved}`);
  }
  if (!stats.isFile()) fail(`${label} must be a file: ${resolved}`);
  return resolved;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}
if (!options.video) fail(`--video is required.\n\n${USAGE}`);
if (options.expectedDuration < 0) fail('Expected duration must be nonnegative.');
if (options.width <= 0 || options.height <= 0 || options.fps <= 0) {
  fail('Dimensions and FPS must be positive.');
}

requireProgram('ffprobe');
requireProgram('ffmpeg');

const videoPath = resolveFile(options.video, 'Video');
const probeRaw = run(
  'ffprobe',
  ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', videoPath],
  'ffprobe failed',
);

let probe;
try {
  probe = JSON.parse(probeRaw);
} catch {
  fail('Could not parse ffprobe JSON output.');
}

const streams = Array.isArray(probe.streams) ? probe.streams : [];
const videoStreams = streams.filter((stream) => stream.codec_type === 'video');
const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');
if (videoStreams.length !== 1 || audioStreams.length !== 1) {
  fail('Expected one video stream and one audio stream.');
}
const video = videoStreams[0];
const audio = audioStreams[0];

const rate = String(video.avg_frame_rate || '').split('/');
if (rate.length !== 2 || Number(rate[1]) === 0) fail('Invalid average frame rate.');
const fps = Number(rate[0]) / Number(rate[1]);
if (!Number.isFinite(fps)) fail('Invalid average frame rate.');

const duration = Number(probe.format && probe.format.duration);
if (!Number.isFinite(duration)) fail('Could not read the format duration.');

if (video.codec_name !== 'h264' || audio.codec_name !== 'aac') {
  fail('Expected H.264 video and AAC audio.');
}
if (Number(video.width) !== options.width || Number(video.height) !== options.height) {
  fail(`Unexpected dimensions: ${video.width}x${video.height}.`);
}
if (Math.abs(fps - options.fps) > 0.001) fail(`Unexpected FPS: ${fps}.`);

const frames = video.nb_frames == null ? null : Number(video.nb_frames);
if (options.expectedDuration > 0) {
  if (Math.abs(duration - options.expectedDuration) > 1 / options.fps + 0.001) {
    fail(`Unexpected duration: ${duration} seconds.`);
  }
  const expectedFrames = Math.round(options.expectedDuration * options.fps);
  if (!Number.isFinite(frames) || frames !== expectedFrames) {
    fail(`Expected ${expectedFrames} frames; found ${video.nb_frames ?? 'unknown'}.`);
  }
}

run(
  'ffmpeg',
  ['-nostdin', '-hide_banner', '-loglevel', 'error', '-xerror', '-i', videoPath, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'],
  'Full audio/video decode failed',
);

let referenceAudioIdentical = null;
if (options.reference) {
  const referencePath = resolveFile(options.reference, 'Reference video');
  const hashes = [videoPath, referencePath].map((inputVideo) => {
    const output = run(
      'ffmpeg',
      ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', inputVideo, '-map', '0:a:0', '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'],
      `Audio hashing failed for ${inputVideo}`,
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
  Video: videoPath,
  DurationSeconds: duration,
  Dimensions: `${video.width}x${video.height}`,
  Fps: fps,
  Frames: frames,
  VideoCodec: video.codec_name,
  AudioCodec: audio.codec_name,
  SampleRate: Number(audio.sample_rate),
  Channels: Number(audio.channels),
  FullDecodePassed: true,
  ReferenceAudioIdentical: referenceAudioIdentical,
};

if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Video: ${result.Video}`);
  console.log(`Duration: ${result.DurationSeconds} s`);
  console.log(`Dimensions: ${result.Dimensions}`);
  console.log(`FPS: ${result.Fps}`);
  console.log(`Frames: ${result.Frames ?? 'unknown'}`);
  console.log(`Codecs: ${result.VideoCodec} / ${result.AudioCodec} (${result.SampleRate} Hz, ${result.Channels} ch)`);
  console.log('Full decode: passed');
  console.log(
    `Reference audio identical: ${
      referenceAudioIdentical === null ? 'not checked' : referenceAudioIdentical ? 'yes' : 'no'
    }`,
  );
}
