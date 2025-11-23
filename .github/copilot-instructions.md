# GitHub Copilot Instructions for Konnektr Graph Explorer

## Big Picture Architecture

- **Frontend:** React + TypeScript + Vite, modularized under `frontend/src/`.
- **State Management:** Zustand stores (see `src/stores/`). Query, connection, model, inspector, and workspace state are managed in separate stores.
- **Data Flow:** Queries are executed via `digitalTwinsClientFactory` (see `src/services/`). Results are transformed for table/graph views using utilities in `src/utils/`.
- **Views:** Query results support multiple modes (table, graph, raw) with smart view detection (`dataStructureDetector.ts`). Graph view uses Sigma.js and Graphology.
- **Authentication:** Pluggable provider system (Auth0, MSAL, generic OAuth) is planned. See `src/services/auth/` and environment variables for configuration.
- **Type Safety:** Strict TypeScript enforced. Never use `any`—prefer explicit interfaces (see `src/types/`).

## Developer Workflows

- **Start Dev Server:** `pnpm dev` (from `frontend/`)
- **Build:** `pnpm build` (TypeScript + Vite)
- **Lint:** `pnpm lint` (ESLint, strict rules)
- **Test:** `pnpm test` (Vitest)
- **Test Coverage:** `pnpm test:coverage`
- **Preview Build:** `pnpm preview`

## Project Conventions & Patterns

- **No direct API/database calls between components; all data flows through stores and services.**
- **All authentication/authorization is delegated to the Control Plane (KtrlPlane).**
- **Component structure:** UI components in `src/components/ui/`, query/table/graph in `src/components/query/` and `src/components/graph/`.
- **Query results:** Use `transformResultsToGraph` and `analyzeDataStructure` for result handling. Table views are modular (`table-views/`).
- **Type guards:** Use explicit type guards for Digital Twin and Relationship objects (see `queryResultsTransformer.ts`).
- **No mock data in production.** All mocks are being phased out in favor of real API calls.
- **Environment config:** Auth provider and API endpoints are set via `.env` and Vite env variables.

## Integration Points

- **External APIs:** Azure Digital Twins, Konnektr Graph, Auth0, MSAL, generic OAuth.
- **Graph Visualization:** Sigma.js, Graphology.
- **Editor:** Monaco Editor for Cypher/SQL queries.
- **Design System:** Shadcn/UI, Radix UI, TailwindCSS.

## Key Files & Directories

- `frontend/src/stores/` — Zustand state stores
- `frontend/src/services/` — API clients, auth providers
- `frontend/src/components/query/` — Query UI, results, table views
- `frontend/src/components/graph/` — Graph visualization
- `frontend/src/utils/` — Data transformation, type guards, helpers
- `frontend/src/types/` — TypeScript interfaces for twins, relationships, models

## Example Patterns

- **Query execution:**
  ```typescript
  const { executeQuery } = useQueryStore.getState();
  await executeQuery("MATCH (twin)-[rel]->(other)");
  ```
- **Graph transformation:**
  ```typescript
  import { transformResultsToGraph } from "@/utils/queryResultsTransformer";
  const graphData = transformResultsToGraph(results);
  ```
- **Table view selection:**
  ```typescript
  import { analyzeDataStructure } from "@/utils/dataStructureDetector";
  const viewMode = analyzeDataStructure(results).recommendedView;
  ```

---

**For more details, see:**

- `.github/PLATFORM_SCOPE.md` — Platform boundaries and scope
- `README.md` — Build/test/lint setup
- `DEVELOPMENT_PLAN.md` — Current priorities and architecture decisions

---

_If any section is unclear or missing, please provide feedback for further iteration._
