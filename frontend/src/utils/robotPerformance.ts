import type {
  RobotPerformanceFilters,
  RobotPerformanceResponse,
} from '../types/dashboard'

export function robotReportToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (name: string) => parts.find((item) => item.type === name)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function robotReportRange(
  period: 'day' | 'week',
  now = new Date(),
): Pick<RobotPerformanceFilters, 'start_date' | 'end_date'> {
  const today = robotReportToday(now)
  const start = new Date(`${today}T00:00:00Z`)
  if (period === 'week') start.setUTCDate(start.getUTCDate() - 6)
  return { start_date: start.toISOString().slice(0, 10), end_date: today }
}

export function robotReportShouldPoll(
  range: Pick<RobotPerformanceFilters, 'start_date' | 'end_date'>,
  now = new Date(),
): boolean {
  const today = robotReportToday(now)
  return range.start_date <= today && today <= range.end_date
}

export function buildRobotSpeedSeries(report: RobotPerformanceResponse) {
  const robots = report.robots.filter((robot) => robot.device_num !== null)
  return {
    robots: robots.map((robot, index) => ({
      device: robot.device_num as string,
      key: `speed_${index}`,
    })),
    points: report.points.map((point) => {
      const values: Record<string, number | null> = {}
      robots.forEach((robot, index) => {
        values[`speed_${index}`] =
          point.robots.find((entry) => entry.device_num === robot.device_num)
            ?.average_speed_mps ?? null
      })
      return { label: point.label, point, ...values }
    }),
  }
}
