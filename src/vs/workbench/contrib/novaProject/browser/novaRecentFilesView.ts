/*---------------------------------------------------------------------------------------------
 *  Nova Recent Files View
 *  Shows recently opened files in the workspace
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
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkspacesService, IRecentFile } from '../../../../platform/workspaces/common/workspaces.js';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

export class NovaRecentFilesView extends ViewPane {
	static readonly ID = 'novaProject.recentFiles';

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
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = container;
		container.classList.add('nova-recent-files-view');

		this.renderRecentFiles();

		// Re-render on editor changes
		this._register(this.editorService.onDidActiveEditorChange(() => this.renderRecentFiles()));
	}

	private async renderRecentFiles(): Promise<void> {
		if (!this.container) {
			return;
		}

		this.viewDisposables.clear();
		clearNode(this.container);

		const maxFiles = this.configurationService.getValue<number>('novaProject.recentFilesCount') || 10;

		try {
			const recentlyOpened = await this.workspacesService.getRecentlyOpened();
			const recentFiles = recentlyOpened.files.slice(0, maxFiles);

			if (recentFiles.length === 0) {
				this.renderEmptyState();
				return;
			}

			const list = append(this.container, $('.nova-recent-files-list'));

			for (const recentFile of recentFiles) {
				this.renderFileItem(list, recentFile);
			}
		} catch {
			this.renderEmptyState();
		}
	}

	private renderEmptyState(): void {
		if (!this.container) {
			return;
		}

		const emptyState = append(this.container, $('.nova-recent-files-empty'));
		const icon = append(emptyState, $('.nova-recent-files-empty-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.history));

		const message = append(emptyState, $('.nova-recent-files-empty-message'));
		message.textContent = 'No recent files';

		const hint = append(emptyState, $('.nova-recent-files-empty-hint'));
		hint.textContent = 'Files you open will appear here';
	}

	private renderFileItem(container: HTMLElement, recentFile: IRecentFile): void {
		const fileUri = recentFile.fileUri;
		const fileName = basename(fileUri);
		const filePath = dirname(fileUri).fsPath;

		const item = append(container, $('.nova-recent-file-item'));
		item.setAttribute('role', 'button');
		item.setAttribute('tabindex', '0');
		item.title = fileUri.fsPath;

		// File icon
		const iconContainer = append(item, $('.nova-recent-file-icon'));
		const iconClass = this.getFileIconClass(fileName);
		iconContainer.classList.add(...ThemeIcon.asClassNameArray(iconClass));

		// File info
		const infoContainer = append(item, $('.nova-recent-file-info'));

		const nameElement = append(infoContainer, $('.nova-recent-file-name'));
		nameElement.textContent = fileName;

		const pathElement = append(infoContainer, $('.nova-recent-file-path'));
		pathElement.textContent = filePath;

		// Click handler
		const clickHandler = () => {
			this.editorService.openEditor({ resource: fileUri });
		};

		item.onclick = clickHandler;
		item.onkeydown = (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				clickHandler();
			}
		};

		this.viewDisposables.add({
			dispose: () => {
				item.onclick = null;
				item.onkeydown = null;
			}
		});
	}

	private getFileIconClass(fileName: string): ThemeIcon {
		const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';

		switch (extension) {
			case 'ts':
			case 'tsx':
				return Codicon.symbolClass;
			case 'js':
			case 'jsx':
				return Codicon.symbolMethod;
			case 'json':
				return Codicon.json;
			case 'md':
				return Codicon.markdown;
			case 'html':
			case 'htm':
				return Codicon.code;
			case 'css':
			case 'scss':
			case 'less':
				return Codicon.symbolColor;
			case 'py':
				return Codicon.symbolClass;
			case 'go':
				return Codicon.symbolInterface;
			case 'rs':
				return Codicon.symbolStruct;
			case 'java':
				return Codicon.symbolClass;
			case 'c':
			case 'cpp':
			case 'h':
				return Codicon.symbolConstant;
			case 'sh':
			case 'bash':
				return Codicon.terminal;
			case 'yml':
			case 'yaml':
				return Codicon.settingsGear;
			case 'xml':
				return Codicon.code;
			case 'svg':
			case 'png':
			case 'jpg':
			case 'jpeg':
			case 'gif':
				return Codicon.fileMedia;
			default:
				return Codicon.file;
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
