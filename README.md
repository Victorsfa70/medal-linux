# Medal Linux adaptation

Unofficial, experimental Linux adaptation of Medal.tv for x86-64 systems using X11. It is not affiliated with or supported by Medal.tv.

**Beta installer:** [GitHub Releases](https://github.com/Victorsfa70/medal-linux/releases)

## Compatibility

Tested by the maintainer on Linux Mint 22 (Cinnamon, X11). Ubuntu 24.04 is suitable for the package dependencies, but broader desktop and hardware testing is limited. Requires x86-64, glibc 2.38+, libstdc++ 13+, Python 3.11+, X11 and FFmpeg. Wayland, ARM and older Mint/Ubuntu/Debian releases are unsupported.

The app downloads the official Medal components during setup. The repository and installer do not include Medal's client binaries or user data.

## What works

The original Medal interface, tray icon, replay recording, configurable shortcuts (including numpad keys), Linux desktop notifications and manual game-window selection. Sober/Roblox, Minecraft and some Steam/Proton games can be detected automatically.

Game detection and recording performance still need testing on more systems and games. Window capture requires the game to stay visible on X11. Some Windows-only Medal features are not implemented.

## Install from source

See [VALIDATION.md](VALIDATION.md) for setup, compatibility details and test status. See [NOTICE.md](NOTICE.md) for third-party notices.

## Privacy and local data

The installer downloads pinned components from their publishers and verifies their checksums. Your Medal account, settings, shortcuts and recordings stay in your local profile; none are included in this repository. Review the source and diagnostics before sharing them.

