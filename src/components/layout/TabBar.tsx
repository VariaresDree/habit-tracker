import { NavLink } from 'react-router-dom';
import Icon from '../common/Icon';

// Destinations only — creating a habit is an action, and lives as a "+" on
// the screens where you'd want it.
export default function TabBar() {
  return (
    <nav className="tab-bar">
      <NavLink to="/" end>
        <Icon name="home" />
        <span>Today</span>
      </NavLink>
      <NavLink to="/habits">
        <Icon name="list" />
        <span>Habits</span>
      </NavLink>
      <NavLink to="/settings">
        <Icon name="settings" />
        <span>Settings</span>
      </NavLink>
    </nav>
  );
}
