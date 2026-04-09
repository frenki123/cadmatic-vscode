import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/lib/node/main';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

type ProjectEnvVars = Record<string, string>;
type ProjectData = {
    PMS_RUNDIR?: string;
    PMS_HOME?: string;
    PMS_CONFDIR?: string;
    PMS_LANG?: string;
    [key: string]: string | undefined;
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

function setGlobalProjects(projects: ProjectProfiles): void {
    if (extensionContext) {
        extensionContext.globalState.update(GLOBAL_PROJECTS_KEY, projects);
    }
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

function getActiveProjectEnv(): { name: string | undefined; vars: ProjectEnvVars } {
    const config = getConfig();
    
    if (config.activeProject) {
        const data = getProjectData(config.activeProject);
        if (data) {
            return { name: config.activeProject, vars: data as ProjectEnvVars };
        }
    }
    
    const merged = getMergedProjects();
    if (merged.length > 0) {
        return { name: merged[0].name, vars: merged[0].data as ProjectEnvVars };
    }
    
    if (config.projects) {
        const localProjects = Object.entries(config.projects);
        if (localProjects.length > 0) {
            return { name: localProjects[0][0], vars: localProjects[0][1] as ProjectEnvVars };
        }
    }
    
    const legacyConfig = vscode.workspace.getConfiguration('cadmatic');
    const legacyRundir = legacyConfig.get<string>('pmsRundir', '');
    const legacyHome = legacyConfig.get<string>('pmsHome', '');
    
    if (legacyRundir || legacyHome) {
        const legacyVars: ProjectEnvVars = {};
        if (legacyRundir) legacyVars.PMS_RUNDIR = legacyRundir;
        if (legacyHome) legacyVars.PMS_HOME = legacyHome;
        return { name: '(legacy)', vars: legacyVars };
    }
    
    return { name: undefined, vars: {} };
}

function buildEnvVars(projectVars: ProjectEnvVars): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    
    for (const [key, value] of Object.entries(projectVars)) {
        if (value) {
            env[key] = value;
        }
    }
    
    return env;
}

function buildInitializationOptions(projectVars: ProjectEnvVars): object {
    const options: Record<string, string | undefined> = {};
    
    for (const [key, value] of Object.entries(projectVars)) {
        const normalizedKey = key.toLowerCase().replace(/^pms_/, '');
        options[normalizedKey] = value || undefined;
    }
    
    return {
        pms_rundir: options.rundir,
        pms_home: options.home,
        pms_confdir: options.confdir,
        pms_lang: options.lang,
        pms_projroot: options.projroot,
        pms_projname: options.projname,
        env_vars: projectVars
    };
}

function createServerOptions(lspPath: string, envVars: NodeJS.ProcessEnv): ServerOptions {
    return async () => {
        const childProcess = spawn(lspPath, ['lsp'], { env: envVars });

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
    
    const { name: projectName, vars: projectVars } = getActiveProjectEnv();
    const merged = getMergedProjects();
    const activeProject = merged.find(p => p.name === projectName);
    
    const envVars = buildEnvVars(projectVars);
    const serverOptions = createServerOptions(lspPath, envVars);
    const initializationOptions = buildInitializationOptions(projectVars);
    
    outputChannel?.clear();
    outputChannel?.appendLine(`[LSP] Starting CADMATIC Language Server...`);
    outputChannel?.appendLine(`[LSP] Workspace: ${workspacePath}`);
    outputChannel?.appendLine(`[LSP] Binary: ${lspPath}`);
    outputChannel?.appendLine(`[LSP] Platform: ${getPlatform()}`);
    outputChannel?.appendLine(`[LSP] Project: ${projectName || '(none)'}`);
    
    if (projectVars) {
        for (const [key, value] of Object.entries(projectVars)) {
            if (key.startsWith('PMS_') || key.startsWith('pms_')) {
                outputChannel?.appendLine(`[LSP]   ${key}=${value}`);
            }
        }
    }
    
    if (projectName === '(legacy)') {
        outputChannel?.appendLine(`[LSP] Using legacy config (pmsRundir/pmsHome)`);
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
}

function migrateProjects(): void {
    const config = getConfig();
    const localProjects = config.projects;
    
    if (Object.keys(localProjects).length > 0) {
        const globalProjects = getGlobalProjects();
        const merged = { ...globalProjects, ...localProjects };
        setGlobalProjects(merged);
        
        vscode.workspace.getConfiguration('cadmatic').update('projects', {}, true);
        
        outputChannel?.appendLine(`[Migrated] ${Object.keys(localProjects).length} projects moved to global storage`);
    }
}

async function addProject(): Promise<void> {
    const name = await vscode.window.showInputBox({
        prompt: 'Enter project name',
        placeHolder: 'MyProject'
    });
    
    if (!name) return;
    
    const pmsRundir = await vscode.window.showInputBox({
        prompt: 'PMS_RUNDIR (optional)',
        placeHolder: '/path/to/rundir'
    });
    
    const pmsHome = await vscode.window.showInputBox({
        prompt: 'PMS_HOME (optional)',
        placeHolder: '/path/to/home'
    });
    
    const pmsConfdir = await vscode.window.showInputBox({
        prompt: 'PMS_CONFDIR (optional)',
        placeHolder: '/path/to/confdir'
    });
    
    const pmsLang = await vscode.window.showInputBox({
        prompt: 'PMS_LANG (optional)',
        placeHolder: 'en'
    });
    
    const projectData: ProjectData = {};
    if (pmsRundir) projectData.PMS_RUNDIR = pmsRundir;
    if (pmsHome) projectData.PMS_HOME = pmsHome;
    if (pmsConfdir) projectData.PMS_CONFDIR = pmsConfdir;
    if (pmsLang) projectData.PMS_LANG = pmsLang;
    
    const isGlobal = await vscode.window.showQuickPick<vscode.QuickPickItem>(
        [
            { label: 'Global', description: 'Save to global storage (shared across workspaces)' },
            { label: 'Local', description: 'Save to workspace settings (per workspace)' }
        ],
        { placeHolder: 'Save as' }
    );
    
    if (!isGlobal) return;
    
    if (isGlobal.label === 'Global') {
        const globalProjects = getGlobalProjects();
        globalProjects[name] = projectData;
        setGlobalProjects(globalProjects);
    } else {
        const config = vscode.workspace.getConfiguration('cadmatic');
        const localProjects = config.get<ProjectProfiles>('projects', {});
        localProjects[name] = projectData;
        await config.update('projects', localProjects, true);
    }
    
    vscode.window.showInformationMessage(`Project "${name}" added (${isGlobal})`);
    startLSP();
}

async function deleteProject(): Promise<void> {
    const merged = getMergedProjects();
    
    if (merged.length === 0) {
        vscode.window.showInformationMessage('No projects to delete');
        return;
    }
    
    const items = merged.map(p => ({
        label: `${p.name} (${p.source === 'global' ? 'G' : 'L'})`,
        description: Object.keys(p.data).length > 0 ? Object.keys(p.data).join(', ') : 'No vars',
        projectName: p.name,
        source: p.source
    }));
    
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select project to delete'
    });
    
    if (!selected) return;
    
    const globalProjects = getGlobalProjects();
    const localProjects = getConfig().projects;
    const hasGlobal = !!globalProjects[selected.projectName];
    const hasLocal = !!localProjects[selected.projectName];
    
    if (hasGlobal && hasLocal) {
        const choice = await vscode.window.showQuickPick(['Global only', 'Local only', 'Both'], {
            placeHolder: 'Project exists in both. Delete from?'
        });
        
        if (choice === 'Global only' || choice === 'Both') {
            delete globalProjects[selected.projectName];
            setGlobalProjects(globalProjects);
        }
        if (choice === 'Local only' || choice === 'Both') {
            delete localProjects[selected.projectName];
            await vscode.workspace.getConfiguration('cadmatic').update('projects', localProjects, true);
        }
    } else if (hasGlobal) {
        delete globalProjects[selected.projectName];
        setGlobalProjects(globalProjects);
    } else {
        delete localProjects[selected.projectName];
        await vscode.workspace.getConfiguration('cadmatic').update('projects', localProjects, true);
    }
    
    const currentActive = getConfig().activeProject;
    if (currentActive === selected.projectName) {
        await vscode.workspace.getConfiguration('cadmatic').update('activeProject', '', true);
    }
    
    vscode.window.showInformationMessage(`Project "${selected.projectName}" deleted`);
    startLSP();
}

async function listProjects(): Promise<void> {
    const merged = getMergedProjects();
    
    if (merged.length === 0) {
        vscode.window.showInformationMessage('No projects configured');
        return;
    }
    
    let message = '## CADMATIC Projects\n\n';
    
    for (const p of merged) {
        message += `### ${p.name} (${p.source === 'global' ? 'Global' : 'Local'})\n`;
        for (const [key, value] of Object.entries(p.data)) {
            message += `- ${key}: ${value || '(empty)'}\n`;
        }
        message += '\n';
    }
    
    const doc = await vscode.workspace.openTextDocument({ content: message, language: 'markdown' });
    await vscode.window.showTextDocument(doc);
}

async function addEnvVar(): Promise<void> {
    const { name: projectName } = getActiveProjectEnv();
    
    if (!projectName || projectName === '(legacy)') {
        vscode.window.showWarningMessage('No active project selected');
        return;
    }
    
    const key = await vscode.window.showInputBox({
        prompt: 'Enter environment variable name',
        placeHolder: 'MY_VAR'
    });
    
    if (!key) return;
    
    const value = await vscode.window.showInputBox({
        prompt: `Enter value for ${key}`,
        placeHolder: 'value'
    });
    
    if (value === undefined) return;
    
    const merged = getMergedProjects();
    const activeProject = merged.find(p => p.name === projectName);
    
    if (!activeProject) {
        vscode.window.showWarningMessage('Project not found');
        return;
    }
    
    if (activeProject.source === 'global') {
        const globalProjects = getGlobalProjects();
        globalProjects[projectName][key] = value;
        setGlobalProjects(globalProjects);
    } else {
        const localProjects = getConfig().projects;
        if (!localProjects[projectName]) {
            localProjects[projectName] = {};
        }
        localProjects[projectName][key] = value;
        await vscode.workspace.getConfiguration('cadmatic').update('projects', localProjects, true);
    }
    
    vscode.window.showInformationMessage(`Added ${key}=${value} to "${projectName}"`);
    startLSP();
}

async function deleteEnvVar(): Promise<void> {
    const { name: projectName } = getActiveProjectEnv();
    
    if (!projectName || projectName === '(legacy)') {
        vscode.window.showWarningMessage('No active project selected');
        return;
    }
    
    const projectData = getProjectData(projectName);
    if (!projectData) {
        vscode.window.showWarningMessage('Project not found');
        return;
    }
    
    const keys = Object.keys(projectData);
    if (keys.length === 0) {
        vscode.window.showInformationMessage('No environment variables in this project');
        return;
    }
    
    const selected = await vscode.window.showQuickPick(keys, {
        placeHolder: 'Select variable to delete'
    });
    
    if (!selected) return;
    
    const merged = getMergedProjects();
    const activeProject = merged.find(p => p.name === projectName);
    
    if (activeProject?.source === 'global') {
        const globalProjects = getGlobalProjects();
        delete globalProjects[projectName][selected];
        setGlobalProjects(globalProjects);
    } else {
        const localProjects = getConfig().projects;
        if (localProjects[projectName]) {
            delete localProjects[projectName][selected];
            await vscode.workspace.getConfiguration('cadmatic').update('projects', localProjects, true);
        }
    }
    
    vscode.window.showInformationMessage(`Deleted ${selected} from "${projectName}"`);
    startLSP();
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
        description: Object.keys(p.data).length > 0 
            ? Object.entries(p.data).filter(([k]) => k.startsWith('PMS_')).map(([k, v]) => `${k}=${v}`).join(', ')
            : 'No PMS vars',
        picked: p.name === config.activeProject
    }));
    
    if (!config.activeProject) {
        items.unshift({ label: '(No active project)', description: 'Clear project selection' });
    }
    
    vscode.window.showQuickPick(items, {
        placeHolder: 'Select CADMATIC project',
        canPickMany: false
    }).then(selection => {
        if (!selection) return;
        
        if (selection.label === '(No active project)') {
            vscode.workspace.getConfiguration('cadmatic').update('activeProject', '', true);
        } else {
            const selectedName = selection.label.split(' (')[0];
            vscode.workspace.getConfiguration('cadmatic').update('activeProject', selectedName, true);
        }
        
        startLSP();
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
    
    context.subscriptions.push(
        vscode.commands.registerCommand('cadmatic.addProject', addProject)
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('cadmatic.deleteProject', deleteProject)
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('cadmatic.listProjects', listProjects)
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('cadmatic.addEnvVar', addEnvVar)
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('cadmatic.deleteEnvVar', deleteEnvVar)
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('cadmatic.switchProject', switchProject)
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('cadmatic.restartLsp', restartLsp)
    );
    
    migrateProjects();
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