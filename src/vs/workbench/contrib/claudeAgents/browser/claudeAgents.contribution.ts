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
import { ClaudeAgentsBrowserView } from './views/claudeAgentsBrowserView.js';
import { ClaudeAgentsEditorView } from './views/claudeAgentsEditorView.js';
import { ClaudeAgentsToolsView } from './views/claudeAgentsToolsView.js';

import './media/claudeAgents.css';

// Types
export interface IAgentDefinition {
	name: string;
	description: string;
	filePath: string;
	scope: 'project' | 'user';
	tools: string[];
	content: string;
}

export interface IToolDefinition {
	name: string;
	description: string;
	category: string;
}

// Available tools
export const AVAILABLE_TOOLS: IToolDefinition[] = [
	{ name: 'Read', description: 'Read file contents', category: 'file' },
	{ name: 'Write', description: 'Write/create files', category: 'file' },
	{ name: 'Edit', description: 'Edit existing files', category: 'file' },
	{ name: 'Glob', description: 'Find files by pattern', category: 'search' },
	{ name: 'Grep', description: 'Search file contents', category: 'search' },
	{ name: 'Bash', description: 'Execute shell commands', category: 'system' },
	{ name: 'WebFetch', description: 'Fetch web content', category: 'web' },
	{ name: 'WebSearch', description: 'Search the web', category: 'web' },
	{ name: 'TodoWrite', description: 'Manage task lists', category: 'system' },
	{ name: 'NotebookEdit', description: 'Edit Jupyter notebooks', category: 'file' },
	{ name: 'Task', description: 'Spawn subagents', category: 'system' },
];

// Register icons
const claudeAgentsIcon = registerIcon('claude-agents', Codicon.hubot, localize('claudeAgentsIcon', 'Icon for Claude Agents view container.'));

// Register view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.claudeAgents',
	title: localize('claudeAgents', 'Agents'),
	icon: claudeAgentsIcon,
	order: 13,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.claudeAgents', { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.claudeAgents',
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: false });

// Register views
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
	{
		id: 'claudeAgents.browser',
		name: localize('agentsBrowser', 'Agents'),
		ctorDescriptor: new SyncDescriptor(ClaudeAgentsBrowserView),
		order: 1,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeAgentsIcon,
	},
	{
		id: 'claudeAgents.editor',
		name: localize('agentEditor', 'Agent Editor'),
		ctorDescriptor: new SyncDescriptor(ClaudeAgentsEditorView),
		order: 2,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeAgentsIcon,
	},
	{
		id: 'claudeAgents.tools',
		name: localize('toolPermissions', 'Tool Permissions'),
		ctorDescriptor: new SyncDescriptor(ClaudeAgentsToolsView),
		order: 3,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: true,
		containerIcon: claudeAgentsIcon,
	}
], VIEW_CONTAINER);

// Agent templates
export const AGENT_TEMPLATES = {
	'code-reviewer': {
		name: 'code-reviewer',
		description: 'Reviews code for quality, bugs, and best practices',
		tools: ['Read', 'Grep', 'Glob'],
		content: `# Code Reviewer Agent

You are an expert code reviewer. When asked to review code:

1. **Quality Check**
   - Look for code smells and anti-patterns
   - Check naming conventions
   - Verify proper error handling

2. **Bug Detection**
   - Identify potential bugs and edge cases
   - Check for null/undefined issues
   - Look for race conditions

3. **Best Practices**
   - Ensure SOLID principles
   - Check for proper typing
   - Verify documentation

4. **Security**
   - Look for vulnerabilities
   - Check input validation
   - Verify authentication/authorization

Provide specific, actionable feedback with line references.`
	},
	'test-writer': {
		name: 'test-writer',
		description: 'Generates comprehensive tests for code',
		tools: ['Read', 'Write', 'Grep', 'Glob', 'Bash'],
		content: `# Test Writer Agent

You are an expert test engineer. When asked to write tests:

1. **Analyze the Code**
   - Understand the function/component purpose
   - Identify inputs and outputs
   - Find edge cases and error conditions

2. **Test Strategy**
   - Unit tests for individual functions
   - Integration tests for component interactions
   - Use appropriate mocking strategies

3. **Test Quality**
   - Follow AAA pattern (Arrange, Act, Assert)
   - Use descriptive test names
   - Test happy paths and error cases
   - Aim for high coverage

4. **Framework Conventions**
   - Use the project's testing framework
   - Follow existing test patterns
   - Place tests in appropriate directories`
	},
	'security-auditor': {
		name: 'security-auditor',
		description: 'Audits code for security vulnerabilities',
		tools: ['Read', 'Grep', 'Glob'],
		content: `# Security Auditor Agent

You are a security expert. When auditing code:

1. **OWASP Top 10**
   - SQL Injection
   - XSS (Cross-Site Scripting)
   - CSRF (Cross-Site Request Forgery)
   - Broken Authentication
   - Sensitive Data Exposure

2. **Code Analysis**
   - Check input validation
   - Review authentication flows
   - Verify authorization checks
   - Look for hardcoded secrets

3. **Dependencies**
   - Check for known vulnerabilities
   - Review package versions
   - Look for suspicious packages

4. **Reporting**
   - Severity classification (Critical/High/Medium/Low)
   - Specific location and remediation steps
   - References to security standards`
	},
	'refactoring': {
		name: 'refactoring',
		description: 'Refactors code for better quality and maintainability',
		tools: ['Read', 'Write', 'Edit', 'Grep', 'Glob'],
		content: `# Refactoring Agent

You are an expert at code refactoring. When refactoring:

1. **Analysis**
   - Identify code smells
   - Find duplication
   - Look for complexity issues

2. **Refactoring Patterns**
   - Extract functions/methods
   - Rename for clarity
   - Simplify conditionals
   - Remove dead code

3. **Preservation**
   - Maintain functionality
   - Keep existing tests passing
   - Preserve public interfaces

4. **Documentation**
   - Explain changes made
   - Note any breaking changes
   - Update comments if needed`
	},
	'documentation': {
		name: 'documentation',
		description: 'Generates and updates code documentation',
		tools: ['Read', 'Write', 'Edit', 'Glob'],
		content: `# Documentation Agent

You are a technical writer. When documenting code:

1. **Code Documentation**
   - Add JSDoc/docstrings to functions
   - Document parameters and return types
   - Include usage examples

2. **README Updates**
   - Project overview
   - Installation instructions
   - Usage examples
   - API reference

3. **Architecture Docs**
   - System design
   - Component relationships
   - Data flow diagrams

4. **Style**
   - Clear and concise
   - Consistent formatting
   - Code examples where helpful`
	},
	'explorer': {
		name: 'explorer',
		description: 'Explores and understands codebases',
		tools: ['Read', 'Grep', 'Glob'],
		content: `# Codebase Explorer Agent

You are an expert at understanding codebases. When exploring:

1. **Structure Analysis**
   - Map directory structure
   - Identify key files and entry points
   - Understand module organization

2. **Pattern Recognition**
   - Identify frameworks used
   - Find architectural patterns
   - Spot coding conventions

3. **Dependency Mapping**
   - Trace import/export relationships
   - Identify shared utilities
   - Map component dependencies

4. **Documentation**
   - Summarize findings clearly
   - Highlight key areas
   - Note potential issues`
	}
};

// Register actions
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgents.createAgent',
			title: localize('createAgent', 'Create Agent'),
			f1: true,
			icon: Codicon.add,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyA,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		// Get agent name
		const name = await quickInputService.input({
			placeHolder: localize('agentName', 'Agent name (e.g., code-reviewer)'),
			title: localize('createAgent', 'Create Agent'),
			validateInput: async (value) => {
				if (!value || value.trim().length === 0) {
					return localize('nameRequired', 'Agent name is required');
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
			{ label: 'Project', description: '.claude/agents/', id: 'project' },
			{ label: 'User', description: '~/.claude/agents/', id: 'user' }
		], {
			placeHolder: localize('selectScope', 'Select agent scope'),
			title: localize('createAgent', 'Create Agent')
		});

		if (!scope) {
			return;
		}

		// Select template or blank
		const templateItems: IQuickPickItem[] = [
			{ label: 'Blank', description: 'Start from scratch', id: 'blank' },
			...Object.entries(AGENT_TEMPLATES).map(([id, tmpl]) => ({
				label: tmpl.name,
				description: tmpl.description,
				id
			}))
		];

		const template = await quickInputService.pick(templateItems, {
			placeHolder: localize('selectTemplate', 'Select template'),
			title: localize('createAgent', 'Create Agent')
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
			baseUri = URI.joinPath(folders[0].uri, '.claude/agents');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			baseUri = URI.file(`${homeDir}/.claude/agents`);
		}

		// Create directory if needed
		try {
			await fileService.createFolder(baseUri);
		} catch { }

		// Get template content
		let content: string;
		if (template.id === 'blank') {
			content = `---
name: ${name}
description: Brief description of what this agent does
tools: [Read, Grep, Glob]
---

# ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Agent

Instructions for the agent go here.

## When to Use
Describe when this agent should be invoked.

## Approach
1. First step
2. Second step
3. Third step

## Output
Describe expected output format.
`;
		} else {
			const tmpl = AGENT_TEMPLATES[template.id as keyof typeof AGENT_TEMPLATES];
			content = `---
name: ${name}
description: ${tmpl.description}
tools: [${tmpl.tools.join(', ')}]
---

${tmpl.content}
`;
		}

		// Create file
		const fileUri = URI.joinPath(baseUri, `${name}.md`);
		await fileService.writeFile(fileUri, new TextEncoder().encode(content));

		// Open in editor
		await editorService.openEditor({ resource: fileUri });

		notificationService.notify({
			severity: Severity.Info,
			message: localize('agentCreated', 'Created agent: {0}', name)
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgents.invokeAgent',
			title: localize('invokeAgent', 'Invoke Agent'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);

		// Gather all available agents
		const agents: IAgentDefinition[] = [];

		// Scan for project agents
		const folders = workspaceContextService.getWorkspace().folders;
		if (folders.length > 0) {
			const projectAgentsUri = URI.joinPath(folders[0].uri, '.claude/agents');
			try {
				const exists = await fileService.exists(projectAgentsUri);
				if (exists) {
					const files = await fileService.readdir(projectAgentsUri);
					for (const [name, type] of files) {
						if (name.endsWith('.md') && type === 1) {
							const content = await fileService.readFile(URI.joinPath(projectAgentsUri, name));
							const text = new TextDecoder().decode(content.value);
							const parsed = parseAgentFile(text);
							agents.push({
								name: parsed.name || name.replace('.md', ''),
								description: parsed.description || 'Project agent',
								filePath: URI.joinPath(projectAgentsUri, name).toString(),
								scope: 'project',
								tools: parsed.tools,
								content: parsed.content
							});
						}
					}
				}
			} catch { }
		}

		// Scan for user agents
		const homeDir = process.env.HOME || process.env.USERPROFILE || '';
		const userAgentsUri = URI.file(`${homeDir}/.claude/agents`);
		try {
			const exists = await fileService.exists(userAgentsUri);
			if (exists) {
				const files = await fileService.readdir(userAgentsUri);
				for (const [name, type] of files) {
					if (name.endsWith('.md') && type === 1) {
						const content = await fileService.readFile(URI.joinPath(userAgentsUri, name));
						const text = new TextDecoder().decode(content.value);
						const parsed = parseAgentFile(text);
						agents.push({
							name: parsed.name || name.replace('.md', ''),
							description: parsed.description || 'User agent',
							filePath: URI.joinPath(userAgentsUri, name).toString(),
							scope: 'user',
							tools: parsed.tools,
							content: parsed.content
						});
					}
				}
			}
		} catch { }

		if (agents.length === 0) {
			notificationService.notify({
				severity: Severity.Info,
				message: localize('noAgents', 'No agents configured. Create one with "Create Agent" command.')
			});
			return;
		}

		// Build quick pick items
		const items: IQuickPickItem[] = agents.map(agent => ({
			label: agent.name,
			description: agent.description,
			detail: `${agent.scope} \u2022 Tools: ${agent.tools.join(', ')}`,
			id: agent.name
		}));

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('selectAgent', 'Select an agent to invoke'),
			title: localize('invokeAgent', 'Invoke Agent'),
			matchOnDescription: true
		});

		if (!selected) {
			return;
		}

		// Get task for agent
		const task = await quickInputService.input({
			placeHolder: localize('enterTask', 'What should this agent do?'),
			title: `Invoke ${selected.label}`
		});

		if (!task) {
			return;
		}

		notificationService.notify({
			severity: Severity.Info,
			message: localize('invokingAgent', 'Invoking {0}...', selected.label)
		});

		// In production, this would send to Claude with the agent context
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeAgents.openAgentsFolder',
			title: localize('openAgentsFolder', 'Open Agents Folder'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const editorService = accessor.get(IEditorService);

		const scope = await quickInputService.pick([
			{ label: 'Project Agents', id: 'project' },
			{ label: 'User Agents', id: 'user' }
		], {
			placeHolder: localize('selectFolder', 'Select agents folder')
		});

		if (!scope) {
			return;
		}

		let folderUri: URI;
		if (scope.id === 'project') {
			const folders = workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) return;
			folderUri = URI.joinPath(folders[0].uri, '.claude/agents');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			folderUri = URI.file(`${homeDir}/.claude/agents`);
		}

		await editorService.openEditor({ resource: folderUri });
	}
});

// Helper function to parse agent file
function parseAgentFile(content: string): { name: string; description: string; tools: string[]; content: string } {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

	if (frontmatterMatch) {
		const frontmatter = frontmatterMatch[1];
		const body = frontmatterMatch[2].trim();

		const nameMatch = frontmatter.match(/name:\s*(.+)/);
		const descMatch = frontmatter.match(/description:\s*(.+)/);
		const toolsMatch = frontmatter.match(/tools:\s*\[([^\]]+)\]/);

		const name = nameMatch ? nameMatch[1].trim() : '';
		const description = descMatch ? descMatch[1].trim() : '';
		const tools = toolsMatch
			? toolsMatch[1].split(',').map(t => t.trim())
			: [];

		return { name, description, tools, content: body };
	}

	return { name: '', description: '', tools: [], content: content.trim() };
}

export { parseAgentFile };
