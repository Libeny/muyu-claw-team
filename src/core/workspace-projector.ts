import fs from 'node:fs';
import path from 'node:path';
import type { AgentDefinition, SessionResolution } from '../types.js';

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function safeSymlink(target: string, linkPath: string): void {
  try {
    const existing = fs.lstatSync(linkPath);
    if (existing.isSymbolicLink() || existing.isFile()) {
      fs.rmSync(linkPath, { force: true });
    } else if (existing.isDirectory()) {
      return;
    }
  } catch {
    // ignore
  }
  fs.symlinkSync(target, linkPath);
}

export class WorkspaceProjector {
  constructor(private projectRoot: string) {}

  prepare(session: SessionResolution, agent: AgentDefinition, userId: string): { workspaceDir: string; homeDir: string; userDir: string } {
    const userDir = path.join(this.projectRoot, 'users', userId);
    const overridesDir = path.join(userDir, 'overrides');
    const userSkillsDir = path.join(userDir, 'skills');
    const commonSkillsDir = path.join(this.projectRoot, 'system', 'skills', 'common');
    const homeClaudeDir = path.join(session.homeDir, '.claude');
    const runtimeSkillsDir = path.join(homeClaudeDir, 'skills');

    ensureDir(session.sessionDir);
    ensureDir(session.workspaceDir);
    ensureDir(session.homeDir);
    ensureDir(homeClaudeDir);
    ensureDir(runtimeSkillsDir);
    ensureDir(userDir);
    ensureDir(overridesDir);
    ensureDir(userSkillsDir);

    for (const file of ['MEMORY.md', 'TODO.md', 'LESSONS.md']) {
      const userFile = path.join(userDir, file);
      if (!fs.existsSync(userFile)) {
        fs.writeFileSync(userFile, '', 'utf-8');
      }
      safeSymlink(userFile, path.join(session.workspaceDir, file));
    }

    this.renderClaudeMd(session.workspaceDir, agent, path.join(overridesDir, `${agent.profile.id}.md`));
    this.projectSkills(commonSkillsDir, runtimeSkillsDir, false);
    this.projectSkills(agent.skillsDir, runtimeSkillsDir, true);
    this.projectSkills(userSkillsDir, runtimeSkillsDir, true);

    return { workspaceDir: session.workspaceDir, homeDir: session.homeDir, userDir };
  }

  private renderClaudeMd(workspaceDir: string, agent: AgentDefinition, overridePath: string): void {
    let content = agent.promptText.trim();
    if (fs.existsSync(overridePath)) {
      const override = fs.readFileSync(overridePath, 'utf-8').trim();
      if (override) {
        content = `${content}\n\n---\n\n${override}`;
      }
    }
    fs.writeFileSync(path.join(workspaceDir, 'CLAUDE.md'), `${content}\n`, 'utf-8');
  }

  private projectSkills(sourceDir: string, runtimeSkillsDir: string, allowOverride: boolean): void {
    if (!fs.existsSync(sourceDir)) return;
    for (const entry of fs.readdirSync(sourceDir)) {
      const source = path.join(sourceDir, entry);
      if (!fs.existsSync(path.join(source, 'SKILL.md'))) continue;

      const target = path.join(runtimeSkillsDir, entry);
      if (fs.existsSync(target) && !allowOverride) continue;
      if (fs.existsSync(target) && allowOverride) {
        fs.rmSync(target, { recursive: true, force: true });
      }
      safeSymlink(source, target);
    }
  }
}
