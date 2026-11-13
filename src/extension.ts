import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs';

// ── Config helpers ────────────────────────────────────────────────────────────

function cfg<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('vma').get<T>(key);
}

function compilerPath(): string    { return cfg<string>('compilerPath')    || 'vma'; }
function vicePath(): string        { return cfg<string>('vicePath')        || 'x64sc'; }
function viceArgs(): string[]      { return cfg<string[]>('viceArgs')      ?? []; }
function basicStub(): boolean      { return cfg<boolean>('basicStub')      ?? true; }
function diskName(): string        { return cfg<string>('diskName')        ?? ''; }
function crtName(): string         { return cfg<string>('crtName')         ?? ''; }
function exomizerPath(): string    { return cfg<string>('exomizerPath')    || 'exomizer'; }
function exomizerMode(): string    { return cfg<string>('exomizerMode')    || 'sfx sys'; }
function exomizerSuffix(): string  { return cfg<string>('exomizerSuffix')  ?? '_exo'; }

/** `${workspaceFolder}` in a setting → the first workspace folder */
function expandWorkspace(s: string): string {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    return s.replace(/\$\{workspaceFolder\}/g, ws);
}

/**
 * A path from a setting as an absolute path. A relative one means the workspace folder of the
 * source (the source's folder without a workspace): the background build and the terminal
 * run from different folders, so it must not depend on the current directory.
 */
function resolveSetting(srcFile: string, value: string): string {
    const root = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(srcFile))?.uri.fsPath ?? path.dirname(srcFile);
    return path.resolve(root, expandWorkspace(value));
}

function searchDirs(srcFile: string): string[] {
    return (cfg<string[]>('searchDirs') ?? []).map(d => resolveSetting(srcFile, d));
}

function d64AddFiles(srcFile: string): string[] {
    return (cfg<string[]>('d64AddFiles') ?? []).map(f => resolveSetting(srcFile, f));
}

function outputDirFor(srcFile: string): string {
    const outDir = (cfg<string>('defaultOutputDir') ?? '').trim();
    return outDir ? resolveSetting(srcFile, outDir) : path.dirname(srcFile);
}

type OutExt ='.prg' | '.d64' | '.crt' | '.vs';

function outputPathFor(srcFile: string, ext: OutExt): string {
    return path.join(outputDirFor(srcFile), path.basename(srcFile, path.extname(srcFile)) + ext);
}

/** The compiler does not create folders: the configured output folder may not exist yet. */
function ensureOutputDir(srcFile: string) {
    fs.mkdirSync(outputDirFor(srcFile), { recursive: true });
}

function exoOutputFor(prg: string): string {
    const dir  = path.dirname(prg);
    const base = path.basename(prg, '.prg');
    return path.join(dir, base + exomizerSuffix() + '.prg');
}

function exomizerCommand(prg: string, out: string): string {
    return [invokeExe(quote(exomizerPath())), exomizerMode(), '-o', quote(out), quote(prg)].join(' ');
}

function exomizerSpawnArgs(prg: string, out: string): string[] {
    return [...exomizerMode().split(' '), '-o', out, prg];
}

// ── Active file guard ─────────────────────────────────────────────────────────

function requireVmaFile(): { doc: vscode.TextDocument; src: string } | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor — open a VMA source file first.');
        return;
    }
    if (editor.document.languageId !== 'vma') {
        vscode.window.showErrorMessage('Active file is not a VMA source file.');
        return;
    }
    if (editor.document.isDirty) { editor.document.save(); }
    return { doc: editor.document, src: editor.document.fileName };
}

// ── Terminal helper ───────────────────────────────────────────────────────────

let _terminal: vscode.Terminal | undefined;

function getTerminal(): vscode.Terminal {
    if (!_terminal || _terminal.exitStatus !== undefined) {
        _terminal = vscode.window.createTerminal('VMA');
    }
    return _terminal;
}

function runInTerminal(cmd: string) {
    const t = getTerminal();
    t.show(true);
    t.sendText(cmd);
}

function quote(s: string): string {
    return `"${s.replace(/"/g, '\\"')}"`;
}

/**
 * On Windows, PowerShell requires the '&' call operator before a quoted
 * executable path (e.g. '& "C:\tools\vma.exe"').  Without it, PowerShell
 * treats the quoted string as a string expression and raises a ParserError.
 * In CMD.exe the leading '& ' with an empty left-hand side is harmless.
 * On non-Windows platforms the path is returned unchanged.
 */
function invokeExe(quotedPath: string): string {
    return (process.platform === 'win32' && quotedPath.startsWith('"'))
        ? '& ' + quotedPath
        : quotedPath;
}

// ── Build command builder ─────────────────────────────────────────────────────

interface BuildOptions {
    d64?: boolean;
    crt?: boolean;
    noBasicStub?: boolean;
    raw?: boolean;
    debug?: boolean;
}

/** The files a build writes: always a .prg, plus the .d64 / .crt when asked */
interface BuildOutputs {
    prg: string;
    d64?: string;
    crt?: string;
}

function outputsFor(src: string, opts: BuildOptions): BuildOutputs {
    return {
        prg: outputPathFor(src, '.prg'),
        d64: opts.d64 ? outputPathFor(src, '.d64') : undefined,
        crt: opts.crt ? outputPathFor(src, '.crt') : undefined,
    };
}

/** Build args as string[] for child_process.spawn (unquoted) */
function buildArgs(src: string, out: BuildOutputs, opts: BuildOptions): string[] {
    const args = ['build', src, '-o', out.prg];
    for (const d of searchDirs(src)) { args.push('--search', d); }
    if (opts.noBasicStub || !basicStub()) { args.push('--no-basic-stub'); }
    if (opts.raw)   { args.push('--raw'); }
    if (opts.debug) { args.push('--debug'); }
    if (out.crt) {
        args.push('--crt', out.crt);
        if (crtName()) { args.push('--crt-name', crtName()); }
    }
    if (out.d64) {
        args.push('--d64', out.d64);
        for (const f of d64AddFiles(src)) { args.push('--add', f); }
        if (diskName()) { args.push('--disk-name', diskName()); }
    }
    return args;
}

/** The same build as a shell command line for the terminal */
function buildCommand(src: string, out: BuildOutputs, opts: BuildOptions): string {
    const args = buildArgs(src, out, opts).map(a => a.startsWith('-') || a === 'build' ? a : quote(a));
    return [invokeExe(quote(compilerPath())), ...args].join(' ');
}

/** VICE arguments for a target: a .crt is attached as a cartridge, anything else is autostarted */
function viceSpawnArgs(target: string, monCommands?: string): string[] {
    const args: string[] = [];
    if (monCommands) { args.push('-moncommands', monCommands); }
    if (path.extname(target).toLowerCase() === '.crt') {
        args.push('-cartcrt', target);
    } else {
        args.push('-autostart', target);
    }
    return [...args, ...viceArgs()];
}

function viceCommand(target: string, monCommands?: string): string {
    const args = viceSpawnArgs(target, monCommands).map(a => a.startsWith('-') ? a : quote(a));
    return [invokeExe(quote(vicePath())), ...args].join(' ');
}

function launchVice(target: string, cwd: string, monCommands?: string) {
    child_process.spawn(vicePath(), viceSpawnArgs(target, monCommands), {
        detached: true, stdio: 'ignore', cwd,
    }).unref();
}

// ── Compile-then-run via child_process so we can detect success ───────────────

/**
 * Show the build in the terminal and run it in the background as well; when the
 * compiler exits with 0 and `file` exists, `then` is called.
 */
function spawnBuild(src: string, out: BuildOutputs, opts: BuildOptions, file: string, then: () => void) {
    ensureOutputDir(src);
    const t = getTerminal();
    t.show(true);

    // Show the build command so the user can see what's running
    t.sendText(buildCommand(src, out, opts));

    const child = child_process.spawn(compilerPath(), buildArgs(src, out, opts), {
        cwd: path.dirname(src),
        shell: false,
    });

    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('error', (e: Error) => {
        vscode.window.showErrorMessage(`Cannot start the VMA compiler (${compilerPath()}): ${e.message}`);
    });

    child.on('close', (code: number | null) => {
        if (code !== 0) {
            const first = stderr.split(/\r?\n/).find(l => l.trim() !== '');
            vscode.window.showErrorMessage(`Build failed (exit ${code})${first ? ': ' + first : ''}`);
            return;
        }
        if (!fs.existsSync(file)) {
            vscode.window.showErrorMessage(`Build succeeded but output not found: ${file}`);
            return;
        }
        then();
    });
}

function buildAndLaunchVice(src: string, opts: BuildOptions) {
    const out    = outputsFor(src, opts);
    const target = out.crt ?? out.d64 ?? out.prg;
    const vs     = opts.debug ? outputPathFor(src, '.vs') : undefined;
    spawnBuild(src, out, opts, target, () => {
        vscode.window.showInformationMessage(`Build OK → launching VICE with ${path.basename(target)}`);
        launchVice(target, path.dirname(src), vs && fs.existsSync(vs) ? vs : undefined);
    });
}

// ── Exomizer: spawn-based build → exomize → optional VICE ────────────────────

function buildAndExo(src: string, launch: boolean) {
    const out = outputsFor(src, {});
    const exo = exoOutputFor(out.prg);

    spawnBuild(src, out, {}, out.prg, () => {
        getTerminal().sendText(exomizerCommand(out.prg, exo));

        const exomizer = child_process.spawn(exomizerPath(), exomizerSpawnArgs(out.prg, exo), {
            cwd: path.dirname(src), shell: false,
        });
        exomizer.on('error', (e: Error) => {
            vscode.window.showErrorMessage(`Cannot start Exomizer (${exomizerPath()}): ${e.message}`);
        });
        exomizer.on('close', (exoCode: number | null) => {
            if (exoCode !== 0) {
                vscode.window.showErrorMessage(`Exomizer failed (exit ${exoCode}). Check the Terminal for details.`);
                return;
            }
            if (!fs.existsSync(exo)) {
                vscode.window.showErrorMessage(`Exomizer succeeded but output not found: ${exo}`);
                return;
            }
            if (launch) {
                vscode.window.showInformationMessage(`Build + Exomize OK → launching VICE with ${path.basename(exo)}`);
                launchVice(exo, path.dirname(src));
            } else {
                vscode.window.showInformationMessage(`Build + Exomize OK → ${path.basename(exo)}`);
            }
        });
    });
}

// ── Command handlers ──────────────────────────────────────────────────────────

function cmdBuild(opts: BuildOptions = {}) {
    const f = requireVmaFile(); if (!f) { return; }
    ensureOutputDir(f.src);
    runInTerminal(buildCommand(f.src, outputsFor(f.src, opts), opts));
}

function cmdBuildAndRun(opts: BuildOptions = {}) {
    const f = requireVmaFile(); if (!f) { return; }
    buildAndLaunchVice(f.src, opts);
}

function cmdBuildExo(launch: boolean) {
    const f = requireVmaFile(); if (!f) { return; }
    buildAndExo(f.src, launch);
}

// ── Task provider ─────────────────────────────────────────────────────────────

type TaskOptions = BuildOptions & { runAfterBuild?: boolean; exo?: boolean };

function makeTask(
    name: string,
    scope: vscode.TaskScope | vscode.WorkspaceFolder,
    src: string,
    opts: TaskOptions,
): vscode.Task {
    const out = outputsFor(src, opts);
    const exo = exoOutputFor(out.prg);
    ensureOutputDir(src);

    let shellCmd = buildCommand(src, out, opts);
    if (opts.exo) {
        shellCmd += ' && ' + exomizerCommand(out.prg, exo);
    }
    if (opts.runAfterBuild) {
        const runTarget = opts.exo ? exo : (out.crt ?? out.d64 ?? out.prg);
        const vs = opts.debug ? outputPathFor(src, '.vs') : undefined;
        shellCmd += ' && ' + viceCommand(runTarget, vs);
    }

    const task = new vscode.Task(
        { type: 'vma', file: src, ...opts },
        scope,
        name,
        'VMA',
        new vscode.ShellExecution(shellCmd),
        '$vma'
    );
    task.group = vscode.TaskGroup.Build;
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always };
    return task;
}

class VmaTaskProvider implements vscode.TaskProvider {
    provideTasks(): vscode.Task[] {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'vma') { return []; }
        const src = editor.document.fileName;
        return [
            makeTask('build',                      vscode.TaskScope.Workspace, src, {}),
            makeTask('build & run',                vscode.TaskScope.Workspace, src, { runAfterBuild: true }),
            makeTask('build + d64',                vscode.TaskScope.Workspace, src, { d64: true }),
            makeTask('build + crt',                vscode.TaskScope.Workspace, src, { crt: true }),
            makeTask('build + exomize',            vscode.TaskScope.Workspace, src, { exo: true }),
            makeTask('build + exomize & run',      vscode.TaskScope.Workspace, src, { exo: true, runAfterBuild: true }),
            makeTask('build (debug symbols)',      vscode.TaskScope.Workspace, src, { debug: true }),
            makeTask('build (debug symbols) & run', vscode.TaskScope.Workspace, src, { debug: true, runAfterBuild: true }),
        ];
    }

    resolveTask(task: vscode.Task): vscode.Task | undefined {
        const def = task.definition as { type: string; file: string } & TaskOptions;
        if (def.type !== 'vma') { return undefined; }
        return makeTask(task.name, task.scope ?? vscode.TaskScope.Workspace, def.file, {
            d64: def.d64,
            crt: def.crt,
            noBasicStub: def.noBasicStub,
            raw: def.raw,
            debug: def.debug,
            runAfterBuild: def.runAfterBuild,
            exo: def.exo,
        });
    }
}

// ── Source line helpers ───────────────────────────────────────────────────────

/**
 * Strip a trailing `;` or `//` comment and trim trailing whitespace,
 * respecting "double-quoted" strings and 'c' character literals.
 */
function stripTrailingComment(raw: string): string {
    let quoteCh = '';
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (quoteCh) {
            if (c === quoteCh) { quoteCh = ''; }
            continue;
        }
        if (c === '"') { quoteCh = c; continue; }
        // 'A' character literal (exactly one char between the quotes)
        if (c === "'" && raw[i + 2] === "'") { i += 2; continue; }
        if (c === ';' || (c === '/' && raw[i + 1] === '/')) {
            return raw.slice(0, i).trimEnd();
        }
    }
    return raw.trimEnd();
}

/** `name:` / `.name:` / `@name:` label definition at the start of a line */
const LABEL_DEF   = /^([.@]?[A-Za-z_][\w.]*):/;
/** an anonymous label `-` / `+`, alone or in front of an instruction */
const ANON_LABEL  = /^[-+]+(\s|$)/;
/** `* = $1000` / `*=$1000 "name"` / `.pc = $1000` */
const ORG_LINE    = /^(\*\s*=|\.pc\s*=)/i;

// ── Document formatter ────────────────────────────────────────────────────────

/** Directives that open a nested block (closed by the matching end directive) */
const BLOCK_OPEN  = /^\.(macro|if|loop|for|while|repeat|region)\b/i;
/** Directives that close a block */
const BLOCK_CLOSE = /^\.(endm|endmacro|endif|next|endf|endw|until|endregion)\b/i;

/**
 * Indentation-based formatter.
 *
 *  - labels, `* =` / `.pc =` and full-line comments that start in column 0
 *    stay at the block level;
 *  - instructions and directives are indented one unit deeper;
 *  - `.macro … .endm`, `.if … .else … .endif`, `.loop … .next`, `.for … .endf`,
 *    `.while … .endw`, `.repeat … .until`, `.region … .endregion` and `{ … }`
 *    blocks indent their body by one more unit.
 */
class VmaFormatter implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
    ): vscode.TextEdit[] {
        const edits: vscode.TextEdit[] = [];
        const unit  = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
        let   level = 0;
        // the depth each open block's opener line was printed at: its closer
        // (and `.else`) line up with it — `name: {` at label depth, `.if` at code depth
        const openers: number[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const line    = document.lineAt(i);
            const trimmed = line.text.trim();

            // Blank / whitespace-only: strip trailing spaces, keep the line
            if (trimmed === '') {
                if (line.text !== '') {
                    edits.push(vscode.TextEdit.replace(line.range, ''));
                }
                continue;
            }

            const code = stripTrailingComment(trimmed);

            // Full-line comment: keep column-0 comments where they are,
            // indent the others like code
            if (code === '') {
                const col0 = /^(;|\/\/)/.test(line.text);
                const newText = col0 ? trimmed : unit.repeat(level + 1) + trimmed;
                if (newText !== line.text) {
                    edits.push(vscode.TextEdit.replace(line.range, newText));
                }
                continue;
            }

            // Label `name:` (but not a `.directive` that happens to contain a colon)
            const labelMatch = LABEL_DEF.exec(code);
            const isLabel = !!labelMatch || ANON_LABEL.test(code);
            const isOrg   = ORG_LINE.test(code);

            // The statement after an optional label decides the nesting
            const stmt    = labelMatch ? code.slice(labelMatch[0].length).trim() : code;
            const isClose = BLOCK_CLOSE.test(stmt) || stmt.startsWith('}');
            const isElse  = /^\.else\b/i.test(stmt);
            const isOpen  = BLOCK_OPEN.test(stmt) || /\{\s*$/.test(stmt);

            // ── Print ─────────────────────────────────────────────────────────
            let depth = (isLabel || isOrg) ? level : level + 1;
            if (isClose) {
                // close the block, line up with its opener
                level = Math.max(0, level - 1);
                depth = openers.pop() ?? level;
            } else if (isElse) {
                depth = openers[openers.length - 1] ?? Math.max(0, level - 1);
            }
            const newText = unit.repeat(depth) + trimmed;
            if (newText !== line.text) {
                edits.push(vscode.TextEdit.replace(line.range, newText));
            }

            // ── Increase indent AFTER printing ───────────────────────────────
            // a `} … {` line closes and reopens
            if (isOpen && (!isClose || /\{\s*$/.test(stmt))) {
                openers.push(depth);
                level++;
            }
        }

        return edits;
    }
}

// ── Format command ────────────────────────────────────────────────────────────

async function cmdFormat() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor — open a VMA source file first.');
        return;
    }
    if (editor.document.languageId !== 'vma') {
        vscode.window.showErrorMessage('Active file is not a VMA source file.');
        return;
    }
    try {
        // editor.options.tabSize can be the string "tabSize" instead of a number
        // when auto-detection is active — fall back to workspace config in that case.
        const editorCfg  = vscode.workspace.getConfiguration('editor', editor.document.uri);
        const rawTabSize = editor.options.tabSize;
        const rawSpaces  = editor.options.insertSpaces;
        const opts: vscode.FormattingOptions = {
            tabSize:      typeof rawTabSize === 'number'  ? rawTabSize : (editorCfg.get<number>('tabSize')        ?? 4),
            insertSpaces: typeof rawSpaces  === 'boolean' ? rawSpaces  : (editorCfg.get<boolean>('insertSpaces')  ?? true),
        };

        const formatter = new VmaFormatter();
        const edits = formatter.provideDocumentFormattingEdits(editor.document, opts);

        if (edits.length === 0) {
            vscode.window.showInformationMessage('Already formatted — no changes needed.');
            return;
        }

        // editor.edit() is more reliable than WorkspaceEdit for direct text changes
        const success = await editor.edit(builder => {
            for (const e of edits) { builder.replace(e.range, e.newText); }
        });

        if (success) {
            vscode.window.showInformationMessage(
                `Formatting applied (${edits.length} change${edits.length === 1 ? '' : 's'}).`
            );
        } else {
            vscode.window.showErrorMessage('Formatting failed — file may be read-only.');
        }
    } catch (e: any) {
        vscode.window.showErrorMessage(`Formatter error: ${e?.message ?? String(e)}`);
    }
}

// ── Folding ───────────────────────────────────────────────────────────────────

/** The block a closer directive ends */
const CLOSER_OF: Record<string, string> = {
    endm: 'macro', endmacro: 'macro', endif: 'if', next: 'loop', endf: 'for',
    endw: 'while', until: 'repeat', endregion: 'region',
};
/** `; region name` / `// region name` and their `endregion` */
const COMMENT_REGION    = /^(;|\/\/)\s*region\b/i;
const COMMENT_ENDREGION = /^(;|\/\/)\s*endregion\b/i;

interface FoldFrame {
    kind: string;          // 'root', 'region', 'macro', 'if', 'loop', … or '{'
    start: number;         // the opener line
    label?: number;        // the open label section in this block
}

/**
 * Folding ranges:
 *  - `.region name … .endregion` (and `; region` / `; endregion` comments) —
 *    region kind, so *Fold All Regions* (Ctrl+K Ctrl+8) folds them;
 *  - `.macro … .endm`, `.if … .else … .endif`, `.loop … .next`, `.for … .endf`,
 *    `.while … .endw`, `.repeat … .until` and `{ … }` blocks;
 *  - a global label to the line before the next label of the same block;
 *  - runs of two or more full-line comments.
 */
class VmaFoldingProvider implements vscode.FoldingRangeProvider {
    provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
        const ranges: vscode.FoldingRange[] = [];
        const frames: FoldFrame[] = [{ kind: 'root', start: 0 }];
        const top = () => frames[frames.length - 1];
        let commentStart = -1;

        const blank = (i: number) => document.lineAt(i).text.trim() === '';
        const add = (start: number, end: number, kind?: vscode.FoldingRangeKind) => {
            while (end > start && blank(end)) { end--; }
            if (end > start) { ranges.push(new vscode.FoldingRange(start, end, kind)); }
        };
        const closeLabel = (frame: FoldFrame, before: number) => {
            if (frame.label !== undefined) { add(frame.label, before - 1); frame.label = undefined; }
        };
        // a block inside a label section nests in it: the section stays open
        const open = (kind: string, line: number) => { frames.push({ kind, start: line }); };
        const close = (kind: string, line: number) => {
            // the nearest open block of that kind; unmatched closers are ignored
            let at = frames.length - 1;
            while (at > 0 && frames[at].kind !== kind) { at--; }
            if (at === 0) { return; }
            while (frames.length > at) {
                const f = frames.pop()!;
                closeLabel(f, line);
                // the closer line stays visible
                add(f.start, line - 1, f.kind === 'region' ? vscode.FoldingRangeKind.Region : undefined);
            }
        };

        for (let i = 0; i < document.lineCount; i++) {
            const trimmed = document.lineAt(i).text.trim();
            const code    = stripTrailingComment(trimmed);

            // runs of full-line comments (region markers excluded)
            const isComment = trimmed !== '' && code === ''
                && !COMMENT_REGION.test(trimmed) && !COMMENT_ENDREGION.test(trimmed);
            if (isComment) {
                if (commentStart < 0) { commentStart = i; }
            } else {
                if (commentStart >= 0 && i - 1 > commentStart) {
                    ranges.push(new vscode.FoldingRange(commentStart, i - 1, vscode.FoldingRangeKind.Comment));
                }
                commentStart = -1;
            }

            if (COMMENT_REGION.test(trimmed))    { open('region', i);  continue; }
            if (COMMENT_ENDREGION.test(trimmed)) { close('region', i); continue; }
            if (code === '') { continue; }

            const label = LABEL_DEF.exec(code);
            const stmt  = label ? code.slice(label[0].length).trim() : code;

            let m: RegExpExecArray | null;
            if (stmt.startsWith('}')) {
                close('{', i);
            } else if ((m = BLOCK_CLOSE.exec(stmt))) {
                close(CLOSER_OF[m[1].toLowerCase()], i);
            } else if (/^\.else\b/i.test(stmt) && top().kind === 'if') {
                // the .if part folds up to the .else; the .else part to the .endif
                const f = top();
                closeLabel(f, i);
                add(f.start, i - 1);
                f.start = i;
            }

            // `.macro name(p) {` is closed by `}`, not by .endm
            if (/\{\s*$/.test(stmt)) {
                open('{', i);
            } else if ((m = BLOCK_OPEN.exec(stmt))) {
                open(m[1].toLowerCase(), i);
            } else if (label && !label[1].startsWith('.')) {
                // a global label starts a section of the enclosing block
                closeLabel(top(), i);
                top().label = i;
            } else if (ORG_LINE.test(code)) {
                closeLabel(top(), i);
            }
        }

        if (commentStart >= 0 && document.lineCount - 1 > commentStart) {
            ranges.push(new vscode.FoldingRange(commentStart, document.lineCount - 1, vscode.FoldingRangeKind.Comment));
        }
        // unclosed blocks fold to the end of the file
        for (const f of frames.reverse()) {
            closeLabel(f, document.lineCount);
            if (f.kind !== 'root') {
                add(f.start, document.lineCount - 1, f.kind === 'region' ? vscode.FoldingRangeKind.Region : undefined);
            }
        }
        return ranges;
    }
}

// ── Outline (document symbols) and Go to Definition ──────────────────────────

interface VmaSymbol {
    name: string;
    kind: vscode.SymbolKind;
    line: number;
    col: number;
}

/** `.const NAME = …`, `.label NAME = …`, `NAME = …` */
const CONST_DEF  = /^(?:\.(?:const|label)\s+)?([A-Za-z_]\w*)\s*=(?!=)/i;
/** `.macro name` / `.macro name(p) {` */
const MACRO_DEF  = /^\.macro\s+([A-Za-z_]\w*)/i;
/** `.var name[, size]` */
const VAR_DEF    = /^\.var\s+([A-Za-z_]\w*)/i;
/** `.region name` */
const REGION_DEF = /^\.region\s+(.+)$/i;
/** `.define A, B` */
const DEFINE_DEF = /^\.define\s+(.+)$/i;
/** `:name` macroLabel at the end of a .string / .data / .rawbytes … line */
const MACRO_LABEL = /\s:([A-Za-z_]\w*)\s*$/;

function collectSymbols(document: vscode.TextDocument): VmaSymbol[] {
    const symbols: VmaSymbol[] = [];
    let global = '';
    for (let i = 0; i < document.lineCount; i++) {
        const text = document.lineAt(i).text;
        const lead = text.length - text.trimStart().length;
        const code = stripTrailingComment(text.trim());
        if (code === '') { continue; }

        const label = LABEL_DEF.exec(code);
        if (label) {
            let name = label[1];
            if (name.startsWith('.')) {
                name = global ? global + name : name;
            } else {
                global = name;
            }
            symbols.push({ name, kind: vscode.SymbolKind.Function, line: i, col: lead });
            continue;
        }

        let m: RegExpExecArray | null;
        if ((m = MACRO_DEF.exec(code))) {
            symbols.push({ name: m[1], kind: vscode.SymbolKind.Method, line: i, col: lead });
        } else if ((m = VAR_DEF.exec(code))) {
            symbols.push({ name: m[1], kind: vscode.SymbolKind.Variable, line: i, col: lead });
        } else if ((m = REGION_DEF.exec(code))) {
            symbols.push({ name: m[1].trim(), kind: vscode.SymbolKind.Namespace, line: i, col: lead });
        } else if ((m = DEFINE_DEF.exec(code))) {
            for (const d of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
                symbols.push({ name: d, kind: vscode.SymbolKind.Boolean, line: i, col: lead });
            }
        } else if (!ORG_LINE.test(code) && (m = CONST_DEF.exec(code))) {
            symbols.push({ name: m[1], kind: vscode.SymbolKind.Constant, line: i, col: lead });
        } else if ((m = MACRO_LABEL.exec(code))) {
            symbols.push({ name: m[1], kind: vscode.SymbolKind.Field, line: i, col: lead });
        }
    }
    return symbols;
}

class VmaSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.SymbolInformation[] {
        return collectSymbols(document).map(s => new vscode.SymbolInformation(
            s.name, s.kind, '',
            new vscode.Location(document.uri, new vscode.Position(s.line, s.col)),
        ));
    }
}

class VmaDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Location | undefined {
        // `Second.lp` (VMA 2.3: a local label named with its global label, also as an absolute operand)
        const range = document.getWordRangeAtPosition(position, /[.@]?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/);
        if (!range) { return; }
        let word = document.getText(range);
        const dot = word.indexOf('.', 1);
        if (dot > 0) {
            // on the global part: the global label; on a local part: that qualified name
            const end = word.indexOf('.', position.character - range.start.character + 1);
            word = position.character - range.start.character < dot ? word.slice(0, dot) : (end < 0 ? word : word.slice(0, end));
            const symbols = collectSymbols(document);
            const hit = symbols.find(s => s.name === word) ?? symbols.find(s => s.name.toLowerCase() === word.toLowerCase());
            return hit && new vscode.Location(document.uri, new vscode.Position(hit.line, hit.col));
        }
        // `.loop` → the local label under the nearest global label above
        if (word.startsWith('.')) {
            const symbols = collectSymbols(document);
            const globalAbove = symbols
                .filter(s => s.line <= position.line && s.kind === vscode.SymbolKind.Function && !s.name.includes('.'))
                .pop();
            word = (globalAbove?.name ?? '') + word;
            const hit = symbols.find(s => s.name === word);
            return hit && new vscode.Location(document.uri, new vscode.Position(hit.line, hit.col));
        }
        const hit = collectSymbols(document).find(s => s.name === word || s.name.toLowerCase() === word.toLowerCase());
        return hit && new vscode.Location(document.uri, new vscode.Position(hit.line, hit.col));
    }
}

// ── Activation ────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
    const selector: vscode.DocumentSelector = { language: 'vma' };
    context.subscriptions.push(
        vscode.commands.registerCommand('vma.build',          () => cmdBuild()),
        vscode.commands.registerCommand('vma.buildAndRun',    () => cmdBuildAndRun()),
        vscode.commands.registerCommand('vma.buildD64',       () => cmdBuild({ d64: true })),
        vscode.commands.registerCommand('vma.buildAndRunD64', () => cmdBuildAndRun({ d64: true })),
        vscode.commands.registerCommand('vma.buildExo',       () => cmdBuildExo(false)),
        vscode.commands.registerCommand('vma.buildExoRun',    () => cmdBuildExo(true)),
        vscode.commands.registerCommand('vma.buildDebug',     () => cmdBuild({ debug: true })),
        vscode.commands.registerCommand('vma.buildDebugRun',  () => cmdBuildAndRun({ debug: true })),
        vscode.commands.registerCommand('vma.buildCrt',       () => cmdBuild({ crt: true })),
        vscode.commands.registerCommand('vma.buildAndRunCrt', () => cmdBuildAndRun({ crt: true })),
        vscode.commands.registerCommand('vma.format',         () => cmdFormat()),
        vscode.languages.registerDocumentFormattingEditProvider(selector, new VmaFormatter()),
        vscode.languages.registerFoldingRangeProvider(selector, new VmaFoldingProvider()),
        vscode.languages.registerDocumentSymbolProvider(selector, new VmaSymbolProvider()),
        vscode.languages.registerDefinitionProvider(selector, new VmaDefinitionProvider()),
        vscode.tasks.registerTaskProvider('vma', new VmaTaskProvider()),
        vscode.window.onDidCloseTerminal(t => { if (t === _terminal) { _terminal = undefined; } })
    );
}

export function deactivate() {}
