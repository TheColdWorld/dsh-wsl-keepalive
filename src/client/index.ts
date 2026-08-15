/**
 * wsl-keepalive browser half — 在「设置 → General」注册「保活」开关行，
 * 通过同源 /api/wsl-keepalive/* JSON 端点读取/切换状态（静态插件用 fetch，
 * 代替动态插件的 host.call）。不 import @deepseek-ai/*，只用本地结构类型。
 * @module wsl-keepalive/client
 */

import type { ClientContextLike, SlotsLike } from '../types.ts'
import { KeepAliveToggle } from './KeepAliveToggle.tsx'

export { KeepAliveToggle } from './KeepAliveToggle.tsx'

/** 必需服务：slots（设置行的注入面）。 */
export const inject = ['slots']

/**
 * 把「保活」开关注册进 General 设置分区。
 * @param ctx - client 根上下文。
 */
export function apply(ctx: ClientContextLike): void {
  ctx.inject(['slots'], (scope: ClientContextLike) => {
    const slots = scope.get('slots') as SlotsLike | undefined
    if (slots === undefined) return
    scope.effect(() => slots.register(
      {
        name: 'settings.general.item',
        id: 'wsl-keepalive',
        order: 30,
        inject: (): Record<string, never> => ({}),
      },
      KeepAliveToggle,
    ), 'wsl-keepalive: settings row')
  })
}
