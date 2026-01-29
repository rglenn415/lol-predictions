import { useMemo } from 'react';
import './DaySelector.css';

interface DaySelectorProps {
  days: string[];
  selectedDay: string;
  onSelectDay: (day: string) => void;
  matchCounts: Record<string, number>;
}

const VISIBLE_COUNT = 5;

function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === tomorrow.getTime()) return 'Tomorrow';
  if (target.getTime() === yesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function DaySelector({ days, selectedDay, onSelectDay, matchCounts }: DaySelectorProps) {
  const currentIndex = days.indexOf(selectedDay);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < days.length - 1;

  const visibleDays = useMemo(() => {
    const half = Math.floor(VISIBLE_COUNT / 2);
    let start = Math.max(0, currentIndex - half);
    let end = start + VISIBLE_COUNT;
    if (end > days.length) {
      end = days.length;
      start = Math.max(0, end - VISIBLE_COUNT);
    }
    return days.slice(start, end);
  }, [days, currentIndex]);

  const goTo = (offset: number) => {
    const next = currentIndex + offset;
    if (next >= 0 && next < days.length) {
      onSelectDay(days[next]);
    }
  };

  if (days.length === 0) return null;

  return (
    <div className="day-selector">
      <button
        className="day-arrow"
        onClick={() => goTo(-1)}
        disabled={!hasPrev}
        aria-label="Previous day"
      >
        &#9664;
      </button>

      <div className="day-tabs">
        {visibleDays.map(day => (
          <button
            key={day}
            className={`day-tab ${day === selectedDay ? 'active' : ''}`}
            onClick={() => onSelectDay(day)}
          >
            <span className="day-label">{formatDayLabel(day)}</span>
            <span className="day-count">{matchCounts[day] || 0}</span>
          </button>
        ))}
      </div>

      <button
        className="day-arrow"
        onClick={() => goTo(1)}
        disabled={!hasNext}
        aria-label="Next day"
      >
        &#9654;
      </button>
    </div>
  );
}
