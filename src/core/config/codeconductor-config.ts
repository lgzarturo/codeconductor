/**
 * CodeConductor configuration interface
 */
export interface CodeConductorConfig {
  version: string
  project: {
    name: string
    profile?: string
  }
  defaults: {
    target: 'opencode' | 'claude' | 'codex'
    overwrite: boolean
  }
  presets: {
    council: {
      enabled: boolean
      version: string
    }
  }
  safety: {
    destructiveCommands: string[]
    secretPatterns: string[]
  }
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: CodeConductorConfig = {
  version: '0.2.0',
  project: {
    name: 'unnamed-project'
  },
  defaults: {
    target: 'opencode',
    overwrite: false
  },
  presets: {
    council: {
      enabled: true,
      version: '0.1.0'
    }
  },
  safety: {
    destructiveCommands: ['rm -rf', 'drop table', 'delete from'],
    secretPatterns: ['password', 'secret', 'api_key', 'token']
  }
}