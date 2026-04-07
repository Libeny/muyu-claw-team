import fs from 'node:fs';
import path from 'node:path';
import type { AgentDefinition, AgentProfile } from '../types.js';

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();

  constructor(rootDir: string) {
    const agentsRoot = path.join(rootDir, 'system', 'agents');
    if (!fs.existsSync(agentsRoot)) {
      throw new Error(`agents root not found: ${agentsRoot}`);
    }

    for (const entry of fs.readdirSync(agentsRoot)) {
      const agentDir = path.join(agentsRoot, entry);
      if (!fs.statSync(agentDir).isDirectory()) continue;

      const profilePath = path.join(agentDir, 'profile.json');
      const promptPath = path.join(agentDir, 'CLAUDE.md');
      const skillsDir = path.join(agentDir, 'skills');

      if (!fs.existsSync(profilePath) || !fs.existsSync(promptPath)) {
        continue;
      }

      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8')) as AgentProfile;
      const promptText = fs.readFileSync(promptPath, 'utf-8');

      this.agents.set(profile.id, {
        profile,
        rootDir: agentDir,
        promptPath,
        promptText,
        skillsDir,
      });
    }
  }

  get(agentId: string): AgentDefinition {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`unknown agent: ${agentId}`);
    }
    return agent;
  }

  list(): AgentDefinition[] {
    return [...this.agents.values()];
  }
}
