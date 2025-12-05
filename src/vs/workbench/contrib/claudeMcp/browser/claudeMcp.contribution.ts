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
import { ClaudeMcpServersView } from './views/claudeMcpServersView.js';
import { ClaudeMcpConfigView } from './views/claudeMcpConfigView.js';
import { ClaudeMcpLogsView } from './views/claudeMcpLogsView.js';

import './media/claudeMcp.css';

// Types
export interface IMcpServer {
	name: string;
	description: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
	scope: 'project' | 'user';
	status: 'connected' | 'disconnected' | 'error' | 'starting';
	tools?: string[];
	resources?: string[];
}

export interface IMcpServerConfig {
	mcpServers: Record<string, {
		command: string;
		args?: string[];
		env?: Record<string, string>;
	}>;
}

// Popular MCP servers
export const POPULAR_MCP_SERVERS = [
	{
		name: 'filesystem',
		description: 'Read/write access to local filesystem',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/dir'],
		category: 'file'
	},
	{
		name: 'github',
		description: 'GitHub repository operations',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-github'],
		env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
		category: 'dev'
	},
	{
		name: 'postgres',
		description: 'PostgreSQL database access',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-postgres', '${DATABASE_URL}'],
		category: 'database'
	},
	{
		name: 'sqlite',
		description: 'SQLite database access',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './database.db'],
		category: 'database'
	},
	{
		name: 'slack',
		description: 'Slack workspace integration',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-slack'],
		env: { SLACK_BOT_TOKEN: '${SLACK_BOT_TOKEN}' },
		category: 'communication'
	},
	{
		name: 'google-drive',
		description: 'Google Drive file access',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-gdrive'],
		category: 'file'
	},
	{
		name: 'puppeteer',
		description: 'Browser automation and web scraping',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-puppeteer'],
		category: 'web'
	},
	{
		name: 'brave-search',
		description: 'Brave search API integration',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-brave-search'],
		env: { BRAVE_API_KEY: '${BRAVE_API_KEY}' },
		category: 'web'
	},
	{
		name: 'memory',
		description: 'Knowledge graph-based memory',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-memory'],
		category: 'ai'
	},
	{
		name: 'everart',
		description: 'AI image generation',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-everart'],
		env: { EVERART_API_KEY: '${EVERART_API_KEY}' },
		category: 'ai'
	}
];

// Register icons
const claudeMcpIcon = registerIcon('claude-mcp', Codicon.server, localize('claudeMcpIcon', 'Icon for Claude MCP view container.'));

// Register view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.claudeMcp',
	title: localize('claudeMcp', 'MCP Servers'),
	icon: claudeMcpIcon,
	order: 14,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.claudeMcp', { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.claudeMcp',
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: false });

// Register views
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
	{
		id: 'claudeMcp.servers',
		name: localize('mcpServers', 'Servers'),
		ctorDescriptor: new SyncDescriptor(ClaudeMcpServersView),
		order: 1,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeMcpIcon,
	},
	{
		id: 'claudeMcp.config',
		name: localize('mcpConfig', 'Configuration'),
		ctorDescriptor: new SyncDescriptor(ClaudeMcpConfigView),
		order: 2,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeMcpIcon,
	},
	{
		id: 'claudeMcp.logs',
		name: localize('mcpLogs', 'Server Logs'),
		ctorDescriptor: new SyncDescriptor(ClaudeMcpLogsView),
		order: 3,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: true,
		containerIcon: claudeMcpIcon,
	}
], VIEW_CONTAINER);

// Register actions
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeMcp.addServer',
			title: localize('addMcpServer', 'Add MCP Server'),
			f1: true,
			icon: Codicon.add,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);

		// Select from popular servers or custom
		const serverOptions = [
			{ label: '$(add) Custom Server', description: 'Configure a custom MCP server', id: 'custom' },
			{ label: '', kind: -1 }, // Separator
			...POPULAR_MCP_SERVERS.map(s => ({
				label: `$(server) ${s.name}`,
				description: s.description,
				detail: `Category: ${s.category}`,
				id: s.name
			}))
		];

		const selected = await quickInputService.pick(serverOptions as any, {
			placeHolder: localize('selectServer', 'Select an MCP server to add'),
			title: localize('addMcpServer', 'Add MCP Server')
		});

		if (!selected) {
			return;
		}

		let serverConfig: { name: string; command: string; args?: string[]; env?: Record<string, string> };

		if (selected.id === 'custom') {
			// Get custom server name
			const name = await quickInputService.input({
				placeHolder: localize('serverName', 'Server name (e.g., my-server)'),
				title: localize('addMcpServer', 'Add MCP Server'),
				validateInput: async (value) => {
					if (!value || value.trim().length === 0) {
						return localize('nameRequired', 'Server name is required');
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

			// Get command
			const command = await quickInputService.input({
				placeHolder: localize('serverCommand', 'Command (e.g., npx, node, python)'),
				title: `Configure ${name}`,
			});

			if (!command) {
				return;
			}

			// Get args
			const argsInput = await quickInputService.input({
				placeHolder: localize('serverArgs', 'Arguments (space-separated, optional)'),
				title: `Configure ${name}`,
			});

			serverConfig = {
				name,
				command,
				args: argsInput ? argsInput.split(' ').filter(a => a.length > 0) : undefined
			};
		} else {
			const template = POPULAR_MCP_SERVERS.find(s => s.name === selected.id);
			if (!template) {
				return;
			}

			serverConfig = {
				name: template.name,
				command: template.command,
				args: template.args,
				env: template.env
			};
		}

		// Select scope
		const scope = await quickInputService.pick([
			{ label: 'Project', description: '.claude.json in workspace', id: 'project' },
			{ label: 'User', description: '~/.claude.json', id: 'user' }
		], {
			placeHolder: localize('selectScope', 'Where to save this configuration'),
			title: localize('addMcpServer', 'Add MCP Server')
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
			configUri = URI.joinPath(folders[0].uri, '.claude.json');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			configUri = URI.file(`${homeDir}/.claude.json`);
		}

		// Read existing config or create new
		let config: IMcpServerConfig = { mcpServers: {} };
		try {
			const exists = await fileService.exists(configUri);
			if (exists) {
				const content = await fileService.readFile(configUri);
				const text = new TextDecoder().decode(content.value);
				config = JSON.parse(text);
				if (!config.mcpServers) {
					config.mcpServers = {};
				}
			}
		} catch { }

		// Add server to config
		config.mcpServers[serverConfig.name] = {
			command: serverConfig.command,
			args: serverConfig.args,
			env: serverConfig.env
		};

		// Write config
		await fileService.writeFile(configUri, new TextEncoder().encode(JSON.stringify(config, null, 2)));

		notificationService.notify({
			severity: Severity.Info,
			message: localize('serverAdded', 'Added MCP server: {0}', serverConfig.name)
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeMcp.openConfig',
			title: localize('openMcpConfig', 'Open MCP Configuration'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const editorService = accessor.get(IEditorService);

		const scope = await quickInputService.pick([
			{ label: 'Project Configuration', id: 'project' },
			{ label: 'User Configuration', id: 'user' }
		], {
			placeHolder: localize('selectConfig', 'Select configuration file')
		});

		if (!scope) {
			return;
		}

		let configUri: URI;
		if (scope.id === 'project') {
			const folders = workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) return;
			configUri = URI.joinPath(folders[0].uri, '.claude.json');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			configUri = URI.file(`${homeDir}/.claude.json`);
		}

		await editorService.openEditor({ resource: configUri });
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeMcp.restartServer',
			title: localize('restartMcpServer', 'Restart MCP Server'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);

		notificationService.notify({
			severity: Severity.Info,
			message: localize('restartingServers', 'Restarting MCP servers...')
		});

		// In production, this would restart the actual MCP server connections
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeMcp.viewLogs',
			title: localize('viewMcpLogs', 'View MCP Server Logs'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);

		notificationService.notify({
			severity: Severity.Info,
			message: localize('openingLogs', 'Opening MCP server logs...')
		});

		// In production, this would open the logs view
	}
});

// Helper to parse MCP config
export function parseMcpConfig(content: string): IMcpServerConfig {
	try {
		const config = JSON.parse(content);
		return {
			mcpServers: config.mcpServers || {}
		};
	} catch {
		return { mcpServers: {} };
	}
}
