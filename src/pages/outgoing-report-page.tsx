import { RestockRecommendations } from '@/components/reports/restock-recommendations'
import { OutgoingReportPage as BaseOutgoingReportPage } from '@/pages/report-pages'

export function OutgoingReportPage() {
  return (
    <div className="space-y-5">
      <RestockRecommendations />
      <BaseOutgoingReportPage />
    </div>
  )
}
