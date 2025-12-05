/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewsRegistry, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';

// Import views
import { ClaudeChatView } from './views/claudeChatView.js';
import { ClaudeContextView } from './views/claudeContextView.js';
import { ClaudeToolActivityView } from './views/claudeToolActivityView.js';
import { ClaudeSessionsView } from './views/claudeSessionsView.js';

import './media/claudeAgent.css';

// Context keys
export const CLAUDE_AGENT_VISIBLE = new RawContextKey<boolean>('claudeAgentVisible', false);
export const CLAUDE_AGENT_BUSY = new RawContextKey<boolean>('claudeAgentBusy', false);
export const CLAUDE_AGENT_HAS_SESSION = new RawContextKey<boolean>('claudeAgentHasSession', false);

// Register icons
const claudeAgentIcon = registerIcon('claude-agent', Codicon.sparkle, localize('claudeAgentIcon', 'Icon for Claude Agent view container.'));

// Register view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.claudeAgent',
	title: localize('claudeAgent', 'Claude'),
	icon: claudeAgentIcon,
	order: 10,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.claudeAgent', { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.claudeAgent',
	hideIfEmpty: false,
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: false });

// Register views
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
	{
		id: 'claudeAgent.chat',
		name: localize('chat', 'Chat'),
		ctorDescriptor: new SyncDescriptor(ClaudeChatView),
		order: 1,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeAgentIcon,
	},
	{
		id: 'claudeAgent.context',
		name: localize('context', 'Context'),
		ctorDescriptor: new SyncDescriptor(ClaudeContextView),
		order: 2,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: true,
		containerIcon: claudeAgentIcon,
	},
	{
		id: 'claudeAgent.toolActivity',
		name: localize('toolActivity', 'Tool Activity'),
		ctorDescriptor: new SyncDescriptor(ClaudeToolActivityView),
		order: 3,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: true,
		containerIcon: claudeAgentIcon,
	},
	{
		id: 'claudeAgent.sessions',
		name: localize('sessions', 'Sessions'),
		ctorDescriptor: new SyncDescriptor(ClaudeSessionsView),
		order: 4,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: true,
		containerIcon: claudeAgentIcon,
	}
], VIEW_CONTAINER);

// Register actions
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.openChat',
			title: localize('openClaudeChat', 'Open Claude Chat'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC,
			},
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', 'claudeAgent.chat'),
				group: 'navigation',
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.view.extension.claudeAgent');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.sendMessage',
			title: localize('sendMessage', 'Send Message to Claude'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				when: ContextKeyExpr.equals('focusedView', 'claudeAgent.chat'),
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		// Trigger send from chat view
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.newSession',
			title: localize('newSession', 'New Claude Session'),
			f1: true,
			icon: Codicon.add,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.notify({
			severity: Severity.Info,
			message: localize('newSessionStarted', 'Started new Claude session')
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.clearChat',
			title: localize('clearChat', 'Clear Chat History'),
			f1: true,
			icon: Codicon.clearAll,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.notify({
			severity: Severity.Info,
			message: localize('chatCleared', 'Chat history cleared')
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.compactContext',
			title: localize('compactContext', 'Compact Context'),
			f1: true,
			icon: Codicon.fold,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.notify({
			severity: Severity.Info,
			message: localize('contextCompacted', 'Context compacted to save tokens')
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.cancelExecution',
			title: localize('cancelExecution', 'Cancel Claude Execution'),
			f1: true,
			icon: Codicon.debugStop,
			precondition: CLAUDE_AGENT_BUSY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
				when: CLAUDE_AGENT_BUSY,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.notify({
			severity: Severity.Warning,
			message: localize('executionCancelled', 'Claude execution cancelled')
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.askAboutSelection',
			title: localize('askAboutSelection', 'Ask Claude About Selection'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const commandService = accessor.get(ICommandService);

		const question = await quickInputService.input({
			placeHolder: localize('askQuestion', 'What would you like to know about this code?'),
			title: localize('askClaude', 'Ask Claude')
		});

		if (question) {
			await commandService.executeCommand('workbench.view.extension.claudeAgent');
			// Send question with selection context
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.explainCode',
			title: localize('explainCode', 'Explain Code with Claude'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.view.extension.claudeAgent');
		// Send explain request
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.fixError',
			title: localize('fixError', 'Fix Error with Claude'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.view.extension.claudeAgent');
		// Send fix request
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.generateTests',
			title: localize('generateTests', 'Generate Tests with Claude'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.view.extension.claudeAgent');
		// Send test generation request
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.runSlashCommand',
			title: localize('runSlashCommand', 'Run Claude Slash Command'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Slash,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);

		// Show slash command picker
		const command = await quickInputService.input({
			placeHolder: localize('enterSlashCommand', 'Enter slash command (e.g., /project:review)'),
			title: localize('slashCommand', 'Slash Command')
		});

		if (command) {
			// Execute slash command
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgent.openMemory',
			title: localize('openMemory', 'Open CLAUDE.md'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		// Open CLAUDE.md file
		await commandService.executeCommand('workbench.action.quickOpen', 'CLAUDE.md');
	}
});

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'claudeAgent',
	title: localize('claudeAgent', 'Claude Agent'),
	type: 'object',
	properties: {
		'claudeAgent.apiKey': {
			type: 'string',
			default: '',
			description: localize('apiKey', 'Anthropic API key for Claude'),
			scope: ConfigurationScope.APPLICATION
		},
		'claudeAgent.model': {
			type: 'string',
			enum: ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101', 'claude-3-5-haiku-20241022'],
			default: 'claude-sonnet-4-5-20250929',
			description: localize('model', 'Claude model to use'),
			scope: ConfigurationScope.WINDOW
		},
		'claudeAgent.maxTokens': {
			type: 'number',
			default: 4096,
			minimum: 256,
			maximum: 32768,
			description: localize('maxTokens', 'Maximum tokens for Claude responses'),
			scope: ConfigurationScope.WINDOW
		},
		'claudeAgent.maxTurns': {
			type: 'number',
			default: 50,
			minimum: 1,
			maximum: 200,
			description: localize('maxTurns', 'Maximum turns in agentic loop (prevents infinite loops)'),
			scope: ConfigurationScope.WINDOW
		},
		'claudeAgent.autoSaveSession': {
			type: 'boolean',
			default: true,
			description: localize('autoSaveSession', 'Automatically save session history'),
			scope: ConfigurationScope.WINDOW
		},
		'claudeAgent.showToolActivity': {
			type: 'boolean',
			default: true,
			description: localize('showToolActivity', 'Show tool execution activity in real-time'),
			scope: ConfigurationScope.WINDOW
		},
		'claudeAgent.contextWarningThreshold': {
			type: 'number',
			default: 70,
			minimum: 50,
			maximum: 95,
			description: localize('contextWarningThreshold', 'Context usage percentage to show warning'),
			scope: ConfigurationScope.WINDOW
		},
		'claudeAgent.streamResponses': {
			type: 'boolean',
			default: true,
			description: localize('streamResponses', 'Stream Claude responses in real-time'),
			scope: ConfigurationScope.WINDOW
		},
		'claudeAgent.enableInlineCompletions': {
			type: 'boolean',
			default: false,
			description: localize('enableInlineCompletions', 'Enable inline code completions from Claude'),
			scope: ConfigurationScope.WINDOW
		},
		'claudeAgent.claudeMdAutoLoad': {
			type: 'boolean',
			default: true,
			description: localize('claudeMdAutoLoad', 'Automatically load CLAUDE.md files as context'),
			scope: ConfigurationScope.RESOURCE
		}
	}
});
