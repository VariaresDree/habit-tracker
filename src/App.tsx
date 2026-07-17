import { Route, Routes } from 'react-router-dom';
import CheckinScreen from './components/checkin/CheckinScreen';
import AppShell from './components/layout/AppShell';
import HabitFormScreen from './components/manage/HabitFormScreen';

// Placeholder until Phase 5 adds notification + archive management.
function SettingsPlaceholder() {
  return <h1>Settings</h1>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<CheckinScreen />} />
        <Route path="/new" element={<HabitFormScreen />} />
        <Route path="/habit/:id/edit" element={<HabitFormScreen />} />
        <Route path="/settings" element={<SettingsPlaceholder />} />
      </Route>
    </Routes>
  );
}
