/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewsRegistry, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';

// Import views
import { ClaudeMemoryHierarchyView } from './views/claudeMemoryHierarchyView.js';
import { ClaudeMemoryEditorView } from './views/claudeMemoryEditorView.js';
import { ClaudeMemoryTemplatesView } from './views/claudeMemoryTemplatesView.js';

import './media/claudeMemory.css';

// Register icons
const claudeMemoryIcon = registerIcon('claude-memory', Codicon.book, localize('claudeMemoryIcon', 'Icon for Claude Memory view container.'));

// Register view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.claudeMemory',
	title: localize('claudeMemory', 'Claude Memory'),
	icon: claudeMemoryIcon,
	order: 11,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.claudeMemory', { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.claudeMemory',
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: false });

// Register views
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
	{
		id: 'claudeMemory.hierarchy',
		name: localize('memoryHierarchy', 'Memory Hierarchy'),
		ctorDescriptor: new SyncDescriptor(ClaudeMemoryHierarchyView),
		order: 1,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeMemoryIcon,
	},
	{
		id: 'claudeMemory.editor',
		name: localize('memoryEditor', 'Quick Editor'),
		ctorDescriptor: new SyncDescriptor(ClaudeMemoryEditorView),
		order: 2,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeMemoryIcon,
	},
	{
		id: 'claudeMemory.templates',
		name: localize('templates', 'Templates & Snippets'),
		ctorDescriptor: new SyncDescriptor(ClaudeMemoryTemplatesView),
		order: 3,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: true,
		containerIcon: claudeMemoryIcon,
	}
], VIEW_CONTAINER);

// CLAUDE.md Templates
export const CLAUDE_MD_TEMPLATES = {
	basic: `# Project Overview

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
`,

	detailed: `# Project Name

## Overview
Brief description of the project and its purpose.

## Tech Stack
- **Frontend:**
- **Backend:**
- **Database:**
- **Infrastructure:**

## Architecture

### Directory Structure
\`\`\`
src/
├── api/          # API endpoints
├── components/   # UI components
├── services/     # Business logic
├── models/       # Data models
├── utils/        # Utility functions
└── types/        # TypeScript types
\`\`\`

### Key Patterns
- Describe architectural patterns used
- Explain data flow
- Note important conventions

## Development

### Prerequisites
- Node.js >= 18
- npm or yarn

### Getting Started
\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
\`\`\`

### Environment Variables
\`\`\`
DATABASE_URL=
API_KEY=
\`\`\`

## Code Standards

### Style Guide
- Use 2-space indentation
- Maximum line length: 100 characters
- Use TypeScript strict mode

### Naming Conventions
- Components: PascalCase
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Files: kebab-case

### Testing
- Write unit tests for all utilities
- Integration tests for API endpoints
- Minimum 80% code coverage

## Common Tasks

### Adding a New Feature
1. Create branch from main
2. Implement feature
3. Write tests
4. Submit PR

### Debugging
- Use browser DevTools
- Check logs in terminal
- Review error boundaries

## Important Notes
- Never commit secrets
- Always run linter before committing
- Update documentation for API changes
`,

	api: `# API Project

## Overview
RESTful API service for...

## Tech Stack
- Runtime: Node.js
- Framework: Express/Fastify
- Database: PostgreSQL
- ORM: Prisma/TypeORM

## API Design

### Base URL
\`\`\`
https://api.example.com/v1
\`\`\`

### Authentication
- Bearer token in Authorization header
- JWT-based authentication

### Response Format
\`\`\`json
{
  "success": true,
  "data": {},
  "error": null
}
\`\`\`

### Error Codes
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

## Endpoints

### Users
- GET /users - List users
- POST /users - Create user
- GET /users/:id - Get user
- PUT /users/:id - Update user
- DELETE /users/:id - Delete user

## Development

### Running Locally
\`\`\`bash
npm install
npm run migrate
npm run dev
\`\`\`

### Testing
\`\`\`bash
npm test
npm run test:e2e
\`\`\`

## Database

### Migrations
\`\`\`bash
npm run migrate:create
npm run migrate:run
npm run migrate:rollback
\`\`\`

### Seeding
\`\`\`bash
npm run seed
\`\`\`
`,

	frontend: `# Frontend Project

## Overview
React/Vue/Angular application for...

## Tech Stack
- Framework: React 18
- State: Redux/Zustand
- Styling: Tailwind CSS
- Testing: Jest + React Testing Library

## Component Structure

### Atomic Design
\`\`\`
components/
├── atoms/        # Basic elements (Button, Input)
├── molecules/    # Combinations (FormField, Card)
├── organisms/    # Complex components (Header, Sidebar)
├── templates/    # Page layouts
└── pages/        # Route components
\`\`\`

## State Management

### Global State
- User authentication
- Theme preferences
- Notifications

### Local State
- Form inputs
- UI toggles
- Component-specific data

## Styling

### Theme
- Use CSS variables for theming
- Support light/dark mode
- Responsive breakpoints: sm, md, lg, xl

### Conventions
- Use utility classes
- Component-scoped styles when needed
- Avoid inline styles

## Development

### Scripts
\`\`\`bash
npm run dev      # Start dev server
npm run build    # Production build
npm run test     # Run tests
npm run lint     # Lint code
npm run storybook # Component docs
\`\`\`

## Best Practices
- Keep components small and focused
- Use TypeScript for type safety
- Memoize expensive computations
- Lazy load routes and heavy components
`
};

// Register actions
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeMemory.createClaudeMd',
			title: localize('createClaudeMd', 'Create CLAUDE.md'),
			f1: true,
			icon: Codicon.newFile,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyM,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		const folders = workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			notificationService.notify({
				severity: Severity.Warning,
				message: localize('noWorkspace', 'No workspace folder open')
			});
			return;
		}

		// Select location
		const locationItems: IQuickPickItem[] = [
			{ label: 'Project Root', description: './CLAUDE.md', id: 'root' },
			{ label: 'Local Override', description: './CLAUDE.local.md (gitignored)', id: 'local' },
			{ label: '.claude Folder', description: './.claude/CLAUDE.md', id: 'dotclaude' },
		];

		const location = await quickInputService.pick(locationItems, {
			placeHolder: localize('selectLocation', 'Select location for CLAUDE.md'),
			title: localize('createClaudeMd', 'Create CLAUDE.md')
		});

		if (!location) {
			return;
		}

		// Select template
		const templateItems: IQuickPickItem[] = [
			{ label: 'Basic', description: 'Simple project overview', id: 'basic' },
			{ label: 'Detailed', description: 'Comprehensive project documentation', id: 'detailed' },
			{ label: 'API Project', description: 'REST API documentation', id: 'api' },
			{ label: 'Frontend Project', description: 'React/Vue/Angular project', id: 'frontend' },
			{ label: 'Empty', description: 'Start from scratch', id: 'empty' },
		];

		const template = await quickInputService.pick(templateItems, {
			placeHolder: localize('selectTemplate', 'Select template'),
			title: localize('createClaudeMd', 'Create CLAUDE.md')
		});

		if (!template) {
			return;
		}

		// Build file path
		const rootUri = folders[0].uri;
		let filePath: string;
		switch (location.id) {
			case 'local':
				filePath = 'CLAUDE.local.md';
				break;
			case 'dotclaude':
				filePath = '.claude/CLAUDE.md';
				// Create .claude directory if needed
				await fileService.createFolder(URI.joinPath(rootUri, '.claude'));
				break;
			default:
				filePath = 'CLAUDE.md';
		}

		const fileUri = URI.joinPath(rootUri, filePath);

		// Check if file exists
		const exists = await fileService.exists(fileUri);
		if (exists) {
			const overwrite = await quickInputService.pick(
				[{ label: 'Yes', id: 'yes' }, { label: 'No', id: 'no' }],
				{ placeHolder: localize('fileExists', 'File already exists. Overwrite?') }
			);
			if (overwrite?.id !== 'yes') {
				return;
			}
		}

		// Get template content
		const content = template.id === 'empty' ? '# Project\n\n' : CLAUDE_MD_TEMPLATES[template.id as keyof typeof CLAUDE_MD_TEMPLATES] || '';

		// Create file
		await fileService.writeFile(fileUri, new TextEncoder().encode(content));

		// Open in editor
		await editorService.openEditor({ resource: fileUri });

		notificationService.notify({
			severity: Severity.Info,
			message: localize('claudeMdCreated', 'Created {0}', filePath)
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeMemory.openProjectClaudeMd',
			title: localize('openProjectClaudeMd', 'Open Project CLAUDE.md'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);
		const commandService = accessor.get(ICommandService);

		const folders = workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return;
		}

		const rootUri = folders[0].uri;
		const fileUri = URI.joinPath(rootUri, 'CLAUDE.md');

		const exists = await fileService.exists(fileUri);
		if (!exists) {
			// Offer to create
			await commandService.executeCommand('claudeMemory.createClaudeMd');
			return;
		}

		await editorService.openEditor({ resource: fileUri });
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeMemory.openUserClaudeMd',
			title: localize('openUserClaudeMd', 'Open User CLAUDE.md'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const fileService = accessor.get(IFileService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		// User CLAUDE.md location
		const homeDir = process.env.HOME || process.env.USERPROFILE || '';
		const fileUri = URI.file(`${homeDir}/.claude/CLAUDE.md`);

		const exists = await fileService.exists(fileUri);
		if (!exists) {
			// Create directory and file
			const dirUri = URI.file(`${homeDir}/.claude`);
			try {
				await fileService.createFolder(dirUri);
			} catch { }

			const defaultContent = `# User Preferences

## Coding Style
- Preferred indentation:
- Max line length:
- Naming conventions:

## Common Patterns
- Error handling approach
- Logging preferences
- Testing philosophy

## Notes
Add any personal preferences that should apply to all projects.
`;
			await fileService.writeFile(fileUri, new TextEncoder().encode(defaultContent));
		}

		await editorService.openEditor({ resource: fileUri });
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeMemory.addToMemory',
			title: localize('addToMemory', 'Add Selection to CLAUDE.md'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const textFileService = accessor.get(ITextFileService);
		const notificationService = accessor.get(INotificationService);

		const editor = editorService.activeTextEditorControl;
		if (!editor) {
			return;
		}

		const model = (editor as any).getModel?.();
		const selection = (editor as any).getSelection?.();

		if (!model || !selection) {
			return;
		}

		const selectedText = model.getValueInRange(selection);
		if (!selectedText) {
			notificationService.notify({
				severity: Severity.Warning,
				message: localize('noSelection', 'No text selected')
			});
			return;
		}

		// Ask for section/note
		const note = await quickInputService.input({
			placeHolder: localize('addNote', 'Add a note or section header (optional)'),
			title: localize('addToMemory', 'Add to CLAUDE.md')
		});

		// Get CLAUDE.md path
		const folders = workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return;
		}

		const claudeMdUri = URI.joinPath(folders[0].uri, 'CLAUDE.md');
		const exists = await fileService.exists(claudeMdUri);

		let content = '';
		if (exists) {
			const file = await fileService.readFile(claudeMdUri);
			content = new TextDecoder().decode(file.value);
		}

		// Format the addition
		const fileName = model.uri.path.split('/').pop();
		const addition = note
			? `\n\n## ${note}\n\nFrom \`${fileName}\`:\n\`\`\`\n${selectedText}\n\`\`\`\n`
			: `\n\nFrom \`${fileName}\`:\n\`\`\`\n${selectedText}\n\`\`\`\n`;

		// Append to file
		await fileService.writeFile(claudeMdUri, new TextEncoder().encode(content + addition));

		notificationService.notify({
			severity: Severity.Info,
			message: localize('addedToMemory', 'Added to CLAUDE.md')
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeMemory.generateFromProject',
			title: localize('generateFromProject', 'Generate CLAUDE.md from Project'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		const commandService = accessor.get(ICommandService);

		notificationService.notify({
			severity: Severity.Info,
			message: localize('analyzing', 'Analyzing project structure...')
		});

		// This would use Claude to analyze the project and generate CLAUDE.md
		// For now, create with a template
		await commandService.executeCommand('claudeMemory.createClaudeMd');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeMemory.showMemory',
			title: localize('showMemory', 'Show Loaded Memory'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.view.extension.claudeMemory');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeMemory.insertSnippet',
			title: localize('insertSnippet', 'Insert Memory Snippet'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const editorService = accessor.get(IEditorService);

		const snippets: IQuickPickItem[] = [
			{ label: 'Tech Stack Section', id: 'tech-stack' },
			{ label: 'Directory Structure', id: 'directory' },
			{ label: 'Getting Started', id: 'getting-started' },
			{ label: 'Code Standards', id: 'code-standards' },
			{ label: 'API Endpoint', id: 'api-endpoint' },
			{ label: 'Component Pattern', id: 'component-pattern' },
			{ label: 'Testing Guidelines', id: 'testing' },
			{ label: 'Environment Variables', id: 'env-vars' },
		];

		const selected = await quickInputService.pick(snippets, {
			placeHolder: localize('selectSnippet', 'Select snippet to insert'),
			title: localize('insertSnippet', 'Insert Memory Snippet')
		});

		if (!selected) {
			return;
		}

		const snippetContent: Record<string, string> = {
			'tech-stack': `## Tech Stack
- **Language:**
- **Framework:**
- **Database:**
- **Testing:**
`,
			'directory': `## Directory Structure
\`\`\`
src/
├── components/
├── services/
├── utils/
└── types/
\`\`\`
`,
			'getting-started': `## Getting Started

### Prerequisites
- Node.js >= 18
- npm or yarn

### Installation
\`\`\`bash
npm install
npm run dev
\`\`\`
`,
			'code-standards': `## Code Standards

### Style
- Use 2-space indentation
- Maximum line length: 100
- Use TypeScript strict mode

### Naming
- Components: PascalCase
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
`,
			'api-endpoint': `### Endpoint: [METHOD] /path

**Request:**
\`\`\`json
{
  "field": "value"
}
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "data": {}
}
\`\`\`
`,
			'component-pattern': `### Component Pattern

\`\`\`typescript
interface Props {
  // Define props
}

export function ComponentName({ prop }: Props) {
  // Implementation
  return (
    <div>
      {/* JSX */}
    </div>
  );
}
\`\`\`
`,
			'testing': `## Testing

### Unit Tests
- Test all utility functions
- Mock external dependencies
- Aim for 80% coverage

### Integration Tests
- Test API endpoints
- Test component interactions

### Running Tests
\`\`\`bash
npm test
npm run test:coverage
\`\`\`
`,
			'env-vars': `## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| \`DATABASE_URL\` | Database connection string | Yes |
| \`API_KEY\` | External API key | Yes |
| \`DEBUG\` | Enable debug mode | No |
`
		};

		const content = snippetContent[selected.id!] || '';

		// Insert at cursor in active editor
		const editor = editorService.activeTextEditorControl;
		if (editor && (editor as any).executeEdits) {
			const selection = (editor as any).getSelection();
			(editor as any).executeEdits('snippet', [{
				range: selection,
				text: content,
				forceMoveMarkers: true
			}]);
		}
	}
});
