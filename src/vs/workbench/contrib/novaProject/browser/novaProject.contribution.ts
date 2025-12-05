/*---------------------------------------------------------------------------------------------
 *  Nova Project Panel Contribution
 *  Provides an integrated project overview inspired by Panic Nova
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { NovaProjectView } from './novaProjectView.js';
import { NovaQuickActionsView } from './novaQuickActionsView.js';
import { NovaRecentFilesView } from './novaRecentFilesView.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

// Icons
const novaProjectIcon = registerIcon('nova-project', Codicon.project, localize('novaProjectIcon', 'Icon for the Nova Project view container.'));

// View Container
const VIEW_CONTAINER_ID = 'workbench.view.novaProject';
const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewContainer = viewContainersRegistry.registerViewContainer({
	id: VIEW_CONTAINER_ID,
	title: localize2('novaProject', "Project"),
	icon: novaProjectIcon,
	order: 0,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.novaProject.state',
	hideIfEmpty: false
}, ViewContainerLocation.Sidebar, { isDefault: false });

// Register Views
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);

// Project Overview View
const projectOverviewViewDescriptor: IViewDescriptor = {
	id: 'novaProject.overview',
	name: localize2('projectOverview', "Overview"),
	ctorDescriptor: new SyncDescriptor(NovaProjectView),
	order: 1,
	canToggleVisibility: true,
	canMoveView: true,
	containerIcon: novaProjectIcon,
	weight: 60
};

// Quick Actions View
const quickActionsViewDescriptor: IViewDescriptor = {
	id: 'novaProject.quickActions',
	name: localize2('quickActions', "Quick Actions"),
	ctorDescriptor: new SyncDescriptor(NovaQuickActionsView),
	order: 2,
	canToggleVisibility: true,
	canMoveView: true,
	collapsed: false,
	weight: 20
};

// Recent Files View
const recentFilesViewDescriptor: IViewDescriptor = {
	id: 'novaProject.recentFiles',
	name: localize2('recentFiles', "Recent Files"),
	ctorDescriptor: new SyncDescriptor(NovaRecentFilesView),
	order: 3,
	canToggleVisibility: true,
	canMoveView: true,
	collapsed: true,
	weight: 20
};

viewsRegistry.registerViews([projectOverviewViewDescriptor, quickActionsViewDescriptor, recentFilesViewDescriptor], viewContainer);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'novaProject',
	title: localize('novaProject', "Nova Project"),
	type: 'object',
	properties: {
		'novaProject.showInActivityBar': {
			type: 'boolean',
			default: true,
			description: localize('novaProject.showInActivityBar', "Show the Project panel in the activity bar."),
			scope: ConfigurationScope.APPLICATION
		},
		'novaProject.showGitInfo': {
			type: 'boolean',
			default: true,
			description: localize('novaProject.showGitInfo', "Show Git repository information in the project overview."),
			scope: ConfigurationScope.WINDOW
		},
		'novaProject.showFileStats': {
			type: 'boolean',
			default: true,
			description: localize('novaProject.showFileStats', "Show file statistics in the project overview."),
			scope: ConfigurationScope.WINDOW
		},
		'novaProject.recentFilesCount': {
			type: 'number',
			default: 10,
			minimum: 5,
			maximum: 50,
			description: localize('novaProject.recentFilesCount', "Number of recent files to show in the Recent Files view."),
			scope: ConfigurationScope.WINDOW
		}
	}
});
