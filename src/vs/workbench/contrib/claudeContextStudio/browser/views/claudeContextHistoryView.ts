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
	IContextSnapshot,
	IContextItem,
	CONTEXT_TYPE_INFO,
	MODEL_CONTEXT_LIMITS,
	formatTokens
} from '../claudeContextStudio.contribution.js';

export class ClaudeContextHistoryView extends ViewPane {

	private container!: HTMLElement;
	private snapshotsContainer!: HTMLElement;
	private snapshots: IContextSnapshot[] = [];

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

		this.generateSampleSnapshots();
	}

	private generateSampleSnapshots(): void {
		const now = Date.now();

		this.snapshots = [
			{
				id: '1',
				name: 'Debug Session',
				timestamp: now - 1000 * 60 * 5, // 5 minutes ago
				items: [
					{ id: '1', type: 'file', name: 'index.ts', content: '', tokens: 2500, priority: 'high', included: true, category: 'Source' },
					{ id: '2', type: 'terminal', name: 'Error Log', content: '', tokens: 450, priority: 'high', included: true, category: 'Terminal' },
					{ id: '3', type: 'git-diff', name: 'Changes', content: '', tokens: 800, priority: 'medium', included: true, category: 'Git' }
				],
				totalTokens: 3750,
				modelId: 'claude-sonnet-4-5-20250929'
			},
			{
				id: '2',
				name: 'Code Review',
				timestamp: now - 1000 * 60 * 30, // 30 minutes ago
				items: [
					{ id: '1', type: 'file', name: 'utils.ts', content: '', tokens: 1800, priority: 'high', included: true, category: 'Source' },
					{ id: '2', type: 'file', name: 'types.ts', content: '', tokens: 950, priority: 'medium', included: true, category: 'Source' },
					{ id: '3', type: 'documentation', name: 'README.md', content: '', tokens: 2200, priority: 'low', included: true, category: 'Docs' }
				],
				totalTokens: 4950,
				modelId: 'claude-sonnet-4-5-20250929'
			},
			{
				id: '3',
				name: 'Feature Implementation',
				timestamp: now - 1000 * 60 * 60 * 2, // 2 hours ago
				items: [
					{ id: '1', type: 'file', name: 'component.tsx', content: '', tokens: 3200, priority: 'critical', included: true, category: 'Source' },
					{ id: '2', type: 'file', name: 'styles.css', content: '', tokens: 800, priority: 'medium', included: true, category: 'Styles' },
					{ id: '3', type: 'dependency', name: 'package.json', content: '', tokens: 1100, priority: 'low', included: true, category: 'Config' },
					{ id: '4', type: 'file', name: 'test.spec.ts', content: '', tokens: 1500, priority: 'medium', included: true, category: 'Tests' }
				],
				totalTokens: 6600,
				modelId: 'claude-opus-4-5-20251101'
			},
			{
				id: '4',
				name: 'API Integration',
				timestamp: now - 1000 * 60 * 60 * 24, // 1 day ago
				items: [
					{ id: '1', type: 'file', name: 'api.ts', content: '', tokens: 2800, priority: 'high', included: true, category: 'Source' },
					{ id: '2', type: 'documentation', name: 'API.md', content: '', tokens: 4500, priority: 'medium', included: true, category: 'Docs' }
				],
				totalTokens: 7300,
				modelId: 'claude-sonnet-4-5-20250929'
			}
		];
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-context-history-view');

		// Header
		const header = append(this.container, $('.context-history-header'));
		header.innerHTML = `
			<span class="codicon codicon-history"></span>
			<span>${localize('contextHistory', 'Context History')}</span>
		`;

		// Toolbar
		const toolbar = append(this.container, $('.context-history-toolbar'));

		const saveBtn = append(toolbar, $('button.context-btn.primary'));
		saveBtn.innerHTML = `<span class="codicon codicon-save"></span> ${localize('saveSnapshot', 'Save Snapshot')}`;
		saveBtn.onclick = () => this.saveSnapshot();

		const clearBtn = append(toolbar, $('button.context-btn'));
		clearBtn.innerHTML = `<span class="codicon codicon-clear-all"></span> ${localize('clearHistory', 'Clear')}`;
		clearBtn.onclick = () => this.clearHistory();

		// Stats summary
		const stats = append(this.container, $('.context-history-stats'));
		this.renderStats(stats);

		// Snapshots container
		this.snapshotsContainer = append(this.container, $('.context-snapshots-list'));
		this.renderSnapshots();
	}

	private renderStats(container: HTMLElement): void {
		const totalSnapshots = this.snapshots.length;
		const avgTokens = totalSnapshots > 0
			? Math.round(this.snapshots.reduce((sum, s) => sum + s.totalTokens, 0) / totalSnapshots)
			: 0;

		container.innerHTML = `
			<div class="stat-item">
				<span class="stat-value">${totalSnapshots}</span>
				<span class="stat-label">${localize('snapshots', 'Snapshots')}</span>
			</div>
			<div class="stat-item">
				<span class="stat-value">${formatTokens(avgTokens)}</span>
				<span class="stat-label">${localize('avgTokens', 'Avg Tokens')}</span>
			</div>
		`;
	}

	private renderSnapshots(): void {
		clearNode(this.snapshotsContainer);

		if (this.snapshots.length === 0) {
			const empty = append(this.snapshotsContainer, $('.context-history-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-history"></span>
				<span>${localize('noSnapshots', 'No context snapshots')}</span>
				<span class="hint">${localize('saveSnapshotHint', 'Save snapshots to restore context later')}</span>
			`;
			return;
		}

		// Group by date
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		const groups: Map<string, IContextSnapshot[]> = new Map();

		for (const snapshot of this.snapshots) {
			const date = new Date(snapshot.timestamp);
			let groupLabel: string;

			if (this.isSameDay(date, today)) {
				groupLabel = localize('today', 'Today');
			} else if (this.isSameDay(date, yesterday)) {
				groupLabel = localize('yesterday', 'Yesterday');
			} else {
				groupLabel = date.toLocaleDateString();
			}

			if (!groups.has(groupLabel)) {
				groups.set(groupLabel, []);
			}
			groups.get(groupLabel)!.push(snapshot);
		}

		for (const [label, snapshots] of groups) {
			this.renderGroup(label, snapshots);
		}
	}

	private isSameDay(d1: Date, d2: Date): boolean {
		return d1.getFullYear() === d2.getFullYear() &&
			d1.getMonth() === d2.getMonth() &&
			d1.getDate() === d2.getDate();
	}

	private renderGroup(label: string, snapshots: IContextSnapshot[]): void {
		const groupEl = append(this.snapshotsContainer, $('.context-history-group'));

		const groupHeader = append(groupEl, $('.history-group-header'));
		groupHeader.textContent = label;

		for (const snapshot of snapshots) {
			this.renderSnapshot(groupEl, snapshot);
		}
	}

	private renderSnapshot(container: HTMLElement, snapshot: IContextSnapshot): void {
		const snapshotEl = append(container, $('.context-snapshot'));

		const time = new Date(snapshot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		const modelInfo = MODEL_CONTEXT_LIMITS[snapshot.modelId];

		// Header
		const header = append(snapshotEl, $('.snapshot-header'));
		header.innerHTML = `
			<span class="snapshot-time">${time}</span>
			<span class="snapshot-name">${snapshot.name}</span>
		`;

		// Stats
		const stats = append(snapshotEl, $('.snapshot-stats'));
		stats.innerHTML = `
			<span class="snapshot-tokens">${formatTokens(snapshot.totalTokens)} tokens</span>
			<span class="snapshot-items">${snapshot.items.length} items</span>
			<span class="snapshot-model">${modelInfo?.name || snapshot.modelId}</span>
		`;

		// Items preview
		const preview = append(snapshotEl, $('.snapshot-preview'));

		// Group items by type
		const typeCounts = new Map<string, number>();
		for (const item of snapshot.items) {
			const count = typeCounts.get(item.type) || 0;
			typeCounts.set(item.type, count + 1);
		}

		for (const [type, count] of typeCounts) {
			const typeInfo = CONTEXT_TYPE_INFO[type as keyof typeof CONTEXT_TYPE_INFO];
			if (typeInfo) {
				const badge = append(preview, $('.snapshot-type-badge'));
				badge.innerHTML = `
					<span class="codicon codicon-${typeInfo.icon}" style="color: ${typeInfo.color}"></span>
					<span>${count}</span>
				`;
				badge.title = `${count} ${typeInfo.name}${count > 1 ? 's' : ''}`;
			}
		}

		// Actions
		const actions = append(snapshotEl, $('.snapshot-actions'));

		const restoreBtn = append(actions, $('button.snapshot-action.primary'));
		restoreBtn.innerHTML = '<span class="codicon codicon-history"></span>';
		restoreBtn.title = localize('restore', 'Restore');
		restoreBtn.onclick = (e) => {
			e.stopPropagation();
			this.restoreSnapshot(snapshot);
		};

		const compareBtn = append(actions, $('button.snapshot-action'));
		compareBtn.innerHTML = '<span class="codicon codicon-diff"></span>';
		compareBtn.title = localize('compare', 'Compare with current');
		compareBtn.onclick = (e) => {
			e.stopPropagation();
			this.compareSnapshot(snapshot);
		};

		const deleteBtn = append(actions, $('button.snapshot-action.danger'));
		deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
		deleteBtn.title = localize('delete', 'Delete');
		deleteBtn.onclick = (e) => {
			e.stopPropagation();
			this.deleteSnapshot(snapshot.id);
		};

		// Click to expand
		snapshotEl.onclick = () => this.toggleSnapshotDetails(snapshotEl, snapshot);
	}

	private toggleSnapshotDetails(element: HTMLElement, snapshot: IContextSnapshot): void {
		const existingDetails = element.querySelector('.snapshot-details');

		if (existingDetails) {
			existingDetails.remove();
			element.classList.remove('expanded');
			return;
		}

		element.classList.add('expanded');

		const details = append(element, $('.snapshot-details'));

		const itemsHeader = append(details, $('h4'));
		itemsHeader.textContent = localize('items', 'Items');

		for (const item of snapshot.items) {
			const typeInfo = CONTEXT_TYPE_INFO[item.type];

			const itemEl = append(details, $('.snapshot-detail-item'));
			itemEl.innerHTML = `
				<span class="codicon codicon-${typeInfo.icon}" style="color: ${typeInfo.color}"></span>
				<span class="detail-item-name">${item.name}</span>
				<span class="detail-item-tokens">${formatTokens(item.tokens)}</span>
			`;
		}
	}

	private saveSnapshot(): void {
		const name = prompt(localize('snapshotName', 'Snapshot name:'), `Snapshot ${this.snapshots.length + 1}`);
		if (!name) return;

		const newSnapshot: IContextSnapshot = {
			id: String(Date.now()),
			name,
			timestamp: Date.now(),
			items: [],
			totalTokens: 0,
			modelId: 'claude-sonnet-4-5-20250929'
		};

		this.snapshots.unshift(newSnapshot);
		this.renderSnapshots();

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('snapshotSaved', 'Snapshot saved: {0}', name)
		});
	}

	private restoreSnapshot(snapshot: IContextSnapshot): void {
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('restoringSnapshot', 'Restoring context: {0}', snapshot.name)
		});
	}

	private compareSnapshot(snapshot: IContextSnapshot): void {
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('comparingSnapshot', 'Comparing with: {0}', snapshot.name)
		});
	}

	private deleteSnapshot(id: string): void {
		const confirmed = confirm(localize('confirmDelete', 'Delete this snapshot?'));
		if (!confirmed) return;

		this.snapshots = this.snapshots.filter(s => s.id !== id);
		this.renderSnapshots();

		const statsEl = this.container.querySelector('.context-history-stats');
		if (statsEl) {
			this.renderStats(statsEl as HTMLElement);
		}

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('snapshotDeleted', 'Snapshot deleted')
		});
	}

	private clearHistory(): void {
		const confirmed = confirm(localize('confirmClearHistory', 'Clear all context history?'));
		if (!confirmed) return;

		this.snapshots = [];
		this.renderSnapshots();

		const statsEl = this.container.querySelector('.context-history-stats');
		if (statsEl) {
			this.renderStats(statsEl as HTMLElement);
		}

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('historyCleared', 'Context history cleared')
		});
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
