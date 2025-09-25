import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

// Advertise that this MCP server does not require OAuth.
// Clients that support OAuth discovery will hit this endpoint.
const handler = protectedResourceHandler({
  authServerUrls: [],
});

export { handler as GET, metadataCorsOptionsRequestHandler as OPTIONS };

