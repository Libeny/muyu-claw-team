import { spawnSync } from 'node:child_process';

export type SandboxBackend = 'native-seatbelt' | 'native-bubblewrap';

export interface SandboxPlan {
  backend: SandboxBackend;
  env: Record<string, string>;
  permissionMode: 'dontAsk';
  sdkSandbox?: Record<string, unknown>;
  settings: Record<string, unknown>;
}

function hasCommand(command: string): boolean {
  const result = spawnSync('which', [command], { encoding: 'utf-8' });
  return result.status === 0;
}

export function buildSandboxPlan(input: {
  sessionDir: string;
  workspaceDir: string;
  homeDir: string;
  userDir: string;
  systemDir: string;
  allowedTools?: string[];
}): SandboxPlan {
  const toolPermissions = [...new Set((input.allowedTools || []).filter(Boolean))];
  const baseSettings = {
    permissions: {
      allow: [
        `Read(${input.sessionDir}/**)`,
        `Edit(${input.sessionDir}/**)`,
        `Write(${input.sessionDir}/**)`,
        `Read(${input.userDir}/**)`,
        `Edit(${input.userDir}/**)`,
        `Write(${input.userDir}/**)`,
        `Read(${input.systemDir}/**)`,
        ...toolPermissions,
      ],
      defaultMode: 'dontAsk',
    },
  };

  const commonEnv: Record<string, string> = {
    HOME: input.homeDir,
  };

  if (process.platform === 'linux') {
    if (!hasCommand('bwrap')) {
      throw new Error('bubblewrap is required on Linux. Install `bubblewrap` before starting muyu-claw-team.');
    }

    return {
      backend: 'native-bubblewrap',
      env: commonEnv,
      permissionMode: 'dontAsk',
      sdkSandbox: {
        enabled: true,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed: true,
        allowUnsandboxedCommands: false,
        filesystem: {
          allowRead: [input.sessionDir, input.userDir, input.systemDir],
          allowWrite: [input.sessionDir, input.userDir],
        },
      },
      settings: baseSettings,
    };
  }

  if (process.platform === 'darwin') {
    return {
      backend: 'native-seatbelt',
      env: commonEnv,
      permissionMode: 'dontAsk',
      sdkSandbox: {
        enabled: true,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed: true,
        allowUnsandboxedCommands: false,
        filesystem: {
          allowRead: [input.sessionDir, input.userDir, input.systemDir],
          allowWrite: [input.sessionDir, input.userDir],
        },
      },
      settings: baseSettings,
    };
  }

  throw new Error(`Unsupported platform for required sandboxing: ${process.platform}`);
}
