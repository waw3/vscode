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
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';

// Import views
import { ClaudePromptLibraryView } from './views/claudePromptLibraryView.js';
import { ClaudePromptBuilderView } from './views/claudePromptBuilderView.js';
import { ClaudePromptChainView } from './views/claudePromptChainView.js';
import { ClaudePromptPlaygroundView } from './views/claudePromptPlaygroundView.js';

import './media/claudePromptStudio.css';

// Types
export interface IPromptTemplate {
	id: string;
	name: string;
	description: string;
	category: PromptCategory;
	content: string;
	variables: IPromptVariable[];
	outputFormat?: IOutputFormat;
	tags: string[];
	usageCount: number;
	isFavorite: boolean;
	scope: 'project' | 'user' | 'builtin';
	filePath?: string;
	createdAt: number;
	updatedAt: number;
}

export interface IPromptVariable {
	name: string;
	description: string;
	type: 'text' | 'file' | 'selection' | 'command' | 'custom';
	defaultValue?: string;
	required: boolean;
}

export interface IOutputFormat {
	type: 'text' | 'json' | 'markdown' | 'code';
	schema?: object;
	template?: string;
}

export interface IPromptChain {
	id: string;
	name: string;
	description: string;
	steps: IChainStep[];
	createdAt: number;
	updatedAt: number;
}

export interface IChainStep {
	id: string;
	name: string;
	promptId: string;
	promptContent?: string;
	inputMapping?: Record<string, string>;
	condition?: string;
}

export interface IChainCondition {
	type: 'always' | 'contains' | 'matches' | 'custom';
	value?: string;
}

export type PromptCategory =
	| 'code-review'
	| 'debugging'
	| 'testing'
	| 'documentation'
	| 'refactoring'
	| 'security'
	| 'performance'
	| 'explanation'
	| 'generation'
	| 'custom';

// Built-in prompt variables
export const BUILTIN_VARIABLES: IPromptVariable[] = [
	{ name: 'SELECTION', description: 'Current editor selection', type: 'selection', required: false },
	{ name: 'FILE', description: 'Current file content', type: 'file', required: false },
	{ name: 'FILE_NAME', description: 'Current file name', type: 'text', required: false },
	{ name: 'FILE_PATH', description: 'Current file path', type: 'text', required: false },
	{ name: 'LANGUAGE', description: 'Current file language', type: 'text', required: false },
	{ name: 'PROJECT_NAME', description: 'Workspace/project name', type: 'text', required: false },
	{ name: 'PROJECT_STRUCTURE', description: 'Directory tree structure', type: 'text', required: false },
	{ name: 'GIT_DIFF', description: 'Uncommitted git changes', type: 'command', required: false },
	{ name: 'GIT_BRANCH', description: 'Current git branch', type: 'command', required: false },
	{ name: 'ERROR_LOG', description: 'Recent terminal errors', type: 'text', required: false },
	{ name: 'DEPENDENCIES', description: 'Project dependencies', type: 'file', required: false },
	{ name: 'CLIPBOARD', description: 'Clipboard content', type: 'text', required: false },
	{ name: 'CURSOR_LINE', description: 'Line at cursor position', type: 'text', required: false },
	{ name: 'CURSOR_WORD', description: 'Word at cursor position', type: 'text', required: false },
];

// Category info
export const PROMPT_CATEGORIES: Record<PromptCategory, { name: string; icon: string; color: string }> = {
	'code-review': { name: 'Code Review', icon: 'eye', color: '#3B82F6' },
	'debugging': { name: 'Debugging', icon: 'bug', color: '#EF4444' },
	'testing': { name: 'Testing', icon: 'beaker', color: '#8B5CF6' },
	'documentation': { name: 'Documentation', icon: 'book', color: '#10B981' },
	'refactoring': { name: 'Refactoring', icon: 'symbol-structure', color: '#F59E0B' },
	'security': { name: 'Security', icon: 'shield', color: '#EC4899' },
	'performance': { name: 'Performance', icon: 'rocket', color: '#6366F1' },
	'explanation': { name: 'Explanation', icon: 'comment-discussion', color: '#14B8A6' },
	'generation': { name: 'Generation', icon: 'wand', color: '#F97316' },
	'custom': { name: 'Custom', icon: 'bookmark', color: '#6B7280' },
};

// Built-in prompt templates
export const BUILTIN_PROMPTS: IPromptTemplate[] = [
	{
		id: 'security-audit',
		name: 'Security Audit',
		description: 'Comprehensive security review for vulnerabilities',
		category: 'security',
		content: `Perform a comprehensive security audit on the following code:

\`\`\`{{LANGUAGE}}
{{SELECTION}}
\`\`\`

Check for:
1. **OWASP Top 10 vulnerabilities**
   - Injection flaws (SQL, XSS, Command)
   - Broken authentication
   - Sensitive data exposure
   - XML External Entities (XXE)
   - Broken access control
   - Security misconfiguration
   - Cross-Site Scripting (XSS)
   - Insecure deserialization
   - Using components with known vulnerabilities
   - Insufficient logging & monitoring

2. **Input Validation**
   - User input sanitization
   - Type checking
   - Boundary validation

3. **Authentication & Authorization**
   - Proper credential handling
   - Session management
   - Access control checks

4. **Data Protection**
   - Encryption usage
   - Secure storage
   - Data exposure risks

Provide severity ratings (Critical/High/Medium/Low) and specific remediation steps.`,
		variables: [
			{ name: 'SELECTION', description: 'Code to audit', type: 'selection', required: true },
			{ name: 'LANGUAGE', description: 'Programming language', type: 'text', required: false },
		],
		tags: ['security', 'audit', 'owasp', 'vulnerabilities'],
		usageCount: 0,
		isFavorite: false,
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: 'code-review-comprehensive',
		name: 'Comprehensive Code Review',
		description: 'In-depth code review covering quality, bugs, and best practices',
		category: 'code-review',
		content: `Review the following code comprehensively:

\`\`\`{{LANGUAGE}}
{{SELECTION}}
\`\`\`

**File:** {{FILE_NAME}}

Please analyze:

## 1. Code Quality
- Readability and clarity
- Naming conventions
- Code organization
- DRY principles adherence

## 2. Potential Bugs
- Logic errors
- Edge cases not handled
- Null/undefined risks
- Race conditions

## 3. Performance
- Time complexity
- Memory usage
- Unnecessary computations
- Caching opportunities

## 4. Best Practices
- Design patterns usage
- SOLID principles
- Error handling
- Type safety

## 5. Suggestions
Provide specific, actionable improvements with code examples.`,
		variables: [
			{ name: 'SELECTION', description: 'Code to review', type: 'selection', required: true },
			{ name: 'LANGUAGE', description: 'Programming language', type: 'text', required: false },
			{ name: 'FILE_NAME', description: 'File name', type: 'text', required: false },
		],
		tags: ['review', 'quality', 'best-practices'],
		usageCount: 0,
		isFavorite: false,
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: 'test-generator',
		name: 'Unit Test Generator',
		description: 'Generate comprehensive unit tests',
		category: 'testing',
		content: `Generate comprehensive unit tests for the following code:

\`\`\`{{LANGUAGE}}
{{SELECTION}}
\`\`\`

Requirements:
1. Use the project's testing framework (detect from context or use standard)
2. Cover all public methods/functions
3. Include:
   - Happy path tests
   - Edge cases
   - Error conditions
   - Boundary values
   - Null/undefined handling

4. Follow AAA pattern (Arrange, Act, Assert)
5. Use descriptive test names that explain the scenario
6. Add appropriate mocking where needed
7. Aim for high code coverage

Output the complete test file with all imports.`,
		variables: [
			{ name: 'SELECTION', description: 'Code to test', type: 'selection', required: true },
			{ name: 'LANGUAGE', description: 'Programming language', type: 'text', required: false },
		],
		tags: ['testing', 'unit-tests', 'coverage'],
		usageCount: 0,
		isFavorite: false,
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: 'explain-code',
		name: 'Code Explanation',
		description: 'Detailed explanation of code functionality',
		category: 'explanation',
		content: `Explain the following code in detail:

\`\`\`{{LANGUAGE}}
{{SELECTION}}
\`\`\`

Please provide:

1. **Overview**: What does this code do at a high level?

2. **Step-by-Step Breakdown**: Walk through the code line by line or section by section

3. **Key Concepts**: Explain any important patterns, algorithms, or techniques used

4. **Dependencies**: What external dependencies or prerequisites does this code need?

5. **Example Usage**: Show how this code would be used in practice

6. **Potential Issues**: Any caveats or potential problems to be aware of?

Use clear language suitable for a developer who is familiar with {{LANGUAGE}} but new to this codebase.`,
		variables: [
			{ name: 'SELECTION', description: 'Code to explain', type: 'selection', required: true },
			{ name: 'LANGUAGE', description: 'Programming language', type: 'text', required: false },
		],
		tags: ['explanation', 'documentation', 'learning'],
		usageCount: 0,
		isFavorite: false,
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: 'refactor-improve',
		name: 'Refactor & Improve',
		description: 'Refactor code for better quality and maintainability',
		category: 'refactoring',
		content: `Refactor and improve the following code:

\`\`\`{{LANGUAGE}}
{{SELECTION}}
\`\`\`

Goals:
1. **Improve readability** - Better naming, clearer structure
2. **Reduce complexity** - Simplify conditionals, extract functions
3. **Enhance maintainability** - Apply SOLID principles
4. **Optimize performance** - Only if it doesn't hurt readability
5. **Fix any issues** - Bugs, potential errors, edge cases

Constraints:
- Preserve the existing API/interface
- Maintain all existing functionality
- Keep the same programming paradigm (unless clearly better)

Provide:
1. The refactored code
2. A summary of changes made
3. Explanation of why each change improves the code`,
		variables: [
			{ name: 'SELECTION', description: 'Code to refactor', type: 'selection', required: true },
			{ name: 'LANGUAGE', description: 'Programming language', type: 'text', required: false },
		],
		tags: ['refactoring', 'improvement', 'clean-code'],
		usageCount: 0,
		isFavorite: false,
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: 'debug-investigate',
		name: 'Debug Investigation',
		description: 'Investigate and fix a bug',
		category: 'debugging',
		content: `Help me debug this issue:

**Error/Problem Description:**
{{CUSTOM_ERROR}}

**Relevant Code:**
\`\`\`{{LANGUAGE}}
{{SELECTION}}
\`\`\`

**Additional Context:**
{{CUSTOM_CONTEXT}}

Please:
1. **Analyze** the potential causes of this issue
2. **Identify** the most likely root cause
3. **Explain** why this bug occurs
4. **Provide** a fix with code
5. **Suggest** how to prevent similar issues in the future
6. **Recommend** any tests to add`,
		variables: [
			{ name: 'CUSTOM_ERROR', description: 'Error message or problem description', type: 'custom', required: true },
			{ name: 'SELECTION', description: 'Relevant code', type: 'selection', required: true },
			{ name: 'CUSTOM_CONTEXT', description: 'Additional context', type: 'custom', required: false },
			{ name: 'LANGUAGE', description: 'Programming language', type: 'text', required: false },
		],
		tags: ['debugging', 'bug-fix', 'investigation'],
		usageCount: 0,
		isFavorite: false,
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: 'documentation-generator',
		name: 'Documentation Generator',
		description: 'Generate comprehensive documentation',
		category: 'documentation',
		content: `Generate comprehensive documentation for the following code:

\`\`\`{{LANGUAGE}}
{{SELECTION}}
\`\`\`

Include:
1. **File/Module Overview** - Purpose and responsibilities
2. **API Documentation** - For each public function/method:
   - Description
   - Parameters with types
   - Return value
   - Throws/Exceptions
   - Example usage
3. **Type Definitions** - Document interfaces, types, enums
4. **Usage Examples** - Real-world usage scenarios
5. **Dependencies** - Required imports and prerequisites

Use the appropriate documentation format for {{LANGUAGE}} (JSDoc, docstrings, etc.)`,
		variables: [
			{ name: 'SELECTION', description: 'Code to document', type: 'selection', required: true },
			{ name: 'LANGUAGE', description: 'Programming language', type: 'text', required: false },
		],
		tags: ['documentation', 'jsdoc', 'api-docs'],
		usageCount: 0,
		isFavorite: false,
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: 'performance-optimize',
		name: 'Performance Optimization',
		description: 'Analyze and optimize code performance',
		category: 'performance',
		content: `Analyze and optimize the performance of this code:

\`\`\`{{LANGUAGE}}
{{SELECTION}}
\`\`\`

Please provide:

## 1. Performance Analysis
- Current time complexity (Big O)
- Space complexity
- Identified bottlenecks

## 2. Optimization Opportunities
- Algorithm improvements
- Data structure changes
- Caching opportunities
- Lazy evaluation possibilities

## 3. Optimized Code
Provide the optimized version with:
- Clear comments explaining optimizations
- Benchmark comparison if applicable

## 4. Trade-offs
- What we gain vs. what we sacrifice (readability, memory, etc.)
- When to use original vs. optimized version`,
		variables: [
			{ name: 'SELECTION', description: 'Code to optimize', type: 'selection', required: true },
			{ name: 'LANGUAGE', description: 'Programming language', type: 'text', required: false },
		],
		tags: ['performance', 'optimization', 'big-o'],
		usageCount: 0,
		isFavorite: false,
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
];

// Register icons
const claudePromptStudioIcon = registerIcon('claude-prompt-studio', Codicon.notebook, localize('claudePromptStudioIcon', 'Icon for Claude Prompt Studio view container.'));

// Register view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.claudePromptStudio',
	title: localize('claudePromptStudio', 'Prompt Studio'),
	icon: claudePromptStudioIcon,
	order: 16,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.claudePromptStudio', { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.claudePromptStudio',
	hideIfEmpty: false,
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: false });

// Register views
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
	{
		id: 'claudePromptStudio.library',
		name: localize('promptLibrary', 'Prompt Library'),
		ctorDescriptor: new SyncDescriptor(ClaudePromptLibraryView),
		order: 1,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudePromptStudioIcon,
	},
	{
		id: 'claudePromptStudio.builder',
		name: localize('promptBuilder', 'Prompt Builder'),
		ctorDescriptor: new SyncDescriptor(ClaudePromptBuilderView),
		order: 2,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudePromptStudioIcon,
	},
	{
		id: 'claudePromptStudio.chains',
		name: localize('promptChains', 'Prompt Chains'),
		ctorDescriptor: new SyncDescriptor(ClaudePromptChainView),
		order: 3,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: true,
		containerIcon: claudePromptStudioIcon,
	},
	{
		id: 'claudePromptStudio.playground',
		name: localize('playground', 'Playground'),
		ctorDescriptor: new SyncDescriptor(ClaudePromptPlaygroundView),
		order: 4,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: true,
		containerIcon: claudePromptStudioIcon,
	}
], VIEW_CONTAINER);

// Register actions
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudePromptStudio.createPrompt',
			title: localize('createPrompt', 'Create Prompt Template'),
			f1: true,
			icon: Codicon.add,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		const name = await quickInputService.input({
			placeHolder: localize('promptName', 'Prompt name'),
			title: localize('createPrompt', 'Create Prompt Template')
		});

		if (!name) return;

		const categoryItems = Object.entries(PROMPT_CATEGORIES).map(([id, cat]) => ({
			label: `$(${cat.icon}) ${cat.name}`,
			id
		}));

		const category = await quickInputService.pick(categoryItems, {
			placeHolder: localize('selectCategory', 'Select category'),
			title: localize('createPrompt', 'Create Prompt Template')
		});

		if (!category) return;

		notificationService.notify({
			severity: Severity.Info,
			message: localize('promptCreated', 'Opening Prompt Builder for: {0}', name)
		});

		// In production, this would open the builder with the new prompt
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudePromptStudio.quickInsert',
			title: localize('quickInsertPrompt', 'Quick Insert Prompt'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		const items = BUILTIN_PROMPTS.map(p => ({
			label: `$(${PROMPT_CATEGORIES[p.category].icon}) ${p.name}`,
			description: p.description,
			detail: p.tags.map(t => `#${t}`).join(' '),
			id: p.id
		}));

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('selectPrompt', 'Select a prompt template'),
			title: localize('quickInsertPrompt', 'Quick Insert Prompt'),
			matchOnDescription: true,
			matchOnDetail: true
		});

		if (!selected) return;

		const prompt = BUILTIN_PROMPTS.find(p => p.id === selected.id);
		if (prompt) {
			notificationService.notify({
				severity: Severity.Info,
				message: localize('promptInserted', 'Inserted: {0}', prompt.name)
			});
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudePromptStudio.openPlayground',
			title: localize('openPlayground', 'Open Prompt Playground'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.notify({
			severity: Severity.Info,
			message: localize('openingPlayground', 'Opening Prompt Playground...')
		});
	}
});

// Helper functions
export function expandVariables(content: string, variables: Record<string, string>): string {
	let expanded = content;
	for (const [key, value] of Object.entries(variables)) {
		expanded = expanded.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
	}
	return expanded;
}

export function estimateTokens(text: string): number {
	// Rough estimation: ~4 characters per token for English text
	return Math.ceil(text.length / 4);
}

export function parsePromptFile(content: string): Partial<IPromptTemplate> {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

	if (frontmatterMatch) {
		const frontmatter = frontmatterMatch[1];
		const body = frontmatterMatch[2].trim();

		const nameMatch = frontmatter.match(/name:\s*(.+)/);
		const descMatch = frontmatter.match(/description:\s*(.+)/);
		const categoryMatch = frontmatter.match(/category:\s*(.+)/);
		const tagsMatch = frontmatter.match(/tags:\s*\[([^\]]+)\]/);

		return {
			name: nameMatch ? nameMatch[1].trim() : '',
			description: descMatch ? descMatch[1].trim() : '',
			category: (categoryMatch ? categoryMatch[1].trim() : 'custom') as PromptCategory,
			tags: tagsMatch ? tagsMatch[1].split(',').map(t => t.trim()) : [],
			content: body
		};
	}

	return { content: content.trim() };
}
