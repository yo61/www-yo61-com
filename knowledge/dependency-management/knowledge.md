# Dependency management: knowledge

- Renovate (run from `yo61/infrastructure`) updates CI tools; Dependabot updates npm.
- Dependabot's updater ships its own Node (24 as of 2026-11-16) and ignores `mise.toml`.
- Dependabot reports a failed pnpm install as `unknown_error` on the job only; the alert shows
  nothing. Check the job log under Insights → Dependency graph → Dependabot.
- A weekly Dependabot run "succeeds" when the cooldown filters out every update, so a green run
  does not prove updates work.
- Confirmed 2026-11-17: after dropping `engineStrict` (#23), Dependabot run 44129379848 ran pnpm
  on its own Node and opened #26 with a regenerated lockfile.
- `pnpm audit` checks the lockfile against the advisory database at run time, so a new advisory
  can fail every open PR without any change to dependencies. Seen 2026-11-17: GHSA-fc5q-39xc-vjpf
  (no patched version) blocked #25 and #28; ignored in `auditConfig.ignoreGhsas`.
- pnpm 12 reads `auditConfig.ignoreGhsas` from `pnpm-workspace.yaml` and reports matches as
  "ignored", exiting 0.
- pnpm fills a peer dependency that no ancestor declares with the highest matching version
  anywhere in the tree, so an unrelated update can change what a package loads. Seen 2026-11-27
  (#43): `@astrojs/astro2tsx@0.1.3` did not declare `@emnapi/runtime`; rolldown 1.2.19 added
  2.0.0-beta.2 to the tree and `astro check` failed with `this.bridge.setLastError is not a
  function`. astro2tsx 0.1.5 declares it.
- Dependabot bumps only the packages in its group. A fix that ships in a transitive dependency
  inside its parent's range (`@astrojs/language-server` allows astro2tsx `^0.1.2`) stays at the
  locked version until `pnpm update <pkg> --depth Infinity` moves it.
