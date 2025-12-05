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
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { append, $ } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { COMMAND_TEMPLATES } from '../claudeCommands.contribution.js';

export class ClaudeCommandsEditorView extends ViewPane {

	private container!: HTMLElement;
	private nameInput!: HTMLInputElement;
	private descriptionInput!: HTMLInputElement;
	private contentEditor!: HTMLTextAreaElement;
	private previewPanel!: HTMLElement;
	private currentFileUri: URI | null = null;

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
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-commands-editor-view');

		// Header
		const header = append(this.container, $('.claude-editor-header'));
		header.innerHTML = `
			<span class="codicon codicon-edit"></span>
			<span>${localize('commandEditor', 'Command Editor')}</span>
		`;

		// Form
		const form = append(this.container, $('.claude-editor-form'));

		// Name field
		const nameGroup = append(form, $('.claude-editor-field'));
		const nameLabel = append(nameGroup, $('label'));
		nameLabel.textContent = localize('name', 'Name');
		this.nameInput = append(nameGroup, $('input')) as HTMLInputElement;
		this.nameInput.placeholder = 'my-command';
		this.nameInput.oninput = () => this.updatePreview();

		// Description field
		const descGroup = append(form, $('.claude-editor-field'));
		const descLabel = append(descGroup, $('label'));
		descLabel.textContent = localize('description', 'Description');
		this.descriptionInput = append(descGroup, $('input')) as HTMLInputElement;
		this.descriptionInput.placeholder = localize('descPlaceholder', 'Brief description of what this command does');
		this.descriptionInput.oninput = () => this.updatePreview();

		// Template buttons
		const templateGroup = append(form, $('.claude-editor-templates'));
		const templateLabel = append(templateGroup, $('label'));
		templateLabel.textContent = localize('templates', 'Templates');

		const templateBtns = append(templateGroup, $('.claude-editor-template-btns'));
		const templates = [
			{ id: 'basic', label: 'Basic', icon: 'file' },
			{ id: 'review', label: 'Review', icon: 'eye' },
			{ id: 'generate', label: 'Generate', icon: 'wand' },
			{ id: 'analyze', label: 'Analyze', icon: 'graph' },
		];

		for (const tmpl of templates) {
			const btn = append(templateBtns, $('button.claude-template-btn'));
			btn.innerHTML = `<span class="codicon codicon-${tmpl.icon}"></span> ${tmpl.label}`;
			btn.onclick = () => this.applyTemplate(tmpl.id);
		}

		// Content editor
		const contentGroup = append(form, $('.claude-editor-field.full-height'));
		const contentLabel = append(contentGroup, $('label'));
		contentLabel.textContent = localize('content', 'Prompt Content');

		const contentWrapper = append(contentGroup, $('.claude-editor-content-wrapper'));

		// Toolbar
		const contentToolbar = append(contentWrapper, $('.claude-editor-content-toolbar'));

		const insertBtns = [
			{ label: '$ARGUMENTS', title: 'Insert arguments placeholder' },
			{ label: '$SELECTION', title: 'Insert selection placeholder' },
			{ label: '$FILE', title: 'Insert current file placeholder' },
		];

		for (const btn of insertBtns) {
			const insertBtn = append(contentToolbar, $('button.claude-insert-btn'));
			insertBtn.textContent = btn.label;
			insertBtn.title = btn.title;
			insertBtn.onclick = () => this.insertPlaceholder(btn.label);
		}

		this.contentEditor = append(contentWrapper, $('textarea.claude-editor-textarea')) as HTMLTextAreaElement;
		this.contentEditor.placeholder = localize('contentPlaceholder', 'Enter your prompt instructions here...\n\nUse $ARGUMENTS for command arguments\nUse $SELECTION for selected code');
		this.contentEditor.oninput = () => this.updatePreview();

		// Preview panel
		this.previewPanel = append(this.container, $('.claude-editor-preview'));
		const previewHeader = append(this.previewPanel, $('.claude-preview-header'));
		previewHeader.innerHTML = `<span class="codicon codicon-preview"></span> ${localize('preview', 'Preview')}`;

		const previewContent = append(this.previewPanel, $('pre.claude-preview-content'));
		previewContent.textContent = '';

		// Actions
		const actions = append(this.container, $('.claude-editor-actions'));

		const saveProjectBtn = append(actions, $('button.claude-editor-btn.primary'));
		saveProjectBtn.innerHTML = `<span class="codicon codicon-folder"></span> ${localize('saveProject', 'Save to Project')}`;
		saveProjectBtn.onclick = () => this.save('project');

		const saveUserBtn = append(actions, $('button.claude-editor-btn'));
		saveUserBtn.innerHTML = `<span class="codicon codicon-account"></span> ${localize('saveUser', 'Save to User')}`;
		saveUserBtn.onclick = () => this.save('user');

		const clearBtn = append(actions, $('button.claude-editor-btn'));
		clearBtn.innerHTML = `<span class="codicon codicon-clear-all"></span> ${localize('clear', 'Clear')}`;
		clearBtn.onclick = () => this.clear();

		// Initialize with basic template
		this.applyTemplate('basic');
	}

	private applyTemplate(templateId: string): void {
		const template = COMMAND_TEMPLATES[templateId as keyof typeof COMMAND_TEMPLATES];
		if (!template) return;

		// Parse template
		const match = template.match(/^---\ndescription:\s*(.+)\n---\n\n([\s\S]*)$/);
		if (match) {
			this.descriptionInput.value = match[1];
			this.contentEditor.value = match[2].trim();
		} else {
			this.contentEditor.value = template;
		}

		this.updatePreview();
	}

	private insertPlaceholder(placeholder: string): void {
		const start = this.contentEditor.selectionStart;
		const end = this.contentEditor.selectionEnd;
		const text = this.contentEditor.value;

		this.contentEditor.value = text.substring(0, start) + placeholder + text.substring(end);
		this.contentEditor.selectionStart = this.contentEditor.selectionEnd = start + placeholder.length;
		this.contentEditor.focus();

		this.updatePreview();
	}

	private updatePreview(): void {
		const previewContent = this.previewPanel.querySelector('.claude-preview-content');
		if (!previewContent) return;

		const fullContent = this.buildFileContent();
		previewContent.textContent = fullContent;
	}

	private buildFileContent(): string {
		const description = this.descriptionInput.value.trim();
		const content = this.contentEditor.value.trim();

		if (description) {
			return `---
description: ${description}
---

${content}`;
		}

		return content;
	}

	private async save(scope: 'project' | 'user'): Promise<void> {
		const name = this.nameInput.value.trim();

		if (!name) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('nameRequired', 'Command name is required')
			});
			return;
		}

		if (!/^[a-z0-9-]+$/.test(name)) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('invalidName', 'Use lowercase letters, numbers, and hyphens only')
			});
			return;
		}

		let baseUri: URI;
		if (scope === 'project') {
			// Get workspace folder
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			// In production, this would use workspaceContextService
			baseUri = URI.file(`${homeDir}/.claude/commands`);
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			baseUri = URI.file(`${homeDir}/.claude/commands`);
		}

		try {
			// Create directory if needed
			try {
				await this.fileService.createFolder(baseUri);
			} catch { }

			// Write file
			const fileUri = URI.joinPath(baseUri, `${name}.md`);
			const content = this.buildFileContent();

			await this.fileService.writeFile(fileUri, new TextEncoder().encode(content));

			this.currentFileUri = fileUri;

			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('saved', 'Saved /{0}:{1}', scope, name)
			});
		} catch (error) {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('saveFailed', 'Failed to save command')
			});
		}
	}

	private clear(): void {
		this.nameInput.value = '';
		this.descriptionInput.value = '';
		this.contentEditor.value = '';
		this.currentFileUri = null;
		this.updatePreview();
	}

	public loadCommand(name: string, description: string, content: string, fileUri?: URI): void {
		this.nameInput.value = name;
		this.descriptionInput.value = description;
		this.contentEditor.value = content;
		this.currentFileUri = fileUri || null;
		this.updatePreview();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
