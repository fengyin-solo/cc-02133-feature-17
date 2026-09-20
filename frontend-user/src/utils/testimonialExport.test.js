import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateSelection,
  sortBySatisfaction,
  buildCsv,
  downloadTestimonials,
  normalizeContent,
  formatTimestamp,
  CSV_HEADERS
} from './testimonialExport.js'

const base = {
  rating: 5,
  content: '系统很好用，效率提升明显。',
  name: '王经理',
  title: '某电商平台物流总监',
  caseId: 'c1'
}

const caseMap = { c1: '某大型电商平台', c2: '某知名快递企业' }

describe('normalizeContent', () => {
  test('合并连续空白与全角空格，用于重复判定', () => {
    assert.equal(normalizeContent('  内容　\n 重复 \t'), '内容 重复')
  })
})

describe('validateSelection', () => {
  test('导出范围为空时返回 empty-range 原因', () => {
    const r1 = validateSelection([])
    assert.equal(r1.valid, false)
    assert.equal(r1.reasons[0].type, 'empty-range')

    const r2 = validateSelection(undefined)
    assert.equal(r2.valid, false)
    assert.equal(r2.reasons[0].type, 'empty-range')
  })

  test('评价人姓名缺失时拒绝并指出具体记录', () => {
    const r = validateSelection([{ ...base, name: '  ' }])
    assert.equal(r.valid, false)
    assert.equal(r.reasons.length, 1)
    assert.equal(r.reasons[0].type, 'missing-author')
    assert.match(r.reasons[0].message, /姓名未填写/)
  })

  test('评价人介绍缺失时拒绝', () => {
    const r = validateSelection([{ ...base, title: '' }])
    assert.equal(r.valid, false)
    assert.equal(r.reasons[0].type, 'missing-author')
    assert.match(r.reasons[0].message, /介绍未填写/)
  })

  test('评价内容为空时拒绝', () => {
    const r = validateSelection([{ ...base, content: '   ' }])
    assert.equal(r.valid, false)
    const types = r.reasons.map(x => x.type)
    assert.ok(types.includes('empty-content'))
  })

  test('评价内容重复（仅空白差异）时拒绝并给出涉及评价人', () => {
    const r = validateSelection([
      { id: 'a', ...base, name: '王经理' },
      { id: 'b', ...base, name: '李总', content: '系统很好用，效率提升明显。\n' }
    ])
    assert.equal(r.valid, false)
    const dup = r.reasons.find(x => x.type === 'duplicate-content')
    assert.ok(dup)
    assert.deepEqual(dup.ids.sort(), ['a', 'b'])
    assert.match(dup.message, /王经理、李总|李总、王经理/)
  })

  test('完整、不重复的集合校验通过', () => {
    const r = validateSelection([
      { id: 'a', ...base },
      { id: 'b', ...base, content: '另一条不同的评价。', name: '李总', title: '某快递企业运营副总', caseId: 'c2' }
    ])
    assert.equal(r.valid, true)
    assert.deepEqual(r.reasons, [])
  })
})

describe('sortBySatisfaction', () => {
  test('按满意度从高到低稳定排序，同星级保持原序', () => {
    const sorted = sortBySatisfaction([
      { id: 'x', rating: 3 },
      { id: 'a', rating: 5 },
      { id: 'y', rating: 5 },
      { id: 'z', rating: 4 }
    ]).map(t => t.id)
    assert.deepEqual(sorted, ['a', 'y', 'z', 'x'])
  })
})

describe('buildCsv', () => {
  test('包含评价人介绍与来源案例，且按满意度降序', () => {
    const csv = buildCsv([
      { id: 'a', rating: 4, content: '不错', name: '李总', title: '某快递企业运营副总', caseId: 'c2' },
      { id: 'b', rating: 5, content: '很好', name: '王经理', title: '某电商平台物流总监', caseId: 'c1' }
    ], caseMap)

    const lines = csv.split('\r\n')
    assert.equal(lines[0], CSV_HEADERS.join(','))
    assert.deepEqual(lines[0].split(','), ['序号', '满意度(星)', '满意度', '评价内容', '评价人', '评价人介绍', '来源案例'])
    assert.equal(lines[1], '1,5星,非常满意,很好,王经理,某电商平台物流总监,某大型电商平台')
    assert.equal(lines[2], '2,4星,满意,不错,李总,某快递企业运营副总,某知名快递企业')
  })

  test('含逗号、引号、换行的字段做 CSV 转义', () => {
    const csv = buildCsv([
      { id: 'a', rating: 5, content: '很好，"ROI"提升\n明显', name: '王,经理', title: '总监', caseId: 'c1' }
    ], caseMap)
    const lines = csv.split('\r\n')
    assert.equal(
      lines[1],
      '1,5星,非常满意,"很好，""ROI""提升\n明显","王,经理",总监,某大型电商平台'
    )
  })

  test('未知 caseId 时给出未关联案例兜底文案，不产生残缺列', () => {
    const csv = buildCsv([{ id: 'a', rating: 5, content: '好', name: '王经理', title: '总监', caseId: 'nope' }], {})
    assert.match(csv, /未关联案例/)
  })
})

describe('downloadTestimonials', () => {
  beforeEach(() => {
    // 确保非法路径不会触达任何浏览器下载 API
    globalThis.document = undefined
    globalThis.Blob = undefined
    globalThis.URL = undefined
  })

  test('校验不通过时不生成文件并返回原因', () => {
    const result = downloadTestimonials([], caseMap)
    assert.equal(result.valid, false)
    assert.equal(result.reasons[0].type, 'empty-range')
  })

  test('校验通过后触发下载并返回文件名与数量', () => {
    let clicked = 0
    let createdBlob = null
    const appended = []

    globalThis.Blob = class {
      constructor(parts) { createdBlob = parts.join('') }
    }
    globalThis.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} }
    globalThis.document = {
      createElement: () => ({
        style: {},
        set href(v) {},
        set download(v) {},
        click: () => { clicked++ }
      }),
      body: {
        appendChild: (el) => appended.push(el),
        removeChild: () => {}
      }
    }

    const result = downloadTestimonials([
      { id: 'a', rating: 5, content: '很好', name: '王经理', title: '总监', caseId: 'c1' }
    ], caseMap)

    assert.equal(result.valid, true)
    assert.equal(result.count, 1)
    assert.match(result.filename, /^客户评价导出_\d{8}_\d{4}\.csv$/)
    assert.equal(clicked, 1)
    assert.ok(createdBlob.startsWith('\uFEFF'))
    assert.match(createdBlob, /非常满意/)
  })
})

describe('formatTimestamp', () => {
  test('输出 YYYYMMDD_HHMM 格式', () => {
    assert.equal(formatTimestamp(new Date(2026, 8, 20, 9, 5)), '20260920_0905')
  })
})
