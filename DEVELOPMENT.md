# Zelia V2 Development Guide

## Backend Setup Complete ✅

Your Express.js backend server has been successfully created with the following features:

### 🚀 Backend Features
- **Express.js Server** running on port 3001
- **Supabase Integration** for database and authentication
- **RESTful API** with comprehensive endpoints
- **Security Middleware** (CORS, Helmet, Rate Limiting)
- **Authentication System** with JWT tokens
- **Error Handling** and request validation

### 📁 Backend Structure
```
server/
├── config/
│   └── supabase.js          # Supabase client configuration
├── middleware/
│   └── auth.js              # Authentication middleware
├── routes/
│   ├── auth.js              # Authentication endpoints
│   ├── users.js             # User management
│   ├── activities.js        # Activities CRUD
│   ├── jobs.js              # Job listings CRUD
│   ├── formations.js        # Formations CRUD
│   └── questionnaires.js    # Questionnaire system
├── database/
│   └── setup.sql            # Database schema setup
├── server.js                # Main server file
├── package.json             # Dependencies and scripts
└── .env                     # Environment variables
```

### 🔗 API Endpoints Available

#### Authentication (`/api/auth`)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh tokens
- `POST /api/auth/reset-password` - Password reset

#### Users (`/api/users`)
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/me` - Current user info

#### Activities (`/api/activities`)
- `GET /api/activities` - List all activities
- `GET /api/activities/:id` - Get specific activity
- `POST /api/activities` - Create activity (auth required)
- `PUT /api/activities/:id` - Update activity (auth required)
- `DELETE /api/activities/:id` - Delete activity (auth required)

#### Jobs (`/api/jobs`)
- `GET /api/jobs` - List job postings
- `GET /api/jobs/:id` - Get specific job
- `POST /api/jobs` - Create job (auth required)
- `PUT /api/jobs/:id` - Update job (auth required)
- `DELETE /api/jobs/:id` - Delete job (auth required)

#### Formations (`/api/formations`)
- `GET /api/formations` - List formations
- `GET /api/formations/:id` - Get specific formation
- `POST /api/formations` - Create formation (auth required)
- `PUT /api/formations/:id` - Update formation (auth required)
- `DELETE /api/formations/:id` - Delete formation (auth required)

## 🔧 Next Steps

### 1. Database Setup (Required)
**Important**: You need to run the database setup script in your Supabase dashboard:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Open your project
3. Go to **SQL Editor**
4. Copy and paste the contents of `server/database/setup.sql`
5. Click **Run** to create all tables and policies

### 2. Frontend Integration
Your client already has the API utilities set up:
- `client/src/lib/api.js` - API client functions
- Updated `Login.jsx` to use the new backend
- Example `ActivitiesExample.jsx` component

### 3. Environment Variables
Make sure you have the correct `.env` files:

**Client** (`client/.env`):
```env
VITE_SUPABASE_URL=https://ofhklmyaioxznrqiolad.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9maGtsbXlhaW94em5ycWlvbGFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMTY4NjYsImV4cCI6MjA3MjU5Mjg2Nn0.idw8ArFNe8wgM2iELJkVLxjrW1yPDJ81tiqvXzo6JM8
VITE_API_URL=http://localhost:3001/api
```

**Server** (`server/.env`) - ✅ Already configured

### 4. Start Development
```bash
# Terminal 1 - Start backend
cd server
npm run dev

# Terminal 2 - Start frontend  
cd client
npm run dev
```

Or use VS Code tasks:
- Press `Ctrl+Shift+P`
- Type "Tasks: Run Task"
- Select "Start Both Client and Server"

## 📊 Testing the API

The server is currently running and accessible at:
- **API Base**: http://localhost:3001/api
- **Documentation**: http://localhost:3001/api
- **Health Check**: http://localhost:3001/health

### Test Authentication Flow
```javascript
// Example API usage from frontend
import { authAPI } from './lib/api'

// Register user
const userData = {
  email: 'test@example.com',
  password: 'password123',
  userData: { full_name: 'Test User' }
}
const result = await authAPI.register(userData)
```

## 🔒 Security Features
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS Protection**: Configured for localhost development
- **Input Validation**: Request body validation
- **Authentication**: JWT-based with Supabase
- **Row Level Security**: Database-level access control

## 🐛 Troubleshooting

### Common Issues
1. **Server won't start**: Check `.env` file exists in server folder
2. **Database errors**: Make sure you ran the SQL setup script
3. **CORS errors**: Verify `CLIENT_URL` in server `.env`
4. **Auth errors**: Check Supabase credentials

### Debug Mode
Set `NODE_ENV=development` in server `.env` for detailed error messages.

## 📝 Development Workflow

1. **Backend Changes**: Server restarts automatically with nodemon
2. **Frontend Changes**: Vite hot reload updates automatically  
3. **Database Changes**: Update `setup.sql` and re-run in Supabase
4. **API Testing**: Use the browser at http://localhost:3001/api

## 🚀 Production Deployment

When ready for production:
1. Set `NODE_ENV=production` in server environment
2. Update CORS origins for production domains
3. Use strong JWT secrets
4. Enable HTTPS
5. Set up proper hosting (Vercel, Railway, etc.)

Your backend is now fully functional and ready for development! 🎉
