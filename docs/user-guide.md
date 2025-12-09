# Konnektr Graph Explorer - User Guide

> **A comprehensive guide to using Konnektr Graph Explorer for managing and visualizing your digital twin data**

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [User Interface Overview](#user-interface-overview)
4. [Authentication](#authentication)
5. [Connection Management](#connection-management)
6. [Working with Models](#working-with-models)
7. [Querying Digital Twins](#querying-digital-twins)
8. [Data Visualization](#data-visualization)
9. [Inspector Panel](#inspector-panel)
10. [Creating and Managing Digital Twins](#creating-and-managing-digital-twins)
11. [Working with Relationships](#working-with-relationships)
12. [Best Practices](#best-practices)
13. [Troubleshooting](#troubleshooting)

---

## Introduction

Konnektr Graph Explorer is a powerful web-based application for managing, querying, and visualizing digital twin data. It supports:

- **Konnektr Graph** (PostgreSQL + Apache AGE backend)
- **Azure Digital Twins** instances

Whether you're exploring IoT data, managing building information, or working with complex digital twin relationships, Graph Explorer provides an intuitive interface for all your needs.

### Key Features

- 🔍 **Powerful Query Editor** - Write Cypher/SQL queries with syntax highlighting
- 📊 **Multiple Visualization Modes** - Table, graph, and raw JSON views
- 🔗 **Relationship Management** - Create, view, and delete twin relationships
- 🏗️ **DTDL Model Support** - Import, browse, and manage Digital Twin Definition Language models
- 👁️ **Inspector Panel** - Deep dive into twins, relationships, and models
- 🔐 **Flexible Authentication** - Support for KtrlPlane, MSAL, and Auth0
- 💾 **Query History** - Track and reuse previous queries

---

## Getting Started

### Prerequisites

To use Graph Explorer, you need:

1. Access to a **Konnektr Graph instance** or **Azure Digital Twins instance**
2. Valid credentials (varies by connection type)
3. A modern web browser (Chrome, Firefox, Edge, Safari)

### First Launch

1. Open Graph Explorer in your browser
2. You'll see the main interface with three panels:
   - **Left Panel**: Models sidebar
   - **Center Panel**: Query explorer
   - **Right Panel**: Inspector (initially hidden)

---

## User Interface Overview

### Header Bar

The header contains essential controls:

- **Konnektr Graph Logo** - Brand identifier
- **Connection Selector** - Switch between different Graph instances
- **Theme Toggle** - Switch between light and dark modes
- **User Menu** - Sign in/out and account settings

### Panel Layout

The application uses a resizable three-panel layout:

1. **Left Panel (Models)** - Browse DTDL models in a tree structure
2. **Center Panel (Query)** - Write and execute queries, view results
3. **Right Panel (Inspector)** - Detailed view of selected items

**Toggle Panels:**

- Click the panel icons in the header to show/hide left or right panels
- Drag panel edges to resize

---

## Authentication

Graph Explorer supports multiple authentication methods:

### KtrlPlane Platform Authentication

If you have a Konnektr Platform account:

1. Click **Sign In** in the header
2. Log in with your KtrlPlane credentials
3. Your managed Graph resources will appear automatically in the connection selector

**Benefits:**

- Automatic resource discovery
- Centralized access management
- No manual configuration needed

### Connection-Specific Authentication

For custom or Azure Digital Twins connections, choose:

**1. None (No Authentication)**

- For local or open endpoints
- No credentials required

**2. MSAL (Microsoft Authentication Library)**

- For Azure Digital Twins instances
- Requires:
  - Client ID
  - Tenant ID
  - Scopes (typically: `https://digitaltwins.azure.net/.default`)

**3. Auth0**

- For custom Konnektr Graph instances
- Requires:
  - Domain
  - Client ID
  - Audience
  - Scopes

---

## Connection Management

### Viewing Connections

Click the **Connection Selector** in the header to see:

- **Managed Connections** (KtrlPlane-managed resources) - marked with a cloud icon
- **Local Connections** (manually configured) - stored in browser

### Adding a Custom Connection

1. Click the **Connection Selector** dropdown
2. Click **+ Add Connection**
3. Choose between:
   - **Deploy on KtrlPlane** - Create a managed Graph instance
   - **Custom Connection** - Configure your own endpoint

#### Custom Connection Setup

1. Select **Custom Connection**
2. Fill in the form:

   - **Connection Name** - A friendly name (e.g., "Production Graph")
   - **ADT Host** - The Graph API endpoint URL
   - **Description** - Optional description
   - **Auth Provider** - Choose authentication method
   - **Auth Configuration** - Provider-specific credentials

3. Click **Add Connection**

### Switching Connections

1. Open the **Connection Selector**
2. Click on the connection you want to use
3. The app will connect and load available models

### Editing Connections

1. Select the connection you want to edit
2. Click the **three-dot menu** (⋮) next to the connection selector
3. Select **Edit Connection**
4. Update details and click **Save**

**Note:** KtrlPlane-managed connections cannot be edited in Graph Explorer. Manage them through the KtrlPlane dashboard.

### Deleting Connections

1. Select the connection to delete
2. Click the **three-dot menu** (⋮)
3. Select **Delete Connection**
4. Confirm deletion

**Note:** This only removes the connection from Graph Explorer. It doesn't delete the actual Graph instance.

### Refreshing Managed Connections

If you've created new resources in KtrlPlane:

1. Click the **three-dot menu** (⋮) next to the connection selector
2. Select **Refresh**
3. New resources will appear in the list

---

## Working with Models

DTDL (Digital Twin Definition Language) models define the structure and properties of your digital twins.

### Model Sidebar

The left panel displays your models in a hierarchical tree:

- **Tree Structure** - Models that extend others are shown as children
- **Twin Count Badge** - Shows how many twins use each model
- **Action Buttons** - Quick create and delete actions

### Viewing Model Details

1. Click on a model in the tree
2. The **Inspector Panel** (right) will display:
   - Model ID and display name
   - Description
   - Extended models
   - Properties with types
   - Relationship definitions
   - Component definitions

### Importing Models

#### Method 1: Paste JSON

1. Click the **+ Import** button in the Models panel
2. Select **Paste JSON** tab
3. Paste your DTDL JSON:
   - Single model: `{ "@id": "dtmi:...", ... }`
   - Multiple models: `[{ "@id": "dtmi:..." }, ...]`
4. Click **Import**

#### Method 2: Upload Files

1. Click the **+ Import** button
2. Select **Upload Files** tab
3. Either:
   - Click **Browse Files** to select `.json` files
   - Drag and drop `.json` files into the upload area
4. Click **Import**

**Supported Formats:**

- Single DTDL model JSON files
- Array of models in one JSON file
- Multiple individual JSON files

### Searching Models

Use the search box at the top of the Models panel to filter:

- Model IDs
- Display names
- The search updates results in real-time

### Deleting Models

1. Hover over the model in the tree
2. Click the **trash icon** (🗑️)
3. Confirm deletion

**Warning:** Deleting a model doesn't automatically delete twins using that model. Ensure no twins reference the model first.

---

## Querying Digital Twins

The query interface is the primary way to interact with your digital twin data.

### Query Editor

The center panel contains a **Monaco-powered code editor** with:

- **Syntax highlighting** for Cypher/SQL
- **Line numbers** and **auto-indentation**
- **Code folding** for complex queries
- **Bracket matching**

### Writing Queries

#### Cypher Query Examples (Konnektr Graph)

**Get all twins:**

```cypher
MATCH (twin) RETURN twin
```

**Get twins by model:**

```cypher
MATCH (twin) WHERE twin.$metadata.$model = 'dtmi:example:Building;1' RETURN twin
```

**Get twins with relationships:**

```cypher
MATCH (source)-[rel]->(target) RETURN source, rel, target
```

**Filter by property:**

```cypher
MATCH (twin) WHERE twin.temperature > 25 RETURN twin
```

#### SQL Query Examples (Azure Digital Twins)

**Get all twins:**

```sql
SELECT * FROM DIGITALTWINS
```

**Get twins by model:**

```sql
SELECT * FROM DIGITALTWINS WHERE IS_OF_MODEL('dtmi:example:Building;1')
```

**Get relationships:**

```sql
SELECT source, relationship, target
FROM DIGITALTWINS source
JOIN relationship ON source.$dtId = relationship.$sourceId
JOIN target ON relationship.$targetId = target.$dtId
```

### Running Queries

1. Type or paste your query in the editor
2. Click the **Run Query** button (or press keyboard shortcut)
3. View results in the panel below

The query will execute against your currently selected connection.

### Query History

Track your past queries:

1. Click the **History** button in the query toolbar
2. A side panel shows recent queries
3. Click any query to load it into the editor

**History Features:**

- Saved automatically
- Persists across sessions
- Shows timestamp and result count
- One-click reload

### Exporting Results

To export query results:

1. Run a query
2. View results in table mode
3. Click the **Download** button (⬇️) in the results header
4. Results are exported as CSV

---

## Data Visualization

Graph Explorer provides three ways to view query results:

### 1. Table View

The default view displays results in a structured table.

**View Mode Options:**

Click the view switcher to choose:

- **Table Icon** - Table view
- **Network Icon** - Graph view
- **Eye Icon** - Raw JSON view

**Column Display Modes:**

- **Display Names** (💬) - Show human-readable property names from DTDL
- **Raw Names** (</>) - Show actual JSON property names

**Table Layout Modes:**

For queries with nested data (twins + relationships), choose:

1. **Simple Table** (📊)

   - Default flat table
   - Nested objects shown as JSON

2. **Grouped Columns** (📂)

   - Expandable column groups
   - Click headers to expand/collapse entities

3. **Flat Columns** (📃)

   - All properties flattened
   - Naming: `entity.property`

4. **Expandable Rows** (📋)
   - Click rows to expand nested data
   - Clean initial view

**Interacting with Tables:**

- **Click rows** - Select and inspect items
- **Pagination** - Use arrows to navigate pages (50 rows per page)
- **Scroll** - Horizontally and vertically as needed

### 2. Graph View

Visualize relationships as an interactive network:

**Features:**

- **Nodes** - Digital twins colored by model type
- **Edges** - Relationships connecting twins
- **Interactive** - Click nodes to inspect
- **Auto-layout** - Circular arrangement

**Best For:**

- Understanding relationships
- Network topology
- Connected systems

**Using Graph View:**

1. Run a query that returns relationships
2. Switch to **Graph View** (network icon)
3. Click nodes to open in Inspector

### 3. Raw View

See the unprocessed JSON response:

- Useful for debugging
- Copy data for external use
- Verify exact structure

---

## Inspector Panel

The Inspector provides detailed information about selected items.

### Opening the Inspector

The Inspector opens automatically when you:

- Click a row in table view
- Click a node in graph view
- Select a model in the sidebar

If hidden, click the **panel icon** in the header to show it.

### Twin Inspector

When inspecting a digital twin:

**Identity Section:**

- Twin ID
- Model ID with display name
- Metadata (ETag, upload time)

**Properties Section:**

- All twin properties
- Editable inline (click value to edit)
- Type indicators
- Required/optional markers

**Relationships Section:**

- **Outgoing** - Relationships from this twin
- **Incoming** - Relationships to this twin
- Click relationship to inspect it
- Click target twin to navigate

**Actions:**

- **Create Relationship** - Add new relationships
- **Edit Properties** - Update twin data
- **Delete Relationship** - Remove connections

### Relationship Inspector

When inspecting a relationship:

**Identity Section:**

- Relationship ID
- Relationship type/name

**Connection Details:**

- Source twin (clickable)
- Target twin (clickable)
- Visual arrow showing direction

**Properties Section:**

- Custom relationship properties
- Property values

**Navigation:**

- Click source or target twin IDs to jump to that twin

### Model Inspector

When inspecting a model:

**Definition Section:**

- Model ID
- Display name (localized if available)
- Description

**Extends Section:**

- Parent models (if any)
- Inheritance chain

**Contents Section:**

- **Properties** - Data fields with types and schemas
- **Relationships** - Allowed relationship types and targets
- **Components** - Nested components
- **Telemetry** - Telemetry definitions (if applicable)

**Each content item shows:**

- Name and display name
- Type (Property, Relationship, Component, Telemetry)
- Schema/data type
- Description

---

## Creating and Managing Digital Twins

### Creating a Twin

#### From Model Sidebar

1. Hover over a model in the Models panel
2. Click the **+ Create Twin** icon (next to the twin count badge)
3. In the dialog:
   - **Twin ID** - Enter a unique ID (or leave blank for auto-generation)
4. Click **Create**

The new twin is created and opens in the Inspector.

#### Setting Properties

After creating a twin:

1. Open it in the Inspector
2. Click on any property value
3. Edit the value
4. Press Enter or click outside to save

**Property Editing:**

- Type-aware input fields
- Validation based on DTDL schema
- Required properties marked
- Changes save immediately

### Updating Twin Properties

1. Select a twin (from query results or inspector)
2. In the Inspector, click any property value
3. Edit and save

**Supported Types:**

- Strings
- Numbers
- Booleans (true/false)
- Dates
- Objects (edit as JSON)
- Arrays (edit as JSON)

### Deleting Twins

Currently, twin deletion is done via query:

```cypher
DELETE FROM DIGITALTWINS WHERE $dtId = 'your-twin-id'
```

---

## Working with Relationships

Relationships connect digital twins to form a graph structure.

### Viewing Relationships

**Option 1: Query Results**

Run a query that includes relationships:

```cypher
MATCH (source)-[rel]->(target) RETURN source, rel, target
```

**Option 2: Twin Inspector**

1. Select a twin
2. In the Inspector, scroll to **Relationships**
3. View:
   - **Outgoing** relationships (this twin → others)
   - **Incoming** relationships (others → this twin)

### Creating a Relationship

1. Open a twin in the Inspector
2. Scroll to the **Relationships** section
3. Click **+ Create Relationship**
4. In the dialog:
   - **Relationship Type** - Choose from model-defined relationships
   - **Target Twin** - Search for and select target twin
5. Click **Create**

**Target Twin Search:**

- Type to search by twin ID, name, or display name
- If relationship has a target model constraint, results are automatically filtered
- Select from dropdown

The new relationship appears in the twin's relationship list.

### Deleting a Relationship

1. Open a twin in the Inspector
2. Find the relationship in the **Relationships** section
3. Click the **delete icon** (🗑️) next to the relationship
4. Confirm deletion

---

## Best Practices

### Query Performance

1. **Use filters early** - Add WHERE clauses to reduce result sets
2. **Limit results** - Use `TOP (n)` or `LIMIT` for large datasets
3. **Index properties** - Ensure frequently queried properties are indexed (backend configuration)
4. **Avoid SELECT \*** - Specify needed columns

### Model Management

1. **Use clear naming** - Choose descriptive model IDs and display names
2. **Add descriptions** - Document models for other users
3. **Version models** - Include version numbers in model IDs (e.g., `;1`, `;2`)
4. **Test before production** - Validate models before creating twins

### Connection Security

1. **Use HTTPS** - Always connect to secure endpoints
2. **Rotate credentials** - Regularly update authentication tokens
3. **Limit scopes** - Only request necessary permissions
4. **Sign out when done** - Use Sign Out button for shared machines

### Data Organization

1. **Consistent naming** - Use a naming convention for twin IDs
2. **Meaningful properties** - Name properties clearly
3. **Relationship clarity** - Use descriptive relationship names
4. **Model hierarchy** - Use `extends` for model reusability

---

## Troubleshooting

### Connection Issues

**Problem:** "Failed to connect to endpoint"

**Solutions:**

- Verify the endpoint URL is correct
- Check your authentication credentials
- Ensure the Graph instance is running
- Check network connectivity and firewalls

---

**Problem:** "Authentication failed"

**Solutions:**

- Re-enter credentials in connection settings
- Verify you have correct permissions
- Check token expiration (try signing out and back in)
- For KtrlPlane connections, refresh the connection list

---

### Query Errors

**Problem:** "Query syntax error"

**Solutions:**

- Verify query syntax (Cypher for Konnektr Graph, SQL for Azure Digital Twins)
- Check for typos in property names
- Ensure model IDs are quoted and complete
- Review query examples in this guide

---

**Problem:** "No results returned"

**Solutions:**

- Verify twins exist matching your query
- Check filter conditions
- Try a simpler query first (e.g., `SELECT * FROM DIGITALTWINS`)
- Confirm correct connection is selected

---

### Model Import Issues

**Problem:** "Model import failed"

**Solutions:**

- Validate JSON syntax (use a JSON validator)
- Ensure DTDL schema is correct
- Check for missing required fields (`@id`, `@type`, `@context`)
- Verify model dependencies are already imported

---

### Inspector Not Updating

**Problem:** Inspector shows stale data

**Solutions:**

- Re-run the query to fetch fresh data
- Deselect and reselect the item
- Refresh the page if necessary

---

### Performance Issues

**Problem:** Slow query execution or UI freezing

**Solutions:**

- Reduce query result size (use LIMIT or TOP)
- Close unnecessary panels
- Clear browser cache
- Simplify complex queries
- Check backend performance

---

## Keyboard Shortcuts

| Action             | Shortcut                                   |
| ------------------ | ------------------------------------------ |
| Run Query          | `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac) |
| Focus Query Editor | `Ctrl+K` (Windows) / `Cmd+K` (Mac)         |
| Toggle Theme       | Click moon/sun icon                        |

---

## Additional Resources

- **DTDL Specification**: [https://github.com/Azure/opendigitaltwins-dtdl](https://github.com/Azure/opendigitaltwins-dtdl)
- **Konnektr Documentation**: [https://docs.konnektr.io](https://docs.konnektr.io)
- **Azure Digital Twins Query Language**: [Microsoft Docs](https://learn.microsoft.com/en-us/azure/digital-twins/concepts-query-language)
- **Apache AGE Cypher**: [Apache AGE Documentation](https://age.apache.org/)

---

## Support

For technical support or questions:

- **KtrlPlane Users**: Contact support through your KtrlPlane dashboard
- **Community**: GitHub Issues for bug reports and feature requests
- **Documentation**: Check the latest docs at [docs.konnektr.io/graph-explorer](https://docs.konnektr.io)

---

## Version Information

This guide is current as of **December 2025**.

For the latest updates and features, check the [GitHub repository](https://github.com/konnektr-io/graph-explorer).

---

_Happy exploring! 🚀_
