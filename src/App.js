import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ChecksheetForm from './components/ChecksheetForm.js';
import ViewEntries from './components/ViewEntries.js';

const App = () => {
  return (
    <Router>
      <nav style={{ padding: '1rem', background: '#eee', textAlign: 'center' }}>
        <Link to="/" style={{ margin: '1rem' }}>🔧 चेकशीट फॉर्म</Link>
        <Link to="/entries" style={{ margin: '1rem' }}>📋 सभी एंट्री</Link>
      </nav>

      <Routes>
        <Route path="/" element={<ChecksheetForm />} />
        <Route path="/entries" element={<ViewEntries />} />
      </Routes>
    </Router>
  );
};

export default App;
