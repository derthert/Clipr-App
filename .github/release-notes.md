## What's new in 0.3.1

- **Timeline zoom**: hold Ctrl and scroll (or pinch) to zoom in around the cursor, or use
  the zoom bar above the timeline and the + / - / 0 keys. Scroll to pan while zoomed; the
  view follows the playhead as it plays.
- **Tidier Simple / Full switch** in Settings and on the start screen.

## What's new in 0.3.0

- **Timeline editor**: put several videos on one timeline, trim, split, move, cut, copy
  and paste clips, leave gaps, and export everything as one video. By @yerkam (#15).
- **Text layer**: add captions, drag them on the video and set font, size and color.
  By @yerkam (#15).
- **Much faster exports**: the desktop app now renders every export with its bundled
  ffmpeg, and the web version uses several CPU cores. On a 16-core PC a 30 second 1080p
  clip now exports in about 3 seconds on desktop and 7 seconds in the browser, down from 38.
- **Smaller, better looking files** on desktop, no bitrate cap, and "Original" now keeps
  the full resolution.
- **Simple and Full editor profiles**: Simple keeps it to split, trim and export.
- **Shift + click** moves the playhead anywhere, even over a clip.

Windows build of Clipr. Pick one:

| File | What it is |
| --- | --- |
| `Clipr-Setup-*.exe` | Installer, adds a start menu entry |
| `Clipr-*-portable.exe` | Single file, runs without installing |

Both bundle ffmpeg, so cuts run natively on your own machine and nothing is uploaded
anywhere. Clips are written next to the source video.

Windows may warn that the publisher is unknown, since the build is not code signed.
Choose **More info → Run anyway**, or build it yourself with `npm run desktop:pack`.

No download needed for the web version: **https://derthert.github.io/Clipr-App/**
