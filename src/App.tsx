import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { OverlayProvider } from './ui/overlay';
import Home from './screens/Home';
import Collection from './screens/Collection';
import AddEntry from './screens/AddEntry';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <OverlayProvider>
        <ScrollToTop />
        <div className="app-frame">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/books" element={<Collection kind="books" />} />
            <Route path="/games" element={<Collection kind="games" />} />
            <Route path="/add" element={<AddEntry />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </OverlayProvider>
    </HashRouter>
  );
}
