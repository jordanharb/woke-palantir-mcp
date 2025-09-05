# Express MCP Server on Vercel

Model Context Protocol (MCP) server built with Express.js that provides weather data tools, deployable to Vercel.

**Note: This example does not require authentication.**

## How to Use

You can choose from one of the following two methods to use this repository:

### One-Click Deploy

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel-labs/express-mcp&project-name=express-mcp&repository-name=express-mcp)

### Clone and Deploy

```bash
git clone https://github.com/vercel-labs/express-mcp
```

Install dependencies:

```bash
pnpm i
```

Then run the app at the root of the repository:

```bash
pnpm dev
```

## Features

This MCP server provides weather-related tools:

- **get-alerts**: Get weather alerts for a US state (requires 2-letter state code)
- **get-forecast**: Get weather forecast for a location (requires latitude/longitude)

## MCP Connection

You can connect to the server using [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) or any other MCP client.
Be sure to include the `/mcp` path in the connection URL (e.g., `https://your-deployment.vercel.app/mcp`).

## API Endpoints

- `POST /mcp`: Handles incoming messages for the MCP protocol
