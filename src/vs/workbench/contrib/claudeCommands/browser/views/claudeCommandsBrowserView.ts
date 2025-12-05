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
import { BUILTIN_COMMANDS, ISlashCommand } from '../claudeCommands.contribution.js';

export class ClaudeCommandsBrowserView extends ViewPane {

	private container!: HTMLElement;
	private commandsList!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private commands: ISlashCommand[] = [];
	private filteredCommands: ISlashCommand[] = [];

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
		this.container.classList.add('claude-commands-browser-view');

		// Toolbar
		const toolbar = append(this.container, $('.claude-commands-toolbar'));

		// Search
		const searchWrapper = append(toolbar, $('.claude-commands-search'));
		const searchIcon = append(searchWrapper, $('.search-icon'));
		searchIcon.innerHTML = '<span class="codicon codicon-search"></span>';

		this.searchInput = append(searchWrapper, $('input.claude-commands-search-input')) as HTMLInputElement;
		this.searchInput.placeholder = localize('searchCommands', 'Search commands...');
		this.searchInput.oninput = () => this.filterCommands();

		// Add button
		const addBtn = append(toolbar, $('button.claude-commands-add-btn'));
		addBtn.innerHTML = '<span class="codicon codicon-add"></span>';
		addBtn.title = localize('createCommand', 'Create Command');
		addBtn.onclick = () => this.commandService.executeCommand('claudeCommands.createCommand');

		// Refresh button
		const refreshBtn = append(toolbar, $('button.claude-commands-refresh-btn'));
		refreshBtn.innerHTML = '<span class="codicon codicon-refresh"></span>';
		refreshBtn.title = localize('refresh', 'Refresh');
		refreshBtn.onclick = () => this.loadCommands();

		// Commands list
		this.commandsList = append(this.container, $('.claude-commands-list'));

		// Initial load
		this.loadCommands();
	}

	private async loadCommands(): Promise<void> {
		this.commands = [...BUILTIN_COMMANDS];

		// Scan for project commands
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length > 0) {
			const projectCommandsUri = URI.joinPath(folders[0].uri, '.claude/commands');
			try {
				const exists = await this.fileService.exists(projectCommandsUri);
				if (exists) {
					const files = await this.fileService.readdir(projectCommandsUri);
					for (const [name, type] of files) {
						if (name.endsWith('.md') && type === 1) {
							const fileUri = URI.joinPath(projectCommandsUri, name);
							const content = await this.fileService.readFile(fileUri);
							const text = new TextDecoder().decode(content.value);
							const parsed = this.parseCommandFile(text);
							this.commands.push({
								name: `project:${name.replace('.md', '')}`,
								description: parsed.description || 'Project command',
								filePath: fileUri.toString(),
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
			const exists = await this.fileService.exists(userCommandsUri);
			if (exists) {
				const files = await this.fileService.readdir(userCommandsUri);
				for (const [name, type] of files) {
					if (name.endsWith('.md') && type === 1) {
						const fileUri = URI.joinPath(userCommandsUri, name);
						const content = await this.fileService.readFile(fileUri);
						const text = new TextDecoder().decode(content.value);
						const parsed = this.parseCommandFile(text);
						this.commands.push({
							name: `user:${name.replace('.md', '')}`,
							description: parsed.description || 'User command',
							filePath: fileUri.toString(),
							scope: 'user',
							content: parsed.content,
							hasArguments: text.includes('$ARGUMENTS')
						});
					}
				}
			}
		} catch { }

		this.filterCommands();
	}

	private filterCommands(): void {
		const query = this.searchInput.value.toLowerCase();

		if (!query) {
			this.filteredCommands = this.commands;
		} else {
			this.filteredCommands = this.commands.filter(cmd =>
				cmd.name.toLowerCase().includes(query) ||
				cmd.description.toLowerCase().includes(query)
			);
		}

		this.renderCommands();
	}

	private renderCommands(): void {
		clearNode(this.commandsList);

		// Group by scope
		const builtinCmds = this.filteredCommands.filter(c => c.scope === 'builtin');
		const projectCmds = this.filteredCommands.filter(c => c.scope === 'project');
		const userCmds = this.filteredCommands.filter(c => c.scope === 'user');

		if (builtinCmds.length > 0) {
			this.renderSection(localize('builtin', 'Built-in'), builtinCmds, 'symbol-keyword');
		}

		if (projectCmds.length > 0) {
			this.renderSection(localize('project', 'Project'), projectCmds, 'folder');
		}

		if (userCmds.length > 0) {
			this.renderSection(localize('user', 'User'), userCmds, 'account');
		}

		if (this.filteredCommands.length === 0) {
			const empty = append(this.commandsList, $('.claude-commands-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-terminal"></span>
				<span>${localize('noCommands', 'No commands found')}</span>
			`;
		}
	}

	private renderSection(title: string, commands: ISlashCommand[], icon: string): void {
		const section = append(this.commandsList, $('.claude-commands-section'));

		const header = append(section, $('.claude-commands-section-header'));
		header.innerHTML = `<span class="codicon codicon-${icon}"></span> ${title} (${commands.length})`;

		for (const cmd of commands) {
			this.renderCommand(section, cmd);
		}
	}

	private renderCommand(container: HTMLElement, command: ISlashCommand): void {
		const item = append(container, $('.claude-command-item'));

		// Icon
		const icon = append(item, $('.claude-command-icon'));
		icon.innerHTML = `<span class="codicon codicon-${this.getCommandIcon(command)}"></span>`;

		// Info
		const info = append(item, $('.claude-command-info'));

		const name = append(info, $('.claude-command-name'));
		name.textContent = `/${command.name}`;

		const desc = append(info, $('.claude-command-desc'));
		desc.textContent = command.description;

		if (command.hasArguments) {
			const argsTag = append(info, $('.claude-command-tag'));
			argsTag.textContent = 'args';
			argsTag.title = localize('hasArguments', 'This command accepts arguments');
		}

		// Actions
		const actions = append(item, $('.claude-command-actions'));

		const runBtn = append(actions, $('button.claude-command-action.primary'));
		runBtn.innerHTML = '<span class="codicon codicon-play"></span>';
		runBtn.title = localize('run', 'Run');
		runBtn.onclick = (e) => {
			e.stopPropagation();
			this.runCommand(command);
		};

		if (command.scope !== 'builtin') {
			const editBtn = append(actions, $('button.claude-command-action'));
			editBtn.innerHTML = '<span class="codicon codicon-edit"></span>';
			editBtn.title = localize('edit', 'Edit');
			editBtn.onclick = (e) => {
				e.stopPropagation();
				this.editCommand(command);
			};

			const deleteBtn = append(actions, $('button.claude-command-action.danger'));
			deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
			deleteBtn.title = localize('delete', 'Delete');
			deleteBtn.onclick = (e) => {
				e.stopPropagation();
				this.deleteCommand(command);
			};
		}

		// Click to run
		item.onclick = () => this.runCommand(command);
	}

	private getCommandIcon(command: ISlashCommand): string {
		switch (command.name) {
			case 'help': return 'question';
			case 'explain': return 'comment-discussion';
			case 'fix': return 'wrench';
			case 'refactor': return 'symbol-structure';
			case 'test': return 'beaker';
			case 'doc': return 'book';
			case 'review': return 'eye';
			case 'optimize': return 'rocket';
			case 'memory': return 'database';
			case 'compact': return 'fold';
			case 'clear': return 'clear-all';
			case 'init': return 'wand';
			default: return 'terminal';
		}
	}

	private async runCommand(command: ISlashCommand): Promise<void> {
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('running', 'Running /{0}...', command.name)
		});

		// In production, this would send to Claude
	}

	private editCommand(command: ISlashCommand): void {
		if (command.filePath) {
			this.editorService.openEditor({ resource: URI.parse(command.filePath) });
		}
	}

	private async deleteCommand(command: ISlashCommand): Promise<void> {
		if (!command.filePath) return;

		const confirmed = confirm(localize('confirmDelete', 'Delete command /{0}?', command.name));
		if (!confirmed) return;

		try {
			await this.fileService.del(URI.parse(command.filePath));
			this.loadCommands();
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('deleted', 'Deleted /{0}', command.name)
			});
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('deleteFailed', 'Failed to delete command')
			});
		}
	}

	private parseCommandFile(content: string): { description: string; content: string } {
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

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
