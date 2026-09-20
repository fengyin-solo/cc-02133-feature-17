import { computed, ref } from 'vue'

// 模块级状态：组件卸载（切换案例页签、跳转其他页面后返回）后选择依然保留
const selectedIds = ref([])

export function useTestimonialSelection() {
  const selectedCount = computed(() => selectedIds.value.length)

  const isSelected = id => selectedIds.value.includes(id)

  const toggle = id => {
    if (isSelected(id)) {
      selectedIds.value = selectedIds.value.filter(item => item !== id)
    } else {
      selectedIds.value = [...selectedIds.value, id]
    }
  }

  const selectAll = ids => {
    selectedIds.value = [...ids]
  }

  const clear = () => {
    selectedIds.value = []
  }

  return {
    selectedIds,
    selectedCount,
    isSelected,
    toggle,
    selectAll,
    clear
  }
}
