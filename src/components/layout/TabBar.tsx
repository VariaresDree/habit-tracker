import { NavLink } from 'react-router-dom';

export default function TabBar() {
  return (
    <nav className="tab-bar">
      <NavLink to="/" end>
        Today
      </NavLink>
      <NavLink to="/new">New</NavLink>
      <NavLink to="/settings">Settings</NavLink>
    </nav>
  );
}
