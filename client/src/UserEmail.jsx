import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css'

function UserEmail() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [file, setFile] = useState(null);
  const [body, setBody] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [throttleLimit, setThrottleLimit] = useState(10);
  const [subject, setSubject] = useState('')

//   useEffect(() => {
//     const handleAuthMessage = (event) => {
//       if (event.data === 'authenticated') {
//         setIsAuthenticated(true);
//       }
//     };

//     window.addEventListener('message', handleAuthMessage);
//     return () => window.removeEventListener('message', handleAuthMessage);
//   }, []);

  // Poll for analytics data every 5 seconds
//   useEffect(() => {
//     if (isAuthenticated) {
//       const intervalId = setInterval(fetchAnalyticsData, 2000);
//       return () => clearInterval(intervalId);
//     }
//   }, [isAuthenticated]);

//   const handleGoogleAuth = () => {
//     window.open('http://localhost:3000/auth/google', '_blank', 'width=500,height=600');
//   };

//   const fetchAnalyticsData = async () => {
//     try {
//       const response = await axios.get('http://localhost:3000/analytics');
//       setAnalyticsData(response.data);
//     } catch (error) {
//       console.error('Error fetching analytics data:', error);
//     }
//   };

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file) {
      alert("Please upload a CSV file.");
      return;
    }

    const formData = new FormData();
    formData.append('csvFile', file);
    formData.append('subject', subject);
    formData.append('body', body);
    formData.append('scheduleTime', scheduleTime);
    formData.append('throttleLimit', throttleLimit);

    try {
      await axios.post('http://localhost:3000/send-bulk-emails/user', formData, {
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
      {/* <h1>Email Scheduler and Analytics</h1> */}

        <div>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", maxWidth: "400px" }}>
            <div>              
          <h2>create your Emails yourself</h2>
            Please Upload CSV
            <input className='csvBtn' type="file" onChange={handleFileChange} accept=".csv" />
            </div>

            <div>
              <div>Subject</div>
            <textarea
              className='promptInput'
              placeholder="Enter subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              rows="4"
              style={{ margin: "10px 0" }}
            />
            </div>
            <div>
              <div>Body</div>
            <textarea
              className='promptInput'
              placeholder="Tell us your name, passion, projects, etc"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows="4"
              style={{ margin: "10px 0" }}
            />
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

          {/* <h2>Email Analytics</h2>
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
                  <td>{new Date(email.sendTime).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table> */}
        </div>
    </div>
  );
}

export default UserEmail;