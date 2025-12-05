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
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { IMcpServer, POPULAR_MCP_SERVERS, parseMcpConfig } from '../claudeMcp.contribution.js';

export class ClaudeMcpServersView extends ViewPane {

	private container!: HTMLElement;
	private serversList!: HTMLElement;
	private servers: IMcpServer[] = [];

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
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-mcp-servers-view');

		// Header
		const header = append(this.container, $('.claude-mcp-header'));
		header.innerHTML = `
			<div class="header-content">
				<span class="codicon codicon-server"></span>
				<div class="header-text">
					<strong>${localize('mcpServers', 'MCP Servers')}</strong>
					<span>${localize('mcpServersDesc', 'Model Context Protocol server connections')}</span>
				</div>
			</div>
		`;

		// Toolbar
		const toolbar = append(this.container, $('.claude-mcp-toolbar'));

		const addBtn = append(toolbar, $('button.claude-mcp-btn.primary'));
		addBtn.innerHTML = '<span class="codicon codicon-add"></span> ' + localize('add', 'Add Server');
		addBtn.onclick = () => this.commandService.executeCommand('claudeMcp.addServer');

		const refreshBtn = append(toolbar, $('button.claude-mcp-btn'));
		refreshBtn.innerHTML = '<span class="codicon codicon-refresh"></span>';
		refreshBtn.title = localize('refresh', 'Refresh');
		refreshBtn.onclick = () => this.loadServers();

		const restartBtn = append(toolbar, $('button.claude-mcp-btn'));
		restartBtn.innerHTML = '<span class="codicon codicon-debug-restart"></span>';
		restartBtn.title = localize('restartAll', 'Restart All');
		restartBtn.onclick = () => this.restartAllServers();

		// Servers list
		this.serversList = append(this.container, $('.claude-mcp-servers-list'));

		// Popular servers section
		const popularSection = append(this.container, $('.claude-mcp-popular'));
		const popularHeader = append(popularSection, $('.claude-mcp-section-header'));
		popularHeader.innerHTML = `<span class="codicon codicon-star"></span> ${localize('popular', 'Popular Servers')}`;

		const popularGrid = append(popularSection, $('.claude-mcp-popular-grid'));
		this.renderPopularServers(popularGrid);

		// Initial load
		this.loadServers();
	}

	private async loadServers(): Promise<void> {
		this.servers = [];

		// Load from project config
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length > 0) {
			const projectConfigUri = URI.joinPath(folders[0].uri, '.claude.json');
			try {
				const exists = await this.fileService.exists(projectConfigUri);
				if (exists) {
					const content = await this.fileService.readFile(projectConfigUri);
					const text = new TextDecoder().decode(content.value);
					const config = parseMcpConfig(text);

					for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
						this.servers.push({
							name,
							description: `Project MCP server`,
							command: serverConfig.command,
							args: serverConfig.args,
							env: serverConfig.env,
							scope: 'project',
							status: 'disconnected'
						});
					}
				}
			} catch { }
		}

		// Load from user config
		const homeDir = process.env.HOME || process.env.USERPROFILE || '';
		const userConfigUri = URI.file(`${homeDir}/.claude.json`);
		try {
			const exists = await this.fileService.exists(userConfigUri);
			if (exists) {
				const content = await this.fileService.readFile(userConfigUri);
				const text = new TextDecoder().decode(content.value);
				const config = parseMcpConfig(text);

				for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
					// Skip if already added from project
					if (this.servers.some(s => s.name === name)) {
						continue;
					}

					this.servers.push({
						name,
						description: `User MCP server`,
						command: serverConfig.command,
						args: serverConfig.args,
						env: serverConfig.env,
						scope: 'user',
						status: 'disconnected'
					});
				}
			}
		} catch { }

		this.renderServers();
	}

	private renderServers(): void {
		clearNode(this.serversList);

		if (this.servers.length === 0) {
			const empty = append(this.serversList, $('.claude-mcp-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-server"></span>
				<span>${localize('noServers', 'No MCP servers configured')}</span>
				<span class="hint">${localize('addHint', 'Click "Add Server" to get started')}</span>
			`;
			return;
		}

		// Group by scope
		const projectServers = this.servers.filter(s => s.scope === 'project');
		const userServers = this.servers.filter(s => s.scope === 'user');

		if (projectServers.length > 0) {
			this.renderServerSection(localize('project', 'Project Servers'), projectServers, 'folder');
		}

		if (userServers.length > 0) {
			this.renderServerSection(localize('user', 'User Servers'), userServers, 'account');
		}
	}

	private renderServerSection(title: string, servers: IMcpServer[], icon: string): void {
		const section = append(this.serversList, $('.claude-mcp-section'));

		const header = append(section, $('.claude-mcp-section-header'));
		header.innerHTML = `<span class="codicon codicon-${icon}"></span> ${title} (${servers.length})`;

		for (const server of servers) {
			this.renderServer(section, server);
		}
	}

	private renderServer(container: HTMLElement, server: IMcpServer): void {
		const item = append(container, $('.claude-mcp-server-item'));

		// Status indicator
		const status = append(item, $('.claude-mcp-status'));
		status.classList.add(server.status);
		status.title = this.getStatusText(server.status);

		// Icon
		const icon = append(item, $('.claude-mcp-server-icon'));
		icon.innerHTML = `<span class="codicon codicon-server"></span>`;

		// Info
		const info = append(item, $('.claude-mcp-server-info'));

		const name = append(info, $('.claude-mcp-server-name'));
		name.textContent = server.name;

		const desc = append(info, $('.claude-mcp-server-desc'));
		desc.textContent = `${server.command} ${(server.args || []).join(' ')}`;

		if (server.tools && server.tools.length > 0) {
			const tools = append(info, $('.claude-mcp-server-tools'));
			tools.innerHTML = server.tools.slice(0, 3).map(t =>
				`<span class="tool-tag">${t}</span>`
			).join('') + (server.tools.length > 3 ? `<span class="more">+${server.tools.length - 3}</span>` : '');
		}

		// Actions
		const actions = append(item, $('.claude-mcp-server-actions'));

		if (server.status === 'connected') {
			const disconnectBtn = append(actions, $('button.claude-mcp-action'));
			disconnectBtn.innerHTML = '<span class="codicon codicon-debug-disconnect"></span>';
			disconnectBtn.title = localize('disconnect', 'Disconnect');
			disconnectBtn.onclick = (e) => {
				e.stopPropagation();
				this.disconnectServer(server);
			};
		} else {
			const connectBtn = append(actions, $('button.claude-mcp-action.primary'));
			connectBtn.innerHTML = '<span class="codicon codicon-plug"></span>';
			connectBtn.title = localize('connect', 'Connect');
			connectBtn.onclick = (e) => {
				e.stopPropagation();
				this.connectServer(server);
			};
		}

		const restartBtn = append(actions, $('button.claude-mcp-action'));
		restartBtn.innerHTML = '<span class="codicon codicon-debug-restart"></span>';
		restartBtn.title = localize('restart', 'Restart');
		restartBtn.onclick = (e) => {
			e.stopPropagation();
			this.restartServer(server);
		};

		const removeBtn = append(actions, $('button.claude-mcp-action.danger'));
		removeBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
		removeBtn.title = localize('remove', 'Remove');
		removeBtn.onclick = (e) => {
			e.stopPropagation();
			this.removeServer(server);
		};
	}

	private renderPopularServers(container: HTMLElement): void {
		const popularSubset = POPULAR_MCP_SERVERS.slice(0, 6);

		for (const server of popularSubset) {
			const card = append(container, $('.claude-mcp-popular-card'));

			const icon = append(card, $('.popular-icon'));
			icon.innerHTML = `<span class="codicon codicon-${this.getCategoryIcon(server.category)}"></span>`;

			const name = append(card, $('.popular-name'));
			name.textContent = server.name;

			const desc = append(card, $('.popular-desc'));
			desc.textContent = server.description;

			card.onclick = () => {
				// Add this server
				this.commandService.executeCommand('claudeMcp.addServer');
			};
		}
	}

	private getCategoryIcon(category: string): string {
		const icons: Record<string, string> = {
			'file': 'folder',
			'dev': 'github',
			'database': 'database',
			'communication': 'comment-discussion',
			'web': 'globe',
			'ai': 'sparkle'
		};
		return icons[category] || 'server';
	}

	private getStatusText(status: string): string {
		switch (status) {
			case 'connected': return localize('connected', 'Connected');
			case 'disconnected': return localize('disconnected', 'Disconnected');
			case 'error': return localize('error', 'Error');
			case 'starting': return localize('starting', 'Starting...');
			default: return status;
		}
	}

	private connectServer(server: IMcpServer): void {
		server.status = 'starting';
		this.renderServers();

		// Simulate connection
		setTimeout(() => {
			server.status = 'connected';
			this.renderServers();
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('serverConnected', 'Connected to {0}', server.name)
			});
		}, 1000);
	}

	private disconnectServer(server: IMcpServer): void {
		server.status = 'disconnected';
		this.renderServers();
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('serverDisconnected', 'Disconnected from {0}', server.name)
		});
	}

	private restartServer(server: IMcpServer): void {
		server.status = 'starting';
		this.renderServers();

		setTimeout(() => {
			server.status = 'connected';
			this.renderServers();
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('serverRestarted', 'Restarted {0}', server.name)
			});
		}, 1500);
	}

	private restartAllServers(): void {
		for (const server of this.servers) {
			server.status = 'starting';
		}
		this.renderServers();

		setTimeout(() => {
			for (const server of this.servers) {
				server.status = 'connected';
			}
			this.renderServers();
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('allServersRestarted', 'Restarted all MCP servers')
			});
		}, 2000);
	}

	private async removeServer(server: IMcpServer): Promise<void> {
		const confirmed = confirm(localize('confirmRemove', 'Remove MCP server "{0}"?', server.name));
		if (!confirmed) return;

		// Determine config file
		let configUri: URI;
		if (server.scope === 'project') {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) return;
			configUri = URI.joinPath(folders[0].uri, '.claude.json');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			configUri = URI.file(`${homeDir}/.claude.json`);
		}

		try {
			const content = await this.fileService.readFile(configUri);
			const text = new TextDecoder().decode(content.value);
			const config = JSON.parse(text);

			if (config.mcpServers && config.mcpServers[server.name]) {
				delete config.mcpServers[server.name];
				await this.fileService.writeFile(configUri, new TextEncoder().encode(JSON.stringify(config, null, 2)));

				this.loadServers();
				this.notificationService.notify({
					severity: Severity.Info,
					message: localize('serverRemoved', 'Removed {0}', server.name)
				});
			}
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('removeFailed', 'Failed to remove server')
			});
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
