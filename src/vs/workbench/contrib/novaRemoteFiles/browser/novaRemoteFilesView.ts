/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { append, $ } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { IRemoteConnection, IRemoteFileEntry } from './novaRemoteFiles.contribution.js';

const CONNECTIONS_STORAGE_KEY = 'novaRemoteFiles.connections';

export class NovaRemoteFilesView extends ViewPane {

	private container!: HTMLElement;
	private toolbar!: HTMLElement;
	private breadcrumb!: HTMLElement;
	private fileList!: HTMLElement;
	private statusBar!: HTMLElement;
	private currentPath: string = '/';
	private currentFiles: IRemoteFileEntry[] = [];

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
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// Listen for active connection changes
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, 'novaRemoteFiles.activeConnection', this._store)(() => {
			this.onConnectionChanged();
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('nova-remote-files-view');

		// Toolbar
		this.toolbar = append(this.container, $('.nova-remote-toolbar'));
		this.renderToolbar();

		// Breadcrumb navigation
		this.breadcrumb = append(this.container, $('.nova-remote-breadcrumb'));

		// File list
		this.fileList = append(this.container, $('.nova-remote-file-list'));

		// Status bar
		this.statusBar = append(this.container, $('.nova-remote-status-bar'));

		this.onConnectionChanged();
	}

	private renderToolbar(): void {
		this.toolbar.innerHTML = '';

		// Navigation buttons
		const navGroup = append(this.toolbar, $('.nova-toolbar-group'));

		const backBtn = append(navGroup, $('button.nova-toolbar-button'));
		backBtn.innerHTML = '<span class="codicon codicon-arrow-left"></span>';
		backBtn.title = localize('back', 'Go Back');
		backBtn.onclick = () => this.navigateUp();

		const homeBtn = append(navGroup, $('button.nova-toolbar-button'));
		homeBtn.innerHTML = '<span class="codicon codicon-home"></span>';
		homeBtn.title = localize('home', 'Go to Root');
		homeBtn.onclick = () => this.navigateTo('/');

		const refreshBtn = append(navGroup, $('button.nova-toolbar-button'));
		refreshBtn.innerHTML = '<span class="codicon codicon-refresh"></span>';
		refreshBtn.title = localize('refresh', 'Refresh');
		refreshBtn.onclick = () => this.refresh();

		// Action buttons
		const actionGroup = append(this.toolbar, $('.nova-toolbar-group.actions'));

		const uploadBtn = append(actionGroup, $('button.nova-toolbar-button'));
		uploadBtn.innerHTML = '<span class="codicon codicon-cloud-upload"></span>';
		uploadBtn.title = localize('upload', 'Upload Files');
		uploadBtn.onclick = () => this.uploadFiles();

		const downloadBtn = append(actionGroup, $('button.nova-toolbar-button'));
		downloadBtn.innerHTML = '<span class="codicon codicon-cloud-download"></span>';
		downloadBtn.title = localize('download', 'Download Selected');
		downloadBtn.onclick = () => this.downloadFiles();

		const newFolderBtn = append(actionGroup, $('button.nova-toolbar-button'));
		newFolderBtn.innerHTML = '<span class="codicon codicon-new-folder"></span>';
		newFolderBtn.title = localize('newFolder', 'New Folder');
		newFolderBtn.onclick = () => this.createFolder();

		const deleteBtn = append(actionGroup, $('button.nova-toolbar-button.danger'));
		deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
		deleteBtn.title = localize('delete', 'Delete Selected');
		deleteBtn.onclick = () => this.deleteSelected();

		// View options
		const viewGroup = append(this.toolbar, $('.nova-toolbar-group.view'));

		const listViewBtn = append(viewGroup, $('button.nova-toolbar-button.active'));
		listViewBtn.innerHTML = '<span class="codicon codicon-list-flat"></span>';
		listViewBtn.title = localize('listView', 'List View');

		const gridViewBtn = append(viewGroup, $('button.nova-toolbar-button'));
		gridViewBtn.innerHTML = '<span class="codicon codicon-layout"></span>';
		gridViewBtn.title = localize('gridView', 'Grid View');
	}

	private onConnectionChanged(): void {
		const activeConnectionId = this.storageService.get('novaRemoteFiles.activeConnection', StorageScope.PROFILE);

		if (!activeConnectionId) {
			this.showDisconnectedState();
			return;
		}

		const connection = this.getConnection(activeConnectionId);
		if (!connection) {
			this.showDisconnectedState();
			return;
		}

		this.currentPath = connection.remotePath || '/';
		this.renderBreadcrumb();
		this.loadFiles(connection);
	}

	private getConnection(id: string): IRemoteConnection | undefined {
		const json = this.storageService.get(CONNECTIONS_STORAGE_KEY, StorageScope.PROFILE, '[]');
		try {
			const connections: IRemoteConnection[] = JSON.parse(json);
			return connections.find(c => c.id === id);
		} catch {
			return undefined;
		}
	}

	private showDisconnectedState(): void {
		this.breadcrumb.innerHTML = '';
		this.fileList.innerHTML = '';

		const emptyState = append(this.fileList, $('.nova-remote-empty'));
		const icon = append(emptyState, $('.empty-icon'));
		icon.innerHTML = '<span class="codicon codicon-plug"></span>';
		const text = append(emptyState, $('.empty-text'));
		text.textContent = localize('notConnected', 'Not connected');
		const hint = append(emptyState, $('.empty-hint'));
		hint.textContent = localize('selectConnection', 'Select a connection from the list above');

		this.statusBar.textContent = localize('disconnected', 'Disconnected');
	}

	private renderBreadcrumb(): void {
		this.breadcrumb.innerHTML = '';

		const parts = this.currentPath.split('/').filter(p => p.length > 0);

		// Root
		const rootItem = append(this.breadcrumb, $('.nova-breadcrumb-item'));
		rootItem.innerHTML = '<span class="codicon codicon-root-folder"></span>';
		rootItem.onclick = () => this.navigateTo('/');

		// Path parts
		let path = '';
		for (const part of parts) {
			path += '/' + part;
			const separator = append(this.breadcrumb, $('.nova-breadcrumb-separator'));
			separator.textContent = '/';

			const item = append(this.breadcrumb, $('.nova-breadcrumb-item'));
			item.textContent = part;
			const targetPath = path;
			item.onclick = () => this.navigateTo(targetPath);
		}
	}

	private loadFiles(connection: IRemoteConnection): void {
		// Simulate loading files (in real implementation, this would use actual FTP/SFTP/S3 clients)
		this.fileList.innerHTML = '';

		const loading = append(this.fileList, $('.nova-remote-loading'));
		loading.innerHTML = '<span class="codicon codicon-loading codicon-modifier-spin"></span> Loading...';

		// Simulate async load with demo data
		setTimeout(() => {
			this.fileList.innerHTML = '';

			// Demo files based on connection type
			this.currentFiles = this.getDemoFiles(connection);
			this.renderFiles();

			this.statusBar.textContent = localize('fileCount', '{0} items', this.currentFiles.length);
		}, 500);
	}

	private getDemoFiles(connection: IRemoteConnection): IRemoteFileEntry[] {
		// Demo data - in real implementation this would come from actual server
		const baseFiles: IRemoteFileEntry[] = [
			{ name: 'public_html', path: `${this.currentPath}/public_html`, isDirectory: true, modified: new Date() },
			{ name: 'logs', path: `${this.currentPath}/logs`, isDirectory: true, modified: new Date() },
			{ name: 'backups', path: `${this.currentPath}/backups`, isDirectory: true, modified: new Date() },
			{ name: '.htaccess', path: `${this.currentPath}/.htaccess`, isDirectory: false, size: 1024, modified: new Date() },
			{ name: 'index.html', path: `${this.currentPath}/index.html`, isDirectory: false, size: 4096, modified: new Date() },
			{ name: 'style.css', path: `${this.currentPath}/style.css`, isDirectory: false, size: 2048, modified: new Date() },
			{ name: 'app.js', path: `${this.currentPath}/app.js`, isDirectory: false, size: 8192, modified: new Date() },
			{ name: 'config.json', path: `${this.currentPath}/config.json`, isDirectory: false, size: 512, modified: new Date() },
		];

		if (connection.protocol === 's3') {
			return [
				{ name: 'assets/', path: `${this.currentPath}/assets/`, isDirectory: true, modified: new Date() },
				{ name: 'uploads/', path: `${this.currentPath}/uploads/`, isDirectory: true, modified: new Date() },
				{ name: 'index.html', path: `${this.currentPath}/index.html`, isDirectory: false, size: 4096, modified: new Date() },
				{ name: 'manifest.json', path: `${this.currentPath}/manifest.json`, isDirectory: false, size: 256, modified: new Date() },
			];
		}

		return baseFiles;
	}

	private renderFiles(): void {
		// Show hidden files based on config
		const showHidden = this.configurationService.getValue<boolean>('novaRemoteFiles.showHiddenFiles');
		const filesToShow = showHidden ?
			this.currentFiles :
			this.currentFiles.filter(f => !f.name.startsWith('.'));

		// Sort: directories first, then alphabetically
		filesToShow.sort((a, b) => {
			if (a.isDirectory && !b.isDirectory) return -1;
			if (!a.isDirectory && b.isDirectory) return 1;
			return a.name.localeCompare(b.name);
		});

		for (const file of filesToShow) {
			const item = append(this.fileList, $('.nova-remote-file-item'));

			// Checkbox for selection
			const checkbox = append(item, $('input.nova-file-checkbox')) as HTMLInputElement;
			checkbox.type = 'checkbox';
			checkbox.onclick = (e) => e.stopPropagation();

			// Icon
			const icon = append(item, $('.nova-file-icon'));
			icon.innerHTML = `<span class="codicon codicon-${this.getFileIcon(file)}"></span>`;

			// Name
			const name = append(item, $('.nova-file-name'));
			name.textContent = file.name;

			// Size
			const size = append(item, $('.nova-file-size'));
			size.textContent = file.isDirectory ? '--' : this.formatSize(file.size || 0);

			// Modified
			const modified = append(item, $('.nova-file-modified'));
			modified.textContent = file.modified ? this.formatDate(file.modified) : '--';

			// Permissions
			const perms = append(item, $('.nova-file-perms'));
			perms.textContent = file.permissions || (file.isDirectory ? 'drwxr-xr-x' : '-rw-r--r--');

			// Double click to navigate/open
			item.ondblclick = () => {
				if (file.isDirectory) {
					this.navigateTo(file.path);
				} else {
					this.openFile(file);
				}
			};

			// Context menu
			item.oncontextmenu = (e) => {
				e.preventDefault();
				this.showContextMenu(file, e);
			};
		}
	}

	private getFileIcon(file: IRemoteFileEntry): string {
		if (file.isDirectory) {
			return 'folder';
		}

		const ext = file.name.split('.').pop()?.toLowerCase();
		switch (ext) {
			case 'html':
			case 'htm':
				return 'file-code';
			case 'css':
			case 'scss':
			case 'less':
				return 'file-code';
			case 'js':
			case 'ts':
			case 'jsx':
			case 'tsx':
				return 'file-code';
			case 'json':
				return 'json';
			case 'md':
				return 'markdown';
			case 'jpg':
			case 'jpeg':
			case 'png':
			case 'gif':
			case 'svg':
				return 'file-media';
			case 'pdf':
				return 'file-pdf';
			case 'zip':
			case 'tar':
			case 'gz':
				return 'file-zip';
			default:
				return 'file';
		}
	}

	private formatSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
	}

	private formatDate(date: Date): string {
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	private navigateTo(path: string): void {
		this.currentPath = path;
		this.renderBreadcrumb();

		const activeConnectionId = this.storageService.get('novaRemoteFiles.activeConnection', StorageScope.PROFILE);
		if (activeConnectionId) {
			const connection = this.getConnection(activeConnectionId);
			if (connection) {
				this.loadFiles(connection);
			}
		}
	}

	private navigateUp(): void {
		const parts = this.currentPath.split('/').filter(p => p.length > 0);
		if (parts.length > 0) {
			parts.pop();
			this.navigateTo('/' + parts.join('/'));
		}
	}

	private refresh(): void {
		const activeConnectionId = this.storageService.get('novaRemoteFiles.activeConnection', StorageScope.PROFILE);
		if (activeConnectionId) {
			const connection = this.getConnection(activeConnectionId);
			if (connection) {
				this.loadFiles(connection);
			}
		}
	}

	private uploadFiles(): void {
		// Would trigger file picker and upload
		this.commandService.executeCommand('workbench.action.files.openFile');
	}

	private downloadFiles(): void {
		// Would download selected files
	}

	private createFolder(): void {
		// Would show input for new folder name
	}

	private deleteSelected(): void {
		// Would delete selected files with confirmation
	}

	private openFile(file: IRemoteFileEntry): void {
		// Would download and open file in editor
	}

	private showContextMenu(file: IRemoteFileEntry, event: MouseEvent): void {
		// Would show context menu with actions
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
