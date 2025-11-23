# Konnektr Graph Explorer Frontend

> **A unified frontend for managing, querying, and visualizing digital twin data in Konnektr Graph and Azure Digital Twins.**

---

## Overview

Konnektr Graph Explorer is a modern, TypeScript/React-based web application for:

- Connecting to Konnektr Graph (PostgreSQL + Apache AGE) or Azure Digital Twins
- Running Cypher/SQL queries and exploring results in table or graph views
- Visualizing digital twin graphs interactively (Sigma.js, Graphology)
- Inspecting twins, relationships, and models with rich UI panels
- Managing connections, models, and workspace state
- Supporting multiple authentication providers (Auth0, MSAL, generic OAuth)

This frontend is shared across Konnektr platform deployments and can be used for both hosted and self-hosted backends.

---

## Key Features

- **Multi-backend support:** Connect to Konnektr Graph or Azure Digital Twins
- **Query editor:** Monaco-powered editor with Cypher/SQL syntax highlighting
- **Table & graph views:** Smart view detection, advanced table modes, interactive graph visualization
- **Inspector system:** Click-to-inspect twins, relationships, and models
- **Authentication:** Pluggable provider system (Auth0, MSAL, OAuth)
- **State management:** Modular Zustand stores for queries, connections, models, inspector, workspace
- **Type safety:** Strict TypeScript, no `any` types allowed
- **Export & history:** Query history, result export, and workspace management

---

## Developer Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```
2. **Start dev server:**
   ```bash
   pnpm dev
   ```
3. **Build for production:**
   ```bash
   pnpm build
   ```
4. **Run tests:**
   ```bash
   pnpm test
   ```
5. **Lint code:**
   ```bash
   pnpm lint
   ```
6. **Preview build:**
   ```bash
   pnpm preview
   ```

---

## Integration Points

- **Konnektr Graph API:** ADT-compatible REST API, Cypher queries, DTDL models
- **Azure Digital Twins:** Full compatibility via Azure SDKs
- **Authentication:** Auth0, MSAL, generic OAuth (runtime selection via env vars)
- **Graph Visualization:** Sigma.js, Graphology
- **Design System:** Shadcn/UI, Radix UI, TailwindCSS

---

## File Structure Highlights

- `frontend/src/stores/` — Zustand state stores
- `frontend/src/services/` — API clients, auth providers
- `frontend/src/components/query/` — Query UI, results, table views
- `frontend/src/components/graph/` — Graph visualization
- `frontend/src/utils/` — Data transformation, type guards, helpers
- `frontend/src/types/` — TypeScript interfaces for twins, relationships, models

---

## Development Notes

This project uses React + TypeScript + Vite. See `vite.config.ts` and `eslint.config.js` for build and lint configuration. For advanced ESLint/type-aware rules, see the [Vite + ESLint documentation](https://vitejs.dev/guide/#eslint) and [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x).

---

## Documentation & Support

- [Konnektr Graph Docs](https://docs.konnektr.io/docs/graph/)
- [Platform Scope](.github/PLATFORM_SCOPE.md)
- [Development Plan](.github/DEVELOPMENT_PLAN.md)

---

## License

Apache License 2.0
