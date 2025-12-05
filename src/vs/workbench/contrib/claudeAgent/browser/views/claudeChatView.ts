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
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IClaudeMessage, ITextContent, IToolUseContent, ICodeContent } from '../../common/types.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';

export class ClaudeChatView extends ViewPane {

	private container!: HTMLElement;
	private messagesContainer!: HTMLElement;
	private inputContainer!: HTMLElement;
	private inputTextarea!: HTMLTextAreaElement;
	private sendButton!: HTMLButtonElement;
	private messages: IClaudeMessage[] = [];
	private isProcessing: boolean = false;

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
		@IEditorService private readonly editorService: IEditorService,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this.loadMessages();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-chat-view');

		// Toolbar
		const toolbar = append(this.container, $('.claude-chat-toolbar'));
		this.renderToolbar(toolbar);

		// Messages area
		this.messagesContainer = append(this.container, $('.claude-chat-messages'));

		// Input area
		this.inputContainer = append(this.container, $('.claude-chat-input-container'));
		this.renderInputArea();

		// Initial render
		this.renderMessages();
	}

	private renderToolbar(toolbar: HTMLElement): void {
		// New session button
		const newSessionBtn = append(toolbar, $('button.claude-toolbar-btn'));
		newSessionBtn.innerHTML = '<span class="codicon codicon-add"></span>';
		newSessionBtn.title = localize('newSession', 'New Session');
		newSessionBtn.onclick = () => this.commandService.executeCommand('claudeAgent.newSession');

		// Clear button
		const clearBtn = append(toolbar, $('button.claude-toolbar-btn'));
		clearBtn.innerHTML = '<span class="codicon codicon-clear-all"></span>';
		clearBtn.title = localize('clearChat', 'Clear Chat');
		clearBtn.onclick = () => this.clearChat();

		// Compact button
		const compactBtn = append(toolbar, $('button.claude-toolbar-btn'));
		compactBtn.innerHTML = '<span class="codicon codicon-fold"></span>';
		compactBtn.title = localize('compactContext', 'Compact Context');
		compactBtn.onclick = () => this.commandService.executeCommand('claudeAgent.compactContext');

		// Spacer
		append(toolbar, $('.claude-toolbar-spacer'));

		// Model indicator
		const modelIndicator = append(toolbar, $('.claude-model-indicator'));
		const model = this.configurationService.getValue<string>('claudeAgent.model') || 'claude-sonnet-4-5-20250929';
		modelIndicator.textContent = model.replace('claude-', '').replace(/-\d+$/, '');
		modelIndicator.title = model;

		// Context meter (mini)
		const contextMeter = append(toolbar, $('.claude-context-meter-mini'));
		const contextFill = append(contextMeter, $('.claude-context-fill'));
		contextFill.style.width = '0%';
	}

	private renderInputArea(): void {
		// Attachments bar (hidden by default)
		const attachmentsBar = append(this.inputContainer, $('.claude-attachments-bar'));
		attachmentsBar.style.display = 'none';

		// Input wrapper
		const inputWrapper = append(this.inputContainer, $('.claude-input-wrapper'));

		// Attach button
		const attachBtn = append(inputWrapper, $('button.claude-attach-btn'));
		attachBtn.innerHTML = '<span class="codicon codicon-attach"></span>';
		attachBtn.title = localize('attachFile', 'Attach File or Selection');
		attachBtn.onclick = () => this.showAttachMenu();

		// Slash command button
		const slashBtn = append(inputWrapper, $('button.claude-slash-btn'));
		slashBtn.innerHTML = '<span class="codicon codicon-terminal"></span>';
		slashBtn.title = localize('slashCommand', 'Slash Commands');
		slashBtn.onclick = () => this.commandService.executeCommand('claudeAgent.runSlashCommand');

		// Textarea
		this.inputTextarea = append(inputWrapper, $('textarea.claude-input-textarea')) as HTMLTextAreaElement;
		this.inputTextarea.placeholder = localize('typeMessage', 'Ask Claude anything... (Ctrl+Enter to send)');
		this.inputTextarea.rows = 1;

		// Auto-resize textarea
		this.inputTextarea.addEventListener('input', () => {
			this.inputTextarea.style.height = 'auto';
			this.inputTextarea.style.height = Math.min(this.inputTextarea.scrollHeight, 200) + 'px';
		});

		// Handle Enter key
		this.inputTextarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				this.sendMessage();
			}
			// Slash command detection
			if (e.key === '/' && this.inputTextarea.value === '') {
				this.commandService.executeCommand('claudeAgent.runSlashCommand');
			}
		});

		// Send button
		this.sendButton = append(inputWrapper, $('button.claude-send-btn')) as HTMLButtonElement;
		this.sendButton.innerHTML = '<span class="codicon codicon-send"></span>';
		this.sendButton.title = localize('send', 'Send (Ctrl+Enter)');
		this.sendButton.onclick = () => this.sendMessage();

		// Stop button (hidden by default)
		const stopButton = append(inputWrapper, $('button.claude-stop-btn')) as HTMLButtonElement;
		stopButton.innerHTML = '<span class="codicon codicon-debug-stop"></span>';
		stopButton.title = localize('stop', 'Stop Generation');
		stopButton.style.display = 'none';
		stopButton.onclick = () => this.commandService.executeCommand('claudeAgent.cancelExecution');
	}

	private renderMessages(): void {
		clearNode(this.messagesContainer);

		if (this.messages.length === 0) {
			this.renderWelcome();
			return;
		}

		for (const message of this.messages) {
			this.renderMessage(message);
		}

		// Scroll to bottom
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private renderWelcome(): void {
		const welcome = append(this.messagesContainer, $('.claude-welcome'));

		const icon = append(welcome, $('.claude-welcome-icon'));
		icon.innerHTML = '<span class="codicon codicon-sparkle"></span>';

		const title = append(welcome, $('.claude-welcome-title'));
		title.textContent = localize('welcomeTitle', 'Welcome to Claude');

		const subtitle = append(welcome, $('.claude-welcome-subtitle'));
		subtitle.textContent = localize('welcomeSubtitle', 'Your AI coding assistant');

		// Quick actions
		const actions = append(welcome, $('.claude-welcome-actions'));

		const actionItems = [
			{ icon: 'codicon-question', label: 'Ask a Question', command: 'claudeAgent.sendMessage' },
			{ icon: 'codicon-code', label: 'Explain Code', command: 'claudeAgent.explainCode' },
			{ icon: 'codicon-bug', label: 'Fix an Error', command: 'claudeAgent.fixError' },
			{ icon: 'codicon-beaker', label: 'Generate Tests', command: 'claudeAgent.generateTests' },
		];

		for (const item of actionItems) {
			const action = append(actions, $('button.claude-welcome-action'));
			action.innerHTML = `<span class="codicon ${item.icon}"></span> ${item.label}`;
			action.onclick = () => this.commandService.executeCommand(item.command);
		}

		// Tips
		const tips = append(welcome, $('.claude-welcome-tips'));
		tips.innerHTML = `
			<p><strong>Tips:</strong></p>
			<ul>
				<li>Use <code>Ctrl+Shift+C</code> to open Claude</li>
				<li>Use <code>Ctrl+Shift+A</code> to ask about selected code</li>
				<li>Type <code>/</code> to access slash commands</li>
				<li>Create <code>CLAUDE.md</code> to give project context</li>
			</ul>
		`;
	}

	private renderMessage(message: IClaudeMessage): void {
		const messageEl = append(this.messagesContainer, $(`.claude-message.${message.role}`));

		// Avatar
		const avatar = append(messageEl, $('.claude-message-avatar'));
		if (message.role === 'user') {
			avatar.innerHTML = '<span class="codicon codicon-account"></span>';
		} else if (message.role === 'assistant') {
			avatar.innerHTML = '<span class="codicon codicon-sparkle"></span>';
		} else {
			avatar.innerHTML = '<span class="codicon codicon-info"></span>';
		}

		// Content
		const content = append(messageEl, $('.claude-message-content'));

		for (const block of message.content) {
			this.renderContentBlock(content, block);
		}

		// Timestamp
		const timestamp = append(messageEl, $('.claude-message-timestamp'));
		timestamp.textContent = this.formatTime(message.timestamp);

		// Actions (for assistant messages)
		if (message.role === 'assistant') {
			const actions = append(messageEl, $('.claude-message-actions'));

			const copyBtn = append(actions, $('button.claude-message-action'));
			copyBtn.innerHTML = '<span class="codicon codicon-copy"></span>';
			copyBtn.title = localize('copy', 'Copy');
			copyBtn.onclick = () => this.copyMessageContent(message);

			const retryBtn = append(actions, $('button.claude-message-action'));
			retryBtn.innerHTML = '<span class="codicon codicon-refresh"></span>';
			retryBtn.title = localize('retry', 'Retry');
			retryBtn.onclick = () => this.retryMessage(message);
		}
	}

	private renderContentBlock(container: HTMLElement, block: ITextContent | IToolUseContent | ICodeContent): void {
		switch (block.type) {
			case 'text':
				const textBlock = append(container, $('.claude-text-block'));
				textBlock.innerHTML = this.renderMarkdown(block.text);
				break;

			case 'tool_use':
				const toolBlock = append(container, $('.claude-tool-block'));
				const toolHeader = append(toolBlock, $('.claude-tool-header'));
				toolHeader.innerHTML = `<span class="codicon codicon-tools"></span> ${block.name}`;

				const toolInput = append(toolBlock, $('pre.claude-tool-input'));
				toolInput.textContent = JSON.stringify(block.input, null, 2);
				break;

			case 'code':
				const codeBlock = append(container, $('.claude-code-block'));

				// Header with language and actions
				const codeHeader = append(codeBlock, $('.claude-code-header'));
				const langLabel = append(codeHeader, $('.claude-code-lang'));
				langLabel.textContent = block.language;

				if (block.filePath) {
					const fileLabel = append(codeHeader, $('.claude-code-file'));
					fileLabel.textContent = block.filePath;
					fileLabel.onclick = () => this.openFile(block.filePath!);
				}

				const codeActions = append(codeHeader, $('.claude-code-actions'));

				const copyBtn = append(codeActions, $('button.claude-code-action'));
				copyBtn.innerHTML = '<span class="codicon codicon-copy"></span>';
				copyBtn.title = localize('copy', 'Copy');
				copyBtn.onclick = () => this.clipboardService.writeText(block.code);

				const applyBtn = append(codeActions, $('button.claude-code-action.apply'));
				applyBtn.innerHTML = '<span class="codicon codicon-check"></span> Apply';
				applyBtn.title = localize('applyToEditor', 'Apply to Editor');
				applyBtn.onclick = () => this.applyCode(block);

				// Code content
				const codeContent = append(codeBlock, $('pre.claude-code-content'));
				const codeEl = append(codeContent, $('code'));
				codeEl.textContent = block.code;
				codeEl.classList.add(`language-${block.language}`);
				break;
		}
	}

	private renderMarkdown(text: string): string {
		// Simple markdown rendering (in production, use a proper markdown renderer)
		return text
			.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.*?)\*/g, '<em>$1</em>')
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			.replace(/\n/g, '<br>');
	}

	private formatTime(date: Date): string {
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	private async sendMessage(): Promise<void> {
		const content = this.inputTextarea.value.trim();
		if (!content || this.isProcessing) {
			return;
		}

		// Add user message
		const userMessage: IClaudeMessage = {
			id: `msg-${Date.now()}`,
			role: 'user',
			content: [{ type: 'text', text: content }],
			timestamp: new Date()
		};

		this.messages.push(userMessage);
		this.saveMessages();
		this.renderMessages();

		// Clear input
		this.inputTextarea.value = '';
		this.inputTextarea.style.height = 'auto';

		// Set processing state
		this.isProcessing = true;
		this.sendButton.disabled = true;

		// Simulate response (in production, this would call the Claude API)
		await this.simulateResponse(content);

		this.isProcessing = false;
		this.sendButton.disabled = false;
	}

	private async simulateResponse(userContent: string): Promise<void> {
		// Add thinking indicator
		const thinkingEl = append(this.messagesContainer, $('.claude-thinking'));
		thinkingEl.innerHTML = '<span class="codicon codicon-loading codicon-modifier-spin"></span> Claude is thinking...';

		// Simulate delay
		await new Promise(resolve => setTimeout(resolve, 1000));

		// Remove thinking indicator
		thinkingEl.remove();

		// Generate demo response
		const assistantMessage: IClaudeMessage = {
			id: `msg-${Date.now()}`,
			role: 'assistant',
			content: [
				{
					type: 'text',
					text: `I received your message: "${userContent}"\n\nThis is a demo response. In the full implementation, this would be connected to the Claude API via the Agent SDK.`
				}
			],
			timestamp: new Date()
		};

		// If the message looks like a code question, add a code block
		if (userContent.toLowerCase().includes('code') || userContent.toLowerCase().includes('function')) {
			assistantMessage.content.push({
				type: 'code',
				language: 'typescript',
				code: `// Example code response
function exampleFunction() {
  console.log("Hello from Claude!");
  return 42;
}`
			} as ICodeContent);
		}

		this.messages.push(assistantMessage);
		this.saveMessages();
		this.renderMessages();
	}

	private clearChat(): void {
		this.messages = [];
		this.saveMessages();
		this.renderMessages();
	}

	private loadMessages(): void {
		const stored = this.storageService.get('claudeAgent.messages', StorageScope.WORKSPACE, '[]');
		try {
			const parsed = JSON.parse(stored);
			this.messages = parsed.map((m: IClaudeMessage) => ({
				...m,
				timestamp: new Date(m.timestamp)
			}));
		} catch {
			this.messages = [];
		}
	}

	private saveMessages(): void {
		this.storageService.store('claudeAgent.messages', JSON.stringify(this.messages), StorageScope.WORKSPACE, StorageTarget.USER);
	}

	private async copyMessageContent(message: IClaudeMessage): Promise<void> {
		const text = message.content
			.filter((b): b is ITextContent => b.type === 'text')
			.map(b => b.text)
			.join('\n');
		await this.clipboardService.writeText(text);
	}

	private retryMessage(_message: IClaudeMessage): void {
		// Re-send the previous user message
		const lastUserMessage = [...this.messages].reverse().find(m => m.role === 'user');
		if (lastUserMessage) {
			const content = (lastUserMessage.content[0] as ITextContent).text;
			this.inputTextarea.value = content;
			this.sendMessage();
		}
	}

	private showAttachMenu(): void {
		// Show quick pick for attachment options
		this.commandService.executeCommand('workbench.action.quickOpen', '@');
	}

	private openFile(filePath: string): void {
		this.commandService.executeCommand('vscode.open', filePath);
	}

	private applyCode(block: ICodeContent): void {
		// Apply code to active editor or create new file
		const editor = this.editorService.activeTextEditorControl;
		if (editor) {
			// Insert at cursor position
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
