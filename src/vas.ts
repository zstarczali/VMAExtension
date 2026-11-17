import * as vscode from 'vscode';
import * as fs from 'fs';

// ── .vas (C64 Visual Assembler project) → VMA source, read-only ───────────────
//
// A .vas file is JSON. Its source is `expertText` when the project was saved from the
// Expert editor; otherwise it is rebuilt from `program`, one block → one line, in order
// (the same lines the Visual Assembler's block → Expert conversion writes).

export const VAS_SCHEME = 'vma-vas';

type Block = Record<string, any>;

const str = (v: unknown, def = ''): string => (v === undefined || v === null || v === '' ? def : String(v));
const up = (v: unknown, def: string): string => str(v, def).replace(/^#?\$/, '').toUpperCase();
const hex = (v: unknown, def: string): string => '$' + up(v, def);
/** An address field: a symbol stays as written, a number gets a $ */
const addr = (v: unknown, def: string): string => /^[A-Za-z_]/.test(str(v)) ? str(v) : hex(v, def);
const lower = (cs: unknown): string => (cs === 'lower' ? ', lower' : '');
const macroLabel = (b: Block): string => (b.macroLabel ? ` :${b.macroLabel}` : '');

/** Comma-separated values of a hex block: bare numbers get a $ */
function hexList(raw: unknown, base: unknown): string {
    const s = str(raw, '0');
    if (str(base, 'hex') !== 'hex') { return s; }
    return s.split(',').map(t => {
        const v = t.trim();
        return /^[0-9A-Fa-f]+$/.test(v) ? '$' + v.toUpperCase() : v;
    }).filter(Boolean).join(', ');
}

function cond(b: Block, kw: string): string {
    return `.${kw} ${str(b.runtimeIfReg, 'A').toUpperCase()} ${str(b.runtimeIfOp, '==')} ${str(b.rawOperand, '#$00')}`;
}

function blockToLine(b: Block): string {
    if (b.isBlankLine) { return ''; }
    if (b.isOrgMacro) { return `* = ${hex(b.orgAddress, '0801')}`; }
    if (b.isLabel && b.kickScope) { return `${b.labelName}: {`; }
    if (b.isComment && b.kickScopeEnd) { return '}'; }
    if (b.isLabel && b.labelOffset) {
        return `.label ${b.labelName} = * ${b.labelOffset < 0 ? '-' : '+'} ${Math.abs(b.labelOffset)}`;
    }
    if (b.isLabel) { return `${str(b.labelName, 'start')}:`; }
    if (b.isAnonymousLabel) { return '-'; }
    if (b.isComment) { return `; ${str(b.rawOperand ?? b.commentText)}`; }
    if (b.isTextMacro) { return `.text ${b.textX || 0}, ${b.textY || 0}, "${str(b.rawOperand)}"${lower(b.textCharset)}`; }
    if (b.isStringMacro) { return `.string ${addr(b.stringAddress, 'C000')}, "${str(b.rawOperand)}"${lower(b.textCharset)}${macroLabel(b)}`; }
    if (b.isRawTextMacro) { return `.rawtext ${addr(b.rawTextAddress, 'C000')}, "${str(b.rawOperand)}"${lower(b.textCharset)}${macroLabel(b)}`; }
    if (b.isPetsciiMacro) {
        return `.petscii ${addr(b.petsciiAddress, 'C000')}, "${str(b.rawOperand, 'HELLO')}"${lower(b.petsciiCharset)}`
            + `${b.petsciiNullTerminated ? ', null' : ''}${macroLabel(b)}`;
    }
    if (b.isDataMacro) { return `.data ${addr(b.dataAddress, 'C000')}, ${hexList(b.rawOperand, b.base)}${macroLabel(b)}`; }
    if (b.isRawBytesMacro) { return `.rawbytes ${addr(b.rawBytesAddress, 'C000')}, ${hexList(b.rawOperand, b.base)}${macroLabel(b)}`; }
    if (b.isByteMacro) { return `.byte ${hexList(b.rawOperand, b.base)}`; }
    if (b.isWordMacro) { return `.word ${hexList(b.rawOperand, b.base)}`; }
    if (b.isFillMacro) { return `.fill ${hexList(b.rawOperand, b.base)}`; }
    if (b.isAlignMacro) { return `.align ${str(b.rawOperand, '64')}`; }
    if (b.isIncBinMacro && b.incBinLevel) { return `.level "${str(b.incBinFileName, 'level.bin')}"`; }
    if (b.isIncBinMacro && b.incBinU64Pal) { return `.u64_palette "${str(b.incBinFileName, 'palette.vpl')}"`; }
    if (b.isIncBinMacro && b.incBinKoala) { return `.koala "${str(b.incBinFileName, 'picture.koa')}"`; }
    if (b.isIncBinMacro) {
        const a = str(b.incBinAddress);
        return `.incbin "${str(b.incBinFileName, 'data.bin')}"${a && a !== '$C000' ? ', ' + hex(a, 'C000') : ''}`;
    }
    if (b.isUciPaletteColorMacro) { return `.u64_palette_color ${str(b.rawOperand, '6, $3050C0').trim()}`; }
    if (b.isUciPaletteResetMacro) { return '.u64_palette_reset'; }
    if (b.isCharsetMacro) { return `.charset ${str(b.charsetMode, 'lower')}`; }
    if (b.isCharDefMacro) { return `.chardef ${addr(b.charDefBase, '3800')}, ${str(b.charDefIndex, '0')}, ${hexList(b.rawOperand, b.base)}`; }
    if (b.isTableMacro) { return `.table ${str(b.tableName, 'table1')}${b.tableAddress ? ' ' + hex(b.tableAddress, '') : ''}`; }
    if (b.isLoadFileMacro) {
        return `.loadfile "${str(b.loadFileName, 'DATA')}", ${str(b.loadFileDevice, '8')}`
            + `${b.loadFileAddress ? ', ' + hex(b.loadFileAddress, '') : ''}${b.loadFileErrorLabel ? ', ' + b.loadFileErrorLabel : ''}`;
    }
    if (b.isExoDecrunchMacro) { return `.exodecrunch depacker=${hex(b.exoDepackerAddr, 'B000')}`; }
    if (b.isSidMacro) { return `.sid "${str(b.sidFileName, 'music.sid')}"${b.sidCustomAddress ? ', ' + hex(b.sidCustomAddress, '') : ''}`; }
    if (b.isIncludeMacro) {
        const file = str(b.includeFile).split(/[\/\\]/).pop() || '';
        const name = /\.(vas|inc|asm|s)$/i.test(file) ? file : str(b.includeFileName, 'library.vas');
        return `.include "${name}"${b.includeAddress ? ', ' + hex(b.includeAddress, '') : ''}`;
    }
    if (b.isLoopMacro) { return `.loop ${str(b.loopReg, 'X')}, ${hex(b.loopCount, '0A')}, ${str(b.loopLabel, 'loop1')}`; }
    if (b.isNextMacro) { return `.next ${str(b.nextLabel, 'loop1')}`; }
    if (b.isForMacro) { return `.for ${str(b.loopReg, 'X')}, ${hex(b.loopCount, '0A')}, ${str(b.loopLabel, 'loop1')}`; }
    if (b.isEndfMacro) { return `.endf ${str(b.nextLabel, 'loop1')}`; }
    if (b.isPushMacro) { return `.push ${str(b.pushRegs, 'A')}`; }
    if (b.isPullMacro) { return `.pull ${str(b.pullRegs, 'A')}`; }
    if (b.isEndMacro) { return '.end'; }
    if (b.isConstMacro) {
        const raw = str(b.rawOperand ?? b.constValue, '0').trim();
        const v = str(b.base, 'hex') === 'dec' ? raw.replace(/^\$/, '') : hex(raw, '0');
        return `.const ${str(b.constName, 'MY_CONST')} = ${v}`;
    }
    if (b.isVarMacro) {
        const size = str(b.varSize, '1').trim();
        return `.var ${str(b.varName, 'my_var')}${size !== '1' ? ', ' + size : ''}`;
    }
    if (b.isRuntimeIfMacro) { return cond(b, 'if'); }
    if (b.isRuntimeElseMacro) { return '.else'; }
    if (b.isRuntimeEndIfMacro) { return '.endif'; }
    if (b.isRuntimeWhileMacro) { return cond(b, 'while'); }
    if (b.isRuntimeEndwMacro) { return '.endw'; }
    if (b.isRuntimeRepeatMacro) { return '.repeat'; }
    if (b.isRuntimeUntilMacro) { return cond(b, 'until'); }
    if (b.isMemCpyMacro) {
        return `.memcpy src=${addr(b.memcpySrc, 'C000')}, dst=${addr(b.memcpyDst, '0400')}, size=${addr(b.memcpySize, '0100')}`;
    }
    if (b.isMemSetMacro) {
        return `.memset addr=${addr(b.memsetDst, '0400')}, value=${addr(b.memsetValue, '20')}, size=${addr(b.memsetSize, '1000')}`;
    }
    if (b.isPrintMacro) { return `.print "${str(b.rawOperand)}"${lower(b.printCharset)}`; }
    if (b.isPrintCharMacro) { return `.print_char ${str(b.rawOperand, '$41')}`; }
    if (b.isPrintHexMacro) { return `.print_hex ${str(b.printReg || b.rawOperand, 'A').toUpperCase()}`; }
    if (b.isClearScreenMacro) { return '.clear_screen'; }
    if (b.isWaitKeyMacro) { return '.wait_key'; }
    if (b.isDelayMacro) { return `.delay ${str(b.delayFrames, '1').trim()}`; }
    if (b.isSetBorderMacro || b.isSetBgMacro) {
        const v = str(b.colorValue || b.rawOperand, '00').trim();
        return `.${b.isSetBorderMacro ? 'set_border' : 'set_bg'} ${/^[A-Za-z_]\w*$/.test(v) ? v : hex(v, '00')}`;
    }
    if (b.isSidPlayerMacro) { return `.sid_player ${str(b.sidPlayerSong, '0')}, ${hex(b.sidPlayerRaster, 'FA')}`; }
    if (b.isIrqSetupMacro) { return `.irq_setup handler=${str(b.irqHandler, 'my_irq')}, raster=${hex(b.irqRaster, 'FA')}`; }
    if (b.isRandMacro) { return `.rand ${str(b.randSeed, '$FB')}`; }
    if (b.isDefineMacro) { return `.define ${str(b.rawOperand, 'SYMBOL')}`; }
    if (b.isIfMacro) { return `.if ${str(b.rawOperand, 'SYMBOL')}`; }
    if (b.isElseMacro) { return '.else'; }
    if (b.isEndIfMacro) { return '.endif'; }
    if (b.isRegionMacro) { return `.region ${str(b.regionName, 'region')}`; }
    if (b.isEndRegionMacro) { return '.endregion'; }
    // GROUP / ENDGROUP: the older name of REGION / ENDREGION
    if (b.isGroupMacro) { return `.region ${str(b.groupName || b.rawOperand, 'region')}`; }
    if (b.isEndGroupMacro) { return '.endregion'; }
    if (b.isMacroDefStart) { return `.macro ${str(b.macroName || b.rawOperand, 'myMacro')}${b.macroParams ? '(' + b.macroParams + ')' : ''}`; }
    if (b.isMacroDefEnd) { return '.endm'; }
    if (b.isMacroInvoke) {
        const name = str(b.invokeMacroName, 'myMacro');
        const args = b.invokeArgs ? `(${b.invokeArgs})` : '';
        const syn = str(b.invokeSyntax, 'invoke');
        return syn === ':' ? `:${name}${args}` : `.${syn} ${name}${args}`;
    }
    if (b.isSpriteInitMacro) {
        return `.sprite_init ${b.spriteNum || 0}, ${b.spriteColor || 7}, ${hex(b.spriteDataPage, '21')}${b.spriteMulticolor ? ', multicolor' : ''}`;
    }
    if (b.isSpritePosMacro) { return `.sprite_pos ${b.spriteNum || 0}, ${b.spriteX || 152}, ${b.spriteY || 100}`; }
    if (b.isWaitRasterMacro) { return `.wait_raster ${hex(b.rasterLine, 'FF')}`; }
    if (b.isJoystickMacro) { return `.joystick ${b.joyPort || 2}, ${b.joySpriteNum || 0}`; }
    if (b.isSpriteColMacro) { return `.sprite_col ${b.spriteNum || 0}, ${str(b.colType, 'background')}`; }
    if (b.isMapCopyMacro) {
        const base = `.map_copy ${hex(b.mapCopySrc, 'C000')}, ${hex(b.mapCopyDst, '0400')}, ${b.mapCopySize || 1000}`;
        if (b.mapCopyCombined) { return `${base}, auto, ${hex(b.mapCopyColorDst, 'D800')}`; }
        return b.mapCopyColorSrc ? `${base}, ${hex(b.mapCopyColorSrc, '')}, ${hex(b.mapCopyColorDst, 'D800')}` : base;
    }
    if (b.isReuCheckMacro) { return '.reu_check'; }
    if (b.isAssertMacro) {
        const expr = str(b.assertExpr || b.rawOperand, '1').trim();
        return b.assertMessage ? `.assert ${expr}, "${b.assertMessage}"` : `.assert ${expr}`;
    }
    // A library macro block written as it was parsed
    if (typeof b._macroLine === 'string' && b._macroLine) { return b._macroLine; }
    // Any other macro block: not converted here — kept visible as a comment
    if (Object.keys(b).some(k => /^is[A-Z]\w*Macro$/.test(k) && b[k] === true)) {
        return `; [.vas] ${str(b.mnemonic)} ${str(b.operand)}`.trimEnd();
    }
    // Plain instruction: `operand` is already in assembler form ($D020, #$01, ($FB),Y, label)
    const op = str(b.operand);
    return (op ? `    ${str(b.mnemonic, 'NOP')} ${op}` : `    ${str(b.mnemonic, 'NOP')}`).trimEnd();
}

/** The VMA source of a .vas project's JSON text */
export function vasToSource(json: string): string {
    const project = JSON.parse(json);
    if (project && typeof project.expertText === 'string' && project.expertText.trim()) {
        return project.expertText;
    }
    if (!project || typeof project !== 'object' || !Array.isArray(project.program)) {
        throw new Error('Not a C64 Visual Assembler project (no "expertText" and no "program").');
    }
    const blocks: Block[] = project.program;
    const lines: string[] = [];
    // older projects keep the start address beside the blocks, not as an ORG block
    if (!blocks.some(b => b && b.isOrgMacro)) {
        lines.push(`* = ${hex(project.origin, '0801')}`);
    }
    for (const b of blocks) {
        if (!b || typeof b !== 'object') { continue; }
        const line = blockToLine(b);
        const note = str(b.inlineComment).trim();
        lines.push(note ? `${line} ; ${note}` : line);
    }
    return lines.join('\n') + '\n';
}

// ── Virtual document ──────────────────────────────────────────────────────────
// vma-vas:/F:/dir/name.vas.vma?<file uri> — the .vma ending gives it the VMA language

export function vasSourceUri(file: vscode.Uri): vscode.Uri {
    return vscode.Uri.from({ scheme: VAS_SCHEME, path: file.path + '.vma', query: file.toString() });
}

function fileOf(uri: vscode.Uri): vscode.Uri {
    return vscode.Uri.parse(uri.query);
}

export class VasSourceProvider implements vscode.TextDocumentContentProvider {
    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    provideTextDocumentContent(uri: vscode.Uri): string {
        const file = fileOf(uri);
        try {
            return vasToSource(fs.readFileSync(file.fsPath, 'utf8'));
        } catch (e: any) {
            return `; Cannot read ${file.fsPath}\n; ${e?.message ?? e}\n`;
        }
    }

    /** The .vas file changed on disk: refresh its open source views */
    refresh(file: vscode.Uri): void {
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.uri.scheme === VAS_SCHEME && fileOf(doc.uri).fsPath === file.fsPath) {
                this._onDidChange.fire(doc.uri);
            }
        }
    }

    dispose(): void { this._onDidChange.dispose(); }
}

export async function cmdOpenVasSource(arg?: vscode.Uri): Promise<void> {
    let file = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri;
    if (!file || !/\.vas$/i.test(file.path)) {
        const picked = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'Visual Assembler project': ['vas'] },
            openLabel: 'Open as VMA source',
        });
        if (!picked || !picked.length) { return; }
        file = picked[0];
    }
    const doc = await vscode.workspace.openTextDocument(vasSourceUri(file));
    if (doc.languageId !== 'vma') { await vscode.languages.setTextDocumentLanguage(doc, 'vma'); }
    await vscode.window.showTextDocument(doc, { preview: false });
}

export function registerVas(context: vscode.ExtensionContext): void {
    const provider = new VasSourceProvider();
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.vas');
    context.subscriptions.push(
        provider,
        watcher,
        vscode.workspace.registerTextDocumentContentProvider(VAS_SCHEME, provider),
        vscode.commands.registerCommand('vma.openVasSource', (uri?: vscode.Uri) => cmdOpenVasSource(uri)),
        watcher.onDidChange(uri => provider.refresh(uri)),
        watcher.onDidCreate(uri => provider.refresh(uri)),
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (/\.vas$/i.test(doc.uri.path)) { provider.refresh(doc.uri); }
        }),
    );
}
