import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ChecksheetForm from './components/ChecksheetForm.js';
import ViewEntries from './components/ViewEntries.js';
import ManagerDashboard from './components/ManagerDashboard.js';
import TodayVehicle from './components/TodayVehicle.js';   // ⭐ NEW PAGE

const App = () => {
  return (
    <Router>
      <nav style={{ padding: '1rem', background: '#eee', textAlign: 'center' }}>
        <Link to="/" style={{ margin: '1rem' }}>🔧 चेकशीट फॉर्म</Link>
        <Link to="/entries" style={{ margin: '1rem' }}>📋 सभी एंट्री</Link>
        <Link to="/today" style={{ margin: '1rem' }}>🚗 Today Vehicles</Link> {/* ⭐ NEW MENU */}
      </nav>

      <Routes>
        <Route path="/" element={<ChecksheetForm />} />
        <Route path="/entries" element={<ViewEntries />} />
        <Route path="/manager" element={<ManagerDashboard />} />
        <Route path="/today" element={<TodayVehicle />} />  {/* ⭐ NEW PAGE */}
      </Routes>
    </Router>
  );
};

export default App;
