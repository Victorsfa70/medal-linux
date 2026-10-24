# Medal Linux adaptation

Experimental community adaptation for Linux x86-64/X11. Current version: **0.3.6**.

[Download the clean DEB installer](packages/Medal-Linux-0.3.6-amd64.deb?raw=1) · [Validation](VALIDATION.md) · [Third-party notice](NOTICE.md)

**Unofficial, community-made adaptation. Not affiliated with, endorsed by, or maintained by Medal.tv.**

This project downloads pinned official Medal, Electron and SQLite packages and applies local compatibility patches. It reuses Medal's original desktop interface and provides a native FFmpeg recording backend. It is an experimental adaptation, not a complete replacement for the Windows recorder.

## Install and update

Close Medal using **Quit Medal** in its tray menu. Open `Medal-Linux-0.3.6-amd64.deb` with your package installer, install it, then launch **Medal** from the applications menu. No terminal is needed. Setup messages are English; Medal's language setting is preserved. The first launch downloads approximately 240 MB of official components; reserve at least 1 GB plus recording space. Internet access is required for first setup.

Updates preserve your existing account, preferences, shortcuts and videos. The distributed installer contains none of those files. Each installation creates its own local profile. The desktop menu uses the system multimedia icon; Medal's downloaded interface and original tray keep their original assets.

For an Ubuntu 24.04 / Mint 22 source installation, build and install the bootstrap to resolve the full dependency list: `python3 build-package.py`, then `sudo apt install ./dist/Medal-Linux-0.3.6-amd64.deb`. Alternatively install the dependencies listed in `build-package.py` and run `bash Iniciar.sh`. Diagnostic options: `--rebuild` and `--software-rendering`.

## Games and recording

Open a game before opening Medal's original **Select Game** dialog. Refresh the list, choose its window, and confirm. The list now includes visible Linux application windows, including games whose executables are not in Medal's Windows detection database. Process labels include the window title and ID to distinguish multiple windows.

Sober/Roblox and Minecraft window classes are recognized locally. Unknown games can be selected manually. Selecting a window starts recording or replay using Medal's original mode setting. Once selected, a game's class and executable name are remembered locally. Recognized or remembered games can start capture when recording is enabled. With several candidates, focus the desired game. The detector does not treat every open application as a game. Native game paths and identities are recognized; an unknown game needs one manual selection.

Capture targets the selected X11 window, rather than silently recording an entire monitor. Keep the game visible and unobscured: X11 capture does not reliably capture content behind other windows. Closing or minimizing the game ends its capture; changing its size ends the current file and permits capture to start again when the game is active. A game that removes its X11 window cannot keep being captured. Wayland and native Wayland game windows are not supported. Flatpak applications are visible only when they expose a normal window on the same X11 display.

For desktop recording use the original Screen Recording controls. Starting Screen Recording explicitly switches from the game window to the selected monitor. This version does not implement every original per-game control or game overlay.

Long recording uses MKV/H.264; replay saves MP4 clips from roughly two-second segments. Maximum output is 1920 × 1080 with aspect ratio preserved, up to 60 FPS. CPU encoding works; NVENC is attempted when selected and available. System and microphone audio use PulseAudio or PipeWire's PulseAudio interface. Advanced device selection, per-process audio, multiple audio tracks, presets, webcam and overlays are not fully implemented.

## Keyboard shortcuts and tray

Use the original pencil button to choose a shortcut. Escape, focus loss or 30 seconds of inactivity cancels editing. Existing configured shortcuts are suspended during editing. The adapter adds no fixed global shortcuts.

Short keyboard presses for Clip and Start/Stop long recording work. Clip needs active replay mode with enough buffered footage; it does not extract footage from a continuous recording. Mouse/controller bindings, long presses, push-to-talk, bookmarks and screenshots are not integrated.

Physical numpad keys are distinct from the normal number row and Enter, including with Num Lock off. Supported: 0–9, add, subtract, multiply, divide, decimal, comma, Enter and equals, where present on the keyboard, with Ctrl/Alt/Shift/Super combinations. Reassign old numpad bindings that were previously saved as ordinary number keys. The same key continues to reach the focused application. A plain digit assigned as Clip will therefore both type the digit and save a clip; choose a key combination if you do not want clipping while typing.

The original tray offers Show/Hide, Stop Screen Recording and Quit Medal. Closing the window normally hides it according to Medal's original setting. No OS autostart is added. The desktop must provide a compatible notification area. Linux automatic foreground activation after a game ends is disabled. Saved recordings/clips play the selected alert (the original ClipEffect sound by default) and send a native “Medal Clipped” desktop notification without taking focus. Sound volume, notification switches and streamer mode are respected; desktop policy controls banner placement and fullscreen behavior.

## Compatibility

| Environment | Status |
| --- | --- |
| Linux Mint 22, x86-64, Cinnamon X11 | Previous releases opened, connected and used tray/shortcuts in user testing; new game detection still needs real-game testing |
| Ubuntu 24.04, x86-64, X11 | Local application and FFmpeg tests passed using Xvfb |
| Debian 13 / other newer Debian or Ubuntu derivatives, x86-64, X11 | ABI requirements appear satisfied; not runtime-tested |
| Mint 21 / Ubuntu 22.04 / Debian 12 | Incompatible with the pinned SQLite binding's glibc 2.38 requirement; some also lack Python 3.11 |
| Fedora / Arch | No direct `.deb` installation; source route is untested and requires equivalent dependencies |
| Wayland / ARM64 / 32-bit Linux | Unsupported by this build |

Requirements: Linux x86-64, glibc >= 2.38, libstdc++ >= 13, Python >= 3.11, X11, FFmpeg with x11grab, PulseAudio-compatible audio, and Electron runtime libraries. See the Debian dependency list in `build-package.py`. An ABI check is not a full distribution or hardware test.

## Local files and privacy

| Content | Default path |
| --- | --- |
| Download cache and generated app | `~/.local/share/medal-linux-prototype` |
| Account, preferences and database | `~/.config/medal-linux-prototype` |
| Remembered game classes | `~/.config/medal-linux-prototype/linux-game-targets.json` |
| Videos | `~/.config/medal-linux-prototype/Videos/Medal/Gravacoes` |
| Launch log | `~/.local/share/medal-linux-prototype/ultima-abertura.log` |

Setup downloads are SHA-256 verified. The original Windows updater is disabled. Ordinary Medal connections remain enabled. Main telemetry calls and known analytics destinations are filtered; this is not a complete privacy audit of the proprietary client. Window detection reads visible titles/classes/PIDs/executable basenames, not process command lines or keyboard input. The XInput2 helper passively matches configured bindings without grabbing keys. It keeps only configured-key/modifier state in memory, emits matching binding IDs, and never saves typed text.

The package builder uses an explicit source allowlist. It never reads your installed profile, download cache, extracted app, recordings, cookies or logs. Do not add those directories to a repository or publish a backup of an installed profile. `.gitignore` is an additional convenience, not a substitute for checking already tracked files.

## GitHub and third-party rights

The source archive and bootstrap `.deb` contain the adaptation scripts and documentation, not Medal's extracted app, official binary packages, logo, runtime, account data or recordings. The official client is downloaded and modified on the installing user's machine. Patch instructions necessarily contain small matching fragments from the pinned version; this is not a claim of permission to redistribute Medal code or to modify its client.

Do not describe this as an authorized port or assume a wrapper is automatically permitted. Medal retains its proprietary rights; a disclaimer does not grant a license. Review [Medal's current terms](https://medal.tv/terms) and obtain written permission from Medal before a public release if you need certainty about this adaptation. No MIT/GPL license is applied to Medal's code or assets. No project-wide open-source license has been selected for the adaptation yet. See `NOTICE.md`.

Build a clean package with `python3 build-package.py`. Review the resulting archive and installer before publishing. Review the third-party terms before considering a public release.

## Native notifications and the original clip sound (0.3.6)

Clip feedback now uses your Linux notification service through `notify-send`; no separate popup window is created. Enable Medal's **Allow notification popups** setting and disable the desktop's Do Not Disturb mode if banners do not appear. Streamer mode suppresses the banner. Medal's Windows-only game overlay setting does not disable these native desktop notifications.

The default clipping sound is the original `MedalEncoder.Sound.Assets.ClipEffect.wav`, extracted without executing the Windows recorder. The pinned source is recorder 2643.3040.1. Both the executable bytes and WAV are SHA-256 verified; the WAV is installed locally at setup time and is not distributed in this repository or bootstrap DEB. A fresh setup requires a small additional range download from Medal's official server. Pick **Default** in Medal's sound settings to use it; other selected presets remain selected.

On Cinnamon, the adapter sets `org.cinnamon.desktop.notifications` → `notification-screen-display` to `active-screen`, so native notifications follow the active monitor at the pointer. **This is a global Cinnamon preference and also affects other applications' notifications.** You can change it back in the desktop's Notifications settings. Other desktops receive pointer-coordinate hints but may ignore them; this build cannot guarantee cursor-monitor placement on GNOME, KDE or XFCE. Fullscreen suppression and Do Not Disturb remain controlled by the desktop. There is no custom overlay fallback.

The detector now starts when the Linux app is ready, independently of the Windows recorder startup path. It checks visible X11 windows every two seconds. Recognition uses Sober/Roblox and Minecraft identities, known game executable names, Steam `steamapps/common` executable paths and `steam_app_<id>` window identities (including Proton), and explicitly remembered classes. Flatpak application IDs are used when available. A single recognized game can be detected while Medal has focus; with several candidates, focus the desired game. A normal browser displaying a game's name is not treated as that game. Arbitrary Linux applications still need one manual selection. A manually stopped game is paused for that window lifetime, so detection does not immediately undo Stop; select it again or reopen its window to resume.

### If your game is still missing

1. Make sure your desktop session is X11 (`echo "$XDG_SESSION_TYPE"`); Wayland is unsupported.
2. Open the actual game window, not only its launcher. Keep it visible and not minimized.
3. Enable recording in Medal, focus the game, and wait a few seconds. If several recognized games are open, the focused one wins.
4. Try **Select Game** once for an unrecognized game. That class/executable is remembered locally. This is window recognition, not Medal's proprietary Windows hook or automatic highlight detection.
5. For a bug report, include distribution/version, desktop, X11/Wayland, game name and install type (native/Steam/Proton/Flatpak). If needed, run `python3 /opt/medal-linux-prototype/adaptacao/linux-windows.py`. Its output contains visible window titles, PIDs and executable paths: redact personal titles/paths before sharing. Never upload your entire profile or logs without checking them.

### Remove or reinstall

Remove **medal-linux-prototype** using the package manager, or `sudo apt remove medal-linux-prototype`. The local profile and videos are preserved. Reinstalling the DEB also preserves them. To remove recordings or account data, use your file manager after quitting Medal and keep a backup of anything you need; uninstalling does not erase your clips.

## Repository and distribution

This repository is private during development. Do not enable GitHub Pages or change visibility until the maintainer explicitly decides to publish. The README is the repository landing page.

The tracked installer under `packages/` is a small bootstrap generated from this adaptation's explicit allowlist. Its SHA-256 is recorded in `packages/SHA256SUMS`. Official Medal binaries, logo, sound files, extracted clients and user profiles are not committed. Official components and the original clip sound are downloaded from pinned vendor sources at setup time.

Build a clean installer/source ZIP with `python3 build-package.py`. Keep generated dependencies, profiles, credentials, recordings and debug logs out of Git history. A project license does not grant rights over Medal code/assets; no blanket open-source license is asserted here.

To report a bug, include the environment, reproduction steps and expected/actual behavior. Review and redact diagnostic files before attaching them.

## Recording performance and untitled clips

New recordings and replay clips have an empty library title. Medal may display its normal “Untitled” placeholder. Internal filenames still contain unique IDs/timestamps so files cannot overwrite one another; existing clips are not renamed.

The recorder uses NVENC's fast P1 preset with low-latency settings when NVIDIA encoding works. This favors game performance over the previous P4 compression/quality tradeoff. Redundant same-size scaling is removed; filter worker counts, video input buffering, thumbnail generation and CPU encoder threads are bounded. The recording process has lower CPU scheduling priority than the game. These changes reduce avoidable contention, but X11 readback still has a cost and cannot provide zero-overhead GPU capture.

If **GPU/automatic** encoding is selected but NVENC fails, the CPU fallback now limits recording to at most **720p / 30 FPS** and two encoder threads, instead of silently competing with the game at 1080p / 60 FPS. The original requested settings remain saved. Selecting **CPU** explicitly keeps the requested FPS (up to 60) and the normal 1080p maximum, with bounded encoding threads. For the lowest load, select GPU encoding and try 30 FPS in Medal's normal settings. This build does not include a new preset interface or change the game's FPS limit.

Technical status is saved locally to `~/.config/medal-linux-prototype/recording-diagnostics.json`: actual encoder, requested/capture FPS, fallback status, thread limit and recent progress counters. A failed NVENC probe includes the driver/FFmpeg error. This file is not included in the distributed artifacts. If performance is still poor, report these values and compare game FPS with capture stopped versus running. No real Sober/NVIDIA gameplay benchmark has been performed here, so a performance fix on every machine is not claimed.
