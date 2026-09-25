// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // Amaçlı kullanılmayan argümanlar `_` ile başlar (ör. ThrottlerStorage
      // arayüzünün zorunlu ama kullanılmayan _blockDuration/_throttlerName'i).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    // Sahte supabase istemcisi TİPSİZ bir dış API'yi (supabase-js query
    // builder) BİLEREK taklit eder: testler rastgele tablo/kolon şekilleri
    // kurduğu için satırlar `Record<string, any>` olmak ZORUNDA. Buradaki
    // `any` bir kaza değil, dosyanın var oluş sebebi — bu yüzden kural
    // yalnızca BU dosyada kapatılır, üretim kodunda açık kalır.
    files: ['test/fake-supabase.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
