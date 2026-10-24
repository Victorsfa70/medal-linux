# Validation — 0.3.6

Tests run on Ubuntu 24.04 x86-64 with a virtual X11 display, pinned Electron 43.8.3 and the official ABI-148 SQLite binding. Test-only network blocking and instrumentation are excluded from release artifacts. Production networking is unchanged.

Earlier 0.3.x tests passed: native window/tray creation, original Show/Hide and Stop Screen Recording actions, screen enumeration, real CPU recording, thumbnail/library registration, Chromium video playback, save on exit and persistence. Original hotkey editing IPC, real X11 global shortcuts, replay clip saving and restart persistence passed. Numpad tests covered 18 physical keypad keys, Num Lock states, distinct top-row/normal Enter keys, held mouse buttons and helper cleanup after parent death.

0.3.4 game tests exercise real X11 fixture windows: one with Sober's class identity and one unknown game. They verify the original process-list and setTargetProcess IPC, classification, selected-window capture size/pixels, moving the visible window, saving on window close, automatic detection of a remembered active window, game replay, explicit switching back to monitor capture, stopping on minimization, and reloading remembered classes without persisting stale window IDs or window titles. These are synthetic fixtures, not tests of real Roblox/Sober gameplay, fullscreen game rendering, anti-cheat interaction, Wine/Proton or GPU performance.

Setup messages are English. Launcher-only dialog locale does not overwrite the environment passed to Medal. Exact DEB and ZIP payloads are checked against the builder's allowlist; no generated app, proprietary logo/binaries, test profile, database, cookies, account preferences, recordings or logs are included. The existing installed profile is preserved, not erased.

The SQLite native binding imports GLIBC_2.38 and GLIBCXX_3.4.31. dpkg-shlibdeps resolves these to libc6 >= 2.38 and libstdc++6 >= 13. Older systems are explicitly unsupported. Debian 13 and newer compatible distributions have not been runtime-tested. Xvfb testing does not validate Cinnamon panel rendering, real multi-monitor setups, physical sound devices, NVIDIA NVENC or real game performance. Login, upload, online editor and all original advanced controls have not been validated in this update.

## 0.3.5 targeted regression

Real X11 digit and keypad events are checked against a focused editor while saving replay clips. The original events must reach the editor, Medal must stay hidden, and the saved popup must be non-focusable. Audio invocation and volume are checked with an isolated paplay stub; this does not verify physical speakers. Disabling sound and overlay suppresses their respective feedback. Default sound uses the downloaded Pop WAV; no proprietary audio is included in the installer. Fullscreen overlay visibility still needs real-desktop testing.

## 0.3.6 changes and validation scope

The original ClipEffect resource is identified through the managed ManifestResource table of official MedalEncoder 2643.3040.1. Its file offset is 3036364 and size is 893718 bytes; its SHA-256 is 11f5c8579bdeb0047f9f3db0185f9a6b437d021862dd8471157624b40540691d. Setup range-downloads the pinned official archive, verifies the full extracted executable hash, then verifies the WAV hash. No Windows executable is run and no vendor sound is redistributed.

Native notification dispatch and pointer-coordinate hints are checked with stubs. The Cinnamon notification preference is based on its upstream messageTray source; the real Cinnamon panel, native notification rendering on multiple physical monitors and physical speaker playback require user testing. No fake native window is used to claim a system notification.

Game detection starts from Linux readiness independently of nativeRecorder.run(). Passed: fresh-game detection without setTargetProcess or Windows run(), Steam-path/Steam-window-class recognition, browser exclusion, Flatpak identity matching, and manual-stop suppression. A real new content row was read back with an empty title. Real Sober/Proton game rendering remains untested here.

## Performance and title changes

New content rows explicitly set the library title to an empty string. Internal unique filenames are preserved. The real CPU recording tests check that the library row remains untitled after insertion.

NVENC uses supported P1/low-latency options (verified against the host FFmpeg option list; NVIDIA hardware unavailable). CPU fallback under GPU/automatic selection is bounded to 30 FPS / 720p. CPU/filter thread counts and thumbnail decoding are bounded, and redundant same-size scaling is removed. Real FFmpeg output is inspected for dimensions, duration and encoding arguments. These checks establish implementation behavior, not real Sober performance improvement or a multi-monitor NVIDIA benchmark.
