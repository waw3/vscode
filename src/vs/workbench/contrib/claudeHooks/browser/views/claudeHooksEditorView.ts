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
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { append, $ } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { HookType, HOOK_TYPES, IHooksConfig, parseHooksConfig } from '../claudeHooks.contribution.js';

export class ClaudeHooksEditorView extends ViewPane {

	private container!: HTMLElement;
	private typeSelect!: HTMLSelectElement;
	private matcherInput!: HTMLInputElement;
	private commandInput!: HTMLTextAreaElement;
	private scopeSelect!: HTMLSelectElement;
	private previewPanel!: HTMLElement;

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
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-hooks-editor-view');

		// Header
		const header = append(this.container, $('.claude-hooks-editor-header'));
		header.innerHTML = `
			<span class="codicon codicon-edit"></span>
			<span>${localize('hookEditor', 'Hook Editor')}</span>
		`;

		// Form
		const form = append(this.container, $('.claude-hooks-editor-form'));

		// Type field
		const typeGroup = append(form, $('.claude-hooks-field'));
		const typeLabel = append(typeGroup, $('label'));
		typeLabel.textContent = localize('hookType', 'Hook Type');

		this.typeSelect = append(typeGroup, $('select.claude-hooks-select')) as HTMLSelectElement;

		for (const [type, info] of Object.entries(HOOK_TYPES)) {
			const option = append(this.typeSelect, $('option')) as HTMLOptionElement;
			option.value = type;
			option.textContent = info.name;
		}

		this.typeSelect.onchange = () => this.updatePreview();

		// Type description
		const typeDesc = append(typeGroup, $('.field-description'));
		typeDesc.textContent = HOOK_TYPES['PreToolUse'].description;

		this.typeSelect.onchange = () => {
			typeDesc.textContent = HOOK_TYPES[this.typeSelect.value as HookType].description;
			this.updatePreview();
		};

		// Matcher field
		const matcherGroup = append(form, $('.claude-hooks-field'));
		const matcherLabel = append(matcherGroup, $('label'));
		matcherLabel.textContent = localize('matcher', 'Tool Matcher (optional)');

		this.matcherInput = append(matcherGroup, $('input.claude-hooks-input')) as HTMLInputElement;
		this.matcherInput.placeholder = 'e.g., Edit|Write|Bash';
		this.matcherInput.oninput = () => this.updatePreview();

		const matcherDesc = append(matcherGroup, $('.field-description'));
		matcherDesc.textContent = localize('matcherDesc', 'Regex pattern to match tool names. Only for PreToolUse/PostToolUse.');

		// Command field
		const commandGroup = append(form, $('.claude-hooks-field.full-height'));
		const commandLabel = append(commandGroup, $('label'));
		commandLabel.textContent = localize('command', 'Shell Command');

		// Variables toolbar
		const varsToolbar = append(commandGroup, $('.claude-hooks-vars-toolbar'));
		const variables = [
			{ label: '$TOOL_NAME', desc: 'Name of the tool' },
			{ label: '$TOOL_INPUT_FILE', desc: 'Input file path' },
			{ label: '$TOOL_INPUT_COMMAND', desc: 'Bash command' },
			{ label: '$TOOL_OUTPUT', desc: 'Tool output' },
			{ label: '$SESSION_ID', desc: 'Current session ID' },
		];

		for (const v of variables) {
			const btn = append(varsToolbar, $('button.claude-hooks-var-btn'));
			btn.textContent = v.label;
			btn.title = v.desc;
			btn.onclick = () => this.insertVariable(v.label);
		}

		this.commandInput = append(commandGroup, $('textarea.claude-hooks-textarea')) as HTMLTextAreaElement;
		this.commandInput.placeholder = localize('commandPlaceholder', 'Enter shell command...\n\nExample: npm run lint -- $TOOL_INPUT_FILE 2>&1 || true');
		this.commandInput.oninput = () => this.updatePreview();

		// Scope field
		const scopeGroup = append(form, $('.claude-hooks-field'));
		const scopeLabel = append(scopeGroup, $('label'));
		scopeLabel.textContent = localize('scope', 'Scope');

		this.scopeSelect = append(scopeGroup, $('select.claude-hooks-select')) as HTMLSelectElement;

		const projectOption = append(this.scopeSelect, $('option')) as HTMLOptionElement;
		projectOption.value = 'project';
		projectOption.textContent = localize('project', 'Project (.claude/settings.json)');

		const userOption = append(this.scopeSelect, $('option')) as HTMLOptionElement;
		userOption.value = 'user';
		userOption.textContent = localize('user', 'User (~/.claude/settings.json)');

		this.scopeSelect.onchange = () => this.updatePreview();

		// Preview panel
		this.previewPanel = append(this.container, $('.claude-hooks-preview'));
		const previewHeader = append(this.previewPanel, $('.claude-hooks-preview-header'));
		previewHeader.innerHTML = `<span class="codicon codicon-json"></span> ${localize('preview', 'JSON Preview')}`;

		const previewContent = append(this.previewPanel, $('pre.claude-hooks-preview-content'));
		previewContent.textContent = '';

		// Actions
		const actions = append(this.container, $('.claude-hooks-editor-actions'));

		const saveBtn = append(actions, $('button.claude-hooks-btn.primary'));
		saveBtn.innerHTML = `<span class="codicon codicon-save"></span> ${localize('save', 'Save Hook')}`;
		saveBtn.onclick = () => this.save();

		const clearBtn = append(actions, $('button.claude-hooks-btn'));
		clearBtn.innerHTML = `<span class="codicon codicon-clear-all"></span> ${localize('clear', 'Clear')}`;
		clearBtn.onclick = () => this.clear();

		// Initialize
		this.updatePreview();
	}

	private insertVariable(variable: string): void {
		const start = this.commandInput.selectionStart;
		const end = this.commandInput.selectionEnd;
		const text = this.commandInput.value;

		this.commandInput.value = text.substring(0, start) + variable + text.substring(end);
		this.commandInput.selectionStart = this.commandInput.selectionEnd = start + variable.length;
		this.commandInput.focus();

		this.updatePreview();
	}

	private updatePreview(): void {
		const previewContent = this.previewPanel.querySelector('.claude-hooks-preview-content');
		if (!previewContent) return;

		const hookType = this.typeSelect.value as HookType;
		const matcher = this.matcherInput.value.trim();
		const command = this.commandInput.value.trim();

		const hookEntry: any = {
			hooks: [command || 'your-command-here']
		};

		if (matcher && (hookType === 'PreToolUse' || hookType === 'PostToolUse')) {
			hookEntry.matcher = matcher;
		}

		const config = {
			hooks: {
				[hookType]: [hookEntry]
			}
		};

		previewContent.textContent = JSON.stringify(config, null, 2);
	}

	private async save(): Promise<void> {
		const command = this.commandInput.value.trim();

		if (!command) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('commandRequired', 'Command is required')
			});
			return;
		}

		const hookType = this.typeSelect.value as HookType;
		const matcher = this.matcherInput.value.trim();
		const scope = this.scopeSelect.value as 'project' | 'user';

		// Determine config file location
		let configUri: URI;
		if (scope === 'project') {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: localize('noWorkspace', 'No workspace folder open')
				});
				return;
			}
			configUri = URI.joinPath(folders[0].uri, '.claude/settings.json');
		} else {
			const homeDir = process.env.HOME || process.env.USERPROFILE || '';
			configUri = URI.file(`${homeDir}/.claude/settings.json`);
		}

		// Read existing config or create new
		let config: IHooksConfig = {};
		try {
			const exists = await this.fileService.exists(configUri);
			if (exists) {
				const content = await this.fileService.readFile(configUri);
				const text = new TextDecoder().decode(content.value);
				config = parseHooksConfig(text);
			}
		} catch { }

		// Initialize hooks structure
		if (!config.hooks) {
			config.hooks = {};
		}

		if (!config.hooks[hookType]) {
			config.hooks[hookType] = [];
		}

		// Add the hook
		const hookEntry: any = {
			hooks: [command]
		};

		if (matcher && (hookType === 'PreToolUse' || hookType === 'PostToolUse')) {
			hookEntry.matcher = matcher;
		}

		config.hooks[hookType]!.push(hookEntry);

		// Ensure parent directory exists
		try {
			const parentUri = URI.joinPath(configUri, '..');
			await this.fileService.createFolder(parentUri);
		} catch { }

		// Write config
		try {
			await this.fileService.writeFile(configUri, new TextEncoder().encode(JSON.stringify(config, null, 2)));

			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('hookSaved', 'Hook saved to {0}', scope)
			});

			this.clear();
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('saveFailed', 'Failed to save hook')
			});
		}
	}

	private clear(): void {
		this.typeSelect.value = 'PreToolUse';
		this.matcherInput.value = '';
		this.commandInput.value = '';
		this.scopeSelect.value = 'project';
		this.updatePreview();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
