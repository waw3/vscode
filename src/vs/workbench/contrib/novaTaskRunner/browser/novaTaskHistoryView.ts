/*---------------------------------------------------------------------------------------------
 *  Nova Task History View
 *  Shows task execution history with visual reports
 *--------------------------------------------------------------------------------------------*/

import './media/novaTaskRunner.css';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ITaskService } from '../../tasks/common/taskService.js';
import { TaskEventKind, ITaskEvent, ITaskProcessEndedEvent } from '../../tasks/common/tasks.js';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';

interface TaskHistoryEntry {
	taskId: string;
	taskName: string;
	source: string;
	startTime: number;
	endTime?: number;
	duration?: number;
	exitCode?: number;
	status: 'running' | 'success' | 'failed' | 'terminated';
	hasErrors: boolean;
}

export class NovaTaskHistoryView extends ViewPane {
	static readonly ID = 'novaTaskRunner.history';

	private container: HTMLElement | undefined;
	private historyList: HTMLElement | undefined;
	private history: TaskHistoryEntry[] = [];
	private readonly viewDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
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
		@ITaskService private readonly taskService: ITaskService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = container;
		container.classList.add('nova-task-history-view');

		// Create header with stats
		this.renderHeader();

		// Create history list
		this.historyList = append(container, $('.nova-task-history-list'));
		this.renderEmptyState();

		// Listen for task events
		this._register(this.taskService.onDidStateChange(event => this.onTaskEvent(event)));
	}

	private renderHeader(): void {
		if (!this.container) {
			return;
		}

		const header = append(this.container, $('.nova-task-history-header'));

		const stats = append(header, $('.nova-task-history-stats'));

		const successCount = append(stats, $('.nova-task-stat.success'));
		successCount.innerHTML = `<span class="count">0</span> passed`;

		const failedCount = append(stats, $('.nova-task-stat.failed'));
		failedCount.innerHTML = `<span class="count">0</span> failed`;

		const clearButton = append(header, $('.nova-task-history-clear'));
		clearButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.clearAll));
		clearButton.title = 'Clear history';

		clearButton.onclick = () => {
			this.clearHistory();
		};

		this.viewDisposables.add({
			dispose: () => {
				clearButton.onclick = null;
			}
		});
	}

	private renderEmptyState(): void {
		if (!this.historyList) {
			return;
		}

		clearNode(this.historyList);

		const emptyState = append(this.historyList, $('.nova-task-history-empty'));
		const icon = append(emptyState, $('.nova-task-history-empty-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.history));

		const message = append(emptyState, $('.nova-task-history-empty-message'));
		message.textContent = 'No task history';

		const hint = append(emptyState, $('.nova-task-history-empty-hint'));
		hint.textContent = 'Run a task to see its history here';
	}

	private onTaskEvent(event: ITaskEvent): void {
		switch (event.kind) {
			case TaskEventKind.Start:
				this.addHistoryEntry({
					taskId: event.taskId,
					taskName: event.taskName || 'Unknown Task',
					source: event.group?.toString() || 'Task',
					startTime: Date.now(),
					status: 'running',
					hasErrors: false
				});
				break;

			case TaskEventKind.ProcessEnded:
				const processEvent = event as ITaskProcessEndedEvent;
				this.updateHistoryEntry(event.taskId, {
					endTime: Date.now(),
					duration: processEvent.durationMs,
					exitCode: processEvent.exitCode,
					status: processEvent.exitCode === 0 ? 'success' : 'failed'
				});
				break;

			case TaskEventKind.Terminated:
				this.updateHistoryEntry(event.taskId, {
					endTime: Date.now(),
					status: 'terminated'
				});
				break;

			case TaskEventKind.ProblemMatcherFoundErrors:
				this.updateHistoryEntry(event.taskId, {
					hasErrors: true
				});
				break;
		}
	}

	private addHistoryEntry(entry: TaskHistoryEntry): void {
		// Remove any existing entry for the same task
		this.history = this.history.filter(h => h.taskId !== entry.taskId || h.status !== 'running');

		// Add to beginning
		this.history.unshift(entry);

		// Trim to limit
		const limit = this.configurationService.getValue<number>('novaTaskRunner.historyLimit') || 20;
		if (this.history.length > limit) {
			this.history = this.history.slice(0, limit);
		}

		this.renderHistory();
	}

	private updateHistoryEntry(taskId: string, updates: Partial<TaskHistoryEntry>): void {
		const entry = this.history.find(h => h.taskId === taskId && h.status === 'running');
		if (entry) {
			Object.assign(entry, updates);

			// Calculate duration if not provided
			if (!entry.duration && entry.startTime && entry.endTime) {
				entry.duration = entry.endTime - entry.startTime;
			}

			this.renderHistory();
		}
	}

	private renderHistory(): void {
		if (!this.historyList || !this.container) {
			return;
		}

		clearNode(this.historyList);

		if (this.history.length === 0) {
			this.renderEmptyState();
			return;
		}

		// Update stats
		this.updateStats();

		// Render history items
		for (const entry of this.history) {
			this.renderHistoryItem(entry);
		}
	}

	private updateStats(): void {
		if (!this.container) {
			return;
		}

		const successCount = this.history.filter(h => h.status === 'success').length;
		const failedCount = this.history.filter(h => h.status === 'failed' || h.status === 'terminated').length;

		const successEl = this.container.querySelector('.nova-task-stat.success .count');
		const failedEl = this.container.querySelector('.nova-task-stat.failed .count');

		if (successEl) {
			successEl.textContent = successCount.toString();
		}
		if (failedEl) {
			failedEl.textContent = failedCount.toString();
		}
	}

	private renderHistoryItem(entry: TaskHistoryEntry): void {
		if (!this.historyList) {
			return;
		}

		const item = append(this.historyList, $('.nova-task-history-item'));
		item.classList.add(entry.status);

		// Status icon
		const statusIcon = append(item, $('.nova-task-history-status'));
		switch (entry.status) {
			case 'running':
				statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
				break;
			case 'success':
				statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
				break;
			case 'failed':
				statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
				break;
			case 'terminated':
				statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.debugStop));
				break;
		}

		// Task info
		const info = append(item, $('.nova-task-history-info'));

		const name = append(info, $('.nova-task-history-name'));
		name.textContent = entry.taskName;

		const details = append(info, $('.nova-task-history-details'));

		// Time
		const time = this.formatTime(entry.startTime);
		const timeSpan = append(details, $('span.time'));
		timeSpan.textContent = time;

		// Duration
		if (this.configurationService.getValue('novaTaskRunner.showDuration') && entry.duration !== undefined) {
			const durationSpan = append(details, $('span.duration'));
			durationSpan.textContent = this.formatDuration(entry.duration);
		}

		// Exit code for failed tasks
		if (entry.status === 'failed' && entry.exitCode !== undefined) {
			const exitCodeSpan = append(details, $('span.exit-code'));
			exitCodeSpan.textContent = `Exit: ${entry.exitCode}`;
		}

		// Error indicator
		if (entry.hasErrors) {
			const errorBadge = append(item, $('.nova-task-history-errors'));
			errorBadge.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
			errorBadge.title = 'Task produced errors';
		}

		// Rerun button
		const rerunButton = append(item, $('.nova-task-history-rerun'));
		rerunButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.refresh));
		rerunButton.title = 'Run again';

		rerunButton.onclick = async (e) => {
			e.stopPropagation();
			const tasks = await this.taskService.tasks();
			const task = tasks.find(t => t._id === entry.taskId || t._label === entry.taskName);
			if (task) {
				await this.taskService.run(task);
			}
		};

		this.viewDisposables.add({
			dispose: () => {
				rerunButton.onclick = null;
			}
		});
	}

	private formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	private formatDuration(ms: number): string {
		if (ms < 1000) {
			return `${ms}ms`;
		} else if (ms < 60000) {
			return `${(ms / 1000).toFixed(1)}s`;
		} else {
			const minutes = Math.floor(ms / 60000);
			const seconds = Math.floor((ms % 60000) / 1000);
			return `${minutes}m ${seconds}s`;
		}
	}

	private clearHistory(): void {
		// Keep only running tasks
		this.history = this.history.filter(h => h.status === 'running');
		this.renderHistory();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
