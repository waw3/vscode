/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { append, $ } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';

export class ClaudeMcpConfigView extends ViewPane {

	private container!: HTMLElement;
	private configEditor!: HTMLTextAreaElement;
	private scopeSelect!: HTMLSelectElement;
	private currentConfig: string = '';
	private isDirty: boolean = false;

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-mcp-config-view');

		// Header
		const header = append(this.container, $('.claude-mcp-config-header'));
		header.innerHTML = `
			<span class="codicon codicon-settings-gear"></span>
			<span>${localize('configuration', 'Configuration')}</span>
		`;

		// Toolbar
		const toolbar = append(this.container, $('.claude-mcp-config-toolbar'));

		// Scope selector
		const scopeWrapper = append(toolbar, $('.claude-mcp-scope-wrapper'));
		const scopeLabel = append(scopeWrapper, $('label'));
		scopeLabel.textContent = localize('scope', 'Scope:');

		this.scopeSelect = append(scopeWrapper, $('select.claude-mcp-scope-select')) as HTMLSelectElement;

		const projectOption = append(this.scopeSelect, $('option')) as HTMLOptionElement;
		projectOption.value = 'project';
		projectOption.textContent = localize('project', 'Project');

		const userOption = append(this.scopeSelect, $('option')) as HTMLOptionElement;
		userOption.value = 'user';
		userOption.textContent = localize('user', 'User');

		this.scopeSelect.onchange = () => this.loadConfig();

		// Buttons
		const btnGroup = append(toolbar, $('.claude-mcp-btn-group'));

		const saveBtn = append(btnGroup, $('button.claude-mcp-btn.primary'));
		saveBtn.innerHTML = '<span class="codicon codicon-save"></span> ' + localize('save', 'Save');
		saveBtn.onclick = () => this.saveConfig();

		const revertBtn = append(btnGroup, $('button.claude-mcp-btn'));
		revertBtn.innerHTML = '<span class="codicon codicon-discard"></span> ' + localize('revert', 'Revert');
		revertBtn.onclick = () => this.loadConfig();

		const openBtn = append(btnGroup, $('button.claude-mcp-btn'));
		openBtn.innerHTML = '<span class="codicon codicon-go-to-file"></span>';
		openBtn.title = localize('openInEditor', 'Open in Editor');
		openBtn.onclick = () => this.openInEditor();

		// Editor wrapper
		const editorWrapper = append(this.container, $('.claude-mcp-config-editor-wrapper'));

		// Line numbers gutter
		const gutter = append(editorWrapper, $('.claude-mcp-gutter'));

		// Config editor
		this.configEditor = append(editorWrapper, $('textarea.claude-mcp-config-textarea')) as HTMLTextAreaElement;
		this.configEditor.placeholder = localize('configPlaceholder', 'Loading configuration...');
		this.configEditor.spellcheck = false;

		this.configEditor.oninput = () => {
			this.isDirty = this.configEditor.value !== this.currentConfig;
			this.updateLineNumbers(gutter);
		};

		this.configEditor.onscroll = () => {
			gutter.scrollTop = this.configEditor.scrollTop;
		};

		// Status bar
		const statusBar = append(this.container, $('.claude-mcp-config-status'));
		statusBar.innerHTML = `
			<span class="file-path"></span>
			<span class="status"></span>
		`;

		// Help section
		const help = append(this.container, $('.claude-mcp-config-help'));
		help.innerHTML = `
			<div class="help-header">
				<span class="codicon codicon-info"></span>
				<span>${localize('configFormat', 'Configuration Format')}</span>
			</div>
			<pre class="help-example">{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-name"],
      "env": {
        "API_KEY": "\${API_KEY}"
      }
    }
  }
}</pre>
		`;

		// Load initial config
		this.loadConfig();
	}

	private updateLineNumbers(gutter: HTMLElement): void {
		const lines = this.configEditor.value.split('\n').length;
		const numbers = [];
		for (let i = 1; i <= lines; i++) {
			numbers.push(`<div class="line-number">${i}</div>`);
		}
		gutter.innerHTML = numbers.join('');
	}

	private async loadConfig(): Promise<void> {
		const scope = this.scopeSelect.value;
		let configUri: URI;

		if (scope === 'project') {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) {
				this.configEditor.value = '{\n  "mcpServers": {}\n}';
				this.currentConfig = this.configEditor.value;
				return;
			}
			configUri = URI.joinPath(folders[0].uri, '.claude.json');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			configUri = URI.file(`${homeDir}/.claude.json`);
		}

		try {
			const exists = await this.fileService.exists(configUri);
			if (exists) {
				const content = await this.fileService.readFile(configUri);
				const text = new TextDecoder().decode(content.value);

				// Pretty print JSON
				try {
					const parsed = JSON.parse(text);
					this.configEditor.value = JSON.stringify(parsed, null, 2);
				} catch {
					this.configEditor.value = text;
				}
			} else {
				this.configEditor.value = '{\n  "mcpServers": {}\n}';
			}
		} catch {
			this.configEditor.value = '{\n  "mcpServers": {}\n}';
		}

		this.currentConfig = this.configEditor.value;
		this.isDirty = false;

		// Update line numbers
		const gutter = this.container.querySelector('.claude-mcp-gutter') as HTMLElement;
		if (gutter) {
			this.updateLineNumbers(gutter);
		}

		// Update status
		this.updateStatus(configUri.fsPath);
	}

	private async saveConfig(): Promise<void> {
		const scope = this.scopeSelect.value;
		let configUri: URI;

		if (scope === 'project') {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: localize('noWorkspace', 'No workspace folder open')
				});
				return;
			}
			configUri = URI.joinPath(folders[0].uri, '.claude.json');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			configUri = URI.file(`${homeDir}/.claude.json`);
		}

		// Validate JSON
		try {
			JSON.parse(this.configEditor.value);
		} catch (e) {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('invalidJson', 'Invalid JSON: {0}', (e as Error).message)
			});
			return;
		}

		try {
			await this.fileService.writeFile(configUri, new TextEncoder().encode(this.configEditor.value));

			this.currentConfig = this.configEditor.value;
			this.isDirty = false;

			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('configSaved', 'Configuration saved')
			});

			this.updateStatus(configUri.fsPath);
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('saveFailed', 'Failed to save configuration')
			});
		}
	}

	private async openInEditor(): Promise<void> {
		const scope = this.scopeSelect.value;
		let configUri: URI;

		if (scope === 'project') {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) return;
			configUri = URI.joinPath(folders[0].uri, '.claude.json');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			configUri = URI.file(`${homeDir}/.claude.json`);
		}

		// Ensure file exists
		const exists = await this.fileService.exists(configUri);
		if (!exists) {
			await this.fileService.writeFile(configUri, new TextEncoder().encode('{\n  "mcpServers": {}\n}'));
		}

		await this.editorService.openEditor({ resource: configUri });
	}

	private updateStatus(filePath: string): void {
		const statusBar = this.container.querySelector('.claude-mcp-config-status');
		if (statusBar) {
			const filePathEl = statusBar.querySelector('.file-path');
			const statusEl = statusBar.querySelector('.status');

			if (filePathEl) {
				filePathEl.textContent = filePath;
			}
			if (statusEl) {
				statusEl.textContent = this.isDirty ? localize('modified', 'Modified') : localize('saved', 'Saved');
				statusBar.classList.toggle('dirty', this.isDirty);
			}
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
