import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Widget bundle build çıktısıdır (dist -> public'e kopyalanır), kaynak değil.
    "public/green-gold-widget*.js",
  ]),
  {
    rules: {
      // Amaçlı kullanılmayan argümanlar `_` ile başlar (ör. useActionState
      // imzasindaki _prev/_formData). Bu konvansiyonu no-unused-vars'a tanıt.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
