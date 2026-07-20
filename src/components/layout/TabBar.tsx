import { NavLink } from 'react-router-dom';
import Icon from '../common/Icon';

export default function TabBar() {
  return (
    <nav className="tab-bar">
      <NavLink to="/" end>
        <Icon name="home" />
        <span>Today</span>
      </NavLink>
      <NavLink to="/new">
        <Icon name="plus" />
        <span>New</span>
      </NavLink>
      <NavLink to="/settings">
        <Icon name="settings" />
        <span>Settings</span>
      </NavLink>
    </nav>
  );
}
