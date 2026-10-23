# Stdio MCP server. Zero npm dependencies, so this image does not run npm install.
FROM node:lts-alpine

WORKDIR /app

COPY server/audit-mcp.js server/audit-mcp.js

USER node

ENTRYPOINT ["node", "server/audit-mcp.js"]
