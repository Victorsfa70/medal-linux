"""Extract the original ClipEffect WAV from a pinned official recorder; execute nothing."""
import hashlib
import io
from pathlib import Path
import shutil
import urllib.request
import zipfile

URL = 'https://cdn.medal.tv/production/candidate/recorder/v2643.3040.1.zip'
EXE_SHA256 = '6c33082780f0ab0d2a2c2b9733b4a3a933694012774fe9bfd327087106e2d02e'
WAV_SHA256 = '11f5c8579bdeb0047f9f3db0185f9a6b437d021862dd8471157624b40540691d'
# ManifestResource: MedalEncoder.Sound.Assets.ClipEffect.wav, in this exact EXE.
WAV_OFFSET, WAV_SIZE = 3036364, 893718

class OfficialZip(io.RawIOBase):
    def __init__(self):
        self.pos = 0
        with self.response(0, 0) as response:
            self.size = int(response.headers['Content-Range'].split('/')[-1])
        if not 0 < self.size < 2_000_000_000: raise RuntimeError('Invalid official recorder archive size.')
    def response(self, first, last):
        response = urllib.request.urlopen(urllib.request.Request(URL, headers={'Range': f'bytes={first}-{last}', 'User-Agent': 'MedalLinuxPrototype/0.3.7'}), timeout=60)
        if response.status != 206 or not response.headers.get('Content-Range', '').startswith(f'bytes {first}-{last}/'):
            response.close(); raise RuntimeError('Official server did not honor the requested byte range.')
        return response
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        if self.pos < 0: raise ValueError('Negative archive offset')
        return self.pos
    def read(self, size=-1):
        if size < 0: size = self.size - self.pos
        size = min(size, self.size - self.pos)
        if size <= 0: return b''
        if size > 32 * 1024 * 1024: raise RuntimeError('Unexpected recorder archive entry size.')
        with self.response(self.pos, self.pos + size - 1) as response: data = response.read(size + 1)
        if len(data) != size: raise RuntimeError('Incomplete official recorder archive range.')
        self.pos += len(data); return data

def valid(file):
    return file.is_file() and hashlib.sha256(file.read_bytes()).hexdigest() == WAV_SHA256

def install_sound(root, app):
    cached = Path(root) / 'downloads/medal-original-clip.wav'
    if not valid(cached):
        print('Downloading the original Medal clip sound from the official recorder…', flush=True)
        with zipfile.ZipFile(OfficialZip()) as archive:
            info = archive.getinfo('MedalEncoder.exe')
            if info.file_size > 32 * 1024 * 1024: raise RuntimeError('Unexpected official recorder size.')
            binary = archive.read(info)
        if hashlib.sha256(binary).hexdigest() != EXE_SHA256: raise RuntimeError('Official recorder integrity check failed.')
        sound = binary[WAV_OFFSET:WAV_OFFSET + WAV_SIZE]
        if hashlib.sha256(sound).hexdigest() != WAV_SHA256: raise RuntimeError('Original clip sound integrity check failed.')
        cached.parent.mkdir(parents=True, exist_ok=True)
        temporary = cached.with_suffix('.part'); temporary.write_bytes(sound); temporary.replace(cached)
    destination = Path(app) / 'src/assets/sound-alerts/default.wav'
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(cached, destination)
    print('✓ Original Medal clip sound verified.', flush=True)
