/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Message types
export interface IClaudeMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: IMessageContent[];
	timestamp: Date;
	sessionId?: string;
}

export type IMessageContent = ITextContent | IToolUseContent | IToolResultContent | ICodeContent;

export interface ITextContent {
	type: 'text';
	text: string;
}

export interface IToolUseContent {
	type: 'tool_use';
	id: string;
	name: string;
	input: Record<string, unknown>;
}

export interface IToolResultContent {
	type: 'tool_result';
	toolUseId: string;
	content: string;
	isError?: boolean;
}

export interface ICodeContent {
	type: 'code';
	language: string;
	code: string;
	filePath?: string;
}

// Session management
export interface IClaudeSession {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
	messageCount: number;
	contextUsage: number;
	isActive: boolean;
}

// Tool activity
export interface IToolExecution {
	id: string;
	toolName: string;
	status: 'pending' | 'running' | 'completed' | 'error';
	input: Record<string, unknown>;
	output?: string;
	error?: string;
	startTime: Date;
	endTime?: Date;
	duration?: number;
}

// Context information
export interface IContextInfo {
	totalTokens: number;
	usedTokens: number;
	usagePercentage: number;
	memoryFiles: IMemoryFile[];
	conversationLength: number;
}

export interface IMemoryFile {
	path: string;
	type: 'project' | 'local' | 'user' | 'folder';
	tokens: number;
	loaded: boolean;
}

// Slash commands
export interface ISlashCommand {
	name: string;
	description: string;
	filePath: string;
	scope: 'project' | 'user' | 'builtin';
	hasArguments: boolean;
}

// Agents
export interface IClaudeAgent {
	name: string;
	description: string;
	filePath: string;
	scope: 'project' | 'user';
	tools: string[];
}

// Skills
export interface IClaudeSkill {
	name: string;
	description: string;
	version?: string;
	directoryPath: string;
	scope: 'project' | 'user';
	allowedTools: string[];
	disableModelInvocation: boolean;
}

// Hooks
export type HookEventType = 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit' | 'Stop';

export interface IHookDefinition {
	matcher: string;
	hooks: IHook[];
}

export interface IHook {
	type: 'command' | 'prompt';
	command?: string;
	prompt?: string;
	timeout?: number;
}

export interface IHookExecution {
	id: string;
	event: HookEventType;
	matcher: string;
	hookType: 'command' | 'prompt';
	status: 'pending' | 'running' | 'completed' | 'error' | 'blocked';
	exitCode?: number;
	output?: string;
	startTime: Date;
	endTime?: Date;
}

// MCP Servers
export interface IMCPServer {
	name: string;
	command: string;
	args: string[];
	env?: Record<string, string>;
	status: 'stopped' | 'starting' | 'running' | 'error';
	tools: string[];
	scope: 'project' | 'user';
}

// Permissions
export interface IPermissionRule {
	type: 'allow' | 'deny';
	pattern: string;
}

export interface IPermissionDecision {
	tool: string;
	input: Record<string, unknown>;
	decision: 'allowed' | 'denied' | 'prompt';
	rule?: string;
	timestamp: Date;
}

// Configuration
export interface IClaudeAgentConfiguration {
	apiKey: string;
	model: string;
	maxTokens: number;
	maxTurns: number;
	autoSaveSession: boolean;
	showToolActivity: boolean;
	contextWarningThreshold: number;
	streamResponses: boolean;
	enableInlineCompletions: boolean;
	claudeMdAutoLoad: boolean;
}

// Events
export interface IClaudeAgentEvent {
	type: 'message' | 'toolStart' | 'toolEnd' | 'hookStart' | 'hookEnd' | 'error' | 'contextUpdate' | 'sessionChange';
	data: unknown;
	timestamp: Date;
}

// Agent service interface
export interface IClaudeAgentService {
	// Messaging
	sendMessage(content: string, attachments?: IMessageAttachment[]): Promise<void>;
	cancelExecution(): void;

	// Sessions
	createSession(): Promise<IClaudeSession>;
	resumeSession(sessionId: string): Promise<IClaudeSession>;
	forkSession(sessionId: string): Promise<IClaudeSession>;
	getActiveSession(): IClaudeSession | undefined;
	getSessions(): IClaudeSession[];

	// Context
	getContextInfo(): IContextInfo;
	compactContext(): Promise<void>;
	clearConversation(): void;

	// Memory
	getMemoryFiles(): IMemoryFile[];
	addToMemory(content: string, file?: string): Promise<void>;

	// Slash commands
	getSlashCommands(): ISlashCommand[];
	executeSlashCommand(name: string, args?: string): Promise<void>;

	// Events
	onMessage(callback: (message: IClaudeMessage) => void): void;
	onToolActivity(callback: (execution: IToolExecution) => void): void;
	onContextUpdate(callback: (info: IContextInfo) => void): void;
	onError(callback: (error: Error) => void): void;
}

export interface IMessageAttachment {
	type: 'file' | 'selection' | 'image' | 'diagnostic';
	content: string;
	metadata?: Record<string, unknown>;
}
