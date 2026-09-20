/**
 * 稳定的多选状态：基于 sessionStorage 持久化勾选 id 集合。
 *
 * 满足以下场景选择状态不丢失：
 *  - 切换案例筛选标签（评价数据未卸载重建）
 *  - 路由跳转离开页面后再返回（组件卸载重建，从 sessionStorage 恢复）
 *  - 导出校验失败后重试（状态始终保留，用户只需取消问题项的勾选）
 *  - 浏览器前进/后退
 *
 * 关闭标签页后 sessionStorage 自动清空，不产生长期脏数据。
 */
import { ref } from 'vue'

function readStorage(key) {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((id) => String(id)))
    }
  } catch {
    // 存储损坏时视为无选择，避免页面不可用
  }
  return new Set()
}

/**
 * @param {string} storageKey sessionStorage 键名
 * @param {import('vue').Ref<string[]>} [validIdsRef] 当前可选的评价 id（用于清理失效项）
 */
export function useStableSelection(storageKey, validIdsRef) {
  const selected = ref(readStorage(storageKey))

  function persist() {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify([...selected.value]))
    } catch {
      // 隐私模式等场景写入失败时，内存态仍可正常工作
    }
  }

  function toggle(id) {
    const key = String(id)
    const next = new Set(selected.value)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    selected.value = next
    persist()
  }

  function setAll(ids, checked) {
    const keys = ids.map((id) => String(id))
    const next = new Set(selected.value)
    keys.forEach((key) => {
      if (checked) {
        next.add(key)
      } else {
        next.delete(key)
      }
    })
    selected.value = next
    persist()
  }

  function clear() {
    selected.value = new Set()
    try {
      window.sessionStorage.removeItem(storageKey)
    } catch {
      // 忽略
    }
  }

  function isSelected(id) {
    return selected.value.has(String(id))
  }

  /**
   * 清理已不存在的评价 id（数据变化后保持存储干净）
   */
  function prune(validIds) {
    if (!validIds || validIds.length === 0) return
    const valid = new Set(validIds.map((id) => String(id)))
    let changed = false
    const next = new Set([...selected.value].filter((id) => {
      const keep = valid.has(id)
      if (!keep) changed = true
      return keep
    }))
    if (changed) {
      selected.value = next
      persist()
    }
  }

  if (validIdsRef && typeof validIdsRef === 'object' && 'value' in validIdsRef) {
    prune(validIdsRef.value)
  }

  return {
    selected,
    toggle,
    setAll,
    clear,
    isSelected,
    prune
  }
}
