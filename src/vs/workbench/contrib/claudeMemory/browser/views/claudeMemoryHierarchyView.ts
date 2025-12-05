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
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';

interface IMemoryFileInfo {
	path: string;
	uri: URI;
	type: 'project' | 'local' | 'user' | 'folder';
	priority: number;
	exists: boolean;
	size?: number;
	tokens?: number;
}

export class ClaudeMemoryHierarchyView extends ViewPane {

	private container!: HTMLElement;
	private hierarchyList!: HTMLElement;
	private memoryFiles: IMemoryFileInfo[] = [];

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
		@IEditorService private readonly editorService: IEditorService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-memory-hierarchy-view');

		// Header with info
		const header = append(this.container, $('.claude-memory-header'));
		const headerIcon = append(header, $('.claude-memory-header-icon'));
		headerIcon.innerHTML = '<span class="codicon codicon-layers"></span>';
		const headerText = append(header, $('.claude-memory-header-text'));
		headerText.innerHTML = `
			<strong>${localize('memoryHierarchy', 'Memory Hierarchy')}</strong>
			<span>${localize('hierarchyDesc', 'Files are loaded in priority order (top = highest)')}</span>
		`;

		// Toolbar
		const toolbar = append(this.container, $('.claude-memory-toolbar'));

		const createBtn = append(toolbar, $('button.claude-memory-btn.primary'));
		createBtn.innerHTML = '<span class="codicon codicon-add"></span> ' + localize('create', 'Create');
		createBtn.onclick = () => this.commandService.executeCommand('claudeMemory.createClaudeMd');

		const refreshBtn = append(toolbar, $('button.claude-memory-btn'));
		refreshBtn.innerHTML = '<span class="codicon codicon-refresh"></span>';
		refreshBtn.title = localize('refresh', 'Refresh');
		refreshBtn.onclick = () => this.scanMemoryFiles();

		// Hierarchy list
		this.hierarchyList = append(this.container, $('.claude-memory-list'));

		// Initial scan
		this.scanMemoryFiles();
	}

	private async scanMemoryFiles(): Promise<void> {
		this.memoryFiles = [];

		const folders = this.workspaceContextService.getWorkspace().folders;
		const homeDir = process.env.HOME || process.env.USERPROFILE || '';

		// Define all possible memory file locations with priorities
		const locations: Omit<IMemoryFileInfo, 'exists' | 'size' | 'tokens'>[] = [];

		// User-level (lowest priority)
		locations.push({
			path: '~/.claude/CLAUDE.md',
			uri: URI.file(`${homeDir}/.claude/CLAUDE.md`),
			type: 'user',
			priority: 1
		});

		if (folders.length > 0) {
			const rootUri = folders[0].uri;

			// Project-level
			locations.push({
				path: './CLAUDE.md',
				uri: URI.joinPath(rootUri, 'CLAUDE.md'),
				type: 'project',
				priority: 3
			});

			locations.push({
				path: './.claude/CLAUDE.md',
				uri: URI.joinPath(rootUri, '.claude/CLAUDE.md'),
				type: 'project',
				priority: 3
			});

			// Local override (highest priority)
			locations.push({
				path: './CLAUDE.local.md',
				uri: URI.joinPath(rootUri, 'CLAUDE.local.md'),
				type: 'local',
				priority: 4
			});

			// Check for folder-specific CLAUDE.md files
			// (In production, this would recursively scan directories)
		}

		// Check existence for each location
		for (const loc of locations) {
			try {
				const exists = await this.fileService.exists(loc.uri);
				let size = 0;
				let tokens = 0;

				if (exists) {
					const stat = await this.fileService.stat(loc.uri);
					size = stat.size || 0;
					tokens = Math.round(size / 4); // Rough token estimate
				}

				this.memoryFiles.push({
					...loc,
					exists,
					size,
					tokens
				});
			} catch {
				this.memoryFiles.push({
					...loc,
					exists: false
				});
			}
		}

		// Sort by priority (highest first)
		this.memoryFiles.sort((a, b) => b.priority - a.priority);

		this.renderHierarchy();
	}

	private renderHierarchy(): void {
		clearNode(this.hierarchyList);

		// Group: Loaded files
		const loadedFiles = this.memoryFiles.filter(f => f.exists);
		const missingFiles = this.memoryFiles.filter(f => !f.exists);

		if (loadedFiles.length > 0) {
			const loadedSection = append(this.hierarchyList, $('.claude-memory-section'));
			const loadedHeader = append(loadedSection, $('.claude-memory-section-header'));
			loadedHeader.innerHTML = `<span class="codicon codicon-check"></span> ${localize('loaded', 'Loaded')} (${loadedFiles.length})`;

			for (const file of loadedFiles) {
				this.renderMemoryFile(loadedSection, file);
			}
		}

		// Group: Available locations (not created)
		if (missingFiles.length > 0) {
			const availableSection = append(this.hierarchyList, $('.claude-memory-section.dimmed'));
			const availableHeader = append(availableSection, $('.claude-memory-section-header'));
			availableHeader.innerHTML = `<span class="codicon codicon-circle-outline"></span> ${localize('available', 'Available Locations')}`;

			for (const file of missingFiles) {
				this.renderMemoryFile(availableSection, file, true);
			}
		}

		// Total tokens
		const totalTokens = loadedFiles.reduce((sum, f) => sum + (f.tokens || 0), 0);
		const footer = append(this.hierarchyList, $('.claude-memory-footer'));
		footer.innerHTML = `
			<span class="codicon codicon-symbol-key"></span>
			${localize('totalTokens', 'Total: ~{0} tokens', totalTokens.toLocaleString())}
		`;
	}

	private renderMemoryFile(container: HTMLElement, file: IMemoryFileInfo, isMissing: boolean = false): void {
		const item = append(container, $(`.claude-memory-item${isMissing ? '.missing' : ''}`));

		// Priority indicator
		const priority = append(item, $('.claude-memory-priority'));
		priority.textContent = file.priority.toString();
		priority.title = localize('priority', 'Priority: {0}', file.priority);

		// Icon
		const icon = append(item, $('.claude-memory-icon'));
		icon.innerHTML = `<span class="codicon codicon-${this.getTypeIcon(file.type)}"></span>`;

		// Info
		const info = append(item, $('.claude-memory-info'));

		const path = append(info, $('.claude-memory-path'));
		path.textContent = file.path;

		const meta = append(info, $('.claude-memory-meta'));
		if (file.exists) {
			meta.innerHTML = `
				<span class="type ${file.type}">${file.type}</span>
				<span class="size">${this.formatSize(file.size || 0)}</span>
				<span class="tokens">~${file.tokens?.toLocaleString()} tokens</span>
			`;
		} else {
			meta.innerHTML = `<span class="type ${file.type}">${file.type}</span>`;
		}

		// Actions
		const actions = append(item, $('.claude-memory-actions'));

		if (file.exists) {
			const openBtn = append(actions, $('button.claude-memory-action'));
			openBtn.innerHTML = '<span class="codicon codicon-go-to-file"></span>';
			openBtn.title = localize('open', 'Open');
			openBtn.onclick = (e) => {
				e.stopPropagation();
				this.editorService.openEditor({ resource: file.uri });
			};

			const deleteBtn = append(actions, $('button.claude-memory-action.danger'));
			deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
			deleteBtn.title = localize('delete', 'Delete');
			deleteBtn.onclick = async (e) => {
				e.stopPropagation();
				await this.fileService.del(file.uri);
				this.scanMemoryFiles();
			};
		} else {
			const createBtn = append(actions, $('button.claude-memory-action.create'));
			createBtn.innerHTML = '<span class="codicon codicon-add"></span>';
			createBtn.title = localize('create', 'Create');
			createBtn.onclick = async (e) => {
				e.stopPropagation();
				await this.createMemoryFile(file);
			};
		}

		// Click to open
		if (file.exists) {
			item.onclick = () => this.editorService.openEditor({ resource: file.uri });
		}
	}

	private getTypeIcon(type: string): string {
		switch (type) {
			case 'project': return 'folder';
			case 'local': return 'home';
			case 'user': return 'account';
			case 'folder': return 'folder-opened';
			default: return 'file';
		}
	}

	private formatSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	private async createMemoryFile(file: IMemoryFileInfo): Promise<void> {
		const defaultContent = `# ${file.type === 'user' ? 'User Preferences' : 'Project'}\n\n`;

		// Ensure parent directory exists
		const parentUri = URI.joinPath(file.uri, '..');
		try {
			await this.fileService.createFolder(parentUri);
		} catch { }

		await this.fileService.writeFile(file.uri, new TextEncoder().encode(defaultContent));
		await this.editorService.openEditor({ resource: file.uri });
		this.scanMemoryFiles();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
