import React from 'react';

const formatDate = (rawDate) => {
  const d = new Date(rawDate);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('hi-IN');
};

const formatTime = (rawTime) => {
  const t = new Date(rawTime);
  if (isNaN(t)) return '—';
  return t.toLocaleTimeString('hi-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const PrintableEntry = ({ entry, checklistLabels }) => {
  const otherIssueText = (entry.otherIssue ?? '').toString().trim();

  return (
    <div
      className="print-area"
      style={{
        fontFamily: 'Arial',
        padding: '10px 25px',
        margin: '0 auto',
        maxWidth: '700px',
        fontSize: '12.5px',
        lineHeight: '1.4',
      }}
    >
      <style>
        {`
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              margin: 0;
              padding: 0;
            }
            .print-area {
              width: 100%;
              margin: 0;
              padding: 0 10px;
              page-break-inside: avoid;
            }
            table, tr, td, th {
              page-break-inside: avoid;
            }
            @page {
              margin: 10mm;
            }
          }
        `}
      </style>

      <h2 style={{ textAlign: 'center', fontSize: '16px', margin: '6px 0' }}>
        🔧 जनरल चेकअप फॉर्म
      </h2>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '8px',
        }}
      >
        <p><strong>वाहन नंबर:</strong> {entry.registration}</p>
        <p><strong>किलोमीटर:</strong> {entry.kilometers}</p>
        <p><strong>मॉडल नंबर:</strong> {entry.model}</p>
        <p><strong>📅 तारीख:</strong> {formatDate(entry.dateTime || entry.date)}</p>
        <p><strong>⏰ समय:</strong> {formatTime(entry.dateTime || entry.time)}</p>
      </div>

      <p style={{ margin: '4px 0 8px' }}>
        🔖 <strong>मैकेनिक:</strong> Islam Kham
      </p>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          pageBreakInside: 'avoid',
        }}
      >
        <thead>
          <tr>
            <th style={thStyle}>क्रम संख्या</th>
            <th style={thStyle}>जांच बिंदु</th>
            <th style={thStyle}>स्थिति</th>
            <th style={thStyle}>टिप्पणी</th>
          </tr>
        </thead>
        <tbody>
          {entry.items.map((item, index) => {
            let symbol = '';
            if (item.status === 'हाँ' || item.status === 'OK') symbol = '✅';
            else if (item.status === 'नहीं') symbol = '❌';

            return (
              <tr key={index}>
                <td style={tdStyle}>{index + 1}</td>
                <td style={tdStyle}>{checklistLabels[index]}</td>
                <td style={tdStyle}>{symbol}</td>
                <td style={tdStyle}>{item.status === 'हाँ' || item.status === 'OK' ? 'ठीक है' : (item.remark || '')}</td>
              </tr>
            );
          })}

          <tr>
            <td style={tdStyle}>{checklistLabels.length + 1}</td>
            <td style={tdStyle}>अन्य समस्या</td>
            <td style={tdStyle}>
              {otherIssueText === '' || otherIssueText === 'ठीक है' ? '✅' : '❌'}
            </td>
            <td style={tdStyle}>
              {otherIssueText === '' ? 'ठीक है' : otherIssueText}
            </td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginTop: '12px',
        }}
      >
        <div style={{ fontWeight: 'bold' }}>Ranveer Singh Rathore</div>

        <div style={{ textAlign: 'center' }}>
          <img
            src="/Images/sign.png"
            alt="Signature"
            style={{
              width: '100px',
              objectFit: 'contain',
              marginTop: '4px',
            }}
          />
          <div
            style={{
              borderTop: '1px solid black',
              width: '100px',
              margin: '4px auto 2px auto',
            }}
          ></div>
          <div style={{ fontSize: '11px' }}>हस्ताक्षर (Signature)</div>
        </div>
      </div>
    </div>
  );
};

const thStyle = {
  border: '1px solid #000',
  padding: '4px',
  fontSize: '12px',
  textAlign: 'center',
};

const tdStyle = {
  border: '1px solid #000',
  padding: '3px',
  fontSize: '12px',
  textAlign: 'center',
};

export default PrintableEntry;
