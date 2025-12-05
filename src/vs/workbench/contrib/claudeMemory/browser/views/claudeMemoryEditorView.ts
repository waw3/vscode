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
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { append, $ } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';

export class ClaudeMemoryEditorView extends ViewPane {

	private container!: HTMLElement;
	private editor!: HTMLTextAreaElement;
	private fileSelector!: HTMLSelectElement;
	private statusBar!: HTMLElement;
	private currentFileUri: URI | null = null;
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
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-memory-editor-view');

		// Toolbar
		const toolbar = append(this.container, $('.claude-memory-editor-toolbar'));

		// File selector
		this.fileSelector = append(toolbar, $('select.claude-memory-file-select')) as HTMLSelectElement;
		this.fileSelector.onchange = () => this.loadSelectedFile();
		this.populateFileSelector();

		// Toolbar buttons
		const btnGroup = append(toolbar, $('.claude-memory-btn-group'));

		const saveBtn = append(btnGroup, $('button.claude-memory-btn.primary'));
		saveBtn.innerHTML = '<span class="codicon codicon-save"></span>';
		saveBtn.title = localize('save', 'Save (Ctrl+S)');
		saveBtn.onclick = () => this.save();

		const revertBtn = append(btnGroup, $('button.claude-memory-btn'));
		revertBtn.innerHTML = '<span class="codicon codicon-discard"></span>';
		revertBtn.title = localize('revert', 'Revert Changes');
		revertBtn.onclick = () => this.revert();

		const openFullBtn = append(btnGroup, $('button.claude-memory-btn'));
		openFullBtn.innerHTML = '<span class="codicon codicon-go-to-file"></span>';
		openFullBtn.title = localize('openInEditor', 'Open in Editor');
		openFullBtn.onclick = () => this.openInEditor();

		// Editor area
		const editorWrapper = append(this.container, $('.claude-memory-editor-wrapper'));

		this.editor = append(editorWrapper, $('textarea.claude-memory-textarea')) as HTMLTextAreaElement;
		this.editor.placeholder = localize('editorPlaceholder', 'Select a file to edit or create a new CLAUDE.md...');
		this.editor.spellcheck = false;

		// Track changes
		this.editor.oninput = () => {
			this.isDirty = true;
			this.updateStatusBar();
		};

		// Keyboard shortcuts
		this.editor.onkeydown = (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 's') {
				e.preventDefault();
				this.save();
			}
		};

		// Status bar
		this.statusBar = append(this.container, $('.claude-memory-status-bar'));
		this.updateStatusBar();

		// Load initial file
		this.loadSelectedFile();
	}

	private async populateFileSelector(): Promise<void> {
		this.fileSelector.innerHTML = '';

		const folders = this.workspaceContextService.getWorkspace().folders;
		const homeDir = process.env.HOME || process.env.USERPROFILE || '';

		const files: { label: string; value: string; uri: URI }[] = [];

		// Project files
		if (folders.length > 0) {
			const rootUri = folders[0].uri;

			const projectFiles = [
				{ label: 'Project: CLAUDE.md', path: 'CLAUDE.md' },
				{ label: 'Local: CLAUDE.local.md', path: 'CLAUDE.local.md' },
				{ label: 'Folder: .claude/CLAUDE.md', path: '.claude/CLAUDE.md' },
			];

			for (const pf of projectFiles) {
				const uri = URI.joinPath(rootUri, pf.path);
				const exists = await this.fileService.exists(uri);
				files.push({
					label: `${pf.label}${exists ? '' : ' (create)'}`,
					value: uri.toString(),
					uri
				});
			}
		}

		// User file
		const userUri = URI.file(`${homeDir}/.claude/CLAUDE.md`);
		const userExists = await this.fileService.exists(userUri);
		files.push({
			label: `User: ~/.claude/CLAUDE.md${userExists ? '' : ' (create)'}`,
			value: userUri.toString(),
			uri: userUri
		});

		// Populate selector
		for (const file of files) {
			const option = document.createElement('option');
			option.value = file.value;
			option.textContent = file.label;
			this.fileSelector.appendChild(option);
		}
	}

	private async loadSelectedFile(): Promise<void> {
		if (this.isDirty) {
			// Prompt to save
			const shouldSave = confirm(localize('unsavedChanges', 'You have unsaved changes. Save before switching?'));
			if (shouldSave) {
				await this.save();
			}
		}

		const selectedValue = this.fileSelector.value;
		if (!selectedValue) {
			return;
		}

		const uri = URI.parse(selectedValue);
		this.currentFileUri = uri;

		try {
			const exists = await this.fileService.exists(uri);

			if (exists) {
				const content = await this.fileService.readFile(uri);
				this.editor.value = new TextDecoder().decode(content.value);
			} else {
				// New file - start with template
				this.editor.value = '# Project\n\n## Overview\n\n## Tech Stack\n\n## Getting Started\n\n';
			}

			this.isDirty = false;
			this.updateStatusBar();
		} catch (error) {
			this.editor.value = '';
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('loadError', 'Failed to load file')
			});
		}
	}

	private async save(): Promise<void> {
		if (!this.currentFileUri) {
			return;
		}

		try {
			// Ensure parent directory exists
			const parentUri = URI.joinPath(this.currentFileUri, '..');
			try {
				await this.fileService.createFolder(parentUri);
			} catch { }

			// Write file
			await this.fileService.writeFile(
				this.currentFileUri,
				new TextEncoder().encode(this.editor.value)
			);

			this.isDirty = false;
			this.updateStatusBar();

			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('saved', 'Saved successfully')
			});

			// Refresh file selector labels
			this.populateFileSelector();
		} catch (error) {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('saveError', 'Failed to save file')
			});
		}
	}

	private async revert(): Promise<void> {
		if (!this.currentFileUri) {
			return;
		}

		if (this.isDirty) {
			const shouldRevert = confirm(localize('confirmRevert', 'Discard all changes?'));
			if (!shouldRevert) {
				return;
			}
		}

		await this.loadSelectedFile();
	}

	private openInEditor(): void {
		if (this.currentFileUri) {
			this.commandService.executeCommand('vscode.open', this.currentFileUri);
		}
	}

	private updateStatusBar(): void {
		const content = this.editor.value;
		const lines = content.split('\n').length;
		const chars = content.length;
		const tokens = Math.round(chars / 4);

		const dirtyIndicator = this.isDirty ? ' (modified)' : '';
		const fileName = this.currentFileUri?.path.split('/').pop() || 'No file';

		this.statusBar.innerHTML = `
			<span class="file-name">${fileName}${dirtyIndicator}</span>
			<span class="stats">
				<span class="codicon codicon-list-flat"></span> ${lines} lines
				<span class="codicon codicon-symbol-key"></span> ~${tokens.toLocaleString()} tokens
			</span>
		`;

		if (this.isDirty) {
			this.statusBar.classList.add('dirty');
		} else {
			this.statusBar.classList.remove('dirty');
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
