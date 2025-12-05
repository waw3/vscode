/*---------------------------------------------------------------------------------------------
 *  Nova Quick Actions View
 *  Provides quick access to common project actions
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
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

interface QuickAction {
	id: string;
	label: string;
	icon: ThemeIcon;
	command: string;
	args?: unknown[];
	description?: string;
}

export class NovaQuickActionsView extends ViewPane {
	static readonly ID = 'novaProject.quickActions';

	private container: HTMLElement | undefined;

	private readonly quickActions: QuickAction[] = [
		{
			id: 'newFile',
			label: 'New File',
			icon: Codicon.newFile,
			command: 'workbench.action.files.newUntitledFile',
			description: 'Create a new file'
		},
		{
			id: 'newFolder',
			label: 'New Folder',
			icon: Codicon.newFolder,
			command: 'explorer.newFolder',
			description: 'Create a new folder'
		},
		{
			id: 'openFile',
			label: 'Open File',
			icon: Codicon.folderOpened,
			command: 'workbench.action.files.openFile',
			description: 'Open an existing file'
		},
		{
			id: 'findInFiles',
			label: 'Find in Files',
			icon: Codicon.search,
			command: 'workbench.action.findInFiles',
			description: 'Search across all files'
		},
		{
			id: 'gitCommit',
			label: 'Git Commit',
			icon: Codicon.gitCommit,
			command: 'git.commit',
			description: 'Commit staged changes'
		},
		{
			id: 'gitPush',
			label: 'Git Push',
			icon: Codicon.cloudUpload,
			command: 'git.push',
			description: 'Push commits to remote'
		},
		{
			id: 'gitPull',
			label: 'Git Pull',
			icon: Codicon.cloudDownload,
			command: 'git.pull',
			description: 'Pull changes from remote'
		},
		{
			id: 'runTask',
			label: 'Run Task',
			icon: Codicon.play,
			command: 'workbench.action.tasks.runTask',
			description: 'Run a configured task'
		},
		{
			id: 'openTerminal',
			label: 'New Terminal',
			icon: Codicon.terminal,
			command: 'workbench.action.terminal.new',
			description: 'Open a new terminal'
		},
		{
			id: 'openSettings',
			label: 'Settings',
			icon: Codicon.gear,
			command: 'workbench.action.openSettings',
			description: 'Open settings'
		},
		{
			id: 'commandPalette',
			label: 'Command Palette',
			icon: Codicon.symbolKeyword,
			command: 'workbench.action.showCommands',
			description: 'Open command palette'
		},
		{
			id: 'toggleSplitSidebar',
			label: 'Split Sidebar',
			icon: Codicon.splitHorizontal,
			command: 'workbench.action.toggleSplitSidebar',
			description: 'Toggle secondary sidebar'
		}
	];

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
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = container;
		container.classList.add('nova-quick-actions-view');

		this.renderActions();

		// Re-render on workspace changes
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.renderActions()));
	}

	private renderActions(): void {
		if (!this.container) {
			return;
		}

		clearNode(this.container);

		const actionsGrid = append(this.container, $('.nova-quick-actions-grid'));

		for (const action of this.quickActions) {
			this.renderAction(actionsGrid, action);
		}
	}

	private renderAction(container: HTMLElement, action: QuickAction): void {
		const actionElement = append(container, $('.nova-quick-action'));
		actionElement.setAttribute('role', 'button');
		actionElement.setAttribute('tabindex', '0');
		actionElement.title = action.description || action.label;

		const iconContainer = append(actionElement, $('.nova-quick-action-icon'));
		iconContainer.classList.add(...ThemeIcon.asClassNameArray(action.icon));

		const label = append(actionElement, $('.nova-quick-action-label'));
		label.textContent = action.label;

		// Click handler
		this._register({
			dispose: () => {
				actionElement.onclick = null;
				actionElement.onkeydown = null;
			}
		});

		actionElement.onclick = () => {
			this.commandService.executeCommand(action.command, ...(action.args || []));
		};

		actionElement.onkeydown = (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.commandService.executeCommand(action.command, ...(action.args || []));
			}
		};
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
