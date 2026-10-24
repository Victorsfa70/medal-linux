#!/usr/bin/env python3
"""Build bootstrap artifacts from an explicit allowlist, never installed user data."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
VERSION = '0.3.6'
FILES = [
    'README.md', 'LEIA-ME.md', 'AVISOS.md', 'VALIDACAO.md', 'ARQUIVOS.md', '.gitignore',
    'construir-pacote.py', 'preparar-aplicativo.py', 'som_original.py', 'iniciar-interface.py', 'iniciar.sh',
    'adaptacao/entrada-linux.cjs', 'adaptacao/rede-linux.cjs',
    'adaptacao/atualizador-velopack.cjs', 'adaptacao/miniaturas-linux.cjs',
    'adaptacao/nucleo-gravador.cjs', 'adaptacao/gravacao-linux.cjs',
    'adaptacao/notificacao-clipe.cjs', 'adaptacao/atalhos-linux.cjs', 'adaptacao/teclado-global.py',
    'adaptacao/janelas-linux.py', 'adaptacao/jogos-linux.cjs',
]
# Runtime library list resolved using dpkg-shlibdeps on the pinned Electron/SQLite ELFs.
DEPENDENCIES = 'python3 (>= 3.11), libxi6, libnotify-bin, libglib2.0-bin, libzstd1, ffmpeg, pulseaudio-utils, zenity, x11-xserver-utils, x11-xkb-utils, libasound2t64 (>= 1.0.17), libatk-bridge2.0-0t64 (>= 2.5.3), libatk1.0-0t64 (>= 2.32.0), libatspi2.0-0t64 (>= 2.9.90), libc6 (>= 2.38), libcairo2 (>= 1.6.0), libcups2t64 (>= 1.7.0), libdbus-1-3 (>= 1.9.14), libexpat1 (>= 2.1~beta3), libgbm1 (>= 21.1.0), libgcc-s1 (>= 4.2), libglib2.0-0t64 (>= 2.40.0), libgtk-3-0t64 (>= 3.9.10), libnspr4 (>= 2:4.9-2~), libnss3 (>= 2:3.30), libpango-1.0-0 (>= 1.14.0), libstdc++6 (>= 13), libudev1 (>= 183), libx11-6 (>= 2:1.4.99.1), libxcb1 (>= 1.9.2), libxcomposite1 (>= 1:0.4.5), libxdamage1 (>= 1:1.1), libxext6, libxfixes3, libxkbcommon0 (>= 0.5.0), libxrandr2'
LAUNCHER = '#!/bin/sh\nexec python3 /opt/medal-linux-prototype/iniciar-interface.py "$@"\n'
DESKTOP = '[Desktop Entry]\nType=Application\nName=Medal\nComment=Adaptacao experimental do Medal para Linux\nExec=/usr/bin/medal-linux\nIcon=applications-multimedia\nTerminal=false\nCategories=AudioVideo;Video;Game;\nStartupWMClass=medal-linux\n'

def write(root, name, value, executable=False):
    destination = root / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(value)
    destination.chmod(0o755 if executable else 0o644)

def main():
    output = HERE / 'dist'
    output.mkdir(exist_ok=True)
    for name in FILES:
        if not (HERE / name).is_file() or (HERE / name).is_symlink():
            raise RuntimeError(f'Missing or invalid source: {name}')
    with tempfile.TemporaryDirectory(prefix='medal-package-') as temporary:
        root = Path(temporary) / 'package'
        for name in FILES:
            destination = root / 'opt/medal-linux-prototype' / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(HERE / name, destination)
            destination.chmod(0o644)
        write(root, 'usr/bin/medal-linux', LAUNCHER, True)
        write(root, 'usr/share/applications/medal-linux.desktop', DESKTOP)
        size = sum(p.stat().st_size for p in root.rglob('*') if p.is_file()) // 1024 + 1
        write(root, 'DEBIAN/control', f'Package: medal-linux-prototype\nVersion: {VERSION}\nSection: video\nPriority: optional\nArchitecture: amd64\nMaintainer: Local Build <noreply@localhost>\nInstalled-Size: {size}\nDepends: {DEPENDENCIES}\nRecommends: libayatana-appindicator3-1\nDescription: Adaptacao experimental do Medal para Linux\n Baixa componentes oficiais verificados na primeira inicializacao. Requer X11.\n Nao inclui dados de conta nem binarios proprietarios.\n')
        deb = output / f'Medal-Linux-{VERSION}-amd64.deb'
        subprocess.run(['dpkg-deb', '--root-owner-group', '--build', str(root), str(deb)], check=True)
        extracted = Path(temporary) / 'verify'
        subprocess.run(['dpkg-deb', '-x', str(deb), str(extracted)], check=True)
        actual = {str(p.relative_to(extracted)) for p in extracted.rglob('*') if p.is_file()}
        expected = {'opt/medal-linux-prototype/' + name for name in FILES} | {'usr/bin/medal-linux', 'usr/share/applications/medal-linux.desktop'}
        if actual != expected: raise RuntimeError('Unexpected installer payload')
        for name in FILES:
            if (extracted / 'opt/medal-linux-prototype' / name).read_bytes() != (HERE / name).read_bytes(): raise RuntimeError('Source payload mismatch')
    archive = output / 'Medal-Linux-Prototype.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in FILES: z.write(HERE / name, 'Medal-Linux-Prototype/' + name)
    with zipfile.ZipFile(archive) as z:
        if set(z.namelist()) != {'Medal-Linux-Prototype/' + name for name in FILES}: raise RuntimeError('Unexpected source archive payload')
    for file in [deb, archive]:
        print(f'{file.name}: {file.stat().st_size} bytes; SHA256 {hashlib.sha256(file.read_bytes()).hexdigest()}')
    print(f'Payload audit passed: {len(FILES)} allowlisted source files, no client assets/binaries or user profiles.')

if __name__ == '__main__': main()
