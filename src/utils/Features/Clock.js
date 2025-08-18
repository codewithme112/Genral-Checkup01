import React, { useState, useEffect } from 'react';

const Clock = () => {
  const [time, setTime] = useState('');

  // Function to get current IST time in Hindi format
  const getCurrentISTTime = () => {
    const now = new Date();

    // Convert to IST (UTC+5:30)
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const istOffset = 5.5 * 60 * 60000; // 5 hours 30 minutes in ms
    const istDate = new Date(utc + istOffset);

    const day = istDate.getDate();
    const month = istDate.getMonth() + 1; // 0-indexed
    const year = istDate.getFullYear();
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const seconds = istDate.getSeconds();

    const period = hours >= 12 ? 'शाम' : 'सुबह';
    const hr12 = hours % 12 === 0 ? 12 : hours % 12;

    return `${day} अगस्त ${year}, ${period} ${hr12
      .toString()
      .padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')} बजे`;
  };

  useEffect(() => {
    setTime(getCurrentISTTime()); // initial time
    const interval = setInterval(() => {
      setTime(getCurrentISTTime());
    }, 1000); // every second
    return () => clearInterval(interval); // cleanup
  }, []);

  return (
    <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
      🕒 वर्तमान समय: {time}
    </div>
  );
};

export default Clock;
