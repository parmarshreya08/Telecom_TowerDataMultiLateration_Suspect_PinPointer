# Dependency Reference — E-Rakshak Frontend

Last updated: 2026-08-10

## Production Dependencies

| Package | Current | Latest | Docs URL | Migration Notes |
|---|---|---|---|---|
| react | 18.3.1 | 19.2.8 | https://react.dev/blog/2024/04/25/react-19-upgrade-guide | forwardRef still works, defaultProps removed from functions, ref as prop |
| react-dom | 18.3.1 | 19.2.8 | https://react.dev/blog/2024/04/25/react-19-upgrade-guide | createRoot still works |
| react-router-dom | 7.18.2 | 7.18.2 | https://reactrouter.com | Already latest |
| @tanstack/react-query | 5.101.4 | 5.101.4 | https://tanstack.com/query/latest | Already latest |
| @tanstack/react-query-devtools | 5.101.4 | 5.101.4 | https://tanstack.com/query/latest | Already latest |
| axios | 1.19.0 | 1.19.0 | https://axios-http.com | Already latest |
| clsx | 2.1.1 | 2.1.1 | https://github.com/lukeed/clsx | Already latest |
| framer-motion | 10.18.0 | 13.0.0 | https://motion.dev/docs/react-upgrade-guide | Rename package to `motion`, change imports to `motion/react` |
| leaflet | 1.9.4 | 1.9.4 | https://leafletjs.com | Already latest |
| lucide-react | 0.309.0 | 1.28.0 | https://lucide.dev/guide/react/migration | Brand icons removed in v1, aria-hidden default true |
| react-hook-form | 7.84.0 | 7.85.0 | https://react-hook-form.com | Minor update |
| react-leaflet | 4.2.1 | 5.0.0 | https://react-leaflet.js.org | Peer dep on React 19 |
| zod | 3.25.76 | 4.4.3 | https://zod.dev | Major rewrite, new API |
| @hookform/resolvers | 3.10.0 | 5.7.1 | https://react-hook-form.com | Peer dep on zod 4, use `zodResolver` from `@hookform/resolvers/zod` |
| socket.io-client | 4.8.3 | 4.8.3 | https://socket.io | Already latest |

## Removed (unused — 0 imports found)

| Package | Reason |
|---|---|
| recharts | 0 imports in src/ |
| date-fns | 0 imports in src/ |
| qrcode.react | 0 imports in src/ |

## Dev Dependencies

| Package | Current | Latest | Docs URL | Migration Notes |
|---|---|---|---|---|
| @types/react | 18.3.31 | 19.2.18 | https://github.com/DefinitelyTyped | Matches react version |
| @types/react-dom | 18.3.7 | 19.2.4 | https://github.com/DefinitelyTyped | Matches react-dom version |
| @types/leaflet | 1.9.22 | 1.9.22 | https://github.com/DefinitelyTyped | Already latest |
| @types/node | 20.19.43 | 26.2.0 | https://github.com/DefinitelyTyped | Safe to upgrade |
| typescript | 5.9.3 | 7.0.2 | https://devblogs.microsoft.com/typescript | strict now default, es5 target removed, types defaults to [] |
| vite | 8.2.1 | 8.2.1 | https://vite.dev | Already latest |
| @vitejs/plugin-react | 6.0.5 | 6.0.5 | https://github.com/vitejs/vite-plugin-react | Already latest |
| tailwindcss | 3.4.19 | 4.3.3 | https://tailwindcss.com/docs/upgrade-guide | CSS-first config (@theme), delete tailwind.config.js, @tailwindcss/vite plugin |
| postcss | 8.5.25 | 8.5.26 | https://postcss.org | Patch update |
| autoprefixer | 10.5.4 | — | — | Remove (not needed in Tailwind v4) |
| eslint | 8.57.1 | 10.8.1 | https://eslint.org/docs/latest/use/configure/migration-guide | Flat config only, delete .eslintrc.cjs |
| @typescript-eslint/eslint-plugin | 8.66.0 | 8.67.0 | https://typescript-eslint.io | Patch update |
| @typescript-eslint/parser | 8.66.0 | 8.67.0 | https://typescript-eslint.io | Patch update |
| eslint-plugin-react-hooks | 4.6.2 | 7.1.1 | https://react.dev/reference/react/hooks | Major update |
| eslint-plugin-react-refresh | 0.4.26 | 0.5.4 | https://github.com/nicolo-ribaudo/eslint-plugin-react-refresh | Minor update |

## New Dev Dependencies Needed

| Package | Purpose | Docs URL |
|---|---|---|
| @tailwindcss/vite | Tailwind v4 Vite plugin (replaces postcss plugin) | https://tailwindcss.com/docs/installation/vite |
| globals | For ESLint flat config env globals | https://www.npmjs.com/package/globals |
| @eslint/js | For ESLint flat config recommended rules | https://eslint.org/docs/latest/use/configure/migration-guide |
| typescript-eslint | Unified TS ESLint package (replaces separate plugin/parser) | https://typescript-eslint.io |
| motion | Replaces framer-motion (same API, new package name) | https://motion.dev/docs/react-upgrade-guide |
