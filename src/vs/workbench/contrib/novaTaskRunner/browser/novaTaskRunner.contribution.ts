/*---------------------------------------------------------------------------------------------
 *  Nova Task Runner Contribution
 *  Provides a visual task runner with reports inspired by Panic Nova
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { NovaTaskListView } from './novaTaskListView.js';
import { NovaTaskHistoryView } from './novaTaskHistoryView.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ITaskService } from '../../tasks/common/taskService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { Task } from '../../tasks/common/tasks.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

// Icons
const novaTaskRunnerIcon = registerIcon('nova-task-runner', Codicon.play, localize('novaTaskRunnerIcon', 'Icon for the Nova Task Runner view container.'));

// View Container
const VIEW_CONTAINER_ID = 'workbench.view.novaTaskRunner';
const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewContainer = viewContainersRegistry.registerViewContainer({
	id: VIEW_CONTAINER_ID,
	title: localize2('novaTaskRunner', "Tasks"),
	icon: novaTaskRunnerIcon,
	order: 5,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.novaTaskRunner.state',
	hideIfEmpty: false
}, ViewContainerLocation.Sidebar, { isDefault: false });

// Register Views
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);

// Task List View
const taskListViewDescriptor: IViewDescriptor = {
	id: 'novaTaskRunner.taskList',
	name: localize2('taskList', "Available Tasks"),
	ctorDescriptor: new SyncDescriptor(NovaTaskListView),
	order: 1,
	canToggleVisibility: true,
	canMoveView: true,
	containerIcon: novaTaskRunnerIcon,
	weight: 50
};

// Task History View
const taskHistoryViewDescriptor: IViewDescriptor = {
	id: 'novaTaskRunner.history',
	name: localize2('taskHistory', "Task History"),
	ctorDescriptor: new SyncDescriptor(NovaTaskHistoryView),
	order: 2,
	canToggleVisibility: true,
	canMoveView: true,
	collapsed: false,
	weight: 50
};

viewsRegistry.registerViews([taskListViewDescriptor, taskHistoryViewDescriptor], viewContainer);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'novaTaskRunner',
	title: localize('novaTaskRunner', "Nova Task Runner"),
	type: 'object',
	properties: {
		'novaTaskRunner.showInActivityBar': {
			type: 'boolean',
			default: true,
			description: localize('novaTaskRunner.showInActivityBar', "Show the Task Runner panel in the activity bar."),
			scope: ConfigurationScope.APPLICATION
		},
		'novaTaskRunner.historyLimit': {
			type: 'number',
			default: 20,
			minimum: 5,
			maximum: 100,
			description: localize('novaTaskRunner.historyLimit', "Maximum number of task executions to keep in history."),
			scope: ConfigurationScope.APPLICATION
		},
		'novaTaskRunner.autoRefresh': {
			type: 'boolean',
			default: true,
			description: localize('novaTaskRunner.autoRefresh', "Automatically refresh task list when tasks.json changes."),
			scope: ConfigurationScope.WINDOW
		},
		'novaTaskRunner.showDuration': {
			type: 'boolean',
			default: true,
			description: localize('novaTaskRunner.showDuration', "Show task execution duration in history."),
			scope: ConfigurationScope.APPLICATION
		}
	}
});

// Command: Run Task (Quick Pick)
registerAction2(class RunTaskQuickPickAction extends Action2 {
	constructor() {
		super({
			id: 'novaTaskRunner.runTask',
			title: localize2('runTask', "Run Task..."),
			category: localize2('tasks', "Tasks"),
			f1: true,
			icon: Codicon.play,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const taskService = accessor.get(ITaskService);
		const quickInputService = accessor.get(IQuickInputService);

		const tasks = await taskService.tasks();

		if (tasks.length === 0) {
			return;
		}

		const items: (IQuickPickItem & { task: Task })[] = tasks.map(task => ({
			label: task._label,
			description: task.getQualifiedLabel ? task.getQualifiedLabel() : task._source.label,
			detail: task.command?.name || '',
			task
		}));

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('selectTaskToRun', "Select a task to run")
		});

		if (selected) {
			await taskService.run(selected.task);
		}
	}
});

// Command: Terminate Task
registerAction2(class TerminateTaskAction extends Action2 {
	constructor() {
		super({
			id: 'novaTaskRunner.terminateTask',
			title: localize2('terminateTask', "Terminate Task..."),
			category: localize2('tasks', "Tasks"),
			f1: true,
			icon: Codicon.debugStop
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const taskService = accessor.get(ITaskService);
		const quickInputService = accessor.get(IQuickInputService);

		const activeTasks = await taskService.getActiveTasks();

		if (activeTasks.length === 0) {
			return;
		}

		const items: (IQuickPickItem & { task: Task })[] = activeTasks.map(task => ({
			label: task._label,
			description: 'Running',
			task
		}));

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('selectTaskToTerminate', "Select a task to terminate")
		});

		if (selected) {
			await taskService.terminate(selected.task);
		}
	}
});

// Command: Refresh Tasks
registerAction2(class RefreshTasksAction extends Action2 {
	constructor() {
		super({
			id: 'novaTaskRunner.refreshTasks',
			title: localize2('refreshTasks', "Refresh Tasks"),
			category: localize2('tasks', "Tasks"),
			f1: true,
			icon: Codicon.refresh,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: { equals: [{ key: 'view' }, 'novaTaskRunner.taskList'] } as any,
				order: 1
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		// The view will refresh automatically via task service events
		// This is a placeholder for manual refresh if needed
	}
});
