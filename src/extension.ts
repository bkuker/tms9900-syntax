import * as vscode from 'vscode';

/**
 * TMS9900 Assembly Formatter
 * Formats assembly code with consistent indentation and comment alignment
 */

interface ParsedLine {
    label: string;
    instruction: string;
    operands: string;
    comment: string;
}

// TMS9900 instruction set
const INSTRUCTIONS = new Set([
    'A', 'AB', 'ABS', 'AI', 'ANDI', 'B', 'BL', 'BLWP', 'C', 'CB', 'CI', 'CLR',
    'COC', 'CZC', 'DEC', 'DECT', 'DIV', 'IDIV', 'INC', 'INCT', 'INV',
    'JEQ', 'JGT', 'JHE', 'JH', 'JL', 'JLE', 'JLT', 'JMP', 'JNC', 'JNE', 'JNO', 'JOC', 'JOP',
    'LDCR', 'LI', 'LIMI', 'LREX', 'LWPI', 'MOV', 'MOVB', 'MPY', 'NEG', 'ORI',
    'RTWP', 'S', 'SB', 'SBO', 'SBZ', 'SETO', 'SLA', 'SRA', 'SRC', 'SRL',
    'STCR', 'STST', 'STWP', 'SWPB', 'SZC', 'SZF', 'TB', 'X', 'XOP', 'XOR'
]);

// Assembler directives
const DIRECTIVES = new Set([
    'EQU', 'DATA', 'BYTE', 'TEXT', 'BSS', 'BES', 'ORG', 'END', 'AORG', 'RORG', 'DORG',
    'IDT', 'DEF', 'REF', 'TITL', 'PAGE', 'LIST', 'UNL', "BCOPY", "COPY", "SAVE"
]);

// Formatting configuration
interface FormatConfig {
    labelColumn: number;
    instructionColumn: number;
    operandColumn: number;
    commentColumn: number;
    uppercaseInstructions: boolean;
    uppercaseDirectives: boolean;
    spaceAfterComma: boolean;
}

function getFormatConfig(): FormatConfig {
    const config = vscode.workspace.getConfiguration('tms9900');
    return {
        labelColumn: config.get('format.labelColumn', 0),
        instructionColumn: config.get('format.instructionColumn', 9),
        operandColumn: config.get('format.operandColumn', 18),
        commentColumn: config.get('format.commentColumn', 40),
        uppercaseInstructions: config.get('format.uppercaseInstructions', true),
        uppercaseDirectives: config.get('format.uppercaseDirectives', true),
        spaceAfterComma: config.get('format.spaceAfterComma', true)
    };
}

function parseLine(line: string): ParsedLine {
    const result: ParsedLine = {
        label: '',
        instruction: '',
        operands: '',
        comment: ''
    };

    // Handle comment-only lines (starting with * or ;)
    if (line.trimStart().startsWith('*') || line.trimStart().startsWith(';')) {
        result.comment = line.trimStart();
        return result;
    }

    // Split by semicolon to separate code from comment
    const commentIndex = line.indexOf(';');
    let codePart = commentIndex >= 0 ? line.substring(0, commentIndex) : line;
    result.comment = commentIndex >= 0 ? line.substring(commentIndex).trim() : '';

    // Trim and check if there's any code
    codePart = codePart.trimEnd();
    if (!codePart.trim()) {
        return result;
    }

    // Parse the code part
    // Pattern: [LABEL] [INSTRUCTION] [OPERANDS]
    const tokens = codePart.trim().split(/\s+/);
    if (tokens.length === 0) {
        return result;
    }

    let tokenIndex = 0;

    // Check if first token is a label (not an instruction or directive)
    const firstToken = tokens[tokenIndex].toUpperCase();
    const isInstOrDir = INSTRUCTIONS.has(firstToken) || DIRECTIVES.has(firstToken) || firstToken.startsWith(".");
    
    if (!isInstOrDir && tokens.length > 1) {
        // First token is a label
        result.label = tokens[tokenIndex];
        tokenIndex++;
    } else if (!isInstOrDir && tokens.length === 1) {
        // Single token that's not an instruction - probably a label only
        result.label = tokens[tokenIndex];
        return result;
    }

    // Next token is instruction/directive (if we have one)
    if (tokenIndex < tokens.length) {
        result.instruction = tokens[tokenIndex];
        tokenIndex++;
    }

    // Rest is operands
    if (tokenIndex < tokens.length) {
        result.operands = tokens.slice(tokenIndex).join(' ');
    }

    return result;
}

function formatOperands(operands: string, config: FormatConfig): string {
    if (!operands) return '';
    
    if (config.spaceAfterComma) {
        // Add space after commas if not already present
        return operands.replace(/,\s*/g, ', ').replace(/,\s+/g, ', ');
    }
    
    return operands;
}

function formatLine(line: string, config: FormatConfig): string {
    // Preserve completely blank lines
    if (!line.trim()) {
        return '';
    }

    const parsed = parseLine(line);

    // Comment-only line - check if it starts at column 0 or has leading whitespace
    if (parsed.comment && !parsed.label && !parsed.instruction && !parsed.operands) {
        // If original line has no leading whitespace, keep it at column 0
        if (line.trimStart() === line) {
            return parsed.comment;
        } else {
            // Had leading whitespace, align to comment column
            return ''.padEnd(config.commentColumn) + parsed.comment;
        }
    }

    let formatted = '';

    // Add label at column 0 or configured position
    if (parsed.label) {
        // If label is longer than instructionColumn, add at least one space
        if (parsed.label.length >= config.instructionColumn) {
            formatted = parsed.label + ' ';
        } else {
            formatted = parsed.label.padEnd(config.instructionColumn);
        }
    } else {
        formatted = ''.padEnd(config.instructionColumn);
    }

    // Add instruction
    if (parsed.instruction) {
        let inst = parsed.instruction;
        const instUpper = inst.toUpperCase();
        
        if (INSTRUCTIONS.has(instUpper) && config.uppercaseInstructions) {
            inst = instUpper;
        } else if (DIRECTIVES.has(instUpper) && config.uppercaseDirectives) {
            inst = instUpper;
        }
        
        // If we already have content and instruction would be too close, ensure space
        if (formatted.length > 0 && formatted.trimEnd() === formatted) {
            // Content exists and has no trailing spaces, add one
            formatted += inst;
        } else {
            formatted += inst;
        }
    }

    // Add operands
    if (parsed.operands) {
        // Always ensure at least one space before operands
        formatted = formatted.trimEnd() + ' ';
        formatted += formatOperands(parsed.operands, config);
    }

    // Add comment at configured column
    if (parsed.comment) {
        const currentLength = formatted.trimEnd().length;
        if (currentLength < config.commentColumn) {
            formatted = formatted.trimEnd().padEnd(config.commentColumn) + parsed.comment;
        } else {
            // If line is already past comment column, add two spaces
            formatted = formatted.trimEnd() + '  ' + parsed.comment;
        }
    }

    return formatted.trimEnd();
}

class TMS9900FormattingProvider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        const config = getFormatConfig();
        const edits: vscode.TextEdit[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            if (token.isCancellationRequested) {
                break;
            }

            const line = document.lineAt(i);
            const formatted = formatLine(line.text, config);

            if (formatted !== line.text) {
                edits.push(vscode.TextEdit.replace(line.range, formatted));
            }
        }

        return edits;
    }
}

class TMS9900RangeFormattingProvider implements vscode.DocumentRangeFormattingEditProvider {
    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        const config = getFormatConfig();
        const edits: vscode.TextEdit[] = [];

        for (let i = range.start.line; i <= range.end.line; i++) {
            if (token.isCancellationRequested) {
                break;
            }

            const line = document.lineAt(i);
            const formatted = formatLine(line.text, config);

            if (formatted !== line.text) {
                edits.push(vscode.TextEdit.replace(line.range, formatted));
            }
        }

        return edits;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('TMS9900 formatter extension activated');

    // Register document formatter
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(
            'tms9900',
            new TMS9900FormattingProvider()
        )
    );

    // Register range formatter
    context.subscriptions.push(
        vscode.languages.registerDocumentRangeFormattingEditProvider(
            'tms9900',
            new TMS9900RangeFormattingProvider()
        )
    );
}

export function deactivate() {}
