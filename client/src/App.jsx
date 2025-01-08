import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css'
import UserEmail from './UserEmail'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [file, setFile] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [instructions, setInstructions] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [throttleLimit, setThrottleLimit] = useState(10);

  useEffect(() => {
    const handleAuthMessage = (event) => {
      if (event.data === 'authenticated') {
        setIsAuthenticated(true);
      }
    };

    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
  }, []);

  // Poll for analytics data every 5 seconds
  useEffect(() => {
    if (isAuthenticated) {
      const intervalId = setInterval(fetchAnalyticsData, 2000);
      return () => clearInterval(intervalId);
    }
  }, [isAuthenticated]);

  const handleGoogleAuth = () => {
    window.open('https://mail-automation.onrender.com/auth/google', '_blank', 'width=500,height=600');
  };

  const fetchAnalyticsData = async () => {
    try {
      const response = await axios.get('https://mail-automation.onrender.com/analytics');
      setAnalyticsData(response.data);
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    }
  };

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleAttachmentChange = (event) => {
    setAttachment(event.target.files[0]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file) {
      alert("Please upload a CSV file.");
      return;
    }

    const formData = new FormData();
    formData.append('csvFile', file);
    if (attachment) {
      formData.append('attachment', attachment);
    }
    formData.append('instructions', instructions);
    formData.append('scheduleTime', scheduleTime);
    formData.append('throttleLimit', throttleLimit);

    try {
      await axios.post('https://mail-automation.onrender.com/send-bulk-emails', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      alert('Emails scheduled successfully!');
    } catch (error) {
      console.error('Error scheduling emails:', error);
      alert('Failed to schedule emails. Please try again.');
    }
  };

  return (
    <div className="App" style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Email Scheduler and Analytics</h1>

      {!isAuthenticated ? (
        <button className='authBtn' onClick={handleGoogleAuth}>Authenticate with Google</button>
      ) : (
        <div>


          <div className='form-container'>
                    <UserEmail/>

          <form className='form1' onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", maxWidth: "400px" }}>
          <h2> Ask AI to create and send your Emails</h2>
            <div>              
            Please Upload CSV
            <input className='csvBtn' type="file" onChange={handleFileChange} accept=".csv" />
            </div>

            <div>
              <div>Your details...</div>
            <textarea
              className='promptInput'
              placeholder="Tell us your name, passion, projects, etc"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows="4"
              style={{ margin: "10px 0" }}
            />
            </div>

            <div>
              <div>Attachment</div>
              <input type="file" onChange={handleAttachmentChange} accept=".pdf,.doc,.docx,.jpg,.png" style={{ marginBottom: "10px" }} />
            </div>

            <div>
             <div>Schedule your Mail</div>
            <input
              type="datetime-local"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              style={{ marginBottom: "10px" }}
            />
            </div>

            <div>
               <div>Throttle(Mails per minute)</div>
            <input
              type="number"
              placeholder="Throttle Limit (default: 10)"
              value={throttleLimit}
              onChange={(e) => setThrottleLimit(e.target.value)}
              min="1"
              style={{ marginBottom: "10px" }}
            />
            <div><button className='sendBtn' type="submit">Schedule Emails</button> </div>
            </div>
          </form>

          </div>

          <h2>Email Analytics</h2>
          <table border="1" cellPadding="10" cellSpacing="0" style={{ marginTop: "20px", width: "100%" }}>
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Recipient</th>
                <th>Sent Status</th>
                <th>Scheduled Time</th>
              </tr>
            </thead>
            <tbody>
              {analyticsData.map((email, index) => (
                <tr key={index}>
                  <td>{email.companyName}</td>
                  <td>{email.to}</td>
                  <td>{email.status}</td>
                  <td>{new Date(email.sendTime).toISOString().replace('T', ' ').substring(0, 16)}</td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
