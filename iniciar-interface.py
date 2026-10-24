#!/usr/bin/env python3
"""GUI launcher for the desktop entry; never opens a terminal window."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get('MEDAL_LINUX_DIR', str(Path.home() / '.local/share/medal-linux-prototype'))).expanduser()
BUILD = '0.3.6-native-feedback'

def dialog_env():
    return {**os.environ, 'LANGUAGE': 'en', 'LC_ALL': 'C.UTF-8'}

def message(title, text):
    if shutil.which('zenity'):
        subprocess.run(['zenity', '--error', '--no-markup', '--title=' + title, '--text=' + text[:7000], '--width=640'], env=dialog_env())
    else:
        try:
            import tkinter.messagebox
            tkinter.messagebox.showerror(title, text[:7000])
        except Exception:
            print(title + ': ' + text, file=sys.stderr)

def main():
    try:
        current = json.loads((ROOT / 'build.json').read_text()).get('build')
    except (OSError, ValueError):
        current = None
    env = dict(os.environ)
    env.pop('MEDAL_LINUX_TEST', None)
    if current != BUILD or not (ROOT / 'runtime/electron').is_file():
        progress = None
        if shutil.which('zenity'):
            progress = subprocess.Popen(['zenity', '--progress', '--pulsate', '--auto-close', '--title=Preparing Medal Linux', '--text=Preparing the application…', '--width=470', '--no-cancel'], stdin=subprocess.PIPE, text=True, env=dialog_env())
        setup = subprocess.Popen([sys.executable, str(HERE / 'preparar-aplicativo.py')], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        output = []
        for line in setup.stdout:
            output.append(line)
            if progress and progress.poll() is None:
                try:
                    progress.stdin.write('# ' + line.strip() + '\n'); progress.stdin.flush()
                except (BrokenPipeError, OSError):
                    pass
        status = setup.wait()
        if progress:
            try: progress.stdin.close()
            except (BrokenPipeError, OSError): pass
            try: progress.wait(timeout=5)
            except subprocess.TimeoutExpired: progress.terminate()
        if status:
            message('Unable to prepare Medal', ''.join(output)[-6500:]); return status
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / 'iniciar-interface.log').open('w') as output:
        process = subprocess.run([sys.executable, str(HERE / 'preparar-aplicativo.py'), '--run'], stdout=output, stderr=subprocess.STDOUT, env=env)
    if process.returncode:
        log = ROOT / 'ultima-abertura.log'
        detail = log.read_text(errors='replace')[-6000:] if log.exists() else (ROOT / 'iniciar-interface.log').read_text(errors='replace')[-6000:]
        message('Medal encountered a problem', detail)
    return process.returncode

if __name__ == '__main__':
    try: sys.exit(main())
    except Exception as error: message('Medal encountered a problem', str(error)); sys.exit(1)
