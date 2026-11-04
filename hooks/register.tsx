import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Board, Job, Member } from '../types'

const PANE = 'dev-team-board'
const TITLE = '개발팀 현황'
// The team project folder comes from the install-time setting `projectRoot` (userConfig).
let ROOT = ''
const STATUS = () => `${ROOT}/team/STATUS.md`
const KANBAN = () => `${ROOT}/KANBAN.md`
const PROFILES = () => `${ROOT}/team/profiles`

const empty: Board = { members: [], running: [], recent: [], progress: [], decisions: [], updated: '' }
const board = atom({ plugin: 'dev-team-board', key: 'board' } as const, empty, {
  shape: 'board-2',
})

const clean = (s: string) => s.replace(/\*\*|`/g, '').trim()

function parseStatus(text: string): { running: Job[]; recent: Job[]; byName: Map<string, Job> } {
  const byName = new Map<string, Job>()
  const last = new Map<string, Job>()
  const order: Job[] = []
  for (const line of text.split('\n')) {
    const cells = line.split('|').map(c => c.trim())
    if (cells.length < 6 || !/^\d\d:\d\d$/.test(cells[1])) continue
    const date = (cells[5].match(/(\d{4})-(\d\d-\d\d)/) ?? [])[2] ?? ''
    const job: Job = { time: cells[1], date, name: cells[2], slug: cells[3], state: cells[4] }
    last.set(`${job.name}/${job.slug}`, job)
    order.push(job)
    byName.set(job.name, job)
  }
  // A run counts only if it started today and less than 3 hours ago: a job whose process
  // died never writes its done line, and must not look busy for days.
  const now = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const today = `${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
  const fresh = (j: Job) => {
    if (j.date !== today) return false
    const [h, m] = j.time.split(':').map(Number)
    return now.getHours() * 60 + now.getMinutes() - (h * 60 + m) < 180
  }
  const running = [...last.values()].filter(j => j.state === 'running' && fresh(j))
  for (const [k, j] of byName) if (j.state === 'running' && !fresh(j)) byName.set(k, { ...j, state: 'stale' })
  const recent = order.filter(j => j.state !== 'running').slice(-6).reverse()
  for (const j of running) byName.set(j.name, j)
  return { running, recent, byName }
}

function section(text: string, heading: string): string[] {
  const lines = text.split('\n')
  const start = lines.findIndex(l => l.startsWith('## ') && l.includes(heading))
  if (start < 0) return []
  const out: string[] = []
  for (const l of lines.slice(start + 1)) {
    if (l.startsWith('## ')) break
    out.push(l)
  }
  return out
}

function parseKanban(text: string): { progress: string[]; decisions: string[] } {
  const decisions = section(text, '사용자 차례')
    .filter(l => l.startsWith('- [ ]'))
    .map(l => clean(l.slice(5)).split(' — ')[0])
  const progress = section(text, '진행 중')
    .filter(l => l.startsWith('|') && !l.includes('---') && !l.includes('| 일 |'))
    .map(l => {
      const c = l.split('|').map(x => clean(x))
      return `${c[2]}: ${c[1]}`
    })
  return { progress, decisions }
}

async function refresh($: any) {
  const now = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const updated = `${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`
  try {
    if (!ROOT) throw new Error('설정에서 프로젝트 폴더(projectRoot)를 지정하세요')
    const [s, k] = await Promise.all([$.fs.read(STATUS()), $.fs.read(KANBAN())])
    const { byName, ...st } = parseStatus(s as string)
    const entries = await $.fs.list(PROFILES())
    const members: Member[] = []
    for (const ent of entries) {
      if (ent.kind !== 'dir') continue
      let role = ''
      try {
        const soul = (await $.fs.read(`${PROFILES()}/${ent.name}/soul.md`)) as string
        role = (soul.split('\n')[0].split('—')[1] ?? '').trim()
      } catch {}
      const job = byName.get(ent.name)
      members.push({ name: ent.name, role, state: job?.state === 'running' ? 'running' : 'idle', job })
    }
    // Order by position: PL, architect, backend, frontend, QA, then everyone else;
    // within one position, whoever is working comes first.
    const RANKS: RegExp[] = [/^PL\b/, /아키텍트/, /백엔드/, /프론트/, /QA/]
    const rank = (m: Member) => {
      const i = RANKS.findIndex(r => r.test(m.role))
      return i < 0 ? RANKS.length : i
    }
    const busy = (m: Member) => (m.state === 'running' ? 0 : 1)
    members.sort((a, b) => rank(a) - rank(b) || busy(a) - busy(b))
    const next: Board = { members, ...st, ...parseKanban(k as string), updated }
    await update($, board, () => next)
  } catch (err) {
    await update($, board, b => ({ ...b, updated, error: String(err) }))
  }
}

// Color goes on the status cell alone: working, stopped by a dead process, failed, or waiting.
function statusOf(m: Member): { label: string; color: string } {
  if (m.state === 'running') return { label: '● 작업중', color: 'green' }
  if (m.job?.state === 'stale') return { label: '◌ 중단됨', color: 'yellow' }
  if (m.job?.state === 'failed') return { label: '✕ 실패', color: 'red' }
  return { label: '○ 대기', color: 'gray' }
}

export const register: Register = (on, options) => {
  ROOT = String((options as any)?.projectRoot ?? '').replace(/[\\/]+$/, '')
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dev-team', description: '개발팀 현황 패널 열기' })
    await refresh($)
    $.clock.every(15000, () => refresh($))
    void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'dev-team' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: '개발팀 현황 패널을 열었습니다.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const b = await read($, board)
    return (
      <Box flexDirection="column">
        <Text bold>팀원 ({b.members.filter(m => m.state === 'running').length}/{b.members.length} 작업 중)</Text>
        <Box>
          <Box width={7}><Text dimColor>이름</Text></Box>
          <Box width={30}><Text dimColor>역할</Text></Box>
          <Box width={9}><Text dimColor>상태</Text></Box>
          <Text dimColor>작업 (마지막 기록)</Text>
        </Box>
        {b.members.map(m => (
          <Box>
            <Box width={7}><Text bold={m.state === 'running'}>{m.name}</Text></Box>
            <Box width={30}><Text dimColor>{m.role}</Text></Box>
            <Box width={9}>
              <Text color={statusOf(m).color}>{statusOf(m).label}</Text>
            </Box>
            <Text dimColor={m.state !== 'running'}>
              {m.job ? `${m.job.slug} (${m.job.date} ${m.job.time}${m.job.state === 'failed' ? ' 실패' : m.job.state === 'stale' ? ' 중단됨' : m.job.state === 'cancelled' ? ' 취소' : ''})` : '-'}
            </Text>
          </Box>
        ))}
        <Text> </Text>
        <Text bold>진행 중 (칸반)</Text>
        {b.progress.length === 0 && <Text dimColor>  없음</Text>}
        {b.progress.map(p => (
          <Text>  ◦ {p}</Text>
        ))}
        <Text> </Text>
        <Text bold>최근 끝난 일</Text>
        {b.recent.map(j => (
          <Text dimColor={j.state === 'done'}>
            {'  '}{j.time} {j.name} {j.slug} {j.state === 'done' ? '완료' : j.state}
          </Text>
        ))}
        <Text> </Text>
        <Text bold>결정·확인 필요</Text>
        {b.decisions.length === 0 && <Text dimColor>  없음</Text>}
        {b.decisions.map(d => (
          <Text>  □ {d}</Text>
        ))}
        <Text> </Text>
        <Box>
          <Text dimColor>갱신 {b.updated} (15초마다){b.error ? ` · 읽기 오류: ${b.error}` : ''} </Text>
          <Button key="refresh" label="새로고침" onPress={() => refresh($)} />
        </Box>
      </Box>
    )
  })
}
