import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RunsPage } from './pages/RunsPage';
import { SerpPage } from './pages/SerpPage';
import { AnalysesPage } from './pages/AnalysesPage';
import { KeywordsPage } from './pages/KeywordsPage';

export default function App() {
  return (
    <BrowserRouter basename="/lacoste-seo">
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<RunsPage />} />
          <Route path="/serp" element={<SerpPage />} />
          <Route path="/analyses" element={<AnalysesPage />} />
          <Route path="/keywords" element={<KeywordsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
