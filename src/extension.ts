import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/lib/node/main';

import { ProjectManagerView, ProjectScope, ProjectViewModel } from './views/project-manager-view';

type ProjectData = {
    installDir: string;
    lang?: string;
    projectDir: string;
    extraEnv: Record<string, string>;
};
type ProjectProfiles = Record<string, ProjectData>;

interface CadmaticConfig {
    lspPath: string;
    activeProject: string;
    projects: ProjectProfiles;
}

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let projectManagerView: ProjectManagerView | undefined;

const GLOBAL_PROJECTS_KEY = 'cadmatic.globalProjects';

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

function getLspPath(config: CadmaticConfig, context: vscode.ExtensionContext): string {
    const configuredPath = config.lspPath;
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

function getConfig(): CadmaticConfig {
    const config = vscode.workspace.getConfiguration('cadmatic');
    return {
        lspPath: config.get<string>('lspPath', ''),
        activeProject: config.get<string>('activeProject', ''),
        projects: config.get<ProjectProfiles>('projects', {})
    };
}

function getGlobalProjects(): ProjectProfiles {
    if (!extensionContext) return {};
    return extensionContext.globalState.get<ProjectProfiles>(GLOBAL_PROJECTS_KEY) || {};
}

function setGlobalProjects(projects: ProjectProfiles): Thenable<void> {
    if (extensionContext) {
        return extensionContext.globalState.update(GLOBAL_PROJECTS_KEY, projects);
    }
    return Promise.resolve();
}

function getMergedProjects(): { name: string; data: ProjectData; source: 'global' | 'local' }[] {
    const globalProjects = getGlobalProjects();
    const localProjects = getConfig().projects;
    const result: { name: string; data: ProjectData; source: 'global' | 'local' }[] = [];
    const seenNames = new Set<string>();
    
    for (const [name, data] of Object.entries(localProjects)) {
        result.push({ name, data, source: 'local' });
        seenNames.add(name);
    }
    
    for (const [name, data] of Object.entries(globalProjects)) {
        if (!seenNames.has(name)) {
            result.push({ name, data, source: 'global' });
        }
    }
    
    return result.sort((a, b) => a.name.localeCompare(b.name));
}

function getProjectData(projectName: string): ProjectData | undefined {
    const merged = getMergedProjects();
    const project = merged.find(p => p.name === projectName);
    return project?.data;
}

function getProjectsForView(): ProjectViewModel[] {
    const activeProject = getConfig().activeProject;
    return getMergedProjects().map(project => ({
        name: project.name,
        installDir: project.data.installDir,
        lang: project.data.lang,
        projectDir: project.data.projectDir,
        extraEnv: project.data.extraEnv,
        source: project.source,
        active: project.name === activeProject
    }));
}

function getActiveProject(): { name: string | undefined; data: ProjectData | undefined } {
    const config = getConfig();
    
    if (config.activeProject) {
        const data = getProjectData(config.activeProject);
        if (data) {
            return { name: config.activeProject, data };
        }
    }
    
    const merged = getMergedProjects();
    if (merged.length > 0) {
        return { name: merged[0].name, data: merged[0].data };
    }
    
    return { name: undefined, data: undefined };
}

function buildInitializationOptions(projectData: ProjectData | undefined): object {
    return {
        install_dir: projectData?.installDir || '',
        lang: projectData?.lang || 'english',
        ...(projectData?.projectDir ? { project_dir: projectData.projectDir } : {}),
        extraEnv: projectData?.extraEnv || {}
    };
}

function createServerOptions(lspPath: string): ServerOptions {
    return async () => {
        const childProcess = spawn(lspPath, ['lsp']);

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

function updateStatusBar(projectName: string | undefined, source?: 'global' | 'local'): void {
    if (!statusBarItem) {
        statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        statusBarItem.command = 'cadmatic.switchProject';
        extensionContext?.subscriptions.push(statusBarItem);
    }
    
    if (projectName) {
        const sourceLabel = source ? ` (${source === 'global' ? 'G' : 'L'})` : '';
        statusBarItem.text = `$(folder) CADMATIC: ${projectName}${sourceLabel}`;
        statusBarItem.tooltip = 'Click to switch CADMATIC project';
        statusBarItem.show();
    } else {
        statusBarItem.text = `$(folder) CADMATIC: No Project`;
        statusBarItem.tooltip = 'No CADMATIC project configured. Click to configure.';
        statusBarItem.show();
    }
}

function startLSP(): void {
    if (!extensionContext) {
        return;
    }
    
    if (client) {
        client.stop();
    }
    
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const config = getConfig();
    const lspPath = getLspPath(config, extensionContext);
    
    const { name: projectName, data: projectData } = getActiveProject();
    const merged = getMergedProjects();
    const activeProject = merged.find(p => p.name === projectName);
    
    const serverOptions = createServerOptions(lspPath);
    const initializationOptions = buildInitializationOptions(projectData);
    
    outputChannel?.clear();
    outputChannel?.appendLine(`[LSP] Starting CADMATIC Language Server...`);
    outputChannel?.appendLine(`[LSP] Workspace: ${workspacePath}`);
    outputChannel?.appendLine(`[LSP] Binary: ${lspPath}`);
    outputChannel?.appendLine(`[LSP] Platform: ${getPlatform()}`);
    outputChannel?.appendLine(`[LSP] Project: ${projectName || '(none)'}`);
    
    if (projectData?.installDir) {
        const extraEnv = projectData.extraEnv ?? {};
        outputChannel?.appendLine(`[LSP]   installDir: ${projectData.installDir}`);
        if (projectData.lang) {
            outputChannel?.appendLine(`[LSP]   lang: ${projectData.lang}`);
        }
        if (projectData.projectDir) {
            outputChannel?.appendLine(`[LSP]   projectDir: ${projectData.projectDir}`);
        }
        if (Object.keys(extraEnv).length > 0) {
            outputChannel?.appendLine(`[LSP]   extraEnv: ${JSON.stringify(extraEnv)}`);
        }
        if (!fs.existsSync(projectData.installDir)) {
            outputChannel?.appendLine(`[LSP] WARNING: installDir does not exist`);
            vscode.window.showWarningMessage(`CADMATIC: installDir does not exist: ${projectData.installDir}`);
        }
    } else {
        outputChannel?.appendLine(`[LSP] WARNING: No project configured. Include resolution may be limited.`);
    }
    
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ language: 'cadmatic' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{h,mac}')
        },
        initializationOptions
    };

    client = new LanguageClient('cadmatic-lsp', 'CADMATIC LSP', serverOptions, clientOptions);
    
    client.start();
    
    updateStatusBar(projectName, activeProject?.source);
    projectManagerView?.refresh();
}

function isExistingDirectory(pathValue: string): boolean {
    try {
        const stats = fs.statSync(pathValue);
        return stats.isDirectory();
    } catch {
        return false;
    }
}

async function saveProject(input: {
    name: string;
    installDir: string;
    lang?: string;
    projectDir?: string;
    extraEnv?: Record<string, string>;
    scope: ProjectScope;
}): Promise<{ ok: boolean; message: string }> {
    const name = input.name.trim();
    const installDir = input.installDir.trim();
    const lang = input.lang?.trim();
    const projectDir = input.projectDir?.trim();
    const extraEnv = input.extraEnv || {};

    if (!name) {
        return { ok: false, message: 'Project name is required.' };
    }

    if (getMergedProjects().some(project => project.name === name)) {
        return { ok: false, message: `Project "${name}" already exists.` };
    }

    if (!installDir) {
        return { ok: false, message: 'Install directory is required.' };
    }

    if (!isExistingDirectory(installDir)) {
        return { ok: false, message: `Install directory does not exist: ${installDir}` };
    }

    if (projectDir && !isExistingDirectory(projectDir)) {
        return { ok: false, message: `Project directory does not exist: ${projectDir}` };
    }

    const invalidEntry = Object.entries(extraEnv).find(([key, value]) => typeof key !== 'string' || typeof value !== 'string');
    if (invalidEntry) {
        return { ok: false, message: 'extraEnv must be a JSON object with string key/value pairs.' };
    }

    const projectData: ProjectData = {
        installDir,
        lang: lang || undefined,
        projectDir: projectDir || '',
        extraEnv
    };

    if (input.scope === 'global') {
        const globalProjects = getGlobalProjects();
        globalProjects[name] = projectData;
        await setGlobalProjects(globalProjects);
    } else {
        const config = vscode.workspace.getConfiguration('cadmatic');
        const localProjects = config.get<ProjectProfiles>('projects', {});
        localProjects[name] = projectData;
        await config.update('projects', localProjects, false);
    }

    startLSP();
    return { ok: true, message: `Project "${name}" saved (${input.scope}).` };
}

async function deleteProjectByName(projectName: string): Promise<{ ok: boolean; message: string }> {
    const project = getMergedProjects().find(item => item.name === projectName);
    if (!project) {
        return { ok: false, message: `Project "${projectName}" not found.` };
    }

    if (project.source === 'global') {
        const globalProjects = getGlobalProjects();
        delete globalProjects[projectName];
        await setGlobalProjects(globalProjects);
    } else {
        const localProjects = getConfig().projects;
        delete localProjects[projectName];
        await vscode.workspace.getConfiguration('cadmatic').update('projects', localProjects, false);
    }

    if (getConfig().activeProject === projectName) {
        await vscode.workspace.getConfiguration('cadmatic').update('activeProject', '', true);
    }

    startLSP();
    return { ok: true, message: `Project "${projectName}" deleted.` };
}

async function activateProject(projectName: string): Promise<{ ok: boolean; message: string }> {
    if (!getProjectData(projectName)) {
        return { ok: false, message: `Project "${projectName}" not found.` };
    }
    await vscode.workspace.getConfiguration('cadmatic').update('activeProject', projectName, true);
    startLSP();
    return { ok: true, message: `Project "${projectName}" is active.` };
}

async function pickInstallDir(): Promise<string | undefined> {
    const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select install directory'
    });
    return selected?.[0]?.fsPath;
}

async function pickProjectDir(): Promise<string | undefined> {
    const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select project directory (.pms folder)',
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
    });
    return selected?.[0]?.fsPath;
}

function switchProject(): void {
    const merged = getMergedProjects();
    const config = getConfig();
    
    if (merged.length === 0) {
        vscode.window.showInformationMessage(
            'No CADMATIC projects. Use "CADMATIC: Add Project" to create one.'
        );
        return;
    }
    
    const items: vscode.QuickPickItem[] = merged.map(p => ({
        label: `${p.name} (${p.source === 'global' ? 'G' : 'L'})`,
        description: p.data.installDir,
        picked: p.name === config.activeProject
    }));
    
    if (!config.activeProject) {
        items.unshift({ label: '(No active project)', description: 'Clear project selection' });
    }
    
    void vscode.window.showQuickPick(items, {
        placeHolder: 'Select CADMATIC project',
        canPickMany: false
    }).then(async selection => {
        if (!selection) return;
        
        try {
            if (selection.label === '(No active project)') {
                await vscode.workspace.getConfiguration('cadmatic').update('activeProject', '', true);
            } else {
                const selectedName = selection.label.split(' (')[0];
                await activateProject(selectedName);
                return;
            }
            
            startLSP();
        } catch (err) {
            outputChannel?.appendLine(`[Error] Failed to switch project: ${err}`);
        }
    });
}

function restartLsp(): void {
    outputChannel?.appendLine(`[LSP] Manual restart requested`);
    startLSP();
}

export function activate(context: vscode.ExtensionContext): void {
    extensionContext = context;
    outputChannel = vscode.window.createOutputChannel('CADMATIC LSP');
    context.subscriptions.push(outputChannel);

projectManagerView = new ProjectManagerView(context, {
        listProjects: getProjectsForView,
        saveProject,
        activateProject,
        deleteProject: deleteProjectByName,
        pickInstallDir,
        pickProjectDir
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('cadmatic.projectManager', projectManagerView, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('cadmatic.switchProject', switchProject)
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('cadmatic.restartLsp', restartLsp)
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('cadmatic.projects') || event.affectsConfiguration('cadmatic.activeProject')) {
                projectManagerView?.refresh();
            }
        })
    );
    
    startLSP();
}

export function deactivate(): void {
    if (client) {
        client.stop();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
