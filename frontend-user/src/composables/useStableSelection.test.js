import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// 内存版 sessionStorage + window，模拟浏览器环境
function installStorageMock() {
  const store = new Map()
  globalThis.window = {
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)) },
      removeItem: (k) => { store.delete(k) }
    }
  }
  return store
}

describe('useStableSelection', () => {
  let mod

  beforeEach(async () => {
    installStorageMock()
    mod = await import('./useStableSelection.js')
  })

  test('勾选写入持久化存储', () => {
    const s1 = mod.useStableSelection('sel:cases')
    s1.toggle('t-001')
    s1.toggle('t-002')
    assert.deepEqual([...s1.selected.value].sort(), ['t-001', 't-002'])
    assert.equal(s1.isSelected('t-001'), true)

    const raw = JSON.parse(globalThis.window.sessionStorage.getItem('sel:cases'))
    assert.deepEqual(raw.sort(), ['t-001', 't-002'])
  })

  test('组件卸载后重新挂载（路由返回/重试）时选择状态自动恢复', () => {
    const s1 = mod.useStableSelection('sel:cases')
    s1.toggle('t-001')
    s1.toggle('t-003')

    // 模拟离开页面后返回：新建一个实例即"重新挂载"
    const s2 = mod.useStableSelection('sel:cases')
    assert.deepEqual([...s2.selected.value].sort(), ['t-001', 't-003'])
    assert.equal(s2.isSelected('t-002'), false)
  })

  test('prune 清理已不存在的评价 id，保留有效选择', () => {
    const s1 = mod.useStableSelection('sel:cases')
    s1.toggle('t-001')
    s1.toggle('stale-id')

    const s2 = mod.useStableSelection('sel:cases')
    s2.prune(['t-001', 't-002'])
    assert.deepEqual([...s2.selected.value], ['t-001'])

    const raw = JSON.parse(globalThis.window.sessionStorage.getItem('sel:cases'))
    assert.deepEqual(raw, ['t-001'])
  })

  test('setAll 支持全选/取消全选，clear 清空并删除存储', () => {
    const s = mod.useStableSelection('sel:cases')
    s.setAll(['a', 'b'], true)
    assert.equal(s.selected.value.size, 2)
    s.setAll(['a'], false)
    assert.deepEqual([...s.selected.value], ['b'])

    s.clear()
    assert.equal(s.selected.value.size, 0)
    assert.equal(globalThis.window.sessionStorage.getItem('sel:cases'), null)
  })

  test('存储损坏时回退为空选择，不抛异常', () => {
    globalThis.window.sessionStorage.setItem('sel:bad', '{不是合法JSON')
    const s = mod.useStableSelection('sel:bad')
    assert.equal(s.selected.value.size, 0)
  })

  test('不同业务键互不干扰', () => {
    const a = mod.useStableSelection('sel:a')
    const b = mod.useStableSelection('sel:b')
    a.toggle('x')
    b.toggle('y')
    assert.equal(a.isSelected('y'), false)
    assert.equal(b.isSelected('x'), false)
  })
})
