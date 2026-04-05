import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/lib/node/main';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel | undefined;

function getPlatform(): string {
    const platform = os.platform();
    const arch = os.arch();
    
    if (platform === 'win32') return 'win32-x64';
    if (platform === 'darwin') {
        return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    }
    return 'linux-x64';
}

function getExeName(): string {
    return os.platform() === 'win32' ? 'cadmatic-analyze.exe' : 'cadmatic-analyze';
}

function getBundledPath(context: vscode.ExtensionContext): string | undefined {
    const extensionPath = context.extensionPath;
    const platform = getPlatform();
    const exeName = getExeName();
    const bundledPath = path.join(extensionPath, 'bin', platform, exeName);
    
    if (fs.existsSync(bundledPath)) {
        return bundledPath;
    }
    return undefined;
}

function getDevPath(): string {
    const exeName = getExeName();
    const workspaceRoot = path.resolve(__dirname, '..', '..');
    const releasePath = path.join(workspaceRoot, '..', 'cadmatic-analyze', 'target', 'release', exeName);
    const debugPath = path.join(workspaceRoot, '..', 'cadmatic-analyze', 'target', 'debug', exeName);
    
    if (fs.existsSync(releasePath)) {
        return releasePath;
    }
    return debugPath;
}

function getLspPath(config: vscode.WorkspaceConfiguration, context: vscode.ExtensionContext): string {
    const configuredPath = config.get<string>('lspPath', '');
    if (configuredPath && fs.existsSync(configuredPath)) {
        return configuredPath;
    }
    
    const exeName = getExeName();
    const pathEnv = process.env.PATH || '';
    for (const dir of pathEnv.split(path.delimiter)) {
        const candidate = path.join(dir, exeName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    
    const bundledPath = getBundledPath(context);
    if (bundledPath) {
        return bundledPath;
    }
    
    return getDevPath();
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
    
    const lspPath = getLspPath(config, context);
    
    outputChannel.appendLine(`[LSP] Workspace: ${workspacePath}`);
    outputChannel.appendLine(`[LSP] Binary: ${lspPath}`);
    outputChannel.appendLine(`[LSP] Platform: ${getPlatform()}`);
    outputChannel.appendLine(`[LSP] PMS_RUNDIR: ${pmsRundir || '(from env)'}`);
    outputChannel.appendLine(`[LSP] PMS_HOME: ${pmsHome || '(from env)'}`);
    
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
