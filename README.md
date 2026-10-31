# VMA — VS Code Extension

Language support for **VMA (Visual Macro Assembler)**, the 6502 / 6510 assembler of
[C64 Visual Assembler](https://github.com/zstarczali/VisualAssembler) and its command-line compiler
[`vma`](https://github.com/zstarczali/VMA). Write C64 assembly with syntax highlighting, snippets for every
directive and library macro, an outline, and one-click build & run in VICE — all from VS Code.

*© 2026 Zsolt Tarczali*

---

## Installation

If you have a local `.vsix` package, install it with:

```bash
code --install-extension /path/to/vma-assembler-0.1.0.vsix
```

## Create a VSIX

```bash
npm ci
npx @vscode/vsce package
```

## Features

- **Syntax highlighting** — the 6502 instructions, the NMOS illegal opcodes and their aliases, long branches
  (`LBNE` …), the `.abs` / `.zp` suffixes, labels (`name:`, local `.name:`, anonymous `-` / `+`, `@name`,
  `:macroLabel`), `* =` / `.pc =`, every directive (`.byte`, `.text`, `.macro`, `.if`, `.const`, `.var` …) and
  library macro (`.print`, `.sprite_init`, `.memcpy`, `.reu_stash`, `.sid_player` …), `{param}` placeholders,
  numbers (`$D020`, `%1010`, `255`, `'A'`), `;` and `//` comments
- **Snippets** — one for every directive and library macro, plus `program`, `irq`, `mainloop`, `clearloop`,
  `rasterwait`, `scope`, `.macrok` (Kick-style `{ }` macro) and more
- **Outline & Go to Definition** — labels (local labels under their global label), `.const` / `.label`,
  `.var`, `.macro`, `.region`, `.define` and `:macroLabel` names
- **Formatter** — labels in column 0, code indented, `.macro`/`.if`/`.loop`/`.for`/`.while`/`.repeat`/`.region`
  and `{ }` blocks nested
- **Build commands** — PRG, D64 disk image, Magic Desk CRT, debug symbols (`.sym` / `.vs` / `.dbg`), Exomizer
- **Run in VICE** — PRG / D64 autostart, CRT attached as a cartridge, debug run loads the `.vs` labels into the
  VICE monitor (`-moncommands`)
- **Problems panel** — `FILE:LINE: message` errors of `vma` are picked up by the `$vma` problem matcher
- **Task integration** — `Ctrl+Shift+B` lists the VMA build tasks

The `.vma` and `.asm` extensions are registered. If another assembler extension owns `.asm` in your workspace,
pick the language with *Change Language Mode*, or pin it in `settings.json`:

```json
"files.associations": { "*.asm": "vma" }
```

---

## Requirements

- The [`vma` compiler](https://github.com/zstarczali/VMA/releases) (or `cargo build --release` in the VMA repository)
- [VICE C64 emulator](https://vice-emu.sourceforge.io) *(only for Run)*
- [Exomizer](https://bitbucket.org/magli143/exomizer) *(only for Exomize)*

---

## Commands

| Command | `vma` call |
|---|---|
| VMA: Build (.prg) | `vma build src -o src.prg` |
| VMA: Build & Run in VICE | … then `x64sc -autostart src.prg` |
| VMA: Build + D64 disk image | `--d64 src.d64` (+ `--add` / `--disk-name` from the settings) |
| VMA: Build D64 & Run in VICE | … then `x64sc -autostart src.d64` |
| VMA: Build (.crt cartridge) | `--crt src.crt` (+ `--crt-name`) |
| VMA: Build .crt & Run in VICE | … then `x64sc -cartcrt src.crt` |
| VMA: Build (debug symbols) | `--debug` → `src.sym`, `src.vs`, `src.dbg` |
| VMA: Build (debug symbols) & Run in VICE with labels | … then `x64sc -moncommands src.vs -autostart src.prg` |
| VMA: Build + Exomize | … then `exomizer sfx sys -o src_exo.prg src.prg` |
| VMA: Build + Exomize & Run in VICE | … then `x64sc -autostart src_exo.prg` |
| VMA: Format Document | |

Every build adds `--search DIR` for each `vma.searchDirs` entry and `--no-basic-stub` when `vma.basicStub` is off.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `vma.compilerPath` | `vma` | Full path to the `vma` executable |
| `vma.vicePath` | `x64sc` | Full path to the VICE C64 emulator executable |
| `vma.viceArgs` | `[]` | Extra arguments passed to VICE, e.g. `["-fullscreen"]` |
| `vma.defaultOutputDir` | *(source directory)* | Output directory for the `.prg` / `.d64` / `.crt` files, created if missing. Absolute or relative to the workspace folder (e.g. `./samples/out`) |
| `vma.searchDirs` | `[]` | Further folders for `.incbin` / `.koala` / `.level` / `.sid` / `.include` (`--search`) |
| `vma.basicStub` | `true` | `false` passes `--no-basic-stub` (no `10 SYS` line) |
| `vma.d64AddFiles` | `[]` | Extra files on the `.d64` image (`--add` for each) |
| `vma.diskName` | *(D64 file name)* | `--disk-name` |
| `vma.crtName` | *(VA CART)* | `--crt-name` |
| `vma.exomizerPath` | `exomizer` | Full path to the Exomizer executable |
| `vma.exomizerMode` | `sfx sys` | Exomizer mode: `sfx sys`, `sfx basic`, or `mem` |
| `vma.exomizerSuffix` | `_exo` | Suffix appended to the output file name (e.g. `prog_exo.prg`) |

**Example** (`settings.json`):
```json
{
  "vma.compilerPath": "C:\\tools\\vma.exe",
  "vma.vicePath": "C:\\VICE\\bin\\x64sc.exe",
  "vma.searchDirs": ["${workspaceFolder}/assets"]
}
```

---

## Tasks

`tasks.json` example:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "vma",
      "file": "${file}",
      "debug": true,
      "runAfterBuild": true,
      "label": "VMA: debug build & run",
      "problemMatcher": "$vma",
      "group": { "kind": "build", "isDefault": true }
    }
  ]
}
```

Task properties: `file`, `d64`, `crt`, `noBasicStub`, `raw`, `debug`, `exo`, `runAfterBuild`.

---

## Language reference

The full language manual is in the VMA repository:
[English](https://github.com/zstarczali/VMA/blob/main/docs/VMA-Manual.md) ·
[Magyar](https://github.com/zstarczali/VMA/blob/main/docs/VMA-Manual.hu.md).

## License

GPL-3.0-or-later, like VMA and C64 Visual Assembler.
