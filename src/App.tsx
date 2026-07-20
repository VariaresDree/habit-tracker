import { Route, Routes } from 'react-router-dom';
import CheckinScreen from './components/checkin/CheckinScreen';
import ReloadPrompt from './components/common/ReloadPrompt';
import HabitDetailScreen from './components/detail/HabitDetailScreen';
import AppShell from './components/layout/AppShell';
import HabitFormScreen from './components/manage/HabitFormScreen';
import HabitsScreen from './components/manage/HabitsScreen';
import SettingsScreen from './components/manage/SettingsScreen';

export default function App() {
  return (
    <>
      <ReloadPrompt />
      <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<CheckinScreen />} />
        <Route path="/habits" element={<HabitsScreen />} />
        <Route path="/new" element={<HabitFormScreen />} />
        <Route path="/habit/:id" element={<HabitDetailScreen />} />
        <Route path="/habit/:id/edit" element={<HabitFormScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Route>
      </Routes>
    </>
  );
}
