# RepoPilot MCP

A local Model Context Protocol ([MCP](https://modelcontextprotocol.io/)) server designed to help open-source contributors discover potentially beginner-friendly GitHub issues using explainable heuristics and evidence links.

## Overview

RepoPilot MCP connects LLM-powered developer environments directly to open-source repository insights over standard I/O (`stdio`). It is built to assist contributors by evaluating issues for newcomer accessibility with clear rationale, reproducible heuristics, and direct evidence links.

> [!NOTE]
> This repository is currently in its initial foundation stage. GitHub API integration and domain-specific MCP tools are scheduled for subsequent iterations.

---

## Architectural Principles

1. **Modern ES Modules (`NodeNext`)**: Configured for Node.js native ESM (`"type": "module"`) targeting modern Node.js runtimes (`>=20.0.0`).
2. **Current Official MCP SDK**: Uses `@modelcontextprotocol/sdk` with the official high-level `McpServer` abstraction.
3. **Strict Stderr Logging**: In stdio MCP servers, `process.stdout` is exclusively reserved for JSON-RPC message framing. All logs, diagnostics, and notifications are strictly directed to `process.stderr` to prevent protocol stream corruption.
4. **Runtime Schema Validation**: Employs [Zod](https://zod.dev) for all configuration, input schemas, and future MCP tool parameter validation.
5. **Quality Gates**: Automated typechecking (`tsc`), linting (`eslint` flat config), code formatting (`prettier`), and unit tests (`vitest`).

---

## Project Structure

```text
repopilot-mcp/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI workflow (typecheck, lint, test, build)
├── src/
│   ├── cli.ts                 # Executable stdio entrypoint (bin target)
│   ├── index.ts               # Public library API exports
│   ├── logger.ts              # Stderr-only logger utility
│   └── server.ts              # McpServer factory with Zod validation
├── tests/
│   ├── logger.test.ts         # Stderr output and log-level tests
│   └── server.test.ts         # Server instantiation and schema validation tests
├── eslint.config.js           # ESLint 9+ flat config with typescript-eslint & prettier
├── package.json               # Package configuration, scripts, bin, and dependencies
├── tsconfig.json              # TypeScript configuration for development & tests
├── tsconfig.build.json        # TypeScript configuration for dist build
├── vitest.config.ts           # Vitest configuration
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js**: `>= 20.0.0` (Recommended: latest LTS or Current)
- **npm**: `>= 10.0.0`

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/adity0208/repopilot-mcp.git
cd repopilot-mcp
npm install
```

---

## Available Scripts

| Script                 | Command                         | Description                                    |
| :--------------------- | :------------------------------ | :--------------------------------------------- |
| `npm run build`        | `tsc -p tsconfig.build.json`    | Compiles TypeScript source to `./dist`         |
| `npm run typecheck`    | `tsc --noEmit -p tsconfig.json` | Validates types across source and test files   |
| `npm test`             | `vitest run`                    | Runs unit test suite                           |
| `npm run test:watch`   | `vitest`                        | Runs tests in interactive watch mode           |
| `npm run lint`         | `eslint .`                      | Checks code against TypeScript and style rules |
| `npm run lint:fix`     | `eslint . --fix`                | Automatically fixes auto-fixable lint issues   |
| `npm run format:check` | `prettier --check .`            | Verifies code formatting                       |
| `npm run format`       | `prettier --write .`            | Formats all files according to Prettier rules  |

---

## MCP Host Integration (Local Testing)

Once built, the server can be registered in any MCP-compliant client (e.g., Claude Desktop, Antigravity, or Cursor) using standard I/O:

```json
{
  "mcpServers": {
    "repopilot": {
      "command": "node",
      "args": ["<PATH_TO_REPOPILOT_MCP>/dist/cli.js"]
    }
  }
}
```

---

## License

[MIT](LICENSE)
