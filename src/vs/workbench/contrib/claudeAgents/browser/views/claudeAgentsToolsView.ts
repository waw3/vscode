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
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { AVAILABLE_TOOLS, IToolDefinition } from '../claudeAgents.contribution.js';

interface IToolPermission {
	tool: IToolDefinition;
	enabled: boolean;
	requiresConfirmation: boolean;
	allowedPaths?: string[];
}

export class ClaudeAgentsToolsView extends ViewPane {

	private container!: HTMLElement;
	private toolsList!: HTMLElement;
	private permissions: Map<string, IToolPermission> = new Map();

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
		@IHoverService hoverService: IHoverService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// Initialize default permissions
		for (const tool of AVAILABLE_TOOLS) {
			this.permissions.set(tool.name, {
				tool,
				enabled: true,
				requiresConfirmation: this.isDestructiveTool(tool.name)
			});
		}
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-agents-tools-view');

		// Header
		const header = append(this.container, $('.claude-tools-header'));
		header.innerHTML = `
			<div class="header-content">
				<span class="codicon codicon-tools"></span>
				<div class="header-text">
					<strong>${localize('toolPermissions', 'Tool Permissions')}</strong>
					<span>${localize('toolPermissionsDesc', 'Configure which tools agents can use')}</span>
				</div>
			</div>
		`;

		// Quick actions
		const quickActions = append(this.container, $('.claude-tools-quick-actions'));

		const enableAllBtn = append(quickActions, $('button.claude-tools-btn'));
		enableAllBtn.innerHTML = `<span class="codicon codicon-check-all"></span> ${localize('enableAll', 'Enable All')}`;
		enableAllBtn.onclick = () => this.setAllEnabled(true);

		const disableAllBtn = append(quickActions, $('button.claude-tools-btn'));
		disableAllBtn.innerHTML = `<span class="codicon codicon-close-all"></span> ${localize('disableAll', 'Disable All')}`;
		disableAllBtn.onclick = () => this.setAllEnabled(false);

		const safeOnlyBtn = append(quickActions, $('button.claude-tools-btn'));
		safeOnlyBtn.innerHTML = `<span class="codicon codicon-shield"></span> ${localize('safeOnly', 'Safe Only')}`;
		safeOnlyBtn.onclick = () => this.enableSafeOnly();

		// Tools list
		this.toolsList = append(this.container, $('.claude-tools-list'));
		this.renderTools();

		// Warning section
		const warning = append(this.container, $('.claude-tools-warning'));
		warning.innerHTML = `
			<span class="codicon codicon-warning"></span>
			<div class="warning-content">
				<strong>${localize('caution', 'Caution')}</strong>
				<span>${localize('toolsWarning', 'Destructive tools like Write, Edit, and Bash can modify your files. Enable confirmation prompts for safety.')}</span>
			</div>
		`;
	}

	private renderTools(): void {
		clearNode(this.toolsList);

		// Group by category
		const categories = new Map<string, IToolPermission[]>();
		for (const permission of this.permissions.values()) {
			const cat = permission.tool.category;
			if (!categories.has(cat)) {
				categories.set(cat, []);
			}
			categories.get(cat)!.push(permission);
		}

		for (const [category, tools] of categories) {
			this.renderCategory(category, tools);
		}
	}

	private renderCategory(category: string, tools: IToolPermission[]): void {
		const section = append(this.toolsList, $('.claude-tools-section'));

		const header = append(section, $('.claude-tools-section-header'));
		const categoryIcon = this.getCategoryIcon(category);
		header.innerHTML = `<span class="codicon codicon-${categoryIcon}"></span> ${category.charAt(0).toUpperCase() + category.slice(1)} Tools`;

		for (const permission of tools) {
			this.renderTool(section, permission);
		}
	}

	private renderTool(container: HTMLElement, permission: IToolPermission): void {
		const item = append(container, $('.claude-tool-item'));
		if (!permission.enabled) {
			item.classList.add('disabled');
		}

		// Icon
		const icon = append(item, $('.claude-tool-icon'));
		const toolIcon = this.getToolIcon(permission.tool.name);
		icon.innerHTML = `<span class="codicon codicon-${toolIcon}"></span>`;

		// Info
		const info = append(item, $('.claude-tool-info'));

		const name = append(info, $('.claude-tool-name'));
		name.textContent = permission.tool.name;

		const desc = append(info, $('.claude-tool-desc'));
		desc.textContent = permission.tool.description;

		// Risk indicator
		if (this.isDestructiveTool(permission.tool.name)) {
			const risk = append(info, $('.claude-tool-risk'));
			risk.innerHTML = `<span class="codicon codicon-warning"></span> ${localize('destructive', 'Destructive')}`;
		}

		// Controls
		const controls = append(item, $('.claude-tool-controls'));

		// Enable toggle
		const enableToggle = append(controls, $('.claude-tool-toggle'));
		const enableCheckbox = append(enableToggle, $('input')) as HTMLInputElement;
		enableCheckbox.type = 'checkbox';
		enableCheckbox.id = `enable-${permission.tool.name}`;
		enableCheckbox.checked = permission.enabled;
		enableCheckbox.onchange = () => {
			permission.enabled = enableCheckbox.checked;
			item.classList.toggle('disabled', !permission.enabled);
		};

		const enableLabel = append(enableToggle, $('label')) as HTMLLabelElement;
		enableLabel.htmlFor = enableCheckbox.id;
		enableLabel.textContent = localize('enabled', 'Enabled');

		// Confirmation toggle
		const confirmToggle = append(controls, $('.claude-tool-toggle'));
		const confirmCheckbox = append(confirmToggle, $('input')) as HTMLInputElement;
		confirmCheckbox.type = 'checkbox';
		confirmCheckbox.id = `confirm-${permission.tool.name}`;
		confirmCheckbox.checked = permission.requiresConfirmation;
		confirmCheckbox.onchange = () => {
			permission.requiresConfirmation = confirmCheckbox.checked;
		};

		const confirmLabel = append(confirmToggle, $('label')) as HTMLLabelElement;
		confirmLabel.htmlFor = confirmCheckbox.id;
		confirmLabel.textContent = localize('confirm', 'Confirm');
	}

	private setAllEnabled(enabled: boolean): void {
		for (const permission of this.permissions.values()) {
			permission.enabled = enabled;
		}
		this.renderTools();
	}

	private enableSafeOnly(): void {
		const safeTool = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];
		for (const permission of this.permissions.values()) {
			permission.enabled = safeTool.includes(permission.tool.name);
		}
		this.renderTools();
	}

	private isDestructiveTool(toolName: string): boolean {
		return ['Write', 'Edit', 'Bash', 'NotebookEdit'].includes(toolName);
	}

	private getCategoryIcon(category: string): string {
		const icons: Record<string, string> = {
			'file': 'file',
			'search': 'search',
			'web': 'globe',
			'system': 'terminal',
		};
		return icons[category] || 'tools';
	}

	private getToolIcon(toolName: string): string {
		const icons: Record<string, string> = {
			'Read': 'file-code',
			'Write': 'new-file',
			'Edit': 'edit',
			'Glob': 'search',
			'Grep': 'regex',
			'Bash': 'terminal',
			'WebFetch': 'cloud-download',
			'WebSearch': 'search',
			'NotebookEdit': 'notebook',
			'Task': 'tasklist',
			'TodoWrite': 'checklist',
		};
		return icons[toolName] || 'tools';
	}

	public getEnabledTools(): string[] {
		return Array.from(this.permissions.values())
			.filter(p => p.enabled)
			.map(p => p.tool.name);
	}

	public getToolsRequiringConfirmation(): string[] {
		return Array.from(this.permissions.values())
			.filter(p => p.enabled && p.requiresConfirmation)
			.map(p => p.tool.name);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
