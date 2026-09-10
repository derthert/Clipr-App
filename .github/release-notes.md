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
