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
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { append, $ } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { IRemoteConnection, ConnectionProtocol } from './novaRemoteFiles.contribution.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';

const CONNECTIONS_STORAGE_KEY = 'novaRemoteFiles.connections';

export class NovaConnectionsView extends ViewPane {

	private container!: HTMLElement;
	private connectionsList!: HTMLElement;
	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections: Event<void> = this._onDidChangeConnections.event;

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

		// Listen for storage changes
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, CONNECTIONS_STORAGE_KEY, this._store)(() => {
			this.renderConnections();
			this._onDidChangeConnections.fire();
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('nova-connections-view');

		// Toolbar
		const toolbar = append(this.container, $('.nova-connections-toolbar'));

		const addButton = append(toolbar, $('button.nova-connection-button.add'));
		addButton.title = localize('addConnection', 'Add Connection');
		addButton.innerHTML = '<span class="codicon codicon-add"></span>';
		this._register(Disposable.None);
		addButton.onclick = () => {
			this.commandService.executeCommand('novaRemoteFiles.addConnection');
		};

		const refreshButton = append(toolbar, $('button.nova-connection-button.refresh'));
		refreshButton.title = localize('refresh', 'Refresh');
		refreshButton.innerHTML = '<span class="codicon codicon-refresh"></span>';
		refreshButton.onclick = () => {
			this.renderConnections();
		};

		// Connections list
		this.connectionsList = append(this.container, $('.nova-connections-list'));

		this.renderConnections();
	}

	private renderConnections(): void {
		this.connectionsList.innerHTML = '';

		const connections = this.getConnections();
		const activeConnectionId = this.storageService.get('novaRemoteFiles.activeConnection', StorageScope.PROFILE);

		if (connections.length === 0) {
			const emptyState = append(this.connectionsList, $('.nova-connections-empty'));
			const emptyIcon = append(emptyState, $('.empty-icon'));
			emptyIcon.innerHTML = '<span class="codicon codicon-remote-explorer"></span>';
			const emptyText = append(emptyState, $('.empty-text'));
			emptyText.textContent = localize('noConnections', 'No connections configured');
			const emptyHint = append(emptyState, $('.empty-hint'));
			emptyHint.textContent = localize('addConnectionHint', 'Click + to add a new connection');
			return;
		}

		// Group by protocol
		const grouped = this.groupConnectionsByProtocol(connections);

		for (const [protocol, conns] of Object.entries(grouped)) {
			const group = append(this.connectionsList, $('.nova-connection-group'));

			// Group header
			const header = append(group, $('.nova-connection-group-header'));
			const icon = this.getProtocolIcon(protocol as ConnectionProtocol);
			header.innerHTML = `<span class="codicon codicon-${icon}"></span> ${protocol.toUpperCase()}`;

			// Connection items
			for (const conn of conns) {
				const item = append(group, $('.nova-connection-item'));
				const isActive = conn.id === activeConnectionId;

				if (isActive) {
					item.classList.add('active');
				}

				// Connection info
				const info = append(item, $('.nova-connection-info'));
				const name = append(info, $('.nova-connection-name'));
				name.textContent = conn.name;

				const host = append(info, $('.nova-connection-host'));
				host.textContent = protocol === 's3' ? `${conn.bucket} (${conn.region})` : `${conn.host}:${conn.port || this.getDefaultPort(conn.protocol)}`;

				// Status indicator
				const status = append(item, $('.nova-connection-status'));
				if (isActive) {
					status.classList.add('connected');
					status.title = localize('connected', 'Connected');
				}

				// Actions
				const actions = append(item, $('.nova-connection-actions'));

				const connectBtn = append(actions, $('button.nova-connection-action'));
				connectBtn.innerHTML = isActive ?
					'<span class="codicon codicon-debug-disconnect"></span>' :
					'<span class="codicon codicon-plug"></span>';
				connectBtn.title = isActive ?
					localize('disconnect', 'Disconnect') :
					localize('connect', 'Connect');
				connectBtn.onclick = (e) => {
					e.stopPropagation();
					if (isActive) {
						this.commandService.executeCommand('novaRemoteFiles.disconnect');
					} else {
						this.storageService.store('novaRemoteFiles.activeConnection', conn.id, StorageScope.PROFILE, StorageTarget.MACHINE);
					}
				};

				const editBtn = append(actions, $('button.nova-connection-action'));
				editBtn.innerHTML = '<span class="codicon codicon-edit"></span>';
				editBtn.title = localize('edit', 'Edit');
				editBtn.onclick = (e) => {
					e.stopPropagation();
					this.editConnection(conn);
				};

				const deleteBtn = append(actions, $('button.nova-connection-action.delete'));
				deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
				deleteBtn.title = localize('delete', 'Delete');
				deleteBtn.onclick = (e) => {
					e.stopPropagation();
					this.deleteConnection(conn.id);
				};

				// Click to connect
				item.onclick = () => {
					if (!isActive) {
						this.storageService.store('novaRemoteFiles.activeConnection', conn.id, StorageScope.PROFILE, StorageTarget.MACHINE);
					}
				};
			}
		}
	}

	private getConnections(): IRemoteConnection[] {
		const json = this.storageService.get(CONNECTIONS_STORAGE_KEY, StorageScope.PROFILE, '[]');
		try {
			return JSON.parse(json);
		} catch {
			return [];
		}
	}

	private groupConnectionsByProtocol(connections: IRemoteConnection[]): Record<string, IRemoteConnection[]> {
		const grouped: Record<string, IRemoteConnection[]> = {};
		for (const conn of connections) {
			if (!grouped[conn.protocol]) {
				grouped[conn.protocol] = [];
			}
			grouped[conn.protocol].push(conn);
		}
		return grouped;
	}

	private getProtocolIcon(protocol: ConnectionProtocol): string {
		switch (protocol) {
			case 'ftp': return 'cloud-upload';
			case 'sftp': return 'lock';
			case 's3': return 'database';
			default: return 'remote-explorer';
		}
	}

	private getDefaultPort(protocol: ConnectionProtocol): number {
		switch (protocol) {
			case 'ftp': return 21;
			case 'sftp': return 22;
			default: return 0;
		}
	}

	private async editConnection(connection: IRemoteConnection): Promise<void> {
		// For now, just show a notification. A full implementation would show an edit dialog.
		this.commandService.executeCommand('novaRemoteFiles.addConnection');
	}

	private deleteConnection(connectionId: string): void {
		const connections = this.getConnections();
		const updated = connections.filter(c => c.id !== connectionId);
		this.storageService.store(CONNECTIONS_STORAGE_KEY, JSON.stringify(updated), StorageScope.PROFILE, StorageTarget.USER);

		// Clear active connection if it was the deleted one
		const activeId = this.storageService.get('novaRemoteFiles.activeConnection', StorageScope.PROFILE);
		if (activeId === connectionId) {
			this.storageService.remove('novaRemoteFiles.activeConnection', StorageScope.PROFILE);
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
