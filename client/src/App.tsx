import { Navigate, Route, Routes } from 'react-router-dom';
import { Frame } from './frame/Frame';
import { CharacterSheetPage } from './pages/CharacterSheetPage';
import { CityHubPage } from './pages/CityHubPage';
import { CreateCharacterPage } from './pages/CreateCharacterPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { useSession } from './session/SessionContext';

export function App() {
  const { status } = useSession();

  if (status === 'loading') {
    return <div className="loading-screen">Loading...</div>;
  }

  if (status === 'anonymous') {
    return (
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  if (status === 'needsCharacter') {
    return <CreateCharacterPage />;
  }

  return (
    <Routes>
      <Route element={<Frame />}>
        <Route path="/" element={<CityHubPage />} />
        <Route path="/character" element={<CharacterSheetPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
