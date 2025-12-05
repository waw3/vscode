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
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';

interface ITemplate {
	id: string;
	name: string;
	description: string;
	icon: string;
	category: 'full' | 'section' | 'snippet';
	content: string;
}

export class ClaudeMemoryTemplatesView extends ViewPane {

	private container!: HTMLElement;
	private templatesList!: HTMLElement;
	private previewPanel!: HTMLElement;
	private selectedTemplate: ITemplate | null = null;

	private templates: ITemplate[] = [
		// Full templates
		{
			id: 'basic',
			name: 'Basic Project',
			description: 'Simple project overview template',
			icon: 'file',
			category: 'full',
			content: `# Project Overview

## Tech Stack
- Language:
- Framework:
- Database:

## Directory Structure
\`\`\`
src/
├── components/
├── services/
└── utils/
\`\`\`

## Development

### Getting Started
\`\`\`bash
npm install
npm run dev
\`\`\`

### Testing
\`\`\`bash
npm test
\`\`\`

## Code Standards
- Use descriptive variable names
- Write tests for new features
- Follow existing patterns
`
		},
		{
			id: 'api',
			name: 'REST API',
			description: 'API documentation template',
			icon: 'globe',
			category: 'full',
			content: `# API Documentation

## Base URL
\`https://api.example.com/v1\`

## Authentication
Bearer token in Authorization header

## Endpoints

### GET /resource
Returns a list of resources.

**Response:**
\`\`\`json
{
  "success": true,
  "data": []
}
\`\`\`

### POST /resource
Creates a new resource.

**Request:**
\`\`\`json
{
  "name": "string"
}
\`\`\`

## Error Handling
- 400: Bad Request
- 401: Unauthorized
- 404: Not Found
- 500: Server Error
`
		},
		{
			id: 'frontend',
			name: 'Frontend App',
			description: 'React/Vue/Angular template',
			icon: 'browser',
			category: 'full',
			content: `# Frontend Application

## Tech Stack
- Framework: React 18
- State: Redux/Zustand
- Styling: Tailwind CSS
- Testing: Jest + RTL

## Component Structure
\`\`\`
components/
├── atoms/      # Basic elements
├── molecules/  # Combinations
├── organisms/  # Complex components
└── pages/      # Route components
\`\`\`

## State Management
- Global: User auth, theme
- Local: Form inputs, UI state

## Scripts
\`\`\`bash
npm run dev       # Development
npm run build     # Production
npm run test      # Tests
npm run storybook # Docs
\`\`\`
`
		},

		// Section templates
		{
			id: 'tech-stack',
			name: 'Tech Stack',
			description: 'Technology stack section',
			icon: 'layers',
			category: 'section',
			content: `## Tech Stack

### Backend
- **Language:** TypeScript
- **Runtime:** Node.js
- **Framework:** Express/Fastify
- **Database:** PostgreSQL

### Frontend
- **Framework:** React 18
- **Styling:** Tailwind CSS
- **State:** Zustand

### Infrastructure
- **Hosting:** AWS/Vercel
- **CI/CD:** GitHub Actions
`
		},
		{
			id: 'directory',
			name: 'Directory Structure',
			description: 'Project file organization',
			icon: 'folder-library',
			category: 'section',
			content: `## Directory Structure

\`\`\`
src/
├── api/           # API routes and handlers
├── components/    # React components
│   ├── ui/        # Base UI components
│   └── features/  # Feature components
├── hooks/         # Custom React hooks
├── lib/           # Utility libraries
├── services/      # Business logic
├── stores/        # State management
├── types/         # TypeScript types
└── utils/         # Helper functions

tests/
├── unit/          # Unit tests
├── integration/   # Integration tests
└── e2e/           # End-to-end tests
\`\`\`
`
		},
		{
			id: 'code-standards',
			name: 'Code Standards',
			description: 'Coding conventions',
			icon: 'checklist',
			category: 'section',
			content: `## Code Standards

### Style Guide
- Use 2-space indentation
- Maximum line length: 100 characters
- Use TypeScript strict mode
- Prefer const over let

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | \`UserProfile\` |
| Functions | camelCase | \`getUserById\` |
| Constants | UPPER_SNAKE | \`MAX_RETRIES\` |
| Files | kebab-case | \`user-profile.tsx\` |

### Best Practices
- Write self-documenting code
- Keep functions small and focused
- Use TypeScript for type safety
- Write tests for critical paths
`
		},

		// Snippets
		{
			id: 'api-endpoint',
			name: 'API Endpoint',
			description: 'Single endpoint documentation',
			icon: 'symbol-method',
			category: 'snippet',
			content: `### [METHOD] /endpoint

**Description:** Brief description

**Request:**
\`\`\`json
{
  "field": "type"
}
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "data": {}
}
\`\`\`

**Errors:**
- 400: Invalid input
- 404: Not found
`
		},
		{
			id: 'component',
			name: 'Component Pattern',
			description: 'React component template',
			icon: 'symbol-class',
			category: 'snippet',
			content: `### ComponentName

**Props:**
\`\`\`typescript
interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}
\`\`\`

**Usage:**
\`\`\`tsx
<ComponentName
  value={value}
  onChange={handleChange}
/>
\`\`\`
`
		},
		{
			id: 'env-vars',
			name: 'Environment Variables',
			description: 'Env var documentation',
			icon: 'key',
			category: 'snippet',
			content: `### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| \`DATABASE_URL\` | Database connection | Yes | - |
| \`API_KEY\` | External API key | Yes | - |
| \`NODE_ENV\` | Environment | No | development |
| \`LOG_LEVEL\` | Logging level | No | info |

**Example .env:**
\`\`\`
DATABASE_URL=postgresql://...
API_KEY=sk-...
\`\`\`
`
		},
		{
			id: 'testing',
			name: 'Testing Guide',
			description: 'Testing conventions',
			icon: 'beaker',
			category: 'snippet',
			content: `### Testing

**Run tests:**
\`\`\`bash
npm test              # All tests
npm test:unit         # Unit only
npm test:e2e          # E2E only
npm test:coverage     # With coverage
\`\`\`

**Conventions:**
- Test files: \`*.test.ts\` or \`*.spec.ts\`
- Use descriptive test names
- One assertion per test when possible
- Mock external dependencies

**Coverage targets:**
- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%
`
		}
	];

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
		@IEditorService private readonly editorService: IEditorService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-memory-templates-view');

		// Templates list
		this.templatesList = append(this.container, $('.claude-templates-list'));

		// Preview panel
		this.previewPanel = append(this.container, $('.claude-templates-preview'));
		this.previewPanel.style.display = 'none';

		this.renderTemplates();
	}

	private renderTemplates(): void {
		clearNode(this.templatesList);

		const categories = [
			{ id: 'full', label: localize('fullTemplates', 'Full Templates'), icon: 'file-code' },
			{ id: 'section', label: localize('sections', 'Sections'), icon: 'symbol-namespace' },
			{ id: 'snippet', label: localize('snippets', 'Snippets'), icon: 'symbol-snippet' },
		];

		for (const category of categories) {
			const categoryTemplates = this.templates.filter(t => t.category === category.id);
			if (categoryTemplates.length === 0) continue;

			const section = append(this.templatesList, $('.claude-templates-section'));

			const header = append(section, $('.claude-templates-section-header'));
			header.innerHTML = `<span class="codicon codicon-${category.icon}"></span> ${category.label}`;

			for (const template of categoryTemplates) {
				this.renderTemplate(section, template);
			}
		}
	}

	private renderTemplate(container: HTMLElement, template: ITemplate): void {
		const item = append(container, $('.claude-template-item'));

		const icon = append(item, $('.claude-template-icon'));
		icon.innerHTML = `<span class="codicon codicon-${template.icon}"></span>`;

		const info = append(item, $('.claude-template-info'));

		const name = append(info, $('.claude-template-name'));
		name.textContent = template.name;

		const desc = append(info, $('.claude-template-desc'));
		desc.textContent = template.description;

		const actions = append(item, $('.claude-template-actions'));

		const copyBtn = append(actions, $('button.claude-template-action'));
		copyBtn.innerHTML = '<span class="codicon codicon-copy"></span>';
		copyBtn.title = localize('copy', 'Copy to Clipboard');
		copyBtn.onclick = (e) => {
			e.stopPropagation();
			this.copyTemplate(template);
		};

		const insertBtn = append(actions, $('button.claude-template-action.primary'));
		insertBtn.innerHTML = '<span class="codicon codicon-insert"></span>';
		insertBtn.title = localize('insert', 'Insert in Editor');
		insertBtn.onclick = (e) => {
			e.stopPropagation();
			this.insertTemplate(template);
		};

		// Click to preview
		item.onclick = () => this.showPreview(template);

		// Hover effect
		item.onmouseenter = () => item.classList.add('hover');
		item.onmouseleave = () => item.classList.remove('hover');
	}

	private showPreview(template: ITemplate): void {
		this.selectedTemplate = template;
		this.previewPanel.style.display = 'block';

		this.previewPanel.innerHTML = '';

		const header = append(this.previewPanel, $('.claude-preview-header'));
		header.innerHTML = `
			<span class="codicon codicon-${template.icon}"></span>
			<span class="name">${template.name}</span>
			<button class="close" title="${localize('close', 'Close')}">
				<span class="codicon codicon-close"></span>
			</button>
		`;

		header.querySelector('.close')!.addEventListener('click', () => {
			this.previewPanel.style.display = 'none';
			this.selectedTemplate = null;
		});

		const content = append(this.previewPanel, $('pre.claude-preview-content'));
		content.textContent = template.content;

		const actions = append(this.previewPanel, $('.claude-preview-actions'));

		const copyBtn = append(actions, $('button.claude-preview-btn'));
		copyBtn.innerHTML = '<span class="codicon codicon-copy"></span> ' + localize('copy', 'Copy');
		copyBtn.onclick = () => this.copyTemplate(template);

		const insertBtn = append(actions, $('button.claude-preview-btn.primary'));
		insertBtn.innerHTML = '<span class="codicon codicon-insert"></span> ' + localize('insert', 'Insert');
		insertBtn.onclick = () => this.insertTemplate(template);
	}

	private async copyTemplate(template: ITemplate): Promise<void> {
		await this.clipboardService.writeText(template.content);
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('copied', 'Copied "{0}" to clipboard', template.name)
		});
	}

	private insertTemplate(template: ITemplate): void {
		const editor = this.editorService.activeTextEditorControl;

		if (editor && (editor as any).executeEdits) {
			const selection = (editor as any).getSelection();
			(editor as any).executeEdits('template', [{
				range: selection,
				text: template.content,
				forceMoveMarkers: true
			}]);

			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('inserted', 'Inserted "{0}"', template.name)
			});
		} else {
			// Fallback to copy
			this.copyTemplate(template);
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
