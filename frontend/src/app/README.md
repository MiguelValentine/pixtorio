# Application Modules

`App.tsx` composes the editor and owns document mutations, reversible commands,
gesture coordination and workspace state. These modules isolate responsibilities
that do not need the complete application closure.

- `editorTab.ts`: tab construction, thumbnail revisions, timeline normalization
  and history snapshots. Timeline state is restored together with document history.
- `recovery.ts`: strict recovery payload encoding and validation.
- `bridgeResponses.ts`: validation of untrusted project and raster bridge responses.
- `platformIO.ts`: native/browser clipboard routing, file selection, raster encoding
  and the local project codec endpoint. It does not mutate live documents.
- `localization.ts`: shared bilingual labels and status translation.
- `toolDefinitions.ts`: toolbar identity and icons.
- `useShortcuts.ts`: shortcut persistence, conflict handling and preference capture.
  Command execution stays in the application's exhaustive dispatcher.
- `workspaceGeometry.ts`: pure panel sizing and timeline scrolling calculations.
- `adjustmentState.ts`: adjustment draft types and defaults.
- `*Dialog.tsx`: controlled views. Draft setters update form state; apply and preview
  callbacks delegate document work to the application.

Do not import `App.tsx` from these modules. Tests for pure behavior should import
the owning module directly, so they do not initialize the full React application.
Keep pointer-frequency rendering in the frontend and preserve the strict v5
serialization boundary in the editor and Go packages.

Related editor boundaries:

- `canvasGeometry.ts` and `canvasRendering.ts` contain stateless canvas helpers.
- `tools/brush/` separates dynamics, geometry, rasterization and shared types.
- `selection.ts` exposes the selection API; implementation lives in
  `selectionTypes`, `selectionMask`, `selectionCreation`, `selectionPixels` and
  `selectionTransforms`. Implementations import one another directly, not the facade.
- `compositingPixels.ts` owns pure RGBA blend math. Document traversal and sibling
  stacking remain in `document.ts`.

When changing these boundaries, run type checking, the full Vitest suite and
Playwright interactions. Changes to project persistence also require Go tests.
