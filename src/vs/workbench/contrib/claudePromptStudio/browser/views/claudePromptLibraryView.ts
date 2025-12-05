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
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import {
	IPromptTemplate,
	BUILTIN_PROMPTS,
	PROMPT_CATEGORIES,
	PromptCategory,
	parsePromptFile,
	estimateTokens
} from '../claudePromptStudio.contribution.js';

export class ClaudePromptLibraryView extends ViewPane {

	private container!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private promptsList!: HTMLElement;
	private prompts: IPromptTemplate[] = [];
	private filteredPrompts: IPromptTemplate[] = [];
	private selectedCategory: PromptCategory | 'all' = 'all';
	private showFavoritesOnly: boolean = false;

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
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-prompt-library-view');

		// Header
		const header = append(this.container, $('.prompt-library-header'));
		header.innerHTML = `
			<div class="header-content">
				<span class="codicon codicon-notebook"></span>
				<div class="header-text">
					<strong>${localize('promptLibrary', 'Prompt Library')}</strong>
					<span>${localize('libraryDesc', 'Reusable prompt templates')}</span>
				</div>
			</div>
		`;

		// Search bar
		const searchBar = append(this.container, $('.prompt-library-search'));
		const searchIcon = append(searchBar, $('.search-icon'));
		searchIcon.innerHTML = '<span class="codicon codicon-search"></span>';

		this.searchInput = append(searchBar, $('input.prompt-search-input')) as HTMLInputElement;
		this.searchInput.placeholder = localize('searchPrompts', 'Search prompts...');
		this.searchInput.oninput = () => this.filterPrompts();

		// Toolbar
		const toolbar = append(this.container, $('.prompt-library-toolbar'));

		const createBtn = append(toolbar, $('button.prompt-btn.primary'));
		createBtn.innerHTML = '<span class="codicon codicon-add"></span> ' + localize('new', 'New');
		createBtn.onclick = () => this.commandService.executeCommand('claudePromptStudio.createPrompt');

		const favoritesBtn = append(toolbar, $('button.prompt-btn'));
		favoritesBtn.innerHTML = '<span class="codicon codicon-star"></span>';
		favoritesBtn.title = localize('showFavorites', 'Show Favorites');
		favoritesBtn.onclick = () => {
			this.showFavoritesOnly = !this.showFavoritesOnly;
			favoritesBtn.classList.toggle('active', this.showFavoritesOnly);
			this.filterPrompts();
		};

		const refreshBtn = append(toolbar, $('button.prompt-btn'));
		refreshBtn.innerHTML = '<span class="codicon codicon-refresh"></span>';
		refreshBtn.title = localize('refresh', 'Refresh');
		refreshBtn.onclick = () => this.loadPrompts();

		// Category filter
		const categoryFilter = append(this.container, $('.prompt-category-filter'));

		const allBtn = append(categoryFilter, $('button.category-btn.active'));
		allBtn.textContent = 'All';
		allBtn.onclick = () => this.selectCategory('all', allBtn);

		for (const [id, cat] of Object.entries(PROMPT_CATEGORIES)) {
			const btn = append(categoryFilter, $('button.category-btn'));
			btn.innerHTML = `<span class="codicon codicon-${cat.icon}"></span>`;
			btn.title = cat.name;
			btn.onclick = () => this.selectCategory(id as PromptCategory, btn);
		}

		// Prompts list
		this.promptsList = append(this.container, $('.prompt-library-list'));

		// Stats footer
		const footer = append(this.container, $('.prompt-library-footer'));
		footer.innerHTML = `<span class="prompt-count"></span>`;

		// Load prompts
		this.loadPrompts();
	}

	private selectCategory(category: PromptCategory | 'all', button: HTMLElement): void {
		this.selectedCategory = category;

		// Update button states
		this.container.querySelectorAll('.category-btn').forEach(btn => {
			btn.classList.remove('active');
		});
		button.classList.add('active');

		this.filterPrompts();
	}

	private async loadPrompts(): Promise<void> {
		this.prompts = [...BUILTIN_PROMPTS];

		// Load from project prompts
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length > 0) {
			const projectPromptsUri = URI.joinPath(folders[0].uri, '.claude/prompts');
			await this.loadPromptsFromFolder(projectPromptsUri, 'project');
		}

		// Load from user prompts
		const homeDir = process.env.HOME || process.env.USERPROFILE || '';
		const userPromptsUri = URI.file(`${homeDir}/.claude/prompts`);
		await this.loadPromptsFromFolder(userPromptsUri, 'user');

		this.filterPrompts();
	}

	private async loadPromptsFromFolder(folderUri: URI, scope: 'project' | 'user'): Promise<void> {
		try {
			const exists = await this.fileService.exists(folderUri);
			if (!exists) return;

			const files = await this.fileService.readdir(folderUri);
			for (const [name, type] of files) {
				if (name.endsWith('.md') && type === 1) {
					const fileUri = URI.joinPath(folderUri, name);
					const content = await this.fileService.readFile(fileUri);
					const text = new TextDecoder().decode(content.value);
					const parsed = parsePromptFile(text);

					this.prompts.push({
						id: `${scope}-${name.replace('.md', '')}`,
						name: parsed.name || name.replace('.md', ''),
						description: parsed.description || '',
						category: parsed.category || 'custom',
						content: parsed.content || text,
						variables: [],
						tags: parsed.tags || [],
						usageCount: 0,
						isFavorite: false,
						scope,
						filePath: fileUri.toString(),
						createdAt: Date.now(),
						updatedAt: Date.now(),
					});
				}
			}
		} catch { }
	}

	private filterPrompts(): void {
		const query = this.searchInput.value.toLowerCase();

		this.filteredPrompts = this.prompts.filter(prompt => {
			// Category filter
			if (this.selectedCategory !== 'all' && prompt.category !== this.selectedCategory) {
				return false;
			}

			// Favorites filter
			if (this.showFavoritesOnly && !prompt.isFavorite) {
				return false;
			}

			// Search filter
			if (query) {
				const searchText = `${prompt.name} ${prompt.description} ${prompt.tags.join(' ')}`.toLowerCase();
				if (!searchText.includes(query)) {
					return false;
				}
			}

			return true;
		});

		this.renderPrompts();
	}

	private renderPrompts(): void {
		clearNode(this.promptsList);

		// Update count
		const countEl = this.container.querySelector('.prompt-count');
		if (countEl) {
			countEl.textContent = `${this.filteredPrompts.length} prompts`;
		}

		if (this.filteredPrompts.length === 0) {
			const empty = append(this.promptsList, $('.prompt-library-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-notebook"></span>
				<span>${localize('noPrompts', 'No prompts found')}</span>
				<button class="prompt-btn primary">${localize('createFirst', 'Create your first prompt')}</button>
			`;

			const btn = empty.querySelector('button');
			if (btn) {
				btn.onclick = () => this.commandService.executeCommand('claudePromptStudio.createPrompt');
			}
			return;
		}

		// Group by category
		const byCategory = new Map<PromptCategory, IPromptTemplate[]>();
		for (const prompt of this.filteredPrompts) {
			if (!byCategory.has(prompt.category)) {
				byCategory.set(prompt.category, []);
			}
			byCategory.get(prompt.category)!.push(prompt);
		}

		for (const [category, prompts] of byCategory) {
			this.renderCategorySection(category, prompts);
		}
	}

	private renderCategorySection(category: PromptCategory, prompts: IPromptTemplate[]): void {
		const categoryInfo = PROMPT_CATEGORIES[category];
		const section = append(this.promptsList, $('.prompt-category-section'));

		const header = append(section, $('.prompt-category-header'));
		header.innerHTML = `
			<span class="codicon codicon-${categoryInfo.icon}" style="color: ${categoryInfo.color}"></span>
			<span>${categoryInfo.name}</span>
			<span class="count">(${prompts.length})</span>
		`;

		for (const prompt of prompts) {
			this.renderPromptItem(section, prompt);
		}
	}

	private renderPromptItem(container: HTMLElement, prompt: IPromptTemplate): void {
		const item = append(container, $('.prompt-item'));

		// Favorite indicator
		const favorite = append(item, $('.prompt-favorite'));
		favorite.innerHTML = `<span class="codicon codicon-${prompt.isFavorite ? 'star-full' : 'star-empty'}"></span>`;
		favorite.onclick = (e) => {
			e.stopPropagation();
			this.toggleFavorite(prompt);
		};

		// Content
		const content = append(item, $('.prompt-content'));

		const header = append(content, $('.prompt-header'));
		const name = append(header, $('.prompt-name'));
		name.textContent = prompt.name;

		const scope = append(header, $('.prompt-scope'));
		scope.textContent = prompt.scope;
		scope.classList.add(prompt.scope);

		const description = append(content, $('.prompt-description'));
		description.textContent = prompt.description;

		const meta = append(content, $('.prompt-meta'));

		// Tags
		const tags = append(meta, $('.prompt-tags'));
		for (const tag of prompt.tags.slice(0, 3)) {
			const tagEl = append(tags, $('.prompt-tag'));
			tagEl.textContent = `#${tag}`;
		}

		// Token estimate
		const tokens = append(meta, $('.prompt-tokens'));
		tokens.innerHTML = `<span class="codicon codicon-symbol-numeric"></span> ~${estimateTokens(prompt.content)} tokens`;

		// Actions
		const actions = append(item, $('.prompt-actions'));

		const useBtn = append(actions, $('button.prompt-action.primary'));
		useBtn.innerHTML = '<span class="codicon codicon-play"></span>';
		useBtn.title = localize('use', 'Use Prompt');
		useBtn.onclick = (e) => {
			e.stopPropagation();
			this.usePrompt(prompt);
		};

		const editBtn = append(actions, $('button.prompt-action'));
		editBtn.innerHTML = '<span class="codicon codicon-edit"></span>';
		editBtn.title = localize('edit', 'Edit');
		editBtn.onclick = (e) => {
			e.stopPropagation();
			this.editPrompt(prompt);
		};

		const copyBtn = append(actions, $('button.prompt-action'));
		copyBtn.innerHTML = '<span class="codicon codicon-copy"></span>';
		copyBtn.title = localize('copy', 'Copy');
		copyBtn.onclick = (e) => {
			e.stopPropagation();
			this.copyPrompt(prompt);
		};

		if (prompt.scope !== 'builtin') {
			const deleteBtn = append(actions, $('button.prompt-action.danger'));
			deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
			deleteBtn.title = localize('delete', 'Delete');
			deleteBtn.onclick = (e) => {
				e.stopPropagation();
				this.deletePrompt(prompt);
			};
		}

		// Click to expand/preview
		item.onclick = () => this.previewPrompt(prompt);
	}

	private toggleFavorite(prompt: IPromptTemplate): void {
		prompt.isFavorite = !prompt.isFavorite;
		this.renderPrompts();

		this.notificationService.notify({
			severity: Severity.Info,
			message: prompt.isFavorite
				? localize('addedToFavorites', 'Added to favorites')
				: localize('removedFromFavorites', 'Removed from favorites')
		});
	}

	private usePrompt(prompt: IPromptTemplate): void {
		prompt.usageCount++;

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('usingPrompt', 'Using prompt: {0}', prompt.name)
		});

		// In production, this would insert into chat or open playground
	}

	private editPrompt(prompt: IPromptTemplate): void {
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('editingPrompt', 'Opening editor for: {0}', prompt.name)
		});

		// In production, this would open the prompt builder
	}

	private copyPrompt(prompt: IPromptTemplate): void {
		navigator.clipboard.writeText(prompt.content);

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('promptCopied', 'Prompt copied to clipboard')
		});
	}

	private async deletePrompt(prompt: IPromptTemplate): Promise<void> {
		if (!prompt.filePath) return;

		const confirmed = confirm(localize('confirmDelete', 'Delete prompt "{0}"?', prompt.name));
		if (!confirmed) return;

		try {
			await this.fileService.del(URI.parse(prompt.filePath));
			this.loadPrompts();

			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('promptDeleted', 'Deleted: {0}', prompt.name)
			});
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('deleteFailed', 'Failed to delete prompt')
			});
		}
	}

	private previewPrompt(prompt: IPromptTemplate): void {
		// Show preview panel
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('previewPrompt', 'Preview: {0}', prompt.name)
		});
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
