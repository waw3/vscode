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
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { AVAILABLE_TOOLS, IToolDefinition } from '../claudeAgents.contribution.js';

export class ClaudeAgentsEditorView extends ViewPane {

	private container!: HTMLElement;
	private nameInput!: HTMLInputElement;
	private descriptionInput!: HTMLTextAreaElement;
	private toolsContainer!: HTMLElement;
	private contentEditor!: HTMLTextAreaElement;
	private previewPanel!: HTMLElement;
	private selectedTools: Set<string> = new Set();
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
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-agents-editor-view');

		// Header
		const header = append(this.container, $('.claude-agents-editor-header'));
		header.innerHTML = `
			<span class="codicon codicon-edit"></span>
			<span>${localize('agentEditor', 'Agent Editor')}</span>
		`;

		// Form
		const form = append(this.container, $('.claude-agents-editor-form'));

		// Name field
		const nameGroup = append(form, $('.claude-agents-field'));
		const nameLabel = append(nameGroup, $('label'));
		nameLabel.textContent = localize('agentName', 'Agent Name');
		this.nameInput = append(nameGroup, $('input')) as HTMLInputElement;
		this.nameInput.placeholder = 'my-agent';
		this.nameInput.oninput = () => this.updatePreview();

		// Description field
		const descGroup = append(form, $('.claude-agents-field'));
		const descLabel = append(descGroup, $('label'));
		descLabel.textContent = localize('description', 'Description');
		this.descriptionInput = append(descGroup, $('textarea.description-input')) as HTMLTextAreaElement;
		this.descriptionInput.placeholder = localize('descPlaceholder', 'Brief description of what this agent does');
		this.descriptionInput.rows = 2;
		this.descriptionInput.oninput = () => this.updatePreview();

		// Tools selection
		const toolsGroup = append(form, $('.claude-agents-field.tools-field'));
		const toolsLabel = append(toolsGroup, $('label'));
		toolsLabel.textContent = localize('allowedTools', 'Allowed Tools');

		this.toolsContainer = append(toolsGroup, $('.claude-agents-tools-grid'));
		this.renderToolsSelection();

		// Quick presets
		const presetsRow = append(toolsGroup, $('.claude-agents-presets'));
		const presets = [
			{ label: 'Read Only', tools: ['Read', 'Glob', 'Grep'] },
			{ label: 'File Ops', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'] },
			{ label: 'Full Access', tools: AVAILABLE_TOOLS.map(t => t.name) },
		];

		for (const preset of presets) {
			const btn = append(presetsRow, $('button.claude-agents-preset-btn'));
			btn.textContent = preset.label;
			btn.onclick = () => {
				this.selectedTools.clear();
				preset.tools.forEach(t => this.selectedTools.add(t));
				this.renderToolsSelection();
				this.updatePreview();
			};
		}

		// Content editor
		const contentGroup = append(form, $('.claude-agents-field.full-height'));
		const contentLabel = append(contentGroup, $('label'));
		contentLabel.textContent = localize('systemPrompt', 'System Prompt');

		const contentWrapper = append(contentGroup, $('.claude-agents-content-wrapper'));

		// Toolbar
		const contentToolbar = append(contentWrapper, $('.claude-agents-content-toolbar'));
		const insertBtns = [
			{ label: '$ARGUMENTS', title: 'Insert arguments placeholder' },
			{ label: '$SELECTION', title: 'Insert selection placeholder' },
			{ label: '$FILE', title: 'Insert current file placeholder' },
			{ label: '$PROJECT', title: 'Insert project context' },
		];

		for (const btn of insertBtns) {
			const insertBtn = append(contentToolbar, $('button.claude-agents-insert-btn'));
			insertBtn.textContent = btn.label;
			insertBtn.title = btn.title;
			insertBtn.onclick = () => this.insertPlaceholder(btn.label);
		}

		this.contentEditor = append(contentWrapper, $('textarea.claude-agents-textarea')) as HTMLTextAreaElement;
		this.contentEditor.placeholder = localize('contentPlaceholder', 'Enter the agent system prompt...\\n\\nDescribe the agent\\'s role, capabilities, and how it should behave.');
		this.contentEditor.oninput = () => this.updatePreview();

		// Preview panel
		this.previewPanel = append(this.container, $('.claude-agents-preview'));
		const previewHeader = append(this.previewPanel, $('.claude-agents-preview-header'));
		previewHeader.innerHTML = `<span class="codicon codicon-preview"></span> ${localize('preview', 'Agent File Preview')}`;

		const previewContent = append(this.previewPanel, $('pre.claude-agents-preview-content'));
		previewContent.textContent = '';

		// Actions
		const actions = append(this.container, $('.claude-agents-editor-actions'));

		const saveProjectBtn = append(actions, $('button.claude-agents-btn.primary'));
		saveProjectBtn.innerHTML = `<span class="codicon codicon-folder"></span> ${localize('saveProject', 'Save to Project')}`;
		saveProjectBtn.onclick = () => this.save('project');

		const saveUserBtn = append(actions, $('button.claude-agents-btn'));
		saveUserBtn.innerHTML = `<span class="codicon codicon-account"></span> ${localize('saveUser', 'Save to User')}`;
		saveUserBtn.onclick = () => this.save('user');

		const clearBtn = append(actions, $('button.claude-agents-btn'));
		clearBtn.innerHTML = `<span class="codicon codicon-clear-all"></span> ${localize('clear', 'Clear')}`;
		clearBtn.onclick = () => this.clear();

		// Initialize
		this.updatePreview();
	}

	private renderToolsSelection(): void {
		clearNode(this.toolsContainer);

		// Group tools by category
		const categories = new Map<string, IToolDefinition[]>();
		for (const tool of AVAILABLE_TOOLS) {
			const cat = tool.category;
			if (!categories.has(cat)) {
				categories.set(cat, []);
			}
			categories.get(cat)!.push(tool);
		}

		for (const [category, tools] of categories) {
			const categoryGroup = append(this.toolsContainer, $('.claude-agents-tool-category'));

			const categoryHeader = append(categoryGroup, $('.category-header'));
			categoryHeader.textContent = category.charAt(0).toUpperCase() + category.slice(1);

			const toolsRow = append(categoryGroup, $('.category-tools'));

			for (const tool of tools) {
				const toolItem = append(toolsRow, $('.claude-agents-tool-item'));

				const checkbox = append(toolItem, $('input')) as HTMLInputElement;
				checkbox.type = 'checkbox';
				checkbox.id = `tool-${tool.name}`;
				checkbox.checked = this.selectedTools.has(tool.name);
				checkbox.onchange = () => {
					if (checkbox.checked) {
						this.selectedTools.add(tool.name);
					} else {
						this.selectedTools.delete(tool.name);
					}
					this.updatePreview();
				};

				const label = append(toolItem, $('label')) as HTMLLabelElement;
				label.htmlFor = checkbox.id;
				label.innerHTML = `
					<span class="tool-name">${tool.name}</span>
					<span class="tool-desc">${tool.description}</span>
				`;
			}
		}
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
		const previewContent = this.previewPanel.querySelector('.claude-agents-preview-content');
		if (!previewContent) return;

		const fullContent = this.buildFileContent();
		previewContent.textContent = fullContent;
	}

	private buildFileContent(): string {
		const name = this.nameInput.value.trim() || 'my-agent';
		const description = this.descriptionInput.value.trim();
		const tools = Array.from(this.selectedTools);
		const content = this.contentEditor.value.trim();

		let fileContent = '---\n';
		fileContent += `name: ${name}\n`;
		if (description) {
			fileContent += `description: ${description}\n`;
		}
		if (tools.length > 0) {
			fileContent += `tools:\n`;
			for (const tool of tools) {
				fileContent += `  - ${tool}\n`;
			}
		}
		fileContent += '---\n\n';
		fileContent += content || '# Agent Instructions\n\nDescribe what this agent should do...';

		return fileContent;
	}

	private async save(scope: 'project' | 'user'): Promise<void> {
		const name = this.nameInput.value.trim();

		if (!name) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('nameRequired', 'Agent name is required')
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
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: localize('noWorkspace', 'No workspace folder open')
				});
				return;
			}
			baseUri = URI.joinPath(folders[0].uri, '.claude/agents');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			baseUri = URI.file(`${homeDir}/.claude/agents`);
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
				message: localize('saved', 'Saved agent: {0}', name)
			});
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('saveFailed', 'Failed to save agent')
			});
		}
	}

	private clear(): void {
		this.nameInput.value = '';
		this.descriptionInput.value = '';
		this.contentEditor.value = '';
		this.selectedTools.clear();
		this.currentFileUri = null;
		this.renderToolsSelection();
		this.updatePreview();
	}

	public loadAgent(name: string, description: string, tools: string[], content: string, fileUri?: URI): void {
		this.nameInput.value = name;
		this.descriptionInput.value = description;
		this.contentEditor.value = content;
		this.selectedTools = new Set(tools);
		this.currentFileUri = fileUri || null;
		this.renderToolsSelection();
		this.updatePreview();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
