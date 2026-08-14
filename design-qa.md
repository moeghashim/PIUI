# Codex-inspired redesign QA

## Evidence

- Source visual truth: `/tmp/piui-codex-reference-screen-2.png`
- Normalized source: `/tmp/piui-codex-reference-normalized.png`
- Implementation: `docs/qa/piui/codex-dark-desktop.png`
- Mobile implementation: `docs/qa/piui/codex-dark-mobile.png`
- Intermediate-width implementation: `docs/qa/piui/codex-dark-narrow.png`
- Folder-picker reference: `/var/folders/7n/jwn8cbhx0cj313yjrqnsj7sw0000gn/T/codex-clipboard-ead85fac-26de-4107-9755-e7131b8ae089.png`
- Folder-picker implementation: `docs/qa/piui/folder-picker-desktop.png`
- Folder-picker normalized comparison: `/tmp/piui-folder-picker-comparison.png`
- Model catalog implementation: `docs/qa/piui/model-picker-desktop.png`
- Model catalog mobile implementation: `docs/qa/piui/model-picker-mobile.png`
- Extension marketplace implementation: `docs/qa/piui/marketplace-desktop.png`
- Extension marketplace mobile implementation: `docs/qa/piui/marketplace-mobile.png`
- Search-height comparison: `/tmp/piui-search-height-comparison.png`
- Full-view comparison: `/tmp/piui-codex-comparison.png`
- Focused composer/content comparison: `/tmp/piui-codex-focus-comparison.png`
- Source pixels: 3024 × 1964 Retina capture, cropped to the Codex app interior and normalized to 1440 × 900.
- Implementation pixels: 1440 × 900 at a 1440 × 900 CSS viewport and device scale factor 1.
- Density normalization: the source @2x capture was cropped and downsampled to the implementation's 1x pixel dimensions before comparison.
- State: dark desktop task view with the left task/session navigation, active conversation, bottom composer, and right environment/context rail visible. The product-specific transcript differs by design: the reference shows a Codex task and PIUI shows deterministic PI messages and tools.

## Findings

No actionable P0, P1, or P2 visual differences remain.

- Fonts and typography: PIUI now uses the same monospace-led voice, restrained weights, compact metadata, and 13px/1.72 chat rhythm visible in the Codex reference. Small functional metadata was intentionally made slightly brighter than the screenshot to meet WCAG AA.
- Spacing and layout rhythm: the desktop composition matches the source's three-region shell, narrow reading column, right-aligned user bubbles, compact 49px header, separate view row, large rounded composer, and inset 22px context rail. Mobile collapses the sidebar and context rail without horizontal overflow.
- Colors and visual tokens: the black/green dashboard palette was replaced by Codex-like graphite surfaces, low-opacity separators, warm neutral text, orange actions, and semantic green runtime status. Light mode uses the same hierarchy with AA-compliant contrast.
- Image and icon fidelity: the source has no app-owned hero imagery to reproduce. PIUI keeps its existing Lucide icon library for real controls; no placeholder, CSS-drawn, or fake raster assets were introduced.
- Copy and content: labels remain PI-specific and operational (`Extensions`, PI runtime trust, model, thinking, trajectory) while adopting the reference hierarchy. This is an intentional product mapping rather than a Codex brand copy.
- Interaction states: composer input, attachments, model selection, thinking, settings, trajectory, extension dialogs, slash commands, reload hydration, and desktop/mobile navigation all execute in the browser E2E workflow.

## Comparison history

1. Initial implementation comparison found a P1 accessibility mismatch: light-theme secondary metadata was 3.62–4.41:1 and the orange completed state was 3.77:1 against its background.
2. Fixed by darkening the light-theme `--dim` and action tokens and brightening dark-theme secondary tokens while retaining the reference palette relationships.
3. Post-fix evidence: `npm run test:e2e` passed all four desktop/mobile workflow and Axe checks with zero serious or critical violations. Revised captures are `docs/qa/piui/complete-desktop.png`, `docs/qa/piui/complete-mobile.png`, `docs/qa/piui/codex-dark-desktop.png`, and `docs/qa/piui/codex-dark-mobile.png`.
4. Independent responsive review then found a P1 clipping regression between 651px and 722px and a P2 misleading context-rail header icon. The sidebar now becomes an overlay/collapsed rail at 900px, nonessential clone/rename controls hide at that breakpoint, the rail action uses an activity/details icon, and the E2E matrix includes a 700px project with per-control viewport-bound assertions.
5. Post-fix evidence: `npm run test:e2e` passed all six desktop, 700px narrow, and mobile workflow/Axe checks. `docs/qa/piui/codex-dark-narrow.png` confirms every visible topbar control and the composer fit at the previously failing width.
6. The workspace-dialog reference and implementation were cropped to their modal bounds, normalized to 520 × 335, and reviewed side by side. The implementation preserves the reference hierarchy, copy, trust actions, spacing rhythm, and icon treatment while adding a real `Choose folder` control beside the editable path. At 390px the path, chooser, and trust actions stack into a single readable column with no clipping.
7. Search containers were increased from 34px to 44px across sessions, models, extensions, and the session ledger. The full-view comparison confirms the new height matches the source's comfortable control density without weakening the compact shell hierarchy. Browser assertions require every visible search container to remain at least 42px tall.
8. Model-picker evidence now states the PI contract directly: the UI renders every selectable model returned by RPC and does not filter by vendor. A deterministic three-model/two-provider catalog confirms both provider groups render on desktop and mobile; unauthenticated providers are accurately described as unavailable rather than shown as selectable controls that would fail.
9. The Extensions settings page now defaults to the official PI marketplace and keeps Installed as a distinct local view. Live parsing returned 3,113 extension packages across 63 pages with 50 results per page. Deterministic browser coverage verifies installed-package matching, pagination, copy-command controls, 44px search sizing, and responsive layout at 1440px, 700px, and 390px.

## Focused comparison

The composer and lower conversation needed a focused comparison because they are the main interaction surface and too small to judge precisely in the 2880px-wide combined image. The focused evidence confirms matching graphite elevation, 20px rounded composer treatment, compact footer controls, narrow reading width, and subdued tool disclosure rows. The implementation keeps its extension widget immediately above the composer because it is functional PI RPC output.

## Primary interactions and console

- Browser workflow tested at 1440 × 900, 700 × 900, and 390 × 844.
- Typed in the composer, attached and removed an image, selected two models, verified model-specific thinking levels, sent a streamed prompt, expanded tool output, reloaded and restored state, opened trajectory, used all settings tabs, invoked a slash command, and completed an extension confirmation dialog.
- Opened the workspace dialog from the responsive sidebar, chose a deterministic test directory through the same-origin folder-picker API, verified the absolute path was placed in the directory field, and closed the dialog without leaving the mobile sidebar over the composer. Path normalization and cancellation are covered by unit tests; native selection is validated by the browser workflow through the platform-independent test override.
- Verified multi-provider model grouping, the configured-provider explanation, marketplace pagination and installed matching, and 42px-minimum visible search controls in the sessions sidebar, model picker, Extensions settings, and session ledger.
- Viewport overflow assertions passed at both sizes.
- Browser page errors are collected by the E2E workflow; none were reported.
- Axe serious/critical accessibility checks passed at both sizes.

## Follow-up polish

- P3: a future native desktop wrapper could add platform material and window chrome; the browser harness correctly stops at the app interior.
- P3: the right context rail is intentionally a PI capability summary rather than a pixel copy of Codex's repository panel.

final result: passed
