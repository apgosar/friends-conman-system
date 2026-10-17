import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Ratchet: these predate the CI gate (about 160 `any`s, a few effect/render patterns). They stay visible as warnings
      // and must not grow; fix them as the files are touched, then promote the rule back to "error".
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  {
    // UI rules (see src/components/ui and src/styles): one kit, one stylesheet.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/scripts/**", "src/lib/env.ts"],
    rules: {
      "no-alert": "error", // use useToast() / useConfirm() from the UI kit
      "no-console": "error", // use the logger (src/lib/logger.ts)
    },
  },
  {
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // A fixed value in a style prop belongs in a CSS class (utilities.css, components.css). Values computed at render time are fine.
          selector: "JSXAttribute[name.name='style'] ObjectExpression > Property[key.name=/^(margin.*|padding.*|gap|fontSize|fontWeight|fontFamily|color|background.*|border.*|display|flex.*|justifyContent|alignItems|textAlign|textTransform|letterSpacing|borderRadius|cursor)$/] > Literal",
          message: "Use a CSS class instead of a fixed inline style (src/styles/utilities.css, components.css).",
        },
        {
          // Colours come from the tokens in src/styles/tokens.css, never as hex literals in components.
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message: "Use a colour token (var(--…)) instead of a hex colour.",
        },
      ],
    },
  },
  {
    // Tests build deliberately loose mocks and fixtures.
    files: ["tests/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
]);

export default eslintConfig;
