import { describe, expect, it } from 'vitest'
import { estimateFrozenBags } from './production'

describe('estimateFrozenBags', () => {
  it('estimates whole packs from net kilos and the selected presentation weight', () => {
    expect(estimateFrozenBags(10, 1, 0.5)).toBe(18)
    expect(estimateFrozenBags(10, 1, 1)).toBe(9)
  })

  it('returns zero when net kilos do not make a whole pack and null for invalid inputs', () => {
    expect(estimateFrozenBags(0.9, 0, 1)).toBe(0)
    expect(estimateFrozenBags(2, 3, 0.5)).toBeNull()
    expect(estimateFrozenBags(2, 0, 0)).toBeNull()
  })
})
