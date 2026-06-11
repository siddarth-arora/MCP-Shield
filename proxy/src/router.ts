import type { PolicyEngine, PolicyFile, ServerDef } from "./policy";

export interface ResolvedServer {
  serverName: string;
  url: string;
}

export class Router {
  private servers: Record<string, ServerDef> = {};
  private routes: Record<string, string> = {};

  constructor(private readonly engine: PolicyEngine) {
    this.ingest(engine.getPolicy());
    engine.onReload(() => {
      this.ingest(engine.getPolicy());
      console.log("[router] Routes reloaded from policy");
    });
  }

  private ingest(policy: PolicyFile): void {
    this.servers = policy.servers ?? {};
    this.routes = policy.routes ?? {};
  }

  resolve(toolName: string): ResolvedServer {
    const serverName = this.routes[toolName] ?? "default";
    const serverDef = this.servers[serverName];

    if (serverDef) {
      return { serverName, url: serverDef.url };
    }

    // 'default' key not in servers — fall back to env var
    return {
      serverName: "default",
      url: process.env["TARGET_MCP_URL"] ?? "http://localhost:3001",
    };
  }

  getServers(): Record<string, { url: string; description: string }> {
    const result: Record<string, { url: string; description: string }> = {};
    for (const [name, def] of Object.entries(this.servers)) {
      result[name] = { url: def.url, description: def.description ?? "" };
    }
    return result;
  }

  getRoutes(): Record<string, string> {
    return { ...this.routes };
  }
}

import { policyEngine } from "./policy";
export const router = new Router(policyEngine);
