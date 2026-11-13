# VMA — VS Code Extension

<!-- badges:start -->
<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=zsolt-tarczali.vma-assembler"><img src="https://vsmarketplacebadges.dev/version-short/zsolt-tarczali.vma-assembler.svg?label=Marketplace&color=007ACC" alt="VS Marketplace version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=zsolt-tarczali.vma-assembler"><img src="https://vsmarketplacebadges.dev/installs-short/zsolt-tarczali.vma-assembler.svg?color=007ACC" alt="Installs"></a>
  <a href="https://github.com/zstarczali/VMAExtension/blob/main/package.json"><img src="https://img.shields.io/github/package-json/v/zstarczali/VMAExtension/main?label=version&color=4c1" alt="Version"></a>
  <a href="https://github.com/zstarczali/VMAExtension/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-GPLv3-blue" alt="License: GPLv3"></a>
  <a href="https://www.c64va.pro/register/donate.php"><img src="https://img.shields.io/badge/donate-PayPal-00457C?logo=paypal&logoColor=white" alt="Donate"></a>
</p>
<p align="center">
  <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%5E1.60-007ACC?logo=visualstudiocode&logoColor=white" alt="VS Code ^1.60"></a>
  <a href="https://github.com/zstarczali/VMA/releases/latest"><img src="https://img.shields.io/github/v/release/zstarczali/VMA?label=vma&color=6c5eb5" alt="Compiler version"></a>
  <a href="https://en.wikipedia.org/wiki/Commodore_64"><img src="https://img.shields.io/badge/target-C64%20%2F%206502-6c5eb5?logo=commodore&logoColor=white" alt="Target: C64 / 6502"></a>
  <a href="https://github.com/zstarczali/VMAExtension/commits/main"><img src="https://img.shields.io/github/last-commit/zstarczali/VMAExtension/main" alt="Last commit"></a>
  <a href="https://github.com/zstarczali/VMAExtension/graphs/commit-activity"><img src="https://img.shields.io/github/commit-activity/m/zstarczali/VMAExtension" alt="Commit activity"></a>
  <a href="https://github.com/zstarczali/VMAExtension/issues"><img src="https://img.shields.io/github/issues/zstarczali/VMAExtension" alt="Issues"></a>
  <a href="https://github.com/zstarczali/VMAExtension/stargazers"><img src="https://img.shields.io/github/stars/zstarczali/VMAExtension?style=flat" alt="Stars"></a>
</p>
<p align="center">
  <a href="https://github.com/zstarczali/VMA"><img src="https://img.shields.io/badge/compiler-VMA-8a2be2" alt="VMA compiler"></a>
  <a href="https://www.c64va.pro/"><img src="https://img.shields.io/badge/used%20by-C64%20Visual%20Assembler-8a2be2" alt="C64 Visual Assembler"></a>
  <a href="https://github.com/zstarczali/UltimateBasicExtension"><img src="https://img.shields.io/badge/sibling-Ultimate%20Basic%20extension-8a2be2" alt="Ultimate Basic extension"></a>
</p>
<!-- badges:end -->

Language support for **VMA (Visual Macro Assembler)**, the 6502 / 6510 assembler of
[C64 Visual Assembler](https://github.com/zstarczali/VisualAssembler) and its command-line compiler
[`vma`](https://github.com/zstarczali/VMA). Write C64 assembly with syntax highlighting, snippets for every
directive and library macro, an outline, and one-click build & run in VICE — all from VS Code.

*© 2026 Zsolt Tarczali*

---

## Getting started

1. Install the extension from the Extensions view (search for **VMA**), or from the command line:
   ```bash
   code --install-extension zsolt-tarczali.vma-assembler
   ```
2. Download the `vma` compiler from the [VMA releases](https://github.com/zstarczali/VMA/releases) and, if it is
   not on your `PATH`, set `vma.compilerPath` to it. For *Run in VICE* set `vma.vicePath` as well.
3. Open a `.vma` / `.asm` file and choose **VMA: Build & Run in VICE** from the editor's context menu or the
   Command Palette.

## Features

- **Syntax highlighting** — the 6502 instructions, the NMOS illegal opcodes and their aliases, long branches
  (`LBNE` …), the `.abs` / `.zp` suffixes, labels (`name:`, local `.name:`, anonymous `-` / `+`, `@name`,
  `:macroLabel`), `* =` / `.pc =`, every directive (`.byte`, `.text`, `.macro`, `.if`, `.const`, `.var` …) and
  library macro (`.print`, `.sprite_init`, `.memcpy`, `.reu_stash`, `.sid_player` …), `{param}` placeholders,
  numbers (`$D020`, `%1010`, `255`, `'A'`), `;` and `//` comments
- **Snippets** — one for every directive and library macro, plus `program`, `irq`, `mainloop`, `clearloop`,
  `rasterwait`, `scope`, `.macrok` (Kick-style `{ }` macro) and more
- **Outline & Go to Definition** — labels (local labels under their global label, and a local label named with
  its global label: `JMP Second.lp`), `.const` / `.label`, `.var`, `.macro`, `.region`, `.define` and
  `:macroLabel` names
- **Folding** — `.region name … .endregion` (and `; region` / `; endregion` comments) fold as regions
  (*Fold All Regions*: `Ctrl+K Ctrl+8`); `.macro`, `.if` / `.else`, `.loop`, `.for`, `.while`, `.repeat` and
  `{ }` blocks, label sections and comment blocks fold too
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
| `vma.searchDirs` | `[]` | Further folders for `.incbin` / `.koala` / `.level` / `.u64_palette` / `.sid` / `.include` (`--search`) |
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

## Building from source

```bash
npm ci
npx @vscode/vsce package
```

This creates `vma-assembler-<version>.vsix`; install it with *Extensions: Install from VSIX…*.

## License

GPL-3.0-or-later, like VMA and C64 Visual Assembler.
