import { Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';

// Placeholder screens; replaced as Phase 2 tasks land.
function Placeholder({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Placeholder title="Today" />} />
        <Route path="/new" element={<Placeholder title="New habit" />} />
        <Route path="/habit/:id/edit" element={<Placeholder title="Edit habit" />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
      </Route>
    </Routes>
  );
}
