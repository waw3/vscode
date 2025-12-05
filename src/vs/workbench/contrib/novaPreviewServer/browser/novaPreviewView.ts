/*---------------------------------------------------------------------------------------------
 *  Nova Preview View
 *  Webview-based preview with live reload
 *--------------------------------------------------------------------------------------------*/

import './media/novaPreviewServer.css';
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
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { basename, dirname, extname } from '../../../../base/common/resources.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

interface PreviewState {
	isRunning: boolean;
	currentFile: URI | null;
	port: number;
	liveReloadEnabled: boolean;
	lastRefresh: number;
}

export class NovaPreviewView extends ViewPane {
	static readonly ID = 'novaPreview.preview';

	private container: HTMLElement | undefined;
	private toolbar: HTMLElement | undefined;
	private previewFrame: HTMLIFrameElement | undefined;
	private statusBar: HTMLElement | undefined;

	private readonly viewDisposables = this._register(new DisposableStore());
	private fileWatcher: IDisposable | undefined;
	private refreshTimeout: ReturnType<typeof setTimeout> | undefined;

	private state: PreviewState = {
		isRunning: false,
		currentFile: null,
		port: 3000,
		liveReloadEnabled: true,
		lastRefresh: 0
	};

	private readonly _onDidChangeState = this._register(new Emitter<PreviewState>());
	readonly onDidChangeState: Event<PreviewState> = this._onDidChangeState.event;

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
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// Load configuration
		this.state.liveReloadEnabled = this.configurationService.getValue('novaPreview.liveReload') ?? true;
		this.state.port = this.configurationService.getValue('novaPreview.defaultPort') ?? 3000;
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = container;
		container.classList.add('nova-preview-view');

		// Create toolbar
		this.renderToolbar();

		// Create preview area
		this.renderPreviewArea();

		// Create status bar
		this.renderStatusBar();

		// Listen for active editor changes
		this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChange()));

		// Initial check for current editor
		this.onActiveEditorChange();
	}

	private renderToolbar(): void {
		if (!this.container) {
			return;
		}

		this.toolbar = append(this.container, $('.nova-preview-toolbar'));

		// URL bar
		const urlBar = append(this.toolbar, $('.nova-preview-url-bar'));
		const urlInput = append(urlBar, $('input.nova-preview-url-input')) as HTMLInputElement;
		urlInput.type = 'text';
		urlInput.placeholder = 'No file selected';
		urlInput.readOnly = true;

		// Action buttons
		const actions = append(this.toolbar, $('.nova-preview-actions'));

		// Refresh button
		const refreshBtn = this.createActionButton(actions, Codicon.refresh, 'Refresh', () => this.refresh());

		// Live reload toggle
		const liveReloadBtn = this.createActionButton(
			actions,
			this.state.liveReloadEnabled ? Codicon.sync : Codicon.syncIgnored,
			this.state.liveReloadEnabled ? 'Live Reload: On' : 'Live Reload: Off',
			() => this.toggleLiveReload()
		);
		liveReloadBtn.classList.add('live-reload-btn');
		if (this.state.liveReloadEnabled) {
			liveReloadBtn.classList.add('active');
		}

		// Open in browser button
		this.createActionButton(actions, Codicon.linkExternal, 'Open in Browser', () => this.openInBrowser());
	}

	private createActionButton(container: HTMLElement, icon: ThemeIcon, title: string, onClick: () => void): HTMLElement {
		const button = append(container, $('.nova-preview-action'));
		button.classList.add(...ThemeIcon.asClassNameArray(icon));
		button.title = title;
		button.setAttribute('role', 'button');
		button.setAttribute('tabindex', '0');

		button.onclick = onClick;
		button.onkeydown = (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				onClick();
			}
		};

		this.viewDisposables.add({
			dispose: () => {
				button.onclick = null;
				button.onkeydown = null;
			}
		});

		return button;
	}

	private renderPreviewArea(): void {
		if (!this.container) {
			return;
		}

		const previewArea = append(this.container, $('.nova-preview-area'));

		// Create iframe for preview
		this.previewFrame = append(previewArea, $('iframe.nova-preview-frame')) as HTMLIFrameElement;
		this.previewFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
		this.previewFrame.setAttribute('frameborder', '0');

		// Show placeholder
		this.showPlaceholder();
	}

	private renderStatusBar(): void {
		if (!this.container) {
			return;
		}

		this.statusBar = append(this.container, $('.nova-preview-status-bar'));

		const statusText = append(this.statusBar, $('.nova-preview-status-text'));
		statusText.textContent = 'No preview active';

		const liveIndicator = append(this.statusBar, $('.nova-preview-live-indicator'));
		liveIndicator.classList.add('hidden');

		const dot = append(liveIndicator, $('.nova-preview-live-dot'));
		const label = append(liveIndicator, $('span'));
		label.textContent = 'Live';
	}

	private showPlaceholder(): void {
		if (!this.previewFrame) {
			return;
		}

		const placeholderHtml = `
			<!DOCTYPE html>
			<html>
			<head>
				<style>
					body {
						margin: 0;
						padding: 40px;
						font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
						display: flex;
						flex-direction: column;
						align-items: center;
						justify-content: center;
						min-height: calc(100vh - 80px);
						background: var(--vscode-editor-background, #1e1e1e);
						color: var(--vscode-foreground, #cccccc);
						text-align: center;
					}
					.icon {
						font-size: 64px;
						opacity: 0.3;
						margin-bottom: 24px;
					}
					.title {
						font-size: 18px;
						font-weight: 500;
						margin-bottom: 8px;
						opacity: 0.8;
					}
					.hint {
						font-size: 14px;
						opacity: 0.5;
						max-width: 300px;
					}
					.supported {
						margin-top: 24px;
						font-size: 12px;
						opacity: 0.4;
					}
				</style>
			</head>
			<body>
				<div class="icon">🌐</div>
				<div class="title">No Preview Active</div>
				<div class="hint">Open an HTML file and it will be previewed here automatically</div>
				<div class="supported">Supported: HTML, HTM</div>
			</body>
			</html>
		`;

		this.previewFrame.srcdoc = placeholderHtml;
	}

	private async onActiveEditorChange(): Promise<void> {
		const activeEditor = this.editorService.activeEditor;
		if (!activeEditor?.resource) {
			return;
		}

		const resource = activeEditor.resource;
		const ext = extname(resource).toLowerCase();

		if (['.html', '.htm'].includes(ext)) {
			await this.previewFile(resource);
		}
	}

	private async previewFile(resource: URI): Promise<void> {
		this.state.currentFile = resource;
		this.state.isRunning = true;
		this._onDidChangeState.fire(this.state);

		// Update URL bar
		this.updateUrlBar(resource);

		// Load content
		await this.loadContent(resource);

		// Set up file watching
		this.setupFileWatcher(resource);

		// Update status
		this.updateStatus('Previewing: ' + basename(resource));
	}

	private updateUrlBar(resource: URI): void {
		const urlInput = this.toolbar?.querySelector('.nova-preview-url-input') as HTMLInputElement;
		if (urlInput) {
			urlInput.value = resource.fsPath;
		}
	}

	private async loadContent(resource: URI): Promise<void> {
		if (!this.previewFrame) {
			return;
		}

		try {
			const content = await this.fileService.readFile(resource);
			let html = content.value.toString();

			// Inject live reload script if enabled
			if (this.state.liveReloadEnabled) {
				html = this.injectLiveReloadScript(html);
			}

			// Convert relative paths to absolute
			html = this.resolveRelativePaths(html, resource);

			this.previewFrame.srcdoc = html;
			this.state.lastRefresh = Date.now();

			// Show live indicator
			this.showLiveIndicator(true);
		} catch (error) {
			this.showError('Could not load file');
		}
	}

	private injectLiveReloadScript(html: string): string {
		const script = `
			<script>
				// Nova Preview Live Reload
				(function() {
					window.__novaPreviewLastUpdate = Date.now();
					window.addEventListener('message', function(e) {
						if (e.data && e.data.type === 'nova-preview-reload') {
							window.location.reload();
						}
					});
				})();
			</script>
		`;

		// Inject before </body> or at end
		if (html.includes('</body>')) {
			return html.replace('</body>', script + '</body>');
		} else if (html.includes('</html>')) {
			return html.replace('</html>', script + '</html>');
		} else {
			return html + script;
		}
	}

	private resolveRelativePaths(html: string, baseUri: URI): string {
		const baseDir = dirname(baseUri);

		// This is a simplified path resolution
		// In a real implementation, we'd need more sophisticated handling
		// For now, we rely on the iframe's base URL handling

		return html;
	}

	private setupFileWatcher(resource: URI): void {
		// Dispose existing watcher
		this.fileWatcher?.dispose();

		const watchExtensions = this.configurationService.getValue<string[]>('novaPreview.watchExtensions') || [];
		const baseDir = dirname(resource);

		// Watch the file itself
		this.fileWatcher = this.fileService.watch(resource);

		this._register(this.fileService.onDidFilesChange(e => {
			if (!this.state.liveReloadEnabled || !this.state.currentFile) {
				return;
			}

			// Check if changed file affects our preview
			const affectsPreview = e.changes.some(change => {
				const changedExt = extname(change.resource).toLowerCase().slice(1);
				return change.resource.toString() === this.state.currentFile?.toString() ||
					watchExtensions.includes(changedExt);
			});

			if (affectsPreview) {
				this.scheduleRefresh();
			}
		}));
	}

	private scheduleRefresh(): void {
		if (this.refreshTimeout) {
			clearTimeout(this.refreshTimeout);
		}

		const delay = this.configurationService.getValue<number>('novaPreview.reloadDelay') || 300;

		this.refreshTimeout = setTimeout(() => {
			this.refresh();
		}, delay);
	}

	private async refresh(): Promise<void> {
		if (!this.state.currentFile) {
			return;
		}

		// Flash the live indicator
		this.flashLiveIndicator();

		await this.loadContent(this.state.currentFile);
		this.updateStatus('Refreshed: ' + basename(this.state.currentFile));
	}

	private toggleLiveReload(): void {
		this.state.liveReloadEnabled = !this.state.liveReloadEnabled;

		// Update button
		const liveReloadBtn = this.toolbar?.querySelector('.live-reload-btn');
		if (liveReloadBtn) {
			liveReloadBtn.className = 'nova-preview-action live-reload-btn';
			liveReloadBtn.classList.add(...ThemeIcon.asClassNameArray(
				this.state.liveReloadEnabled ? Codicon.sync : Codicon.syncIgnored
			));
			liveReloadBtn.classList.toggle('active', this.state.liveReloadEnabled);
			liveReloadBtn.title = this.state.liveReloadEnabled ? 'Live Reload: On' : 'Live Reload: Off';
		}

		// Update indicator
		this.showLiveIndicator(this.state.liveReloadEnabled && this.state.isRunning);

		this._onDidChangeState.fire(this.state);
	}

	private openInBrowser(): void {
		if (this.state.currentFile) {
			this.openerService.open(this.state.currentFile);
		}
	}

	private updateStatus(text: string): void {
		const statusText = this.statusBar?.querySelector('.nova-preview-status-text');
		if (statusText) {
			statusText.textContent = text;
		}
	}

	private showLiveIndicator(show: boolean): void {
		const indicator = this.statusBar?.querySelector('.nova-preview-live-indicator');
		if (indicator) {
			indicator.classList.toggle('hidden', !show);
		}
	}

	private flashLiveIndicator(): void {
		const indicator = this.statusBar?.querySelector('.nova-preview-live-indicator');
		if (indicator) {
			indicator.classList.add('flash');
			setTimeout(() => indicator.classList.remove('flash'), 300);
		}
	}

	private showError(message: string): void {
		if (!this.previewFrame) {
			return;
		}

		const errorHtml = `
			<!DOCTYPE html>
			<html>
			<head>
				<style>
					body {
						margin: 0;
						padding: 40px;
						font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
						display: flex;
						flex-direction: column;
						align-items: center;
						justify-content: center;
						min-height: calc(100vh - 80px);
						background: var(--vscode-editor-background, #1e1e1e);
						color: var(--vscode-errorForeground, #f48771);
						text-align: center;
					}
					.icon { font-size: 48px; margin-bottom: 16px; }
					.message { font-size: 16px; }
				</style>
			</head>
			<body>
				<div class="icon">⚠️</div>
				<div class="message">${message}</div>
			</body>
			</html>
		`;

		this.previewFrame.srcdoc = errorHtml;
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}

	override dispose(): void {
		this.fileWatcher?.dispose();
		if (this.refreshTimeout) {
			clearTimeout(this.refreshTimeout);
		}
		super.dispose();
	}
}
