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
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import {
	IPlaceholder,
	TemplateFormat,
	FORMAT_INFO,
	BUILTIN_TEMPLATES
} from '../claudeResponseFormat.contribution.js';

export class ClaudeTemplateEditorView extends ViewPane {

	private container!: HTMLElement;
	private templateNameInput!: HTMLInputElement;
	private formatSelect!: HTMLSelectElement;
	private templateEditor!: HTMLTextAreaElement;
	private placeholdersContainer!: HTMLElement;
	private previewPanel!: HTMLElement;
	private placeholders: IPlaceholder[] = [];
	private placeholderValues: Record<string, string> = {};

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
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-template-editor-view');

		// Header
		const header = append(this.container, $('.template-editor-header'));
		header.innerHTML = `
			<span class="codicon codicon-file-code"></span>
			<span>${localize('templateEditor', 'Template Editor')}</span>
		`;

		// Template metadata
		const metaSection = append(this.container, $('.template-meta-section'));

		const metaRow = append(metaSection, $('.template-meta-row'));

		// Name
		const nameGroup = append(metaRow, $('.template-field'));
		const nameLabel = append(nameGroup, $('label'));
		nameLabel.textContent = localize('templateName', 'Template Name');
		this.templateNameInput = append(nameGroup, $('input.template-input')) as HTMLInputElement;
		this.templateNameInput.placeholder = 'my-response-template';

		// Format
		const formatGroup = append(metaRow, $('.template-field'));
		const formatLabel = append(formatGroup, $('label'));
		formatLabel.textContent = localize('format', 'Format');
		this.formatSelect = append(formatGroup, $('select.template-select')) as HTMLSelectElement;

		for (const [format, info] of Object.entries(FORMAT_INFO)) {
			const option = append(this.formatSelect, $('option')) as HTMLOptionElement;
			option.value = format;
			option.textContent = info.name;
		}

		this.formatSelect.onchange = () => this.updatePreview();

		// Built-in templates
		const builtinSection = append(this.container, $('.template-builtin-section'));
		const builtinHeader = append(builtinSection, $('.template-section-header'));
		builtinHeader.innerHTML = `
			<span class="codicon codicon-library"></span>
			<span>${localize('builtinTemplates', 'Built-in Templates')}</span>
		`;

		const builtinList = append(builtinSection, $('.template-builtin-list'));
		this.renderBuiltinTemplates(builtinList);

		// Template editor
		const editorSection = append(this.container, $('.template-editor-section'));

		const editorHeader = append(editorSection, $('.template-section-header'));
		editorHeader.innerHTML = `
			<span class="codicon codicon-edit"></span>
			<span>${localize('template', 'Template')}</span>
			<span class="hint">${localize('placeholderHint', 'Use {{PLACEHOLDER}} syntax')}</span>
		`;

		// Formatting toolbar
		const formatToolbar = append(editorSection, $('.template-format-toolbar'));
		this.renderFormatToolbar(formatToolbar);

		this.templateEditor = append(editorSection, $('textarea.template-textarea')) as HTMLTextAreaElement;
		this.templateEditor.placeholder = localize('templatePlaceholder', 'Write your template here...\n\nUse {{PLACEHOLDER_NAME}} for dynamic values.');
		this.templateEditor.oninput = () => {
			this.detectPlaceholders();
			this.updatePreview();
		};

		// Placeholders section
		const placeholdersSection = append(this.container, $('.template-placeholders-section'));

		const placeholdersHeader = append(placeholdersSection, $('.template-section-header'));
		placeholdersHeader.innerHTML = `
			<span class="codicon codicon-symbol-variable"></span>
			<span>${localize('placeholders', 'Placeholders')}</span>
		`;

		this.placeholdersContainer = append(placeholdersSection, $('.template-placeholders-list'));

		// Preview panel
		this.previewPanel = append(this.container, $('.template-preview-panel'));

		const previewHeader = append(this.previewPanel, $('.template-preview-header'));
		previewHeader.innerHTML = `
			<span class="codicon codicon-preview"></span>
			<span>${localize('preview', 'Preview')}</span>
		`;

		const previewContent = append(this.previewPanel, $('pre.template-preview-content'));
		previewContent.textContent = '';

		// Actions
		const actions = append(this.container, $('.template-editor-actions'));

		const saveBtn = append(actions, $('button.template-btn.primary'));
		saveBtn.innerHTML = `<span class="codicon codicon-save"></span> ${localize('saveTemplate', 'Save Template')}`;
		saveBtn.onclick = () => this.saveTemplate();

		const copyBtn = append(actions, $('button.template-btn'));
		copyBtn.innerHTML = `<span class="codicon codicon-copy"></span> ${localize('copyOutput', 'Copy Output')}`;
		copyBtn.onclick = () => this.copyOutput();

		const clearBtn = append(actions, $('button.template-btn'));
		clearBtn.innerHTML = `<span class="codicon codicon-clear-all"></span> ${localize('clear', 'Clear')}`;
		clearBtn.onclick = () => this.clearTemplate();

		// Initialize
		this.renderPlaceholders();
		this.updatePreview();
	}

	private renderBuiltinTemplates(container: HTMLElement): void {
		for (const template of BUILTIN_TEMPLATES) {
			const formatInfo = FORMAT_INFO[template.format];
			const item = append(container, $('.template-builtin-item'));
			item.innerHTML = `
				<span class="codicon codicon-${formatInfo.icon}"></span>
				<span class="template-name">${template.name}</span>
				<span class="template-format">${formatInfo.name}</span>
			`;

			item.onclick = () => this.loadBuiltinTemplate(template.id);
		}
	}

	private loadBuiltinTemplate(id: string): void {
		const template = BUILTIN_TEMPLATES.find(t => t.id === id);
		if (!template) return;

		this.templateNameInput.value = template.name;
		this.formatSelect.value = template.format;
		this.templateEditor.value = template.template;
		this.placeholders = [...template.placeholders];

		// Initialize placeholder values
		for (const p of this.placeholders) {
			this.placeholderValues[p.name] = p.defaultValue || `[${p.name}]`;
		}

		this.renderPlaceholders();
		this.updatePreview();

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('templateLoaded', 'Loaded: {0}', template.name)
		});
	}

	private renderFormatToolbar(container: HTMLElement): void {
		const buttons = [
			{ icon: 'bracket', action: '{}', title: 'Object braces' },
			{ icon: 'bracket-dot', action: '[]', title: 'Array brackets' },
			{ icon: 'quote', action: '""', title: 'Quotes' },
			{ icon: 'symbol-variable', action: '{{}}', title: 'Placeholder' }
		];

		for (const btn of buttons) {
			const button = append(container, $('button.format-btn'));
			button.innerHTML = `<span class="codicon codicon-${btn.icon}"></span>`;
			button.title = btn.title;
			button.onclick = () => this.insertFormat(btn.action);
		}
	}

	private insertFormat(format: string): void {
		const start = this.templateEditor.selectionStart;
		const end = this.templateEditor.selectionEnd;
		const text = this.templateEditor.value;
		const selection = text.substring(start, end);

		let newText: string;
		let cursorPos: number;

		if (format === '{{}}') {
			if (selection) {
				newText = text.substring(0, start) + '{{' + selection + '}}' + text.substring(end);
				cursorPos = end + 4;
			} else {
				newText = text.substring(0, start) + '{{PLACEHOLDER}}' + text.substring(end);
				cursorPos = start + 2;
				// Select "PLACEHOLDER" for easy replacement
				this.templateEditor.value = newText;
				this.templateEditor.setSelectionRange(start + 2, start + 13);
				this.templateEditor.focus();
				this.detectPlaceholders();
				this.updatePreview();
				return;
			}
		} else if (format === '{}' || format === '[]' || format === '""') {
			const [open, close] = format.split('');
			newText = text.substring(0, start) + open + selection + close + text.substring(end);
			cursorPos = selection ? end + 2 : start + 1;
		} else {
			newText = text.substring(0, start) + format + text.substring(end);
			cursorPos = start + format.length;
		}

		this.templateEditor.value = newText;
		this.templateEditor.selectionStart = this.templateEditor.selectionEnd = cursorPos;
		this.templateEditor.focus();
		this.detectPlaceholders();
		this.updatePreview();
	}

	private detectPlaceholders(): void {
		const template = this.templateEditor.value;
		const placeholderRegex = /\{\{(\w+)\}\}/g;
		const found = new Set<string>();
		let match;

		while ((match = placeholderRegex.exec(template)) !== null) {
			found.add(match[1]);
		}

		// Add new placeholders
		for (const name of found) {
			if (!this.placeholders.find(p => p.name === name)) {
				this.placeholders.push({
					name,
					description: '',
					type: 'string'
				});
				this.placeholderValues[name] = `[${name}]`;
			}
		}

		// Remove placeholders no longer in template
		this.placeholders = this.placeholders.filter(p => found.has(p.name));

		this.renderPlaceholders();
	}

	private renderPlaceholders(): void {
		clearNode(this.placeholdersContainer);

		if (this.placeholders.length === 0) {
			const empty = append(this.placeholdersContainer, $('.template-placeholders-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-symbol-variable"></span>
				<span>${localize('noPlaceholders', 'No placeholders detected')}</span>
			`;
			return;
		}

		for (const placeholder of this.placeholders) {
			const item = append(this.placeholdersContainer, $('.template-placeholder-item'));

			// Name badge
			const nameBadge = append(item, $('.placeholder-name'));
			nameBadge.textContent = `{{${placeholder.name}}}`;

			// Value input
			const valueInput = append(item, $('input.placeholder-value')) as HTMLInputElement;
			valueInput.value = this.placeholderValues[placeholder.name] || '';
			valueInput.placeholder = localize('testValue', 'Test value...');
			valueInput.oninput = () => {
				this.placeholderValues[placeholder.name] = valueInput.value;
				this.updatePreview();
			};

			// Description input
			const descInput = append(item, $('input.placeholder-desc')) as HTMLInputElement;
			descInput.value = placeholder.description;
			descInput.placeholder = localize('description', 'Description');
			descInput.onchange = () => {
				placeholder.description = descInput.value;
			};
		}
	}

	private updatePreview(): void {
		const previewContent = this.previewPanel.querySelector('.template-preview-content');
		if (!previewContent) return;

		let output = this.templateEditor.value;

		// Replace placeholders with values
		for (const [name, value] of Object.entries(this.placeholderValues)) {
			output = output.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), value);
		}

		previewContent.textContent = output;

		// Apply syntax highlighting based on format
		const format = this.formatSelect.value as TemplateFormat;
		previewContent.className = `template-preview-content format-${format}`;
	}

	private saveTemplate(): void {
		const name = this.templateNameInput.value.trim();

		if (!name) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('nameRequired', 'Template name is required')
			});
			return;
		}

		if (!this.templateEditor.value.trim()) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('templateRequired', 'Template content is required')
			});
			return;
		}

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('templateSaved', 'Template saved: {0}', name)
		});
	}

	private copyOutput(): void {
		const previewContent = this.previewPanel.querySelector('.template-preview-content');
		if (previewContent && previewContent.textContent) {
			navigator.clipboard.writeText(previewContent.textContent);
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('outputCopied', 'Output copied to clipboard')
			});
		}
	}

	private clearTemplate(): void {
		this.templateNameInput.value = '';
		this.formatSelect.value = 'json';
		this.templateEditor.value = '';
		this.placeholders = [];
		this.placeholderValues = {};
		this.renderPlaceholders();
		this.updatePreview();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
