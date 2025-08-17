import React, { useState, useEffect } from 'react';
import { fetchTodayCount } from '../utils/fetchTodayCount.js';
import { SAVE_URL } from '../config.js';

// Checklist labels
const checklistLabels = [
  "सर्विस हिस्ट्री देखें और ग्राहक को सुझाव दें",
  "गियर ऑयल स्तर जांचें",
  "इंजन ऑयल स्तर जांचें",
  "डिफरेंशियल ऑयल स्तर जांचें",
  "कूलेंट स्तर जांचें , कूलेंट की गुणवत्ता जांचें",
  "ब्रेक सेटिंग और ब्रेक लाइनर जांचें",
  "क्लच सेटिंग और क्लच पार्ट्स जांचें",
  "व्हील अलाइनमेंट के लिए सुझाव दें",
  "लैपटॉप जांच के लिए सुझाव दिया गया",
  "सभी एयर होसेस जांचें",
  "फ्यूल पाइप जांचें",
  "कूलंट पाइप जांचें",
  "एयर फिल्टर की स्थिति और इंडिकेटर जांचें",
  "इंजन माउंटिंग जांचें",
  "टैंक कैप और डीजल टैंक कैप जांचें",
  "स्टेरिंग ऑयल स्तर और लीक जांचें",
  "बैटरी वाटर, बल्ब, फ्यूज जांचें",
  "वाइपर ब्लेड जांचें",
  "यूरिया लेवल जांचें , यूरिया(DEF) की गुणवत्ता जांचें",
  "फैन बेल्ट जांचें",
  "एसी गैस रिफिलिंग",
  "रेट्रो जांचें",
  "लोड झेलने वाले जोइंट्स की ग्रेसिंग जांचें"
];

// Helper to format datetime to "dd/MM/yyyy HH:mm:ss"
function formatDateTime(dateObj) {
  // Send in ISO format: yyyy-MM-ddTHH:mm:ss
  return dateObj.toISOString().slice(0,19); // "2025-08-14T14:30:00"
}


const ChecksheetForm = () => {
  const [formData, setFormData] = useState({
    datetime: '',
    registration: '',
    kilometers: '',
    model: '',
    otherIssue: '',
    items: checklistLabels.map(() => ({ status: 'हाँ', remark: 'ठीक है' }))
  });

  const [todayCount, setTodayCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // On mount: set current datetime and fetch today's count
  useEffect(() => {
    const now = new Date();
    setFormData(prev => ({
      ...prev,
      datetime: formatDateTime(now)
    }));

    fetchTodayCount().then(setTodayCount);
  }, []);

  const handleChange = (index, value) => {
    const updatedItems = [...formData.items];
    updatedItems[index].status = value;
    updatedItems[index].remark = value === 'नहीं' ? '' : 'ठीक है';
    setFormData({ ...formData, items: updatedItems });
  };

  const handleRemarkChange = (index, value) => {
    const updatedItems = [...formData.items];
    updatedItems[index].remark = value;
    setFormData({ ...formData, items: updatedItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    // Ensure Other Issue defaults to "ठीक है"
    const finalFormData = {
      ...formData,
      otherIssue: formData.otherIssue && formData.otherIssue.trim() !== '' 
        ? formData.otherIssue 
        : 'ठीक है'
    };

    try {
      const response = await fetch(SAVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalFormData),
      });

      if (response.ok) {
        alert('✅ सेव हो गया!');
        setFormData({
          datetime: formatDateTime(new Date()),
          registration: '',
          kilometers: '',
          model: '',
          otherIssue: '',
          items: checklistLabels.map(() => ({ status: 'हाँ', remark: 'ठीक है' }))
        });

        const newCount = await fetchTodayCount();
        setTodayCount(newCount);
      } else {
        alert('❌ कुछ गलत हो गया!');
      }
    } catch (err) {
      console.error(err);
      alert('❌ नेटवर्क समस्या! कृपया नेटवर्क कनेक्शन जांचें और दोबारा प्रयास करें।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <h2 style={{ textAlign: 'center' }}>🔧 जनरल चेकअप फॉर्सट</h2>
      <p>आज की कुल एंट्री: <strong>{todayCount}</strong></p>

      <form onSubmit={handleSubmit}>
        <label>वाहन नंबर:</label>
        <input
          style={{ backgroundColor: '#E3E7FF' }}
          value={formData.registration}
          onChange={(e) => {
            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            setFormData({ ...formData, registration: val });
          }}
          required
        />

        <label>किलोमीटर:</label>
        <input
          style={{ backgroundColor: '#E3E7FF' }}
          value={formData.kilometers}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 8);
            setFormData({ ...formData, kilometers: val });
          }}
          required
        />

        <label>मॉडल नंबर:</label>
        <input
          style={{ backgroundColor: '#E3E7FF' }}
          value={formData.model}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 4);
            setFormData({ ...formData, model: val });
          }}
          required
        />

        <p style={{ fontWeight: 'bold', border: '1px solid white' }}>
          📅 दिनांक और समय: {formData.datetime}
        </p>

        {checklistLabels.map((label, index) => (
          <div
            key={index}
            style={{
              marginTop: '10px',
              backgroundColor: '#E3E7FF',
              padding: '4px',
              margin: '3px',
              borderRadius: '3px',
              fontWeight: 'bold',
            }}
          >
            <label>{index + 1}. {label}</label><br />
            <select
              style={{ backgroundColor: '#7187F0', color: 'white' }}
              value={formData.items[index].status}
              onChange={(e) => handleChange(index, e.target.value)}
            >
              <option value="हाँ">✅</option>
              <option value="नहीं">❌</option>
            </select>
            {formData.items[index].status === 'नहीं' && (
              <input
                style={{ backgroundColor: '#E3E7FF', border: '1px solid black' }}
                type="text"
                placeholder="टिप्पणी दर्ज करें"
                value={formData.items[index].remark}
                onChange={(e) => handleRemarkChange(index, e.target.value)}
                required
              />
            )}
          </div>
        ))}

        <label style={{ fontWeight: 'bold' }}>🛠️ अन्य समस्या (अगर कोई हो):</label>
        <textarea
          value={formData.otherIssue || ''}
          onChange={(e) => setFormData({ ...formData, otherIssue: e.target.value })}
          placeholder="यहाँ कोई और दिक्कत लिखें..."
          rows={3}
          style={{ width: '100%', marginBottom: '0rem', backgroundColor: '#E3E7FF' }}
        ></textarea>

        <p>🔖 एडवाइजर: <strong>Ranveer Singh Rathore</strong></p>

        <button type="submit" disabled={submitting}>✅ सबमिट करें</button>
      </form>
    </div>
  );
};

export default ChecksheetForm;
