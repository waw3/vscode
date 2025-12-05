/*---------------------------------------------------------------------------------------------
 *  Nova Preview Server Contribution
 *  Provides a built-in preview server with live reload
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { NovaPreviewView } from './novaPreviewView.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

// Context keys
export const NOVA_PREVIEW_ACTIVE = new RawContextKey<boolean>('novaPreviewActive', false);

// Icons
const novaPreviewIcon = registerIcon('nova-preview', Codicon.preview, localize('novaPreviewIcon', 'Icon for the Nova Preview view container.'));

// View Container
const VIEW_CONTAINER_ID = 'workbench.view.novaPreview';
const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewContainer = viewContainersRegistry.registerViewContainer({
	id: VIEW_CONTAINER_ID,
	title: localize2('novaPreview', "Preview"),
	icon: novaPreviewIcon,
	order: 6,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'workbench.view.novaPreview.state',
	hideIfEmpty: false
}, ViewContainerLocation.AuxiliaryBar, { isDefault: false });

// Register Views
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);

// Preview View
const previewViewDescriptor: IViewDescriptor = {
	id: 'novaPreview.preview',
	name: localize2('preview', "Live Preview"),
	ctorDescriptor: new SyncDescriptor(NovaPreviewView),
	order: 1,
	canToggleVisibility: true,
	canMoveView: true,
	containerIcon: novaPreviewIcon,
	weight: 100
};

viewsRegistry.registerViews([previewViewDescriptor], viewContainer);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'novaPreview',
	title: localize('novaPreview', "Nova Preview Server"),
	type: 'object',
	properties: {
		'novaPreview.defaultPort': {
			type: 'number',
			default: 3000,
			minimum: 1024,
			maximum: 65535,
			description: localize('novaPreview.defaultPort', "Default port for the preview server."),
			scope: ConfigurationScope.WINDOW
		},
		'novaPreview.liveReload': {
			type: 'boolean',
			default: true,
			description: localize('novaPreview.liveReload', "Automatically reload preview when files change."),
			scope: ConfigurationScope.WINDOW
		},
		'novaPreview.reloadDelay': {
			type: 'number',
			default: 300,
			minimum: 100,
			maximum: 2000,
			description: localize('novaPreview.reloadDelay', "Delay in milliseconds before reloading after file changes."),
			scope: ConfigurationScope.WINDOW
		},
		'novaPreview.watchExtensions': {
			type: 'array',
			items: { type: 'string' },
			default: ['html', 'htm', 'css', 'js', 'json', 'svg', 'png', 'jpg', 'jpeg', 'gif'],
			description: localize('novaPreview.watchExtensions', "File extensions to watch for live reload."),
			scope: ConfigurationScope.WINDOW
		},
		'novaPreview.rootPath': {
			type: 'string',
			default: '',
			description: localize('novaPreview.rootPath', "Root path for the preview server relative to workspace. Leave empty for workspace root."),
			scope: ConfigurationScope.WINDOW
		}
	}
});

// Command: Preview Current File
registerAction2(class PreviewCurrentFileAction extends Action2 {
	constructor() {
		super({
			id: 'novaPreview.previewCurrentFile',
			title: localize2('previewCurrentFile', "Preview Current File"),
			category: localize2('preview', "Preview"),
			f1: true,
			icon: Codicon.preview,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP
			},
			menu: [{
				id: MenuId.EditorTitle,
				group: 'navigation',
				order: -100,
				when: ContextKeyExpr.regex('resourceExtname', /^\.(html|htm)$/)
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		const activeEditor = editorService.activeEditor;
		if (!activeEditor?.resource) {
			notificationService.info('No file is currently open');
			return;
		}

		const resource = activeEditor.resource;
		const extension = resource.path.split('.').pop()?.toLowerCase();

		if (!['html', 'htm'].includes(extension || '')) {
			notificationService.info('Preview is only available for HTML files');
			return;
		}

		// The view will handle the preview
		// We emit a command that the view can listen to
	}
});

// Command: Open Preview in Browser
registerAction2(class OpenPreviewInBrowserAction extends Action2 {
	constructor() {
		super({
			id: 'novaPreview.openInBrowser',
			title: localize2('openInBrowser', "Open Preview in Browser"),
			category: localize2('preview', "Preview"),
			f1: true,
			icon: Codicon.linkExternal
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const configurationService = accessor.get(IConfigurationRegistry);
		const notificationService = accessor.get(INotificationService);

		// Open the preview URL in external browser
		const port = 3000; // Would get from preview service
		try {
			await openerService.open(URI.parse(`http://localhost:${port}`));
		} catch {
			notificationService.error('Could not open browser');
		}
	}
});

// Command: Refresh Preview
registerAction2(class RefreshPreviewAction extends Action2 {
	constructor() {
		super({
			id: 'novaPreview.refresh',
			title: localize2('refreshPreview', "Refresh Preview"),
			category: localize2('preview', "Preview"),
			f1: true,
			icon: Codicon.refresh,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyR,
				when: NOVA_PREVIEW_ACTIVE
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		// The view will handle the refresh
	}
});

// Command: Toggle Live Reload
registerAction2(class ToggleLiveReloadAction extends Action2 {
	constructor() {
		super({
			id: 'novaPreview.toggleLiveReload',
			title: localize2('toggleLiveReload', "Toggle Live Reload"),
			category: localize2('preview', "Preview"),
			f1: true,
			icon: Codicon.sync
		});
	}

	run(accessor: ServicesAccessor): void {
		// Toggle live reload setting
	}
});

// Command: Stop Preview Server
registerAction2(class StopPreviewServerAction extends Action2 {
	constructor() {
		super({
			id: 'novaPreview.stopServer',
			title: localize2('stopServer', "Stop Preview Server"),
			category: localize2('preview', "Preview"),
			f1: true,
			icon: Codicon.debugStop
		});
	}

	run(accessor: ServicesAccessor): void {
		// Stop the server
	}
});
