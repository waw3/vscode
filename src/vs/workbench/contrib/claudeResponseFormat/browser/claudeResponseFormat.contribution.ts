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
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';

// Import views
import { ClaudeSchemaDesignerView } from './views/claudeSchemaDesignerView.js';
import { ClaudeTemplateEditorView } from './views/claudeTemplateEditorView.js';
import { ClaudeFormatValidatorView } from './views/claudeFormatValidatorView.js';

import './media/claudeResponseFormat.css';

// Types
export interface IResponseSchema {
	id: string;
	name: string;
	description: string;
	type: SchemaType;
	properties: ISchemaProperty[];
	required: string[];
	examples: string[];
	scope: 'project' | 'user' | 'builtin';
	createdAt: number;
	updatedAt: number;
}

export interface ISchemaProperty {
	name: string;
	type: PropertyType;
	description: string;
	required: boolean;
	enum?: string[];
	default?: any;
	items?: ISchemaProperty; // For arrays
	properties?: ISchemaProperty[]; // For objects
	format?: string; // date, email, uri, etc.
	pattern?: string; // Regex pattern
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
}

export type SchemaType = 'object' | 'array';
export type PropertyType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

export interface IResponseTemplate {
	id: string;
	name: string;
	description: string;
	format: TemplateFormat;
	template: string;
	schema?: IResponseSchema;
	placeholders: IPlaceholder[];
	scope: 'project' | 'user' | 'builtin';
	createdAt: number;
	updatedAt: number;
}

export interface IPlaceholder {
	name: string;
	description: string;
	type: PropertyType;
	defaultValue?: string;
}

export type TemplateFormat = 'json' | 'markdown' | 'yaml' | 'xml' | 'text' | 'csv';

export interface IValidationResult {
	valid: boolean;
	errors: IValidationError[];
	warnings: IValidationWarning[];
}

export interface IValidationError {
	path: string;
	message: string;
	expected?: string;
	actual?: string;
}

export interface IValidationWarning {
	path: string;
	message: string;
}

// Built-in schemas
export const BUILTIN_SCHEMAS: IResponseSchema[] = [
	{
		id: 'code-review-result',
		name: 'Code Review Result',
		description: 'Structured format for code review findings',
		type: 'object',
		properties: [
			{
				name: 'summary',
				type: 'string',
				description: 'Overall summary of the review',
				required: true
			},
			{
				name: 'score',
				type: 'number',
				description: 'Quality score from 1-10',
				required: true,
				minimum: 1,
				maximum: 10
			},
			{
				name: 'issues',
				type: 'array',
				description: 'List of issues found',
				required: true,
				items: {
					name: 'issue',
					type: 'object',
					description: 'Individual issue',
					required: true,
					properties: [
						{ name: 'severity', type: 'string', description: 'Issue severity', required: true, enum: ['critical', 'high', 'medium', 'low'] },
						{ name: 'line', type: 'number', description: 'Line number', required: false },
						{ name: 'message', type: 'string', description: 'Issue description', required: true },
						{ name: 'suggestion', type: 'string', description: 'How to fix', required: false }
					]
				}
			},
			{
				name: 'improvements',
				type: 'array',
				description: 'Suggested improvements',
				required: false,
				items: {
					name: 'improvement',
					type: 'string',
					description: 'Improvement suggestion',
					required: true
				}
			}
		],
		required: ['summary', 'score', 'issues'],
		examples: [],
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now()
	},
	{
		id: 'api-documentation',
		name: 'API Documentation',
		description: 'Structured API endpoint documentation',
		type: 'object',
		properties: [
			{
				name: 'endpoint',
				type: 'string',
				description: 'API endpoint path',
				required: true
			},
			{
				name: 'method',
				type: 'string',
				description: 'HTTP method',
				required: true,
				enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
			},
			{
				name: 'description',
				type: 'string',
				description: 'What this endpoint does',
				required: true
			},
			{
				name: 'parameters',
				type: 'array',
				description: 'Request parameters',
				required: false,
				items: {
					name: 'parameter',
					type: 'object',
					description: 'Parameter definition',
					required: true,
					properties: [
						{ name: 'name', type: 'string', description: 'Parameter name', required: true },
						{ name: 'type', type: 'string', description: 'Data type', required: true },
						{ name: 'required', type: 'boolean', description: 'Is required', required: true },
						{ name: 'description', type: 'string', description: 'Parameter description', required: true }
					]
				}
			},
			{
				name: 'response',
				type: 'object',
				description: 'Response format',
				required: true,
				properties: [
					{ name: 'status', type: 'number', description: 'HTTP status code', required: true },
					{ name: 'body', type: 'object', description: 'Response body schema', required: false }
				]
			},
			{
				name: 'examples',
				type: 'array',
				description: 'Usage examples',
				required: false,
				items: {
					name: 'example',
					type: 'object',
					description: 'Example request/response',
					required: true,
					properties: [
						{ name: 'request', type: 'string', description: 'Example request', required: true },
						{ name: 'response', type: 'string', description: 'Example response', required: true }
					]
				}
			}
		],
		required: ['endpoint', 'method', 'description', 'response'],
		examples: [],
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now()
	},
	{
		id: 'test-case',
		name: 'Test Case',
		description: 'Structured test case definition',
		type: 'object',
		properties: [
			{
				name: 'name',
				type: 'string',
				description: 'Test case name',
				required: true
			},
			{
				name: 'description',
				type: 'string',
				description: 'What this test verifies',
				required: true
			},
			{
				name: 'setup',
				type: 'string',
				description: 'Setup code or steps',
				required: false
			},
			{
				name: 'input',
				type: 'object',
				description: 'Test input data',
				required: true
			},
			{
				name: 'expectedOutput',
				type: 'object',
				description: 'Expected result',
				required: true
			},
			{
				name: 'assertions',
				type: 'array',
				description: 'Assertions to make',
				required: true,
				items: {
					name: 'assertion',
					type: 'string',
					description: 'Assertion statement',
					required: true
				}
			},
			{
				name: 'cleanup',
				type: 'string',
				description: 'Cleanup code or steps',
				required: false
			}
		],
		required: ['name', 'description', 'input', 'expectedOutput', 'assertions'],
		examples: [],
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now()
	},
	{
		id: 'error-analysis',
		name: 'Error Analysis',
		description: 'Structured error analysis and fix',
		type: 'object',
		properties: [
			{
				name: 'error',
				type: 'object',
				description: 'Error details',
				required: true,
				properties: [
					{ name: 'type', type: 'string', description: 'Error type', required: true },
					{ name: 'message', type: 'string', description: 'Error message', required: true },
					{ name: 'location', type: 'string', description: 'File and line', required: false }
				]
			},
			{
				name: 'rootCause',
				type: 'string',
				description: 'Root cause analysis',
				required: true
			},
			{
				name: 'fix',
				type: 'object',
				description: 'Proposed fix',
				required: true,
				properties: [
					{ name: 'description', type: 'string', description: 'Fix description', required: true },
					{ name: 'code', type: 'string', description: 'Fixed code', required: true },
					{ name: 'explanation', type: 'string', description: 'Why this fixes it', required: true }
				]
			},
			{
				name: 'prevention',
				type: 'array',
				description: 'How to prevent similar issues',
				required: false,
				items: {
					name: 'tip',
					type: 'string',
					description: 'Prevention tip',
					required: true
				}
			}
		],
		required: ['error', 'rootCause', 'fix'],
		examples: [],
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now()
	}
];

// Built-in templates
export const BUILTIN_TEMPLATES: IResponseTemplate[] = [
	{
		id: 'markdown-report',
		name: 'Markdown Report',
		description: 'Standard markdown report template',
		format: 'markdown',
		template: `# {{TITLE}}

## Summary
{{SUMMARY}}

## Details
{{DETAILS}}

## Recommendations
{{RECOMMENDATIONS}}

---
*Generated by Claude*`,
		placeholders: [
			{ name: 'TITLE', description: 'Report title', type: 'string' },
			{ name: 'SUMMARY', description: 'Executive summary', type: 'string' },
			{ name: 'DETAILS', description: 'Detailed findings', type: 'string' },
			{ name: 'RECOMMENDATIONS', description: 'Action items', type: 'string' }
		],
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now()
	},
	{
		id: 'json-response',
		name: 'JSON Response',
		description: 'Generic JSON response format',
		format: 'json',
		template: `{
  "status": "{{STATUS}}",
  "data": {{DATA}},
  "metadata": {
    "timestamp": "{{TIMESTAMP}}",
    "version": "{{VERSION}}"
  }
}`,
		placeholders: [
			{ name: 'STATUS', description: 'Response status', type: 'string', defaultValue: 'success' },
			{ name: 'DATA', description: 'Response data object', type: 'object' },
			{ name: 'TIMESTAMP', description: 'ISO timestamp', type: 'string' },
			{ name: 'VERSION', description: 'API version', type: 'string', defaultValue: '1.0' }
		],
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now()
	},
	{
		id: 'changelog-entry',
		name: 'Changelog Entry',
		description: 'Changelog entry in Keep a Changelog format',
		format: 'markdown',
		template: `## [{{VERSION}}] - {{DATE}}

### Added
{{ADDED}}

### Changed
{{CHANGED}}

### Fixed
{{FIXED}}

### Removed
{{REMOVED}}`,
		placeholders: [
			{ name: 'VERSION', description: 'Version number', type: 'string' },
			{ name: 'DATE', description: 'Release date (YYYY-MM-DD)', type: 'string' },
			{ name: 'ADDED', description: 'New features', type: 'string' },
			{ name: 'CHANGED', description: 'Changes to existing functionality', type: 'string' },
			{ name: 'FIXED', description: 'Bug fixes', type: 'string' },
			{ name: 'REMOVED', description: 'Removed features', type: 'string' }
		],
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now()
	},
	{
		id: 'csv-data',
		name: 'CSV Data Export',
		description: 'CSV formatted data output',
		format: 'csv',
		template: `{{HEADERS}}
{{ROWS}}`,
		placeholders: [
			{ name: 'HEADERS', description: 'Column headers', type: 'string' },
			{ name: 'ROWS', description: 'Data rows', type: 'string' }
		],
		scope: 'builtin',
		createdAt: Date.now(),
		updatedAt: Date.now()
	}
];

// Format info
export const FORMAT_INFO: Record<TemplateFormat, { name: string; icon: string; extension: string }> = {
	'json': { name: 'JSON', icon: 'json', extension: '.json' },
	'markdown': { name: 'Markdown', icon: 'markdown', extension: '.md' },
	'yaml': { name: 'YAML', icon: 'file-code', extension: '.yaml' },
	'xml': { name: 'XML', icon: 'file-code', extension: '.xml' },
	'text': { name: 'Plain Text', icon: 'file-text', extension: '.txt' },
	'csv': { name: 'CSV', icon: 'table', extension: '.csv' }
};

// Property type info
export const PROPERTY_TYPES: Record<PropertyType, { name: string; icon: string; color: string }> = {
	'string': { name: 'String', icon: 'symbol-string', color: '#10B981' },
	'number': { name: 'Number', icon: 'symbol-numeric', color: '#3B82F6' },
	'boolean': { name: 'Boolean', icon: 'symbol-boolean', color: '#F59E0B' },
	'object': { name: 'Object', icon: 'symbol-object', color: '#8B5CF6' },
	'array': { name: 'Array', icon: 'symbol-array', color: '#EC4899' },
	'null': { name: 'Null', icon: 'circle-slash', color: '#6B7280' }
};

// Register icons
const claudeResponseFormatIcon = registerIcon('claude-response-format', Codicon.output, localize('claudeResponseFormatIcon', 'Icon for Claude Response Format view container.'));

// Register view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.claudeResponseFormat',
	title: localize('claudeResponseFormat', 'Response Format'),
	icon: claudeResponseFormatIcon,
	order: 17,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.claudeResponseFormat', { mergeViewWithContainerWhenSingleView: false }]),
	storageId: 'workbench.view.claudeResponseFormat',
	hideIfEmpty: false,
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: false });

// Register views
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
	{
		id: 'claudeResponseFormat.schemaDesigner',
		name: localize('schemaDesigner', 'Schema Designer'),
		ctorDescriptor: new SyncDescriptor(ClaudeSchemaDesignerView),
		order: 1,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeResponseFormatIcon,
	},
	{
		id: 'claudeResponseFormat.templateEditor',
		name: localize('templateEditor', 'Template Editor'),
		ctorDescriptor: new SyncDescriptor(ClaudeTemplateEditorView),
		order: 2,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: false,
		containerIcon: claudeResponseFormatIcon,
	},
	{
		id: 'claudeResponseFormat.validator',
		name: localize('validator', 'Format Validator'),
		ctorDescriptor: new SyncDescriptor(ClaudeFormatValidatorView),
		order: 3,
		canToggleVisibility: true,
		canMoveView: true,
		collapsed: true,
		containerIcon: claudeResponseFormatIcon,
	}
], VIEW_CONTAINER);

// Register actions
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeResponseFormat.createSchema',
			title: localize('createSchema', 'Create Response Schema'),
			f1: true,
			icon: Codicon.add,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		const name = await quickInputService.input({
			placeHolder: localize('schemaName', 'Schema name'),
			title: localize('createSchema', 'Create Response Schema')
		});

		if (!name) return;

		notificationService.notify({
			severity: Severity.Info,
			message: localize('schemaCreated', 'Opening Schema Designer for: {0}', name)
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'claudeResponseFormat.createTemplate',
			title: localize('createTemplate', 'Create Response Template'),
			f1: true,
			icon: Codicon.add,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		const formatItems = Object.entries(FORMAT_INFO).map(([id, info]) => ({
			label: `$(${info.icon}) ${info.name}`,
			id
		}));

		const format = await quickInputService.pick(formatItems, {
			placeHolder: localize('selectFormat', 'Select output format'),
			title: localize('createTemplate', 'Create Response Template')
		});

		if (!format) return;

		notificationService.notify({
			severity: Severity.Info,
			message: localize('templateCreated', 'Opening Template Editor for {0} format', FORMAT_INFO[format.id as TemplateFormat].name)
		});
	}
});

// Helper functions
export function schemaToJsonSchema(schema: IResponseSchema): object {
	const jsonSchema: any = {
		$schema: 'http://json-schema.org/draft-07/schema#',
		title: schema.name,
		description: schema.description,
		type: schema.type,
		properties: {},
		required: schema.required
	};

	for (const prop of schema.properties) {
		jsonSchema.properties[prop.name] = propertyToJsonSchema(prop);
	}

	return jsonSchema;
}

function propertyToJsonSchema(prop: ISchemaProperty): object {
	const schema: any = {
		type: prop.type,
		description: prop.description
	};

	if (prop.enum) schema.enum = prop.enum;
	if (prop.default !== undefined) schema.default = prop.default;
	if (prop.format) schema.format = prop.format;
	if (prop.pattern) schema.pattern = prop.pattern;
	if (prop.minimum !== undefined) schema.minimum = prop.minimum;
	if (prop.maximum !== undefined) schema.maximum = prop.maximum;
	if (prop.minLength !== undefined) schema.minLength = prop.minLength;
	if (prop.maxLength !== undefined) schema.maxLength = prop.maxLength;

	if (prop.type === 'array' && prop.items) {
		schema.items = propertyToJsonSchema(prop.items);
	}

	if (prop.type === 'object' && prop.properties) {
		schema.properties = {};
		for (const subProp of prop.properties) {
			schema.properties[subProp.name] = propertyToJsonSchema(subProp);
		}
	}

	return schema;
}

export function validateAgainstSchema(data: any, schema: IResponseSchema): IValidationResult {
	const errors: IValidationError[] = [];
	const warnings: IValidationWarning[] = [];

	// Check required fields
	for (const required of schema.required) {
		if (data[required] === undefined) {
			errors.push({
				path: required,
				message: `Missing required field: ${required}`,
				expected: 'defined',
				actual: 'undefined'
			});
		}
	}

	// Validate each property
	for (const prop of schema.properties) {
		if (data[prop.name] !== undefined) {
			validateProperty(data[prop.name], prop, prop.name, errors, warnings);
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings
	};
}

function validateProperty(
	value: any,
	prop: ISchemaProperty,
	path: string,
	errors: IValidationError[],
	warnings: IValidationWarning[]
): void {
	const actualType = Array.isArray(value) ? 'array' : typeof value;

	if (prop.type !== actualType && !(prop.type === 'null' && value === null)) {
		errors.push({
			path,
			message: `Type mismatch`,
			expected: prop.type,
			actual: actualType
		});
		return;
	}

	// String validations
	if (prop.type === 'string' && typeof value === 'string') {
		if (prop.minLength !== undefined && value.length < prop.minLength) {
			errors.push({
				path,
				message: `String too short`,
				expected: `>= ${prop.minLength} characters`,
				actual: `${value.length} characters`
			});
		}
		if (prop.maxLength !== undefined && value.length > prop.maxLength) {
			errors.push({
				path,
				message: `String too long`,
				expected: `<= ${prop.maxLength} characters`,
				actual: `${value.length} characters`
			});
		}
		if (prop.pattern) {
			const regex = new RegExp(prop.pattern);
			if (!regex.test(value)) {
				errors.push({
					path,
					message: `Does not match pattern`,
					expected: prop.pattern,
					actual: value
				});
			}
		}
		if (prop.enum && !prop.enum.includes(value)) {
			errors.push({
				path,
				message: `Value not in allowed list`,
				expected: prop.enum.join(', '),
				actual: value
			});
		}
	}

	// Number validations
	if (prop.type === 'number' && typeof value === 'number') {
		if (prop.minimum !== undefined && value < prop.minimum) {
			errors.push({
				path,
				message: `Value below minimum`,
				expected: `>= ${prop.minimum}`,
				actual: String(value)
			});
		}
		if (prop.maximum !== undefined && value > prop.maximum) {
			errors.push({
				path,
				message: `Value above maximum`,
				expected: `<= ${prop.maximum}`,
				actual: String(value)
			});
		}
	}

	// Array validations
	if (prop.type === 'array' && Array.isArray(value) && prop.items) {
		value.forEach((item, index) => {
			validateProperty(item, prop.items!, `${path}[${index}]`, errors, warnings);
		});
	}

	// Object validations
	if (prop.type === 'object' && typeof value === 'object' && prop.properties) {
		for (const subProp of prop.properties) {
			if (subProp.required && value[subProp.name] === undefined) {
				errors.push({
					path: `${path}.${subProp.name}`,
					message: `Missing required field`,
					expected: 'defined',
					actual: 'undefined'
				});
			}
			if (value[subProp.name] !== undefined) {
				validateProperty(value[subProp.name], subProp, `${path}.${subProp.name}`, errors, warnings);
			}
		}
	}
}
