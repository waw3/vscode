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
	IValidationResult,
	IValidationError,
	IValidationWarning,
	BUILTIN_SCHEMAS,
	validateAgainstSchema
} from '../claudeResponseFormat.contribution.js';

export class ClaudeFormatValidatorView extends ViewPane {

	private container!: HTMLElement;
	private schemaSelect!: HTMLSelectElement;
	private inputEditor!: HTMLTextAreaElement;
	private resultsContainer!: HTMLElement;
	private validationHistory: Array<{ timestamp: number; valid: boolean; errors: number }> = [];

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
		this.container.classList.add('claude-format-validator-view');

		// Header
		const header = append(this.container, $('.validator-header'));
		header.innerHTML = `
			<span class="codicon codicon-check-all"></span>
			<span>${localize('formatValidator', 'Format Validator')}</span>
		`;

		// Schema selector
		const schemaSection = append(this.container, $('.validator-schema-section'));

		const schemaLabel = append(schemaSection, $('label'));
		schemaLabel.textContent = localize('validateAgainst', 'Validate Against Schema');

		this.schemaSelect = append(schemaSection, $('select.validator-select')) as HTMLSelectElement;

		const defaultOption = append(this.schemaSelect, $('option')) as HTMLOptionElement;
		defaultOption.value = '';
		defaultOption.textContent = localize('selectSchema', 'Select a schema...');

		for (const schema of BUILTIN_SCHEMAS) {
			const option = append(this.schemaSelect, $('option')) as HTMLOptionElement;
			option.value = schema.id;
			option.textContent = schema.name;
		}

		// Input section
		const inputSection = append(this.container, $('.validator-input-section'));

		const inputHeader = append(inputSection, $('.validator-section-header'));
		inputHeader.innerHTML = `
			<span class="codicon codicon-json"></span>
			<span>${localize('inputData', 'Input Data (JSON)')}</span>
		`;

		// Format buttons
		const formatBar = append(inputSection, $('.validator-format-bar'));

		const formatBtn = append(formatBar, $('button.validator-btn'));
		formatBtn.innerHTML = `<span class="codicon codicon-symbol-namespace"></span> ${localize('format', 'Format')}`;
		formatBtn.onclick = () => this.formatInput();

		const minifyBtn = append(formatBar, $('button.validator-btn'));
		minifyBtn.innerHTML = `<span class="codicon codicon-fold"></span> ${localize('minify', 'Minify')}`;
		minifyBtn.onclick = () => this.minifyInput();

		const pasteBtn = append(formatBar, $('button.validator-btn'));
		pasteBtn.innerHTML = `<span class="codicon codicon-clippy"></span> ${localize('paste', 'Paste')}`;
		pasteBtn.onclick = () => this.pasteFromClipboard();

		this.inputEditor = append(inputSection, $('textarea.validator-textarea')) as HTMLTextAreaElement;
		this.inputEditor.placeholder = localize('inputPlaceholder', 'Paste or type JSON data here...\n\n{\n  "key": "value"\n}');

		// Validate button
		const validateSection = append(this.container, $('.validator-validate-section'));

		const validateBtn = append(validateSection, $('button.validator-btn.primary.large'));
		validateBtn.innerHTML = `<span class="codicon codicon-play"></span> ${localize('validate', 'Validate')}`;
		validateBtn.onclick = () => this.validate();

		const realTimeLabel = append(validateSection, $('label.realtime-toggle'));
		const realTimeCheck = append(realTimeLabel, $('input')) as HTMLInputElement;
		realTimeCheck.type = 'checkbox';
		realTimeCheck.onchange = () => {
			if (realTimeCheck.checked) {
				this.inputEditor.oninput = () => this.validate();
			} else {
				this.inputEditor.oninput = null;
			}
		};
		append(realTimeLabel, $('span')).textContent = localize('realTimeValidation', 'Real-time validation');

		// Results container
		this.resultsContainer = append(this.container, $('.validator-results'));
		this.renderEmptyResults();

		// History section
		const historySection = append(this.container, $('.validator-history-section'));
		const historyHeader = append(historySection, $('.validator-section-header'));
		historyHeader.innerHTML = `
			<span class="codicon codicon-history"></span>
			<span>${localize('validationHistory', 'Recent Validations')}</span>
		`;

		const historyList = append(historySection, $('.validator-history-list'));
		historyList.innerHTML = `<span class="empty">${localize('noHistory', 'No validation history')}</span>`;
	}

	private renderEmptyResults(): void {
		clearNode(this.resultsContainer);

		const empty = append(this.resultsContainer, $('.validator-results-empty'));
		empty.innerHTML = `
			<span class="codicon codicon-check-all"></span>
			<span>${localize('noValidation', 'No validation performed')}</span>
			<span class="hint">${localize('enterDataHint', 'Enter JSON data and click Validate')}</span>
		`;
	}

	private formatInput(): void {
		try {
			const parsed = JSON.parse(this.inputEditor.value);
			this.inputEditor.value = JSON.stringify(parsed, null, 2);
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('invalidJson', 'Invalid JSON - cannot format')
			});
		}
	}

	private minifyInput(): void {
		try {
			const parsed = JSON.parse(this.inputEditor.value);
			this.inputEditor.value = JSON.stringify(parsed);
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('invalidJson', 'Invalid JSON - cannot minify')
			});
		}
	}

	private async pasteFromClipboard(): Promise<void> {
		try {
			const text = await navigator.clipboard.readText();
			this.inputEditor.value = text;

			// Try to format it
			try {
				const parsed = JSON.parse(text);
				this.inputEditor.value = JSON.stringify(parsed, null, 2);
			} catch { }
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('clipboardError', 'Cannot read from clipboard')
			});
		}
	}

	private validate(): void {
		const input = this.inputEditor.value.trim();

		if (!input) {
			this.renderEmptyResults();
			return;
		}

		// Parse JSON
		let data: any;
		try {
			data = JSON.parse(input);
		} catch (e: any) {
			this.renderJsonError(e);
			return;
		}

		// Validate against schema if selected
		const schemaId = this.schemaSelect.value;
		if (schemaId) {
			const schema = BUILTIN_SCHEMAS.find(s => s.id === schemaId);
			if (schema) {
				const result = validateAgainstSchema(data, schema);
				this.renderValidationResult(result);
				this.addToHistory(result);
				return;
			}
		}

		// Basic structure validation
		this.renderBasicValidation(data);
	}

	private renderJsonError(error: Error): void {
		clearNode(this.resultsContainer);

		const header = append(this.resultsContainer, $('.validator-results-header.error'));
		header.innerHTML = `
			<span class="codicon codicon-error"></span>
			<span>${localize('jsonParseError', 'JSON Parse Error')}</span>
		`;

		const content = append(this.resultsContainer, $('.validator-results-content'));

		const errorItem = append(content, $('.validator-error-item'));
		errorItem.innerHTML = `
			<span class="error-icon"><span class="codicon codicon-error"></span></span>
			<div class="error-details">
				<div class="error-message">${this.escapeHtml(error.message)}</div>
				<div class="error-hint">${localize('checkSyntax', 'Check your JSON syntax and try again')}</div>
			</div>
		`;
	}

	private renderValidationResult(result: IValidationResult): void {
		clearNode(this.resultsContainer);

		// Header
		const header = append(this.resultsContainer, $(`.validator-results-header.${result.valid ? 'success' : 'error'}`));

		if (result.valid) {
			header.innerHTML = `
				<span class="codicon codicon-pass-filled"></span>
				<span>${localize('validationPassed', 'Validation Passed')}</span>
				<span class="result-count">${localize('noErrors', 'No errors')}</span>
			`;
		} else {
			header.innerHTML = `
				<span class="codicon codicon-error"></span>
				<span>${localize('validationFailed', 'Validation Failed')}</span>
				<span class="result-count">${result.errors.length} ${localize('errors', 'errors')}</span>
			`;
		}

		const content = append(this.resultsContainer, $('.validator-results-content'));

		// Errors
		if (result.errors.length > 0) {
			const errorsSection = append(content, $('.validator-errors-section'));
			const errorsHeader = append(errorsSection, $('h4'));
			errorsHeader.innerHTML = `<span class="codicon codicon-error"></span> ${localize('errors', 'Errors')}`;

			for (const error of result.errors) {
				this.renderError(errorsSection, error);
			}
		}

		// Warnings
		if (result.warnings.length > 0) {
			const warningsSection = append(content, $('.validator-warnings-section'));
			const warningsHeader = append(warningsSection, $('h4'));
			warningsHeader.innerHTML = `<span class="codicon codicon-warning"></span> ${localize('warnings', 'Warnings')}`;

			for (const warning of result.warnings) {
				this.renderWarning(warningsSection, warning);
			}
		}

		// Success message
		if (result.valid && result.errors.length === 0) {
			const successMessage = append(content, $('.validator-success-message'));
			successMessage.innerHTML = `
				<span class="codicon codicon-check"></span>
				<span>${localize('dataValid', 'Data matches the schema perfectly!')}</span>
			`;
		}
	}

	private renderError(container: HTMLElement, error: IValidationError): void {
		const item = append(container, $('.validator-error-item'));

		item.innerHTML = `
			<span class="error-icon"><span class="codicon codicon-error"></span></span>
			<div class="error-details">
				<div class="error-path"><code>${error.path}</code></div>
				<div class="error-message">${this.escapeHtml(error.message)}</div>
				${error.expected ? `<div class="error-expected"><strong>Expected:</strong> ${this.escapeHtml(error.expected)}</div>` : ''}
				${error.actual ? `<div class="error-actual"><strong>Actual:</strong> ${this.escapeHtml(error.actual)}</div>` : ''}
			</div>
		`;
	}

	private renderWarning(container: HTMLElement, warning: IValidationWarning): void {
		const item = append(container, $('.validator-warning-item'));

		item.innerHTML = `
			<span class="warning-icon"><span class="codicon codicon-warning"></span></span>
			<div class="warning-details">
				<div class="warning-path"><code>${warning.path}</code></div>
				<div class="warning-message">${this.escapeHtml(warning.message)}</div>
			</div>
		`;
	}

	private renderBasicValidation(data: any): void {
		clearNode(this.resultsContainer);

		const header = append(this.resultsContainer, $('.validator-results-header.success'));
		header.innerHTML = `
			<span class="codicon codicon-pass-filled"></span>
			<span>${localize('validJson', 'Valid JSON')}</span>
		`;

		const content = append(this.resultsContainer, $('.validator-results-content'));

		// Data analysis
		const analysis = append(content, $('.validator-analysis'));

		const stats = this.analyzeData(data);

		analysis.innerHTML = `
			<h4><span class="codicon codicon-graph"></span> ${localize('dataAnalysis', 'Data Analysis')}</h4>
			<div class="analysis-grid">
				<div class="analysis-item">
					<span class="analysis-label">${localize('type', 'Type')}</span>
					<span class="analysis-value">${stats.type}</span>
				</div>
				<div class="analysis-item">
					<span class="analysis-label">${localize('keys', 'Keys')}</span>
					<span class="analysis-value">${stats.keyCount}</span>
				</div>
				<div class="analysis-item">
					<span class="analysis-label">${localize('depth', 'Depth')}</span>
					<span class="analysis-value">${stats.depth}</span>
				</div>
				<div class="analysis-item">
					<span class="analysis-label">${localize('size', 'Size')}</span>
					<span class="analysis-value">${stats.size}</span>
				</div>
			</div>
		`;

		// Structure preview
		if (stats.type === 'object' && stats.keyCount > 0) {
			const structure = append(content, $('.validator-structure'));
			structure.innerHTML = `
				<h4><span class="codicon codicon-list-tree"></span> ${localize('structure', 'Structure')}</h4>
				<div class="structure-tree">${this.renderDataStructure(data, 0)}</div>
			`;
		}
	}

	private analyzeData(data: any): { type: string; keyCount: number; depth: number; size: string } {
		const type = Array.isArray(data) ? 'array' : typeof data;
		const keyCount = type === 'object' ? Object.keys(data).length : (type === 'array' ? data.length : 0);
		const depth = this.getDepth(data);
		const sizeBytes = new TextEncoder().encode(JSON.stringify(data)).length;
		const size = sizeBytes > 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB` : `${sizeBytes} bytes`;

		return { type, keyCount, depth, size };
	}

	private getDepth(data: any, current: number = 0): number {
		if (typeof data !== 'object' || data === null) {
			return current;
		}

		const values = Array.isArray(data) ? data : Object.values(data);
		if (values.length === 0) {
			return current + 1;
		}

		return Math.max(...values.map(v => this.getDepth(v, current + 1)));
	}

	private renderDataStructure(data: any, level: number): string {
		if (level > 3) return '<span class="depth-limit">...</span>';

		const indent = '  '.repeat(level);

		if (Array.isArray(data)) {
			if (data.length === 0) return '<span class="type-array">[]</span>';
			const itemType = typeof data[0];
			return `<span class="type-array">[${data.length} ${itemType}${data.length > 1 ? 's' : ''}]</span>`;
		}

		if (typeof data === 'object' && data !== null) {
			const keys = Object.keys(data);
			if (keys.length === 0) return '<span class="type-object">{}</span>';

			let html = '<div class="structure-object">';
			for (const key of keys.slice(0, 10)) {
				const value = data[key];
				const valueType = Array.isArray(value) ? 'array' : typeof value;
				html += `<div class="structure-item" style="margin-left: ${level * 16}px">`;
				html += `<span class="key">${this.escapeHtml(key)}</span>: `;
				html += `<span class="type-${valueType}">${this.renderDataStructure(value, level + 1)}</span>`;
				html += '</div>';
			}
			if (keys.length > 10) {
				html += `<div class="structure-more">...${keys.length - 10} more keys</div>`;
			}
			html += '</div>';
			return html;
		}

		return `<span class="type-${typeof data}">${typeof data}</span>`;
	}

	private addToHistory(result: IValidationResult): void {
		this.validationHistory.unshift({
			timestamp: Date.now(),
			valid: result.valid,
			errors: result.errors.length
		});

		// Keep only last 10
		this.validationHistory = this.validationHistory.slice(0, 10);

		this.renderHistory();
	}

	private renderHistory(): void {
		const historyList = this.container.querySelector('.validator-history-list');
		if (!historyList) return;

		clearNode(historyList as HTMLElement);

		for (const entry of this.validationHistory) {
			const item = append(historyList as HTMLElement, $('.validator-history-item'));
			const time = new Date(entry.timestamp).toLocaleTimeString();

			item.innerHTML = `
				<span class="codicon codicon-${entry.valid ? 'pass-filled' : 'error'}"></span>
				<span class="history-time">${time}</span>
				<span class="history-result">${entry.valid ? localize('passed', 'Passed') : `${entry.errors} ${localize('errors', 'errors')}`}</span>
			`;
		}
	}

	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
