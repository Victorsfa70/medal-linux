const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const run = promisify(execFile);
async function thumbnail(input, output) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await run('ffmpeg', ['-v', 'error', '-y', '-threads', '1', '-filter_threads', '1', '-protocol_whitelist', 'file,pipe', '-i', input, '-vf', 'scale=640:480:force_original_aspect_ratio=decrease', '-frames:v', '1', output], { timeout: 30000, maxBuffer: 1024 * 1024 });
  return true;
}
module.exports = { thumbnail };
