const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const fs = require('fs');
const csv = require('csv-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

let userTokens = null;
let userEmail = null;

mongoose.connect(process.env.MONGO_URI);

const emailQueueSchema = new mongoose.Schema({
  from: String,
  to: String,
  subject: String,
  body: String,
  sendTime: Date,
  status: { type: String, default: 'scheduled' },
  companyName: String,
  userEmail: String,
});
const EmailQueue = mongoose.model('EmailQueue', emailQueueSchema);

// This route is for authentication via google OAuth
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/userinfo.email'],
  });
  res.redirect(url);
});

//This route is for collecting some information after successful authentication
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    userTokens = tokens;

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2',
    });
    const userInfo = await oauth2.userinfo.get();
    userEmail = userInfo.data.email;

    res.send(
      `<script>window.opener.postMessage('authenticated', 'http://localhost:5173');window.close();</script>`
    );
  } catch (error) {
    console.error('Error during token exchange:', error);
    res.status(500).send('Authentication failed');
  }
});

//This route is for sending mails
app.post('/send-bulk-emails', upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is missing. Please upload a valid CSV file.' });
  }

  const throttleLimit = parseInt(req.body.throttleLimit, 10) || 10;
  const scheduleTime = new Date(req.body.scheduleTime) || new Date();
  const instructions = req.body.instructions || '';
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  let csvData = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => {
      csvData.push(data);
    })
    .on('end', async () => {
      try {
        for (const row of csvData) {
          const rowString = JSON.stringify(row);
          const prompt = `strict Rule: Dont leave any blank spaces or placeholders to be filled by me. Generate a professional email in JSON format with "CompanyName", "to", "subject", and "body" fields filled in completely. Dont ask further details. These are the details of company along with mail id${rowString} and these are my details ${instructions}`;

          const result = await model.generateContent(prompt);
          const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            console.error('Failed to extract JSON from response');
            continue;
          }

          const emailData = JSON.parse(jsonMatch[0]);
          console.log(emailData)
          const companyName = emailData.CompanyName;

          if (!emailData.to || !emailData.subject || !emailData.body) {
            console.error('Invalid email data generated, missing fields:', emailData);
            await EmailQueue.create({
              ...emailData,
              from: userEmail,
              status: 'failed',
              userEmail,
              companyName,
            });
            continue;
          }

          await EmailQueue.create({
            ...emailData,
            from: userEmail,
            sendTime: scheduleTime,
            throttleLimit,
            userEmail,
            companyName,
          });
        }
        res.json({ success: true, message: 'Emails scheduled successfully' });
      } catch (error) {
        console.error('Error scheduling emails:', error);
        res.status(500).json({ error: 'Failed to schedule emails' });
      } finally {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
    });
});

app.post('/send-bulk-emails/user', upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is missing. Please upload a valid CSV file.' });
  }

  const throttleLimit = parseInt(req.body.throttleLimit, 10) || 10;
  const scheduleTime = new Date(req.body.scheduleTime) || new Date();
  const body = req.body.body || '';
  const subject = req.body.subject || '';
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  let csvData = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => {
      csvData.push(data);
    })
    .on('end', async () => {
      try {
        for (const row of csvData) {
          const rowString = JSON.stringify(row);
          const prompt = `Extract all the details and giveit to me in json format with keys "to", "CompanyName" from here -> ${rowString}`;

          const result = await model.generateContent(prompt);
          const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            console.error('Failed to extract JSON from response');
            continue;
          }

          const emailData = JSON.parse(jsonMatch[0]);
          console.log(emailData)
          const companyName = emailData.CompanyName;

          if (!emailData.to) {
            console.error('Invalid email data generated, missing fields:', emailData);
            await EmailQueue.create({
              ...emailData,
              body,
              subject,
              from: userEmail,
              status: 'failed',
              userEmail,
              companyName,
            });
            continue;
          }

          await EmailQueue.create({
            ...emailData,
            body,
            subject,
            from: userEmail,
            sendTime: scheduleTime,
            throttleLimit,
            userEmail,
            companyName,
          });
        }
        res.json({ success: true, message: 'Emails scheduled successfully' });
      } catch (error) {
        console.error('Error scheduling emails:', error);
        res.status(500).json({ error: 'Failed to schedule emails' });
      } finally {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
    });
});

// Cron is used to send mails at scheduled time
cron.schedule('* * * * *', async () => {
  const now = new Date();

  const pendingEmails = await EmailQueue.find({
    status: 'scheduled',
    sendTime: { $lte: now },
  }).sort({ sendTime: 1 });

  if (pendingEmails.length === 0) {
    console.log('No emails to send at this time.');
    return;
  }

  const emailsByThrottleLimit = pendingEmails.reduce((acc, email) => {
    const throttleLimit = email.throttleLimit || 10;
    acc[throttleLimit] = acc[throttleLimit] || [];
    acc[throttleLimit].push(email);
    return acc;
  }, {});

  for (const [throttleLimit, emails] of Object.entries(emailsByThrottleLimit)) {
    const emailsToSend = emails.slice(0, throttleLimit);

    for (const email of emailsToSend) {
      try {
        if (userTokens.expiry_date && userTokens.expiry_date <= Date.now()) {
          const newTokens = await oauth2Client.refreshAccessToken();
          oauth2Client.setCredentials(newTokens.credentials);
          userTokens = newTokens.credentials;
        }

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const rawEmail = Buffer.from(
          `From: ${email.from}\r\nTo: ${email.to}\r\nSubject: ${email.subject}\r\n\r\n${email.body}`
        )
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: rawEmail },
        });

        email.status = 'sent';
      } catch (error) {
        console.error('Error sending email:', error);
        email.status = 'failed';
      }
      await email.save();
    }
  }
});

// Analytics endpoint to fetch real time data from db
app.get('/analytics', async (req, res) => {
  try {
    const analyticsData = await EmailQueue.find({ userEmail }).select('companyName to status sendTime');
    res.json(analyticsData);
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});