import nextConfig from "eslint-config-next";
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import hooksPlugin from "eslint-plugin-react-hooks";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Backup and old files
      "**/page_old.tsx",
      "**/page_old.ts", 
      "**/_backup.*",
      "**/*_backup.*",
      "**/*_old.*",
      // Test files
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
    ],
  },
  {
    // Custom overrides block
    files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
    plugins: {
      "react": reactPlugin,
      "react-hooks": hooksPlugin,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "prefer-const": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",
      "react/jsx-no-undef": "warn",
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  },
];

export default eslintConfig;
