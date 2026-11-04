export type Job = { time: string; date: string; name: string; slug: string; state: string }
export type Member = { name: string; role: string; state: 'running' | 'idle'; job?: Job }
export type Board = {
  members: Member[]
  running: Job[]
  recent: Job[]
  progress: string[]
  decisions: string[]
  updated: string
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'dev-team-board': { board: Shaped<Board> }
  }
}
