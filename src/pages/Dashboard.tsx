import { DashboardPage } from '../modules/Pages'
export default function Dashboard({ onOpenExpiringLots }: { onOpenExpiringLots: () => void }) { return <DashboardPage openLots={onOpenExpiringLots} /> }
