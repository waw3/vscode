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
import { append, $ } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IContextInfo, IMemoryFile } from '../../common/types.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';

export class ClaudeContextView extends ViewPane {

	private container!: HTMLElement;
	private contextMeter!: HTMLElement;
	private contextFill!: HTMLElement;
	private contextLabel!: HTMLElement;
	private memoryList!: HTMLElement;
	private statsContainer!: HTMLElement;

	private contextInfo: IContextInfo = {
		totalTokens: 200000,
		usedTokens: 0,
		usagePercentage: 0,
		memoryFiles: [],
		conversationLength: 0
	};

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
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this.detectMemoryFiles();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-context-view');

		// Context meter section
		const meterSection = append(this.container, $('.claude-context-section'));
		const meterHeader = append(meterSection, $('.claude-section-header'));
		meterHeader.textContent = localize('contextUsage', 'Context Usage');

		this.contextMeter = append(meterSection, $('.claude-context-meter'));
		this.contextFill = append(this.contextMeter, $('.claude-context-fill'));
		this.contextLabel = append(meterSection, $('.claude-context-label'));

		// Compact button
		const compactBtn = append(meterSection, $('button.claude-compact-btn'));
		compactBtn.innerHTML = '<span class="codicon codicon-fold"></span> ' + localize('compact', 'Compact Context');
		compactBtn.onclick = () => this.commandService.executeCommand('claudeAgent.compactContext');

		// Memory files section
		const memorySection = append(this.container, $('.claude-context-section'));
		const memoryHeader = append(memorySection, $('.claude-section-header'));
		memoryHeader.textContent = localize('memoryFiles', 'Memory Files');

		const memoryActions = append(memoryHeader, $('.claude-section-actions'));
		const addMemoryBtn = append(memoryActions, $('button.claude-section-action'));
		addMemoryBtn.innerHTML = '<span class="codicon codicon-add"></span>';
		addMemoryBtn.title = localize('addMemory', 'Create CLAUDE.md');
		addMemoryBtn.onclick = () => this.createClaudeMd();

		const refreshBtn = append(memoryActions, $('button.claude-section-action'));
		refreshBtn.innerHTML = '<span class="codicon codicon-refresh"></span>';
		refreshBtn.title = localize('refresh', 'Refresh');
		refreshBtn.onclick = () => this.detectMemoryFiles();

		this.memoryList = append(memorySection, $('.claude-memory-list'));

		// Stats section
		const statsSection = append(this.container, $('.claude-context-section'));
		const statsHeader = append(statsSection, $('.claude-section-header'));
		statsHeader.textContent = localize('sessionStats', 'Session Stats');

		this.statsContainer = append(statsSection, $('.claude-stats-container'));

		this.render();
	}

	private render(): void {
		this.renderContextMeter();
		this.renderMemoryFiles();
		this.renderStats();
	}

	private renderContextMeter(): void {
		const percentage = this.contextInfo.usagePercentage;
		this.contextFill.style.width = `${percentage}%`;

		// Color based on usage
		if (percentage >= 90) {
			this.contextFill.classList.add('critical');
			this.contextFill.classList.remove('warning');
		} else if (percentage >= 70) {
			this.contextFill.classList.add('warning');
			this.contextFill.classList.remove('critical');
		} else {
			this.contextFill.classList.remove('warning', 'critical');
		}

		const usedK = Math.round(this.contextInfo.usedTokens / 1000);
		const totalK = Math.round(this.contextInfo.totalTokens / 1000);
		this.contextLabel.textContent = `${usedK}K / ${totalK}K tokens (${percentage.toFixed(1)}%)`;
	}

	private renderMemoryFiles(): void {
		this.memoryList.innerHTML = '';

		if (this.contextInfo.memoryFiles.length === 0) {
			const empty = append(this.memoryList, $('.claude-memory-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-file"></span>
				<span>${localize('noMemoryFiles', 'No CLAUDE.md files found')}</span>
				<span class="hint">${localize('createHint', 'Create one to give Claude project context')}</span>
			`;
			return;
		}

		for (const file of this.contextInfo.memoryFiles) {
			const item = append(this.memoryList, $('.claude-memory-item'));

			const icon = append(item, $('.claude-memory-icon'));
			icon.innerHTML = this.getMemoryIcon(file.type);

			const info = append(item, $('.claude-memory-info'));
			const name = append(info, $('.claude-memory-name'));
			name.textContent = this.getFileName(file.path);

			const path = append(info, $('.claude-memory-path'));
			path.textContent = file.path;

			const meta = append(item, $('.claude-memory-meta'));

			const typeLabel = append(meta, $('.claude-memory-type'));
			typeLabel.textContent = file.type;
			typeLabel.classList.add(file.type);

			const tokens = append(meta, $('.claude-memory-tokens'));
			tokens.textContent = `~${Math.round(file.tokens / 100) * 100} tokens`;

			const status = append(item, $('.claude-memory-status'));
			if (file.loaded) {
				status.classList.add('loaded');
				status.innerHTML = '<span class="codicon codicon-check"></span>';
				status.title = localize('loaded', 'Loaded');
			} else {
				status.innerHTML = '<span class="codicon codicon-circle-outline"></span>';
				status.title = localize('notLoaded', 'Not loaded');
			}

			// Click to open
			item.onclick = () => this.openMemoryFile(file.path);
		}
	}

	private renderStats(): void {
		this.statsContainer.innerHTML = '';

		const stats = [
			{ label: localize('conversationLength', 'Messages'), value: this.contextInfo.conversationLength.toString(), icon: 'comment' },
			{ label: localize('memoryFiles', 'Memory Files'), value: this.contextInfo.memoryFiles.length.toString(), icon: 'file' },
			{ label: localize('loadedTokens', 'Loaded Tokens'), value: `${Math.round(this.getTotalMemoryTokens() / 1000)}K`, icon: 'symbol-key' },
		];

		for (const stat of stats) {
			const statItem = append(this.statsContainer, $('.claude-stat-item'));
			const icon = append(statItem, $('.claude-stat-icon'));
			icon.innerHTML = `<span class="codicon codicon-${stat.icon}"></span>`;
			const value = append(statItem, $('.claude-stat-value'));
			value.textContent = stat.value;
			const label = append(statItem, $('.claude-stat-label'));
			label.textContent = stat.label;
		}
	}

	private getMemoryIcon(type: string): string {
		switch (type) {
			case 'project': return '<span class="codicon codicon-folder"></span>';
			case 'local': return '<span class="codicon codicon-home"></span>';
			case 'user': return '<span class="codicon codicon-account"></span>';
			case 'folder': return '<span class="codicon codicon-folder-opened"></span>';
			default: return '<span class="codicon codicon-file"></span>';
		}
	}

	private getFileName(path: string): string {
		return path.split('/').pop() || path;
	}

	private getTotalMemoryTokens(): number {
		return this.contextInfo.memoryFiles
			.filter(f => f.loaded)
			.reduce((sum, f) => sum + f.tokens, 0);
	}

	private detectMemoryFiles(): void {
		// Detect CLAUDE.md files in the workspace
		const folders = this.workspaceContextService.getWorkspace().folders;

		const memoryFiles: IMemoryFile[] = [];

		// Check for common CLAUDE.md locations
		const locations = [
			{ path: './CLAUDE.md', type: 'project' as const },
			{ path: './CLAUDE.local.md', type: 'local' as const },
			{ path: './.claude/CLAUDE.md', type: 'project' as const },
			{ path: '~/.claude/CLAUDE.md', type: 'user' as const },
		];

		// Demo data - in production this would actually check the filesystem
		if (folders.length > 0) {
			memoryFiles.push({
				path: './CLAUDE.md',
				type: 'project',
				tokens: 1500,
				loaded: true
			});
		}

		// Always show user level
		memoryFiles.push({
			path: '~/.claude/CLAUDE.md',
			type: 'user',
			tokens: 800,
			loaded: true
		});

		this.contextInfo.memoryFiles = memoryFiles;

		// Update context usage demo
		this.contextInfo.usedTokens = 45000;
		this.contextInfo.usagePercentage = (this.contextInfo.usedTokens / this.contextInfo.totalTokens) * 100;
		this.contextInfo.conversationLength = 12;

		if (this.memoryList) {
			this.render();
		}
	}

	private createClaudeMd(): void {
		this.commandService.executeCommand('claudeAgent.openMemory');
	}

	private openMemoryFile(path: string): void {
		this.commandService.executeCommand('vscode.open', path);
	}

	public updateContext(info: Partial<IContextInfo>): void {
		this.contextInfo = { ...this.contextInfo, ...info };
		this.render();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
