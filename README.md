# Email Scheduler and Analytics App

This project is a full-stack application that allows users to schedule bulk emails with custom instructions, schedule times, and throttle limits. Users can also authenticate with Google and track analytics for sent emails. The frontend is built with React, while the backend uses Node.js, Express, and MongoDB.

## Table of Contents

1. [Features](#features)
2. [Setup Instructions](#setup-instructions)
3. [Environment Variables](#environment-variables)
4. [Available Scripts](#available-scripts)
5. [Frontend Code Details](#frontend-code-details)
6. [Backend API Endpoints](#backend-api-endpoints)
7. [Usage](#usage)

---

## Features

- **Google Authentication**: Allows users to securely authenticate via Google.
- **Bulk Email Scheduling**: Users can upload a CSV file to schedule bulk emails with specified instructions, time, and throttle limit.
- **Analytics Tracking**: View the status, recipient information, and scheduled time of emails.

---

## Setup Instructions

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd <repository-directory>

2. **Install dependencies for both frontend and backend**:
   #### For frontend
         cd frontend
         npm install
   #### For backend
      ```
      cd ../backend
      npm install
3. **Set up environment variables: Create a .env file in the backend directory and include these**:
   ```CLIENT_ID = 'Google Client ID'
   CLIENT_SECRET = 'Google Client Secret'
   REDIRECT_URI = 'Google App Redirect URI'
   GEMINI_API_KEY = "Google Gemini API key"
   MONGO_URI = 'Mongodb Connection string'

   Replace each value with the actual keys and URIs.

4. **Run the App**
#### For frontend
      cd frontend
      npm run dev

   #### For backend
      cd backend
      node server



## Frontend Code Details
1. **Authentication**: Users log in with Google via OAuth2.
2. **File Upload**: Users can upload CSV files containing email data for scheduling.
3. **Email Analytics**: The app polls the backend every 5 seconds to display analytics data, including email status and scheduling information.

### Libraries used:
1. **Axios**: For making HTTP requests to the backend.
2. **React State Management**: Manages user authentication state, file data, and email scheduling information.

## Backend API Endpoints
1. **/auth/google**
GET: Redirects to Google OAuth2 for authentication.

2. **/auth/google/callback**
GET: Handles the OAuth2 callback from Google and establishes user sessions.

3. **/analytics**
GET: Retrieves analytics data for scheduled emails.

4. **/send-bulk-emails**
POST: Accepts a CSV file, instructions, schedule time, and throttle limit to schedule bulk emails.

# Usage
1. **Authenticate**: Use the "Authenticate with Google" button to log in.
2. **Schedule Emails**: Upload a CSV file, add instructions, select a schedule time, and set a throttle limit. Submit to schedule emails.
3. The analytics table shows the email status, recipient information, and scheduled times.