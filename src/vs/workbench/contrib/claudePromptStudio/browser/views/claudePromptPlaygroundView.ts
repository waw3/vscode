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
import { BUILTIN_VARIABLES, expandVariables, estimateTokens } from '../claudePromptStudio.contribution.js';

interface IPlaygroundResult {
	id: string;
	prompt: string;
	response: string;
	tokens: { input: number; output: number };
	latency: number;
	timestamp: number;
	model: string;
}

export class ClaudePromptPlaygroundView extends ViewPane {

	private container!: HTMLElement;
	private promptInput!: HTMLTextAreaElement;
	private variablesPanel!: HTMLElement;
	private resultsContainer!: HTMLElement;
	private comparisonMode: boolean = false;
	private promptA: string = '';
	private promptB: string = '';
	private variableValues: Record<string, string> = {};
	private results: IPlaygroundResult[] = [];
	private selectedModel: string = 'claude-sonnet-4-5-20250929';

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

		// Initialize sample variable values
		this.variableValues = {
			'SELECTION': 'function example() {\n  return "Hello";\n}',
			'FILE_NAME': 'example.ts',
			'LANGUAGE': 'typescript'
		};
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-prompt-playground-view');

		// Header
		const header = append(this.container, $('.playground-header'));
		header.innerHTML = `
			<span class="codicon codicon-beaker"></span>
			<span>${localize('playground', 'Prompt Playground')}</span>
		`;

		// Mode toggle
		const modeToggle = append(this.container, $('.playground-mode-toggle'));

		const singleBtn = append(modeToggle, $('button.mode-btn.active'));
		singleBtn.innerHTML = `<span class="codicon codicon-file"></span> ${localize('single', 'Single')}`;
		singleBtn.onclick = () => this.setMode(false, singleBtn, compareBtn);

		const compareBtn = append(modeToggle, $('button.mode-btn'));
		compareBtn.innerHTML = `<span class="codicon codicon-split-horizontal"></span> ${localize('compare', 'A/B Compare')}`;
		compareBtn.onclick = () => this.setMode(true, singleBtn, compareBtn);

		// Model selector
		const modelSection = append(this.container, $('.playground-model-section'));
		const modelLabel = append(modelSection, $('label'));
		modelLabel.textContent = localize('model', 'Model');

		const modelSelect = append(modelSection, $('select.playground-model-select')) as HTMLSelectElement;
		const models = [
			{ id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
			{ id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4' },
			{ id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
			{ id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' }
		];

		for (const model of models) {
			const option = append(modelSelect, $('option')) as HTMLOptionElement;
			option.value = model.id;
			option.textContent = model.name;
		}

		modelSelect.onchange = () => {
			this.selectedModel = modelSelect.value;
		};

		// Prompt input section
		const inputSection = append(this.container, $('.playground-input-section'));

		// Single prompt input
		const promptGroup = append(inputSection, $('.playground-prompt-group'));
		promptGroup.id = 'single-prompt';

		const promptLabel = append(promptGroup, $('label'));
		promptLabel.textContent = localize('prompt', 'Prompt');

		this.promptInput = append(promptGroup, $('textarea.playground-prompt-input')) as HTMLTextAreaElement;
		this.promptInput.placeholder = localize('promptPlaceholder', 'Enter your prompt here...\n\nUse {{VARIABLE}} syntax for dynamic content.');
		this.promptInput.oninput = () => this.updateStats();

		// A/B comparison inputs (hidden by default)
		const comparisonGroup = append(inputSection, $('.playground-comparison-group'));
		comparisonGroup.id = 'comparison-prompts';
		comparisonGroup.style.display = 'none';

		// Prompt A
		const promptAGroup = append(comparisonGroup, $('.comparison-prompt'));
		const labelA = append(promptAGroup, $('label'));
		labelA.innerHTML = '<span class="variant-badge a">A</span> Prompt Variant A';
		const inputA = append(promptAGroup, $('textarea.playground-prompt-input')) as HTMLTextAreaElement;
		inputA.placeholder = localize('variantA', 'Enter variant A...');
		inputA.oninput = () => {
			this.promptA = inputA.value;
			this.updateStats();
		};

		// Prompt B
		const promptBGroup = append(comparisonGroup, $('.comparison-prompt'));
		const labelB = append(promptBGroup, $('label'));
		labelB.innerHTML = '<span class="variant-badge b">B</span> Prompt Variant B';
		const inputB = append(promptBGroup, $('textarea.playground-prompt-input')) as HTMLTextAreaElement;
		inputB.placeholder = localize('variantB', 'Enter variant B...');
		inputB.oninput = () => {
			this.promptB = inputB.value;
			this.updateStats();
		};

		// Variables panel
		this.variablesPanel = append(this.container, $('.playground-variables-panel'));
		this.renderVariablesPanel();

		// Stats bar
		const statsBar = append(this.container, $('.playground-stats-bar'));
		statsBar.innerHTML = `
			<span class="stat"><span class="codicon codicon-symbol-numeric"></span> <span id="token-count">0</span> tokens</span>
			<span class="stat"><span class="codicon codicon-credit-card"></span> ~$<span id="cost-estimate">0.0000</span></span>
		`;

		// Action buttons
		const actions = append(this.container, $('.playground-actions'));

		const runBtn = append(actions, $('button.playground-btn.primary'));
		runBtn.innerHTML = `<span class="codicon codicon-play"></span> ${localize('run', 'Run')}`;
		runBtn.onclick = () => this.runPrompt();

		const runBothBtn = append(actions, $('button.playground-btn'));
		runBothBtn.id = 'run-both-btn';
		runBothBtn.innerHTML = `<span class="codicon codicon-run-all"></span> ${localize('runBoth', 'Run Both')}`;
		runBothBtn.onclick = () => this.runComparison();
		runBothBtn.style.display = 'none';

		const clearBtn = append(actions, $('button.playground-btn'));
		clearBtn.innerHTML = `<span class="codicon codicon-clear-all"></span> ${localize('clear', 'Clear')}`;
		clearBtn.onclick = () => this.clearResults();

		const historyBtn = append(actions, $('button.playground-btn'));
		historyBtn.innerHTML = `<span class="codicon codicon-history"></span> ${localize('history', 'History')}`;
		historyBtn.onclick = () => this.showHistory();

		// Results container
		this.resultsContainer = append(this.container, $('.playground-results'));
		this.renderResults();
	}

	private setMode(comparison: boolean, singleBtn: HTMLButtonElement, compareBtn: HTMLButtonElement): void {
		this.comparisonMode = comparison;

		singleBtn.classList.toggle('active', !comparison);
		compareBtn.classList.toggle('active', comparison);

		const singlePrompt = this.container.querySelector('#single-prompt') as HTMLElement;
		const comparisonPrompts = this.container.querySelector('#comparison-prompts') as HTMLElement;
		const runBothBtn = this.container.querySelector('#run-both-btn') as HTMLElement;

		if (comparison) {
			singlePrompt.style.display = 'none';
			comparisonPrompts.style.display = 'flex';
			runBothBtn.style.display = 'flex';
		} else {
			singlePrompt.style.display = 'block';
			comparisonPrompts.style.display = 'none';
			runBothBtn.style.display = 'none';
		}
	}

	private renderVariablesPanel(): void {
		clearNode(this.variablesPanel);

		const header = append(this.variablesPanel, $('.variables-header'));
		header.innerHTML = `
			<span class="codicon codicon-symbol-variable"></span>
			<span>${localize('testVariables', 'Test Variables')}</span>
			<button class="expand-btn"><span class="codicon codicon-chevron-down"></span></button>
		`;

		const content = append(this.variablesPanel, $('.variables-content'));

		// Show commonly used variables
		const commonVars = BUILTIN_VARIABLES.filter(v =>
			['SELECTION', 'FILE_NAME', 'LANGUAGE', 'FILE_PATH'].includes(v.name)
		);

		for (const variable of commonVars) {
			const varRow = append(content, $('.variable-row'));

			const label = append(varRow, $('label'));
			label.textContent = `{{${variable.name}}}`;
			label.title = variable.description;

			const input = append(varRow, $('input.variable-input')) as HTMLInputElement;
			input.value = this.variableValues[variable.name] || '';
			input.placeholder = variable.description;
			input.onchange = () => {
				this.variableValues[variable.name] = input.value;
				this.updateStats();
			};
		}

		// Toggle expand
		header.querySelector('.expand-btn')?.addEventListener('click', () => {
			content.classList.toggle('collapsed');
			const icon = header.querySelector('.codicon');
			icon?.classList.toggle('codicon-chevron-down');
			icon?.classList.toggle('codicon-chevron-right');
		});
	}

	private updateStats(): void {
		const prompt = this.comparisonMode
			? this.promptA + this.promptB
			: this.promptInput.value;

		const expanded = expandVariables(prompt, this.variableValues);
		const tokens = estimateTokens(expanded);

		const tokenCount = this.container.querySelector('#token-count');
		const costEstimate = this.container.querySelector('#cost-estimate');

		if (tokenCount) {
			tokenCount.textContent = String(tokens);
		}

		if (costEstimate) {
			const cost = (tokens / 1000) * 0.003;
			costEstimate.textContent = cost.toFixed(4);
		}
	}

	private async runPrompt(): Promise<void> {
		const prompt = this.promptInput.value.trim();

		if (!prompt) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('enterPrompt', 'Please enter a prompt')
			});
			return;
		}

		const expanded = expandVariables(prompt, this.variableValues);

		// Simulate API call
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('running', 'Running prompt...')
		});

		// Mock result for demo
		const result: IPlaygroundResult = {
			id: `result-${Date.now()}`,
			prompt: expanded,
			response: this.generateMockResponse(expanded),
			tokens: {
				input: estimateTokens(expanded),
				output: Math.floor(Math.random() * 500) + 100
			},
			latency: Math.floor(Math.random() * 2000) + 500,
			timestamp: Date.now(),
			model: this.selectedModel
		};

		this.results.unshift(result);
		this.renderResults();
	}

	private async runComparison(): Promise<void> {
		if (!this.promptA.trim() || !this.promptB.trim()) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('enterBothPrompts', 'Please enter both prompt variants')
			});
			return;
		}

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('runningComparison', 'Running A/B comparison...')
		});

		const expandedA = expandVariables(this.promptA, this.variableValues);
		const expandedB = expandVariables(this.promptB, this.variableValues);

		// Mock results
		const resultA: IPlaygroundResult = {
			id: `result-a-${Date.now()}`,
			prompt: expandedA,
			response: this.generateMockResponse(expandedA),
			tokens: {
				input: estimateTokens(expandedA),
				output: Math.floor(Math.random() * 500) + 100
			},
			latency: Math.floor(Math.random() * 2000) + 500,
			timestamp: Date.now(),
			model: this.selectedModel
		};

		const resultB: IPlaygroundResult = {
			id: `result-b-${Date.now()}`,
			prompt: expandedB,
			response: this.generateMockResponse(expandedB),
			tokens: {
				input: estimateTokens(expandedB),
				output: Math.floor(Math.random() * 500) + 100
			},
			latency: Math.floor(Math.random() * 2000) + 500,
			timestamp: Date.now(),
			model: this.selectedModel
		};

		// Show comparison results
		this.renderComparisonResults(resultA, resultB);
	}

	private generateMockResponse(prompt: string): string {
		// Generate a mock response based on prompt content
		if (prompt.toLowerCase().includes('explain')) {
			return 'This code demonstrates a basic function pattern in TypeScript. The function takes no parameters and returns a simple string value. This pattern is commonly used for greeting messages, status indicators, or placeholder implementations.';
		} else if (prompt.toLowerCase().includes('review')) {
			return '**Code Review Summary:**\n\n1. **Strengths:**\n   - Clean, simple implementation\n   - Good use of arrow function syntax\n\n2. **Suggestions:**\n   - Consider adding type annotations\n   - Add JSDoc comments for documentation\n   - Consider making the return value configurable';
		} else {
			return 'Based on the provided context, I can help you with this code. The implementation looks straightforward. Would you like me to suggest any improvements or explain specific parts in more detail?';
		}
	}

	private renderResults(): void {
		clearNode(this.resultsContainer);

		if (this.results.length === 0) {
			const empty = append(this.resultsContainer, $('.playground-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-beaker"></span>
				<span>${localize('noResults', 'No results yet')}</span>
				<span class="hint">${localize('runPromptHint', 'Run a prompt to see results')}</span>
			`;
			return;
		}

		const header = append(this.resultsContainer, $('.results-header'));
		header.innerHTML = `<span class="codicon codicon-output"></span> ${localize('results', 'Results')}`;

		for (const result of this.results.slice(0, 5)) {
			this.renderResult(result);
		}
	}

	private renderResult(result: IPlaygroundResult): void {
		const resultEl = append(this.resultsContainer, $('.playground-result'));

		// Result header
		const header = append(resultEl, $('.result-header'));
		header.innerHTML = `
			<span class="result-model">${result.model.split('-').slice(0, 2).join(' ')}</span>
			<span class="result-stats">
				<span><span class="codicon codicon-arrow-up"></span> ${result.tokens.input}</span>
				<span><span class="codicon codicon-arrow-down"></span> ${result.tokens.output}</span>
				<span><span class="codicon codicon-clock"></span> ${result.latency}ms</span>
			</span>
		`;

		// Prompt preview
		const promptPreview = append(resultEl, $('.result-prompt'));
		promptPreview.innerHTML = `<strong>${localize('prompt', 'Prompt')}:</strong> ${this.escapeHtml(result.prompt.substring(0, 100))}${result.prompt.length > 100 ? '...' : ''}`;

		// Response
		const response = append(resultEl, $('.result-response'));
		response.innerHTML = `<pre>${this.escapeHtml(result.response)}</pre>`;

		// Actions
		const actions = append(resultEl, $('.result-actions'));

		const copyBtn = append(actions, $('button.result-action'));
		copyBtn.innerHTML = '<span class="codicon codicon-copy"></span>';
		copyBtn.title = localize('copyResponse', 'Copy response');
		copyBtn.onclick = () => {
			navigator.clipboard.writeText(result.response);
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('copied', 'Response copied to clipboard')
			});
		};

		const useBtn = append(actions, $('button.result-action'));
		useBtn.innerHTML = '<span class="codicon codicon-check"></span>';
		useBtn.title = localize('usePrompt', 'Use this prompt');
		useBtn.onclick = () => {
			this.promptInput.value = result.prompt;
			this.updateStats();
		};

		const deleteBtn = append(actions, $('button.result-action'));
		deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
		deleteBtn.title = localize('delete', 'Delete');
		deleteBtn.onclick = () => {
			const idx = this.results.findIndex(r => r.id === result.id);
			if (idx !== -1) {
				this.results.splice(idx, 1);
				this.renderResults();
			}
		};
	}

	private renderComparisonResults(resultA: IPlaygroundResult, resultB: IPlaygroundResult): void {
		clearNode(this.resultsContainer);

		const header = append(this.resultsContainer, $('.comparison-header'));
		header.innerHTML = `<span class="codicon codicon-split-horizontal"></span> ${localize('comparisonResults', 'A/B Comparison Results')}`;

		const comparison = append(this.resultsContainer, $('.comparison-container'));

		// Result A
		const colA = append(comparison, $('.comparison-column'));
		const headerA = append(colA, $('.column-header.variant-a'));
		headerA.innerHTML = '<span class="variant-badge a">A</span> Variant A';

		const statsA = append(colA, $('.column-stats'));
		statsA.innerHTML = `
			<span><span class="codicon codicon-arrow-up"></span> ${resultA.tokens.input} input</span>
			<span><span class="codicon codicon-arrow-down"></span> ${resultA.tokens.output} output</span>
			<span><span class="codicon codicon-clock"></span> ${resultA.latency}ms</span>
		`;

		const responseA = append(colA, $('.column-response'));
		responseA.innerHTML = `<pre>${this.escapeHtml(resultA.response)}</pre>`;

		// Result B
		const colB = append(comparison, $('.comparison-column'));
		const headerB = append(colB, $('.column-header.variant-b'));
		headerB.innerHTML = '<span class="variant-badge b">B</span> Variant B';

		const statsB = append(colB, $('.column-stats'));
		statsB.innerHTML = `
			<span><span class="codicon codicon-arrow-up"></span> ${resultB.tokens.input} input</span>
			<span><span class="codicon codicon-arrow-down"></span> ${resultB.tokens.output} output</span>
			<span><span class="codicon codicon-clock"></span> ${resultB.latency}ms</span>
		`;

		const responseB = append(colB, $('.column-response'));
		responseB.innerHTML = `<pre>${this.escapeHtml(resultB.response)}</pre>`;

		// Comparison summary
		const summary = append(this.resultsContainer, $('.comparison-summary'));

		const tokenDiff = resultA.tokens.output - resultB.tokens.output;
		const latencyDiff = resultA.latency - resultB.latency;

		summary.innerHTML = `
			<div class="summary-item">
				<span class="summary-label">${localize('outputTokens', 'Output Tokens')}</span>
				<span class="summary-value ${tokenDiff < 0 ? 'better-a' : tokenDiff > 0 ? 'better-b' : ''}">
					${tokenDiff === 0 ? 'Equal' : tokenDiff < 0 ? `A: ${Math.abs(tokenDiff)} fewer` : `B: ${Math.abs(tokenDiff)} fewer`}
				</span>
			</div>
			<div class="summary-item">
				<span class="summary-label">${localize('latency', 'Latency')}</span>
				<span class="summary-value ${latencyDiff < 0 ? 'better-a' : latencyDiff > 0 ? 'better-b' : ''}">
					${latencyDiff === 0 ? 'Equal' : latencyDiff < 0 ? `A: ${Math.abs(latencyDiff)}ms faster` : `B: ${Math.abs(latencyDiff)}ms faster`}
				</span>
			</div>
		`;

		// Vote buttons
		const voteSection = append(this.resultsContainer, $('.vote-section'));
		voteSection.innerHTML = `<span>${localize('whichBetter', 'Which response is better?')}</span>`;

		const voteA = append(voteSection, $('button.vote-btn'));
		voteA.innerHTML = '<span class="variant-badge a">A</span>';
		voteA.onclick = () => this.recordVote('A');

		const voteTie = append(voteSection, $('button.vote-btn'));
		voteTie.textContent = 'Tie';
		voteTie.onclick = () => this.recordVote('Tie');

		const voteB = append(voteSection, $('button.vote-btn'));
		voteB.innerHTML = '<span class="variant-badge b">B</span>';
		voteB.onclick = () => this.recordVote('B');
	}

	private recordVote(winner: 'A' | 'B' | 'Tie'): void {
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('voteRecorded', 'Vote recorded: {0}', winner)
		});
	}

	private clearResults(): void {
		this.results = [];
		this.renderResults();
	}

	private showHistory(): void {
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('historyCount', 'History: {0} previous runs', this.results.length)
		});
	}

	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	public loadPrompt(content: string): void {
		this.promptInput.value = content;
		this.updateStats();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
