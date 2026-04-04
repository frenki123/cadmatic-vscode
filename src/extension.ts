import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/lib/node/main';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel | undefined;

function getLspPath(config: vscode.WorkspaceConfiguration): string {
    const configuredPath = config.get<string>('lspPath', '');
    if (configuredPath && fs.existsSync(configuredPath)) {
        return configuredPath;
    }

    const workspaceRoot = path.resolve(__dirname, '..', '..');
    const debugLspPath = path.join(workspaceRoot, '..', 'cadmatic-lsp', 'target', 'debug', 'cadmatic-cli.exe');
    const releaseLspPath = path.join(workspaceRoot, '..', 'cadmatic-lsp', 'target', 'release', 'cadmatic-cli.exe');
    
    try {
        fs.accessSync(releaseLspPath);
        return releaseLspPath;
    } catch {
        return debugLspPath;
    }
}

function createServerOptions(workspacePath: string, lspPath: string): ServerOptions {
    
    return async () => {
        const childProcess = spawn(lspPath, ['lsp'], {
            env: { 
                ...process.env, 
                PMS_RUNDIR: workspacePath 
            }
        });

        childProcess.stderr?.on('data', (chunk: Buffer) => {
            outputChannel?.appendLine(`[LSP stderr] ${chunk.toString()}`);
        });

        childProcess.on('error', (err: Error) => {
            outputChannel?.appendLine(`[LSP error] ${err.message}`);
            vscode.window.showErrorMessage(`CADMATIC LSP failed to start: ${err.message}`);
        });

        return childProcess;
    };
}

export function activate(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel('CADMATIC LSP');
    context.subscriptions.push(outputChannel);

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    
    const config = vscode.workspace.getConfiguration('cadmatic');
    const pmsRundir = config.get<string>('pmsRundir', '');
    const pmsHome = config.get<string>('pmsHome', '');
    
    outputChannel.appendLine(`[LSP] Workspace: ${workspacePath}`);
    outputChannel.appendLine(`[LSP] Binary: ${getLspPath(config)}`);
    outputChannel.appendLine(`[LSP] PMS_RUNDIR: ${pmsRundir || '(from env)'}`);
    outputChannel.appendLine(`[LSP] PMS_HOME: ${pmsHome || '(from env)'}`);
    
    const lspPath = getLspPath(config);
    const serverOptions: ServerOptions = createServerOptions(workspacePath, lspPath);
    
    const initializationOptions = {
        pms_rundir: pmsRundir || undefined,
        pms_home: pmsHome || undefined
    };
    
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ language: 'cadmatic' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{h,mac}')
        },
        initializationOptions
    };

    client = new LanguageClient('cadmatic-lsp', 'CADMATIC LSP', serverOptions, clientOptions);
    
    client.start();
    context.subscriptions.push({ dispose: () => client?.stop() });
}

export function deactivate(): void {
    if (client) {
        client.stop();
    }
}
