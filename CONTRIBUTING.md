# Contributing

Issues and pull requests are welcome, including plain "this was confusing" reports. You do not
need permission to open one.

## Running the project

```bash
npm install
npm run dev          # the web version at http://localhost:5173
npm run desktop:dev  # the desktop window, with live reload
```

`npm install` pulls two large binaries: the ffmpeg WebAssembly core for the browser, and a native
ffmpeg for the desktop build. Expect the first install to take a minute.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm run build
```

All three have to pass. There is no test suite yet, so please say in the pull request what you
actually clicked through: which video, which settings, what came out.

## House style

The code is deliberately ordinary: React, TypeScript, hand written CSS, no state library. A few
things we keep to:

- **Comments are rare.** One line at the top of a file saying what it is for, and nothing else
  unless the code genuinely cannot explain itself.
- **No new dependencies** without a reason that cannot be met by twenty lines of our own code.
- **The web and desktop versions share everything.** Anything platform specific goes behind the
  bridge in `src/lib/desktop.ts`, never inline in a component.
- **Settings stay few.** The main screen is a video, a range and an export button. New options
  need a strong case, and they belong behind the gear.

## Layout

| Path | What lives there |
| --- | --- |
| `src/components` | The UI, one file per piece |
| `src/hooks` | Playback, the export queue, hotkeys, persistence |
| `src/lib` | Cutting, settings, time and file helpers |
| `electron` | The desktop shell and its bridge |
| `scripts` | Install and launch helpers |

## Licence

By contributing you agree that your work is released under the [MIT licence](LICENSE).
