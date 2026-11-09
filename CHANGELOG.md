# Changelog

All notable changes to the VMA extension are listed here.

## [0.1.4] — 2026-11-09

### Added
- The Ultimate 64 palette macros of VMA 2.2: `.u64_palette "file.vpl"` (a directive with a palette file),
  `.u64_palette_color index, $RRGGBB` and `.u64_palette_reset` (library macros) are highlighted and have snippets.
- `vma.searchDirs` also serves the palette file of `.u64_palette`.

## [0.1.3] — 2026-11-09

### Fixed
- The Marketplace package now carries this changelog (0.1.2 was uploaded without it).
- README: a *Getting started* section for the Marketplace install replaces the local `.vsix` instructions,
  which moved to *Building from source*.

## [0.1.2] — 2026-11-09

### Added
- **Folding**: `.region name … .endregion` and `; region` / `; endregion` (or `//`) comments fold as regions,
  so *Fold All Regions* (`Ctrl+K Ctrl+8`) and *Unfold All Regions* work on them; regions can be nested.
- `.macro … .endm`, `.if … .else … .endif` (each branch on its own), `.loop … .next`, `.for … .endf`,
  `.while … .endw`, `.repeat … .until` and `{ … }` blocks (Kick-style macros and scopes) fold too.
- A global label folds up to the next label of the same block; runs of full-line comments fold as comments.

## [0.1.1] — 2026-10-31

### Changed
- `vma.defaultOutputDir`, `vma.searchDirs` and `vma.d64AddFiles` are resolved to absolute paths: relative values
  are taken against the source's workspace folder (or the source's folder without a workspace), and
  `${workspaceFolder}` still works. The background build and the terminal command now agree whatever the
  current directory is.

### Fixed
- The output directory is created before a build when it does not exist (the compiler does not create folders).

## [0.1.0] — 2026-10-30

First release, modelled on the Ultimate Basic extension.

### Added
- Language `vma` for `.vma` and `.asm` files.
- **Syntax highlighting**: 6502 instructions, NMOS illegal opcodes and their aliases, long branches (`LBNE` …),
  `.abs` / `.zp` suffixes, labels (`name:`, local `.name:`, anonymous `-` / `+`, `@name`, `:macroLabel`),
  `* =` / `.pc =`, every directive and library macro, `{param}` placeholders, `$` / `%` / decimal / `'A'`
  numbers, `;` and `//` comments.
- **Snippets** for every directive and library macro, plus `program`, `irq`, `mainloop`, `clearloop`,
  `rasterwait`, `scope`, `.macrok` and more.
- **Formatter** (*Format Document* and *VMA: Format Document*): labels at block level, code indented, nested
  `.macro` / `.if` / `.loop` / `.for` / `.while` / `.repeat` / `.region` and `{ }` blocks.
- **Outline and Go to Definition** for labels, `.const` / `.label`, `.var`, `.macro`, `.region`, `.define` and
  `:macroLabel` names.
- **Build commands**: `.prg`, D64 disk image, Magic Desk `.crt`, debug symbols (`.sym` / `.vs` / `.dbg`),
  Exomizer — each with a *Run in VICE* variant; the debug run loads the `.vs` labels into the VICE monitor
  (`-moncommands`), a `.crt` is attached as a cartridge.
- **Tasks** (`Ctrl+Shift+B`) and the `$vma` problem matcher for the `FILE:LINE: message` errors of `vma`.
- Settings: `vma.compilerPath`, `vma.vicePath`, `vma.viceArgs`, `vma.defaultOutputDir`, `vma.searchDirs`,
  `vma.basicStub`, `vma.d64AddFiles`, `vma.diskName`, `vma.crtName`, `vma.exomizerPath`, `vma.exomizerMode`,
  `vma.exomizerSuffix`.

[0.1.3]: https://github.com/zstarczali/VMAExtension/compare/e126b5a...development
[0.1.2]: https://github.com/zstarczali/VMAExtension/compare/ede4b0b...e126b5a
[0.1.1]: https://github.com/zstarczali/VMAExtension/compare/56eb356...ede4b0b
[0.1.0]: https://github.com/zstarczali/VMAExtension/commit/56eb356
