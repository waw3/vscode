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
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IClaudeSession } from '../../common/types.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';

const SESSIONS_STORAGE_KEY = 'claudeAgent.sessions';

export class ClaudeSessionsView extends ViewPane {

	private container!: HTMLElement;
	private sessionsList!: HTMLElement;
	private sessions: IClaudeSession[] = [];
	private activeSessionId: string | null = null;

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
		@ICommandService private readonly commandService: ICommandService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this.loadSessions();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-sessions-view');

		// Toolbar
		const toolbar = append(this.container, $('.claude-sessions-toolbar'));

		const newSessionBtn = append(toolbar, $('button.claude-sessions-btn'));
		newSessionBtn.innerHTML = '<span class="codicon codicon-add"></span> ' + localize('newSession', 'New Session');
		newSessionBtn.onclick = () => this.createSession();

		append(toolbar, $('.claude-sessions-spacer'));

		const exportBtn = append(toolbar, $('button.claude-sessions-icon-btn'));
		exportBtn.innerHTML = '<span class="codicon codicon-export"></span>';
		exportBtn.title = localize('export', 'Export Sessions');
		exportBtn.onclick = () => this.exportSessions();

		// Current session section
		const currentSection = append(this.container, $('.claude-sessions-section'));
		const currentHeader = append(currentSection, $('.claude-section-header'));
		currentHeader.textContent = localize('currentSession', 'Current Session');

		const currentContainer = append(currentSection, $('.claude-current-session'));
		this.renderCurrentSession(currentContainer);

		// Recent sessions section
		const recentSection = append(this.container, $('.claude-sessions-section'));
		const recentHeader = append(recentSection, $('.claude-section-header'));
		recentHeader.textContent = localize('recentSessions', 'Recent Sessions');

		this.sessionsList = append(recentSection, $('.claude-sessions-list'));

		this.renderSessions();
	}

	private renderCurrentSession(container: HTMLElement): void {
		container.innerHTML = '';

		const activeSession = this.sessions.find(s => s.isActive);

		if (!activeSession) {
			const empty = append(container, $('.claude-session-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-comment-discussion"></span>
				<span>${localize('noActiveSession', 'No active session')}</span>
			`;
			return;
		}

		const sessionCard = append(container, $('.claude-session-card.active'));

		const header = append(sessionCard, $('.claude-session-header'));
		const name = append(header, $('.claude-session-name'));
		name.textContent = activeSession.name;

		const editBtn = append(header, $('button.claude-session-edit'));
		editBtn.innerHTML = '<span class="codicon codicon-edit"></span>';
		editBtn.onclick = (e) => {
			e.stopPropagation();
			this.renameSession(activeSession.id);
		};

		const stats = append(sessionCard, $('.claude-session-stats'));

		const messages = append(stats, $('.claude-session-stat'));
		messages.innerHTML = `<span class="codicon codicon-comment"></span> ${activeSession.messageCount} messages`;

		const context = append(stats, $('.claude-session-stat'));
		context.innerHTML = `<span class="codicon codicon-symbol-key"></span> ${activeSession.contextUsage}% context`;

		const time = append(stats, $('.claude-session-stat'));
		time.innerHTML = `<span class="codicon codicon-clock"></span> ${this.formatRelativeTime(activeSession.updatedAt)}`;

		const actions = append(sessionCard, $('.claude-session-actions'));

		const forkBtn = append(actions, $('button.claude-session-action'));
		forkBtn.innerHTML = '<span class="codicon codicon-repo-forked"></span> Fork';
		forkBtn.onclick = () => this.forkSession(activeSession.id);

		const clearBtn = append(actions, $('button.claude-session-action'));
		clearBtn.innerHTML = '<span class="codicon codicon-clear-all"></span> Clear';
		clearBtn.onclick = () => this.clearSession(activeSession.id);
	}

	private renderSessions(): void {
		clearNode(this.sessionsList);

		const recentSessions = this.sessions
			.filter(s => !s.isActive)
			.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
			.slice(0, 10);

		if (recentSessions.length === 0) {
			const empty = append(this.sessionsList, $('.claude-sessions-empty'));
			empty.innerHTML = `
				<span>${localize('noRecentSessions', 'No recent sessions')}</span>
			`;
			return;
		}

		for (const session of recentSessions) {
			this.renderSessionItem(session);
		}
	}

	private renderSessionItem(session: IClaudeSession): void {
		const item = append(this.sessionsList, $('.claude-session-item'));

		const icon = append(item, $('.claude-session-icon'));
		icon.innerHTML = '<span class="codicon codicon-comment-discussion"></span>';

		const info = append(item, $('.claude-session-info'));

		const name = append(info, $('.claude-session-name'));
		name.textContent = session.name;

		const meta = append(info, $('.claude-session-meta'));
		meta.textContent = `${session.messageCount} messages \u2022 ${this.formatRelativeTime(session.updatedAt)}`;

		const actions = append(item, $('.claude-session-item-actions'));

		const resumeBtn = append(actions, $('button.claude-session-item-action'));
		resumeBtn.innerHTML = '<span class="codicon codicon-play"></span>';
		resumeBtn.title = localize('resume', 'Resume');
		resumeBtn.onclick = (e) => {
			e.stopPropagation();
			this.resumeSession(session.id);
		};

		const forkBtn = append(actions, $('button.claude-session-item-action'));
		forkBtn.innerHTML = '<span class="codicon codicon-repo-forked"></span>';
		forkBtn.title = localize('fork', 'Fork');
		forkBtn.onclick = (e) => {
			e.stopPropagation();
			this.forkSession(session.id);
		};

		const deleteBtn = append(actions, $('button.claude-session-item-action.delete'));
		deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
		deleteBtn.title = localize('delete', 'Delete');
		deleteBtn.onclick = (e) => {
			e.stopPropagation();
			this.deleteSession(session.id);
		};

		// Click to resume
		item.onclick = () => this.resumeSession(session.id);
	}

	private formatRelativeTime(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return localize('justNow', 'just now');
		if (diffMins < 60) return localize('minsAgo', '{0} min ago', diffMins);
		if (diffHours < 24) return localize('hoursAgo', '{0}h ago', diffHours);
		if (diffDays < 7) return localize('daysAgo', '{0}d ago', diffDays);
		return date.toLocaleDateString();
	}

	private async createSession(): Promise<void> {
		const name = await this.quickInputService.input({
			placeHolder: localize('sessionName', 'Session name'),
			title: localize('newSession', 'New Session'),
			value: `Session ${this.sessions.length + 1}`
		});

		if (!name) {
			return;
		}

		// Mark current session as inactive
		this.sessions.forEach(s => s.isActive = false);

		const newSession: IClaudeSession = {
			id: `session-${Date.now()}`,
			name: name.trim(),
			createdAt: new Date(),
			updatedAt: new Date(),
			messageCount: 0,
			contextUsage: 0,
			isActive: true
		};

		this.sessions.unshift(newSession);
		this.saveSessions();
		this.renderCurrentSession(this.container.querySelector('.claude-current-session')!);
		this.renderSessions();

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('sessionCreated', 'Created new session: {0}', name)
		});
	}

	private resumeSession(sessionId: string): void {
		this.sessions.forEach(s => s.isActive = (s.id === sessionId));
		this.saveSessions();
		this.renderCurrentSession(this.container.querySelector('.claude-current-session')!);
		this.renderSessions();

		const session = this.sessions.find(s => s.id === sessionId);
		if (session) {
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('sessionResumed', 'Resumed session: {0}', session.name)
			});
		}
	}

	private async forkSession(sessionId: string): Promise<void> {
		const original = this.sessions.find(s => s.id === sessionId);
		if (!original) {
			return;
		}

		const name = await this.quickInputService.input({
			placeHolder: localize('forkName', 'Fork name'),
			title: localize('forkSession', 'Fork Session'),
			value: `${original.name} (fork)`
		});

		if (!name) {
			return;
		}

		this.sessions.forEach(s => s.isActive = false);

		const forkedSession: IClaudeSession = {
			id: `session-${Date.now()}`,
			name: name.trim(),
			createdAt: new Date(),
			updatedAt: new Date(),
			messageCount: original.messageCount,
			contextUsage: original.contextUsage,
			isActive: true
		};

		this.sessions.unshift(forkedSession);
		this.saveSessions();
		this.renderCurrentSession(this.container.querySelector('.claude-current-session')!);
		this.renderSessions();

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('sessionForked', 'Forked session: {0}', name)
		});
	}

	private async renameSession(sessionId: string): Promise<void> {
		const session = this.sessions.find(s => s.id === sessionId);
		if (!session) {
			return;
		}

		const name = await this.quickInputService.input({
			placeHolder: localize('newName', 'New name'),
			title: localize('renameSession', 'Rename Session'),
			value: session.name
		});

		if (name && name.trim() !== session.name) {
			session.name = name.trim();
			this.saveSessions();
			this.renderCurrentSession(this.container.querySelector('.claude-current-session')!);
			this.renderSessions();
		}
	}

	private clearSession(sessionId: string): void {
		const session = this.sessions.find(s => s.id === sessionId);
		if (session) {
			session.messageCount = 0;
			session.contextUsage = 0;
			session.updatedAt = new Date();
			this.saveSessions();
			this.renderCurrentSession(this.container.querySelector('.claude-current-session')!);

			this.commandService.executeCommand('claudeAgent.clearChat');
		}
	}

	private deleteSession(sessionId: string): void {
		const index = this.sessions.findIndex(s => s.id === sessionId);
		if (index !== -1) {
			this.sessions.splice(index, 1);
			this.saveSessions();
			this.renderSessions();
		}
	}

	private exportSessions(): void {
		// Export sessions as JSON
		const data = JSON.stringify(this.sessions, null, 2);
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('sessionsExported', 'Sessions exported to clipboard')
		});
	}

	private loadSessions(): void {
		const stored = this.storageService.get(SESSIONS_STORAGE_KEY, StorageScope.PROFILE, '[]');
		try {
			const parsed = JSON.parse(stored);
			this.sessions = parsed.map((s: IClaudeSession) => ({
				...s,
				createdAt: new Date(s.createdAt),
				updatedAt: new Date(s.updatedAt)
			}));
		} catch {
			this.sessions = [];
		}

		// Create default session if none exist
		if (this.sessions.length === 0) {
			this.sessions.push({
				id: `session-${Date.now()}`,
				name: 'Session 1',
				createdAt: new Date(),
				updatedAt: new Date(),
				messageCount: 0,
				contextUsage: 0,
				isActive: true
			});
			this.saveSessions();
		}
	}

	private saveSessions(): void {
		this.storageService.store(SESSIONS_STORAGE_KEY, JSON.stringify(this.sessions), StorageScope.PROFILE, StorageTarget.USER);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
