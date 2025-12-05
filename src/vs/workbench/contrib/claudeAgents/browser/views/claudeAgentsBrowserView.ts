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
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAgentDefinition, parseAgentFile, AGENT_TEMPLATES } from '../claudeAgents.contribution.js';

export class ClaudeAgentsBrowserView extends ViewPane {

	private container!: HTMLElement;
	private agentsList!: HTMLElement;
	private agents: IAgentDefinition[] = [];

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
		@IEditorService private readonly editorService: IEditorService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-agents-browser-view');

		// Header
		const header = append(this.container, $('.claude-agents-header'));
		header.innerHTML = `
			<div class="header-content">
				<span class="codicon codicon-hubot"></span>
				<div class="header-text">
					<strong>${localize('agents', 'Agents')}</strong>
					<span>${localize('agentsDesc', 'Specialized AI assistants for specific tasks')}</span>
				</div>
			</div>
		`;

		// Toolbar
		const toolbar = append(this.container, $('.claude-agents-toolbar'));

		const createBtn = append(toolbar, $('button.claude-agents-btn.primary'));
		createBtn.innerHTML = '<span class="codicon codicon-add"></span> ' + localize('create', 'Create Agent');
		createBtn.onclick = () => this.commandService.executeCommand('claudeAgents.createAgent');

		const refreshBtn = append(toolbar, $('button.claude-agents-btn'));
		refreshBtn.innerHTML = '<span class="codicon codicon-refresh"></span>';
		refreshBtn.title = localize('refresh', 'Refresh');
		refreshBtn.onclick = () => this.loadAgents();

		// Agents list
		this.agentsList = append(this.container, $('.claude-agents-list'));

		// Templates section
		const templatesSection = append(this.container, $('.claude-agents-templates'));
		const templatesHeader = append(templatesSection, $('.claude-agents-section-header'));
		templatesHeader.innerHTML = `<span class="codicon codicon-library"></span> ${localize('templates', 'Quick Start Templates')}`;

		const templatesGrid = append(templatesSection, $('.claude-agents-templates-grid'));
		this.renderTemplates(templatesGrid);

		// Initial load
		this.loadAgents();
	}

	private async loadAgents(): Promise<void> {
		this.agents = [];

		// Scan for project agents
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length > 0) {
			const projectAgentsUri = URI.joinPath(folders[0].uri, '.claude/agents');
			try {
				const exists = await this.fileService.exists(projectAgentsUri);
				if (exists) {
					const files = await this.fileService.readdir(projectAgentsUri);
					for (const [name, type] of files) {
						if (name.endsWith('.md') && type === 1) {
							const fileUri = URI.joinPath(projectAgentsUri, name);
							const content = await this.fileService.readFile(fileUri);
							const text = new TextDecoder().decode(content.value);
							const parsed = parseAgentFile(text);
							this.agents.push({
								name: parsed.name || name.replace('.md', ''),
								description: parsed.description || 'Project agent',
								filePath: fileUri.toString(),
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
			const exists = await this.fileService.exists(userAgentsUri);
			if (exists) {
				const files = await this.fileService.readdir(userAgentsUri);
				for (const [name, type] of files) {
					if (name.endsWith('.md') && type === 1) {
						const fileUri = URI.joinPath(userAgentsUri, name);
						const content = await this.fileService.readFile(fileUri);
						const text = new TextDecoder().decode(content.value);
						const parsed = parseAgentFile(text);
						this.agents.push({
							name: parsed.name || name.replace('.md', ''),
							description: parsed.description || 'User agent',
							filePath: fileUri.toString(),
							scope: 'user',
							tools: parsed.tools,
							content: parsed.content
						});
					}
				}
			}
		} catch { }

		this.renderAgents();
	}

	private renderAgents(): void {
		clearNode(this.agentsList);

		if (this.agents.length === 0) {
			const empty = append(this.agentsList, $('.claude-agents-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-hubot"></span>
				<span>${localize('noAgents', 'No agents configured')}</span>
				<span class="hint">${localize('createHint', 'Create an agent or use a template below')}</span>
			`;
			return;
		}

		// Group by scope
		const projectAgents = this.agents.filter(a => a.scope === 'project');
		const userAgents = this.agents.filter(a => a.scope === 'user');

		if (projectAgents.length > 0) {
			this.renderAgentSection(localize('project', 'Project Agents'), projectAgents, 'folder');
		}

		if (userAgents.length > 0) {
			this.renderAgentSection(localize('user', 'User Agents'), userAgents, 'account');
		}
	}

	private renderAgentSection(title: string, agents: IAgentDefinition[], icon: string): void {
		const section = append(this.agentsList, $('.claude-agent-section'));

		const header = append(section, $('.claude-agent-section-header'));
		header.innerHTML = `<span class="codicon codicon-${icon}"></span> ${title} (${agents.length})`;

		for (const agent of agents) {
			this.renderAgent(section, agent);
		}
	}

	private renderAgent(container: HTMLElement, agent: IAgentDefinition): void {
		const item = append(container, $('.claude-agent-item'));

		// Icon
		const icon = append(item, $('.claude-agent-icon'));
		icon.innerHTML = `<span class="codicon codicon-${this.getAgentIcon(agent.name)}"></span>`;

		// Info
		const info = append(item, $('.claude-agent-info'));

		const name = append(info, $('.claude-agent-name'));
		name.textContent = agent.name;

		const desc = append(info, $('.claude-agent-desc'));
		desc.textContent = agent.description;

		const tools = append(info, $('.claude-agent-tools'));
		tools.innerHTML = agent.tools.map(t =>
			`<span class="tool-tag">${t}</span>`
		).join('');

		// Actions
		const actions = append(item, $('.claude-agent-actions'));

		const invokeBtn = append(actions, $('button.claude-agent-action.primary'));
		invokeBtn.innerHTML = '<span class="codicon codicon-play"></span>';
		invokeBtn.title = localize('invoke', 'Invoke');
		invokeBtn.onclick = (e) => {
			e.stopPropagation();
			this.invokeAgent(agent);
		};

		const editBtn = append(actions, $('button.claude-agent-action'));
		editBtn.innerHTML = '<span class="codicon codicon-edit"></span>';
		editBtn.title = localize('edit', 'Edit');
		editBtn.onclick = (e) => {
			e.stopPropagation();
			this.editAgent(agent);
		};

		const deleteBtn = append(actions, $('button.claude-agent-action.danger'));
		deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
		deleteBtn.title = localize('delete', 'Delete');
		deleteBtn.onclick = (e) => {
			e.stopPropagation();
			this.deleteAgent(agent);
		};

		// Click to invoke
		item.onclick = () => this.invokeAgent(agent);
	}

	private renderTemplates(container: HTMLElement): void {
		const templates = Object.entries(AGENT_TEMPLATES);

		for (const [id, tmpl] of templates) {
			const card = append(container, $('.claude-agent-template-card'));

			const icon = append(card, $('.template-icon'));
			icon.innerHTML = `<span class="codicon codicon-${this.getAgentIcon(id)}"></span>`;

			const name = append(card, $('.template-name'));
			name.textContent = tmpl.name;

			const desc = append(card, $('.template-desc'));
			desc.textContent = tmpl.description;

			card.onclick = () => this.createFromTemplate(id);
		}
	}

	private getAgentIcon(name: string): string {
		const iconMap: Record<string, string> = {
			'code-reviewer': 'eye',
			'test-writer': 'beaker',
			'security-auditor': 'shield',
			'refactoring': 'symbol-structure',
			'documentation': 'book',
			'explorer': 'search',
		};
		return iconMap[name] || 'hubot';
	}

	private async invokeAgent(agent: IAgentDefinition): Promise<void> {
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('invoking', 'Invoking {0}...', agent.name)
		});
		// In production, this would send to Claude
	}

	private editAgent(agent: IAgentDefinition): void {
		if (agent.filePath) {
			this.editorService.openEditor({ resource: URI.parse(agent.filePath) });
		}
	}

	private async deleteAgent(agent: IAgentDefinition): Promise<void> {
		if (!agent.filePath) return;

		const confirmed = confirm(localize('confirmDelete', 'Delete agent "{0}"?', agent.name));
		if (!confirmed) return;

		try {
			await this.fileService.del(URI.parse(agent.filePath));
			this.loadAgents();
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('deleted', 'Deleted {0}', agent.name)
			});
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('deleteFailed', 'Failed to delete agent')
			});
		}
	}

	private async createFromTemplate(templateId: string): Promise<void> {
		this.commandService.executeCommand('claudeAgents.createAgent');
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
