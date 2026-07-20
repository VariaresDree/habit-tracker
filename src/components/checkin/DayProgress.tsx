const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// The one thing the app never answered before: how is today going?
// The ring is decoration — the sentence beside it is the real answer, so the
// state is never carried by colour alone.
export default function DayProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const fraction = total > 0 ? Math.min(completed / total, 1) : 0;
  const remaining = Math.max(total - completed, 0);
  const allDone = total > 0 && remaining === 0;

  const message = total === 0 ? 'Nothing scheduled' : allDone ? 'All done — nice work.' : `${remaining} to go`;

  return (
    <section className={allDone ? 'day-progress complete' : 'day-progress'}>
      <svg className="progress-ring" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle className="ring-track" cx="32" cy="32" r={RADIUS} />
        <circle
          className="ring-value"
          cx="32"
          cy="32"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        />
      </svg>
      <div className="day-progress-text">
        <strong>
          {completed} of {total} done
        </strong>
        <span>{message}</span>
      </div>
    </section>
  );
}
