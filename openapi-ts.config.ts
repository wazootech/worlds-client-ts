import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "./openapi/openapi.json",
  output: {
    path: "./src/generated",
    module: {
      extension: ".ts",
    },
  },
});
