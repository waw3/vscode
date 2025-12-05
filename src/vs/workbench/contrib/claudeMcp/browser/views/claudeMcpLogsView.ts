/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';

interface ILogEntry {
	timestamp: Date;
	server: string;
	level: 'info' | 'warn' | 'error' | 'debug';
	message: string;
}

export class ClaudeMcpLogsView extends ViewPane {

	private container!: HTMLElement;
	private logsContainer!: HTMLElement;
	private filterSelect!: HTMLSelectElement;
	private logs: ILogEntry[] = [];
	private autoScroll: boolean = true;

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
		@IHoverService hoverService: IHoverService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// Add sample logs
		this.addSampleLogs();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-mcp-logs-view');

		// Toolbar
		const toolbar = append(this.container, $('.claude-mcp-logs-toolbar'));

		// Filter
		const filterWrapper = append(toolbar, $('.claude-mcp-filter-wrapper'));
		const filterLabel = append(filterWrapper, $('label'));
		filterLabel.textContent = localize('filter', 'Filter:');

		this.filterSelect = append(filterWrapper, $('select.claude-mcp-filter-select')) as HTMLSelectElement;

		const allOption = append(this.filterSelect, $('option')) as HTMLOptionElement;
		allOption.value = 'all';
		allOption.textContent = localize('all', 'All Servers');

		// Add server options dynamically
		const servers = [...new Set(this.logs.map(l => l.server))];
		for (const server of servers) {
			const option = append(this.filterSelect, $('option')) as HTMLOptionElement;
			option.value = server;
			option.textContent = server;
		}

		this.filterSelect.onchange = () => this.renderLogs();

		// Level filter
		const levelWrapper = append(toolbar, $('.claude-mcp-level-wrapper'));
		const levels = ['all', 'error', 'warn', 'info', 'debug'];

		for (const level of levels) {
			const btn = append(levelWrapper, $('button.claude-mcp-level-btn'));
			btn.textContent = level === 'all' ? 'All' : level.charAt(0).toUpperCase() + level.slice(1);
			btn.dataset['level'] = level;
			if (level === 'all') {
				btn.classList.add('active');
			}
			btn.onclick = () => {
				levelWrapper.querySelectorAll('.claude-mcp-level-btn').forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				this.renderLogs();
			};
		}

		// Actions
		const actions = append(toolbar, $('.claude-mcp-logs-actions'));

		const autoScrollBtn = append(actions, $('button.claude-mcp-btn'));
		autoScrollBtn.innerHTML = '<span class="codicon codicon-arrow-down"></span>';
		autoScrollBtn.title = localize('autoScroll', 'Auto-scroll');
		autoScrollBtn.classList.add('active');
		autoScrollBtn.onclick = () => {
			this.autoScroll = !this.autoScroll;
			autoScrollBtn.classList.toggle('active', this.autoScroll);
		};

		const clearBtn = append(actions, $('button.claude-mcp-btn'));
		clearBtn.innerHTML = '<span class="codicon codicon-clear-all"></span>';
		clearBtn.title = localize('clear', 'Clear Logs');
		clearBtn.onclick = () => {
			this.logs = [];
			this.renderLogs();
		};

		const exportBtn = append(actions, $('button.claude-mcp-btn'));
		exportBtn.innerHTML = '<span class="codicon codicon-export"></span>';
		exportBtn.title = localize('export', 'Export Logs');
		exportBtn.onclick = () => this.exportLogs();

		// Logs container
		this.logsContainer = append(this.container, $('.claude-mcp-logs-container'));

		// Render logs
		this.renderLogs();

		// Simulate incoming logs
		this.simulateLogs();
	}

	private addSampleLogs(): void {
		const sampleLogs: ILogEntry[] = [
			{ timestamp: new Date(Date.now() - 60000), server: 'filesystem', level: 'info', message: 'Server started on stdio' },
			{ timestamp: new Date(Date.now() - 55000), server: 'filesystem', level: 'info', message: 'Connected to client' },
			{ timestamp: new Date(Date.now() - 50000), server: 'github', level: 'info', message: 'Server started on stdio' },
			{ timestamp: new Date(Date.now() - 45000), server: 'github', level: 'info', message: 'Authenticating with GitHub API' },
			{ timestamp: new Date(Date.now() - 40000), server: 'github', level: 'info', message: 'Authentication successful' },
			{ timestamp: new Date(Date.now() - 35000), server: 'filesystem', level: 'debug', message: 'Handling tools/list request' },
			{ timestamp: new Date(Date.now() - 30000), server: 'filesystem', level: 'info', message: 'Listed 5 available tools' },
			{ timestamp: new Date(Date.now() - 25000), server: 'github', level: 'debug', message: 'Handling tools/list request' },
			{ timestamp: new Date(Date.now() - 20000), server: 'postgres', level: 'warn', message: 'Connection pool nearing capacity (80%)' },
			{ timestamp: new Date(Date.now() - 15000), server: 'filesystem', level: 'info', message: 'Tool call: read_file' },
			{ timestamp: new Date(Date.now() - 10000), server: 'filesystem', level: 'debug', message: 'Reading file: /src/index.ts' },
			{ timestamp: new Date(Date.now() - 5000), server: 'filesystem', level: 'info', message: 'File read successful (2.3KB)' },
		];

		this.logs = sampleLogs;
	}

	private simulateLogs(): void {
		const messages = [
			{ server: 'filesystem', level: 'info' as const, message: 'Tool call: write_file' },
			{ server: 'filesystem', level: 'debug' as const, message: 'Writing to: /src/utils.ts' },
			{ server: 'github', level: 'info' as const, message: 'Tool call: create_pull_request' },
			{ server: 'postgres', level: 'info' as const, message: 'Executing query...' },
			{ server: 'postgres', level: 'debug' as const, message: 'Query completed in 45ms' },
		];

		let index = 0;
		setInterval(() => {
			if (this.logs.length > 100) {
				this.logs.shift(); // Keep logs bounded
			}

			const msg = messages[index % messages.length];
			this.logs.push({
				timestamp: new Date(),
				...msg
			});

			this.renderLogs();
			index++;
		}, 5000);
	}

	private renderLogs(): void {
		clearNode(this.logsContainer);

		const serverFilter = this.filterSelect.value;
		const levelBtn = this.container.querySelector('.claude-mcp-level-btn.active') as HTMLElement;
		const levelFilter = levelBtn?.dataset['level'] || 'all';

		let filteredLogs = this.logs;

		if (serverFilter !== 'all') {
			filteredLogs = filteredLogs.filter(l => l.server === serverFilter);
		}

		if (levelFilter !== 'all') {
			filteredLogs = filteredLogs.filter(l => l.level === levelFilter);
		}

		if (filteredLogs.length === 0) {
			const empty = append(this.logsContainer, $('.claude-mcp-logs-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-output"></span>
				<span>${localize('noLogs', 'No logs to display')}</span>
			`;
			return;
		}

		for (const log of filteredLogs) {
			this.renderLogEntry(log);
		}

		// Auto-scroll to bottom
		if (this.autoScroll) {
			this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
		}
	}

	private renderLogEntry(log: ILogEntry): void {
		const entry = append(this.logsContainer, $('.claude-mcp-log-entry'));
		entry.classList.add(log.level);

		const timestamp = append(entry, $('.log-timestamp'));
		timestamp.textContent = this.formatTimestamp(log.timestamp);

		const level = append(entry, $('.log-level'));
		level.textContent = log.level.toUpperCase();
		level.classList.add(log.level);

		const server = append(entry, $('.log-server'));
		server.textContent = `[${log.server}]`;

		const message = append(entry, $('.log-message'));
		message.textContent = log.message;
	}

	private formatTimestamp(date: Date): string {
		const pad = (n: number) => n.toString().padStart(2, '0');
		return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${date.getMilliseconds().toString().padStart(3, '0')}`;
	}

	private exportLogs(): void {
		const logText = this.logs.map(log =>
			`[${this.formatTimestamp(log.timestamp)}] [${log.level.toUpperCase()}] [${log.server}] ${log.message}`
		).join('\n');

		// Create download
		const blob = new Blob([logText], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `mcp-logs-${new Date().toISOString().slice(0, 10)}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}

	public addLog(server: string, level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
		this.logs.push({
			timestamp: new Date(),
			server,
			level,
			message
		});

		// Update server filter options
		const servers = [...new Set(this.logs.map(l => l.server))];
		const existingOptions = Array.from(this.filterSelect.options).map(o => o.value);

		for (const s of servers) {
			if (!existingOptions.includes(s)) {
				const option = document.createElement('option');
				option.value = s;
				option.textContent = s;
				this.filterSelect.appendChild(option);
			}
		}

		this.renderLogs();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
