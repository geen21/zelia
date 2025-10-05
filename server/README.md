# Zelia Server

Backend API server for the Zelia application, built with Express.js and Supabase.

## Features

- **Authentication**: User registration, login, logout, password reset
- **User Management**: Profile management and user data
- **Activities**: CRUD operations for activities
- **Jobs**: Job listings management
- **Formations**: Training/course management
- **Questionnaires**: Questionnaire responses and management
- **Security**: Rate limiting, CORS, helmet security headers
- **Database**: Supabase integration for PostgreSQL

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Copy `.env.example` to `.env` and update the values:
```bash
cp .env.example .env
```

3. Update `.env` with your Supabase credentials:
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

4. Start the development server:
```bash
npm run dev
```

## API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - Register a new user
- `POST /login` - Login user
- `POST /logout` - Logout user
- `POST /refresh` - Refresh authentication token
- `POST /reset-password` - Reset password

### Users (`/api/users`)
- `GET /profile` - Get user profile (authenticated)
- `PUT /profile` - Update user profile (authenticated)
- `GET /me` - Get current user info (authenticated)

### Activities (`/api/activities`)
- `GET /` - Get all activities (with filtering)
- `GET /:id` - Get activity by ID
- `POST /` - Create activity (authenticated)
- `PUT /:id` - Update activity (authenticated)
- `DELETE /:id` - Delete activity (authenticated)

### Jobs (`/api/jobs`)
- `GET /` - Get all job listings (with filtering)
- `GET /:id` - Get job by ID
- `POST /` - Create job listing (authenticated)
- `PUT /:id` - Update job listing (authenticated)
- `DELETE /:id` - Delete job listing (authenticated)

### Formations (`/api/formations`)
- `GET /` - Get all formations (with filtering)
- `GET /:id` - Get formation by ID
- `POST /` - Create formation (authenticated)
- `PUT /:id` - Update formation (authenticated)
- `DELETE /:id` - Delete formation (authenticated)

### Questionnaires (`/api/questionnaires`)
- `GET /:id` - Get questionnaire by ID (authenticated)
- `POST /:id/responses` - Submit questionnaire response (authenticated)
- `GET /:id/responses` - Get user responses for questionnaire (authenticated)
- `GET /user/responses` - Get all user questionnaire responses (authenticated)

### Partage des résultats (`/api/share`)
- `POST /results` - Envoie le PDF des résultats d’un élève aux adresses e-mail fournies (authentifié)

## Database Schema

The server expects the following Supabase tables:

### profiles
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### activities
```sql
CREATE TABLE activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### jobs
```sql
CREATE TABLE jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  company TEXT,
  location TEXT,
  category TEXT,
  salary_range TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### formations
```sql
CREATE TABLE formations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  provider TEXT,
  category TEXT,
  level TEXT,
  duration TEXT,
  price DECIMAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### questionnaires
```sql
CREATE TABLE questionnaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### questionnaire_responses
```sql
CREATE TABLE questionnaire_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  questionnaire_id UUID REFERENCES questionnaires(id),
  user_id UUID REFERENCES auth.users(id),
  responses JSONB,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Development

- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server

## Environment Variables

- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (optional)
- `JWT_SECRET` - JWT secret for token verification
- `CLIENT_URL` - Frontend client URL for CORS
- `SMTP_HOST` - SMTP server hostname for outgoing e-mails
- `SMTP_PORT` - SMTP server port (465 recommandé pour Resend)
- `SMTP_USER` - SMTP username
- `SMTP_PASSWORD` - SMTP password
- `EMAIL_FROM` - Adresse e-mail d’expédition utilisée pour les partages (ex: `Zélia <orientation@zelia.io>`)

## Security Features

- Rate limiting (100 requests per 15 minutes per IP)
- CORS protection
- Helmet security headers
- Request size limits
- Input validation
- Authentication middleware
