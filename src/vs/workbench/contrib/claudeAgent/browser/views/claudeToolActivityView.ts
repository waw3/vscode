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
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IToolExecution, IHookExecution } from '../../common/types.js';

export class ClaudeToolActivityView extends ViewPane {

	private container!: HTMLElement;
	private activityList!: HTMLElement;
	private activities: (IToolExecution | IHookExecution)[] = [];

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
		@IHoverService hoverService: IHoverService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// Demo activities
		this.addDemoActivities();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-tool-activity-view');

		// Toolbar
		const toolbar = append(this.container, $('.claude-activity-toolbar'));

		const filterLabel = append(toolbar, $('.claude-activity-filter-label'));
		filterLabel.textContent = localize('filter', 'Filter:');

		const filterAll = append(toolbar, $('button.claude-activity-filter.active'));
		filterAll.textContent = localize('all', 'All');
		filterAll.onclick = () => this.setFilter('all');

		const filterTools = append(toolbar, $('button.claude-activity-filter'));
		filterTools.textContent = localize('tools', 'Tools');
		filterTools.onclick = () => this.setFilter('tools');

		const filterHooks = append(toolbar, $('button.claude-activity-filter'));
		filterHooks.textContent = localize('hooks', 'Hooks');
		filterHooks.onclick = () => this.setFilter('hooks');

		append(toolbar, $('.claude-activity-spacer'));

		const clearBtn = append(toolbar, $('button.claude-activity-clear'));
		clearBtn.innerHTML = '<span class="codicon codicon-clear-all"></span>';
		clearBtn.title = localize('clear', 'Clear Activity');
		clearBtn.onclick = () => this.clearActivities();

		// Activity list
		this.activityList = append(this.container, $('.claude-activity-list'));

		this.renderActivities();
	}

	private renderActivities(): void {
		clearNode(this.activityList);

		if (this.activities.length === 0) {
			const empty = append(this.activityList, $('.claude-activity-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-tools"></span>
				<span>${localize('noActivity', 'No tool activity yet')}</span>
				<span class="hint">${localize('activityHint', 'Tool executions will appear here')}</span>
			`;
			return;
		}

		for (const activity of this.activities) {
			this.renderActivityItem(activity);
		}
	}

	private renderActivityItem(activity: IToolExecution | IHookExecution): void {
		const item = append(this.activityList, $('.claude-activity-item'));
		item.classList.add(activity.status);

		// Status icon
		const statusIcon = append(item, $('.claude-activity-status'));
		statusIcon.innerHTML = this.getStatusIcon(activity.status);

		// Main content
		const content = append(item, $('.claude-activity-content'));

		// Header
		const header = append(content, $('.claude-activity-header'));

		const name = append(header, $('.claude-activity-name'));
		if ('toolName' in activity) {
			name.innerHTML = `<span class="codicon codicon-tools"></span> ${activity.toolName}`;
		} else {
			name.innerHTML = `<span class="codicon codicon-zap"></span> Hook: ${activity.event}`;
		}

		const time = append(header, $('.claude-activity-time'));
		time.textContent = this.formatTime(activity.startTime);

		// Details
		const details = append(content, $('.claude-activity-details'));

		if ('toolName' in activity) {
			// Tool execution details
			const inputLabel = append(details, $('.claude-activity-label'));
			inputLabel.textContent = localize('input', 'Input:');

			const inputContent = append(details, $('pre.claude-activity-json'));
			inputContent.textContent = JSON.stringify(activity.input, null, 2);

			if (activity.output) {
				const outputLabel = append(details, $('.claude-activity-label'));
				outputLabel.textContent = localize('output', 'Output:');

				const outputContent = append(details, $('pre.claude-activity-output'));
				outputContent.textContent = activity.output.substring(0, 500) + (activity.output.length > 500 ? '...' : '');
			}

			if (activity.error) {
				const errorLabel = append(details, $('.claude-activity-label.error'));
				errorLabel.textContent = localize('error', 'Error:');

				const errorContent = append(details, $('pre.claude-activity-error'));
				errorContent.textContent = activity.error;
			}
		} else {
			// Hook execution details
			const matcherLabel = append(details, $('.claude-activity-label'));
			matcherLabel.textContent = localize('matcher', 'Matcher:');

			const matcherContent = append(details, $('.claude-activity-value'));
			matcherContent.textContent = activity.matcher || '*';

			if (activity.exitCode !== undefined) {
				const exitLabel = append(details, $('.claude-activity-label'));
				exitLabel.textContent = localize('exitCode', 'Exit Code:');

				const exitContent = append(details, $('.claude-activity-value'));
				exitContent.textContent = activity.exitCode.toString();
				exitContent.classList.add(activity.exitCode === 0 ? 'success' : 'error');
			}

			if (activity.output) {
				const outputLabel = append(details, $('.claude-activity-label'));
				outputLabel.textContent = localize('output', 'Output:');

				const outputContent = append(details, $('pre.claude-activity-output'));
				outputContent.textContent = activity.output;
			}
		}

		// Duration
		if (activity.endTime) {
			const duration = append(content, $('.claude-activity-duration'));
			const ms = activity.endTime.getTime() - activity.startTime.getTime();
			duration.textContent = `${ms}ms`;
		}

		// Toggle details on click
		item.onclick = () => {
			item.classList.toggle('expanded');
		};
	}

	private getStatusIcon(status: string): string {
		switch (status) {
			case 'pending':
				return '<span class="codicon codicon-circle-outline"></span>';
			case 'running':
				return '<span class="codicon codicon-loading codicon-modifier-spin"></span>';
			case 'completed':
				return '<span class="codicon codicon-check"></span>';
			case 'error':
				return '<span class="codicon codicon-error"></span>';
			case 'blocked':
				return '<span class="codicon codicon-circle-slash"></span>';
			default:
				return '<span class="codicon codicon-question"></span>';
		}
	}

	private formatTime(date: Date): string {
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	private setFilter(filter: string): void {
		// Update filter buttons
		const buttons = this.container.querySelectorAll('.claude-activity-filter');
		buttons.forEach(btn => btn.classList.remove('active'));
		const activeBtn = Array.from(buttons).find(btn => btn.textContent?.toLowerCase().includes(filter) || (filter === 'all' && btn.textContent === 'All'));
		activeBtn?.classList.add('active');

		// Filter activities
		this.renderActivities();
	}

	private clearActivities(): void {
		this.activities = [];
		this.renderActivities();
	}

	private addDemoActivities(): void {
		const now = new Date();

		this.activities = [
			{
				id: 'tool-1',
				toolName: 'Read',
				status: 'completed',
				input: { file_path: '/src/index.ts', limit: 100 },
				output: '// File contents here...',
				startTime: new Date(now.getTime() - 5000),
				endTime: new Date(now.getTime() - 4800),
				duration: 200
			} as IToolExecution,
			{
				id: 'tool-2',
				toolName: 'Grep',
				status: 'completed',
				input: { pattern: 'TODO', path: '/src' },
				output: 'src/utils.ts:15: // TODO: Fix this\nsrc/app.ts:42: // TODO: Add tests',
				startTime: new Date(now.getTime() - 4500),
				endTime: new Date(now.getTime() - 4100),
				duration: 400
			} as IToolExecution,
			{
				id: 'hook-1',
				event: 'PreToolUse',
				matcher: 'Write|Edit',
				hookType: 'command',
				status: 'completed',
				exitCode: 0,
				output: 'Validation passed',
				startTime: new Date(now.getTime() - 3000),
				endTime: new Date(now.getTime() - 2900)
			} as IHookExecution,
			{
				id: 'tool-3',
				toolName: 'Edit',
				status: 'running',
				input: { file_path: '/src/index.ts', old_string: 'const x', new_string: 'const value' },
				startTime: new Date(now.getTime() - 1000)
			} as IToolExecution,
		];
	}

	public addToolExecution(execution: IToolExecution): void {
		this.activities.unshift(execution);
		if (this.activities.length > 100) {
			this.activities.pop();
		}
		this.renderActivities();
	}

	public addHookExecution(execution: IHookExecution): void {
		this.activities.unshift(execution);
		if (this.activities.length > 100) {
			this.activities.pop();
		}
		this.renderActivities();
	}

	public updateExecution(id: string, update: Partial<IToolExecution | IHookExecution>): void {
		const index = this.activities.findIndex(a => a.id === id);
		if (index !== -1) {
			this.activities[index] = { ...this.activities[index], ...update } as IToolExecution | IHookExecution;
			this.renderActivities();
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
