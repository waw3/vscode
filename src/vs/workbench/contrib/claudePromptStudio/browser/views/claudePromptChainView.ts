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
import { IPromptChain, IChainStep, BUILTIN_PROMPTS, estimateTokens } from '../claudePromptStudio.contribution.js';

interface IChainStepUI extends IChainStep {
	isExpanded: boolean;
}

export class ClaudePromptChainView extends ViewPane {

	private container!: HTMLElement;
	private chainNameInput!: HTMLInputElement;
	private stepsContainer!: HTMLElement;
	private previewPanel!: HTMLElement;
	private steps: IChainStepUI[] = [];
	private draggedIndex: number = -1;

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
		this.container.classList.add('claude-prompt-chain-view');

		// Header
		const header = append(this.container, $('.prompt-chain-header'));
		header.innerHTML = `
			<span class="codicon codicon-git-merge"></span>
			<span>${localize('chainBuilder', 'Prompt Chain Builder')}</span>
		`;

		// Chain name
		const nameSection = append(this.container, $('.prompt-chain-name-section'));
		const nameLabel = append(nameSection, $('label'));
		nameLabel.textContent = localize('chainName', 'Chain Name');
		this.chainNameInput = append(nameSection, $('input.prompt-chain-name-input')) as HTMLInputElement;
		this.chainNameInput.placeholder = localize('chainNamePlaceholder', 'my-workflow-chain');

		// Toolbar
		const toolbar = append(this.container, $('.prompt-chain-toolbar'));

		const addStepBtn = append(toolbar, $('button.prompt-chain-btn.primary'));
		addStepBtn.innerHTML = `<span class="codicon codicon-add"></span> ${localize('addStep', 'Add Step')}`;
		addStepBtn.onclick = () => this.addStep();

		const addFromLibraryBtn = append(toolbar, $('button.prompt-chain-btn'));
		addFromLibraryBtn.innerHTML = `<span class="codicon codicon-library"></span> ${localize('fromLibrary', 'From Library')}`;
		addFromLibraryBtn.onclick = () => this.addFromLibrary();

		const clearBtn = append(toolbar, $('button.prompt-chain-btn'));
		clearBtn.innerHTML = `<span class="codicon codicon-clear-all"></span> ${localize('clear', 'Clear')}`;
		clearBtn.onclick = () => this.clearChain();

		// Steps container
		const stepsSection = append(this.container, $('.prompt-chain-steps-section'));

		const stepsHeader = append(stepsSection, $('.prompt-chain-section-header'));
		stepsHeader.innerHTML = `
			<span class="codicon codicon-layers"></span>
			<span>${localize('steps', 'Chain Steps')}</span>
			<span class="hint">${localize('dragToReorder', 'Drag to reorder')}</span>
		`;

		this.stepsContainer = append(stepsSection, $('.prompt-chain-steps'));

		// Preview panel
		this.previewPanel = append(this.container, $('.prompt-chain-preview'));
		const previewHeader = append(this.previewPanel, $('.prompt-chain-preview-header'));
		previewHeader.innerHTML = `
			<span class="codicon codicon-preview"></span>
			<span>${localize('chainPreview', 'Chain Preview')}</span>
		`;

		const previewContent = append(this.previewPanel, $('.prompt-chain-preview-content'));
		previewContent.innerHTML = '';

		// Actions
		const actions = append(this.container, $('.prompt-chain-actions'));

		const saveBtn = append(actions, $('button.prompt-chain-btn.primary'));
		saveBtn.innerHTML = `<span class="codicon codicon-save"></span> ${localize('saveChain', 'Save Chain')}`;
		saveBtn.onclick = () => this.saveChain();

		const runBtn = append(actions, $('button.prompt-chain-btn'));
		runBtn.innerHTML = `<span class="codicon codicon-play"></span> ${localize('runChain', 'Run Chain')}`;
		runBtn.onclick = () => this.runChain();

		const exportBtn = append(actions, $('button.prompt-chain-btn'));
		exportBtn.innerHTML = `<span class="codicon codicon-export"></span> ${localize('export', 'Export')}`;
		exportBtn.onclick = () => this.exportChain();

		// Initialize
		this.renderSteps();
		this.updatePreview();
	}

	private addStep(promptContent: string = '', stepName: string = ''): void {
		const step: IChainStepUI = {
			id: `step-${Date.now()}`,
			name: stepName || `Step ${this.steps.length + 1}`,
			promptId: '',
			promptContent: promptContent,
			inputMapping: {},
			condition: undefined,
			isExpanded: true
		};

		this.steps.push(step);
		this.renderSteps();
		this.updatePreview();
	}

	private addFromLibrary(): void {
		// Show quick pick with available prompts
		const prompts = BUILTIN_PROMPTS.map(p => ({
			label: p.name,
			description: p.category,
			content: p.content
		}));

		// Create a simple selection UI
		const modal = append(document.body, $('.prompt-chain-modal'));
		modal.innerHTML = `
			<div class="prompt-chain-modal-content">
				<div class="modal-header">
					<span class="codicon codicon-library"></span>
					<span>${localize('selectPrompt', 'Select Prompt from Library')}</span>
					<button class="modal-close"><span class="codicon codicon-close"></span></button>
				</div>
				<div class="modal-body">
					${prompts.map((p, i) => `
						<div class="modal-prompt-item" data-index="${i}">
							<span class="prompt-name">${p.label}</span>
							<span class="prompt-category">${p.description}</span>
						</div>
					`).join('')}
				</div>
			</div>
		`;

		const close = () => modal.remove();
		modal.querySelector('.modal-close')?.addEventListener('click', close);
		modal.addEventListener('click', (e) => {
			if (e.target === modal) close();
		});

		modal.querySelectorAll('.modal-prompt-item').forEach((item, index) => {
			item.addEventListener('click', () => {
				const prompt = BUILTIN_PROMPTS[index];
				this.addStep(prompt.content, prompt.name);
				close();
			});
		});
	}

	private renderSteps(): void {
		clearNode(this.stepsContainer);

		if (this.steps.length === 0) {
			const empty = append(this.stepsContainer, $('.prompt-chain-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-git-merge"></span>
				<span>${localize('noSteps', 'No steps in chain')}</span>
				<span class="hint">${localize('addStepsHint', 'Add steps to build your workflow')}</span>
			`;
			return;
		}

		this.steps.forEach((step, index) => {
			this.renderStep(step, index);
		});
	}

	private renderStep(step: IChainStepUI, index: number): void {
		const stepEl = append(this.stepsContainer, $('.prompt-chain-step'));
		stepEl.draggable = true;
		stepEl.dataset.index = String(index);

		if (step.isExpanded) {
			stepEl.classList.add('expanded');
		}

		// Drag handle
		const handle = append(stepEl, $('.step-handle'));
		handle.innerHTML = '<span class="codicon codicon-grabber"></span>';

		// Step header
		const header = append(stepEl, $('.step-header'));

		const number = append(header, $('.step-number'));
		number.textContent = String(index + 1);

		const nameInput = append(header, $('input.step-name')) as HTMLInputElement;
		nameInput.value = step.name;
		nameInput.onchange = () => {
			step.name = nameInput.value;
			this.updatePreview();
		};

		const toggleBtn = append(header, $('button.step-toggle'));
		toggleBtn.innerHTML = `<span class="codicon codicon-chevron-${step.isExpanded ? 'up' : 'down'}"></span>`;
		toggleBtn.onclick = () => {
			step.isExpanded = !step.isExpanded;
			this.renderSteps();
		};

		const deleteBtn = append(header, $('button.step-delete'));
		deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
		deleteBtn.onclick = () => {
			this.steps.splice(index, 1);
			this.renderSteps();
			this.updatePreview();
		};

		// Step body (collapsible)
		if (step.isExpanded) {
			const body = append(stepEl, $('.step-body'));

			// Prompt content
			const contentGroup = append(body, $('.step-field'));
			const contentLabel = append(contentGroup, $('label'));
			contentLabel.textContent = localize('promptContent', 'Prompt Content');

			const textarea = append(contentGroup, $('textarea.step-content')) as HTMLTextAreaElement;
			textarea.value = step.promptContent || '';
			textarea.placeholder = localize('stepContentPlaceholder', 'Enter prompt for this step...\n\nUse {{PREVIOUS_OUTPUT}} to reference the output from the previous step.');
			textarea.oninput = () => {
				step.promptContent = textarea.value;
				this.updatePreview();
			};

			// Input mapping section
			const mappingGroup = append(body, $('.step-field'));
			const mappingLabel = append(mappingGroup, $('label'));
			mappingLabel.innerHTML = `${localize('inputMapping', 'Input Mapping')} <span class="hint">${localize('optional', 'optional')}</span>`;

			const mappingHint = append(mappingGroup, $('.field-hint'));
			mappingHint.textContent = localize('mappingHint', 'Map variables from previous steps');

			const addMappingBtn = append(mappingGroup, $('button.add-mapping-btn'));
			addMappingBtn.innerHTML = `<span class="codicon codicon-add"></span> ${localize('addMapping', 'Add Mapping')}`;
			addMappingBtn.onclick = () => this.addInputMapping(step, mappingGroup);

			// Condition section
			const conditionGroup = append(body, $('.step-field'));
			const conditionLabel = append(conditionGroup, $('label'));
			conditionLabel.innerHTML = `${localize('condition', 'Run Condition')} <span class="hint">${localize('optional', 'optional')}</span>`;

			const conditionInput = append(conditionGroup, $('input.step-condition')) as HTMLInputElement;
			conditionInput.value = step.condition || '';
			conditionInput.placeholder = localize('conditionPlaceholder', 'e.g., {{PREVIOUS_OUTPUT}} contains "error"');
			conditionInput.onchange = () => {
				step.condition = conditionInput.value || undefined;
				this.updatePreview();
			};
		}

		// Connector line
		if (index < this.steps.length - 1) {
			const connector = append(this.stepsContainer, $('.step-connector'));
			connector.innerHTML = `
				<div class="connector-line"></div>
				<span class="codicon codicon-arrow-down"></span>
			`;
		}

		// Drag events
		stepEl.ondragstart = (e) => {
			this.draggedIndex = index;
			stepEl.classList.add('dragging');
			e.dataTransfer?.setData('text/plain', String(index));
		};

		stepEl.ondragend = () => {
			stepEl.classList.remove('dragging');
			this.draggedIndex = -1;
		};

		stepEl.ondragover = (e) => {
			e.preventDefault();
			if (this.draggedIndex !== index) {
				stepEl.classList.add('drag-over');
			}
		};

		stepEl.ondragleave = () => {
			stepEl.classList.remove('drag-over');
		};

		stepEl.ondrop = (e) => {
			e.preventDefault();
			stepEl.classList.remove('drag-over');

			if (this.draggedIndex !== -1 && this.draggedIndex !== index) {
				const [moved] = this.steps.splice(this.draggedIndex, 1);
				this.steps.splice(index, 0, moved);
				this.renderSteps();
				this.updatePreview();
			}
		};
	}

	private addInputMapping(step: IChainStepUI, container: HTMLElement): void {
		const mappingRow = append(container, $('.mapping-row'));

		const keyInput = append(mappingRow, $('input.mapping-key')) as HTMLInputElement;
		keyInput.placeholder = 'Variable name';

		const arrow = append(mappingRow, $('span.mapping-arrow'));
		arrow.innerHTML = '<span class="codicon codicon-arrow-right"></span>';

		const valueInput = append(mappingRow, $('input.mapping-value')) as HTMLInputElement;
		valueInput.placeholder = 'Source (e.g., step1.output)';

		const removeBtn = append(mappingRow, $('button.mapping-remove'));
		removeBtn.innerHTML = '<span class="codicon codicon-close"></span>';
		removeBtn.onclick = () => {
			const key = keyInput.value;
			if (key && step.inputMapping) {
				delete step.inputMapping[key];
			}
			mappingRow.remove();
			this.updatePreview();
		};

		keyInput.onchange = valueInput.onchange = () => {
			if (keyInput.value && valueInput.value) {
				step.inputMapping = step.inputMapping || {};
				step.inputMapping[keyInput.value] = valueInput.value;
				this.updatePreview();
			}
		};
	}

	private updatePreview(): void {
		const previewContent = this.previewPanel.querySelector('.prompt-chain-preview-content');
		if (!previewContent) return;

		if (this.steps.length === 0) {
			previewContent.innerHTML = `<span class="empty">${localize('noPreview', 'Add steps to see chain preview')}</span>`;
			return;
		}

		// Calculate total tokens
		let totalTokens = 0;
		for (const step of this.steps) {
			totalTokens += estimateTokens(step.promptContent || '');
		}

		// Build chain visualization
		let html = `
			<div class="preview-stats">
				<span><span class="codicon codicon-layers"></span> ${this.steps.length} steps</span>
				<span><span class="codicon codicon-symbol-numeric"></span> ~${totalTokens} tokens</span>
			</div>
			<div class="preview-flow">
		`;

		for (let i = 0; i < this.steps.length; i++) {
			const step = this.steps[i];
			const preview = (step.promptContent || '').substring(0, 60).replace(/\n/g, ' ');

			html += `
				<div class="preview-step">
					<div class="preview-step-header">
						<span class="step-num">${i + 1}</span>
						<span class="step-name">${step.name}</span>
						${step.condition ? '<span class="codicon codicon-question" title="Conditional"></span>' : ''}
					</div>
					<div class="preview-step-content">${preview}${preview.length >= 60 ? '...' : ''}</div>
				</div>
			`;

			if (i < this.steps.length - 1) {
				html += `<div class="preview-arrow"><span class="codicon codicon-arrow-down"></span></div>`;
			}
		}

		html += '</div>';
		previewContent.innerHTML = html;
	}

	private clearChain(): void {
		this.steps = [];
		this.chainNameInput.value = '';
		this.renderSteps();
		this.updatePreview();
	}

	private saveChain(): void {
		const name = this.chainNameInput.value.trim();

		if (!name) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('chainNameRequired', 'Chain name is required')
			});
			return;
		}

		if (this.steps.length === 0) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('noStepsToSave', 'Add at least one step to the chain')
			});
			return;
		}

		const chain: IPromptChain = {
			id: `chain-${Date.now()}`,
			name,
			description: '',
			steps: this.steps.map(s => ({
				id: s.id,
				name: s.name,
				promptId: s.promptId,
				promptContent: s.promptContent,
				inputMapping: s.inputMapping,
				condition: s.condition
			})),
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		// In production, save to file
		console.log('Saving chain:', chain);

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('chainSaved', 'Chain saved: {0}', name)
		});
	}

	private runChain(): void {
		if (this.steps.length === 0) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('noStepsToRun', 'Add steps to run the chain')
			});
			return;
		}

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('runningChain', 'Running chain with {0} steps...', this.steps.length)
		});

		// In production, execute the chain
	}

	private exportChain(): void {
		if (this.steps.length === 0) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('noStepsToExport', 'Add steps to export the chain')
			});
			return;
		}

		const chain: IPromptChain = {
			id: `chain-${Date.now()}`,
			name: this.chainNameInput.value || 'Untitled Chain',
			description: '',
			steps: this.steps.map(s => ({
				id: s.id,
				name: s.name,
				promptId: s.promptId,
				promptContent: s.promptContent,
				inputMapping: s.inputMapping,
				condition: s.condition
			})),
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		const json = JSON.stringify(chain, null, 2);

		// Copy to clipboard
		navigator.clipboard.writeText(json).then(() => {
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('chainExported', 'Chain JSON copied to clipboard')
			});
		});
	}

	public loadChain(chain: IPromptChain): void {
		this.chainNameInput.value = chain.name;
		this.steps = chain.steps.map(s => ({ ...s, isExpanded: false }));
		this.renderSteps();
		this.updatePreview();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
