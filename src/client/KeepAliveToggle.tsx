/**
 * 设置页里的「保活」开关行：挂载时拉取 /api/wsl-keepalive/status 初始化，
 * 点击开关 POST /api/wsl-keepalive/set 切换；副标题展示 dbus-daemon PID 与发行版。
 * @module wsl-keepalive/client/KeepAliveToggle
 */

import { useCallback, useEffect, useState } from 'react'
import css from './keepalive.module.css'

/** Host 保活 API（同源 JSON 端点）。 */
interface KeepAliveHttpStatus {
  running: boolean
  pids: string[]
  pid: string | null
  distro: string
  wslExecPath: string | null
  distName: string | null
  error: string | null
}

/** 同源 JSON fetch 助手。 */
async function keepAliveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    throw new Error(`wsl-keepalive ${path} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

/**
 * 保活开关组件（设置行，自绘整行：标题 + 副标题 + 拨动开关）。
 */
export function KeepAliveToggle(): React.ReactElement {
  const [state, setState] = useState<{
    running: boolean
    loading: boolean
    busy: boolean
    error: string | null
    pid: string | null
    distro: string
  }>({ running: false, loading: true, busy: false, error: null, pid: null, distro: '' })

  const pollNow = useCallback(() => {
    let live = true
    keepAliveFetch<KeepAliveHttpStatus>('/api/wsl-keepalive/status').then((res) => {
      if (!live) return
      setState({
        running: !!res.running,
        loading: false,
        busy: false,
        error: res.error || null,
        pid: res.pid || null,
        distro: res.distro || '',
      })
    }, () => {
      if (!live) return
      setState((prev) => ({ ...prev, loading: false, error: '无法连接宿主机 /api/wsl-keepalive' }))
    })
    return () => { live = false }
  }, [])

  useEffect(() => {
    const cleanup = pollNow()
    return cleanup
  }, [pollNow])

  const onToggle = (): void => {
    const target = !state.running
    setState((prev) => ({ ...prev, busy: true, error: null }))
    keepAliveFetch<KeepAliveHttpStatus>('/api/wsl-keepalive/set', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: target }),
    }).then((res) => {
      setState({
        running: !!res.running,
        loading: false,
        busy: false,
        error: res.error || null,
        pid: res.pid || null,
        distro: res.distro || '',
      })
    }, (e) => {
      setState((prev) => ({ ...prev, busy: false, error: String((e && (e as Error).message) || e) }))
    })
  }

  let statusText = '检测中…'
  if (!state.loading) {
    if (state.error) {
      statusText = `错误：${state.error}`
    } else if (state.running) {
      statusText = `已启用${state.pid ? ` · PID ${state.pid}` : ''}${state.distro ? ` · ${state.distro}` : ''}`
    } else {
      statusText = `已停用${state.distro ? ` · ${state.distro}` : ''}`
    }
  }

  return (
    <div className={css.row}>
      <div className={css.info}>
        <div className={css.title}>保活</div>
        <div className={css.sub} title={statusText}>{statusText}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={state.running}
        aria-label="WSL 保活开关"
        disabled={state.loading || state.busy}
        className={`${css.switch}${state.running ? ` ${css.switchOn}` : ''}`}
        onClick={onToggle}
      >
        <span className={css.knob} />
      </button>
    </div>
  )
}
