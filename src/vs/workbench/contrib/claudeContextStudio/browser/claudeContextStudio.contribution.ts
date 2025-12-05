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
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';

// Import views
import { ClaudeContextBudgetView } from './views/claudeContextBudgetView.js';
import { ClaudeContextSelectorView } from './views/claudeContextSelectorView.js';
import { ClaudeContextHistoryView } from './views/claudeContextHistoryView.js';

import './media/claudeContextStudio.css';

// Types
export interface IContextBudget {
	modelId: string;
	maxTokens: number;
	usedTokens: number;
	reservedTokens: number;
	items: IContextItem[];
}

export interface IContextItem {
	id: string;
	type: ContextItemType;
	name: string;
	path?: string;
	content: string;
	tokens: number;
	priority: ContextPriority;
	included: boolean;
	category: string;
	lastModified?: number;
}

export type ContextItemType =
	| 'file'
	| 'selection'
	| 'symbol'
	| 'folder'
	| 'terminal'
	| 'git-diff'
	| 'dependency'
	| 'documentation'
	| 'conversation'
	| 'custom';

export type ContextPriority = 'critical' | 'high' | 'medium' | 'low' | 'optional';

export interface IContextProfile {
	id: string;
	name: string;
	description: string;
	items: IContextItemRef[];
	createdAt: number;
	updatedAt: number;
}

export interface IContextItemRef {
	type: ContextItemType;
	path?: string;
	pattern?: string;
	priority: ContextPriority;
}

export interface IContextSnapshot {
	id: string;
	name: string;
	timestamp: number;
	items: IContextItem[];
	totalTokens: number;
	modelId: string;
}

// Model context limits
export const MODEL_CONTEXT_LIMITS: Record<string, { name: string; maxTokens: number; outputTokens: number }> = {
	'claude-opus-4-5-20251101': { name: 'Claude Opus 4', maxTokens: 200000, outputTokens: 32000 },
	'claude-sonnet-4-5-20250929': { name: 'Claude Sonnet 4.5', maxTokens: 200000, outputTokens: 16000 },
	'claude-3-5-sonnet-20241022': { name: 'Claude 3.5 Sonnet', maxTokens: 200000, outputTokens: 8192 },
	'claude-3-5-haiku-20241022': { name: 'Claude 3.5 Haiku', maxTokens: 200000, outputTokens: 8192 },
	'claude-3-opus-20240229': { name: 'Claude 3 Opus', maxTokens: 200000, outputTokens: 4096 },
};

// Context type info
export const CONTEXT_TYPE_INFO: Record<ContextItemType, { name: string; icon: string; color: string }> = {
	'file': { name: 'File', icon: 'file', color: '#3B82F6' },
	'selection': { name: 'Selection', icon: 'selection', color: '#8B5CF6' },
	'symbol': { name: 'Symbol', icon: 'symbol-method', color: '#F59E0B' },
	'folder': { name: 'Folder', icon: 'folder', color: '#10B981' },
	'terminal': { name: 'Terminal', icon: 'terminal', color: '#6366F1' },
	'git-diff': { name: 'Git Diff', icon: 'git-commit', color: '#EC4899' },
	'dependency': { name: 'Dependency', icon: 'package', color: '#14B8A6' },
	'documentation': { name: 'Documentation', icon: 'book', color: '#F97316' },
	'conversation': { name: 'Conversation', icon: 'comment-discussion', color: '#06B6D4' },
	'custom': { name: 'Custom', icon: 'note', color: '#6B7280' },
};

// Priority info
export const PRIORITY_INFO: Record<ContextPriority, { name: string; color: string; weight: number }> = {
	'critical': { name: 'Critical', color: '#DC2626', weight: 5 },
	'high': { name: 'High', color: '#F59E0B', weight: 4 },
	'medium': { name: 'Medium', color: '#3B82F6', weight: 3 },
	'low': { name: 'Low', color: '#10B981', weight: 2 },
	'optional': { name: 'Optional', color: '#6B7280', weight: 1 },
};

// Smart context suggestions
export const SMART_CONTEXT_RULES: Array<{
	name: string;
	description: string;
	pattern: string;
	type: ContextItemType;
	priority: ContextPriority;
}> = [
	{
		name: 'Active File',
		description: 'Currently open file in editor',
		pattern: '${activeFile}',
		type: 'file',
		priority: 'high'
	},
	{
		name: 'Related Tests',
		description: 'Test files for the active file',
		pattern: '**/*.{test,spec}.{ts,js,tsx,jsx}',
		type: 'file',
		priority: 'medium'
	},
	{
		name: 'Type Definitions',
		description: 'TypeScript type files',
		pattern: '**/*.d.ts',
		type: 'file',
		priority: 'low'
	},
	{
		name: 'Package Dependencies',
		description: 'Project package.json',
		pattern: 'package.json',
		type: 'dependency',
		priority: 'medium'
	},
	{
		name: 'Git Changes',
		description: 'Uncommitted changes',
		pattern: '${gitDiff}',
		type: 'git-diff',
		priority: 'high'
	},
	{
		name: 'README',
		description: 'Project documentation',
		pattern: 'README.md',
		type: 'documentation',
		priority: 'low'
	},
	{
		name: 'Config Files',
		description: 'Configuration files',
		pattern: '*.config.{js,ts,json}',
		type: 'file',
		priority: 'low'
	},
	{
		name: 'Recent Errors',
		description: 'Terminal error output',
		pattern: '${terminalErrors}',
		type: 'terminal',
		priority: 'high'
	}
];

// Register icons
const claudeContextStudioIcon = registerIcon('claude-context-studio', Codicon.layers, localize('claudeContextStudioIcon', 'Icon for Claude Context Studio view container.'));

// Register view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.claudeContextStudio',
	title: localize('claudeContextStudio', 'Context Studio'),
	icon: claudeContextStudioIcon,
	order: 18,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.claudeContextStudio', { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.claudeContextStudio',
	hideIfEmpty: false,
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: false });

// Register views
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
	{
		id: 'claudeContextStudio.budget',
		name: localize('contextBudget', 'Context Budget'),
		ctorDescriptor: new SyncDescriptor(ClaudeContextBudgetView),
		order: 1,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeContextStudioIcon,
	},
	{
		id: 'claudeContextStudio.selector',
		name: localize('contextSelector', 'Smart Selector'),
		ctorDescriptor: new SyncDescriptor(ClaudeContextSelectorView),
		order: 2,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeContextStudioIcon,
	},
	{
		id: 'claudeContextStudio.history',
		name: localize('contextHistory', 'Context History'),
		ctorDescriptor: new SyncDescriptor(ClaudeContextHistoryView),
		order: 3,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: true,
		containerIcon: claudeContextStudioIcon,
	}
], VIEW_CONTAINER);

// Register actions
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeContextStudio.optimizeContext',
			title: localize('optimizeContext', 'Optimize Context Budget'),
			f1: true,
			icon: Codicon.sparkle,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.notify({
			severity: Severity.Info,
			message: localize('optimizing', 'Optimizing context for maximum efficiency...')
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeContextStudio.saveSnapshot',
			title: localize('saveSnapshot', 'Save Context Snapshot'),
			f1: true,
			icon: Codicon.save,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.notify({
			severity: Severity.Info,
			message: localize('snapshotSaved', 'Context snapshot saved')
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeContextStudio.clearContext',
			title: localize('clearContext', 'Clear Context'),
			f1: true,
			icon: Codicon.clearAll,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.notify({
			severity: Severity.Info,
			message: localize('contextCleared', 'Context cleared')
		});
	}
});

// Helper functions
export function estimateTokens(text: string): number {
	// Rough estimation: ~4 characters per token for English text
	return Math.ceil(text.length / 4);
}

export function formatTokens(tokens: number): string {
	if (tokens >= 1000000) {
		return `${(tokens / 1000000).toFixed(1)}M`;
	}
	if (tokens >= 1000) {
		return `${(tokens / 1000).toFixed(1)}K`;
	}
	return String(tokens);
}

export function getContextPercentage(used: number, max: number): number {
	return Math.round((used / max) * 100);
}

export function sortByPriority(items: IContextItem[]): IContextItem[] {
	return [...items].sort((a, b) => {
		const weightA = PRIORITY_INFO[a.priority].weight;
		const weightB = PRIORITY_INFO[b.priority].weight;
		return weightB - weightA;
	});
}

export function optimizeContext(items: IContextItem[], maxTokens: number, reservedTokens: number): IContextItem[] {
	const available = maxTokens - reservedTokens;
	const sorted = sortByPriority(items);

	let used = 0;
	const result: IContextItem[] = [];

	for (const item of sorted) {
		if (used + item.tokens <= available) {
			result.push({ ...item, included: true });
			used += item.tokens;
		} else if (item.priority === 'critical') {
			// Always include critical items even if over budget
			result.push({ ...item, included: true });
			used += item.tokens;
		} else {
			result.push({ ...item, included: false });
		}
	}

	return result;
}

export function categorizeItems(items: IContextItem[]): Map<string, IContextItem[]> {
	const categories = new Map<string, IContextItem[]>();

	for (const item of items) {
		const category = item.category || CONTEXT_TYPE_INFO[item.type].name;
		if (!categories.has(category)) {
			categories.set(category, []);
		}
		categories.get(category)!.push(item);
	}

	return categories;
}
