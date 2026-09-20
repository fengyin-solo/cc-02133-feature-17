// 客户评价导出工具：满意度整理、导出校验、CSV 生成与下载

// 满意度等级（5 星最高，依次递减）
const SATISFACTION_LABELS = {
  5: '非常满意',
  4: '满意',
  3: '一般',
  2: '不满意',
  1: '非常不满意'
}

export function satisfactionLabel(rating) {
  return SATISFACTION_LABELS[rating] || '未评分'
}

// 导出前校验：返回错误原因数组，空数组表示校验通过
// 任一问题存在时都不应生成残缺文件
export function validateTestimonials(items) {
  const errors = []

  if (!items || items.length === 0) {
    errors.push('导出范围为空：请先勾选需要导出的客户评价。')
    return errors
  }

  // 作者缺失：评价人或评价人介绍为空
  const missingAuthor = items.filter(
    t => !t.name || !t.name.trim() || !t.title || !t.title.trim()
  )
  if (missingAuthor.length > 0) {
    const preview = missingAuthor
      .map(t => `「${truncate(t.content)}」`)
      .join('、')
    errors.push(
      `作者信息缺失：${missingAuthor.length} 条评价缺少评价人或介绍（${preview}），请取消勾选后重试。`
    )
  }

  // 评价内容重复：同一批导出内容中出现完全相同的评价
  const contentGroups = new Map()
  items.forEach(t => {
    const key = (t.content || '').trim()
    contentGroups.set(key, (contentGroups.get(key) || 0) + 1)
  })
  const duplicated = [...contentGroups.entries()].filter(
    ([content, count]) => content && count > 1
  )
  if (duplicated.length > 0) {
    const preview = duplicated
      .map(([content]) => `「${truncate(content)}」`)
      .join('、')
    errors.push(
      `评价内容重复：发现 ${duplicated.length} 组重复内容（${preview}），每组仅保留一条后才能导出。`
    )
  }

  return errors
}

// 按满意度从高到低整理（同满意度保持原有先后顺序）
export function sortBySatisfaction(items) {
  return [...items].sort((a, b) => (b.rating || 0) - (a.rating || 0))
}

// 生成 CSV 文本（含满意度、评价人介绍与来源案例）
export function buildCsv(items) {
  const header = ['满意度', '评价内容', '评价人', '评价人介绍', '来源案例']
  const rows = sortBySatisfaction(items).map(t => [
    `${satisfactionLabel(t.rating)}(${t.rating}星)`,
    t.content,
    t.name,
    t.title,
    t.sourceCase
  ])
  return [header, ...rows]
    .map(row => row.map(escapeCell).join(','))
    .join('\r\n')
}

// 触发浏览器下载（加 BOM 保证 Excel 打开中文不乱码）
export function downloadCsv(csv) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `客户评价整理_${formatTimestamp(new Date())}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function escapeCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function truncate(text, max = 12) {
  const normalized = (text || '').trim()
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized
}

function formatTimestamp(date) {
  const pad = n => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}
