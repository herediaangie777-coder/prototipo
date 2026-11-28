export function estimateFrozenBags(
  quantityKg: number | string,
  estimatedLossKg: number | string,
  packWeightKg: number | string,
): number | null {
  const quantity = Number(quantityKg)
  const loss = Number(estimatedLossKg)
  const packWeight = Number(packWeightKg)
  if (!Number.isFinite(quantity) || quantity <= 0
    || !Number.isFinite(loss) || loss < 0 || loss > quantity
    || !Number.isFinite(packWeight) || packWeight <= 0) {
    return null
  }
  const netMilliKg = Math.round((quantity - loss) * 1000)
  const packMilliKg = Math.round(packWeight * 1000)
  return packMilliKg > 0 ? Math.floor(netMilliKg / packMilliKg) : null
}
