/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewsRegistry, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { NovaConnectionsView } from './novaConnectionsView.js';
import { NovaRemoteFilesView } from './novaRemoteFilesView.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';

import './media/novaRemoteFiles.css';

// Register icons
const novaRemoteFilesIcon = registerIcon('nova-remote-files', Codicon.remoteExplorer, localize('novaRemoteFilesIcon', 'Icon for Nova Remote Files view container.'));

// Register view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.novaRemoteFiles',
	title: localize('novaRemoteFiles', 'Remote Files'),
	icon: novaRemoteFilesIcon,
	order: 8,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.novaRemoteFiles', { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.novaRemoteFiles',
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: false });

// Register views
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
	{
		id: 'novaRemoteFiles.connections',
		name: localize('connections', 'Connections'),
		ctorDescriptor: new SyncDescriptor(NovaConnectionsView),
		order: 1,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: novaRemoteFilesIcon,
	},
	{
		id: 'novaRemoteFiles.browser',
		name: localize('browser', 'File Browser'),
		ctorDescriptor: new SyncDescriptor(NovaRemoteFilesView),
		order: 2,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: novaRemoteFilesIcon,
	}
], VIEW_CONTAINER);

// Connection types
export type ConnectionProtocol = 'ftp' | 'sftp' | 's3';

export interface IRemoteConnection {
	id: string;
	name: string;
	protocol: ConnectionProtocol;
	host: string;
	port?: number;
	username?: string;
	password?: string;
	privateKeyPath?: string;
	remotePath?: string;
	// S3 specific
	bucket?: string;
	region?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
}

export interface IRemoteFileEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size?: number;
	modified?: Date;
	permissions?: string;
}

// Storage key for connections
const CONNECTIONS_STORAGE_KEY = 'novaRemoteFiles.connections';

// Register actions
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'novaRemoteFiles.addConnection',
			title: localize('addConnection', 'Add Remote Connection'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const storageService = accessor.get(IStorageService);
		const notificationService = accessor.get(INotificationService);

		// Step 1: Select protocol
		const protocolItems: IQuickPickItem[] = [
			{ label: 'FTP', description: 'File Transfer Protocol', id: 'ftp' },
			{ label: 'SFTP', description: 'SSH File Transfer Protocol', id: 'sftp' },
			{ label: 'S3', description: 'Amazon S3 / Compatible Storage', id: 's3' },
		];

		const protocolPick = await quickInputService.pick(protocolItems, {
			placeHolder: localize('selectProtocol', 'Select connection protocol'),
			title: localize('addConnection', 'Add Remote Connection')
		});

		if (!protocolPick) {
			return;
		}

		const protocol = protocolPick.id as ConnectionProtocol;

		// Step 2: Get connection name
		const name = await quickInputService.input({
			placeHolder: localize('connectionName', 'Connection name'),
			title: localize('addConnection', 'Add Remote Connection'),
			validateInput: async (value) => {
				if (!value || value.trim().length === 0) {
					return localize('nameRequired', 'Connection name is required');
				}
				return undefined;
			}
		});

		if (!name) {
			return;
		}

		let connection: IRemoteConnection;

		if (protocol === 's3') {
			// S3 configuration
			const bucket = await quickInputService.input({
				placeHolder: localize('s3Bucket', 'Bucket name'),
				title: localize('s3Config', 'S3 Configuration')
			});

			if (!bucket) {
				return;
			}

			const region = await quickInputService.input({
				placeHolder: localize('s3Region', 'Region (e.g., us-east-1)'),
				title: localize('s3Config', 'S3 Configuration'),
				value: 'us-east-1'
			});

			const accessKeyId = await quickInputService.input({
				placeHolder: localize('s3AccessKey', 'Access Key ID'),
				title: localize('s3Config', 'S3 Configuration')
			});

			const secretAccessKey = await quickInputService.input({
				placeHolder: localize('s3SecretKey', 'Secret Access Key'),
				title: localize('s3Config', 'S3 Configuration'),
				password: true
			});

			connection = {
				id: `s3-${Date.now()}`,
				name: name.trim(),
				protocol,
				host: `${bucket}.s3.${region || 'us-east-1'}.amazonaws.com`,
				bucket,
				region: region || 'us-east-1',
				accessKeyId,
				secretAccessKey,
				remotePath: '/'
			};
		} else {
			// FTP/SFTP configuration
			const host = await quickInputService.input({
				placeHolder: localize('hostPlaceholder', 'Host (e.g., ftp.example.com)'),
				title: localize('serverConfig', 'Server Configuration'),
				validateInput: async (value) => {
					if (!value || value.trim().length === 0) {
						return localize('hostRequired', 'Host is required');
					}
					return undefined;
				}
			});

			if (!host) {
				return;
			}

			const defaultPort = protocol === 'sftp' ? '22' : '21';
			const portStr = await quickInputService.input({
				placeHolder: localize('portPlaceholder', 'Port'),
				title: localize('serverConfig', 'Server Configuration'),
				value: defaultPort
			});

			const username = await quickInputService.input({
				placeHolder: localize('usernamePlaceholder', 'Username'),
				title: localize('serverConfig', 'Server Configuration')
			});

			const password = await quickInputService.input({
				placeHolder: localize('passwordPlaceholder', 'Password'),
				title: localize('serverConfig', 'Server Configuration'),
				password: true
			});

			const remotePath = await quickInputService.input({
				placeHolder: localize('remotePathPlaceholder', 'Remote path (default: /)'),
				title: localize('serverConfig', 'Server Configuration'),
				value: '/'
			});

			connection = {
				id: `${protocol}-${Date.now()}`,
				name: name.trim(),
				protocol,
				host: host.trim(),
				port: parseInt(portStr || defaultPort, 10),
				username,
				password,
				remotePath: remotePath || '/'
			};
		}

		// Save connection
		const existingConnectionsJson = storageService.get(CONNECTIONS_STORAGE_KEY, StorageScope.PROFILE, '[]');
		const connections: IRemoteConnection[] = JSON.parse(existingConnectionsJson);
		connections.push(connection);
		storageService.store(CONNECTIONS_STORAGE_KEY, JSON.stringify(connections), StorageScope.PROFILE, StorageTarget.USER);

		notificationService.notify({
			severity: Severity.Info,
			message: localize('connectionAdded', 'Connection "{0}" added successfully', connection.name)
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'novaRemoteFiles.removeConnection',
			title: localize('removeConnection', 'Remove Remote Connection'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const storageService = accessor.get(IStorageService);
		const notificationService = accessor.get(INotificationService);

		const existingConnectionsJson = storageService.get(CONNECTIONS_STORAGE_KEY, StorageScope.PROFILE, '[]');
		const connections: IRemoteConnection[] = JSON.parse(existingConnectionsJson);

		if (connections.length === 0) {
			notificationService.notify({
				severity: Severity.Info,
				message: localize('noConnections', 'No connections configured')
			});
			return;
		}

		const items: IQuickPickItem[] = connections.map(c => ({
			label: c.name,
			description: `${c.protocol.toUpperCase()} - ${c.host}`,
			id: c.id
		}));

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('selectConnectionToRemove', 'Select connection to remove'),
			title: localize('removeConnection', 'Remove Remote Connection')
		});

		if (!selected) {
			return;
		}

		const updatedConnections = connections.filter(c => c.id !== selected.id);
		storageService.store(CONNECTIONS_STORAGE_KEY, JSON.stringify(updatedConnections), StorageScope.PROFILE, StorageTarget.USER);

		notificationService.notify({
			severity: Severity.Info,
			message: localize('connectionRemoved', 'Connection "{0}" removed', selected.label)
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'novaRemoteFiles.connect',
			title: localize('connect', 'Connect to Remote Server'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const storageService = accessor.get(IStorageService);
		const notificationService = accessor.get(INotificationService);

		const existingConnectionsJson = storageService.get(CONNECTIONS_STORAGE_KEY, StorageScope.PROFILE, '[]');
		const connections: IRemoteConnection[] = JSON.parse(existingConnectionsJson);

		if (connections.length === 0) {
			notificationService.notify({
				severity: Severity.Info,
				message: localize('noConnectionsConfigured', 'No connections configured. Use "Add Remote Connection" to create one.')
			});
			return;
		}

		const items: IQuickPickItem[] = connections.map(c => ({
			label: c.name,
			description: `${c.protocol.toUpperCase()} - ${c.host}`,
			id: c.id
		}));

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('selectConnectionToConnect', 'Select connection'),
			title: localize('connect', 'Connect to Remote Server')
		});

		if (!selected) {
			return;
		}

		// Store active connection ID
		storageService.store('novaRemoteFiles.activeConnection', selected.id, StorageScope.PROFILE, StorageTarget.MACHINE);

		notificationService.notify({
			severity: Severity.Info,
			message: localize('connecting', 'Connecting to "{0}"...', selected.label)
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'novaRemoteFiles.disconnect',
			title: localize('disconnect', 'Disconnect from Remote Server'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const storageService = accessor.get(IStorageService);
		const notificationService = accessor.get(INotificationService);

		storageService.remove('novaRemoteFiles.activeConnection', StorageScope.PROFILE);

		notificationService.notify({
			severity: Severity.Info,
			message: localize('disconnected', 'Disconnected from remote server')
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'novaRemoteFiles.refresh',
			title: localize('refresh', 'Refresh Remote Files'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F5,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.notify({
			severity: Severity.Info,
			message: localize('refreshing', 'Refreshing remote file list...')
		});
	}
});

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'novaRemoteFiles',
	title: localize('novaRemoteFiles', 'Nova Remote Files'),
	type: 'object',
	properties: {
		'novaRemoteFiles.showHiddenFiles': {
			type: 'boolean',
			default: false,
			description: localize('showHiddenFiles', 'Show hidden files in remote file browser'),
			scope: ConfigurationScope.WINDOW
		},
		'novaRemoteFiles.defaultProtocol': {
			type: 'string',
			enum: ['ftp', 'sftp', 's3'],
			default: 'sftp',
			description: localize('defaultProtocol', 'Default protocol for new connections'),
			scope: ConfigurationScope.WINDOW
		},
		'novaRemoteFiles.autoConnect': {
			type: 'boolean',
			default: false,
			description: localize('autoConnect', 'Automatically connect to last used server on startup'),
			scope: ConfigurationScope.WINDOW
		},
		'novaRemoteFiles.confirmDelete': {
			type: 'boolean',
			default: true,
			description: localize('confirmDelete', 'Show confirmation dialog before deleting remote files'),
			scope: ConfigurationScope.WINDOW
		},
		'novaRemoteFiles.uploadOnSave': {
			type: 'boolean',
			default: false,
			description: localize('uploadOnSave', 'Automatically upload files when saved'),
			scope: ConfigurationScope.RESOURCE
		}
	}
});
