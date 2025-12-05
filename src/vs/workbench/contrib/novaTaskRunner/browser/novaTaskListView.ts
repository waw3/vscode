/*---------------------------------------------------------------------------------------------
 *  Nova Task List View
 *  Shows available tasks with visual status indicators
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
import { Task, TaskEventKind, ITaskEvent } from '../../tasks/common/tasks.js';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';

interface TaskItem {
	task: Task;
	isRunning: boolean;
	element?: HTMLElement;
}

export class NovaTaskListView extends ViewPane {
	static readonly ID = 'novaTaskRunner.taskList';

	private container: HTMLElement | undefined;
	private taskItems: Map<string, TaskItem> = new Map();
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
		container.classList.add('nova-task-list-view');

		this.loadTasks();

		// Listen for task events
		this._register(this.taskService.onDidStateChange(event => this.onTaskEvent(event)));

		// Listen for task configuration changes
		this._register(this.taskService.onDidChangeTaskConfig(() => this.loadTasks()));
	}

	private async loadTasks(): Promise<void> {
		if (!this.container) {
			return;
		}

		this.viewDisposables.clear();
		clearNode(this.container);
		this.taskItems.clear();

		try {
			const tasks = await this.taskService.tasks();
			const activeTasks = await this.taskService.getActiveTasks();
			const activeTaskIds = new Set(activeTasks.map(t => t._id));

			if (tasks.length === 0) {
				this.renderEmptyState();
				return;
			}

			// Group tasks by source
			const groupedTasks = this.groupTasksBySource(tasks);

			for (const [source, sourceTasks] of groupedTasks) {
				this.renderTaskGroup(source, sourceTasks, activeTaskIds);
			}
		} catch {
			this.renderEmptyState();
		}
	}

	private groupTasksBySource(tasks: Task[]): Map<string, Task[]> {
		const groups = new Map<string, Task[]>();

		for (const task of tasks) {
			const source = task._source.label || 'Workspace';
			if (!groups.has(source)) {
				groups.set(source, []);
			}
			groups.get(source)!.push(task);
		}

		return groups;
	}

	private renderEmptyState(): void {
		if (!this.container) {
			return;
		}

		const emptyState = append(this.container, $('.nova-task-empty'));
		const icon = append(emptyState, $('.nova-task-empty-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.tasklist));

		const message = append(emptyState, $('.nova-task-empty-message'));
		message.textContent = 'No tasks found';

		const hint = append(emptyState, $('.nova-task-empty-hint'));
		hint.textContent = 'Create a tasks.json file to define tasks';
	}

	private renderTaskGroup(source: string, tasks: Task[], activeTaskIds: Set<string>): void {
		if (!this.container) {
			return;
		}

		const group = append(this.container, $('.nova-task-group'));

		const header = append(group, $('.nova-task-group-header'));
		header.textContent = source;

		const list = append(group, $('.nova-task-list'));

		for (const task of tasks) {
			const isRunning = activeTaskIds.has(task._id);
			const element = this.renderTaskItem(list, task, isRunning);

			this.taskItems.set(task._id, {
				task,
				isRunning,
				element
			});
		}
	}

	private renderTaskItem(container: HTMLElement, task: Task, isRunning: boolean): HTMLElement {
		const item = append(container, $('.nova-task-item'));
		item.setAttribute('role', 'button');
		item.setAttribute('tabindex', '0');
		item.title = `Run: ${task._label}`;

		if (isRunning) {
			item.classList.add('running');
		}

		// Status indicator
		const status = append(item, $('.nova-task-status'));
		if (isRunning) {
			status.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
		} else {
			status.classList.add(...ThemeIcon.asClassNameArray(Codicon.play));
		}

		// Task info
		const info = append(item, $('.nova-task-info'));

		const name = append(info, $('.nova-task-name'));
		name.textContent = task._label;

		if (task.command?.name) {
			const command = append(info, $('.nova-task-command'));
			command.textContent = task.command.name;
		}

		// Action buttons
		const actions = append(item, $('.nova-task-actions'));

		if (isRunning) {
			const stopButton = append(actions, $('.nova-task-action'));
			stopButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.debugStop));
			stopButton.title = 'Stop task';

			stopButton.onclick = (e) => {
				e.stopPropagation();
				this.taskService.terminate(task);
			};
		}

		// Click to run/focus
		item.onclick = () => {
			if (isRunning) {
				// Focus the terminal
				this.taskService.run(task);
			} else {
				this.runTask(task);
			}
		};

		item.onkeydown = (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				if (!isRunning) {
					this.runTask(task);
				}
			}
		};

		this.viewDisposables.add({
			dispose: () => {
				item.onclick = null;
				item.onkeydown = null;
			}
		});

		return item;
	}

	private async runTask(task: Task): Promise<void> {
		try {
			await this.taskService.run(task);
		} catch {
			// Task execution failed
		}
	}

	private onTaskEvent(event: ITaskEvent): void {
		const taskItem = this.taskItems.get(event.taskId);

		switch (event.kind) {
			case TaskEventKind.Start:
			case TaskEventKind.Active:
				if (taskItem && taskItem.element) {
					this.updateTaskStatus(taskItem.element, true);
					taskItem.isRunning = true;
				}
				break;

			case TaskEventKind.End:
			case TaskEventKind.Terminated:
			case TaskEventKind.ProcessEnded:
				if (taskItem && taskItem.element) {
					this.updateTaskStatus(taskItem.element, false);
					taskItem.isRunning = false;
				}
				break;
		}
	}

	private updateTaskStatus(element: HTMLElement, isRunning: boolean): void {
		const status = element.querySelector('.nova-task-status');
		const actions = element.querySelector('.nova-task-actions');

		if (!status || !actions) {
			return;
		}

		// Clear existing classes
		status.className = 'nova-task-status';
		clearNode(actions as HTMLElement);

		if (isRunning) {
			element.classList.add('running');
			status.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');

			const stopButton = append(actions as HTMLElement, $('.nova-task-action'));
			stopButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.debugStop));
			stopButton.title = 'Stop task';

			const taskItem = Array.from(this.taskItems.values()).find(item => item.element === element);
			if (taskItem) {
				stopButton.onclick = (e) => {
					e.stopPropagation();
					this.taskService.terminate(taskItem.task);
				};
			}
		} else {
			element.classList.remove('running');
			status.classList.add(...ThemeIcon.asClassNameArray(Codicon.play));
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
