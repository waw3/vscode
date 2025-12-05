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
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { append, $, clearNode } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import {
	ISchemaProperty,
	PropertyType,
	PROPERTY_TYPES,
	BUILTIN_SCHEMAS,
	schemaToJsonSchema
} from '../claudeResponseFormat.contribution.js';

interface IPropertyUI extends ISchemaProperty {
	isExpanded: boolean;
	level: number;
}

export class ClaudeSchemaDesignerView extends ViewPane {

	private container!: HTMLElement;
	private schemaNameInput!: HTMLInputElement;
	private schemaDescInput!: HTMLInputElement;
	private propertiesContainer!: HTMLElement;
	private previewPanel!: HTMLElement;
	private properties: IPropertyUI[] = [];

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
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('claude-schema-designer-view');

		// Header
		const header = append(this.container, $('.schema-designer-header'));
		header.innerHTML = `
			<span class="codicon codicon-symbol-structure"></span>
			<span>${localize('schemaDesigner', 'Schema Designer')}</span>
		`;

		// Schema metadata
		const metaSection = append(this.container, $('.schema-meta-section'));

		const nameGroup = append(metaSection, $('.schema-field'));
		const nameLabel = append(nameGroup, $('label'));
		nameLabel.textContent = localize('schemaName', 'Schema Name');
		this.schemaNameInput = append(nameGroup, $('input.schema-input')) as HTMLInputElement;
		this.schemaNameInput.placeholder = 'my-response-schema';
		this.schemaNameInput.oninput = () => this.updatePreview();

		const descGroup = append(metaSection, $('.schema-field'));
		const descLabel = append(descGroup, $('label'));
		descLabel.textContent = localize('description', 'Description');
		this.schemaDescInput = append(descGroup, $('input.schema-input')) as HTMLInputElement;
		this.schemaDescInput.placeholder = localize('descPlaceholder', 'What this schema defines...');
		this.schemaDescInput.oninput = () => this.updatePreview();

		// Built-in schemas section
		const builtinSection = append(this.container, $('.schema-builtin-section'));
		const builtinHeader = append(builtinSection, $('.schema-section-header'));
		builtinHeader.innerHTML = `
			<span class="codicon codicon-library"></span>
			<span>${localize('builtinSchemas', 'Built-in Schemas')}</span>
		`;

		const builtinGrid = append(builtinSection, $('.schema-builtin-grid'));
		this.renderBuiltinSchemas(builtinGrid);

		// Properties toolbar
		const toolbar = append(this.container, $('.schema-properties-toolbar'));

		const addPropertyBtn = append(toolbar, $('button.schema-btn.primary'));
		addPropertyBtn.innerHTML = `<span class="codicon codicon-add"></span> ${localize('addProperty', 'Add Property')}`;
		addPropertyBtn.onclick = () => this.addProperty();

		const typeSelect = append(toolbar, $('select.schema-type-select')) as HTMLSelectElement;
		for (const [type, info] of Object.entries(PROPERTY_TYPES)) {
			const option = append(typeSelect, $('option')) as HTMLOptionElement;
			option.value = type;
			option.textContent = info.name;
		}

		// Properties container
		const propertiesSection = append(this.container, $('.schema-properties-section'));
		const propertiesHeader = append(propertiesSection, $('.schema-section-header'));
		propertiesHeader.innerHTML = `
			<span class="codicon codicon-list-tree"></span>
			<span>${localize('properties', 'Properties')}</span>
		`;

		this.propertiesContainer = append(propertiesSection, $('.schema-properties-list'));

		// JSON Schema preview
		this.previewPanel = append(this.container, $('.schema-preview-panel'));
		const previewHeader = append(this.previewPanel, $('.schema-preview-header'));
		previewHeader.innerHTML = `
			<span class="codicon codicon-json"></span>
			<span>${localize('jsonSchemaPreview', 'JSON Schema Preview')}</span>
			<button class="copy-btn"><span class="codicon codicon-copy"></span></button>
		`;

		previewHeader.querySelector('.copy-btn')?.addEventListener('click', () => this.copySchema());

		const previewContent = append(this.previewPanel, $('pre.schema-preview-content'));
		previewContent.textContent = '';

		// Actions
		const actions = append(this.container, $('.schema-designer-actions'));

		const saveBtn = append(actions, $('button.schema-btn.primary'));
		saveBtn.innerHTML = `<span class="codicon codicon-save"></span> ${localize('saveSchema', 'Save Schema')}`;
		saveBtn.onclick = () => this.saveSchema();

		const clearBtn = append(actions, $('button.schema-btn'));
		clearBtn.innerHTML = `<span class="codicon codicon-clear-all"></span> ${localize('clear', 'Clear')}`;
		clearBtn.onclick = () => this.clearSchema();

		const exportBtn = append(actions, $('button.schema-btn'));
		exportBtn.innerHTML = `<span class="codicon codicon-export"></span> ${localize('export', 'Export')}`;
		exportBtn.onclick = () => this.exportSchema();

		// Initialize
		this.renderProperties();
		this.updatePreview();
	}

	private renderBuiltinSchemas(container: HTMLElement): void {
		for (const schema of BUILTIN_SCHEMAS) {
			const card = append(container, $('.schema-builtin-card'));
			card.innerHTML = `
				<div class="schema-card-icon"><span class="codicon codicon-symbol-structure"></span></div>
				<div class="schema-card-info">
					<div class="schema-card-name">${schema.name}</div>
					<div class="schema-card-desc">${schema.description}</div>
					<div class="schema-card-meta">${schema.properties.length} properties</div>
				</div>
			`;

			card.onclick = () => this.loadBuiltinSchema(schema.id);
		}
	}

	private loadBuiltinSchema(id: string): void {
		const schema = BUILTIN_SCHEMAS.find(s => s.id === id);
		if (!schema) return;

		this.schemaNameInput.value = schema.name;
		this.schemaDescInput.value = schema.description;
		this.properties = schema.properties.map(p => ({
			...p,
			isExpanded: false,
			level: 0
		}));

		this.renderProperties();
		this.updatePreview();

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('schemaLoaded', 'Loaded: {0}', schema.name)
		});
	}

	private addProperty(parentIndex: number = -1, level: number = 0): void {
		const newProperty: IPropertyUI = {
			name: `property${this.properties.length + 1}`,
			type: 'string',
			description: '',
			required: false,
			isExpanded: true,
			level
		};

		if (parentIndex === -1) {
			this.properties.push(newProperty);
		} else {
			this.properties.splice(parentIndex + 1, 0, newProperty);
		}

		this.renderProperties();
		this.updatePreview();
	}

	private renderProperties(): void {
		clearNode(this.propertiesContainer);

		if (this.properties.length === 0) {
			const empty = append(this.propertiesContainer, $('.schema-properties-empty'));
			empty.innerHTML = `
				<span class="codicon codicon-symbol-structure"></span>
				<span>${localize('noProperties', 'No properties defined')}</span>
				<span class="hint">${localize('addPropertiesHint', 'Add properties to define your schema')}</span>
			`;
			return;
		}

		this.properties.forEach((prop, index) => {
			this.renderProperty(prop, index);
		});
	}

	private renderProperty(prop: IPropertyUI, index: number): void {
		const propEl = append(this.propertiesContainer, $('.schema-property'));
		propEl.style.marginLeft = `${prop.level * 20}px`;

		if (prop.isExpanded) {
			propEl.classList.add('expanded');
		}

		// Property header
		const header = append(propEl, $('.property-header'));

		// Type badge
		const typeInfo = PROPERTY_TYPES[prop.type];
		const typeBadge = append(header, $('.property-type-badge'));
		typeBadge.innerHTML = `<span class="codicon codicon-${typeInfo.icon}"></span>`;
		typeBadge.style.backgroundColor = `${typeInfo.color}20`;
		typeBadge.style.color = typeInfo.color;
		typeBadge.title = typeInfo.name;

		// Name input
		const nameInput = append(header, $('input.property-name')) as HTMLInputElement;
		nameInput.value = prop.name;
		nameInput.placeholder = 'property_name';
		nameInput.onchange = () => {
			prop.name = nameInput.value;
			this.updatePreview();
		};

		// Required toggle
		const requiredLabel = append(header, $('label.required-toggle'));
		const requiredCheck = append(requiredLabel, $('input')) as HTMLInputElement;
		requiredCheck.type = 'checkbox';
		requiredCheck.checked = prop.required;
		requiredCheck.onchange = () => {
			prop.required = requiredCheck.checked;
			this.updatePreview();
		};
		append(requiredLabel, $('span')).textContent = localize('required', 'Required');

		// Actions
		const actions = append(header, $('.property-actions'));

		const expandBtn = append(actions, $('button.property-action'));
		expandBtn.innerHTML = `<span class="codicon codicon-chevron-${prop.isExpanded ? 'up' : 'down'}"></span>`;
		expandBtn.onclick = () => {
			prop.isExpanded = !prop.isExpanded;
			this.renderProperties();
		};

		if (prop.type === 'object' || prop.type === 'array') {
			const addChildBtn = append(actions, $('button.property-action'));
			addChildBtn.innerHTML = '<span class="codicon codicon-add"></span>';
			addChildBtn.title = localize('addNestedProperty', 'Add nested property');
			addChildBtn.onclick = () => this.addProperty(index, prop.level + 1);
		}

		const deleteBtn = append(actions, $('button.property-action.danger'));
		deleteBtn.innerHTML = '<span class="codicon codicon-trash"></span>';
		deleteBtn.onclick = () => {
			this.properties.splice(index, 1);
			this.renderProperties();
			this.updatePreview();
		};

		// Property body (collapsible)
		if (prop.isExpanded) {
			const body = append(propEl, $('.property-body'));

			// Type selector
			const typeGroup = append(body, $('.property-field'));
			const typeLabel = append(typeGroup, $('label'));
			typeLabel.textContent = localize('type', 'Type');

			const typeSelect = append(typeGroup, $('select.property-select')) as HTMLSelectElement;
			for (const [type, info] of Object.entries(PROPERTY_TYPES)) {
				const option = append(typeSelect, $('option')) as HTMLOptionElement;
				option.value = type;
				option.textContent = info.name;
				if (type === prop.type) option.selected = true;
			}
			typeSelect.onchange = () => {
				prop.type = typeSelect.value as PropertyType;
				this.renderProperties();
				this.updatePreview();
			};

			// Description
			const descGroup = append(body, $('.property-field'));
			const descLabel = append(descGroup, $('label'));
			descLabel.textContent = localize('description', 'Description');

			const descInput = append(descGroup, $('input.property-input')) as HTMLInputElement;
			descInput.value = prop.description;
			descInput.placeholder = localize('descPlaceholder', 'Describe this property...');
			descInput.onchange = () => {
				prop.description = descInput.value;
				this.updatePreview();
			};

			// Type-specific options
			if (prop.type === 'string') {
				this.renderStringOptions(body, prop, index);
			} else if (prop.type === 'number') {
				this.renderNumberOptions(body, prop, index);
			}
		}
	}

	private renderStringOptions(container: HTMLElement, prop: IPropertyUI, _index: number): void {
		const optionsRow = append(container, $('.property-field-row'));

		// Enum values
		const enumGroup = append(optionsRow, $('.property-field'));
		const enumLabel = append(enumGroup, $('label'));
		enumLabel.textContent = localize('enumValues', 'Enum Values (comma-separated)');

		const enumInput = append(enumGroup, $('input.property-input')) as HTMLInputElement;
		enumInput.value = prop.enum?.join(', ') || '';
		enumInput.placeholder = 'value1, value2, value3';
		enumInput.onchange = () => {
			const values = enumInput.value.split(',').map(v => v.trim()).filter(v => v);
			prop.enum = values.length > 0 ? values : undefined;
			this.updatePreview();
		};

		// Pattern
		const patternGroup = append(optionsRow, $('.property-field'));
		const patternLabel = append(patternGroup, $('label'));
		patternLabel.textContent = localize('pattern', 'Regex Pattern');

		const patternInput = append(patternGroup, $('input.property-input')) as HTMLInputElement;
		patternInput.value = prop.pattern || '';
		patternInput.placeholder = '^[a-z]+$';
		patternInput.onchange = () => {
			prop.pattern = patternInput.value || undefined;
			this.updatePreview();
		};

		// Length constraints
		const lengthRow = append(container, $('.property-field-row'));

		const minLenGroup = append(lengthRow, $('.property-field'));
		const minLenLabel = append(minLenGroup, $('label'));
		minLenLabel.textContent = localize('minLength', 'Min Length');

		const minLenInput = append(minLenGroup, $('input.property-input')) as HTMLInputElement;
		minLenInput.type = 'number';
		minLenInput.value = prop.minLength !== undefined ? String(prop.minLength) : '';
		minLenInput.onchange = () => {
			prop.minLength = minLenInput.value ? parseInt(minLenInput.value) : undefined;
			this.updatePreview();
		};

		const maxLenGroup = append(lengthRow, $('.property-field'));
		const maxLenLabel = append(maxLenGroup, $('label'));
		maxLenLabel.textContent = localize('maxLength', 'Max Length');

		const maxLenInput = append(maxLenGroup, $('input.property-input')) as HTMLInputElement;
		maxLenInput.type = 'number';
		maxLenInput.value = prop.maxLength !== undefined ? String(prop.maxLength) : '';
		maxLenInput.onchange = () => {
			prop.maxLength = maxLenInput.value ? parseInt(maxLenInput.value) : undefined;
			this.updatePreview();
		};
	}

	private renderNumberOptions(container: HTMLElement, prop: IPropertyUI, _index: number): void {
		const constraintsRow = append(container, $('.property-field-row'));

		// Minimum
		const minGroup = append(constraintsRow, $('.property-field'));
		const minLabel = append(minGroup, $('label'));
		minLabel.textContent = localize('minimum', 'Minimum');

		const minInput = append(minGroup, $('input.property-input')) as HTMLInputElement;
		minInput.type = 'number';
		minInput.value = prop.minimum !== undefined ? String(prop.minimum) : '';
		minInput.onchange = () => {
			prop.minimum = minInput.value ? parseFloat(minInput.value) : undefined;
			this.updatePreview();
		};

		// Maximum
		const maxGroup = append(constraintsRow, $('.property-field'));
		const maxLabel = append(maxGroup, $('label'));
		maxLabel.textContent = localize('maximum', 'Maximum');

		const maxInput = append(maxGroup, $('input.property-input')) as HTMLInputElement;
		maxInput.type = 'number';
		maxInput.value = prop.maximum !== undefined ? String(prop.maximum) : '';
		maxInput.onchange = () => {
			prop.maximum = maxInput.value ? parseFloat(maxInput.value) : undefined;
			this.updatePreview();
		};
	}

	private updatePreview(): void {
		const previewContent = this.previewPanel.querySelector('.schema-preview-content');
		if (!previewContent) return;

		const schema = {
			id: `schema-${Date.now()}`,
			name: this.schemaNameInput.value || 'Untitled Schema',
			description: this.schemaDescInput.value,
			type: 'object' as const,
			properties: this.properties.filter(p => p.level === 0),
			required: this.properties.filter(p => p.level === 0 && p.required).map(p => p.name),
			examples: [],
			scope: 'user' as const,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		const jsonSchema = schemaToJsonSchema(schema);
		previewContent.textContent = JSON.stringify(jsonSchema, null, 2);
	}

	private copySchema(): void {
		const previewContent = this.previewPanel.querySelector('.schema-preview-content');
		if (previewContent && previewContent.textContent) {
			navigator.clipboard.writeText(previewContent.textContent);
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('schemaCopied', 'JSON Schema copied to clipboard')
			});
		}
	}

	private saveSchema(): void {
		const name = this.schemaNameInput.value.trim();

		if (!name) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('nameRequired', 'Schema name is required')
			});
			return;
		}

		if (this.properties.length === 0) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('noPropertiesToSave', 'Add at least one property')
			});
			return;
		}

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('schemaSaved', 'Schema saved: {0}', name)
		});
	}

	private clearSchema(): void {
		this.schemaNameInput.value = '';
		this.schemaDescInput.value = '';
		this.properties = [];
		this.renderProperties();
		this.updatePreview();
	}

	private exportSchema(): void {
		const previewContent = this.previewPanel.querySelector('.schema-preview-content');
		if (previewContent && previewContent.textContent) {
			// Create a download
			const blob = new Blob([previewContent.textContent], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${this.schemaNameInput.value || 'schema'}.json`;
			a.click();
			URL.revokeObjectURL(url);

			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('schemaExported', 'Schema exported')
			});
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
