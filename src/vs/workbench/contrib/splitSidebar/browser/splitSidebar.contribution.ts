/*---------------------------------------------------------------------------------------------
 *  Nova Split Sidebar Contribution
 *  Enables showing view containers in both sidebars simultaneously
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { Codicon } from '../../../../base/common/codicons.js';

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'novaSplitSidebar',
	title: localize('novaSplitSidebar', "Nova Split Sidebar"),
	type: 'object',
	properties: {
		'workbench.novaSplitSidebar.enabled': {
			type: 'boolean',
			default: true,
			description: localize('novaSplitSidebar.enabled', "Enable Nova-style split sidebar functionality, allowing view containers to be shown in both sidebars."),
			scope: ConfigurationScope.APPLICATION
		},
		'workbench.novaSplitSidebar.showAuxiliaryBarByDefault': {
			type: 'boolean',
			default: false,
			description: localize('novaSplitSidebar.showAuxiliaryBarByDefault', "Automatically show the auxiliary bar (right sidebar) when split sidebar is enabled."),
			scope: ConfigurationScope.WINDOW
		},
		'workbench.novaSplitSidebar.defaultSecondaryViews': {
			type: 'array',
			items: { type: 'string' },
			default: [],
			description: localize('novaSplitSidebar.defaultSecondaryViews', "View container IDs to show in the auxiliary bar by default."),
			scope: ConfigurationScope.WINDOW
		}
	}
});

// Command: Move View Container to Auxiliary Bar
registerAction2(class MoveToAuxiliaryBarAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.moveViewContainerToAuxiliaryBar',
			title: localize2('moveToAuxiliaryBar', "Move View to Secondary Sidebar"),
			category: localize2('view', "View"),
			f1: true,
			icon: Codicon.splitHorizontal,
			menu: [{
				id: MenuId.ViewContainerTitleContext,
				group: 'navigation',
				order: 100
			}, {
				id: MenuId.ViewTitleContext,
				group: 'navigation',
				order: 100
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewDescriptorService = accessor.get(IViewDescriptorService);
		const quickInputService = accessor.get(IQuickInputService);
		const layoutService = accessor.get(IWorkbenchLayoutService);

		// Get all view containers in the main sidebar
		const sidebarContainers = viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.Sidebar);

		if (sidebarContainers.length === 0) {
			return;
		}

		// Create quick pick items
		const items: IQuickPickItem[] = sidebarContainers.map(container => {
			const model = viewDescriptorService.getViewContainerModel(container);
			return {
				id: container.id,
				label: model.title,
				description: container.id
			};
		});

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('selectViewToMove', "Select a view to move to the secondary sidebar")
		});

		if (selected) {
			const container = viewDescriptorService.getViewContainerById(selected.id!);
			if (container) {
				viewDescriptorService.moveViewContainerToLocation(container, ViewContainerLocation.AuxiliaryBar, undefined, 'nova-split-sidebar');

				// Ensure auxiliary bar is visible
				if (!layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
					layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
				}
			}
		}
	}
});

// Command: Move View Container to Main Sidebar
registerAction2(class MoveToSidebarAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.moveViewContainerToSidebar',
			title: localize2('moveToSidebar', "Move View to Primary Sidebar"),
			category: localize2('view', "View"),
			f1: true,
			icon: Codicon.splitHorizontal,
			menu: [{
				id: MenuId.ViewContainerTitleContext,
				group: 'navigation',
				order: 101,
				when: ContextKeyExpr.equals('viewContainerLocation', 'auxiliarybar')
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewDescriptorService = accessor.get(IViewDescriptorService);
		const quickInputService = accessor.get(IQuickInputService);

		// Get all view containers in the auxiliary bar
		const auxContainers = viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar);

		if (auxContainers.length === 0) {
			return;
		}

		// Create quick pick items
		const items: IQuickPickItem[] = auxContainers.map(container => {
			const model = viewDescriptorService.getViewContainerModel(container);
			return {
				id: container.id,
				label: model.title,
				description: container.id
			};
		});

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('selectViewToMoveToPrimary', "Select a view to move to the primary sidebar")
		});

		if (selected) {
			const container = viewDescriptorService.getViewContainerById(selected.id!);
			if (container) {
				viewDescriptorService.moveViewContainerToLocation(container, ViewContainerLocation.Sidebar, undefined, 'nova-split-sidebar');
			}
		}
	}
});

// Command: Toggle Split Sidebar (show/hide auxiliary bar)
registerAction2(class ToggleSplitSidebarAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.toggleSplitSidebar',
			title: localize2('toggleSplitSidebar', "Toggle Split Sidebar"),
			category: localize2('view', "View"),
			f1: true,
			icon: Codicon.splitHorizontal,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyB
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const isVisible = layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		layoutService.setPartHidden(isVisible, Parts.AUXILIARYBAR_PART);
	}
});

// Command: Quick Split - Move current active view to auxiliary bar
registerAction2(class QuickSplitViewAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.quickSplitView',
			title: localize2('quickSplitView', "Split Current View to Secondary Sidebar"),
			category: localize2('view', "View"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyB
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewDescriptorService = accessor.get(IViewDescriptorService);
		const viewsService = accessor.get(IViewsService);
		const layoutService = accessor.get(IWorkbenchLayoutService);

		// Get the currently focused view
		const focusedView = viewsService.getFocusedView();
		if (!focusedView) {
			return;
		}

		// Get the view container for this view
		const viewContainer = viewDescriptorService.getViewContainerByViewId(focusedView.id);
		if (!viewContainer) {
			return;
		}

		// Check if it's already in auxiliary bar
		const currentLocation = viewDescriptorService.getViewContainerLocation(viewContainer);
		if (currentLocation === ViewContainerLocation.AuxiliaryBar) {
			// Move back to sidebar
			viewDescriptorService.moveViewContainerToLocation(viewContainer, ViewContainerLocation.Sidebar, undefined, 'nova-split-sidebar');
		} else if (currentLocation === ViewContainerLocation.Sidebar) {
			// Move to auxiliary bar
			viewDescriptorService.moveViewContainerToLocation(viewContainer, ViewContainerLocation.AuxiliaryBar, undefined, 'nova-split-sidebar');

			// Ensure auxiliary bar is visible
			if (!layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
		}
	}
});

// Command: Split Sidebar Layout - Show both sidebars
registerAction2(class ShowSplitSidebarLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.showSplitSidebarLayout',
			title: localize2('showSplitSidebarLayout', "Show Split Sidebar Layout"),
			category: localize2('view', "View"),
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);

		// Show both sidebars
		if (!layoutService.isVisible(Parts.SIDEBAR_PART)) {
			layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		}
		if (!layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		}
	}
});

// Command: Focus Primary Sidebar
registerAction2(class FocusPrimarySidebarAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.focusPrimarySidebar',
			title: localize2('focusPrimarySidebar', "Focus Primary Sidebar"),
			category: localize2('view', "View"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Digit1,
				when: ContextKeyExpr.has('novaSplitSidebar.enabled')
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		if (!layoutService.isVisible(Parts.SIDEBAR_PART)) {
			layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		}
		layoutService.focusPart(Parts.SIDEBAR_PART);
	}
});

// Command: Focus Secondary Sidebar
registerAction2(class FocusSecondarySidebarAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.focusSecondarySidebar',
			title: localize2('focusSecondarySidebar', "Focus Secondary Sidebar"),
			category: localize2('view', "View"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Digit2,
				when: ContextKeyExpr.has('novaSplitSidebar.enabled')
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		if (!layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		}
		layoutService.focusPart(Parts.AUXILIARYBAR_PART);
	}
});

// Command: Swap Sidebar Contents
registerAction2(class SwapSidebarsAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.swapSidebars',
			title: localize2('swapSidebars', "Swap Primary and Secondary Sidebar Contents"),
			category: localize2('view', "View"),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewDescriptorService = accessor.get(IViewDescriptorService);

		// Get containers from both locations
		const sidebarContainers = [...viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.Sidebar)];
		const auxContainers = [...viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar)];

		// Move sidebar containers to auxiliary bar
		for (const container of sidebarContainers) {
			viewDescriptorService.moveViewContainerToLocation(container, ViewContainerLocation.AuxiliaryBar, undefined, 'nova-split-sidebar');
		}

		// Move auxiliary containers to sidebar
		for (const container of auxContainers) {
			viewDescriptorService.moveViewContainerToLocation(container, ViewContainerLocation.Sidebar, undefined, 'nova-split-sidebar');
		}
	}
});
