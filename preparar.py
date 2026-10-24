#!/usr/bin/env python3
"""Download pinned official packages and apply the local Linux prototype adapters."""
import argparse
import ctypes
import ctypes.util
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
import zlib
from original_sound import install_sound

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get('MEDAL_LINUX_DIR', str(Path.home() / '.local/share/medal-linux-prototype'))).expanduser().resolve()
BUILD = '0.3.6-native-feedback'
PACKAGES = [
    ('medal.nupkg', 'https://cdn.medal.tv/production/electron/Medal-2643.583.1-production-full.nupkg', 'f90404d67a87e1e6f0c00800ef03effd7385c50aa0e7cf58465bf9037fa2e25c'),
    ('electron.zip', 'https://github.com/electron/electron/releases/download/v43.8.3/electron-v43.8.3-linux-x64.zip', '73d7d6fe120c998db75834c23c8ce7ce8390607c198b2e167a28acd7937bef22'),
    ('sqlite.zip', 'https://cdn.medal.tv/production/sqlite/node-v148-linux-x64-632b9191260d307a018025a4fa4e358a8ffc0313f41db8f40ecbc3acd621435f.zip', '81dad2bb54bea481162f7f06b023fb8b423ab48169b61b2e46dd976cd4fd5ae5'),
]

def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

def download(name, url, expected):
    destination = ROOT / 'downloads' / name
    if destination.is_file() and digest(destination) == expected:
        print(f'✓ {name} verified.', flush=True)
        return destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + '.part')
    print(f'Downloading {name} from the official source…', flush=True)
    request = urllib.request.Request(url, headers={'User-Agent': 'MedalLinuxPrototype/0.1'})
    with urllib.request.urlopen(request, timeout=120) as response, temporary.open('wb') as output:
        total = 0
        last = 0
        while block := response.read(1024 * 1024):
            output.write(block)
            total += len(block)
            if total - last >= 16 * 1024 * 1024:
                print(f'  {total // (1024 * 1024)} MB', flush=True)
                last = total
    if digest(temporary) != expected:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f'Integrity check failed for {name}. No files from this package were executed.')
    temporary.replace(destination)
    return destination

def safe_path(root, name):
    result = root.joinpath(*name.replace('\\', '/').split('/')).resolve()
    if not result.is_relative_to(root.resolve()):
        raise RuntimeError('Invalid path in package.')
    return result

def read_member(archive, info):
    if info.compress_type != 93:
        return archive.read(info)
    library = ctypes.util.find_library('zstd')
    if not library:
        raise RuntimeError('libzstd1 is missing. Install it with: sudo apt install libzstd1')
    zstd = ctypes.CDLL(library)
    zstd.ZSTD_decompress.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t]
    zstd.ZSTD_decompress.restype = ctypes.c_size_t
    with Path(archive.filename).open('rb') as source:
        source.seek(info.header_offset)
        header = struct.unpack('<IHHHHHIIIHH', source.read(30))
        if header[0] != 0x04034B50:
            raise RuntimeError('Invalid ZIP header.')
        source.seek(header[-2] + header[-1], 1)
        compressed = source.read(info.compress_size)
    output = ctypes.create_string_buffer(info.file_size)
    size = zstd.ZSTD_decompress(output, len(output), compressed, len(compressed))
    if size != info.file_size or zlib.crc32(output.raw) != info.CRC:
        raise RuntimeError(f'Failed to extract {info.filename}.')
    return output.raw

def extract_interface(package, app):
    with zipfile.ZipFile(package) as archive:
        asar = read_member(archive, archive.getinfo('lib/app/resources/app.asar'))
        _, header_size, _, json_size = struct.unpack('<IIII', asar[:16])
        header = json.loads(asar[16:16 + json_size])
        data_offset = 8 + header_size
        def walk(directory, parent=''):
            for name, entry in directory.get('files', {}).items():
                relative = f'{parent}/{name}'.lstrip('/')
                if 'files' in entry:
                    walk(entry, relative)
                elif 'offset' in entry and not entry.get('unpacked'):
                    destination = safe_path(app, relative)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    start = data_offset + int(entry['offset'])
                    data = asar[start:start + entry['size']]
                    if len(data) != entry['size']:
                        raise RuntimeError('Truncated ASAR entry.')
                    destination.write_bytes(data)
        walk(header)
        prefix = 'lib/app/resources/app.asar.unpacked/'
        for info in archive.infolist():
            if not info.filename.startswith(prefix) or info.filename.endswith(('/', '.exe', '.node')):
                continue
            destination = safe_path(app, info.filename[len(prefix):])
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(read_member(archive, info))

def replace_once(file, old, new):
    text = file.read_text()
    if text.count(old) != 1:
        raise RuntimeError(f'Unexpected Medal version: {file.name}. Setup was stopped.')
    file.write_text(text.replace(old, new))

def install(packages):
    ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='preparando-', dir=ROOT) as temporary:
        work = Path(temporary)
        app = work / 'app'
        app.mkdir()
        print('Extracting the interface and resources…', flush=True)
        extract_interface(packages[0], app)
        runtime = work / 'runtime'
        runtime.mkdir()
        with zipfile.ZipFile(packages[1]) as archive:
            for info in archive.infolist():
                destination = safe_path(runtime, info.filename)
                if info.is_dir():
                    destination.mkdir(parents=True, exist_ok=True)
                    continue
                if stat.S_ISLNK(info.external_attr >> 16):
                    raise RuntimeError('Unexpected link in Electron package.')
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(info))
                destination.chmod((info.external_attr >> 16) & 0o777 or 0o644)
        binding = app / 'lib/binding/node-v148-linux-x64/better_sqlite3.node'
        binding.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(packages[2]) as archive:
            data = archive.read('better_sqlite3.node')
        if hashlib.sha256(data).hexdigest() != '632b9191260d307a018025a4fa4e358a8ffc0313f41db8f40ecbc3acd621435f':
            raise RuntimeError('SQLite binding integrity check failed.')
        binding.write_bytes(data)
        install_sound(ROOT, app)
        for source in (HERE / 'adaptacao').iterdir():
            if source.is_file(): shutil.copy2(source, app / source.name)
        replace_once(app / 'index.js', "require('velopack')", "require('./linux-velopack.cjs')")
        main = app / 'main.min.js'
        replace_once(main, 'require("velopack")', 'require("./linux-velopack.cjs")')
        replace_once(main, 'async function btt(){await joe();', 'async function btt(){await joe();return;')
        replace_once(main, 'W.Telemetry=wr;', 'W.Telemetry=wr;wr.track=()=>{};wr.setUserProperties=()=>{};wr.setUserPropertiesOnce=()=>{};')
        replace_once(main, 'W.sampledSendToHoneycomb=Ga;', 'W.sampledSendToHoneycomb=()=>{};')
        replace_once(main, 'async function TM(e,t,r=W.recorder?.namespacePath){', 'async function TM(e,t,r=W.recorder?.namespacePath){if(process.platform==="linux")return require("./linux-media.cjs").thumbnail(e,t);')
        replace_once(main, 'minHeight:800,show:!1,frame:!1,paintWhenInitiallyHidden:!0', 'minHeight:800,show:!1,frame:!0,autoHideMenuBar:!0,paintWhenInitiallyHidden:!0')
        replace_once(main, 'backgroundColor:"#000000",titleBarStyle:"hidden"', 'backgroundColor:"#000000",titleBarStyle:"default"')
        replace_once(main, 'var jY=process.platform==="win32"||process.platform==="darwin",H7e=', 'var jY=["win32","darwin","linux"].includes(process.platform),H7e=')
        replace_once(main, 'bte=()=>process.platform==="win32"?', 'bte=()=>process.platform==="linux"?ne.nativeImage.createFromPath(`${ne.app.getAppPath()}/src/assets/icon/MedalApp.png`).resize({width:24,height:24}):process.platform==="win32"?')
        replace_once(main, 'this.tray.setIgnoreDoubleClickEvents(!0);const t=()=>{process.platform==="win32"&&this._show()}', 'process.platform==="darwin"&&this.tray.setIgnoreDoubleClickEvents(!0);const t=()=>{process.platform!=="darwin"&&this._show()}')
        replace_once(main, 'Ignoring screen recording start for cafe guest session");return}W.WSHandler', 'Ignoring screen recording start for cafe guest session");return}if(process.platform==="linux")return require("./linux-recording.cjs").setCapturing(e);W.WSHandler')
        replace_once(main, 'Ignoring game request for cafe guest session");return}return W.logger.info', 'Ignoring game request for cafe guest session");return}if(process.platform==="linux")return require("./linux-recording.cjs").setTargetProcess(e);return W.logger.info')
        replace_once(app / 'chunks/renderer-useActiveProcesses.js', 'c=await p.get("/games/blacklist",e),', 'c=await p.get("/games/blacklist",e).catch(()=>[]),')
        replace_once(main, 'async _triggerAutoFocusTimeout(){await Ut(xe.AutoFocus)', 'async _triggerAutoFocusTimeout(){if(process.platform==="linux")return;await Ut(xe.AutoFocus)')
        main.write_text(main.read_text() + '\nrequire("./linux-recording.cjs").install({createContent:iW,list:_i,counts:oW,allowPaths:cs,refresh:Yo,context:W,events:Je,getSetting:Ut,setState:jt,setGameState:eq});\n')
        metadata = json.loads((app / 'package.json').read_text())
        metadata['main'] = 'linux-entry.cjs'
        (app / 'package.json').write_text(json.dumps(metadata, indent=2))
        for name in ['app', 'runtime']:
            destination = ROOT / name
            if destination.exists(): shutil.rmtree(destination)
            shutil.move(str(work / name), str(destination))
    (ROOT / 'build.json').write_text(json.dumps({'build': BUILD, 'medal': '2643.583.1', 'electron': '43.8.3', 'offline': False}))
    print('✓ Medal is ready.', flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--rebuild', action='store_true')
    parser.add_argument('--software-rendering', action='store_true')
    args = parser.parse_args()
    print('Checking system requirements…', flush=True)
    if platform.system() != 'Linux' or platform.machine() not in ['x86_64', 'amd64']:
        raise RuntimeError('This prototype requires Linux x64.')
    if platform.libc_ver()[0] != 'glibc' or tuple(map(int, platform.libc_ver()[1].split('.')[:2])) < (2, 38):
        raise RuntimeError('This build requires glibc 2.38 or newer (Mint 22 / Ubuntu 24.04 or newer).')
    stamp = ROOT / 'build.json'
    prepared = stamp.is_file() and json.loads(stamp.read_text()).get('build') == BUILD and (ROOT / 'runtime/electron').is_file()
    if not prepared or args.rebuild:
        install([download(*package) for package in PACKAGES])
    if args.run:
        missing = [name for name in ['ffmpeg', 'ffprobe'] if not shutil.which(name)]
        if missing:
            raise RuntimeError('FFmpeg is missing. Install it with: sudo apt install ffmpeg')
        env = dict(os.environ)
        env.pop('ELECTRON_RUN_AS_NODE', None)
        env.pop('MEDAL_LINUX_TEST', None)
        if args.software_rendering: env['MEDAL_LINUX_SOFTWARE_RENDERING'] = '1'
        command = [str(ROOT / 'runtime/electron'), '--disable-setuid-sandbox', '--class=medal-linux', str(ROOT / 'app')]
        log_path = ROOT / 'ultima-abertura.log'
        print(f'Opening Medal Linux Prototype. Log: {log_path}', flush=True)
        with log_path.open('w') as log:
            status = subprocess.call(command, env=env, stdout=log, stderr=subprocess.STDOUT)
        if status:
            print(log_path.read_text()[-3500:], file=sys.stderr)
            raise RuntimeError(f'The application exited with status {status}. See ultima-abertura.log.')

if __name__ == '__main__':
    try: main()
    except KeyboardInterrupt: print('\nCancelled. Run setup again to continue.'); sys.exit(130)
    except Exception as error: print(f'\nError: {error}', file=sys.stderr); sys.exit(1)
