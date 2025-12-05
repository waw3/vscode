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
	IContextItem,
	IContextBudget,
	MODEL_CONTEXT_LIMITS,
	CONTEXT_TYPE_INFO,
	PRIORITY_INFO,
	formatTokens,
	getContextPercentage,
	optimizeContext,
	categorizeItems
} from '../claudeContextStudio.contribution.js';

export class ClaudeContextBudgetView extends ViewPane {

	private container!: HTMLElement;
	private modelSelect!: HTMLSelectElement;
	private budgetMeter!: HTMLElement;
	private itemsContainer!: HTMLElement;
	private budget: IContextBudget;

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

		// Initialize with sample data
		this.budget = {
			modelId: 'claude-sonnet-4-5-20250929',
			maxTokens: MODEL_CONTEXT_LIMITS['claude-sonnet-4-5-20250929'].maxTokens,
			usedTokens: 0,
			reservedTokens: 16000, // Reserve for output
			items: []
		};

		// Add sample items
		this.addSampleItems();
	}

	private addSampleItems(): void {
		this.budget.items = [
			{
				id: '1',
				type: 'file',
				name: 'index.ts',
				path: '/src/index.ts',
				content: '',
				tokens: 2500,
				priority: 'high',
				included: true,
				category: 'Source Files'
			},
			{
				id: '2',
				type: 'file',
				name: 'utils.ts',
				path: '/src/utils.ts',
				content: '',
				tokens: 1200,
				priority: 'medium',
				included: true,
				category: 'Source Files'
			},
			{
				id: '3',
				type: 'git-diff',
				name: 'Uncommitted Changes',
				content: '',
				tokens: 850,
				priority: 'high',
				included: true,
				category: 'Git'
			},
			{
				id: '4',
				type: 'selection',
				name: 'Current Selection',
				content: '',
				tokens: 350,
				priority: 'critical',
				included: true,
				category: 'Editor'
			},
			{
				id: '5',
				type: 'terminal',
				name: 'Recent Errors',
				content: '',
				tokens: 420,
				priority: 'high',
				included: true,
				category: 'Terminal'
			},
			{
				id: '6',
				type: 'documentation',
				name: 'README.md',
				path: '/README.md',
				content: '',
				tokens: 3200,
				priority: 'low',
				included: true,
				category: 'Documentation'
			},
			{
				id: '7',
				type: 'dependency',
				name: 'package.json',
				path: '/package.json',
				content: '',
				tokens: 1800,
				priority: 'medium',
				included: true,
				category: 'Dependencies'
			},
			{
				id: '8',
				type: 'conversation',
				name: 'Previous Messages',
				content: '',
				tokens: 4500,
				priority: 'medium',
				included: true,
				category: 'Conversation'
			}
		];

		this.budget.usedTokens = this.budget.items
			.filter(i => i.included)
			.reduce((sum, i) => sum + i.tokens, 0);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-context-budget-view');

		// Header
		const header = append(this.container, $('.context-budget-header'));
		header.innerHTML = `
			<span class="codicon codicon-dashboard"></span>
			<span>${localize('contextBudget', 'Context Budget')}</span>
		`;

		// Model selector
		const modelSection = append(this.container, $('.context-model-section'));

		const modelLabel = append(modelSection, $('label'));
		modelLabel.textContent = localize('model', 'Model');

		this.modelSelect = append(modelSection, $('select.context-model-select')) as HTMLSelectElement;

		for (const [id, info] of Object.entries(MODEL_CONTEXT_LIMITS)) {
			const option = append(this.modelSelect, $('option')) as HTMLOptionElement;
			option.value = id;
			option.textContent = `${info.name} (${formatTokens(info.maxTokens)} tokens)`;
			if (id === this.budget.modelId) option.selected = true;
		}

		this.modelSelect.onchange = () => this.updateModel();

		// Budget meter
		this.budgetMeter = append(this.container, $('.context-budget-meter'));
		this.renderBudgetMeter();

		// Budget breakdown
		const breakdown = append(this.container, $('.context-budget-breakdown'));
		this.renderBreakdown(breakdown);

		// Toolbar
		const toolbar = append(this.container, $('.context-budget-toolbar'));

		const optimizeBtn = append(toolbar, $('button.context-btn.primary'));
		optimizeBtn.innerHTML = `<span class="codicon codicon-sparkle"></span> ${localize('optimize', 'Optimize')}`;
		optimizeBtn.onclick = () => this.optimizeBudget();

		const clearBtn = append(toolbar, $('button.context-btn'));
		clearBtn.innerHTML = `<span class="codicon codicon-clear-all"></span> ${localize('clear', 'Clear')}`;
		clearBtn.onclick = () => this.clearContext();

		const refreshBtn = append(toolbar, $('button.context-btn'));
		refreshBtn.innerHTML = `<span class="codicon codicon-refresh"></span>`;
		refreshBtn.title = localize('refresh', 'Refresh');
		refreshBtn.onclick = () => this.refresh();

		// Items section
		const itemsSection = append(this.container, $('.context-items-section'));

		const itemsHeader = append(itemsSection, $('.context-section-header'));
		itemsHeader.innerHTML = `
			<span class="codicon codicon-list-tree"></span>
			<span>${localize('contextItems', 'Context Items')}</span>
			<span class="item-count">${this.budget.items.length} items</span>
		`;

		this.itemsContainer = append(itemsSection, $('.context-items-list'));
		this.renderItems();
	}

	private renderBudgetMeter(): void {
		clearNode(this.budgetMeter);

		const modelInfo = MODEL_CONTEXT_LIMITS[this.budget.modelId];
		const available = modelInfo.maxTokens - this.budget.reservedTokens;
		const percentage = getContextPercentage(this.budget.usedTokens, available);

		// Determine status color
		let statusClass = 'healthy';
		if (percentage > 90) statusClass = 'critical';
		else if (percentage > 75) statusClass = 'warning';

		this.budgetMeter.innerHTML = `
			<div class="meter-header">
				<span class="meter-title">${localize('tokenUsage', 'Token Usage')}</span>
				<span class="meter-value ${statusClass}">${formatTokens(this.budget.usedTokens)} / ${formatTokens(available)}</span>
			</div>
			<div class="meter-bar">
				<div class="meter-fill ${statusClass}" style="width: ${Math.min(percentage, 100)}%"></div>
				<div class="meter-reserved" style="width: ${getContextPercentage(this.budget.reservedTokens, modelInfo.maxTokens)}%"></div>
			</div>
			<div class="meter-footer">
				<span class="meter-percentage ${statusClass}">${percentage}% used</span>
				<span class="meter-remaining">${formatTokens(available - this.budget.usedTokens)} available</span>
			</div>
			<div class="meter-legend">
				<span class="legend-item"><span class="legend-dot used"></span> Used</span>
				<span class="legend-item"><span class="legend-dot reserved"></span> Reserved for output</span>
				<span class="legend-item"><span class="legend-dot available"></span> Available</span>
			</div>
		`;
	}

	private renderBreakdown(container: HTMLElement): void {
		const categories = categorizeItems(this.budget.items.filter(i => i.included));

		let html = '<div class="breakdown-title">' + localize('breakdown', 'Token Breakdown') + '</div>';
		html += '<div class="breakdown-bars">';

		const totalUsed = this.budget.usedTokens;

		for (const [category, items] of categories) {
			const categoryTokens = items.reduce((sum, i) => sum + i.tokens, 0);
			const percentage = totalUsed > 0 ? (categoryTokens / totalUsed) * 100 : 0;

			// Get color from first item type
			const typeInfo = CONTEXT_TYPE_INFO[items[0].type];

			html += `
				<div class="breakdown-item">
					<div class="breakdown-label">
						<span class="codicon codicon-${typeInfo.icon}" style="color: ${typeInfo.color}"></span>
						<span>${category}</span>
					</div>
					<div class="breakdown-bar-wrapper">
						<div class="breakdown-bar" style="width: ${percentage}%; background: ${typeInfo.color}"></div>
					</div>
					<span class="breakdown-value">${formatTokens(categoryTokens)}</span>
				</div>
			`;
		}

		html += '</div>';
		container.innerHTML = html;
	}

	private renderItems(): void {
		clearNode(this.itemsContainer);

		if (this.budget.items.length === 0) {
			const empty = append(this.itemsContainer, $('.context-items-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-layers"></span>
				<span>${localize('noItems', 'No context items')}</span>
				<span class="hint">${localize('addItemsHint', 'Add files or selections to context')}</span>
			`;
			return;
		}

		// Group by category
		const categories = categorizeItems(this.budget.items);

		for (const [category, items] of categories) {
			this.renderCategory(category, items);
		}
	}

	private renderCategory(category: string, items: IContextItem[]): void {
		const categoryTokens = items.reduce((sum, i) => sum + (i.included ? i.tokens : 0), 0);
		const includedCount = items.filter(i => i.included).length;

		const categoryEl = append(this.itemsContainer, $('.context-category'));

		const categoryHeader = append(categoryEl, $('.context-category-header'));
		categoryHeader.innerHTML = `
			<span class="category-name">${category}</span>
			<span class="category-stats">${includedCount}/${items.length} items · ${formatTokens(categoryTokens)}</span>
		`;

		const categoryItems = append(categoryEl, $('.context-category-items'));

		for (const item of items) {
			this.renderItem(categoryItems, item);
		}
	}

	private renderItem(container: HTMLElement, item: IContextItem): void {
		const itemEl = append(container, $('.context-item'));
		if (!item.included) {
			itemEl.classList.add('excluded');
		}

		const typeInfo = CONTEXT_TYPE_INFO[item.type];
		const priorityInfo = PRIORITY_INFO[item.priority];

		// Checkbox
		const checkbox = append(itemEl, $('input.context-item-checkbox')) as HTMLInputElement;
		checkbox.type = 'checkbox';
		checkbox.checked = item.included;
		checkbox.onchange = () => this.toggleItem(item.id);

		// Icon
		const icon = append(itemEl, $('.context-item-icon'));
		icon.innerHTML = `<span class="codicon codicon-${typeInfo.icon}" style="color: ${typeInfo.color}"></span>`;

		// Info
		const info = append(itemEl, $('.context-item-info'));

		const name = append(info, $('.context-item-name'));
		name.textContent = item.name;

		if (item.path) {
			const path = append(info, $('.context-item-path'));
			path.textContent = item.path;
		}

		// Meta
		const meta = append(itemEl, $('.context-item-meta'));

		const tokens = append(meta, $('.context-item-tokens'));
		tokens.textContent = formatTokens(item.tokens);

		const priority = append(meta, $('.context-item-priority'));
		priority.textContent = priorityInfo.name;
		priority.style.color = priorityInfo.color;

		// Actions
		const actions = append(itemEl, $('.context-item-actions'));

		const priorityBtn = append(actions, $('button.context-item-action'));
		priorityBtn.innerHTML = '<span class="codicon codicon-arrow-up"></span>';
		priorityBtn.title = localize('increasePriority', 'Increase priority');
		priorityBtn.onclick = (e) => {
			e.stopPropagation();
			this.changePriority(item.id, 'up');
		};

		const removeBtn = append(actions, $('button.context-item-action.danger'));
		removeBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
		removeBtn.title = localize('remove', 'Remove');
		removeBtn.onclick = (e) => {
			e.stopPropagation();
			this.removeItem(item.id);
		};
	}

	private updateModel(): void {
		this.budget.modelId = this.modelSelect.value;
		const modelInfo = MODEL_CONTEXT_LIMITS[this.budget.modelId];
		this.budget.maxTokens = modelInfo.maxTokens;
		this.budget.reservedTokens = modelInfo.outputTokens;

		this.renderBudgetMeter();
		this.renderItems();
	}

	private toggleItem(id: string): void {
		const item = this.budget.items.find(i => i.id === id);
		if (item) {
			item.included = !item.included;
			this.recalculateUsage();
			this.renderBudgetMeter();
			this.renderItems();
		}
	}

	private changePriority(id: string, direction: 'up' | 'down'): void {
		const item = this.budget.items.find(i => i.id === id);
		if (!item) return;

		const priorities: Array<typeof item.priority> = ['optional', 'low', 'medium', 'high', 'critical'];
		const currentIndex = priorities.indexOf(item.priority);

		if (direction === 'up' && currentIndex < priorities.length - 1) {
			item.priority = priorities[currentIndex + 1];
		} else if (direction === 'down' && currentIndex > 0) {
			item.priority = priorities[currentIndex - 1];
		}

		this.renderItems();
	}

	private removeItem(id: string): void {
		this.budget.items = this.budget.items.filter(i => i.id !== id);
		this.recalculateUsage();
		this.renderBudgetMeter();
		this.renderItems();

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('itemRemoved', 'Item removed from context')
		});
	}

	private recalculateUsage(): void {
		this.budget.usedTokens = this.budget.items
			.filter(i => i.included)
			.reduce((sum, i) => sum + i.tokens, 0);
	}

	private optimizeBudget(): void {
		const modelInfo = MODEL_CONTEXT_LIMITS[this.budget.modelId];
		this.budget.items = optimizeContext(
			this.budget.items,
			modelInfo.maxTokens,
			this.budget.reservedTokens
		);

		this.recalculateUsage();
		this.renderBudgetMeter();
		this.renderItems();

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('optimized', 'Context optimized for maximum efficiency')
		});
	}

	private clearContext(): void {
		for (const item of this.budget.items) {
			item.included = false;
		}
		this.recalculateUsage();
		this.renderBudgetMeter();
		this.renderItems();

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('cleared', 'Context cleared')
		});
	}

	private refresh(): void {
		this.renderBudgetMeter();
		this.renderItems();

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('refreshed', 'Context refreshed')
		});
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
