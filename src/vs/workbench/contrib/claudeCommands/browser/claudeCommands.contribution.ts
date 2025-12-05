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
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';

// Import views
import { ClaudeCommandsBrowserView } from './views/claudeCommandsBrowserView.js';
import { ClaudeCommandsEditorView } from './views/claudeCommandsEditorView.js';

import './media/claudeCommands.css';

// Types
export interface ISlashCommand {
	name: string;
	description: string;
	filePath: string;
	scope: 'project' | 'user' | 'builtin';
	content: string;
	hasArguments: boolean;
}

// Register icons
const claudeCommandsIcon = registerIcon('claude-commands', Codicon.terminal, localize('claudeCommandsIcon', 'Icon for Claude Commands view container.'));

// Register view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.claudeCommands',
	title: localize('claudeCommands', 'Slash Commands'),
	icon: claudeCommandsIcon,
	order: 12,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.claudeCommands', { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.claudeCommands',
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: false });

// Register views
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
	{
		id: 'claudeCommands.browser',
		name: localize('commandsBrowser', 'Commands'),
		ctorDescriptor: new SyncDescriptor(ClaudeCommandsBrowserView),
		order: 1,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeCommandsIcon,
	},
	{
		id: 'claudeCommands.editor',
		name: localize('commandEditor', 'Command Editor'),
		ctorDescriptor: new SyncDescriptor(ClaudeCommandsEditorView),
		order: 2,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeCommandsIcon,
	}
], VIEW_CONTAINER);

// Built-in commands
export const BUILTIN_COMMANDS: ISlashCommand[] = [
	{
		name: 'help',
		description: 'Show available commands and help',
		filePath: '',
		scope: 'builtin',
		content: 'Show me the available commands and how to use Claude effectively.',
		hasArguments: false
	},
	{
		name: 'explain',
		description: 'Explain the selected code',
		filePath: '',
		scope: 'builtin',
		content: 'Explain the following code in detail, including what it does, how it works, and any important patterns or concepts:\n\n$SELECTION',
		hasArguments: false
	},
	{
		name: 'fix',
		description: 'Fix issues in the selected code',
		filePath: '',
		scope: 'builtin',
		content: 'Fix any issues, bugs, or problems in the following code. Explain what was wrong and how you fixed it:\n\n$SELECTION',
		hasArguments: false
	},
	{
		name: 'refactor',
		description: 'Refactor the selected code',
		filePath: '',
		scope: 'builtin',
		content: 'Refactor the following code to improve its quality, readability, and maintainability. Explain the changes:\n\n$SELECTION',
		hasArguments: false
	},
	{
		name: 'test',
		description: 'Generate tests for the selected code',
		filePath: '',
		scope: 'builtin',
		content: 'Generate comprehensive unit tests for the following code. Use the appropriate testing framework for this project:\n\n$SELECTION',
		hasArguments: false
	},
	{
		name: 'doc',
		description: 'Add documentation to the selected code',
		filePath: '',
		scope: 'builtin',
		content: 'Add comprehensive documentation comments to the following code, including JSDoc/docstrings for functions, parameters, and return values:\n\n$SELECTION',
		hasArguments: false
	},
	{
		name: 'review',
		description: 'Review code for issues and improvements',
		filePath: '',
		scope: 'builtin',
		content: 'Review the following code for potential issues, bugs, security vulnerabilities, performance problems, and areas for improvement:\n\n$SELECTION',
		hasArguments: false
	},
	{
		name: 'optimize',
		description: 'Optimize code for performance',
		filePath: '',
		scope: 'builtin',
		content: 'Optimize the following code for better performance. Explain the optimizations and their expected impact:\n\n$SELECTION',
		hasArguments: false
	},
	{
		name: 'memory',
		description: 'Show loaded memory files',
		filePath: '',
		scope: 'builtin',
		content: 'List all currently loaded CLAUDE.md memory files and their contents summary.',
		hasArguments: false
	},
	{
		name: 'compact',
		description: 'Compact the conversation context',
		filePath: '',
		scope: 'builtin',
		content: 'Summarize and compact the current conversation to save context tokens while preserving important information.',
		hasArguments: false
	},
	{
		name: 'clear',
		description: 'Clear conversation history',
		filePath: '',
		scope: 'builtin',
		content: 'Clear the current conversation history and start fresh.',
		hasArguments: false
	},
	{
		name: 'init',
		description: 'Generate CLAUDE.md from project',
		filePath: '',
		scope: 'builtin',
		content: 'Analyze this project and generate a comprehensive CLAUDE.md file with project overview, tech stack, directory structure, and development guidelines.',
		hasArguments: false
	}
];

// Command templates for new commands
export const COMMAND_TEMPLATES = {
	basic: `---
description: Brief description of what this command does
---

Your prompt instructions here.

Use $ARGUMENTS to reference any arguments passed to the command.
`,
	review: `---
description: Review code for specific criteria
---

Please review the following code for:
1. Code quality and best practices
2. Potential bugs or issues
3. Performance considerations
4. Security vulnerabilities

$SELECTION

Provide specific, actionable feedback.
`,
	generate: `---
description: Generate code based on requirements
---

Generate the following: $ARGUMENTS

Requirements:
- Follow project coding conventions
- Include proper error handling
- Add appropriate comments
- Write clean, maintainable code
`,
	analyze: `---
description: Analyze code or architecture
---

Analyze the following and provide insights:

$SELECTION

Consider:
- Design patterns used
- Potential improvements
- Scalability considerations
- Maintainability
`
};

// Register actions
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeCommands.runCommand',
			title: localize('runSlashCommand', 'Run Slash Command'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Slash,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);

		// Gather all available commands
		const commands: ISlashCommand[] = [...BUILTIN_COMMANDS];

		// Scan for project commands
		const folders = workspaceContextService.getWorkspace().folders;
		if (folders.length > 0) {
			const projectCommandsUri = URI.joinPath(folders[0].uri, '.claude/commands');
			try {
				const exists = await fileService.exists(projectCommandsUri);
				if (exists) {
					const files = await fileService.readdir(projectCommandsUri);
					for (const [name, type] of files) {
						if (name.endsWith('.md') && type === 1) { // FileType.File = 1
							const content = await fileService.readFile(URI.joinPath(projectCommandsUri, name));
							const text = new TextDecoder().decode(content.value);
							const parsed = parseCommandFile(text);
							commands.push({
								name: `project:${name.replace('.md', '')}`,
								description: parsed.description || 'Project command',
								filePath: URI.joinPath(projectCommandsUri, name).toString(),
								scope: 'project',
								content: parsed.content,
								hasArguments: text.includes('$ARGUMENTS')
							});
						}
					}
				}
			} catch { }
		}

		// Scan for user commands
		const homeDir = process.env.HOME || process.env.USERPROFILE || '';
		const userCommandsUri = URI.file(`${homeDir}/.claude/commands`);
		try {
			const exists = await fileService.exists(userCommandsUri);
			if (exists) {
				const files = await fileService.readdir(userCommandsUri);
				for (const [name, type] of files) {
					if (name.endsWith('.md') && type === 1) {
						const content = await fileService.readFile(URI.joinPath(userCommandsUri, name));
						const text = new TextDecoder().decode(content.value);
						const parsed = parseCommandFile(text);
						commands.push({
							name: `user:${name.replace('.md', '')}`,
							description: parsed.description || 'User command',
							filePath: URI.joinPath(userCommandsUri, name).toString(),
							scope: 'user',
							content: parsed.content,
							hasArguments: text.includes('$ARGUMENTS')
						});
					}
				}
			}
		} catch { }

		// Build quick pick items
		const items: IQuickPickItem[] = commands.map(cmd => ({
			label: `/${cmd.name}`,
			description: cmd.description,
			detail: cmd.scope !== 'builtin' ? `(${cmd.scope})` : undefined,
			id: cmd.name
		}));

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('selectCommand', 'Select a slash command'),
			title: localize('slashCommands', 'Slash Commands'),
			matchOnDescription: true
		});

		if (!selected) {
			return;
		}

		const command = commands.find(c => c.name === selected.id);
		if (!command) {
			return;
		}

		// Get arguments if needed
		let args = '';
		if (command.hasArguments) {
			args = await quickInputService.input({
				placeHolder: localize('enterArguments', 'Enter command arguments'),
				title: `/${command.name}`
			}) || '';
		}

		// Execute command
		notificationService.notify({
			severity: Severity.Info,
			message: localize('executingCommand', 'Executing /{0}...', command.name)
		});

		// In production, this would send to Claude with the command content
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeCommands.createCommand',
			title: localize('createCommand', 'Create Slash Command'),
			f1: true,
			icon: Codicon.add,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		// Get command name
		const name = await quickInputService.input({
			placeHolder: localize('commandName', 'Command name (e.g., review-pr)'),
			title: localize('createCommand', 'Create Slash Command'),
			validateInput: async (value) => {
				if (!value || value.trim().length === 0) {
					return localize('nameRequired', 'Command name is required');
				}
				if (!/^[a-z0-9-]+$/.test(value)) {
					return localize('invalidName', 'Use lowercase letters, numbers, and hyphens only');
				}
				return undefined;
			}
		});

		if (!name) {
			return;
		}

		// Select scope
		const scope = await quickInputService.pick([
			{ label: 'Project', description: '.claude/commands/', id: 'project' },
			{ label: 'User', description: '~/.claude/commands/', id: 'user' }
		], {
			placeHolder: localize('selectScope', 'Select command scope'),
			title: localize('createCommand', 'Create Slash Command')
		});

		if (!scope) {
			return;
		}

		// Select template
		const template = await quickInputService.pick([
			{ label: 'Basic', description: 'Simple command template', id: 'basic' },
			{ label: 'Review', description: 'Code review command', id: 'review' },
			{ label: 'Generate', description: 'Code generation command', id: 'generate' },
			{ label: 'Analyze', description: 'Analysis command', id: 'analyze' },
		], {
			placeHolder: localize('selectTemplate', 'Select template'),
			title: localize('createCommand', 'Create Slash Command')
		});

		if (!template) {
			return;
		}

		// Build file path
		let baseUri: URI;
		if (scope.id === 'project') {
			const folders = workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) {
				notificationService.notify({
					severity: Severity.Warning,
					message: localize('noWorkspace', 'No workspace folder open')
				});
				return;
			}
			baseUri = URI.joinPath(folders[0].uri, '.claude/commands');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			baseUri = URI.file(`${homeDir}/.claude/commands`);
		}

		// Create directory if needed
		try {
			await fileService.createFolder(baseUri);
		} catch { }

		// Create file
		const fileUri = URI.joinPath(baseUri, `${name}.md`);
		const content = COMMAND_TEMPLATES[template.id as keyof typeof COMMAND_TEMPLATES] || COMMAND_TEMPLATES.basic;

		await fileService.writeFile(fileUri, new TextEncoder().encode(content));

		// Open in editor
		await editorService.openEditor({ resource: fileUri });

		notificationService.notify({
			severity: Severity.Info,
			message: localize('commandCreated', 'Created command: /{0}', scope.id === 'project' ? `project:${name}` : `user:${name}`)
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeCommands.openCommandsFolder',
			title: localize('openCommandsFolder', 'Open Commands Folder'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const editorService = accessor.get(IEditorService);

		const scope = await quickInputService.pick([
			{ label: 'Project Commands', id: 'project' },
			{ label: 'User Commands', id: 'user' }
		], {
			placeHolder: localize('selectFolder', 'Select commands folder')
		});

		if (!scope) {
			return;
		}

		let folderUri: URI;
		if (scope.id === 'project') {
			const folders = workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) return;
			folderUri = URI.joinPath(folders[0].uri, '.claude/commands');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			folderUri = URI.file(`${homeDir}/.claude/commands`);
		}

		// Open folder in file explorer
		await editorService.openEditor({ resource: folderUri });
	}
});

// Helper function to parse command file
function parseCommandFile(content: string): { description: string; content: string } {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

	if (frontmatterMatch) {
		const frontmatter = frontmatterMatch[1];
		const body = frontmatterMatch[2].trim();

		const descMatch = frontmatter.match(/description:\s*(.+)/);
		const description = descMatch ? descMatch[1].trim() : '';

		return { description, content: body };
	}

	return { description: '', content: content.trim() };
}
