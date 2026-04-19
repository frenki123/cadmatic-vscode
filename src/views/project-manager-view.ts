import * as vscode from 'vscode';

export type ProjectScope = 'global' | 'local';

export interface ProjectViewModel {
    name: string;
    installDir: string;
    lang?: string;
    projectDir?: string;
    extraEnv?: Record<string, string>;
    source: ProjectScope;
    active: boolean;
}

interface SaveProjectMessage {
    type: 'saveProject';
    name: string;
    installDir: string;
    lang?: string;
    projectDir?: string;
    extraEnv?: Record<string, string>;
    scope: ProjectScope;
}

interface ActivateProjectMessage {
    type: 'activateProject';
    name: string;
}

interface DeleteProjectMessage {
    type: 'deleteProject';
    name: string;
}

interface BrowseInstallDirMessage {
    type: 'browseInstallDir';
}

interface BrowseProjectDirMessage {
    type: 'browseProjectDir';
}

interface ReadyMessage {
    type: 'ready';
}

type IncomingMessage =
    | SaveProjectMessage
    | ActivateProjectMessage
    | DeleteProjectMessage
    | BrowseInstallDirMessage
    | BrowseProjectDirMessage
    | ReadyMessage;

interface ProjectManagerHandlers {
    listProjects: () => ProjectViewModel[];
    saveProject: (input: {
        name: string;
        installDir: string;
        lang?: string;
        projectDir?: string;
        extraEnv?: Record<string, string>;
        scope: ProjectScope;
    }) => Promise<{ ok: boolean; message: string }>;
    activateProject: (name: string) => Promise<{ ok: boolean; message: string }>;
    deleteProject: (name: string) => Promise<{ ok: boolean; message: string }>;
    pickInstallDir: () => Promise<string | undefined>;
    pickProjectDir: () => Promise<string | undefined>;
}

export class ProjectManagerView implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly handlers: ProjectManagerHandlers
    ) {}

    refresh(): void {
        if (!this.view) {
            return;
        }
        this.postState();
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message: IncomingMessage) => {
            switch (message.type) {
                case 'ready':
                    this.postState();
                    break;
                case 'browseInstallDir': {
                    const picked = await this.handlers.pickInstallDir();
                    await webviewView.webview.postMessage({
                        type: 'browseResult',
                        installDir: picked || ''
                    });
                    break;
                }
                case 'browseProjectDir': {
                    const picked = await this.handlers.pickProjectDir();
                    await webviewView.webview.postMessage({
                        type: 'browseResult',
                        projectDir: picked || ''
                    });
                    break;
                }
                case 'saveProject': {
                    const result = await this.handlers.saveProject({
                        name: message.name,
                        installDir: message.installDir,
                        lang: message.lang,
                        projectDir: message.projectDir,
                        extraEnv: message.extraEnv,
                        scope: message.scope
                    });
                    await webviewView.webview.postMessage({
                        type: result.ok ? 'success' : 'error',
                        message: result.message
                    });
                    this.postState();
                    break;
                }
                case 'activateProject': {
                    const result = await this.handlers.activateProject(message.name);
                    await webviewView.webview.postMessage({
                        type: result.ok ? 'success' : 'error',
                        message: result.message
                    });
                    this.postState();
                    break;
                }
                case 'deleteProject': {
                    const result = await this.handlers.deleteProject(message.name);
                    await webviewView.webview.postMessage({
                        type: result.ok ? 'success' : 'error',
                        message: result.message
                    });
                    this.postState();
                    break;
                }
                default:
                    break;
            }
        });
    }

    private postState(): void {
        if (!this.view) {
            return;
        }
        void this.view.webview.postMessage({
            type: 'state',
            projects: this.handlers.listProjects()
        });
    }

    private getHtml(webview: vscode.Webview): string {
        const cspSource = webview.cspSource;
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CADMATIC Project Manager</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 10px;
      margin: 0;
    }
    h3 {
      margin: 8px 0;
      font-size: 13px;
    }
    form {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 12px;
      display: grid;
      gap: 8px;
    }
    label {
      font-size: 12px;
      display: grid;
      gap: 4px;
    }
    input, select, button {
      font: inherit;
    }
    input, select {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 5px 6px;
      border-radius: 4px;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px;
      align-items: end;
    }
    .actions {
      display: flex;
      gap: 6px;
    }
    button {
      border: 1px solid var(--vscode-button-border);
      border-radius: 4px;
      padding: 4px 8px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 6px;
    }
    li {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 8px;
    }
    .name {
      font-weight: 600;
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .meta {
      font-size: 12px;
      opacity: 0.9;
      margin-top: 2px;
      overflow-wrap: anywhere;
    }
    .pill {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .status {
      min-height: 18px;
      font-size: 12px;
    }
    .status.error {
      color: var(--vscode-errorForeground);
    }
    .status.success {
      color: var(--vscode-testing-iconPassed);
    }
    .empty {
      border: 1px dashed var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px;
      font-size: 12px;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <h3>Add Project</h3>
  <form id="projectForm">
    <label>
      Project name
      <input id="name" type="text" required />
    </label>
    <label>
      Install directory
      <div class="row">
        <input id="installDir" type="text" required />
        <button id="browse" class="secondary" type="button">Browse...</button>
      </div>
    </label>
    <label>
      Language (optional)
      <input id="lang" type="text" placeholder="english" />
    </label>
    <label>
      Project directory (optional)
      <div class="row">
        <input id="projectDir" type="text" placeholder="C:/ExampleProject_2025H2/ExampleProject.pms" />
        <button id="browseProjectDir" class="secondary" type="button">Browse...</button>
      </div>
    </label>
    <label>
      Extra environment variables (optional)
      <input id="extraEnv" type="text" placeholder='{"KEY": "value"}' />
    </label>
    <label>
      Save scope
      <select id="scope">
        <option value="global" selected>Global</option>
        <option value="local">Local</option>
      </select>
    </label>
    <div class="actions">
      <button type="submit">Save Project</button>
    </div>
    <div id="status" class="status"></div>
  </form>

  <h3>Projects</h3>
  <div id="empty" class="empty" hidden>No projects yet. Add your first project above.</div>
  <ul id="projects"></ul>

  <script>
    const vscode = acquireVsCodeApi();

    const form = document.getElementById('projectForm');
    const nameInput = document.getElementById('name');
    const installDirInput = document.getElementById('installDir');
    const langInput = document.getElementById('lang');
    const projectDirInput = document.getElementById('projectDir');
    const extraEnvInput = document.getElementById('extraEnv');
    const scopeSelect = document.getElementById('scope');
    const browseButton = document.getElementById('browse');
    const browseProjectDirButton = document.getElementById('browseProjectDir');
    const statusEl = document.getElementById('status');
    const projectsEl = document.getElementById('projects');
    const emptyEl = document.getElementById('empty');

    function setStatus(message, tone) {
      statusEl.textContent = message || '';
      statusEl.className = 'status';
      if (tone) {
        statusEl.classList.add(tone);
      }
    }

    function createProjectNode(project) {
      const li = document.createElement('li');

      const nameRow = document.createElement('div');
      nameRow.className = 'name';

      const title = document.createElement('span');
      title.textContent = project.name;
      nameRow.appendChild(title);

      if (project.active) {
        const activePill = document.createElement('span');
        activePill.className = 'pill';
        activePill.textContent = 'ACTIVE';
        nameRow.appendChild(activePill);
      }

      const sourcePill = document.createElement('span');
      sourcePill.className = 'pill';
      sourcePill.textContent = project.source.toUpperCase();
      nameRow.appendChild(sourcePill);

      const install = document.createElement('div');
      install.className = 'meta';
      install.textContent = 'installDir: ' + project.installDir;

      const lang = document.createElement('div');
      lang.className = 'meta';
      lang.textContent = 'lang: ' + (project.lang || 'english');

      const projectDir = document.createElement('div');
      projectDir.className = 'meta';
      projectDir.textContent = 'projectDir: ' + (project.projectDir || '(none)');

      const extraEnv = document.createElement('div');
      extraEnv.className = 'meta';
      extraEnv.textContent = 'extraEnv: ' + (project.extraEnv ? JSON.stringify(project.extraEnv) : '(none)');

      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.style.marginTop = '8px';

      if (!project.active) {
        const activate = document.createElement('button');
        activate.type = 'button';
        activate.textContent = 'Activate';
        activate.addEventListener('click', () => {
          vscode.postMessage({ type: 'activateProject', name: project.name });
        });
        actions.appendChild(activate);
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => {
        vscode.postMessage({ type: 'deleteProject', name: project.name });
      });
      actions.appendChild(remove);

      li.appendChild(nameRow);
      li.appendChild(install);
      li.appendChild(lang);
      li.appendChild(projectDir);
      li.appendChild(extraEnv);
      li.appendChild(actions);
      return li;
    }

    function renderProjects(projects) {
      projectsEl.innerHTML = '';
      emptyEl.hidden = projects.length > 0;
      for (const project of projects) {
        projectsEl.appendChild(createProjectNode(project));
      }
    }

    browseButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'browseInstallDir' });
    });

    browseProjectDirButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'browseProjectDir' });
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const installDir = installDirInput.value.trim();
      const lang = langInput.value.trim();
      const projectDir = projectDirInput.value.trim();
      const extraEnvStr = extraEnvInput.value.trim();
      const scope = scopeSelect.value;

      let extraEnv;
      if (extraEnvStr) {
        try {
          extraEnv = JSON.parse(extraEnvStr);
          const isObject = extraEnv && typeof extraEnv === 'object' && !Array.isArray(extraEnv);
          if (!isObject) {
            setStatus('extraEnv must be a JSON object.', 'error');
            return;
          }
        } catch {
          setStatus('extraEnv must be valid JSON object.', 'error');
          return;
        }
      }

      if (!name) {
        setStatus('Project name is required.', 'error');
        return;
      }
      if (!installDir) {
        setStatus('Install directory is required.', 'error');
        return;
      }

      vscode.postMessage({
        type: 'saveProject',
        name,
        installDir,
        lang,
        projectDir,
        extraEnv,
        scope
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        renderProjects(message.projects || []);
      }
      if (message.type === 'error') {
        setStatus(message.message || 'Operation failed.', 'error');
      }
      if (message.type === 'success') {
        setStatus(message.message || 'Done.', 'success');
      }
      if (message.type === 'browseResult') {
        if (message.installDir) {
          installDirInput.value = message.installDir;
        }
        if (message.projectDir) {
          projectDirInput.value = message.projectDir;
        }
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
    }
}
