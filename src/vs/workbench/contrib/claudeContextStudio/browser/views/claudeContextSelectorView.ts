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
	ContextItemType,
	ContextPriority,
	CONTEXT_TYPE_INFO,
	PRIORITY_INFO,
	SMART_CONTEXT_RULES,
	formatTokens,
	estimateTokens
} from '../claudeContextStudio.contribution.js';

interface ISuggestion {
	id: string;
	name: string;
	description: string;
	type: ContextItemType;
	priority: ContextPriority;
	tokens: number;
	relevance: number;
	source: string;
	selected: boolean;
}

interface IContextProfile {
	id: string;
	name: string;
	description: string;
	icon: string;
	types: ContextItemType[];
}

export class ClaudeContextSelectorView extends ViewPane {

	private container!: HTMLElement;
	private suggestionsContainer!: HTMLElement;
	private quickAddContainer!: HTMLElement;
	private suggestions: ISuggestion[] = [];
	private activeProfile: string = 'balanced';

	private readonly profiles: IContextProfile[] = [
		{
			id: 'minimal',
			name: 'Minimal',
			description: 'Just the essentials',
			icon: 'target',
			types: ['selection', 'file']
		},
		{
			id: 'balanced',
			name: 'Balanced',
			description: 'Good context coverage',
			icon: 'dashboard',
			types: ['selection', 'file', 'git-diff', 'terminal']
		},
		{
			id: 'comprehensive',
			name: 'Comprehensive',
			description: 'Full project context',
			icon: 'repo',
			types: ['selection', 'file', 'git-diff', 'terminal', 'dependency', 'documentation']
		},
		{
			id: 'debugging',
			name: 'Debugging',
			description: 'Focus on errors and logs',
			icon: 'bug',
			types: ['selection', 'terminal', 'git-diff', 'file']
		}
	];

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

		this.generateSuggestions();
	}

	private generateSuggestions(): void {
		// Generate smart suggestions based on rules
		this.suggestions = [
			{
				id: '1',
				name: 'Current Selection',
				description: 'Selected code in editor',
				type: 'selection',
				priority: 'critical',
				tokens: 450,
				relevance: 100,
				source: 'Active Editor',
				selected: true
			},
			{
				id: '2',
				name: 'index.ts',
				description: '/src/index.ts - Main entry file',
				type: 'file',
				priority: 'high',
				tokens: 2800,
				relevance: 95,
				source: 'Active File',
				selected: true
			},
			{
				id: '3',
				name: 'Uncommitted Changes',
				description: '3 files changed, +45 -12 lines',
				type: 'git-diff',
				priority: 'high',
				tokens: 920,
				relevance: 90,
				source: 'Git',
				selected: true
			},
			{
				id: '4',
				name: 'Terminal Errors',
				description: '2 TypeScript errors detected',
				type: 'terminal',
				priority: 'high',
				tokens: 380,
				relevance: 88,
				source: 'Terminal',
				selected: true
			},
			{
				id: '5',
				name: 'utils.ts',
				description: '/src/utils.ts - Related module',
				type: 'file',
				priority: 'medium',
				tokens: 1500,
				relevance: 75,
				source: 'Import Analysis',
				selected: false
			},
			{
				id: '6',
				name: 'types.ts',
				description: '/src/types.ts - Type definitions',
				type: 'file',
				priority: 'medium',
				tokens: 850,
				relevance: 70,
				source: 'Import Analysis',
				selected: false
			},
			{
				id: '7',
				name: 'package.json',
				description: 'Project dependencies',
				type: 'dependency',
				priority: 'low',
				tokens: 1200,
				relevance: 50,
				source: 'Project',
				selected: false
			},
			{
				id: '8',
				name: 'README.md',
				description: 'Project documentation',
				type: 'documentation',
				priority: 'optional',
				tokens: 3400,
				relevance: 30,
				source: 'Project',
				selected: false
			}
		];
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-context-selector-view');

		// Header
		const header = append(this.container, $('.context-selector-header'));
		header.innerHTML = `
			<span class="codicon codicon-sparkle"></span>
			<span>${localize('smartSelector', 'Smart Context Selector')}</span>
		`;

		// Context profiles
		const profilesSection = append(this.container, $('.context-profiles-section'));

		const profilesHeader = append(profilesSection, $('.context-section-header'));
		profilesHeader.innerHTML = `
			<span class="codicon codicon-symbol-interface"></span>
			<span>${localize('profiles', 'Context Profiles')}</span>
		`;

		const profilesGrid = append(profilesSection, $('.context-profiles-grid'));
		this.renderProfiles(profilesGrid);

		// Quick add section
		const quickAddSection = append(this.container, $('.context-quick-add-section'));

		const quickAddHeader = append(quickAddSection, $('.context-section-header'));
		quickAddHeader.innerHTML = `
			<span class="codicon codicon-add"></span>
			<span>${localize('quickAdd', 'Quick Add')}</span>
		`;

		this.quickAddContainer = append(quickAddSection, $('.context-quick-add-grid'));
		this.renderQuickAdd();

		// Suggestions section
		const suggestionsSection = append(this.container, $('.context-suggestions-section'));

		const suggestionsHeader = append(suggestionsSection, $('.context-section-header'));
		suggestionsHeader.innerHTML = `
			<span class="codicon codicon-lightbulb"></span>
			<span>${localize('suggestions', 'Smart Suggestions')}</span>
			<span class="suggestion-count">${this.suggestions.length} items</span>
		`;

		// Toolbar
		const toolbar = append(suggestionsSection, $('.context-suggestions-toolbar'));

		const selectAllBtn = append(toolbar, $('button.context-btn'));
		selectAllBtn.textContent = localize('selectAll', 'Select All');
		selectAllBtn.onclick = () => this.selectAll();

		const selectNoneBtn = append(toolbar, $('button.context-btn'));
		selectNoneBtn.textContent = localize('selectNone', 'Select None');
		selectNoneBtn.onclick = () => this.selectNone();

		const addSelectedBtn = append(toolbar, $('button.context-btn.primary'));
		addSelectedBtn.innerHTML = `<span class="codicon codicon-add"></span> ${localize('addSelected', 'Add Selected')}`;
		addSelectedBtn.onclick = () => this.addSelected();

		this.suggestionsContainer = append(suggestionsSection, $('.context-suggestions-list'));
		this.renderSuggestions();

		// Rules section
		const rulesSection = append(this.container, $('.context-rules-section'));

		const rulesHeader = append(rulesSection, $('.context-section-header'));
		rulesHeader.innerHTML = `
			<span class="codicon codicon-settings-gear"></span>
			<span>${localize('smartRules', 'Smart Rules')}</span>
		`;

		const rulesList = append(rulesSection, $('.context-rules-list'));
		this.renderRules(rulesList);
	}

	private renderProfiles(container: HTMLElement): void {
		for (const profile of this.profiles) {
			const profileCard = append(container, $('.context-profile-card'));
			if (profile.id === this.activeProfile) {
				profileCard.classList.add('active');
			}

			profileCard.innerHTML = `
				<span class="codicon codicon-${profile.icon}"></span>
				<div class="profile-info">
					<div class="profile-name">${profile.name}</div>
					<div class="profile-desc">${profile.description}</div>
				</div>
			`;

			profileCard.onclick = () => this.selectProfile(profile.id);
		}
	}

	private selectProfile(profileId: string): void {
		this.activeProfile = profileId;
		const profile = this.profiles.find(p => p.id === profileId);

		if (profile) {
			// Update suggestions based on profile
			for (const suggestion of this.suggestions) {
				suggestion.selected = profile.types.includes(suggestion.type);
			}

			// Re-render
			const profileCards = this.container.querySelectorAll('.context-profile-card');
			profileCards.forEach((card, index) => {
				card.classList.toggle('active', this.profiles[index].id === profileId);
			});

			this.renderSuggestions();

			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('profileApplied', 'Applied profile: {0}', profile.name)
			});
		}
	}

	private renderQuickAdd(): void {
		const quickAddTypes: Array<{ type: ContextItemType; label: string }> = [
			{ type: 'file', label: 'File' },
			{ type: 'selection', label: 'Selection' },
			{ type: 'folder', label: 'Folder' },
			{ type: 'symbol', label: 'Symbol' },
			{ type: 'terminal', label: 'Terminal' },
			{ type: 'git-diff', label: 'Git Diff' }
		];

		for (const { type, label } of quickAddTypes) {
			const typeInfo = CONTEXT_TYPE_INFO[type];
			const btn = append(this.quickAddContainer, $('button.context-quick-add-btn'));
			btn.innerHTML = `
				<span class="codicon codicon-${typeInfo.icon}" style="color: ${typeInfo.color}"></span>
				<span>${label}</span>
			`;
			btn.onclick = () => this.quickAdd(type);
		}
	}

	private quickAdd(type: ContextItemType): void {
		const typeInfo = CONTEXT_TYPE_INFO[type];
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('addingType', 'Adding {0} to context...', typeInfo.name)
		});
	}

	private renderSuggestions(): void {
		clearNode(this.suggestionsContainer);

		// Sort by relevance
		const sorted = [...this.suggestions].sort((a, b) => b.relevance - a.relevance);

		for (const suggestion of sorted) {
			this.renderSuggestion(suggestion);
		}

		// Update selected count
		const selectedCount = this.suggestions.filter(s => s.selected).length;
		const totalTokens = this.suggestions
			.filter(s => s.selected)
			.reduce((sum, s) => sum + s.tokens, 0);

		const countEl = this.container.querySelector('.suggestion-count');
		if (countEl) {
			countEl.textContent = `${selectedCount} selected · ${formatTokens(totalTokens)}`;
		}
	}

	private renderSuggestion(suggestion: ISuggestion): void {
		const suggestionEl = append(this.suggestionsContainer, $('.context-suggestion'));
		if (suggestion.selected) {
			suggestionEl.classList.add('selected');
		}

		const typeInfo = CONTEXT_TYPE_INFO[suggestion.type];
		const priorityInfo = PRIORITY_INFO[suggestion.priority];

		// Checkbox
		const checkbox = append(suggestionEl, $('input.suggestion-checkbox')) as HTMLInputElement;
		checkbox.type = 'checkbox';
		checkbox.checked = suggestion.selected;
		checkbox.onchange = () => {
			suggestion.selected = checkbox.checked;
			suggestionEl.classList.toggle('selected', suggestion.selected);
			this.renderSuggestions();
		};

		// Icon
		const icon = append(suggestionEl, $('.suggestion-icon'));
		icon.innerHTML = `<span class="codicon codicon-${typeInfo.icon}" style="color: ${typeInfo.color}"></span>`;

		// Info
		const info = append(suggestionEl, $('.suggestion-info'));

		const name = append(info, $('.suggestion-name'));
		name.textContent = suggestion.name;

		const desc = append(info, $('.suggestion-desc'));
		desc.textContent = suggestion.description;

		// Meta
		const meta = append(suggestionEl, $('.suggestion-meta'));

		const source = append(meta, $('.suggestion-source'));
		source.textContent = suggestion.source;

		const tokens = append(meta, $('.suggestion-tokens'));
		tokens.textContent = formatTokens(suggestion.tokens);

		// Relevance bar
		const relevance = append(meta, $('.suggestion-relevance'));
		relevance.innerHTML = `
			<div class="relevance-bar" style="width: ${suggestion.relevance}%"></div>
		`;
		relevance.title = `${suggestion.relevance}% relevance`;

		// Priority badge
		const priority = append(suggestionEl, $('.suggestion-priority'));
		priority.textContent = priorityInfo.name;
		priority.style.backgroundColor = `${priorityInfo.color}20`;
		priority.style.color = priorityInfo.color;
	}

	private renderRules(container: HTMLElement): void {
		for (const rule of SMART_CONTEXT_RULES.slice(0, 4)) {
			const ruleEl = append(container, $('.context-rule'));

			const typeInfo = CONTEXT_TYPE_INFO[rule.type];

			ruleEl.innerHTML = `
				<span class="codicon codicon-${typeInfo.icon}" style="color: ${typeInfo.color}"></span>
				<div class="rule-info">
					<div class="rule-name">${rule.name}</div>
					<div class="rule-desc">${rule.description}</div>
				</div>
				<label class="rule-toggle">
					<input type="checkbox" checked>
					<span class="toggle-slider"></span>
				</label>
			`;
		}

		const moreBtn = append(container, $('button.context-btn'));
		moreBtn.textContent = localize('manageRules', 'Manage Rules...');
		moreBtn.onclick = () => this.manageRules();
	}

	private selectAll(): void {
		for (const suggestion of this.suggestions) {
			suggestion.selected = true;
		}
		this.renderSuggestions();
	}

	private selectNone(): void {
		for (const suggestion of this.suggestions) {
			suggestion.selected = false;
		}
		this.renderSuggestions();
	}

	private addSelected(): void {
		const selected = this.suggestions.filter(s => s.selected);
		const totalTokens = selected.reduce((sum, s) => sum + s.tokens, 0);

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('addedToContext', 'Added {0} items ({1} tokens) to context', selected.length, formatTokens(totalTokens))
		});
	}

	private manageRules(): void {
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('openingRules', 'Opening context rules configuration...')
		});
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
