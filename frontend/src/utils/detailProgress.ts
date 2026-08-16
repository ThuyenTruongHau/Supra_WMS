const DETAIL_STATUS_WEIGHT: Record<string, number> = {
  initialize: 0,
  reserved: 0.25,
  in_progress: 0.5,
  completed: 1,
};

export type DetailProgressCounts = {
  initialize: number;
  reserved: number;
  in_progress: number;
  completed: number;
};

export function computeDetailProgress(details: { status: string }[]) {
  const counts: DetailProgressCounts = {
    initialize: 0,
    reserved: 0,
    in_progress: 0,
    completed: 0,
  };
  let weightedScore = 0;

  for (const detail of details) {
    const status = detail.status in counts ? detail.status : "initialize";
    counts[status as keyof DetailProgressCounts] += 1;
    weightedScore += DETAIL_STATUS_WEIGHT[status] ?? 0;
  }

  const total = details.length;
  return {
    totalCount: total,
    completedCount: counts.completed,
    progressPercent:
      total > 0 ? Math.round((weightedScore / total) * 100) : 0,
    allInitialize: total > 0 && counts.initialize === total,
    statusCounts: counts,
  };
}
