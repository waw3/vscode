/*---------------------------------------------------------------------------------------------
 *  Nova Project Overview View
 *  Shows project information, stats, and Git status
 *--------------------------------------------------------------------------------------------*/

import './media/novaProject.css';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ISCMService, ISCMRepository } from '../../scm/common/scm.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

interface ProjectStats {
	totalFiles: number;
	totalFolders: number;
	workspaceFolders: number;
}

export class NovaProjectView extends ViewPane {
	static readonly ID = 'novaProject.overview';

	private container: HTMLElement | undefined;
	private readonly viewDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
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
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISCMService private readonly scmService: ISCMService,
		@IFileService private readonly fileService: IFileService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = container;
		container.classList.add('nova-project-view');

		this.renderContent();

		// Re-render on workspace changes
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.renderContent()));
		this._register(this.scmService.onDidAddRepository(() => this.renderContent()));
		this._register(this.scmService.onDidRemoveRepository(() => this.renderContent()));
	}

	private renderContent(): void {
		if (!this.container) {
			return;
		}

		this.viewDisposables.clear();
		clearNode(this.container);

		const workspace = this.workspaceContextService.getWorkspace();
		const folders = workspace.folders;

		if (folders.length === 0) {
			this.renderNoWorkspace();
			return;
		}

		// Render project header
		this.renderProjectHeader(folders);

		// Render workspace info
		this.renderWorkspaceInfo(folders);

		// Render Git info if available
		if (this.configurationService.getValue('novaProject.showGitInfo')) {
			this.renderGitInfo();
		}

		// Render file stats
		if (this.configurationService.getValue('novaProject.showFileStats')) {
			this.renderFileStats(folders);
		}
	}

	private renderNoWorkspace(): void {
		if (!this.container) {
			return;
		}

		const emptyState = append(this.container, $('.nova-project-empty'));
		const icon = append(emptyState, $('.nova-project-empty-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.folder));

		const message = append(emptyState, $('.nova-project-empty-message'));
		message.textContent = 'No workspace open';

		const hint = append(emptyState, $('.nova-project-empty-hint'));
		hint.textContent = 'Open a folder to see project information';
	}

	private renderProjectHeader(folders: readonly IWorkspaceFolder[]): void {
		if (!this.container) {
			return;
		}

		const header = append(this.container, $('.nova-project-header'));

		const iconContainer = append(header, $('.nova-project-icon'));
		iconContainer.classList.add(...ThemeIcon.asClassNameArray(Codicon.folder));

		const titleContainer = append(header, $('.nova-project-title-container'));

		const title = append(titleContainer, $('.nova-project-title'));
		if (folders.length === 1) {
			title.textContent = basename(folders[0].uri);
		} else {
			title.textContent = this.workspaceContextService.getWorkspace().name || 'Workspace';
		}

		const path = append(titleContainer, $('.nova-project-path'));
		if (folders.length === 1) {
			path.textContent = dirname(folders[0].uri).fsPath;
		} else {
			path.textContent = `${folders.length} folders`;
		}
	}

	private renderWorkspaceInfo(folders: readonly IWorkspaceFolder[]): void {
		if (!this.container) {
			return;
		}

		const section = append(this.container, $('.nova-project-section'));
		const sectionTitle = append(section, $('.nova-project-section-title'));
		sectionTitle.textContent = 'Workspace';

		const list = append(section, $('.nova-project-info-list'));

		// Workspace folders
		for (const folder of folders) {
			const item = append(list, $('.nova-project-info-item'));

			const icon = append(item, $('.nova-project-info-icon'));
			icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.folder));

			const label = append(item, $('.nova-project-info-label'));
			label.textContent = basename(folder.uri);

			const value = append(item, $('.nova-project-info-value'));
			value.textContent = folder.uri.fsPath;
			value.title = folder.uri.fsPath;
		}
	}

	private renderGitInfo(): void {
		if (!this.container) {
			return;
		}

		const repositories = this.scmService.repositories;
		if (repositories.length === 0) {
			return;
		}

		const section = append(this.container, $('.nova-project-section'));
		const sectionTitle = append(section, $('.nova-project-section-title'));
		sectionTitle.textContent = 'Source Control';

		const list = append(section, $('.nova-project-info-list'));

		for (const repo of repositories) {
			this.renderRepositoryInfo(list, repo);
		}
	}

	private renderRepositoryInfo(container: HTMLElement, repo: ISCMRepository): void {
		// Repository name
		const repoItem = append(container, $('.nova-project-info-item'));
		const repoIcon = append(repoItem, $('.nova-project-info-icon'));
		repoIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.repo));

		const repoLabel = append(repoItem, $('.nova-project-info-label'));
		repoLabel.textContent = repo.provider.label;

		const repoValue = append(repoItem, $('.nova-project-info-value'));
		repoValue.textContent = repo.provider.rootUri ? basename(repo.provider.rootUri) : '';

		// Branch info if available
		if (repo.provider.historyProvider) {
			const branchItem = append(container, $('.nova-project-info-item'));
			const branchIcon = append(branchItem, $('.nova-project-info-icon'));
			branchIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitBranch));

			const branchLabel = append(branchItem, $('.nova-project-info-label'));
			branchLabel.textContent = 'Branch';

			const branchValue = append(branchItem, $('.nova-project-info-value'));
			const currentHistoryItemGroup = repo.provider.historyProvider.currentHistoryItemGroup;
			branchValue.textContent = currentHistoryItemGroup?.name || 'Unknown';
		}

		// Changes count
		const changesItem = append(container, $('.nova-project-info-item'));
		const changesIcon = append(changesItem, $('.nova-project-info-icon'));
		changesIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffModified));

		const changesLabel = append(changesItem, $('.nova-project-info-label'));
		changesLabel.textContent = 'Changes';

		const changesValue = append(changesItem, $('.nova-project-info-value'));
		const resourceCount = repo.provider.groups.reduce((count, group) => count + group.resources.length, 0);
		changesValue.textContent = `${resourceCount} file${resourceCount !== 1 ? 's' : ''}`;
	}

	private async renderFileStats(folders: readonly IWorkspaceFolder[]): Promise<void> {
		if (!this.container) {
			return;
		}

		const section = append(this.container, $('.nova-project-section'));
		const sectionTitle = append(section, $('.nova-project-section-title'));
		sectionTitle.textContent = 'Statistics';

		const list = append(section, $('.nova-project-info-list'));

		// Show loading initially
		const loadingItem = append(list, $('.nova-project-info-item'));
		const loadingIcon = append(loadingItem, $('.nova-project-info-icon'));
		loadingIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
		const loadingLabel = append(loadingItem, $('.nova-project-info-label'));
		loadingLabel.textContent = 'Calculating...';

		// Calculate stats asynchronously
		try {
			const stats = await this.calculateStats(folders);
			clearNode(list);

			// Files count
			const filesItem = append(list, $('.nova-project-info-item'));
			const filesIcon = append(filesItem, $('.nova-project-info-icon'));
			filesIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.file));
			const filesLabel = append(filesItem, $('.nova-project-info-label'));
			filesLabel.textContent = 'Files';
			const filesValue = append(filesItem, $('.nova-project-info-value'));
			filesValue.textContent = stats.totalFiles.toLocaleString();

			// Folders count
			const foldersItem = append(list, $('.nova-project-info-item'));
			const foldersIcon = append(foldersItem, $('.nova-project-info-icon'));
			foldersIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.folderOpened));
			const foldersLabel = append(foldersItem, $('.nova-project-info-label'));
			foldersLabel.textContent = 'Folders';
			const foldersValue = append(foldersItem, $('.nova-project-info-value'));
			foldersValue.textContent = stats.totalFolders.toLocaleString();

		} catch {
			clearNode(list);
			const errorItem = append(list, $('.nova-project-info-item'));
			const errorIcon = append(errorItem, $('.nova-project-info-icon'));
			errorIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
			const errorLabel = append(errorItem, $('.nova-project-info-label'));
			errorLabel.textContent = 'Could not calculate statistics';
		}
	}

	private async calculateStats(folders: readonly IWorkspaceFolder[]): Promise<ProjectStats> {
		let totalFiles = 0;
		let totalFolders = 0;

		// Simple stat calculation - just count immediate children for performance
		for (const folder of folders) {
			try {
				const stat = await this.fileService.resolve(folder.uri, { resolveMetadata: false });
				if (stat.children) {
					for (const child of stat.children) {
						if (child.isDirectory) {
							totalFolders++;
						} else {
							totalFiles++;
						}
					}
				}
			} catch {
				// Ignore errors for individual folders
			}
		}

		return {
			totalFiles,
			totalFolders,
			workspaceFolders: folders.length
		};
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
