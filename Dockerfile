# Stdio MCP server. Zero npm dependencies, so this image does not run npm install.
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914

WORKDIR /app

COPY server/audit-mcp.js server/audit-mcp.js

USER node

ENTRYPOINT ["node", "server/audit-mcp.js"]
