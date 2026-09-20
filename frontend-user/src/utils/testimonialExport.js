/**
 * 客户评价导出与批量整理工具
 *
 * 设计为与 Vue 无关的纯函数（下载除外），便于单元测试与复用。
 * 导出在生成文件前会做完整性校验，以下情况一律不生成文件并返回原因：
 *  1. 导出范围为空（未勾选任何反馈）
 *  2. 评价人缺失（姓名或介绍为空）
 *  3. 评价内容重复（去除首尾空白、合并连续空白后比较）
 *  4. 评价内容为空
 */

// 满意度星级 -> 文案
export const SATISFACTION_LABELS = {
  5: '非常满意',
  4: '满意',
  3: '一般',
  2: '不满意',
  1: '非常不满意'
}

export const CSV_HEADERS = [
  '序号',
  '满意度(星)',
  '满意度',
  '评价内容',
  '评价人',
  '评价人介绍',
  '来源案例'
]

/**
 * 规范化评价内容：去首尾空白、合并连续空白（含换行/全角空格），用于重复判定
 * @param {string} content
 * @returns {string}
 */
export function normalizeContent(content) {
  return String(content ?? '').replace(/[\s　]+/g, ' ').trim()
}

/**
 * 截断长文本用于原因提示
 */
function truncate(text, max = 24) {
  const s = String(text ?? '')
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

/**
 * 校验待导出的评价集合
 * @param {Array<{id?:string, content?:string, name?:string, title?:string}>} items
 * @returns {{ valid: boolean, reasons: Array<{type:string, message:string, ids:string[]}> }}
 */
export function validateSelection(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      valid: false,
      reasons: [
        {
          type: 'empty-range',
          message: '导出范围为空：请先勾选至少一条客户反馈，再执行导出。',
          ids: []
        }
      ]
    }
  }

  const reasons = []

  // 1. 评价内容为空 / 评价人信息缺失
  items.forEach((item) => {
    const label = isBlank(item.name) ? '未署名评价' : item.name.trim()

    if (isBlank(item.content)) {
      reasons.push({
        type: 'empty-content',
        message: `评价内容为空（评价人：${label}），无法导出残缺记录。`,
        ids: [item.id].filter(Boolean)
      })
    }

    const missingName = isBlank(item.name)
    const missingTitle = isBlank(item.title)
    if (missingName || missingTitle) {
      const missingFields = [missingName && '姓名', missingTitle && '介绍'].filter(Boolean).join('与')
      const snippet = isBlank(item.content) ? '内容为空的记录' : `「${truncate(normalizeContent(item.content))}」`
      reasons.push({
        type: 'missing-author',
        message: `评价人信息缺失：${snippet}（${label}）的评价人${missingFields}未填写，请补充或取消勾选后重试。`,
        ids: [item.id].filter(Boolean)
      })
    }
  })

  // 2. 内容重复（按规范化后的文本分组）
  const duplicateGroups = new Map()
  items.forEach((item) => {
    const key = normalizeContent(item.content)
    if (!key) return // 空内容已在上一步单独提示
    if (!duplicateGroups.has(key)) {
      duplicateGroups.set(key, [])
    }
    duplicateGroups.get(key).push(item)
  })

  for (const [key, group] of duplicateGroups) {
    if (group.length > 1) {
      const authors = group
        .map((t) => (isBlank(t.name) ? '未署名评价' : t.name.trim()))
        .join('、')
      reasons.push({
        type: 'duplicate-content',
        message: `评价内容重复：「${truncate(key)}」共出现 ${group.length} 条（${authors}），请去重或仅保留一条后重试。`,
        ids: group.map((t) => t.id).filter(Boolean)
      })
    }
  }

  return { valid: reasons.length === 0, reasons }
}

/**
 * 按满意度从高到低稳定排序（同星级保持原始选择顺序）
 * @param {Array} items
 * @returns {Array}
 */
export function sortBySatisfaction(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const diff = Number(b.item.rating ?? 0) - Number(a.item.rating ?? 0)
      return diff !== 0 ? diff : a.index - b.index
    })
    .map((x) => x.item)
}

/**
 * CSV 单元格转义：包含逗号、引号或换行时用双引号包裹，内部双引号翻倍
 */
function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * 生成 CSV 文本（已按满意度降序整理，保留评价人介绍与来源案例）
 * @param {Array} items 通过校验的评价集合
 * @param {Record<string,string>} [caseTitleMap] 来源案例 id -> 案例标题
 * @returns {string}
 */
export function buildCsv(items, caseTitleMap = {}) {
  const rows = sortBySatisfaction(items).map((item, i) => [
    i + 1,
    `${Number(item.rating ?? 0)}星`,
    satisfactionLabel(item.rating),
    item.content ?? '',
    String(item.name ?? '').trim(),
    String(item.title ?? '').trim(),
    caseTitleMap[item.caseId] || '未关联案例'
  ])

  return [CSV_HEADERS, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

function satisfactionLabel(rating) {
  return SATISFACTION_LABELS[rating] ?? '未评价'
}

/**
 * 导出时间戳，如 20260920_1530
 */
export function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}`
  )
}

/**
 * 触发浏览器下载（带 UTF-8 BOM，Excel 直接打开不乱码）
 * @param {string} csv
 * @param {string} filename
 */
export function downloadCsv(csv, filename) {
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 一键导出：先校验，通过后才按满意度整理并下载；不通过时不生成任何文件
 * @param {Array} items
 * @param {Record<string,string>} [caseTitleMap]
 * @returns {{ valid: boolean, reasons?: Array, filename?: string, count?: number }}
 */
export function downloadTestimonials(items, caseTitleMap = {}) {
  const result = validateSelection(items)
  if (!result.valid) {
    return result
  }
  const csv = buildCsv(items, caseTitleMap)
  const filename = `客户评价导出_${formatTimestamp(new Date())}.csv`
  downloadCsv(csv, filename)
  return { valid: true, filename, count: items.length }
}
