# Zelia V2 - Full Stack Application

A modern full-stack application built with React (frontend) and Express.js (backend) using Supabase as the database and authentication provider.

## Project Structure

```
ZeliaV2/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── pages/         # React pages/components
│   │   ├── lib/           # Utility libraries (Supabase, API)
│   │   └── ...
│   ├── package.json
│   └── vite.config.js
├── server/                 # Express.js backend API
│   ├── config/            # Configuration files
│   ├── middleware/        # Express middleware
│   ├── routes/            # API route handlers
│   ├── database/          # Database setup scripts
│   ├── package.json
│   └── server.js
└── .vscode/               # VS Code configuration
    └── tasks.json
```

## Features

### Frontend (React + Vite)
- **Authentication**: User registration, login, logout
- **Activities Management**: Create, view, edit activities
- **Job Listings**: Browse and manage job postings
- **Formations**: Course and training management
- **Questionnaires**: Interactive questionnaire system
- **Profile Management**: User profile customization
- **3D Avatar System**: Three.js based avatar creation
- **Responsive Design**: Tailwind CSS styling

### Backend (Express.js + Supabase)
- **RESTful API**: Complete CRUD operations
- **Authentication Middleware**: JWT-based auth with Supabase
- **Rate Limiting**: Protection against abuse
- **CORS Configuration**: Secure cross-origin requests
- **Data Validation**: Input validation and sanitization
- **Error Handling**: Comprehensive error management
- **Security Headers**: Helmet.js security middleware

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account and project

### 1. Clone and Setup
```bash
git clone <your-repo-url>
cd ZeliaV2
```

### 2. Database Setup
1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Create a new project or use existing one
3. Go to SQL Editor
4. Run the SQL script from `server/database/setup.sql`

### 3. Environment Configuration

#### Client (.env in client folder):
```bash
cd client
# Create .env file with:
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:3001/api
```

#### Server (.env in server folder):
```bash
cd server
# Create .env file with:
PORT=3001
NODE_ENV=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secret
CLIENT_URL=http://localhost:5173
```

### 4. Install Dependencies
```bash
# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

### 5. Start Development Servers

#### Option 1: Start individually
```bash
# Terminal 1 - Start backend
cd server
npm run dev

# Terminal 2 - Start frontend
cd client
npm run dev
```

#### Option 2: Use VS Code tasks
- Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
- Type "Tasks: Run Task"
- Select "Start Both Client and Server"

### 6. Access the Application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001/api
- **Health Check**: http://localhost:3001/health

## API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/reset-password` - Password reset

### Resource Endpoints
- `GET /api/activities` - List activities
- `POST /api/activities` - Create activity (auth required)
- `GET /api/jobs` - List job postings
- `POST /api/jobs` - Create job (auth required)
- `GET /api/formations` - List formations
- `POST /api/formations` - Create formation (auth required)

For complete API documentation, visit http://localhost:3001/api when the server is running.

## Database Schema

The application uses the following main tables:
- `profiles` - User profile information
- `activities` - Activity/event listings
- `jobs` - Job postings
- `formations` - Training courses
- `questionnaires` - Questionnaire definitions
- `questionnaire_responses` - User responses

See `server/database/setup.sql` for complete schema.

## Development Commands

### Client
```bash
cd client
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

### Server
```bash
cd server
npm run dev          # Start development server with nodemon
npm start            # Start production server
```

## Supabase Configuration

Your Supabase project needs:

1. **Authentication enabled** (Email/Password)
2. **Database tables** created (run setup.sql)
3. **Row Level Security (RLS)** policies configured
4. **API keys** configured in environment files

### Required Supabase Policies
The setup script creates appropriate RLS policies for:
- Public read access to most content
- Authenticated write access
- User-specific data protection

## Security Features

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS Protection**: Configured for localhost development
- **Helmet Security**: Security headers for all responses
- **Input Validation**: Request body validation
- **Authentication**: JWT-based auth with Supabase
- **Row Level Security**: Database-level access control

## Production Deployment

### Environment Variables for Production
Update your `.env` files with production values:
- Database URLs
- API endpoints
- Security keys
- CORS origins

### Build Process
```bash
# Build client
cd client
npm run build

# Build output will be in client/dist
```

### Server Deployment
The server can be deployed to any Node.js hosting service:
- Heroku
- Vercel
- Railway
- DigitalOcean
- AWS EC2

## Troubleshooting

### Common Issues

1. **Server won't start**: Check environment variables
2. **Database connection failed**: Verify Supabase credentials
3. **CORS errors**: Check CLIENT_URL in server .env
4. **Authentication errors**: Verify Supabase auth configuration

### Development Tips

- Use browser dev tools for client-side debugging
- Check server console for API errors
- Monitor Supabase dashboard for database issues
- Use VS Code debugger for both client and server

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License - see the LICENSE file for details.
