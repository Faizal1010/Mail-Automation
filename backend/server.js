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
const mime = require('mime-types');
const path = require('path');



dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir); // Create the directory if it doesn't exist
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname); // Extract the file extension
    cb(null, `${Date.now()}-${file.fieldname}${ext}`); // Append the extension to the file name
  },
});

const upload = multer({ storage });


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
  attachmentPath: String,
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
      `<script>window.opener.postMessage('authenticated', 'https://mail-automation-frontend.onrender.com/');window.close();</script>`
    );
  } catch (error) {
    console.error('Error during token exchange:', error);
    res.status(500).send('Authentication failed');
  }
});

//This route is for sending mails

// Updated route handler for '/send-bulk-emails'
app.post('/send-bulk-emails', upload.fields([{ name: 'csvFile' }, { name: 'attachment' }]), async (req, res) => {
  if (!req.files['csvFile']) {
    return res.status(400).json({ error: 'CSV file is missing. Please upload a valid CSV file.' });
  }

  const attachmentPath = req.files['attachment'] ? req.files['attachment'][0].path : null;
  const throttleLimit = parseInt(req.body.throttleLimit, 10) || 10;
  const scheduleTime = new Date(req.body.scheduleTime) || new Date();
  const instructions = req.body.instructions || '';

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  let csvData = [];

  fs.createReadStream(req.files['csvFile'][0].path)
    .pipe(csv())
    .on('data', (data) => {
      csvData.push(data);
    })
    .on('end', async () => {
      try {
        for (const row of csvData) {
          const rowString = JSON.stringify(row);
          const prompt = `Generate a professional email in JSON format with 'CompanyName', 'to', 'subject', and 'body' fields filled in completely. You will find the email of company and other relevant details below. Dont create any email address by yourself : Details: ${rowString}, Instructions: ${instructions}`;

          const result = await model.generateContent(prompt);
          const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
          if (!jsonMatch) continue;

          const emailData = JSON.parse(jsonMatch[0]);
          const companyName = emailData.CompanyName;

          if (!emailData.to || !emailData.subject || !emailData.body) {
            await EmailQueue.create({
              ...emailData,
              from: userEmail,
              status: 'failed',
              userEmail,
              companyName,
              attachmentPath,
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
            attachmentPath,
          });
        }
        res.json({ success: true, message: 'Emails scheduled successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to schedule emails' });
      } finally {
        fs.unlink(req.files['csvFile'][0].path, () => {});
      }
    });
});

// Updated route handler for '/send-bulk-emails/user'
app.post('/send-bulk-emails/user', upload.fields([{ name: 'csvFile' }, { name: 'attachment' }]), async (req, res) => {
  if (!req.files['csvFile']) {
    return res.status(400).json({ error: 'CSV file is missing. Please upload a valid CSV file.' });
  }

  const attachmentPath = req.files['attachment'] ? req.files['attachment'][0].path : null;
  const throttleLimit = parseInt(req.body.throttleLimit, 10) || 10;

  // Parse and validate scheduleTime
  let scheduleTime = new Date(req.body.scheduleTime);
  if (isNaN(scheduleTime)) {
    scheduleTime = new Date(); // Default to current time if invalid
  }

  const body = req.body.body || '';
  const subject = req.body.subject || '';

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Retaining your LLM initialization
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  let csvData = [];

  fs.createReadStream(req.files['csvFile'][0].path)
    .pipe(csv())
    .on('data', (data) => {
      csvData.push(data);
    })
    .on('end', async () => {
      try {
        for (const row of csvData) {
          try {
            const rowString = JSON.stringify(row);
            const prompt = `Extract all the details and give it to me in JSON format with keys "to", "CompanyName" from here -> ${rowString}`;
            const result = await model.generateContent(prompt);
    
            const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              console.error(`No JSON match for row: ${rowString}`);
              continue;
            }
    
            let emailData;
            try {
              emailData = JSON.parse(jsonMatch[0]);
            } catch (err) {
              console.error(`Error parsing JSON for row: ${rowString}`, err);
              continue;
            }
    
            const companyName = emailData.CompanyName;
    
            if (!emailData.to) {
              console.error(`No recipient email for row: ${rowString}`);
              await EmailQueue.create({
                ...emailData,
                companyName,
                body,
                subject,
                from: userEmail,
                status: 'failed',
                userEmail,
                attachmentPath,
              });
              continue;
            }
    
            await EmailQueue.create({
              ...emailData,
              companyName,
              body,
              subject,
              from: userEmail,
              sendTime: scheduleTime || new Date(),
              throttleLimit,
              userEmail,
              attachmentPath,
            });
    
            console.log(`Scheduled email for: ${emailData.to}`);
          } catch (err) {
            console.error(`Error processing row: ${JSON.stringify(row)} -`, err);
          }
        }
    
        res.json({ success: true, message: 'Emails scheduled successfully' });
      } catch (error) {
        console.error('Error during CSV processing:', error);
        res.status(500).json({ error: 'Failed to schedule emails' });
      } finally {
        fs.unlink(req.files['csvFile'][0].path, () => {});
      }
    });
    
});





// Function to handle attachment logic
const handleAttachment = (attachmentPath) => {
  if (!attachmentPath) return null; // No attachment provided
  const filePath = path.resolve(attachmentPath);
  if (!fs.existsSync(filePath)) {
    console.error('Attachment file does not exist:', filePath);
    return null;
  }
  const fileContent = fs.readFileSync(filePath).toString('base64');
  const fileName = path.basename(filePath);
  const mimeType = mime.lookup(filePath) || 'application/octet-stream';

  return {
    content: fileContent,
    name: fileName,
    type: mimeType,
  };
};
// Function to send email
const sendEmail = async (email, oauth2Client) => {
  try {
    if (userTokens.expiry_date && userTokens.expiry_date <= Date.now()) {
      const newTokens = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(newTokens.credentials);
      userTokens = newTokens.credentials;
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Prepare the raw email
    let rawEmail = [
      `From: ${email.from}`,
      `To: ${email.to}`,
      `Subject: ${email.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="boundary123"`,
      ``,
      `--boundary123`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      `${email.body}`,
      ``,
    ];

    // Handle attachment
    const attachment = handleAttachment(email.attachmentPath);
    if (attachment) {
      rawEmail.push(
        `--boundary123`,
        `Content-Type: ${attachment.type}; name="${attachment.name}"`,
        `Content-Disposition: attachment; filename="${attachment.name}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        `${attachment.content}`
      );
    }

    // End the email with the boundary
    rawEmail.push(`--boundary123--`);

    // Encode the raw email to Base64URL
    const encodedMessage = Buffer.from(rawEmail.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send the email
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    email.status = 'sent';
    console.log(`Email sent to ${email.to}`);
  } catch (error) {
    console.error('Error sending email:', error.message || error);
    email.status = 'failed';
  } finally {
    await email.save();
  }
};

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
        await sendEmail(email, oauth2Client); // Call the sendEmail function
      } catch (error) {
        console.error('Error sending email:', error);
      }
    }
    
    // Delete the attachment file after sending all emails
    if (emailsToSend.length > 0 && emailsToSend[0].attachmentPath) {
      fs.unlink(emailsToSend[0].attachmentPath, (err) => {
        if (err) console.error('Error deleting attachment:', err);
        else console.log('Attachment deleted:', emailsToSend[0].attachmentPath);
      });
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

const PORT  = process.env.PORT
app.listen(PORT, () => {
  console.log('Server running on PORT');
});
