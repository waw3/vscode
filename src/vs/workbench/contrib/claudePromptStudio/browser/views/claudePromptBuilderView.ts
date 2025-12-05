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
import { append, $ } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import {
	BUILTIN_VARIABLES,
	PROMPT_CATEGORIES,
	PromptCategory,
	expandVariables,
	estimateTokens
} from '../claudePromptStudio.contribution.js';

export class ClaudePromptBuilderView extends ViewPane {

	private container!: HTMLElement;
	private nameInput!: HTMLInputElement;
	private descriptionInput!: HTMLInputElement;
	private categorySelect!: HTMLSelectElement;
	private tagsInput!: HTMLInputElement;
	private contentEditor!: HTMLTextAreaElement;
	private previewPanel!: HTMLElement;
	private variableValues: Record<string, string> = {};

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

		// Initialize with sample variable values
		this.variableValues = {
			'SELECTION': 'function example() {\n  return "Hello World";\n}',
			'FILE_NAME': 'example.ts',
			'LANGUAGE': 'typescript',
			'FILE_PATH': '/src/example.ts',
		};
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-prompt-builder-view');

		// Header
		const header = append(this.container, $('.prompt-builder-header'));
		header.innerHTML = `
			<span class="codicon codicon-edit"></span>
			<span>${localize('promptBuilder', 'Prompt Builder')}</span>
		`;

		// Form
		const form = append(this.container, $('.prompt-builder-form'));

		// Name field
		const nameGroup = append(form, $('.prompt-field'));
		const nameLabel = append(nameGroup, $('label'));
		nameLabel.textContent = localize('name', 'Name');
		this.nameInput = append(nameGroup, $('input.prompt-input')) as HTMLInputElement;
		this.nameInput.placeholder = 'my-prompt-template';
		this.nameInput.oninput = () => this.updatePreview();

		// Description field
		const descGroup = append(form, $('.prompt-field'));
		const descLabel = append(descGroup, $('label'));
		descLabel.textContent = localize('description', 'Description');
		this.descriptionInput = append(descGroup, $('input.prompt-input')) as HTMLInputElement;
		this.descriptionInput.placeholder = localize('descPlaceholder', 'Brief description of what this prompt does');
		this.descriptionInput.oninput = () => this.updatePreview();

		// Category and Tags row
		const metaRow = append(form, $('.prompt-field-row'));

		// Category
		const categoryGroup = append(metaRow, $('.prompt-field'));
		const categoryLabel = append(categoryGroup, $('label'));
		categoryLabel.textContent = localize('category', 'Category');
		this.categorySelect = append(categoryGroup, $('select.prompt-select')) as HTMLSelectElement;

		for (const [id, cat] of Object.entries(PROMPT_CATEGORIES)) {
			const option = append(this.categorySelect, $('option')) as HTMLOptionElement;
			option.value = id;
			option.textContent = cat.name;
		}

		// Tags
		const tagsGroup = append(metaRow, $('.prompt-field'));
		const tagsLabel = append(tagsGroup, $('label'));
		tagsLabel.textContent = localize('tags', 'Tags');
		this.tagsInput = append(tagsGroup, $('input.prompt-input')) as HTMLInputElement;
		this.tagsInput.placeholder = 'tag1, tag2, tag3';

		// Variables palette
		const varsSection = append(form, $('.prompt-variables-section'));
		const varsHeader = append(varsSection, $('.prompt-section-header'));
		varsHeader.innerHTML = `
			<span class="codicon codicon-symbol-variable"></span>
			<span>${localize('variables', 'Variables')}</span>
			<span class="hint">${localize('clickToInsert', 'Click to insert')}</span>
		`;

		const varsGrid = append(varsSection, $('.prompt-variables-grid'));
		this.renderVariables(varsGrid);

		// Content editor
		const contentSection = append(form, $('.prompt-field.full-height'));
		const contentLabel = append(contentSection, $('label'));
		contentLabel.textContent = localize('promptContent', 'Prompt Content');

		const editorWrapper = append(contentSection, $('.prompt-editor-wrapper'));

		// Formatting toolbar
		const formatToolbar = append(editorWrapper, $('.prompt-format-toolbar'));
		const formatBtns = [
			{ icon: 'bold', action: '**', title: 'Bold' },
			{ icon: 'italic', action: '_', title: 'Italic' },
			{ icon: 'code', action: '`', title: 'Code' },
			{ icon: 'list-unordered', action: '- ', title: 'List' },
			{ icon: 'list-ordered', action: '1. ', title: 'Numbered List' },
			{ icon: 'quote', action: '> ', title: 'Quote' },
		];

		for (const btn of formatBtns) {
			const formatBtn = append(formatToolbar, $('button.format-btn'));
			formatBtn.innerHTML = `<span class="codicon codicon-${btn.icon}"></span>`;
			formatBtn.title = btn.title;
			formatBtn.onclick = () => this.insertFormatting(btn.action);
		}

		this.contentEditor = append(editorWrapper, $('textarea.prompt-content-editor')) as HTMLTextAreaElement;
		this.contentEditor.placeholder = localize('contentPlaceholder', 'Write your prompt template here...\n\nUse {{VARIABLE_NAME}} to insert dynamic content.\nExample: {{SELECTION}} will insert the selected code.');
		this.contentEditor.oninput = () => this.updatePreview();

		// Preview panel
		this.previewPanel = append(this.container, $('.prompt-preview-panel'));

		const previewHeader = append(this.previewPanel, $('.prompt-preview-header'));
		previewHeader.innerHTML = `
			<div class="preview-title">
				<span class="codicon codicon-preview"></span>
				<span>${localize('livePreview', 'Live Preview')}</span>
			</div>
			<div class="preview-stats">
				<span class="token-count"></span>
				<span class="cost-estimate"></span>
			</div>
		`;

		const previewContent = append(this.previewPanel, $('.prompt-preview-content'));
		previewContent.innerHTML = '';

		// Actions
		const actions = append(this.container, $('.prompt-builder-actions'));

		const saveProjectBtn = append(actions, $('button.prompt-btn.primary'));
		saveProjectBtn.innerHTML = `<span class="codicon codicon-folder"></span> ${localize('saveProject', 'Save to Project')}`;
		saveProjectBtn.onclick = () => this.save('project');

		const saveUserBtn = append(actions, $('button.prompt-btn'));
		saveUserBtn.innerHTML = `<span class="codicon codicon-account"></span> ${localize('saveUser', 'Save to User')}`;
		saveUserBtn.onclick = () => this.save('user');

		const testBtn = append(actions, $('button.prompt-btn'));
		testBtn.innerHTML = `<span class="codicon codicon-play"></span> ${localize('test', 'Test')}`;
		testBtn.onclick = () => this.testPrompt();

		const clearBtn = append(actions, $('button.prompt-btn'));
		clearBtn.innerHTML = `<span class="codicon codicon-clear-all"></span> ${localize('clear', 'Clear')}`;
		clearBtn.onclick = () => this.clear();

		// Initialize preview
		this.updatePreview();
	}

	private renderVariables(container: HTMLElement): void {
		// Group variables by type
		const groups: Record<string, typeof BUILTIN_VARIABLES> = {
			'Editor': BUILTIN_VARIABLES.filter(v => ['SELECTION', 'FILE', 'FILE_NAME', 'FILE_PATH', 'LANGUAGE', 'CURSOR_LINE', 'CURSOR_WORD'].includes(v.name)),
			'Project': BUILTIN_VARIABLES.filter(v => ['PROJECT_NAME', 'PROJECT_STRUCTURE', 'DEPENDENCIES'].includes(v.name)),
			'Git': BUILTIN_VARIABLES.filter(v => ['GIT_DIFF', 'GIT_BRANCH'].includes(v.name)),
			'Other': BUILTIN_VARIABLES.filter(v => ['ERROR_LOG', 'CLIPBOARD'].includes(v.name)),
		};

		for (const [groupName, vars] of Object.entries(groups)) {
			const group = append(container, $('.variable-group'));

			const groupLabel = append(group, $('.variable-group-label'));
			groupLabel.textContent = groupName;

			const varsRow = append(group, $('.variable-group-items'));

			for (const variable of vars) {
				const varBtn = append(varsRow, $('button.variable-btn'));
				varBtn.innerHTML = `<span class="var-name">{{${variable.name}}}</span>`;
				varBtn.title = variable.description;
				varBtn.onclick = () => this.insertVariable(variable.name);
			}
		}

		// Custom variable button
		const customGroup = append(container, $('.variable-group'));
		const customBtn = append(customGroup, $('button.variable-btn.custom'));
		customBtn.innerHTML = `<span class="codicon codicon-add"></span> ${localize('customVar', 'Custom Variable')}`;
		customBtn.onclick = () => this.addCustomVariable();
	}

	private insertVariable(name: string): void {
		const start = this.contentEditor.selectionStart;
		const end = this.contentEditor.selectionEnd;
		const text = this.contentEditor.value;
		const variable = `{{${name}}}`;

		this.contentEditor.value = text.substring(0, start) + variable + text.substring(end);
		this.contentEditor.selectionStart = this.contentEditor.selectionEnd = start + variable.length;
		this.contentEditor.focus();

		this.updatePreview();
	}

	private insertFormatting(wrapper: string): void {
		const start = this.contentEditor.selectionStart;
		const end = this.contentEditor.selectionEnd;
		const text = this.contentEditor.value;
		const selection = text.substring(start, end);

		let newText: string;
		if (wrapper === '- ' || wrapper === '1. ' || wrapper === '> ') {
			newText = text.substring(0, start) + wrapper + selection + text.substring(end);
		} else {
			newText = text.substring(0, start) + wrapper + selection + wrapper + text.substring(end);
		}

		this.contentEditor.value = newText;
		this.contentEditor.focus();
		this.updatePreview();
	}

	private async addCustomVariable(): Promise<void> {
		const name = prompt(localize('enterVarName', 'Enter variable name:'));
		if (name) {
			this.insertVariable(name.toUpperCase().replace(/\s+/g, '_'));
		}
	}

	private updatePreview(): void {
		const previewContent = this.previewPanel.querySelector('.prompt-preview-content');
		const tokenCount = this.previewPanel.querySelector('.token-count');
		const costEstimate = this.previewPanel.querySelector('.cost-estimate');

		if (!previewContent) return;

		const content = this.contentEditor.value;
		const expanded = expandVariables(content, this.variableValues);

		// Render with syntax highlighting for variables
		let rendered = this.escapeHtml(expanded);
		rendered = rendered.replace(/\{\{(\w+)\}\}/g, '<span class="var-highlight">{{$1}}</span>');

		previewContent.innerHTML = `<pre>${rendered}</pre>`;

		// Update stats
		const tokens = estimateTokens(expanded);
		if (tokenCount) {
			tokenCount.innerHTML = `<span class="codicon codicon-symbol-numeric"></span> ~${tokens} tokens`;
		}
		if (costEstimate) {
			const cost = (tokens / 1000) * 0.003; // Rough estimate
			costEstimate.innerHTML = `<span class="codicon codicon-credit-card"></span> ~$${cost.toFixed(4)}`;
		}
	}

	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	private async save(scope: 'project' | 'user'): Promise<void> {
		const name = this.nameInput.value.trim();

		if (!name) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('nameRequired', 'Prompt name is required')
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
			baseUri = URI.joinPath(folders[0].uri, '.claude/prompts');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			baseUri = URI.file(`${homeDir}/.claude/prompts`);
		}

		try {
			// Create directory if needed
			try {
				await this.fileService.createFolder(baseUri);
			} catch { }

			// Build file content
			const content = this.buildFileContent();

			// Write file
			const fileUri = URI.joinPath(baseUri, `${name}.md`);
			await this.fileService.writeFile(fileUri, new TextEncoder().encode(content));

			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('saved', 'Saved prompt: {0}', name)
			});
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('saveFailed', 'Failed to save prompt')
			});
		}
	}

	private buildFileContent(): string {
		const name = this.nameInput.value.trim();
		const description = this.descriptionInput.value.trim();
		const category = this.categorySelect.value;
		const tags = this.tagsInput.value.split(',').map(t => t.trim()).filter(t => t);
		const content = this.contentEditor.value;

		let fileContent = '---\n';
		fileContent += `name: ${name}\n`;
		if (description) {
			fileContent += `description: ${description}\n`;
		}
		fileContent += `category: ${category}\n`;
		if (tags.length > 0) {
			fileContent += `tags: [${tags.join(', ')}]\n`;
		}
		fileContent += '---\n\n';
		fileContent += content;

		return fileContent;
	}

	private testPrompt(): void {
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('openingPlayground', 'Opening in Playground...')
		});

		// In production, this would open the playground with this prompt
	}

	private clear(): void {
		this.nameInput.value = '';
		this.descriptionInput.value = '';
		this.categorySelect.value = 'custom';
		this.tagsInput.value = '';
		this.contentEditor.value = '';
		this.updatePreview();
	}

	public loadPrompt(name: string, description: string, category: PromptCategory, tags: string[], content: string): void {
		this.nameInput.value = name;
		this.descriptionInput.value = description;
		this.categorySelect.value = category;
		this.tagsInput.value = tags.join(', ');
		this.contentEditor.value = content;
		this.updatePreview();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
