import { Link, useNavigate, useParams } from 'react-router-dom';
import { useHabitHistory } from '../../hooks/useHabitHistory';
import { useAppStore } from '../../store/useAppStore';
import EmptyState from '../common/EmptyState';
import Icon from '../common/Icon';
import Heatmap from './Heatmap';
import StatsPanel from './StatsPanel';
import StreakBadge from './StreakBadge';

export default function HabitDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const habitId = id ?? '';
  const habit = useAppStore((s) => s.habits.find((h) => h.id === habitId));
  const archiveHabit = useAppStore((s) => s.archiveHabit);
  const deleteHabit = useAppStore((s) => s.deleteHabit);
  const history = useHabitHistory(habitId);

  if (!habit) {
    return <EmptyState message="Habit not found." />;
  }

  const archive = async () => {
    await archiveHabit(habit.id);
    navigate('/');
  };

  const remove = async () => {
    if (window.confirm(`Delete "${habit.name}" and all its history?`)) {
      await deleteHabit(habit.id);
      navigate('/');
    }
  };

  return (
    <div className="habit-detail">
      <header className="detail-header">
        <h1>
          {habit.emoji} {habit.name}
        </h1>
        <Link className="detail-edit" to={`/habit/${habit.id}/edit`}>
          <Icon name="pencil" size={18} />
          Edit
        </Link>
      </header>

      <StreakBadge history={history} target={habit.target} />
      <Heatmap checkins={history} target={habit.target} color={habit.color} />
      <StatsPanel history={history} habit={habit} />

      <div className="detail-actions">
        <button onClick={() => void archive()}>
          <Icon name="archive" size={18} />
          Archive
        </button>
        <button className="danger" onClick={() => void remove()}>
          <Icon name="trash" size={18} />
          Delete
        </button>
      </div>
    </div>
  );
}
