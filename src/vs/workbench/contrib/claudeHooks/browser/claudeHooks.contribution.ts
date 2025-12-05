/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewsRegistry, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';

// Import views
import { ClaudeHooksListView } from './views/claudeHooksListView.js';
import { ClaudeHooksEditorView } from './views/claudeHooksEditorView.js';

import './media/claudeHooks.css';

// Types
export interface IHookDefinition {
	type: HookType;
	command: string;
	pattern?: string;
	timeout?: number;
	description?: string;
	scope: 'project' | 'user';
	enabled: boolean;
}

export type HookType =
	| 'PreToolUse'
	| 'PostToolUse'
	| 'Notification'
	| 'Stop'
	| 'SubagentStop';

export interface IHooksConfig {
	hooks?: {
		PreToolUse?: IHookEntry[];
		PostToolUse?: IHookEntry[];
		Notification?: IHookEntry[];
		Stop?: IHookEntry[];
		SubagentStop?: IHookEntry[];
	};
}

export interface IHookEntry {
	matcher?: string;
	hooks: string[];
}

// Hook type info
export const HOOK_TYPES: Record<HookType, { name: string; description: string; icon: string }> = {
	'PreToolUse': {
		name: 'Pre Tool Use',
		description: 'Runs before a tool is executed. Can block or modify tool calls.',
		icon: 'play'
	},
	'PostToolUse': {
		name: 'Post Tool Use',
		description: 'Runs after a tool completes. Can inspect results.',
		icon: 'check'
	},
	'Notification': {
		name: 'Notification',
		description: 'Triggered for status updates and notifications.',
		icon: 'bell'
	},
	'Stop': {
		name: 'Stop',
		description: 'Runs when the main agent stops or completes.',
		icon: 'stop-circle'
	},
	'SubagentStop': {
		name: 'Subagent Stop',
		description: 'Runs when a subagent (Task tool) completes.',
		icon: 'debug-stop'
	}
};

// Example hooks
export const EXAMPLE_HOOKS: Record<string, { type: HookType; command: string; pattern?: string; description: string }> = {
	'lint-on-edit': {
		type: 'PostToolUse',
		command: 'npm run lint -- $TOOL_INPUT_FILE 2>&1 || true',
		pattern: 'Edit|Write',
		description: 'Run linter after file edits'
	},
	'format-on-write': {
		type: 'PostToolUse',
		command: 'npx prettier --write $TOOL_INPUT_FILE',
		pattern: 'Write',
		description: 'Format files after writing'
	},
	'test-on-edit': {
		type: 'PostToolUse',
		command: 'npm test -- --findRelatedTests $TOOL_INPUT_FILE 2>&1 | head -50',
		pattern: 'Edit|Write',
		description: 'Run related tests after edits'
	},
	'audit-bash': {
		type: 'PreToolUse',
		command: 'echo "Executing: $TOOL_INPUT_COMMAND"',
		pattern: 'Bash',
		description: 'Log bash commands before execution'
	},
	'notify-slack': {
		type: 'Stop',
		command: 'curl -X POST -H "Content-type: application/json" --data \'{"text":"Claude session completed"}\' $SLACK_WEBHOOK_URL',
		description: 'Send Slack notification when session ends'
	},
	'git-status': {
		type: 'Stop',
		command: 'git status --short',
		description: 'Show git status when session ends'
	}
};

// Register icons
const claudeHooksIcon = registerIcon('claude-hooks', Codicon.zap, localize('claudeHooksIcon', 'Icon for Claude Hooks view container.'));

// Register view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.claudeHooks',
	title: localize('claudeHooks', 'Hooks'),
	icon: claudeHooksIcon,
	order: 15,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.claudeHooks', { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.claudeHooks',
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: false });

// Register views
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
	{
		id: 'claudeHooks.list',
		name: localize('hooksList', 'Configured Hooks'),
		ctorDescriptor: new SyncDescriptor(ClaudeHooksListView),
		order: 1,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeHooksIcon,
	},
	{
		id: 'claudeHooks.editor',
		name: localize('hooksEditor', 'Hook Editor'),
		ctorDescriptor: new SyncDescriptor(ClaudeHooksEditorView),
		order: 2,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeHooksIcon,
	}
], VIEW_CONTAINER);

// Register actions
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeHooks.addHook',
			title: localize('addHook', 'Add Hook'),
			f1: true,
			icon: Codicon.add,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);

		// Select hook type
		const hookTypes = Object.entries(HOOK_TYPES).map(([type, info]) => ({
			label: `$(${info.icon}) ${info.name}`,
			description: info.description,
			id: type
		}));

		const selectedType = await quickInputService.pick(hookTypes, {
			placeHolder: localize('selectHookType', 'Select hook type'),
			title: localize('addHook', 'Add Hook')
		});

		if (!selectedType) {
			return;
		}

		// Select from examples or create custom
		const exampleOptions = [
			{ label: '$(add) Custom Hook', description: 'Create a custom hook command', id: 'custom' },
			{ label: '', kind: -1 } as any, // Separator
			...Object.entries(EXAMPLE_HOOKS)
				.filter(([_, h]) => h.type === selectedType.id)
				.map(([id, h]) => ({
					label: `$(code) ${id}`,
					description: h.description,
					detail: h.command,
					id
				}))
		];

		const selected = await quickInputService.pick(exampleOptions, {
			placeHolder: localize('selectTemplate', 'Select template or create custom'),
			title: localize('addHook', 'Add Hook')
		});

		if (!selected) {
			return;
		}

		let command: string;
		let pattern: string | undefined;

		if (selected.id === 'custom') {
			// Get custom command
			const inputCommand = await quickInputService.input({
				placeHolder: localize('hookCommand', 'Shell command to execute'),
				title: `${HOOK_TYPES[selectedType.id as HookType].name} Hook`,
				prompt: localize('hookCommandPrompt', 'Use $TOOL_INPUT_*, $TOOL_OUTPUT_* for context')
			});

			if (!inputCommand) {
				return;
			}

			command = inputCommand;

			// Get optional pattern for tool hooks
			if (selectedType.id === 'PreToolUse' || selectedType.id === 'PostToolUse') {
				const inputPattern = await quickInputService.input({
					placeHolder: localize('hookPattern', 'Tool pattern (optional, e.g., Edit|Write)'),
					title: `${HOOK_TYPES[selectedType.id as HookType].name} Hook`
				});

				pattern = inputPattern || undefined;
			}
		} else {
			const example = EXAMPLE_HOOKS[selected.id];
			command = example.command;
			pattern = example.pattern;
		}

		// Select scope
		const scope = await quickInputService.pick([
			{ label: 'Project', description: '.claude/settings.json', id: 'project' },
			{ label: 'User', description: '~/.claude/settings.json', id: 'user' }
		], {
			placeHolder: localize('selectScope', 'Where to save this hook'),
			title: localize('addHook', 'Add Hook')
		});

		if (!scope) {
			return;
		}

		// Determine config file location
		let configUri: URI;
		if (scope.id === 'project') {
			const folders = workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) {
				notificationService.notify({
					severity: Severity.Warning,
					message: localize('noWorkspace', 'No workspace folder open')
				});
				return;
			}
			configUri = URI.joinPath(folders[0].uri, '.claude/settings.json');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			configUri = URI.file(`${homeDir}/.claude/settings.json`);
		}

		// Read existing config or create new
		let config: IHooksConfig = {};
		try {
			const exists = await fileService.exists(configUri);
			if (exists) {
				const content = await fileService.readFile(configUri);
				const text = new TextDecoder().decode(content.value);
				config = JSON.parse(text);
			}
		} catch { }

		// Initialize hooks structure
		if (!config.hooks) {
			config.hooks = {};
		}

		const hookType = selectedType.id as HookType;
		if (!config.hooks[hookType]) {
			config.hooks[hookType] = [];
		}

		// Add the hook
		const hookEntry: IHookEntry = {
			hooks: [command]
		};
		if (pattern) {
			hookEntry.matcher = pattern;
		}

		config.hooks[hookType]!.push(hookEntry);

		// Ensure parent directory exists
		try {
			const parentUri = URI.joinPath(configUri, '..');
			await fileService.createFolder(parentUri);
		} catch { }

		// Write config
		await fileService.writeFile(configUri, new TextEncoder().encode(JSON.stringify(config, null, 2)));

		notificationService.notify({
			severity: Severity.Info,
			message: localize('hookAdded', 'Added {0} hook', HOOK_TYPES[hookType].name)
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeHooks.openSettings',
			title: localize('openHooksSettings', 'Open Hooks Settings'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const editorService = accessor.get(IEditorService);

		const scope = await quickInputService.pick([
			{ label: 'Project Settings', id: 'project' },
			{ label: 'User Settings', id: 'user' }
		], {
			placeHolder: localize('selectSettings', 'Select settings file')
		});

		if (!scope) {
			return;
		}

		let configUri: URI;
		if (scope.id === 'project') {
			const folders = workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) return;
			configUri = URI.joinPath(folders[0].uri, '.claude/settings.json');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			configUri = URI.file(`${homeDir}/.claude/settings.json`);
		}

		await editorService.openEditor({ resource: configUri });
	}
});

// Helper to parse hooks config
export function parseHooksConfig(content: string): IHooksConfig {
	try {
		return JSON.parse(content);
	} catch {
		return {};
	}
}
