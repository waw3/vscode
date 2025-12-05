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
import { IHookDefinition, HookType, HOOK_TYPES, EXAMPLE_HOOKS, parseHooksConfig, IHookEntry } from '../claudeHooks.contribution.js';

export class ClaudeHooksListView extends ViewPane {

	private container!: HTMLElement;
	private hooksList!: HTMLElement;
	private hooks: IHookDefinition[] = [];

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
		this.container.classList.add('claude-hooks-list-view');

		// Header
		const header = append(this.container, $('.claude-hooks-header'));
		header.innerHTML = `
			<div class="header-content">
				<span class="codicon codicon-zap"></span>
				<div class="header-text">
					<strong>${localize('hooks', 'Hooks')}</strong>
					<span>${localize('hooksDesc', 'Automation hooks for tool execution')}</span>
				</div>
			</div>
		`;

		// Toolbar
		const toolbar = append(this.container, $('.claude-hooks-toolbar'));

		const addBtn = append(toolbar, $('button.claude-hooks-btn.primary'));
		addBtn.innerHTML = '<span class="codicon codicon-add"></span> ' + localize('add', 'Add Hook');
		addBtn.onclick = () => this.commandService.executeCommand('claudeHooks.addHook');

		const refreshBtn = append(toolbar, $('button.claude-hooks-btn'));
		refreshBtn.innerHTML = '<span class="codicon codicon-refresh"></span>';
		refreshBtn.title = localize('refresh', 'Refresh');
		refreshBtn.onclick = () => this.loadHooks();

		// Hooks list
		this.hooksList = append(this.container, $('.claude-hooks-list'));

		// Example hooks section
		const examplesSection = append(this.container, $('.claude-hooks-examples'));
		const examplesHeader = append(examplesSection, $('.claude-hooks-section-header'));
		examplesHeader.innerHTML = `<span class="codicon codicon-lightbulb"></span> ${localize('examples', 'Example Hooks')}`;

		const examplesGrid = append(examplesSection, $('.claude-hooks-examples-grid'));
		this.renderExamples(examplesGrid);

		// Initial load
		this.loadHooks();
	}

	private async loadHooks(): Promise<void> {
		this.hooks = [];

		// Load from project settings
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length > 0) {
			const projectConfigUri = URI.joinPath(folders[0].uri, '.claude/settings.json');
			await this.loadHooksFromFile(projectConfigUri, 'project');
		}

		// Load from user settings
		const homeDir = process.env.HOME || process.env.USERPROFILE || '';
		const userConfigUri = URI.file(`${homeDir}/.claude/settings.json`);
		await this.loadHooksFromFile(userConfigUri, 'user');

		this.renderHooks();
	}

	private async loadHooksFromFile(configUri: URI, scope: 'project' | 'user'): Promise<void> {
		try {
			const exists = await this.fileService.exists(configUri);
			if (exists) {
				const content = await this.fileService.readFile(configUri);
				const text = new TextDecoder().decode(content.value);
				const config = parseHooksConfig(text);

				if (config.hooks) {
					for (const [type, entries] of Object.entries(config.hooks)) {
						if (entries) {
							for (const entry of entries as IHookEntry[]) {
								for (const command of entry.hooks) {
									this.hooks.push({
										type: type as HookType,
										command,
										pattern: entry.matcher,
										scope,
										enabled: true
									});
								}
							}
						}
					}
				}
			}
		} catch { }
	}

	private renderHooks(): void {
		clearNode(this.hooksList);

		if (this.hooks.length === 0) {
			const empty = append(this.hooksList, $('.claude-hooks-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-zap"></span>
				<span>${localize('noHooks', 'No hooks configured')}</span>
				<span class="hint">${localize('addHint', 'Add hooks to automate tasks')}</span>
			`;
			return;
		}

		// Group by type
		const byType = new Map<HookType, IHookDefinition[]>();
		for (const hook of this.hooks) {
			if (!byType.has(hook.type)) {
				byType.set(hook.type, []);
			}
			byType.get(hook.type)!.push(hook);
		}

		for (const [type, hooks] of byType) {
			this.renderHookSection(type, hooks);
		}
	}

	private renderHookSection(type: HookType, hooks: IHookDefinition[]): void {
		const typeInfo = HOOK_TYPES[type];
		const section = append(this.hooksList, $('.claude-hooks-section'));

		const header = append(section, $('.claude-hooks-section-header'));
		header.innerHTML = `<span class="codicon codicon-${typeInfo.icon}"></span> ${typeInfo.name} (${hooks.length})`;

		for (const hook of hooks) {
			this.renderHook(section, hook);
		}
	}

	private renderHook(container: HTMLElement, hook: IHookDefinition): void {
		const item = append(container, $('.claude-hooks-item'));
		if (!hook.enabled) {
			item.classList.add('disabled');
		}

		// Icon
		const icon = append(item, $('.claude-hooks-item-icon'));
		const typeInfo = HOOK_TYPES[hook.type];
		icon.innerHTML = `<span class="codicon codicon-${typeInfo.icon}"></span>`;

		// Info
		const info = append(item, $('.claude-hooks-item-info'));

		const command = append(info, $('.claude-hooks-item-command'));
		command.textContent = hook.command;
		command.title = hook.command;

		const meta = append(info, $('.claude-hooks-item-meta'));

		const scopeTag = append(meta, $('.claude-hooks-tag'));
		scopeTag.textContent = hook.scope;
		scopeTag.classList.add(hook.scope);

		if (hook.pattern) {
			const patternTag = append(meta, $('.claude-hooks-tag.pattern'));
			patternTag.innerHTML = `<span class="codicon codicon-regex"></span> ${hook.pattern}`;
		}

		// Actions
		const actions = append(item, $('.claude-hooks-item-actions'));

		const toggleBtn = append(actions, $('button.claude-hooks-action'));
		toggleBtn.innerHTML = `<span class="codicon codicon-${hook.enabled ? 'eye' : 'eye-closed'}"></span>`;
		toggleBtn.title = hook.enabled ? localize('disable', 'Disable') : localize('enable', 'Enable');
		toggleBtn.onclick = (e) => {
			e.stopPropagation();
			this.toggleHook(hook);
		};

		const editBtn = append(actions, $('button.claude-hooks-action'));
		editBtn.innerHTML = '<span class="codicon codicon-edit"></span>';
		editBtn.title = localize('edit', 'Edit');
		editBtn.onclick = (e) => {
			e.stopPropagation();
			this.commandService.executeCommand('claudeHooks.openSettings');
		};

		const deleteBtn = append(actions, $('button.claude-hooks-action.danger'));
		deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
		deleteBtn.title = localize('delete', 'Delete');
		deleteBtn.onclick = (e) => {
			e.stopPropagation();
			this.deleteHook(hook);
		};
	}

	private renderExamples(container: HTMLElement): void {
		const examples = Object.entries(EXAMPLE_HOOKS).slice(0, 4);

		for (const [id, example] of examples) {
			const card = append(container, $('.claude-hooks-example-card'));

			const typeInfo = HOOK_TYPES[example.type];
			const icon = append(card, $('.example-icon'));
			icon.innerHTML = `<span class="codicon codicon-${typeInfo.icon}"></span>`;

			const name = append(card, $('.example-name'));
			name.textContent = id;

			const desc = append(card, $('.example-desc'));
			desc.textContent = example.description;

			const type = append(card, $('.example-type'));
			type.textContent = typeInfo.name;

			card.onclick = () => this.commandService.executeCommand('claudeHooks.addHook');
		}
	}

	private toggleHook(hook: IHookDefinition): void {
		hook.enabled = !hook.enabled;
		this.renderHooks();

		this.notificationService.notify({
			severity: Severity.Info,
			message: hook.enabled
				? localize('hookEnabled', 'Hook enabled')
				: localize('hookDisabled', 'Hook disabled')
		});
	}

	private async deleteHook(hook: IHookDefinition): Promise<void> {
		const confirmed = confirm(localize('confirmDelete', 'Delete this hook?'));
		if (!confirmed) return;

		// Determine config file
		let configUri: URI;
		if (hook.scope === 'project') {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) return;
			configUri = URI.joinPath(folders[0].uri, '.claude/settings.json');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			configUri = URI.file(`${homeDir}/.claude/settings.json`);
		}

		try {
			const content = await this.fileService.readFile(configUri);
			const text = new TextDecoder().decode(content.value);
			const config = parseHooksConfig(text);

			if (config.hooks && config.hooks[hook.type]) {
				// Find and remove the hook
				for (const entry of config.hooks[hook.type]!) {
					const idx = entry.hooks.indexOf(hook.command);
					if (idx !== -1) {
						entry.hooks.splice(idx, 1);

						// Remove entry if no hooks left
						if (entry.hooks.length === 0) {
							const entryIdx = config.hooks[hook.type]!.indexOf(entry);
							config.hooks[hook.type]!.splice(entryIdx, 1);
						}
						break;
					}
				}

				await this.fileService.writeFile(configUri, new TextEncoder().encode(JSON.stringify(config, null, 2)));

				this.loadHooks();
				this.notificationService.notify({
					severity: Severity.Info,
					message: localize('hookDeleted', 'Hook deleted')
				});
			}
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('deleteFailed', 'Failed to delete hook')
			});
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
