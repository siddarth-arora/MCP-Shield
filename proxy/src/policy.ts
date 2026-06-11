import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { watch } from "chokidar";

interface RolePolicy {
  allowed_tools: string[];
  denied_tools?: string[];
}

interface PolicyFile {
  roles: Record<string, RolePolicy>;
}

export interface CheckResult {
  allowed: boolean;
  reason: string;
  rule: string;
}

export class PolicyEngine {
  private policy!: PolicyFile;
  private readonly policyPath: string;

  constructor() {
    this.policyPath = path.resolve(
      process.cwd(),
      process.env["POLICY_FILE"] ?? "../policy.yaml"
    );
    this.reload();
    this.startWatcher();
  }

  private reload(): void {
    const raw = fs.readFileSync(this.policyPath, "utf-8");
    this.policy = yaml.load(raw) as PolicyFile;
  }

  private startWatcher(): void {
    watch(this.policyPath, { ignoreInitial: true }).on("change", () => {
      try {
        this.reload();
        console.log(`[policy] Hot-reloaded ${this.policyPath}`);
      } catch (err) {
        console.error("[policy] Reload failed — keeping previous policy:", err);
      }
    });
  }

  check(role: string, toolName: string): CheckResult {
    const rolePolicy = this.policy.roles[role];

    // 1. Unknown role
    if (!rolePolicy) {
      return {
        allowed: false,
        reason: `Unknown role '${role}'`,
        rule: `roles.${role}=undefined`,
      };
    }

    // 2. Explicit deny wins
    if (rolePolicy.denied_tools?.includes(toolName)) {
      return {
        allowed: false,
        reason: `Tool '${toolName}' is explicitly denied for role '${role}'`,
        rule: `roles.${role}.denied_tools`,
      };
    }

    // 3. Wildcard allow
    if (rolePolicy.allowed_tools.includes("*")) {
      return {
        allowed: true,
        reason: `Role '${role}' allows all tools`,
        rule: `roles.${role}.allowed_tools=["*"]`,
      };
    }

    // 4. Explicit allow
    if (rolePolicy.allowed_tools.includes(toolName)) {
      return {
        allowed: true,
        reason: `Tool '${toolName}' is in allowed list for role '${role}'`,
        rule: `roles.${role}.allowed_tools`,
      };
    }

    // 5. Default block
    return {
      allowed: false,
      reason: `Role '${role}' has no allowed tools matching '${toolName}'`,
      rule: `roles.${role}.allowed_tools`,
    };
  }
}

export const policyEngine = new PolicyEngine();
